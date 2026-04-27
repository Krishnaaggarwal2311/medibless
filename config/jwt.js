/**
 * Must match in sign and verify. Set JWT_SECRET in .env (required in production).
 */
function getJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set');
  }
  return 'medbless_dev_jwt_insecure_set_JWT_SECRET_in_env';
}

module.exports = { getJwtSecret };
