// routes/appointments.js
const express = require('express');
const router = express.Router();
const {
  bookAppointment, getMyAppointments, getDoctorAppointments,
  updateAppointmentStatus, cancelAppointment, getAvailableSlots
} = require('../controllers/appointmentController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.get('/slots', getAvailableSlots);
router.post('/', authMiddleware, roleMiddleware('patient'), bookAppointment);
router.get('/my', authMiddleware, getMyAppointments);
router.get('/doctor', authMiddleware, roleMiddleware('doctor'), getDoctorAppointments);
router.put('/:id/status', authMiddleware, roleMiddleware('doctor'), updateAppointmentStatus);
router.put('/:id/cancel', authMiddleware, cancelAppointment);

module.exports = router;
