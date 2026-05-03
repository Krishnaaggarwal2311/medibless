const Counter = require('./Counter');

/**
 * Atomically increment sequence for collection key (e.g. 'users', 'orders').
 * @param {string} name
 * @param {import('mongoose').ClientSession | null} [session]
 */
async function nextId(name, session = null) {
  /** @type {import('mongoose').QueryOptions} */
  const opts = { new: true, upsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, opts);
  return doc.seq;
}

module.exports = { nextId };
