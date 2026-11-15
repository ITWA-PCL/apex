/**
 * APEX (apex.windowasia.com) - Notification, First-Time Registration Invite & 2FA OTP Engine
 * Uses only built-in Node.js modules (crypto, net, tls, fetch) with ISO/IEC 27001:2022 Audit Logging.
 * Zero plaintext secrets stored in database or written to transaction_logs.
 */
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const db = require('../db/postgres');

function escapeHtml(val) {
  return String(val ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function sanitizeHeaderValue(val) {
  return String(val ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function maskEmail(email) {
  const clean = String(email || '').trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(5, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function buildInviteEmailContent({ name, username, registrationUrl, otp, appDomain, expiresAt }) {
  const safeName = escapeHtml(name || username);
  const safeUser = escapeHtml(username);
  const safeUrl = escapeHtml(registrationUrl);
  const safeOtp = escapeHtml(otp);
  const expiryText = new Date(expiresAt).toLocaleString('th-TH');

  const text = [
    `เรียนคุณ ${name || username},`,
    '',
    `บัญชีผู้ใช้งานระบบ APEX (${appDomain}) ของคุณถูกสร้างเรียบร้อยแล้ว`,
    `Username: ${username}`,
    `รหัสยืนยันตัวตนครั้งแรก (OTP 6 หลัก): ${otp}`,
    `ลิงก์สำหรับลงทะเบียนตั้งรหัสผ่านครั้งแรก (ใช้ได้ภายใน 24 ชั่วโมง ถึง ${expiryText}):`,
    registrationUrl,
    '',
    'กรุณาตั้งรหัสผ่าน 8-16 ตัวอักษร (ตัวพิมพ์ใหญ่, ตัวพิมพ์เล็ก, ตัวเลข และอักขระพิเศษ)',
    'หากไม่ได้ร้องขอบัญชีนี้ กรุณาติดต่อผู้ดูแลระบบ Window Asia ทันที'
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:10px">
      <h2 style="margin:0 0 12px;color:#0f172a">Window Asia APEX — ลงทะเบียนเข้าใช้งานครั้งแรก</h2>
      <p>เรียนคุณ <strong>${safeName}</strong>,</p>
      <p>บัญชีผู้ใช้งานระบบ APEX ของคุณพร้อมสำหรับการเปิดใช้งานครั้งแรกแล้ว:</p>
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;margin:14px 0">
        <div><strong>Username:</strong> <code>${safeUser}</code></div>
        <div style="margin-top:6px"><strong>รหัสยืนยันตัวตนครั้งแรก (OTP 6 หลัก):</strong> <code style="font-size:18px;font-weight:700;letter-spacing:2px">${safeOtp}</code></div>
        <div style="margin-top:6px;font-size:12px;color:#475569">หมดอายุ: ${escapeHtml(expiryText)}</div>
      </div>
      <p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">เปิดลิงก์ตั้งรหัสผ่านครั้งแรก →</a></p>
      <p style="font-size:12px;color:#64748b">หรือคัดลอกลิงก์นี้: <br><code>${safeUrl}</code></p>
    </div>
  `;

  return { subject: `[APEX] เชิญลงทะเบียนบัญชีผู้ใช้งานครั้งแรก (${username})`, text, html };
}

function sendSmtpMail({ host, port = 587, user, password, from, to, subject, text, html, tlsOptions = {} }) {
  return new Promise((resolve, reject) => {
    const cleanHost = String(host || '').trim();
    const numericPort = parseInt(port, 10) || 587;
    const cleanFrom = sanitizeHeaderValue(from || user || 'noreply@windowasia.com');
    const fromAddrMatch = cleanFrom.match(/<([^>]+)>/);
    const envelopeFrom = sanitizeHeaderValue(fromAddrMatch ? fromAddrMatch[1] : cleanFrom);
    const envelopeTo = sanitizeHeaderValue(to);

    if (!cleanHost || !envelopeTo) {
      return reject(new Error('Missing SMTP host or recipient address'));
    }

    const useDirectTls = numericPort === 465;
    let isTlsEncrypted = false;
    let socket = useDirectTls
      ? tls.connect({
          host: cleanHost,
          port: numericPort,
          servername: cleanHost,
          rejectUnauthorized: tlsOptions.rejectUnauthorized !== false
        })
      : net.createConnection({ host: cleanHost, port: numericPort });

    let settled = false;
    let buffer = '';
    const pendingLines = [];
    let activeResolveResponse = null;

    const timer = setTimeout(() => {
      finish(new Error('SMTP connection timeout'));
    }, 6000);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch (_) {}
      if (err) reject(err);
      else resolve(result);
    }

    function attachSocketListeners(sock) {
      sock.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (/^\d{3} /.test(line)) {
            const parsed = { code: parseInt(line.slice(0, 3), 10), line };
            if (activeResolveResponse) {
              const resolver = activeResolveResponse;
              activeResolveResponse = null;
              resolver(parsed);
            } else {
              pendingLines.push(parsed);
            }
          }
        }
      });
      sock.on('error', err => finish(err));
    }

    function waitForTlsHandshake(tlsSock) {
      return new Promise((res, rej) => {
        if (tlsSock.encrypted && !tlsSock.connecting && tlsSock.authorized !== false) {
          isTlsEncrypted = true;
          return res();
        }
        const onSecure = () => {
          tlsSock.removeListener('error', onErr);
          isTlsEncrypted = true;
          res();
        };
        const onErr = err => {
          tlsSock.removeListener('secureConnect', onSecure);
          rej(err);
        };
        tlsSock.once('secureConnect', onSecure);
        tlsSock.once('error', onErr);
      });
    }

    function readResponse() {
      if (pendingLines.length > 0) {
        return Promise.resolve(pendingLines.shift());
      }
      return new Promise(res => {
        activeResolveResponse = res;
      });
    }

    async function sendCmd(cmd, expectedCodes) {
      const p = readResponse();
      if (cmd !== null) {
        sockWrite(`${cmd}\r\n`);
      }
      const resp = await p;
      if (expectedCodes && !expectedCodes.includes(resp.code)) {
        throw new Error(`SMTP error (${resp.code}): ${resp.line}`);
      }
      return resp;
    }

    function sockWrite(data) {
      socket.write(data, 'utf8');
    }

    attachSocketListeners(socket);

    (async () => {
      if (useDirectTls) {
        await waitForTlsHandshake(socket);
      }

      await sendCmd(null, [220]);
      await sendCmd(`EHLO apex.windowasia.com`, [250]);

      if (!useDirectTls) {
        try {
          await sendCmd('STARTTLS', [220]);
        } catch (startTlsErr) {
          throw new Error(
            `SMTP TLS required: refusing to transmit credentials or OTP without TLS (${startTlsErr.message})`
          );
        }
        const plainSocket = socket;
        socket = tls.connect({
          socket: plainSocket,
          host: cleanHost,
          servername: cleanHost,
          rejectUnauthorized: tlsOptions.rejectUnauthorized !== false
        });
        buffer = '';
        pendingLines.length = 0;
        attachSocketListeners(socket);
        await waitForTlsHandshake(socket);
        await sendCmd(`EHLO apex.windowasia.com`, [250]);
      }

      if (!isTlsEncrypted || !socket.encrypted) {
        throw new Error(
          'SMTP TLS required: refusing to send credentials or sensitive content over unencrypted connection'
        );
      }

      if (user && password) {
        await sendCmd('AUTH LOGIN', [334]);
        await sendCmd(Buffer.from(String(user), 'utf8').toString('base64'), [334]);
        await sendCmd(Buffer.from(String(password), 'utf8').toString('base64'), [235]);
      }

      await sendCmd(`MAIL FROM:<${envelopeFrom}>`, [250]);
      await sendCmd(`RCPT TO:<${envelopeTo}>`, [250, 251]);
      await sendCmd('DATA', [354]);

      const boundary = `apex_${crypto.randomBytes(8).toString('hex')}`;
      const encodedSubject = `=?UTF-8?B?${Buffer.from(sanitizeHeaderValue(subject), 'utf8').toString('base64')}?=`;
      const bodyLines = [
        `From: ${cleanFrom}`,
        `To: ${envelopeTo}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(String(text || ''), 'utf8').toString('base64'),
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(String(html || text || ''), 'utf8').toString('base64'),
        `--${boundary}--`,
        '.'
      ];
      await sendCmd(bodyLines.join('\r\n'), [250]);
      await sendCmd('QUIT', [221, 250]).catch(() => {});
      finish(null, { accepted: [envelopeTo] });
    })().catch(err => finish(err));
  });
}

/**
 * Sends notification to Telegram Bot API when enabled & configured;
 * otherwise writes an ISO 27001 simulated audit entry cleanly.
 */
async function sendTelegramNotification({
  text,
  chatId = '',
  eventType = 'system_notification',
  actor = null,
  ipAddress = '127.0.0.1',
  targetResource = 'notification/telegram',
  forceTest = false
} = {}) {
  const s = await db.getSystemSettings();
  const targetChatId = String(chatId || s.telegram_chat_id || '').trim();
  const botToken = String(s.telegram_bot_token || '').trim();
  const enabled = s.telegram_enabled === 'true';

  if ((enabled || forceTest) && botToken && targetChatId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: String(text || ''),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await resp.json().catch(() => ({}));
      const ok = resp.ok && data.ok !== false;

      await db.insertAuditLog({
        eventCode: 'NOTIFY-TELEGRAM',
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        actorRole: actor?.role || null,
        ipAddress,
        targetResource,
        details: {
          event_type: eventType,
          chat_id: targetChatId,
          status: ok ? 'sent' : 'failed',
          http_status: resp.status,
          error: ok ? null : data.description || `HTTP ${resp.status}`
        }
      });

      return {
        ok,
        simulated: false,
        status: ok ? 'sent' : 'failed',
        message: ok
          ? 'ส่งข้อความแจ้งเตือนผ่าน Telegram Bot สำเร็จ'
          : `ส่ง Telegram ไม่สำเร็จ: ${data.description || `HTTP ${resp.status}`}`
      };
    } catch (err) {
      clearTimeout(timer);
      await db.insertAuditLog({
        eventCode: 'NOTIFY-TELEGRAM',
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        actorRole: actor?.role || null,
        ipAddress,
        targetResource,
        details: {
          event_type: eventType,
          chat_id: targetChatId,
          status: 'failed',
          error: err.message
        }
      });
      return {
        ok: false,
        simulated: false,
        status: 'failed',
        message: `เชื่อมต่อ Telegram API ไม่สำเร็จ: ${err.message}`
      };
    }
  }

  await db.insertAuditLog({
    eventCode: 'NOTIFY-TELEGRAM',
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || null,
    ipAddress,
    targetResource,
    details: {
      event_type: eventType,
      chat_id: targetChatId || null,
      status: 'simulated_audit',
      reason: !enabled && !forceTest ? 'telegram_disabled' : 'missing_bot_token_or_chat_id'
    }
  });

  return {
    ok: true,
    simulated: true,
    status: 'simulated_audit',
    message: 'บันทึกการแจ้งเตือน Telegram ลง Audit Log แล้ว (ยังไม่ได้เปิดใช้หรือยังไม่มี Bot Token/Chat ID จริง)'
  };
}

/**
 * Sends email notification via Email Webhook or native SMTP when enabled & configured;
 * otherwise writes an ISO 27001 simulated audit entry cleanly.
 */
async function sendEmailNotification({
  to,
  subject,
  text,
  html,
  eventType = 'system_email',
  actor = null,
  ipAddress = '127.0.0.1',
  targetResource = 'notification/email',
  forceTest = false
} = {}) {
  const s = await db.getSystemSettings();
  const recipient = sanitizeHeaderValue(to);
  const enabled = s.email_enabled === 'true';
  const webhookUrl = String(s.email_webhook_url || '').trim();
  const smtpHost = String(s.smtp_host || '').trim();
  const fromAddr = s.smtp_from || 'APEX Security <noreply@windowasia.com>';

  if ((enabled || forceTest) && recipient && (webhookUrl || smtpHost)) {
    try {
      if (webhookUrl) {
        if (!/^https:\/\//i.test(webhookUrl)) {
          throw new Error('Email webhook TLS required: email_webhook_url must use https://');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          redirect: 'manual',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: recipient, from: fromAddr, subject, text, html }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if ((resp.status >= 300 && resp.status < 400) || resp.type === 'opaqueredirect') {
          const location = resp.headers?.get ? resp.headers.get('location') : '';
          throw new Error(
            `Email webhook redirect forbidden (HTTP ${resp.status}${location ? ` -> ${location}` : ''}): refusing to redirect sensitive OTP payload`
          );
        }
        if (resp.redirected || (resp.url && !/^https:\/\//i.test(resp.url))) {
          throw new Error('Email webhook TLS required: redirected or non-HTTPS webhook target is forbidden');
        }
        if (!resp.ok) {
          throw new Error(`Email webhook HTTP ${resp.status}`);
        }
      } else {
        await sendSmtpMail({
          host: smtpHost,
          port: s.smtp_port || 587,
          user: s.smtp_user || '',
          password: s.smtp_password || '',
          from: fromAddr,
          to: recipient,
          subject,
          text,
          html
        });
      }

      await db.insertAuditLog({
        eventCode: 'NOTIFY-EMAIL',
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        actorRole: actor?.role || null,
        ipAddress,
        targetResource,
        details: {
          event_type: eventType,
          to_masked: maskEmail(recipient),
          transport: webhookUrl ? 'webhook' : 'smtp',
          status: 'sent'
        }
      });

      return {
        ok: true,
        simulated: false,
        status: 'sent',
        message: `ส่งอีเมลแจ้งเตือนไปยัง ${maskEmail(recipient)} สำเร็จ`
      };
    } catch (err) {
      await db.insertAuditLog({
        eventCode: 'NOTIFY-EMAIL',
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        actorRole: actor?.role || null,
        ipAddress,
        targetResource,
        details: {
          event_type: eventType,
          to_masked: maskEmail(recipient),
          transport: webhookUrl ? 'webhook' : 'smtp',
          status: 'failed',
          error: err.message
        }
      });
      return {
        ok: false,
        simulated: false,
        status: 'failed',
        message: `ส่งอีเมลไม่สำเร็จ: ${err.message}`
      };
    }
  }

  await db.insertAuditLog({
    eventCode: 'NOTIFY-EMAIL',
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || null,
    ipAddress,
    targetResource,
    details: {
      event_type: eventType,
      to_masked: maskEmail(recipient) || null,
      status: 'simulated_audit',
      reason: !recipient
        ? 'missing_recipient_email'
        : !enabled && !forceTest
          ? 'email_disabled'
          : 'missing_smtp_or_webhook'
    }
  });

  return {
    ok: true,
    simulated: true,
    status: 'simulated_audit',
    message: recipient
      ? `บันทึกการส่งอีเมลไปยัง ${maskEmail(recipient)} ลง Audit Log แล้ว (ยังไม่ได้ตั้งค่า SMTP/Webhook จริง)`
      : 'บันทึกคำเชิญลง Audit Log แล้ว (บัญชีนี้ยังไม่ได้ระบุอีเมล)'
  };
}

/**
 * Generates a 24h first-time registration invite token + 6-digit OTP for Non-AD Local users
 * (Internal Non-AD or External contractors/customers), stores hashed tokens in PostgreSQL,
 * dispatches Email & Telegram alerts, and writes USER-INVITE audit log.
 */
async function createRegistrationInvite(userDoc, actor = null, ipAddress = '127.0.0.1') {
  if (!userDoc || !userDoc.id) {
    throw new Error('User document is required for registration invite');
  }
  const s = await db.getSystemSettings();
  const appDomain = String(s.app_domain || 'https://apex.windowasia.com').replace(/\/+$/, '');
  const inviteToken = crypto.randomBytes(24).toString('hex');
  const inviteOtp = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const username = String(userDoc.username || userDoc.uid || userDoc.id).trim();
  const registrationUrl = `${appDomain}/?register_token=${encodeURIComponent(inviteToken)}&username=${encodeURIComponent(username)}`;

  await db.updateDoc(
    'users',
    userDoc.id,
    {
      invite_token_hash: db.hashPassword(inviteToken),
      invite_otp_hash: db.hashPassword(inviteOtp),
      invite_expires_at: expiresAt,
      registration_status: 'pending_invite',
      must_change_password: true
    },
    actor?.id || userDoc.id
  );

  const emailContent = buildInviteEmailContent({
    name: userDoc.name,
    username,
    registrationUrl,
    otp: inviteOtp,
    appDomain,
    expiresAt
  });

  const emailResult = await sendEmailNotification({
    to: userDoc.email || '',
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    eventType: 'first_time_registration_invite',
    actor,
    ipAddress,
    targetResource: `users/${userDoc.id}`
  });

  const hasPersonalTelegram = Boolean(String(userDoc.telegram_chat_id || '').trim());
  const tgText = [
    `<b>[APEX] สร้างคำเชิญลงทะเบียนเข้าใช้งานครั้งแรก</b>`,
    `• ผู้ใช้: <b>${escapeHtml(userDoc.name || username)}</b> (<code>${escapeHtml(username)}</code>)`,
    `• ประเภท: ${escapeHtml(userDoc.kind === 'external' ? 'External Local' : 'Internal Local')} (${escapeHtml(userDoc.role || '')})`,
    ...(hasPersonalTelegram ? [`• รหัส OTP 6 หลัก: <code>${escapeHtml(inviteOtp)}</code>`] : []),
    `• หมดอายุ: ${escapeHtml(new Date(expiresAt).toLocaleString('th-TH'))}`
  ].join('\n');

  const telegramResult = await sendTelegramNotification({
    text: tgText,
    chatId: userDoc.telegram_chat_id || '',
    eventType: 'first_time_registration_invite',
    actor,
    ipAddress,
    targetResource: `users/${userDoc.id}`
  });

  await db.insertAuditLog({
    eventCode: 'USER-INVITE',
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || null,
    ipAddress,
    targetResource: `users/${userDoc.id}`,
    details: {
      username,
      kind: userDoc.kind || 'internal',
      role: userDoc.role || null,
      email_status: emailResult.status,
      telegram_status: telegramResult.status,
      expires_at: expiresAt
    }
  });

  return {
    invite_token: inviteToken,
    invite_otp: inviteOtp,
    registration_url: registrationUrl,
    expires_at: expiresAt,
    email_result: emailResult,
    telegram_result: telegramResult
  };
}

/**
 * Generates a 5-minute 6-digit OTP challenge for 2FA login verification or self-service registration,
 * stores hashed OTP in PostgreSQL, notifies via Email & Telegram, and writes OTP-SEND audit log.
 */
async function createAndSendOtpChallenge(userDoc, purpose = 'login_2fa', ipAddress = '127.0.0.1') {
  if (!userDoc || !userDoc.id) {
    throw new Error('User document is required for OTP challenge');
  }
  const s = await db.getSystemSettings();
  const otpCode = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const username = String(userDoc.username || userDoc.uid || userDoc.id).trim();
  const masked = maskEmail(userDoc.email || '');

  await db.updateDoc(
    'users',
    userDoc.id,
    {
      otp_code_hash: db.hashPassword(otpCode),
      otp_expires_at: expiresAt,
      otp_attempts: 0,
      otp_purpose: purpose,
      ...(purpose === 'register'
        ? {
            otp_password_verified_at: null,
            otp_password_verified_until: null,
            otp_challenge_token_hash: null
          }
        : {})
    },
    userDoc.id
  );

  const purposeLabel =
    purpose === 'register'
      ? 'ยืนยันการลงทะเบียนบัญชีครั้งแรก'
      : 'ยืนยันตัวตนเข้าสู่ระบบ (2FA Login OTP)';

  await sendEmailNotification({
    to: userDoc.email || '',
    subject: `[APEX Security] รหัส OTP สำหรับ ${purposeLabel}`,
    text: `รหัส OTP 6 หลักของคุณ (${username}) คือ: ${otpCode}\nรหัสมีอายุ 5 นาที และห้ามเปิดเผยต่อผู้อื่น`,
    html: `<p>รหัส OTP 6 หลักสำหรับ <strong>${escapeHtml(purposeLabel)}</strong> (<code>${escapeHtml(username)}</code>) คือ:</p><h1 style="letter-spacing:4px">${escapeHtml(otpCode)}</h1><p>รหัสมีอายุ 5 นาที</p>`,
    eventType: `otp_${purpose}`,
    actor: userDoc,
    ipAddress,
    targetResource: `users/${userDoc.id}`
  });

  const hasPersonalTelegram = Boolean(String(userDoc.telegram_chat_id || '').trim());
  const tgText = [
    `<b>[APEX Security] คำขอรหัส OTP (${escapeHtml(purposeLabel)})</b>`,
    `• บัญชี: <code>${escapeHtml(username)}</code>`,
    ...(hasPersonalTelegram || s.telegram_enabled !== 'true'
      ? [`• รหัส OTP 6 หลัก: <code>${escapeHtml(otpCode)}</code> (ใช้ได้ภายใน 5 นาที)`]
      : ['• ระบบได้ส่งรหัส OTP ไปยังอีเมลที่ลงทะเบียนไว้แล้ว']),
    `• IP: <code>${escapeHtml(ipAddress)}</code>`
  ].join('\n');

  await sendTelegramNotification({
    text: tgText,
    chatId: userDoc.telegram_chat_id || '',
    eventType: `otp_${purpose}`,
    actor: userDoc,
    ipAddress,
    targetResource: `users/${userDoc.id}`
  });

  await db.insertAuditLog({
    eventCode: 'OTP-SEND',
    actorId: userDoc.id,
    actorEmail: userDoc.email || null,
    actorRole: userDoc.role || null,
    ipAddress,
    targetResource: `users/${userDoc.id}`,
    details: {
      purpose,
      username,
      masked_email: masked || null,
      expires_at: expiresAt
    }
  });

  return {
    otp_code: otpCode,
    expires_at: expiresAt,
    masked_email: masked
  };
}

module.exports = {
  maskEmail,
  sendSmtpMail,
  sendTelegramNotification,
  sendEmailNotification,
  createRegistrationInvite,
  createAndSendOtpChallenge
};
