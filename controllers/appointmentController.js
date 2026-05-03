const { v4: uuidv4 } = require('uuid');
const {
  Appointment,
  DoctorProfile,
  DoctorAvailability,
  Notification,
  nextId
} = require('../models');

exports.bookAppointment = async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, type, symptoms } = req.body;
    const patient_id = req.user.id;
    const docId = parseInt(doctor_id, 10);

    const existing = await Appointment.findOne({
      doctor_id: docId,
      appointment_date,
      appointment_time,
      status: { $nin: ['cancelled', 'no_show'] }
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This slot is already booked. Please choose another time.'
      });
    }

    const docRow = await DoctorProfile.findOne({ id: docId }).select('consultation_fee').lean();
    const fee = docRow?.consultation_fee ?? 0;

    const meeting_link = type === 'online' ? `https://meet.medbless.in/${uuidv4()}` : null;

    const newId = await nextId('appointments');
    await Appointment.create({
      id: newId,
      patient_id,
      doctor_id: docId,
      appointment_date,
      appointment_time,
      type,
      symptoms: symptoms || '',
      consultation_fee: fee,
      meeting_link
    });

    const nid = await nextId('notifications');
    await Notification.create({
      id: nid,
      user_id: patient_id,
      title: 'Appointment Booked',
      message: `Your appointment has been booked for ${appointment_date} at ${appointment_time}.`,
      type: 'appointment'
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully!',
      appointment_id: newId,
      meeting_link
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getMyAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { patient_id: req.user.id };
    if (status) filter.status = status;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const appointments = await Appointment.aggregate([
      { $match: filter },
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
          doctor_name: '$du.name',
          doctor_avatar: '$du.avatar',
          specialization: '$dp.specialization',
          hospital_name: '$dp.hospital_name'
        }
      },
      { $sort: { appointment_date: -1, appointment_time: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit, 10) }
    ]);
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getDoctorAppointments = async (req, res) => {
  try {
    const dp = await DoctorProfile.findOne({ user_id: req.user.id }).select('id').lean();
    if (!dp) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
    const doctor_id = dp.id;
    const { status, date } = req.query;
    const filter = { doctor_id };
    if (status) filter.status = status;
    if (date) filter.appointment_date = date;
    const appointments = await Appointment.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'patient_id',
          foreignField: 'id',
          as: 'u'
        }
      },
      { $unwind: '$u' },
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
          patient_name: '$u.name',
          patient_avatar: '$u.avatar',
          patient_phone: '$u.phone'
        }
      },
      { $sort: { appointment_date: 1, appointment_time: 1 } }
    ]);
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, prescription_url } = req.body;
    await Appointment.updateOne(
      { id: parseInt(id, 10) },
      { $set: { status, notes, prescription_url } }
    );
    res.json({ success: true, message: 'Appointment updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    await Appointment.updateOne(
      {
        id: parseInt(id, 10),
        patient_id: req.user.id,
        status: { $in: ['pending', 'confirmed'] }
      },
      { $set: { status: 'cancelled' } }
    );
    res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getAvailableSlots = async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const docId = parseInt(doctor_id, 10);
    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    const availability = await DoctorAvailability.find({
      doctor_id: docId,
      day_of_week: dayName,
      is_active: true
    }).lean();
    if (availability.length === 0) return res.json({ success: true, slots: [] });

    const bookedDocs = await Appointment.find({
      doctor_id: docId,
      appointment_date: date,
      status: { $nin: ['cancelled', 'no_show'] }
    })
      .select('appointment_time')
      .lean();
    const booked = bookedDocs.map((s) => s.appointment_time);

    const slots = [];
    for (const av of availability) {
      let current = av.start_time;
      if (typeof current === 'string' && current.length >= 8) current = current.slice(0, 8);
      let endT = av.end_time;
      if (typeof endT === 'string' && endT.length >= 8) endT = endT.slice(0, 8);
      while (current < endT) {
        slots.push({ time: current, available: !booked.includes(current) });
        const [h, m] = current.split(':').map(Number);
        const next = new Date(2000, 0, 1, h, m + av.slot_duration_minutes);
        current = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}:00`;
      }
    }
    res.json({ success: true, slots });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
