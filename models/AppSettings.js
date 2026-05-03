const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, default: 1 },
    app_name: { type: String, default: 'MedBless' },
    support_email: { type: String, default: '' },
    support_phone: { type: String, default: '' },
    website_url: { type: String, default: '' },
    about_text: { type: String, default: '' },
    terms_text: { type: String, default: '' },
    privacy_text: { type: String, default: '' },
    updated_at: { type: Date, default: Date.now }
  },
  { collection: 'app_settings' }
);

appSettingsSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema);
