const {
  User,
  Appointment,
  DoctorProfile,
  Order,
  Review,
  Medicine,
  Cart,
  Notification,
  DoctorAvailability,
  OrderItem,
  AppSettings
} = require('../models');

function localYMD() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.getDashboard = async (req, res) => {
  try {
    const usersByRole = await User.aggregate([
      { $match: { role: { $in: ['patient', 'doctor'] } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $project: { _id: 0, role: '$_id', count: 1 } }
    ]);
    const today = localYMD();
    const appointmentsToday = await Appointment.countDocuments({ appointment_date: today });
    const pendingDoctorApprovals = await DoctorProfile.countDocuments({ profile_approved: false });
    const [orderAgg] = await Order.aggregate([
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          active_orders: {
            $sum: {
              $cond: [{ $in: ['$status', ['placed', 'confirmed', 'processing']] }, 1, 0]
            }
          }
        }
      }
    ]);
    const [revAgg] = await Order.aggregate([
      { $group: { _id: null, total_revenue: { $sum: '$final_amount' } } }
    ]);
    res.json({
      success: true,
      dashboard: {
        usersByRole,
        appointmentsToday,
        pendingDoctorApprovals,
        totalOrders: orderAgg?.total_orders || 0,
        activeOrders: orderAgg?.active_orders || 0,
        totalRevenue: parseFloat(revAgg?.total_revenue || 0)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status === 'active') filter.is_active = true;
    else if (status === 'blocked' || status === 'inactive') filter.is_active = false;
    if (role) filter.role = role;
    if (search) {
      const rx = new RegExp(escapeRx(search), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const users = await User.find(filter)
      .select('id name email phone role is_active is_verified created_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();
    const total = await User.countDocuments(filter);
    const statMatch = { ...filter };
    const [statRow] = await User.aggregate([
      { $match: statMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$is_active', 1, 0] } },
          blocked: { $sum: { $cond: ['$is_active', 0, 1] } }
        }
      }
    ]);
    res.json({
      success: true,
      users,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
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

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = parseInt(id, 10);
    const u = await User.findOne({ id: uid }).lean();
    if (!u) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (u.email && req.admin.email && u.email.toLowerCase() === req.admin.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'You cannot delete the user linked to this admin email.' });
    }
    const [apC, ordC, revC] = await Promise.all([
      Appointment.countDocuments({ patient_id: uid }),
      Order.countDocuments({ user_id: uid }),
      Review.countDocuments({ patient_id: uid })
    ]);
    if (apC > 0 || ordC > 0 || revC > 0) {
      return res.status(409).json({
        success: false,
        message: 'This user has appointments, orders, or reviews. Block the account instead of deleting.'
      });
    }
    const dProf = await DoctorProfile.findOne({ user_id: uid }).lean();
    if (dProf) {
      const aDoc = await Appointment.countDocuments({ doctor_id: dProf.id });
      if (aDoc > 0) {
        return res.status(409).json({
          success: false,
          message: 'This doctor has appointments. Block the account or remove linked data first.'
        });
      }
      await DoctorAvailability.deleteMany({ doctor_id: dProf.id });
      await DoctorProfile.deleteMany({ user_id: uid });
    }
    await Cart.deleteMany({ user_id: uid });
    await Notification.deleteMany({ user_id: uid });
    await User.deleteOne({ id: uid });
    res.json({ success: true, message: 'User removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.setUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const target = await User.findOne({ id: parseInt(id, 10) }).select('email').lean();
    if (target?.email && req.admin.email && target.email.toLowerCase() === req.admin.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'You cannot disable the user linked to this admin email.' });
    }
    await User.updateOne({ id: parseInt(id, 10) }, { $set: { is_active: !!is_active } });
    res.json({ success: true, message: 'User updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const match = {};
    if (status) match.status = status;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await Appointment.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'patient_id',
          foreignField: 'id',
          as: 'pu'
        }
      },
      { $unwind: '$pu' },
      {
        $lookup: {
          from: 'doctor_profiles',
          localField: 'doctor_id',
          foreignField: 'id',
          as: 'dp'
        }
      },
      { $unwind: '$dp' },
      {
        $lookup: {
          from: 'users',
          localField: 'dp.user_id',
          foreignField: 'id',
          as: 'du'
        }
      },
      { $unwind: '$du' },
      {
        $project: {
          _id: 0,
          id: 1,
          patient_id: 1,
          doctor_id: 1,
          appointment_date: 1,
          appointment_time: 1,
          type: 1,
          status: 1,
          symptoms: 1,
          notes: 1,
          prescription_url: 1,
          consultation_fee: 1,
          payment_status: 1,
          meeting_link: 1,
          created_at: 1,
          updated_at: 1,
          patient_name: '$pu.name',
          patient_email: '$pu.email',
          patient_phone: '$pu.phone',
          doctor_name: '$du.name',
          doctor_email: '$du.email',
          specialization: '$dp.specialization',
          hospital_name: '$dp.hospital_name',
          doctor_profile_id: '$dp.id'
        }
      },
      { $sort: { appointment_date: -1, appointment_time: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit, 10) }
    ]);
    const total = await Appointment.countDocuments(match);
    res.json({
      success: true,
      appointments: rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.adminCancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    await Appointment.updateOne(
      { id: parseInt(id, 10), status: { $in: ['pending', 'confirmed'] } },
      { $set: { status: 'cancelled' } }
    );
    res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getPendingDoctors = async (req, res) => {
  try {
    const rows = await DoctorProfile.aggregate([
      { $match: { profile_approved: false } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: 'id',
          as: 'u'
        }
      },
      { $unwind: '$u' },
      {
        $project: {
          _id: 0,
          id: 1,
          user_id: 1,
          specialization: 1,
          qualification: 1,
          experience_years: 1,
          registration_number: 1,
          hospital_name: 1,
          bio: 1,
          profile_approved: 1,
          name: '$u.name',
          email: '$u.email',
          phone: '$u.phone',
          city: '$u.city',
          created_at: '$u.created_at'
        }
      },
      { $sort: { created_at: 1 } }
    ]);
    res.json({ success: true, doctors: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.approveDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    await DoctorProfile.updateOne({ id: parseInt(id, 10) }, { $set: { profile_approved: true } });
    res.json({ success: true, message: 'Doctor profile approved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const match = {};
    if (status) match.status = status;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await Order.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: 'id',
          as: 'u'
        }
      },
      { $unwind: '$u' },
      {
        $project: {
          _id: 0,
          id: 1,
          user_id: 1,
          order_number: 1,
          total_amount: 1,
          discount_amount: 1,
          delivery_charge: 1,
          final_amount: 1,
          status: 1,
          payment_method: 1,
          payment_status: 1,
          delivery_address: 1,
          delivery_name: 1,
          delivery_phone: 1,
          prescription_url: 1,
          tracking_number: 1,
          estimated_delivery: 1,
          delivered_at: 1,
          notes: 1,
          created_at: 1,
          updated_at: 1,
          user_name: '$u.name',
          user_email: '$u.email',
          user_phone: '$u.phone'
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit, 10) }
    ]);
    for (const order of orders) {
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
      order.items = items;
    }
    const total = await Order.countDocuments(match);
    res.json({
      success: true,
      orders,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status, tracking_number, notes } = req.body;
    const $set = {};
    if (status !== undefined) $set.status = status;
    if (payment_status !== undefined) $set.payment_status = payment_status;
    if (tracking_number !== undefined) $set.tracking_number = tracking_number;
    if (notes !== undefined) $set.notes = notes;
    if (status === 'delivered') $set.delivered_at = new Date();
    if (Object.keys($set).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    await Order.updateOne({ id: parseInt(id, 10) }, { $set });
    res.json({ success: true, message: 'Order updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getMedicines = async (req, res) => {
  try {
    const { search, page = 1, limit = 24 } = req.query;
    const match = {};
    if (search) {
      const rx = new RegExp(escapeRx(search), 'i');
      match.$or = [{ name: rx }, { brand: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await Medicine.aggregate([
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
      { $addFields: { category_name: { $ifNull: [{ $arrayElemAt: ['$mc.name', 0] }, ''] } } },
      { $project: { mc: 0 } },
      { $sort: { name: 1 } },
      { $skip: skip },
      { $limit: parseInt(limit, 10) }
    ]);
    const medicines = rows.map(({ _id, __v, ...r }) => r);
    res.json({ success: true, medicines, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_quantity, is_active, price, discount_percent } = req.body;
    const $set = {};
    if (stock_quantity !== undefined) $set.stock_quantity = stock_quantity;
    if (is_active !== undefined) $set.is_active = !!is_active;
    if (price !== undefined) $set.price = price;
    if (discount_percent !== undefined) $set.discount_percent = discount_percent;
    if (Object.keys($set).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    await Medicine.updateOne({ id: parseInt(id, 10) }, { $set });
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
    const row = await AppSettings.findOne({ id: 1 }).lean();
    if (!row) {
      return res.json({ success: true, settings: { ...DEFAULT_APP_SETTINGS } });
    }
    const { _id, __v, ...settings } = row;
    return res.json({ success: true, settings });
  } catch (err) {
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
      privacy_text: t(privacy_text),
      updated_at: new Date()
    };
    await AppSettings.updateOne({ id: 1 }, { $set: { ...payload, id: 1 } }, { upsert: true });
    return res.json({ success: true, message: 'App settings saved.', settings: { id: 1, ...payload } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
