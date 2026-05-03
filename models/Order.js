const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    order_number: { type: String, required: true, unique: true },
    total_amount: { type: Number, required: true },
    discount_amount: { type: Number, default: 0 },
    delivery_charge: { type: Number, default: 0 },
    final_amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'placed'
    },
    payment_method: { type: String, enum: ['cod', 'online', 'wallet'], default: 'online' },
    payment_status: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    delivery_address: { type: String, required: true },
    delivery_name: { type: String, default: '' },
    delivery_phone: { type: String, default: '' },
    prescription_url: { type: String, default: null },
    tracking_number: { type: String, default: null },
    estimated_delivery: { type: String, default: null },
    delivered_at: { type: Date, default: null },
    notes: { type: String, default: null }
  },
  {
    collection: 'orders',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

orderSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
