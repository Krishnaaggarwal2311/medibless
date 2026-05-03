const jwt = require('jsonwebtoken');
const { Admin } = require('../models');
const { getJwtSecret } = require('../config/jwt');

/**
 * Validates Bearer JWT issued by admin login (`typ: 'admin'`).
 * Sets `req.admin` = { id, email, name }.
 */
const adminAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.typ !== 'admin' || !decoded.id) {
      return res.status(403).json({ success: false, message: 'Admin token required.' });
    }
    const admin = await Admin.findOne({ id: decoded.id, is_active: true }).lean();
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive admin.' });
    }
    req.admin = { id: admin.id, email: admin.email, name: admin.name };
    next();
  } catch (_err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = { adminAuthMiddleware };
