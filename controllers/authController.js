const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { getJwtSecret } = require('../config/jwt');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role = 'patient', date_of_birth, gender } = req.body;
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Invalid registration.' });
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, phone, password_hash, role, date_of_birth, gender) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, phone, password_hash, role, date_of_birth || null, gender || null]
    );
    const userId = result.insertId;
    const token = generateToken({ id: userId, email, role });
    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { id: userId, name, email, phone, role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const token = generateToken(user);
    const { password_hash, ...userSafe } = user;
    res.json({ success: true, message: 'Login successful!', token, user: userSafe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get Profile
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, email, phone, role, avatar, date_of_birth, gender, address, city, state, pincode, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, date_of_birth, gender, address, city, state, pincode } = req.body;
    await db.execute(
      'UPDATE users SET name=?, phone=?, date_of_birth=?, gender=?, address=?, city=?, state=?, pincode=? WHERE id=?',
      [name, phone, date_of_birth, gender, address, city, state, pincode, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }
    const [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
