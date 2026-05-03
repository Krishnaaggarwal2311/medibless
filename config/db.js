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
  await mongoose.connect(u, {
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 20_000
  });
  await mongoose.connection.db.admin().command({ ping: 1 });
  console.log('✅ MongoDB connected');
}

module.exports = { connectDb, mongoose };
