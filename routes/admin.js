const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
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
  updateMedicine,
  getAppSettings,
  updateAppSettings
} = require('../controllers/adminController');

router.use(authMiddleware, roleMiddleware('admin'));

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.patch('/users/:id/active', setUserActive);
router.delete('/users/:id', deleteUser);

router.get('/appointments', getAppointments);
router.put('/appointments/:id/cancel', adminCancelAppointment);

router.get('/doctors/pending', getPendingDoctors);
router.post('/doctors/:id/approve', approveDoctor);

router.get('/orders', getOrders);
router.patch('/orders/:id', updateOrderStatus);

router.get('/medicines', getMedicines);
router.patch('/medicines/:id', updateMedicine);

router.get('/app-settings', getAppSettings);
router.put('/app-settings', updateAppSettings);

module.exports = router;
