const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    appointment_id: { type: Number, required: true, unique: true },
    patient_id: { type: Number, required: true, index: true },
    doctor_id: { type: Number, required: true, index: true },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, default: '' },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'reviews' }
);

reviewSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
