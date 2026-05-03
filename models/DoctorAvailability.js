const mongoose = require('mongoose');

const doctorAvailabilitySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    doctor_id: { type: Number, required: true, index: true },
    day_of_week: { type: String, default: null },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    slot_duration_minutes: { type: Number, default: 30 },
    is_active: { type: Boolean, default: true }
  },
  { collection: 'doctor_availability' }
);

doctorAvailabilitySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports =
  mongoose.models.DoctorAvailability || mongoose.model('DoctorAvailability', doctorAvailabilitySchema);
