/**
 * Idempotent: default admin in `admins` collection.
 * Run: npm run admin:ensure   (from backend folder)
 *
 * This script **resets password** for the default admin email to match .env (recovery).
 * Server boot only **creates** if missing — see services/ensureDefaultAdmin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectDb } = require('../config/db');
const { ensureDefaultAdmin, getDefaults } = require('../services/ensureDefaultAdmin');

async function main() {
  await connectDb();
  const { email, password } = getDefaults();
  await ensureDefaultAdmin({ forceReset: true });

  console.log('Default admin (admins collection) is ready:');
  console.log('  Email:   ', email);
  console.log('  Password:', password);
  console.log('  (Change password after login.)');

  const mongoose = require('mongoose');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
