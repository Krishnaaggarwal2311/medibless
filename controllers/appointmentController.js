const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Book appointment
exports.bookAppointment = async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, type, symptoms } = req.body;
    const patient_id = req.user.id;

    // Check slot availability
    const [existing] = await db.execute(
      'SELECT id FROM appointments WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status NOT IN ("cancelled","no_show")',
      [doctor_id, appointment_date, appointment_time]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'This slot is already booked. Please choose another time.' });
    }

    // Get doctor fee
    const [docRows] = await db.execute('SELECT consultation_fee FROM doctor_profiles WHERE id=?', [doctor_id]);
    const fee = docRows[0]?.consultation_fee || 0;

    const meeting_link = type === 'online' ? `https://meet.medbless.in/${uuidv4()}` : null;

    const [result] = await db.execute(
      'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, type, symptoms, consultation_fee, meeting_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [patient_id, doctor_id, appointment_date, appointment_time, type, symptoms, fee, meeting_link]
    );

    // Create notification
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [patient_id, 'Appointment Booked', `Your appointment has been booked for ${appointment_date} at ${appointment_time}.`, 'appointment']
    );

    res.status(201).json({
      success: true, message: 'Appointment booked successfully!',
      appointment_id: result.insertId, meeting_link
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get patient appointments
exports.getMyAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = `
      SELECT a.*, u.name as doctor_name, u.avatar as doctor_avatar,
             dp.specialization, dp.hospital_name
      FROM appointments a
      JOIN doctor_profiles dp ON a.doctor_id = dp.id
      JOIN users u ON dp.user_id = u.id
      WHERE a.patient_id = ?
    `;
    const params = [req.user.id];
    if (status) { query += ' AND a.status = ?'; params.push(status); }
    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const [appointments] = await db.execute(query, params);
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get doctor appointments
exports.getDoctorAppointments = async (req, res) => {
  try {
    const [dpRows] = await db.execute('SELECT id FROM doctor_profiles WHERE user_id = ?', [req.user.id]);
    if (dpRows.length === 0) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
    const doctor_id = dpRows[0].id;
    const { status, date } = req.query;
    let query = `
      SELECT a.*, u.name as patient_name, u.avatar as patient_avatar, u.phone as patient_phone
      FROM appointments a JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ?
    `;
    const params = [doctor_id];
    if (status) { query += ' AND a.status = ?'; params.push(status); }
    if (date) { query += ' AND a.appointment_date = ?'; params.push(date); }
    query += ' ORDER BY a.appointment_date ASC, a.appointment_time ASC';
    const [appointments] = await db.execute(query, params);
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Update appointment status
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, prescription_url } = req.body;
    await db.execute(
      'UPDATE appointments SET status=?, notes=?, prescription_url=? WHERE id=?',
      [status, notes, prescription_url, id]
    );
    res.json({ success: true, message: 'Appointment updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(
      'UPDATE appointments SET status="cancelled" WHERE id=? AND patient_id=? AND status IN ("pending","confirmed")',
      [id, req.user.id]
    );
    res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get available slots for a doctor on a date
exports.getAvailableSlots = async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    const [availability] = await db.execute(
      'SELECT * FROM doctor_availability WHERE doctor_id=? AND day_of_week=? AND is_active=TRUE',
      [doctor_id, dayName]
    );
    if (availability.length === 0) return res.json({ success: true, slots: [] });

    const [bookedSlots] = await db.execute(
      'SELECT appointment_time FROM appointments WHERE doctor_id=? AND appointment_date=? AND status NOT IN ("cancelled","no_show")',
      [doctor_id, date]
    );
    const booked = bookedSlots.map(s => s.appointment_time);

    const slots = [];
    for (const av of availability) {
      let current = av.start_time;
      while (current < av.end_time) {
        slots.push({ time: current, available: !booked.includes(current) });
        const [h, m] = current.split(':').map(Number);
        const next = new Date(2000, 0, 1, h, m + av.slot_duration_minutes);
        current = `${String(next.getHours()).padStart(2,'0')}:${String(next.getMinutes()).padStart(2,'0')}:00`;
      }
    }
    res.json({ success: true, slots });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
