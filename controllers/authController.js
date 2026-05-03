const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, nextId } = require('../models');
const { getJwtSecret } = require('../config/jwt');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role = 'patient', date_of_birth, gender } = req.body;
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Invalid registration.' });
    }
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userId = await nextId('users');
    await User.create({
      id: userId,
      name,
      email,
      phone: phone || '',
      password_hash,
      role,
      date_of_birth: date_of_birth || null,
      gender: gender || null
    });
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

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, is_active: true }).lean();
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const token = generateToken(user);
    const { password_hash: _ph, _id, __v, ...userSafe } = user;
    res.json({ success: true, message: 'Login successful!', token, user: userSafe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id })
      .select('id name email phone role avatar date_of_birth gender address city state pincode created_at')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, date_of_birth, gender, address, city, state, pincode } = req.body;
    await User.updateOne(
      { id: req.user.id },
      { $set: { name, phone, date_of_birth, gender, address, city, state, pincode } }
    );
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
    const user = await User.findOne({ id: req.user.id }).select('password_hash').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    await User.updateOne({ id: req.user.id }, { $set: { password_hash } });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
