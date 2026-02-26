const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  if (!token) return null;

  return token.trim();
}

function getUserIdFromJwt(token) {
  const payload = jwt.verify(token, JWT_SECRET);

  // Common patterns: { userId }, { id }, { sub }
  const id = payload?.userId ?? payload?.id ?? payload?.sub ?? null;
  if (!id) return null;

  return String(id);
}

function authRequired(req, res, next) {
  // Session-based auth (if your app already uses sessions)
  const sessionUserId = req.session && (req.session.userId || req.session.uid);
  if (sessionUserId) {
    req.userId = String(sessionUserId);
    return next();
  }

  // JWT-based auth
  const token = extractBearerToken(req);
  if (token) {
    try {
      const userId = getUserIdFromJwt(token);
      if (!userId) {
        return res.status(401).json({ message: 'Invalid token.' });
      }
      req.userId = userId;
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
  }

  return res.status(401).json({ message: 'Not logged in.' });
}

module.exports = {
  authRequired
};

