const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// Load all models (registers schemas)
require('../models');

const uri = process.env.MONGODB_URI;
if (!uri || String(uri).trim() === '') {
  console.error('❌ MONGODB_URI is not set in .env');
  process.exit(1);
}

async function connectDb() {
  mongoose.set('strictQuery', true);
  mongoose.set('bufferTimeoutMS', 30_000);
  const u = String(uri).trim();
  const opts = {
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 20_000
  };
  // Windows/local dev: fixes "unable to verify the first certificate" (antivirus/SSL inspection)
  if (process.env.MONGODB_TLS_INSECURE === 'true') {
    opts.tlsAllowInvalidCertificates = true;
  }
  try {
    await mongoose.connect(u, opts);
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log('✅ MongoDB connected');
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('unable to verify the first certificate')) {
      console.error('❌ MongoDB TLS error. Add MONGODB_TLS_INSECURE=true to .env for local dev.');
    } else if (msg.includes('whitelist')) {
      console.error('❌ MongoDB IP not whitelisted. Add your IP in Atlas → Network Access.');
    }
    throw err;
  }
}

module.exports = { connectDb, mongoose };
