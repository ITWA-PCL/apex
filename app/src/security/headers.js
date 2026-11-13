/**
 * APEX (apex.windowasia.com) - Track A: ISO/IEC 27001:2022 Security Headers & Rate Limiter
 */
/**
 * APEX (apex.windowasia.com) - Track A: ISO/IEC 27001:2022 Security Headers & Rate Limiter
 * Compliance: ISO 27001 A.9.4.2 & Central IAM Spoke Specification v2.12.0 (Category F)
 */
const rateBuckets = new Map();
const authRateRecords = new Map();

const CORPORATE_WHITELIST = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  '172.18.0.1',
  '157.173.219.153',
  '49.231.185.245',
  '58.8.190.63'
]);

function extractClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (xff) return xff;
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  const remote = req.socket?.remoteAddress || '';
  return remote.replace(/^::ffff:/, '') || '127.0.0.1';
}

function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(self)'
  );
  next();
}

function createRateLimiter({ windowMs = 60000, maxRequests = 300 } = {}) {
  return function rateLimiter(req, res, next) {
    const ip = extractClientIp(req);
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'คำขอเกินอัตราที่กำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง (ISO 27001 A.8.6)'
      });
    }
    next();
  };
}

/**
 * Enterprise Layer 1 Sliding-Window IP Rate Limiter (Spec v2.12.0 หมวด F.2)
 * Threshold: 10 requests / 60 seconds per Client IP on Auth endpoints
 */
function createAuthRateLimiter({ limit = 10, windowMs = 60000, onRateLimited } = {}) {
  return function authRateLimiter(req, res, next) {
    const ip = extractClientIp(req);
    const now = Date.now();

    if (CORPORATE_WHITELIST.has(ip)) {
      return next();
    }

    const timestamps = (authRateRecords.get(ip) || []).filter(t => t > now - windowMs);
    if (timestamps.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      authRateRecords.set(ip, timestamps);
      res.setHeader('Retry-After', String(retryAfter));

      if (typeof onRateLimited === 'function') {
        try {
          onRateLimited(req, ip, retryAfter);
        } catch (_) {}
      }

      return res.status(429).json({
        error: 'too_many_requests',
        code: 'IP_RATE_LIMITED',
        detail: `คำขอเข้าสู่ระบบถี่เกินกำหนด กรุณารอ ${retryAfter} วินาที แล้วลองใหม่อีกครั้ง`,
        retry_after: retryAfter
      });
    }

    timestamps.push(now);
    authRateRecords.set(ip, timestamps);
    next();
  };
}

module.exports = {
  CORPORATE_WHITELIST,
  extractClientIp,
  securityHeadersMiddleware,
  createRateLimiter,
  createAuthRateLimiter
};
