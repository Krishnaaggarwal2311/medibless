const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  Cart,
  Medicine,
  MedicineCategory,
  Order,
  OrderItem,
  Notification,
  nextId
} = require('../models');

let razorpayClient = null;
function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !String(keyId).trim() || !keySecret || !String(keySecret).trim()) {
    return null;
  }
  if (!razorpayClient) {
    const Razorpay = require('razorpay');
    razorpayClient = new Razorpay({ key_id: String(keyId).trim(), key_secret: String(keySecret).trim() });
  }
  return razorpayClient;
}

async function fetchCartItemsForOrder(userId) {
  const rows = await Cart.aggregate([
    { $match: { user_id: userId } },
    {
      $lookup: {
        from: 'medicines',
        localField: 'medicine_id',
        foreignField: 'id',
        as: 'm'
      }
    },
    { $unwind: '$m' },
    {
      $project: {
        _id: 0,
        id: 1,
        user_id: 1,
        medicine_id: 1,
        quantity: 1,
        prescription_url: 1,
        price: '$m.price',
        discount_percent: '$m.discount_percent',
        name: '$m.name',
        stock_quantity: '$m.stock_quantity'
      }
    }
  ]);
  return rows;
}

function computeOrderAmounts(cartItems) {
  let total = 0;
  let discount = 0;
  for (const item of cartItems) {
    const discounted = item.price - (item.price * item.discount_percent) / 100;
    const itemDiscount = (item.price - discounted) * item.quantity;
    total += item.price * item.quantity;
    discount += itemDiscount;
  }
  const delivery_charge = total > 500 ? 0 : 50;
  const final_amount = (total - discount + delivery_charge).toFixed(2);
  const amountPaise = Math.round(parseFloat(final_amount) * 100);
  return {
    total: total.toFixed(2),
    discount: discount.toFixed(2),
    delivery_charge,
    final_amount,
    amountPaise
  };
}

async function commitOrderFromCart(
  userId,
  cartItems,
  m,
  { delivery_address, delivery_name, delivery_phone, payment_method, payment_status, notes = null }
) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order_number = `MB${Date.now()}`;
    const estimated_delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const orderId = await nextId('orders', session);
    await Order.create(
      [
        {
          id: orderId,
          user_id: userId,
          order_number,
          total_amount: parseFloat(m.total),
          discount_amount: parseFloat(m.discount),
          delivery_charge: m.delivery_charge,
          final_amount: parseFloat(m.final_amount),
          payment_method,
          payment_status,
          delivery_address,
          delivery_name,
          delivery_phone,
          estimated_delivery,
          notes
        }
      ],
      { session }
    );

    for (const item of cartItems) {
      const unit_price = (item.price - (item.price * item.discount_percent) / 100).toFixed(2);
      const item_total = (parseFloat(unit_price) * item.quantity).toFixed(2);
      const oiId = await nextId('order_items', session);
      await OrderItem.create(
        [
          {
            id: oiId,
            order_id: orderId,
            medicine_id: item.medicine_id,
            quantity: item.quantity,
            unit_price: parseFloat(unit_price),
            total_price: parseFloat(item_total)
          }
        ],
        { session }
      );
      await Medicine.updateOne(
        { id: item.medicine_id },
        { $inc: { stock_quantity: -item.quantity } },
        { session }
      );
    }

    await Cart.deleteMany({ user_id: userId }, { session });
    const nid = await nextId('notifications', session);
    await Notification.create(
      [
        {
          id: nid,
          user_id: userId,
          title: 'Order Placed!',
          message: `Your order #${order_number} has been placed. Estimated delivery: ${estimated_delivery}.`,
          type: 'order'
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { order_id: orderId, order_number, final_amount: m.final_amount };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

exports.getMedicines = async (req, res) => {
  try {
    const { category_id, search, requires_prescription, page = 1, limit = 16, sort = 'name' } = req.query;
    const match = { is_active: true };
    if (category_id) match.category_id = parseInt(category_id, 10);
    if (requires_prescription !== undefined) {
      match.requires_prescription = requires_prescription === 'true';
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ name: rx }, { brand: rx }, { composition: rx }];
    }

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          discounted_price: {
            $round: [{ $subtract: ['$price', { $multiply: ['$price', { $divide: ['$discount_percent', 100] }] }] }, 2]
          }
        }
      },
      {
        $lookup: {
          from: 'medicine_categories',
          localField: 'category_id',
          foreignField: 'id',
          as: 'mc'
        }
      },
      {
        $addFields: {
          category_name: { $ifNull: [{ $arrayElemAt: ['$mc.name', 0] }, ''] }
        }
      },
      { $project: { mc: 0 } }
    ];

    const sortMap = {
      name: { name: 1 },
      price_low: { discounted_price: 1 },
      price_high: { discounted_price: -1 },
      discount: { discount_percent: -1 }
    };
    pipeline.push({ $sort: sortMap[sort] || { name: 1 } });
    pipeline.push({ $skip: (parseInt(page, 10) - 1) * parseInt(limit, 10) });
    pipeline.push({ $limit: parseInt(limit, 10) });

    const raw = await Medicine.aggregate(pipeline);
    const medicines = raw.map(({ _id, __v, ...rest }) => rest);
    res.json({ success: true, medicines });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getMedicineById = async (req, res) => {
  try {
    const rows = await Medicine.aggregate([
      { $match: { id: parseInt(req.params.id, 10), is_active: true } },
      {
        $addFields: {
          discounted_price: {
            $round: [{ $subtract: ['$price', { $multiply: ['$price', { $divide: ['$discount_percent', 100] }] }] }, 2]
          }
        }
      },
      {
        $lookup: {
          from: 'medicine_categories',
          localField: 'category_id',
          foreignField: 'id',
          as: 'mc'
        }
      },
      { $addFields: { category_name: { $ifNull: [{ $arrayElemAt: ['$mc.name', 0] }, ''] } } },
      { $project: { mc: 0 } }
    ]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Medicine not found.' });
    const { _id, __v, ...med } = rows[0];
    res.json({ success: true, medicine: med });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const rows = await MedicineCategory.find({ is_active: true }).lean();
    const categories = rows.map(({ _id, __v, ...r }) => r);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getCart = async (req, res) => {
  try {
    const items = await Cart.aggregate([
      { $match: { user_id: req.user.id } },
      {
        $lookup: {
          from: 'medicines',
          localField: 'medicine_id',
          foreignField: 'id',
          as: 'm'
        }
      },
      { $unwind: '$m' },
      {
        $project: {
          _id: 0,
          id: 1,
          quantity: 1,
          prescription_url: 1,
          medicine_id: '$m.id',
          name: '$m.name',
          brand: '$m.brand',
          image_url: '$m.image_url',
          unit: '$m.unit',
          requires_prescription: '$m.requires_prescription',
          unit_price: {
            $round: [
              { $subtract: ['$m.price', { $multiply: ['$m.price', { $divide: ['$m.discount_percent', 100] }] }] },
              2
            ]
          },
          total_price: {
            $round: [
              {
                $multiply: [
                  {
                    $subtract: [
                      '$m.price',
                      { $multiply: ['$m.price', { $divide: ['$m.discount_percent', 100] }] }
                    ]
                  },
                  '$quantity'
                ]
              },
              2
            ]
          }
        }
      }
    ]);
    const total = items.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
    res.json({ success: true, items, total: total.toFixed(2) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { medicine_id, quantity = 1 } = req.body;
    const mid = parseInt(medicine_id, 10);
    const existing = await Cart.findOne({ user_id: req.user.id, medicine_id: mid }).lean();
    if (existing) {
      await Cart.updateOne({ id: existing.id }, { $inc: { quantity: parseInt(quantity, 10) || 1 } });
    } else {
      const cid = await nextId('cart');
      await Cart.create({
        id: cid,
        user_id: req.user.id,
        medicine_id: mid,
        quantity: parseInt(quantity, 10) || 1
      });
    }
    res.json({ success: true, message: 'Added to cart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const q = parseInt(quantity, 10);
    if (q <= 0) {
      await Cart.deleteOne({ id: parseInt(id, 10), user_id: req.user.id });
    } else {
      await Cart.updateOne({ id: parseInt(id, 10), user_id: req.user.id }, { $set: { quantity: q } });
    }
    res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    await Cart.deleteOne({ id: parseInt(req.params.id, 10), user_id: req.user.id });
    res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const { delivery_address, delivery_name, delivery_phone, payment_method = 'cod' } = req.body;
    if (payment_method === 'online') {
      return res.status(400).json({
        success: false,
        message: 'For online payment, use Pay online — checkout will open. Direct online orders are not allowed.'
      });
    }
    if (!['cod', 'wallet'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method.' });
    }
    if (!delivery_address || !String(delivery_address).trim() || !delivery_name || !delivery_phone) {
      return res.status(400).json({ success: false, message: 'Delivery details are required.' });
    }

    const cartItems = await fetchCartItemsForOrder(req.user.id);
    if (cartItems.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty.' });
    for (const item of cartItems) {
      if (item.quantity > item.stock_quantity) {
        return res.status(400).json({ success: false, message: `Not enough stock for ${item.name}.` });
      }
    }
    const m = computeOrderAmounts(cartItems);
    const out = await commitOrderFromCart(req.user.id, cartItems, m, {
      delivery_address: String(delivery_address).trim(),
      delivery_name: String(delivery_name).trim(),
      delivery_phone: String(delivery_phone).trim(),
      payment_method,
      payment_status: 'pending',
      notes: null
    });
    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order_id: out.order_id,
      order_number: out.order_number,
      final_amount: out.final_amount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const rzp = getRazorpay();
    if (!rzp) {
      return res.status(503).json({
        success: false,
        message: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.'
      });
    }
    const userId = req.user.id;
    const cartItems = await fetchCartItemsForOrder(userId);
    if (cartItems.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty.' });
    for (const item of cartItems) {
      if (item.quantity > item.stock_quantity) {
        return res.status(400).json({ success: false, message: `Not enough stock for ${item.name}.` });
      }
    }
    const m = computeOrderAmounts(cartItems);
    if (m.amountPaise < 100) {
      return res.status(400).json({ success: false, message: 'Order total must be at least ₹1.00' });
    }
    const receipt = `mbu${userId}t${Date.now()}`.replace(/\s/g, '').slice(0, 40);
    const order = await rzp.orders.create({
      amount: m.amountPaise,
      currency: 'INR',
      receipt,
      notes: { user_id: String(userId) }
    });
    res.json({
      success: true,
      keyId: String(process.env.RAZORPAY_KEY_ID).trim(),
      order_id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (err) {
    console.error(err);
    const msg = err.error?.description || err.message || 'Could not start payment.';
    res.status(500).json({ success: false, message: msg });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const rzp = getRazorpay();
    if (!rzp) {
      return res.status(503).json({ success: false, message: 'Razorpay is not configured.' });
    }
    const keySecret = String(process.env.RAZORPAY_KEY_SECRET).trim();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      delivery_address,
      delivery_name,
      delivery_phone
    } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment response.' });
    }
    if (!delivery_address || !delivery_name || !delivery_phone) {
      return res.status(400).json({ success: false, message: 'Delivery details are required.' });
    }
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }
    const payment = await rzp.payments.fetch(razorpay_payment_id);
    if (payment.order_id && payment.order_id !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order mismatch.' });
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({ success: false, message: 'Payment was not successful.' });
    }
    const userId = req.user.id;
    const cartItems = await fetchCartItemsForOrder(userId);
    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty. If money was debited, contact support with your payment ID.'
      });
    }
    for (const item of cartItems) {
      if (item.quantity > item.stock_quantity) {
        return res.status(400).json({ success: false, message: `Not enough stock for ${item.name}.` });
      }
    }
    const m = computeOrderAmounts(cartItems);
    if (Number(payment.amount) !== m.amountPaise) {
      return res.status(400).json({ success: false, message: 'Amount mismatch. Refresh your cart and try again.' });
    }
    const notes = JSON.stringify({
      razorpay_order_id,
      razorpay_payment_id,
      provider: 'razorpay'
    });
    const out = await commitOrderFromCart(userId, cartItems, m, {
      delivery_address: String(delivery_address).trim(),
      delivery_name: String(delivery_name).trim(),
      delivery_phone: String(delivery_phone).trim(),
      payment_method: 'online',
      payment_status: 'paid',
      notes
    });
    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order_id: out.order_id,
      order_number: out.order_number,
      final_amount: out.final_amount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
    const out = [];
    for (const order of orders) {
      const { _id, __v, ...o } = order;
      const items = await OrderItem.aggregate([
        { $match: { order_id: order.id } },
        {
          $lookup: {
            from: 'medicines',
            localField: 'medicine_id',
            foreignField: 'id',
            as: 'm'
          }
        },
        { $unwind: '$m' },
        {
          $project: {
            _id: 0,
            id: 1,
            order_id: 1,
            medicine_id: 1,
            quantity: 1,
            unit_price: 1,
            total_price: 1,
            name: '$m.name',
            brand: '$m.brand',
            image_url: '$m.image_url',
            unit: '$m.unit'
          }
        }
      ]);
      o.items = items;
      out.push(o);
    }
    res.json({ success: true, orders: out });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
