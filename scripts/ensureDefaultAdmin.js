/**
 * Idempotent: ensures default admin exists with known credentials.
 * Run: node scripts/ensureDefaultAdmin.js   (from backend folder)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const EMAIL = 'admin@medbless.local';
const PASSWORD = 'Admin@123';
const NAME = 'MedBless Admin';
const PHONE = '0000000000';

async function main() {
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(PASSWORD, salt);

  await db.execute(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified, is_active)
     VALUES (?, ?, ?, ?, 'admin', TRUE, TRUE)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = 'admin',
       is_active = TRUE,
       is_verified = TRUE,
       name = VALUES(name)`,
    [NAME, EMAIL, PHONE, password_hash]
  );

  console.log('Default admin is ready:');
  console.log('  Email:   ', EMAIL);
  console.log('  Password:', PASSWORD);
  console.log('  (Change password after login.)');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
