const bcrypt = require('bcryptjs');
const { Admin, User, nextId } = require('../models');

function getDefaults() {
  const email = (process.env.ADMIN_EMAIL || 'krishnaaggarwal2311@gmail.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const name = process.env.ADMIN_NAME || 'Krishna Aggarwal';
  return { email, password, name };
}

/**
 * Idempotent default admin in `admins` (never in `users`).
 *
 * @param {{ forceReset?: boolean }} [opts]
 * - `forceReset: false` (default, server boot): create if missing only; do not change existing password.
 * - `forceReset: true` (CLI `admin:ensure`): upsert + reset password to env defaults (recovery).
 */
async function ensureDefaultAdmin(opts = {}) {
  const { forceReset = false } = opts;
  const { email, password, name } = getDefaults();

  await User.collection.updateMany({ role: 'admin' }, { $set: { role: 'patient' } }).catch(() => {});

  const existing = await Admin.findOne({ email }).lean();
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  if (existing) {
    if (forceReset) {
      await Admin.updateOne(
        { email },
        { $set: { password_hash, name, is_active: true } }
      );
    }
    return { email, created: false, reset: forceReset };
  }

  const id = await nextId('admins');
  await Admin.create({
    id,
    email,
    password_hash,
    name,
    phone: '',
    is_active: true
  });
  return { email, created: true, reset: false };
}

module.exports = { ensureDefaultAdmin, getDefaults };
