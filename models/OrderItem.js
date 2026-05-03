const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    order_id: { type: Number, required: true, index: true },
    medicine_id: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    total_price: { type: Number, required: true }
  },
  { collection: 'order_items' }
);

orderItemSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.OrderItem || mongoose.model('OrderItem', orderItemSchema);
