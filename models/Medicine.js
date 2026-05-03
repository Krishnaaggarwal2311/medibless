const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    category_id: { type: Number, default: null, index: true },
    description: { type: String, default: '' },
    composition: { type: String, default: '' },
    uses: { type: String, default: '' },
    side_effects: { type: String, default: '' },
    dosage_info: { type: String, default: '' },
    price: { type: Number, required: true },
    mrp: { type: Number, default: null },
    discount_percent: { type: Number, default: 0 },
    stock_quantity: { type: Number, default: 0 },
    unit: { type: String, default: 'strip' },
    image_url: { type: String, default: null },
    requires_prescription: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    manufacturer: { type: String, default: '' },
    expiry_months: { type: Number, default: 24 },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'medicines' }
);

medicineSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
