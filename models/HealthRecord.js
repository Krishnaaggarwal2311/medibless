const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    record_type: { type: String, default: '' },
    file_url: { type: String, default: null },
    description: { type: String, default: '' },
    upload_date: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'health_records' }
);

healthRecordSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.HealthRecord || mongoose.model('HealthRecord', healthRecordSchema);
