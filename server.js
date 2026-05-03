const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { connectDb } = require('./config/db');
const { ensureDefaultAdmin, getDefaults } = require('./services/ensureDefaultAdmin');

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: corsOrigins, credentials: true }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin/auth', require('./routes/adminAuth'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MedBless API is running 🌿', version: '1.0.0' });
});

const { getAppSettings } = require('./controllers/adminController');
app.get('/api/public/app-settings', getAppSettings);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => ensureDefaultAdmin({ forceReset: false }))
  .then((info) => {
    if (info.created) {
      const d = getDefaults();
      console.log(`✅ Default admin created: ${d.email} (set ADMIN_PASSWORD in .env to change default)`);
    }
    app.listen(PORT, () => {
      console.log(`🌿 MedBless API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
