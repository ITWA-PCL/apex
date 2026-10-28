/**
 * APEX (apex.windowasia.com) - Track A: ISO/IEC 27001:2022 Security Headers & Rate Limiter
 */
const rateBuckets = new Map();

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
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown';
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

module.exports = {
  securityHeadersMiddleware,
  createRateLimiter
};
