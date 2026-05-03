const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['appointment', 'order', 'general', 'reminder'], default: 'general' },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'notifications' }
);

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
