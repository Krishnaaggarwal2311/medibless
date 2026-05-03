// routes/doctors.js
const express = require('express');
const router = express.Router();
const { getDoctors, getDoctorById, getSpecializations, updateDoctorProfile } = require('../controllers/doctorController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.get('/', getDoctors);
router.get('/specializations', getSpecializations);
router.get('/:id', getDoctorById);
router.put('/profile', authMiddleware, roleMiddleware('doctor'), updateDoctorProfile);

module.exports = router;
