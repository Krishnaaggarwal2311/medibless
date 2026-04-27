const db = require('../config/db');

// Dashboard summary
exports.getDashboard = async (req, res) => {
  try {
    const [roleCounts] = await db.execute(
      "SELECT role, COUNT(*) as count FROM users GROUP BY role"
    );
    const [todayAppts] = await db.execute(
      "SELECT COUNT(*) as c FROM appointments WHERE appointment_date = CURDATE()"
    );
    const [pendingDoctors] = await db.execute(
      'SELECT COUNT(*) as c FROM doctor_profiles WHERE profile_approved = FALSE'
    );
    const [orderStats] = await db.execute(
      `SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status IN ('placed','confirmed','processing') THEN 1 ELSE 0 END) as active_orders
       FROM orders`
    );
    const [revenue] = await db.execute(
      'SELECT COALESCE(SUM(final_amount), 0) as total_revenue FROM orders'
    );
    res.json({
      success: true,
      dashboard: {
        usersByRole: roleCounts,
        appointmentsToday: todayAppts[0]?.c || 0,
        pendingDoctorApprovals: pendingDoctors[0]?.c || 0,
        totalOrders: orderStats[0]?.total_orders || 0,
        activeOrders: orderStats[0]?.active_orders || 0,
        totalRevenue: parseFloat(revenue[0]?.total_revenue || 0)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// List users
exports.getUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20, status } = req.query;
    let q = `SELECT id, name, email, phone, role, is_active, is_verified, created_at
             FROM users WHERE 1=1`;
    const params = [];
    if (status === 'active') {
      q += ' AND is_active = TRUE';
    } else if (status === 'blocked' || status === 'inactive') {
      q += ' AND is_active = FALSE';
    }
    if (role) {
      q += ' AND role = ?';
      params.push(role);
    }
    if (search) {
      q += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    q += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    q += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [rows] = await db.execute(q, params);
    let countQ = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const cParams = [];
    if (status === 'active') {
      countQ += ' AND is_active = TRUE';
    } else if (status === 'blocked' || status === 'inactive') {
      countQ += ' AND is_active = FALSE';
    }
    if (role) {
      countQ += ' AND role = ?';
      cParams.push(role);
    }
    if (search) {
      countQ += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const s = `%${search}%`;
      cParams.push(s, s, s);
    }
    const [countRows] = await db.execute(countQ, cParams);
    let statSql = `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = TRUE OR is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN is_active = FALSE OR is_active = 0 THEN 1 ELSE 0 END) AS blocked
      FROM users WHERE 1=1`;
    const statParams = [];
    if (role) {
      statSql += ' AND role = ?';
      statParams.push(role);
    }
    const [[statRow]] = await db.execute(statSql, statParams);
    res.json({
      success: true,
      users: rows,
      total: countRows[0]?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      stats: {
        total: Number(statRow?.total) || 0,
        active: Number(statRow?.active) || 0,
        blocked: Number(statRow?.blocked) || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Remove user (only if no blocking references)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = parseInt(id, 10);
    if (uid === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    const [uRows] = await db.execute('SELECT id, role FROM users WHERE id = ?', [uid]);
    if (uRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const [[apRows], [ordRows], [revRows]] = await Promise.all([
      db.execute('SELECT COUNT(*) as c FROM appointments WHERE patient_id = ?', [uid]),
      db.execute('SELECT COUNT(*) as c FROM orders WHERE user_id = ?', [uid]),
      db.execute('SELECT COUNT(*) as c FROM reviews WHERE patient_id = ?', [uid])
    ]);
    const apC = apRows[0]?.c || 0;
    const ordC = ordRows[0]?.c || 0;
    const revC = revRows[0]?.c || 0;
    if (apC > 0 || ordC > 0 || revC > 0) {
      return res.status(409).json({
        success: false,
        message: 'This user has appointments, orders, or reviews. Block the account instead of deleting.'
      });
    }
    const [dProf] = await db.execute('SELECT id FROM doctor_profiles WHERE user_id = ?', [uid]);
    if (dProf.length > 0) {
      const docId = dProf[0].id;
      const [aDoc] = await db.execute('SELECT COUNT(*) as c FROM appointments WHERE doctor_id = ?', [docId]);
      if ((aDoc[0]?.c || 0) > 0) {
        return res.status(409).json({
          success: false,
          message: 'This doctor has appointments. Block the account or remove linked data first.'
        });
      }
    }
    await db.execute('DELETE FROM users WHERE id = ?', [uid]);
    res.json({ success: true, message: 'User removed.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED' || err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      return res.status(409).json({
        success: false,
        message: 'Cannot remove this user: related records still exist. Block the account instead.'
      });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Toggle user active
exports.setUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot disable your own account.' });
    }
    await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    res.json({ success: true, message: 'User updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// All appointments
exports.getAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let q = `
      SELECT a.*,
        pu.name as patient_name, pu.email as patient_email, pu.phone as patient_phone,
        du.name as doctor_name, du.email as doctor_email,
        dp.specialization, dp.hospital_name, dp.id as doctor_profile_id
      FROM appointments a
      JOIN users pu ON a.patient_id = pu.id
      JOIN doctor_profiles dp ON a.doctor_id = dp.id
      JOIN users du ON dp.user_id = du.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      q += ' AND a.status = ?';
      params.push(status);
    }
    q += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    q += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [rows] = await db.execute(q, params);
    let cq = `
      SELECT COUNT(*) as total FROM appointments a WHERE 1=1
    `;
    const cp = [];
    if (status) {
      cq += ' AND a.status = ?';
      cp.push(status);
    }
    const [crows] = await db.execute(cq, cp);
    res.json({
      success: true,
      appointments: rows,
      total: crows[0]?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Admin cancel appointment
exports.adminCancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(
      'UPDATE appointments SET status = "cancelled" WHERE id = ? AND status IN ("pending","confirmed")',
      [id]
    );
    res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Pending doctor profiles
exports.getPendingDoctors = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT dp.id, dp.user_id, dp.specialization, dp.qualification, dp.experience_years,
        dp.registration_number, dp.hospital_name, dp.bio, dp.profile_approved,
        u.name, u.email, u.phone, u.city, u.created_at
      FROM doctor_profiles dp
      JOIN users u ON dp.user_id = u.id
      WHERE dp.profile_approved = FALSE
      ORDER BY u.created_at ASC
    `);
    res.json({ success: true, doctors: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Approve doctor
exports.approveDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE doctor_profiles SET profile_approved = TRUE WHERE id = ?', [id]);
    res.json({ success: true, message: 'Doctor profile approved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// All orders
exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let q = `
      SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      q += ' AND o.status = ?';
      params.push(status);
    }
    q += ' ORDER BY o.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    q += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [orders] = await db.execute(q, params);
    for (const order of orders) {
      const [items] = await db.execute(
        `SELECT oi.*, m.name, m.brand, m.image_url, m.unit
         FROM order_items oi JOIN medicines m ON oi.medicine_id = m.id WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }
    let cq = 'SELECT COUNT(*) as total FROM orders o WHERE 1=1';
    const cp = [];
    if (status) {
      cq += ' AND o.status = ?';
      cp.push(status);
    }
    const [crows] = await db.execute(cq, cp);
    res.json({
      success: true,
      orders,
      total: crows[0]?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status, tracking_number, notes } = req.body;
    const fields = [];
    const values = [];
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }
    if (payment_status !== undefined) {
      fields.push('payment_status = ?');
      values.push(payment_status);
    }
    if (tracking_number !== undefined) {
      fields.push('tracking_number = ?');
      values.push(tracking_number);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      values.push(notes);
    }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    values.push(id);
    await db.execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, values);
    if (status === 'delivered') {
      await db.execute('UPDATE orders SET delivered_at = NOW() WHERE id = ?', [id]);
    }
    res.json({ success: true, message: 'Order updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// List medicines (including inactive) for admin
exports.getMedicines = async (req, res) => {
  try {
    const { search, page = 1, limit = 24 } = req.query;
    let q = `
      SELECT m.*, mc.name as category_name,
        ROUND(m.price - (m.price * m.discount_percent / 100), 2) as discounted_price
      FROM medicines m
      LEFT JOIN medicine_categories mc ON m.category_id = mc.id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      q += ' AND (m.name LIKE ? OR m.brand LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }
    q += ' ORDER BY m.name ASC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    q += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [rows] = await db.execute(q, params);
    res.json({ success: true, medicines: rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Patch medicine (stock, active)
exports.updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_quantity, is_active, price, discount_percent } = req.body;
    const parts = [];
    const vals = [];
    if (stock_quantity !== undefined) {
      parts.push('stock_quantity = ?');
      vals.push(stock_quantity);
    }
    if (is_active !== undefined) {
      parts.push('is_active = ?');
      vals.push(is_active ? 1 : 0);
    }
    if (price !== undefined) {
      parts.push('price = ?');
      vals.push(price);
    }
    if (discount_percent !== undefined) {
      parts.push('discount_percent = ?');
      vals.push(discount_percent);
    }
    if (parts.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    vals.push(id);
    await db.execute(`UPDATE medicines SET ${parts.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true, message: 'Medicine updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const DEFAULT_APP_SETTINGS = {
  id: 1,
  app_name: 'MedBless',
  support_email: '',
  support_phone: '',
  website_url: '',
  about_text: '',
  terms_text: '',
  privacy_text: '',
  updated_at: null
};

exports.getAppSettings = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, app_name, support_email, support_phone, website_url, about_text, terms_text, privacy_text, updated_at FROM app_settings WHERE id = 1'
    );
    if (rows.length === 0) {
      return res.json({ success: true, settings: { ...DEFAULT_APP_SETTINGS } });
    }
    return res.json({ success: true, settings: rows[0] });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, settings: { ...DEFAULT_APP_SETTINGS } });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateAppSettings = async (req, res) => {
  try {
    const { app_name, support_email, support_phone, website_url, about_text, terms_text, privacy_text } = req.body;
    const t = (v) => (v == null ? '' : String(v));
    const payload = {
      app_name: t(app_name).trim() || 'MedBless',
      support_email: t(support_email).trim().slice(0, 200),
      support_phone: t(support_phone).trim().slice(0, 50),
      website_url: t(website_url).trim().slice(0, 500),
      about_text: t(about_text),
      terms_text: t(terms_text),
      privacy_text: t(privacy_text)
    };
    const vals = [
      payload.app_name,
      payload.support_email,
      payload.support_phone,
      payload.website_url,
      payload.about_text,
      payload.terms_text,
      payload.privacy_text
    ];
    const [u] = await db.execute(
      'UPDATE app_settings SET app_name=?, support_email=?, support_phone=?, website_url=?, about_text=?, terms_text=?, privacy_text=? WHERE id=1',
      vals
    );
    if (u.affectedRows === 0) {
      await db.execute(
        'INSERT INTO app_settings (id, app_name, support_email, support_phone, website_url, about_text, terms_text, privacy_text) VALUES (1,?,?,?,?,?,?,?)',
        vals
      );
    }
    return res.json({ success: true, message: 'App settings saved.', settings: { id: 1, ...payload } });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        success: false,
        message: 'Database table app_settings is missing. Run the latest schema (app_settings in medbless/database/schema.sql) and import again.'
      });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
