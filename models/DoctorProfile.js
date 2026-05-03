const mongoose = require('mongoose');

const doctorProfileSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    user_id: { type: Number, required: true, unique: true, index: true },
    specialization: { type: String, required: true },
    qualification: { type: String, default: '' },
    experience_years: { type: Number, default: 0 },
    registration_number: { type: String, default: null },
    bio: { type: String, default: '' },
    consultation_fee: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    total_reviews: { type: Number, default: 0 },
    languages: { type: String, default: '' },
    available_online: { type: Boolean, default: true },
    available_offline: { type: Boolean, default: true },
    hospital_name: { type: String, default: '' },
    hospital_address: { type: String, default: '' },
    profile_approved: { type: Boolean, default: false }
  },
  { collection: 'doctor_profiles' }
);

doctorProfileSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.DoctorProfile || mongoose.model('DoctorProfile', doctorProfileSchema);
