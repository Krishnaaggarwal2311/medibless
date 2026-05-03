/**
 * One-time: copy all MySQL medbless data into MongoDB (same numeric ids).
 * Requires: .env with MONGODB_URI and DB_* (MySQL) still pointing at the source DB.
 *
 * Usage (from backend folder):
 *   node scripts/migrateMysqlToMongo.js --drop
 *
 * --drop  Wipes target Mongo collections before import (recommended for first migration).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

require('../models');

const COLLECTIONS = [
  'users',
  'doctor_profiles',
  'doctor_availability',
  'appointments',
  'reviews',
  'medicine_categories',
  'medicines',
  'cart',
  'orders',
  'order_items',
  'notifications',
  'app_settings',
  'health_records',
  'counters'
];

function asBool(v) {
  return v === true || v === 1 || v === '1';
}

function stripRow(row) {
  const o = { ...row };
  delete o._id;
  return o;
}

async function dropMongoCollections() {
  for (const name of COLLECTIONS) {
    try {
      await mongoose.connection.collection(name).drop();
    } catch (_e) {
      /* ns not found */
    }
  }
  console.log('Dropped existing Mongo collections (if any).');
}

async function syncCounters() {
  const { Counter } = require('../models');
  const pairs = [
    ['users', 'users'],
    ['doctor_profiles', 'doctor_profiles'],
    ['doctor_availability', 'doctor_availability'],
    ['appointments', 'appointments'],
    ['reviews', 'reviews'],
    ['medicine_categories', 'medicine_categories'],
    ['medicines', 'medicines'],
    ['cart', 'cart'],
    ['orders', 'orders'],
    ['order_items', 'order_items'],
    ['notifications', 'notifications'],
    ['health_records', 'health_records'],
    ['admins', 'admins']
  ];
  for (const [key, coll] of pairs) {
    const col = mongoose.connection.collection(coll);
    const last = await col.find({}).sort({ id: -1 }).limit(1).toArray();
    const seq = last[0]?.id || 0;
    await Counter.findByIdAndUpdate(key, { seq }, { upsert: true });
  }
  console.log('Synced id counters from max(ids).');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !String(uri).trim()) {
    console.error('Set MONGODB_URI in .env');
    process.exit(1);
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'medbless',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    dateStrings: true
  });
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('Cannot connect to MySQL. Start MySQL / check DB_* in .env. No Mongo data was changed.', e.message);
    await pool.end();
    process.exit(1);
  }
  console.log('Connected to MySQL.');

  await mongoose.connect(String(uri).trim());
  console.log('Connected to MongoDB.');

  const doDrop = process.argv.includes('--drop');
  if (doDrop) await dropMongoCollections();

  const col = (name) => mongoose.connection.collection(name);

  async function copyTable(tableName, collectionName, mapFn = (r) => stripRow(r)) {
    const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows`);
      return;
    }
    const docs = rows.map(mapFn).filter(Boolean);
    if (docs.length) await col(collectionName).insertMany(docs, { ordered: true });
    console.log(`  ${tableName} -> ${collectionName}: ${docs.length} rows`);
  }

  /** Skip missing MySQL tables (e.g. older DB without app_settings). */
  async function copyTableSafe(tableName, collectionName, mapFn) {
    try {
      await copyTable(tableName, collectionName, mapFn);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) {
        console.warn(`  ${tableName}: skipped (table does not exist in MySQL)`);
        return;
      }
      throw e;
    }
  }

  console.log('Reading MySQL and inserting into Mongo...');
  await copyTableSafe('medicine_categories', 'medicine_categories', (r) => {
    const o = stripRow(r);
    o.is_active = asBool(o.is_active);
    return o;
  });
  await copyTableSafe('medicines', 'medicines', (r) => {
    const o = stripRow(r);
    o.requires_prescription = asBool(o.requires_prescription);
    o.is_active = asBool(o.is_active);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    return o;
  });
  await copyTableSafe('users', 'users', (r) => {
    const o = stripRow(r);
    o.is_verified = asBool(o.is_verified);
    o.is_active = asBool(o.is_active);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    if (o.updated_at && typeof o.updated_at === 'string') o.updated_at = new Date(o.updated_at);
    return o;
  });
  await copyTableSafe('doctor_profiles', 'doctor_profiles', (r) => {
    const o = stripRow(r);
    o.available_online = asBool(o.available_online);
    o.available_offline = asBool(o.available_offline);
    o.profile_approved = asBool(o.profile_approved);
    return o;
  });
  await copyTableSafe('doctor_availability', 'doctor_availability', (r) => {
    const o = stripRow(r);
    o.is_active = asBool(o.is_active);
    if (o.start_time && Buffer.isBuffer(o.start_time)) o.start_time = o.start_time.toString('utf8').slice(0, 8);
    if (o.end_time && Buffer.isBuffer(o.end_time)) o.end_time = o.end_time.toString('utf8').slice(0, 8);
    return o;
  });
  await copyTableSafe('appointments', 'appointments', (r) => {
    const o = stripRow(r);
    if (o.appointment_date && typeof o.appointment_date !== 'string') {
      const d = new Date(o.appointment_date);
      o.appointment_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (o.appointment_time && Buffer.isBuffer(o.appointment_time)) {
      o.appointment_time = o.appointment_time.toString('utf8').slice(0, 8);
    }
    if (typeof o.appointment_time === 'string' && o.appointment_time.length > 8) {
      o.appointment_time = o.appointment_time.slice(0, 8);
    }
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    if (o.updated_at && typeof o.updated_at === 'string') o.updated_at = new Date(o.updated_at);
    return o;
  });
  await copyTableSafe('reviews', 'reviews', (r) => {
    const o = stripRow(r);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    return o;
  });
  await copyTableSafe('cart', 'cart', (r) => {
    const o = stripRow(r);
    if (o.added_at && typeof o.added_at === 'string') o.added_at = new Date(o.added_at);
    return o;
  });
  await copyTableSafe('orders', 'orders', (r) => {
    const o = stripRow(r);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    if (o.updated_at && typeof o.updated_at === 'string') o.updated_at = new Date(o.updated_at);
    if (o.delivered_at && typeof o.delivered_at === 'string') o.delivered_at = new Date(o.delivered_at);
    if (o.estimated_delivery && typeof o.estimated_delivery !== 'string') {
      const d = new Date(o.estimated_delivery);
      o.estimated_delivery = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return o;
  });
  await copyTableSafe('order_items', 'order_items');
  await copyTableSafe('notifications', 'notifications', (r) => {
    const o = stripRow(r);
    o.is_read = asBool(o.is_read);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    return o;
  });
  await copyTableSafe('app_settings', 'app_settings', (r) => {
    const o = stripRow(r);
    if (o.updated_at && typeof o.updated_at === 'string') o.updated_at = new Date(o.updated_at);
    return o;
  });

  const appSettingsCount = await col('app_settings').countDocuments();
  if (appSettingsCount === 0) {
    await col('app_settings').insertOne({
      id: 1,
      app_name: 'MedBless',
      support_email: '',
      support_phone: '',
      website_url: '',
      about_text: '',
      terms_text: '',
      privacy_text: '',
      updated_at: new Date()
    });
    console.log('  app_settings: inserted default row (none in MySQL / skipped)');
  }

  await copyTableSafe('health_records', 'health_records', (r) => {
    const o = stripRow(r);
    if (o.created_at && typeof o.created_at === 'string') o.created_at = new Date(o.created_at);
    return o;
  });

  await syncCounters();
  await pool.end();
  await mongoose.disconnect();
  console.log('Migration finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
