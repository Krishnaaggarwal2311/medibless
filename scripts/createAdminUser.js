/**
 * One-time: create an admin user in the database.
 * Usage (from backend folder): node scripts/createAdminUser.js
 * Optional env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function main() {
  const name = process.env.ADMIN_NAME || 'MedBless Admin';
  const email = process.env.ADMIN_EMAIL || 'admin@medbless.local';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const phone = process.env.ADMIN_PHONE || '0000000000';

  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    console.error('User with this email already exists:', email);
    process.exit(1);
  }
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  await db.execute(
    'INSERT INTO users (name, email, phone, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, TRUE)',
    [name, email, phone, password_hash, 'admin']
  );
  console.log('Admin user created.');
  console.log('  Email:', email);
  console.log('  Password: (the one you set via ADMIN_PASSWORD or default — change after first login)');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
