const { User, DoctorProfile, DoctorAvailability, Review, nextId } = require('../models');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.getDoctors = async (req, res) => {
  try {
    const { specialization, city, search, page = 1, limit = 12 } = req.query;
    const matchDp = { profile_approved: true };
    if (specialization) matchDp.specialization = specialization;

    const pipeline = [
      { $match: matchDp },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: 'id',
          as: 'u'
        }
      },
      { $unwind: '$u' },
      { $match: { 'u.role': 'doctor', 'u.is_active': true } }
    ];

    if (city) {
      pipeline.push({ $match: { 'u.city': new RegExp(escapeRegex(city), 'i') } });
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      pipeline.push({ $match: { $or: [{ 'u.name': rx }, { specialization: rx }] } });
    }

    pipeline.push(
      {
        $project: {
          _id: 0,
          id: '$u.id',
          name: '$u.name',
          avatar: '$u.avatar',
          city: '$u.city',
          state: '$u.state',
          doctor_id: '$id',
          specialization: 1,
          qualification: 1,
          experience_years: 1,
          consultation_fee: 1,
          rating: 1,
          total_reviews: 1,
          available_online: 1,
          available_offline: 1,
          hospital_name: 1,
          bio: 1,
          languages: 1
        }
      },
      { $sort: { rating: -1 } },
      { $skip: (parseInt(page, 10) - 1) * parseInt(limit, 10) },
      { $limit: parseInt(limit, 10) }
    );

    const doctors = await DoctorProfile.aggregate(pipeline);
    res.json({ success: true, doctors, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = parseInt(id, 10);
    const u = await User.findOne({ id: uid, role: 'doctor', is_active: true }).lean();
    if (!u) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const dp = await DoctorProfile.findOne({ user_id: uid }).lean();
    if (!dp) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const { id: _dpid, user_id: _uid, _id: _dpm, __v: _dpv, ...dpRest } = dp;
    const doctor = {
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      city: u.city,
      state: u.state,
      phone: u.phone,
      doctor_profile_id: dp.id,
      ...dpRest
    };
    const slots = await DoctorAvailability.find({
      doctor_id: doctor.doctor_profile_id,
      is_active: true
    }).lean();
    const cleanSlots = slots.map(({ _id, __v, ...r }) => r);
    const reviews = await Review.aggregate([
      { $match: { doctor_id: doctor.doctor_profile_id } },
      { $sort: { created_at: -1 } },
      { $limit: 10 },
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
          appointment_id: 1,
          patient_id: 1,
          doctor_id: 1,
          rating: 1,
          comment: 1,
          created_at: 1,
          patient_name: '$u.name',
          patient_avatar: '$u.avatar'
        }
      }
    ]);
    res.json({ success: true, doctor, slots: cleanSlots, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.getSpecializations = async (req, res) => {
  try {
    const rows = await DoctorProfile.aggregate([
      { $match: { profile_approved: true } },
      { $group: { _id: '$specialization', count: { $sum: 1 } } },
      { $project: { specialization: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);
    res.json({ success: true, specializations: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.updateDoctorProfile = async (req, res) => {
  try {
    const {
      specialization,
      qualification,
      experience_years,
      bio,
      consultation_fee,
      languages,
      available_online,
      available_offline,
      hospital_name,
      hospital_address
    } = req.body;
    const existing = await DoctorProfile.findOne({ user_id: req.user.id }).lean();
    if (existing) {
      await DoctorProfile.updateOne(
        { user_id: req.user.id },
        {
          $set: {
            specialization,
            qualification,
            experience_years,
            bio,
            consultation_fee,
            languages,
            available_online,
            available_offline,
            hospital_name,
            hospital_address
          }
        }
      );
    } else {
      const newId = await nextId('doctor_profiles');
      await DoctorProfile.create({
        id: newId,
        user_id: req.user.id,
        specialization,
        qualification,
        experience_years,
        bio,
        consultation_fee,
        languages,
        available_online,
        available_offline,
        hospital_name,
        hospital_address
      });
    }
    res.json({ success: true, message: 'Doctor profile updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
