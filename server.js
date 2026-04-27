const express = require('express');
const cors = require('cors');
const path = require('path');
// Load .env from this package folder (works even if node is started from another cwd)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Middleware
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MedBless API is running 🌿', version: '1.0.0' });
});

// Public app copy (branding, about, legal) — no auth; same payload as GET /api/admin/app-settings
const { getAppSettings } = require('./controllers/adminController');
app.get('/api/public/app-settings', getAppSettings);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌿 MedBless API running on http://localhost:${PORT}`);
});
