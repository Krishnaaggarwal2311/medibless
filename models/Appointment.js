const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    patient_id: { type: Number, required: true, index: true },
    doctor_id: { type: Number, required: true, index: true },
    appointment_date: { type: String, required: true },
    appointment_time: { type: String, required: true },
    type: { type: String, enum: ['online', 'offline'], default: 'online' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
      default: 'pending'
    },
    symptoms: { type: String, default: '' },
    notes: { type: String, default: null },
    prescription_url: { type: String, default: null },
    consultation_fee: { type: Number, default: null },
    payment_status: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    meeting_link: { type: String, default: null }
  },
  {
    collection: 'appointments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

appointmentSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
