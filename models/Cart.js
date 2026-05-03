const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    medicine_id: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    prescription_url: { type: String, default: null },
    added_at: { type: Date, default: Date.now }
  },
  { collection: 'cart' }
);

cartSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
