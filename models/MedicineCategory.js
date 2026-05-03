const mongoose = require('mongoose');

const medicineCategorySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    is_active: { type: Boolean, default: true }
  },
  { collection: 'medicine_categories' }
);

medicineCategorySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports =
  mongoose.models.MedicineCategory || mongoose.model('MedicineCategory', medicineCategorySchema);
