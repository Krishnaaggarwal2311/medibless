require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectDb } = require('../config/db');
const { ensureDefaultPatient } = require('../services/ensureDefaultAdmin');

connectDb()
  .then(() => ensureDefaultPatient({ forceReset: true }))
  .then((info) => {
    console.log(`Patient account ready: ${info.email} (password reset to env default)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
