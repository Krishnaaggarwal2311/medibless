/**
 * Create an admin in the `admins` collection (not users).
 * Usage (from backend folder): node scripts/createAdminUser.js
 * Optional env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { connectDb } = require('../config/db');
const { Admin, nextId } = require('../models');

async function main() {
  await connectDb();
  const name = process.env.ADMIN_NAME || 'MedBless Admin';
  const email = (process.env.ADMIN_EMAIL || 'admin@medbless.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const phone = process.env.ADMIN_PHONE || '';

  const existing = await Admin.findOne({ email }).lean();
  if (existing) {
    console.error('Admin with this email already exists:', email);
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    process.exit(1);
  }
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const id = await nextId('admins');
  await Admin.create({
    id,
    name,
    email,
    phone,
    password_hash,
    is_active: true
  });
  console.log('Admin created in `admins` collection.');
  console.log('  Email:', email);
  console.log('  Password: (the one you set via ADMIN_PASSWORD or default — change after first login)');
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
