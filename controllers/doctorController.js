const db = require('../config/db');

// Get all doctors (with filters)
exports.getDoctors = async (req, res) => {
  try {
    const { specialization, city, search, page = 1, limit = 12 } = req.query;
    let query = `
      SELECT u.id, u.name, u.avatar, u.city, u.state,
             dp.id as doctor_id, dp.specialization, dp.qualification, dp.experience_years,
             dp.consultation_fee, dp.rating, dp.total_reviews, dp.available_online,
             dp.available_offline, dp.hospital_name, dp.bio, dp.languages
      FROM users u
      JOIN doctor_profiles dp ON u.id = dp.user_id
      WHERE u.role = 'doctor' AND u.is_active = TRUE AND dp.profile_approved = TRUE
    `;
    const params = [];
    if (specialization) { query += ' AND dp.specialization = ?'; params.push(specialization); }
    if (city) { query += ' AND u.city LIKE ?'; params.push(`%${city}%`); }
    if (search) { query += ' AND (u.name LIKE ? OR dp.specialization LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY dp.rating DESC';
    const offset = (page - 1) * limit;
    query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    const [doctors] = await db.execute(query, params);
    res.json({ success: true, doctors, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get single doctor
exports.getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(`
      SELECT u.id, u.name, u.avatar, u.city, u.state, u.phone,
             dp.*, dp.id as doctor_profile_id
      FROM users u
      JOIN doctor_profiles dp ON u.id = dp.user_id
      WHERE u.id = ? AND u.is_active = TRUE
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const [slots] = await db.execute(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? AND is_active = TRUE',
      [rows[0].doctor_profile_id]
    );
    const [reviews] = await db.execute(`
      SELECT r.*, u.name as patient_name, u.avatar as patient_avatar
      FROM reviews r JOIN users u ON r.patient_id = u.id
      WHERE r.doctor_id = ? ORDER BY r.created_at DESC LIMIT 10
    `, [rows[0].doctor_profile_id]);
    res.json({ success: true, doctor: rows[0], slots, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get specializations list
exports.getSpecializations = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT DISTINCT specialization, COUNT(*) as count FROM doctor_profiles WHERE profile_approved = TRUE GROUP BY specialization ORDER BY count DESC'
    );
    res.json({ success: true, specializations: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Create/Update doctor profile (by doctor)
exports.updateDoctorProfile = async (req, res) => {
  try {
    const { specialization, qualification, experience_years, bio, consultation_fee,
            languages, available_online, available_offline, hospital_name, hospital_address } = req.body;
    const [existing] = await db.execute('SELECT id FROM doctor_profiles WHERE user_id = ?', [req.user.id]);
    if (existing.length > 0) {
      await db.execute(`
        UPDATE doctor_profiles SET specialization=?, qualification=?, experience_years=?, bio=?,
        consultation_fee=?, languages=?, available_online=?, available_offline=?, hospital_name=?, hospital_address=?
        WHERE user_id=?`,
        [specialization, qualification, experience_years, bio, consultation_fee,
         languages, available_online, available_offline, hospital_name, hospital_address, req.user.id]
      );
    } else {
      await db.execute(`
        INSERT INTO doctor_profiles (user_id, specialization, qualification, experience_years, bio, consultation_fee, languages, available_online, available_offline, hospital_name, hospital_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, specialization, qualification, experience_years, bio, consultation_fee,
         languages, available_online, available_offline, hospital_name, hospital_address]
      );
    }
    res.json({ success: true, message: 'Doctor profile updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
