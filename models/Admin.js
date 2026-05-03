const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    name: { type: String, default: 'Admin' },
    phone: { type: String, default: '' },
    is_active: { type: Boolean, default: true }
  },
  {
    collection: 'admins',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

adminSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.password_hash;
    return ret;
  }
});

module.exports = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
