// MongoDB collections (Mongoose).
// The nine dataset files are stored as they are (one document per file), so an updated file simply
// replaces its document. The agent's latest result is kept in `snapshots`; decisions people make
// (actions, patient priorities, audit log) live in their own collections and survive a data update.
const { Schema, model } = require('mongoose');

// One CSV file from the dataset: its rows exactly as read (column name -> text)
const DataFile = model('DataFile', new Schema({
  _id: String, // file name, e.g. "beds.csv"
  rows: { type: [Schema.Types.Mixed], default: [] },
  rowCount: Number, source: String, loadedAt: Date, loadedBy: String,
}, { minimize: false }));

// The agent's latest run (Observe → Explain), recomputed whenever data changes
const Snapshot = model('Snapshot', new Schema({ _id: String, at: Date, now: String, result: Schema.Types.Mixed, reason: String }, { minimize: false }));

// Settings such as the data snapshot time ("now" for the agent)
const Setting = model('Setting', new Schema({ _id: String, value: Schema.Types.Mixed }));

// kind decides which roles may approve it (see config.js); label is the small grey tag
const Action = model('Action', new Schema({
  code: { type: String, index: true }, issueCode: String, kind: String, label: String, title: String, owner: String,
  status: { type: String, enum: ['proposed', 'approved', 'done', 'rejected'], default: 'proposed' },
  taskId: String, by: String, reason: String, patientId: String, order: Number, createdAt: { type: Date, default: Date.now },
}));

// A waiting patient: from the dataset (source "dataset", e.g. ED patients with no bed) or registered on the Triage screen
const Patient = model('Patient', new Schema({
  source: { type: String, default: 'manual' }, patientId: String, ageGroup: String, priority: String,
  name: String, age: Number, via: String, dept: String, text: String, block: String,
  vitals: { spo2: Number, hr: Number, sys: Number, rr: Number },
  hist: [String], arrivedAt: Date, by: String,
  triage: Object, level: String, conf: String,
  change: { from: String, to: String, reason: String, by: String, at: Date },
  createdAt: { type: Date, default: Date.now },
}));

const User = model('User', new Schema({
  email: { type: String, unique: true, index: true }, name: String, staffId: String, role: String, createdAt: Date, lastLoginAt: Date,
}));
const AuditLog = model('AuditLog', new Schema({ at: { type: Date, default: Date.now }, by: String, role: String, text: String }));
const Counter = model('Counter', new Schema({ _id: String, seq: Number }));

module.exports = { DataFile, Snapshot, Setting, Action, Patient, User, AuditLog, Counter };
