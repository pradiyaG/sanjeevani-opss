// Loads the original hospital dataset (data/original/*.csv) into MongoDB and runs the agent.
// Clears actions, waiting patients and the audit log so a demo can start again. Signed-in staff are kept.
// Run: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const M = require('./models');
const store = require('./store');

async function seed(by = 'System') {
  await Promise.all([M.Action.deleteMany({}), M.Patient.deleteMany({}), M.AuditLog.deleteMany({}), M.Counter.deleteMany({}), M.Snapshot.deleteMany({}), M.Setting.deleteMany({})]);
  for (const id of ['task', 'action']) await M.Counter.updateOne({ _id: id }, { $set: { seq: 100 } }, { upsert: true });
  store.clearCache();
  await store.loadOriginal(by);
  const { result } = await store.refresh('original dataset loaded', by);
  return { files: 9, issues: result.issues.length, actions: result.actions.length, waiting: result.queuePatients.length, snapshot: result.now };
}

if (require.main === module) {
  mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sanjeevani')
    .then(() => seed())
    .then((counts) => { console.log('Dataset loaded:', counts); return mongoose.disconnect(); })
    .catch((e) => { console.error('Loading failed:', e.message); process.exit(1); });
}
module.exports = { seed };
