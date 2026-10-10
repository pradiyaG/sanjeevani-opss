// Loads the dataset from MongoDB, runs the agent and keeps everything that depends on the data in step:
// the latest snapshot, the proposed actions and the waiting patients that come from the data.
'use strict';
const M = require('./models');
const { NAMES, readFile, readOriginal, short, FILES } = require('./dataset');
const { run, ms, fmtStamp, defaultNow } = require('./agent');

const BASE = { Emergency: 90, High: 70, Medium: 45, Low: 20 };
let cache = null; // latest snapshot result, kept in memory for fast reads

async function tables() {
  const docs = await M.DataFile.find().lean();
  const t = {};
  for (const name of NAMES) t[short(name)] = (docs.find((x) => x._id === name) || { rows: [] }).rows;
  return t;
}

async function nowSetting() { const s = await M.Setting.findById('snapshotTime').lean(); return s?.value || null; }

// Triage details for a patient who comes from the data (no symptoms are recorded there)
function datasetTriage(q) {
  const lvl = q.level;
  return lvl ? {
    level: lvl, score: BASE[lvl], deciding: `Triage priority ${q.priority} recorded in admissions.csv`,
    why: [`Triage priority ${q.priority} recorded in admissions.csv`, q.text], news: null, missing: ['symptoms', 'vital signs'], dept: q.dept,
  } : {
    level: null, score: 0, deciding: 'No triage priority recorded in the data',
    why: ['No triage priority recorded in the data', 'A nurse or doctor must assess this patient'], news: null, missing: ['triage priority', 'symptoms', 'vital signs'], dept: q.dept,
  };
}

async function syncPatients(list, by) {
  const keep = new Set(list.map((q) => q.patientId));
  const gone = await M.Patient.find({ source: 'dataset', patientId: { $nin: [...keep] } }).lean();
  for (const g of gone) {
    await M.Patient.deleteOne({ _id: g._id });
    await M.AuditLog.create({ by, role: 'Agent', text: `${g.patientId} is no longer waiting in the latest data and left the queue` });
  }
  for (const q of list) {
    const p = await M.Patient.findOne({ source: 'dataset', patientId: q.patientId });
    if (!p) {
      await M.Patient.create({ source: 'dataset', patientId: q.patientId, name: q.patientId, ageGroup: q.ageGroup, priority: q.priority, via: q.via, dept: q.dept,
        text: q.text, block: q.block, arrivedAt: q.arrivedAt, by: 'Hospital data', triage: datasetTriage(q), level: q.level, conf: '', hist: [] });
    } else {
      Object.assign(p, { text: q.text, arrivedAt: q.arrivedAt, ageGroup: q.ageGroup, dept: q.dept });
      if (q.priority !== p.priority && !p.change?.by) { p.priority = q.priority; p.triage = datasetTriage(q); p.level = q.level; p.conf = ''; }
      await p.save();
    }
  }
}

async function syncActions(actions, by) {
  const codes = actions.map((a) => a.code);
  const stale = await M.Action.find({ status: 'proposed', kind: { $ne: 'triage' }, code: { $nin: codes } }).lean();
  for (const a of stale) {
    await M.Action.deleteOne({ _id: a._id });
    await M.AuditLog.create({ by, role: 'Agent', text: `withdrew a proposal the latest data no longer supports: ${a.title}` });
  }
  for (const a of actions) {
    const x = await M.Action.findOne({ code: a.code });
    if (!x) await M.Action.create({ ...a, status: 'proposed', createdAt: new Date(0) });
    else if (x.status === 'proposed') { Object.assign(x, { title: a.title, owner: a.owner, label: a.label, kind: a.kind, issueCode: a.issueCode, order: a.order }); await x.save(); }
  }
}

// What changed between two agent runs, in plain words
function diff(prev, next) {
  if (!prev) return [];
  const out = [];
  const pi = Object.fromEntries(prev.issues.map((i) => [i.code, i]));
  const ni = Object.fromEntries(next.issues.map((i) => [i.code, i]));
  for (const i of next.issues) {
    if (!pi[i.code]) out.push(`New issue: ${i.title} (score ${i.score})`);
    else if (pi[i.code].score !== i.score) out.push(`Changed: ${i.title} (score ${pi[i.code].score} → ${i.score})`);
    else if (pi[i.code].title !== i.title || pi[i.code].short !== i.short) out.push(`Updated: ${pi[i.code].title} → ${i.title}`);
  }
  for (const i of prev.issues) if (!ni[i.code]) out.push(`Cleared: ${i.title}`);
  const labels = { edWait: 'ED average wait today (min)', edWaiting: 'Patients waiting in ED with no bed', blocked: 'Beds held by stuck discharges', freeElsewhere: 'Free beds in other wards', overdue: 'Overdue test reports' };
  for (const [k, l] of Object.entries(labels)) if (prev.stats[k] !== next.stats[k]) out.push(`${l}: ${prev.stats[k]} → ${next.stats[k]}`);
  return out;
}

async function refresh(reason, by = 'System') {
  const t = await tables();
  const set = await nowSetting();
  const now = set ? ms(set) : defaultNow(t);
  const result = run(t, now);
  const prev = cache || (await M.Snapshot.findById('latest').lean())?.result || null;
  await M.Snapshot.findOneAndUpdate({ _id: 'latest' }, { at: new Date(), now: result.now, result, reason }, { upsert: true });
  cache = result;
  await syncActions(result.actions, by);
  await syncPatients(result.queuePatients, by);
  return { result, changes: diff(prev, result) };
}

async function latest() {
  if (cache) return cache;
  const s = await M.Snapshot.findById('latest').lean();
  if (s) { cache = s.result; return cache; }
  return (await refresh('first run')).result;
}

async function loadOriginal(by = 'System') {
  const all = readOriginal();
  for (const [name, rows] of Object.entries(all)) {
    await M.DataFile.findOneAndUpdate({ _id: name }, { rows, rowCount: rows.length, source: 'Original dataset', loadedAt: new Date(), loadedBy: by }, { upsert: true });
  }
}

// Replace one file with an updated version (same columns). Returns { error } or { rows, skipped, changes }.
async function replaceFile(name, text, by) {
  const r = readFile(name, text);
  if (r.error) return r;
  const before = await M.DataFile.findById(name).lean();
  await M.DataFile.findOneAndUpdate({ _id: name }, { rows: r.rows, rowCount: r.rows.length, source: 'Uploaded update', loadedAt: new Date(), loadedBy: by }, { upsert: true });
  const { changes } = await refresh(`${name} updated`, by);
  return { rows: r.rows.length, before: before?.rowCount ?? 0, skipped: r.skipped, changes };
}

async function filesInfo() {
  const docs = await M.DataFile.find({}, { rows: 0 }).lean();
  return NAMES.map((name) => { const x = docs.find((d) => d._id === name); return { name, columns: FILES[name].columns, rows: x?.rowCount ?? 0, source: x?.source || 'Missing', loadedAt: x?.loadedAt || null, loadedBy: x?.loadedBy || null }; });
}

async function setNow(value, by) {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) || !Number.isFinite(ms(value))) return { error: 'Use the format YYYY-MM-DD HH:MM, for example 2026-11-16 14:00.' };
    await M.Setting.findOneAndUpdate({ _id: 'snapshotTime' }, { value }, { upsert: true });
  } else await M.Setting.deleteOne({ _id: 'snapshotTime' });
  return refresh(value ? `snapshot time set to ${value}` : 'snapshot time set to automatic', by);
}

async function autoNow() { return fmtStamp(defaultNow(await tables())); }
const clearCache = () => { cache = null; };

module.exports = { refresh, latest, loadOriginal, replaceFile, filesInfo, setNow, nowSetting, autoNow, clearCache, BASE };
