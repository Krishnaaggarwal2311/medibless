const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Admin } = require('../models');
const { getJwtSecret } = require('../config/jwt');

function signAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, typ: 'admin' },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/** Public: admin panel login (admins collection only). */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    const admin = await Admin.findOne({
      email: String(email).trim().toLowerCase(),
      is_active: true
    }).lean();
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const token = signAdminToken(admin);
    const { password_hash: _ph, _id, __v, ...safe } = admin;
    const userShape = { id: safe.id, email: safe.email, name: safe.name, role: 'admin' };
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      admin: safe,
      user: userShape
    });
  } catch (err) {
    console.error('adminAuth.login', err);
    const msg =
      process.env.NODE_ENV === 'production'
        ? 'Server error.'
        : err.message || 'Server error.';
    res.status(500).json({ success: false, message: msg });
  }
};

exports.getMe = async (req, res) => {
  try {
    const admin = await Admin.findOne({ id: req.admin.id })
      .select('id email name phone created_at updated_at')
      .lean();
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });
    res.json({
      success: true,
      admin,
      user: { ...admin, role: 'admin' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const $set = {};
    if (name !== undefined) $set.name = String(name).trim() || req.admin.name;
    if (phone !== undefined) $set.phone = phone == null ? '' : String(phone).trim();
    if (Object.keys($set).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    await Admin.updateOne({ id: req.admin.id }, { $set });
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }
    const row = await Admin.findOne({ id: req.admin.id }).select('password_hash').lean();
    if (!row) return res.status(404).json({ success: false, message: 'Admin not found.' });
    const match = await bcrypt.compare(current_password, row.password_hash);
    if (!match) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    await Admin.updateOne({ id: req.admin.id }, { $set: { password_hash } });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
