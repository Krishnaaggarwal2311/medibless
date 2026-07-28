const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middleware/adminAuth');
const {
  getDashboard,
  getUsers,
  setUserActive,
  deleteUser,
  getAppointments,
  adminCancelAppointment,
  getPendingDoctors,
  approveDoctor,
  getOrders,
  updateOrderStatus,
  getMedicines,
  getMedicineById,
  getMedicineCategories,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getAppSettings,
  updateAppSettings
} = require('../controllers/adminController');
const { updateAppointmentStatus } = require('../controllers/appointmentController');

router.use(adminAuthMiddleware);

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.patch('/users/:id/active', setUserActive);
router.delete('/users/:id', deleteUser);

router.get('/appointments', getAppointments);
router.put('/appointments/:id/status', updateAppointmentStatus);
router.put('/appointments/:id/cancel', adminCancelAppointment);

router.get('/doctors/pending', getPendingDoctors);
router.post('/doctors/:id/approve', approveDoctor);

router.get('/orders', getOrders);
router.patch('/orders/:id', updateOrderStatus);

router.get('/medicine-categories', getMedicineCategories);
router.get('/medicines', getMedicines);
router.get('/medicines/:id', getMedicineById);
router.post('/medicines', createMedicine);
router.patch('/medicines/:id', updateMedicine);
router.delete('/medicines/:id', deleteMedicine);

router.get('/app-settings', getAppSettings);
router.put('/app-settings', updateAppSettings);

module.exports = router;
