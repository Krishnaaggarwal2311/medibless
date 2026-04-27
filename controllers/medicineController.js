const crypto = require('crypto');
const db = require('../config/db');

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

/** Cart rows for pricing / order (same as place order) */
async function fetchCartItemsForOrder(userId) {
  const [rows] = await db.execute(
    `SELECT c.*, m.price, m.discount_percent, m.name, m.stock_quantity
     FROM cart c JOIN medicines m ON c.medicine_id = m.id WHERE c.user_id = ?`,
    [userId]
  );
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
  const order_number = `MB${Date.now()}`;
  const estimated_delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [orderResult] = await db.execute(
    `INSERT INTO orders (user_id, order_number, total_amount, discount_amount, delivery_charge, final_amount,
        payment_method, payment_status, delivery_address, delivery_name, delivery_phone, estimated_delivery, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      order_number,
      m.total,
      m.discount,
      m.delivery_charge,
      m.final_amount,
      payment_method,
      payment_status,
      delivery_address,
      delivery_name,
      delivery_phone,
      estimated_delivery,
      notes
    ]
  );
  const orderId = orderResult.insertId;

  for (const item of cartItems) {
    const unit_price = (item.price - (item.price * item.discount_percent) / 100).toFixed(2);
    const item_total = (parseFloat(unit_price) * item.quantity).toFixed(2);
    await db.execute(
      'INSERT INTO order_items (order_id, medicine_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
      [orderId, item.medicine_id, item.quantity, unit_price, item_total]
    );
    await db.execute('UPDATE medicines SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.medicine_id]);
  }

  await db.execute('DELETE FROM cart WHERE user_id = ?', [userId]);
  await db.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [
    userId,
    'Order Placed!',
    `Your order #${order_number} has been placed. Estimated delivery: ${estimated_delivery}.`,
    'order'
  ]);
  return { order_id: orderId, order_number, final_amount: m.final_amount };
}

// Get medicines
exports.getMedicines = async (req, res) => {
  try {
    const { category_id, search, requires_prescription, page = 1, limit = 16, sort = 'name' } = req.query;
    let query = `
      SELECT m.*, mc.name as category_name,
             ROUND(m.price - (m.price * m.discount_percent / 100), 2) as discounted_price
      FROM medicines m LEFT JOIN medicine_categories mc ON m.category_id = mc.id
      WHERE m.is_active = TRUE
    `;
    const params = [];
    if (category_id) { query += ' AND m.category_id = ?'; params.push(category_id); }
    if (search) { query += ' AND (m.name LIKE ? OR m.brand LIKE ? OR m.composition LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (requires_prescription !== undefined) { query += ' AND m.requires_prescription = ?'; params.push(requires_prescription === 'true' ? 1 : 0); }

    const sortMap = { name: 'm.name ASC', price_low: 'discounted_price ASC', price_high: 'discounted_price DESC', discount: 'm.discount_percent DESC' };
    query += ` ORDER BY ${sortMap[sort] || 'm.name ASC'}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [medicines] = await db.execute(query, params);
    res.json({ success: true, medicines });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get medicine by id
exports.getMedicineById = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT m.*, mc.name as category_name,
             ROUND(m.price - (m.price * m.discount_percent / 100), 2) as discounted_price
      FROM medicines m LEFT JOIN medicine_categories mc ON m.category_id = mc.id
      WHERE m.id = ? AND m.is_active = TRUE`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Medicine not found.' });
    res.json({ success: true, medicine: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get categories
exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM medicine_categories WHERE is_active = TRUE');
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Cart operations
exports.getCart = async (req, res) => {
  try {
    const [items] = await db.execute(`
      SELECT c.id, c.quantity, c.prescription_url,
             m.id as medicine_id, m.name, m.brand, m.image_url, m.unit,
             m.requires_prescription,
             ROUND(m.price - (m.price * m.discount_percent / 100), 2) as unit_price,
             ROUND((m.price - (m.price * m.discount_percent / 100)) * c.quantity, 2) as total_price
      FROM cart c JOIN medicines m ON c.medicine_id = m.id
      WHERE c.user_id = ?`, [req.user.id]
    );
    const total = items.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
    res.json({ success: true, items, total: total.toFixed(2) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { medicine_id, quantity = 1 } = req.body;
    const [existing] = await db.execute('SELECT id, quantity FROM cart WHERE user_id=? AND medicine_id=?', [req.user.id, medicine_id]);
    if (existing.length > 0) {
      await db.execute('UPDATE cart SET quantity = quantity + ? WHERE id = ?', [quantity, existing[0].id]);
    } else {
      await db.execute('INSERT INTO cart (user_id, medicine_id, quantity) VALUES (?, ?, ?)', [req.user.id, medicine_id, quantity]);
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
    if (quantity <= 0) {
      await db.execute('DELETE FROM cart WHERE id = ? AND user_id = ?', [id, req.user.id]);
    } else {
      await db.execute('UPDATE cart SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, id, req.user.id]);
    }
    res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    await db.execute('DELETE FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Place order (COD / wallet only — online uses Razorpay create + verify)
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

// Create Razorpay order (server amount from cart)
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

// Verify signature and create paid order
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

// Get orders
exports.getMyOrders = async (req, res) => {
  try {
    const [orders] = await db.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]
    );
    for (const order of orders) {
      const [items] = await db.execute(`
        SELECT oi.*, m.name, m.brand, m.image_url, m.unit
        FROM order_items oi JOIN medicines m ON oi.medicine_id = m.id WHERE oi.order_id = ?`, [order.id]
      );
      order.items = items;
    }
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
