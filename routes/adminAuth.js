const express = require('express');
const router = express.Router();
const { login, getMe, updateProfile, changePassword } = require('../controllers/adminAuthController');
const { adminAuthMiddleware } = require('../middleware/adminAuth');

router.post('/login', login);
router.get('/me', adminAuthMiddleware, getMe);
router.put('/me', adminAuthMiddleware, updateProfile);
router.put('/change-password', adminAuthMiddleware, changePassword);

module.exports = router;
