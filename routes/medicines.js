// routes/medicines.js
const express = require('express');
const router = express.Router();
const {
  getMedicines, getMedicineById, getCategories,
  getCart, addToCart, updateCartItem, removeFromCart,
  placeOrder, getMyOrders,
  createRazorpayOrder, verifyRazorpayPayment
} = require('../controllers/medicineController');
const { authMiddleware } = require('../middleware/auth');

router.get('/categories', getCategories);
router.get('/', getMedicines);

// Cart & orders must be registered before /:id so "cart" and "orders" are not treated as :id
router.get('/cart/items', authMiddleware, getCart);
router.post('/cart', authMiddleware, addToCart);
router.put('/cart/:id', authMiddleware, updateCartItem);
router.delete('/cart/:id', authMiddleware, removeFromCart);

router.post('/orders', authMiddleware, placeOrder);
router.get('/orders/my', authMiddleware, getMyOrders);

router.post('/payment/razorpay/create-order', authMiddleware, createRazorpayOrder);
router.post('/payment/razorpay/verify', authMiddleware, verifyRazorpayPayment);

router.get('/:id', getMedicineById);

module.exports = router;
