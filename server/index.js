require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const M = require('./models');
const { ROLES, ROLE_NAMES } = require('./config');
const { seed } = require('./seed');
const store = require('./store');
const { NAMES } = require('./dataset');
const { signIn, requireAuth, needTab, publicUser } = require('./auth');
const { assess, clean, compare, rr, waitOf, LV, LEVELS, HIST, DEPTS, VIAS, BLOCKS } = require('./assess');

const app = express();
const log = (level, msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, status, message, field) => res.status(status).json({ ok: false, error: { message, code: status, field } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const logit = (req, text) => M.AuditLog.create({ by: req.user.name, role: req.user.role, text });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use('/api/data/files', express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '8mb' }));
app.use(express.json({ limit: '20kb' }));
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',') }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'" });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use('/api', (req, res, next) => { const t = Date.now(); res.on('finish', () => log(res.statusCode >= 500 ? 'error' : 'info', 'request', { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - t, user: req.user?.email })); next(); });
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'The request body is not valid JSON.');
  if (err.type === 'entity.too.large') return fail(res, 413, 'That file is too large (8 MB at most).');
  return next(err);
});

// ------------------------------------------------------------------ helpers
const approversOf = (kind) => ROLE_NAMES.filter((r) => ROLES[r].approve.includes(kind));
async function nextSeq(id) { const c = await M.Counter.findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { new: true, upsert: true }); return c.seq; }
const pending = () => M.Action.countDocuments({ status: 'proposed' });

// Waiting patients: assessed ones ranked into the queue, the rest listed for assessment
async function queue() {
  const snap = await store.latest();
  const now = Date.now(), dataNow = snap.nowMs;
  const all = (await M.Patient.find().lean()).map((p) => ({ ...p, wait: waitOf(p, now, dataNow) }));
  const ranked = all.filter((p) => p.level).sort((a, b) => compare(a, b, now, dataNow)).map((p, i) => ({ ...p, rank: i + 1 }));
  const unassessed = all.filter((p) => !p.level);
  return { ranked, unassessed, snapshot: snap.now };
}

// Operational next step for a waiting patient, from the latest data
async function advise(p) {
  const snap = await store.latest();
  const d = snap.departments.find((x) => x.name === p.dept) || snap.departments.find((x) => x.name === 'Emergency') || snap.departments[0];
  const spare = snap.doctors.filter((x) => x.status === 'Spare capacity').map((x) => x.name);
  const hi = LV[p.level] >= 3;
  const m = {
    'No bed free': d.freeBeds > 0 ? `${d.name} has ${d.freeBeds} free bed(s): allocate the next one to this patient.`
      : hi ? `${d.name} has 0 free beds. Ask Shift Manager to use beds freed by the stuck discharges first, and to review free beds in other wards (doctor confirms suitability).`
        : `${d.name} has 0 free beds. Keep on the waiting list and reassess in 60 minutes.`,
    'Bed booked': hi ? 'Review the booking order. A higher-priority patient should be placed first, subject to the treating doctor’s approval.' : 'Keep the existing booking and reassess later.',
    'Doctor busy': hi ? `Page the on-call ${d.name} doctor now and ask Department Head to reallocate a doctor with spare capacity.` : `Route to a doctor with spare capacity${spare.length ? ` (${spare.join(', ')})` : ''}.`,
    'Test pending': 'Escalate the pending test to Lab Supervisor as a priority request.',
    Other: 'Review with Shift Manager and note the reason.',
  };
  return m[p.block] || m.Other;
}

// ------------------------------------------------------------------ public routes
app.get('/api/health', (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503).json({ ok: db === 'up', data: { status: db === 'up' ? 'ok' : 'degraded', db, uptimeSeconds: Math.round(process.uptime()) } });
});
app.get('/api/auth/roles', (req, res) => ok(res, ROLE_NAMES));
app.post('/api/auth/signin', h(signIn));

// ------------------------------------------------------------------ signed-in routes
app.use('/api', requireAuth);
app.get('/api/auth/me', h(async (req, res) => ok(res, publicUser(req.user))));
app.get('/api/meta', h(async (req, res) => {
  const snap = await store.latest();
  ok(res, { pending: await pending(), now: snap.now, levels: LEVELS, hist: HIST, depts: DEPTS, vias: VIAS, blocks: BLOCKS });
}));

// OBSERVE → DECIDE: the overview
app.get('/api/overview', needTab('Overview'), h(async (req, res) => {
  const [snap, pend, patients] = await Promise.all([store.latest(), pending(), M.Patient.find({}, { level: 1 }).lean()]);
  ok(res, {
    now: snap.now, headline: snap.headline, stats: { ...snap.stats, crit: patients.filter((p) => LV[p.level] >= 3).length, unassessed: patients.filter((p) => !p.level).length },
    pending: pend, issues: snap.issues.map(({ actions, ...i }) => i), departments: snap.departments,
  });
}));

// REASON + EVALUATE + EXPLAIN: issues with cause chain, options and evidence
app.get('/api/issues', needTab('Issues'), h(async (req, res) => {
  const snap = await store.latest();
  const acts = await M.Action.find({ kind: { $ne: 'triage' } }, { code: 1, status: 1, taskId: 1, issueCode: 1 }).lean();
  ok(res, { now: snap.now, issues: snap.issues.map((i) => ({ ...i, actions: (i.actions || []).map((a) => ({ ...a, status: acts.find((x) => x.code === a.code)?.status || 'proposed' })) })) });
}));

// ACT: the action queue
app.get('/api/actions', needTab('Actions'), h(async (req, res) => {
  const [actions, logs] = await Promise.all([M.Action.find().sort({ createdAt: -1, order: 1 }).lean(), M.AuditLog.find().sort({ at: -1 }).limit(100).lean()]);
  ok(res, { actions: actions.map((a) => ({ ...a, canAct: req.perm.approve.includes(a.kind), approvers: approversOf(a.kind) })), log: logs });
}));
app.patch('/api/actions/:code', needTab('Actions'), h(async (req, res) => {
  const { action, reason } = req.body || {};
  const a = await M.Action.findOne({ code: String(req.params.code) });
  if (!a) return fail(res, 404, 'This action no longer exists. The latest data may have withdrawn it; refresh the list.');
  if (!req.perm.approve.includes(a.kind)) return fail(res, 403, 'Your role cannot approve this');
  if (action === 'approve') {
    if (a.status !== 'proposed') return fail(res, 409, `This action is already ${a.status}.`);
    Object.assign(a, { status: 'approved', taskId: `T-${await nextSeq('task')}`, by: req.user.name });
    await logit(req, `approved: ${a.title}`);
  } else if (action === 'reject') {
    if (a.status !== 'proposed') return fail(res, 409, `This action is already ${a.status}.`);
    const r = String(reason || '').trim();
    if (r.length < 5) return fail(res, 400, 'Please give a reason (at least a few words).', 'reason');
    Object.assign(a, { status: 'rejected', reason: r.slice(0, 300), by: req.user.name });
    await logit(req, `rejected: ${a.title}. Reason: ${a.reason}`);
  } else if (action === 'done') {
    if (a.status !== 'approved') return fail(res, 409, 'Only approved actions can be marked done.');
    a.status = 'done';
    await logit(req, `marked done: ${a.title}`);
  } else return fail(res, 400, 'Use approve, reject or done.');
  await a.save();
  ok(res, { code: a.code, status: a.status, taskId: a.taskId });
}));

// ---- Patient triage
app.get('/api/patients', needTab('Patient Triage'), h(async (req, res) => ok(res, await queue())));
app.post('/api/triage/preview', needTab('Patient Triage'), h(async (req, res) => {
  const p = clean(req.body);
  ok(res, p.text ? assess(p) : null);
}));
app.post('/api/patients', needTab('Patient Triage'), h(async (req, res) => {
  if (!req.perm.register) return fail(res, 403, 'Your role can view the queue but not register patients.');
  const f = clean(req.body);
  if (!f.name || !f.text) return fail(res, 400, 'Please enter the patient name and describe the problem in your own words.');
  const triage = assess(f);
  const p = await M.Patient.create({ ...f, source: 'manual', dept: triage.dept, triage, level: triage.level, conf: '', by: req.user.name, arrivedAt: new Date() });
  const { ranked: rk } = await queue();
  const i = rk.findIndex((x) => String(x._id) === String(p._id));
  const np = rk[i], up = rk[i - 1], dn = rk[i + 1];
  const tip = await advise(np);
  const q = [up ? `Ranked below ${up.name}: ${rr(up, np)}.` : 'Top of the queue.', dn ? `Ranked above ${dn.name}: ${rr(np, dn)}.` : ''].filter(Boolean).join(' ');
  await logit(req, `registered ${np.name}: AI priority ${np.level} (${triage.score})`);
  let actionCreated = false;
  if (LV[np.level] >= 3) {
    await M.Action.create({ code: `p${await nextSeq('action')}`, issueCode: 'ed', kind: 'triage', label: 'Priority bed', owner: 'Shift Manager', patientId: String(p._id), order: -1,
      title: `Priority placement for ${np.name} (${np.level}, ${np.dept}). ${tip}` });
    actionCreated = true;
  }
  ok(res, { p: np, rank: i + 1, n: rk.length, tip, q, actionCreated }, 201);
}));
app.patch('/api/patients/:id', needTab('Patient Triage'), h(async (req, res) => {
  if (!req.perm.clinical) return fail(res, 403, 'Only clinical staff can confirm or change a priority.');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'This patient is no longer in the queue.');
  const p = await M.Patient.findById(req.params.id);
  if (!p) return fail(res, 404, 'This patient is no longer in the queue.');
  const { action, level, reason } = req.body || {};
  if (action === 'confirm') {
    if (!p.level) return fail(res, 400, 'Assess this patient first: choose a category and give a reason.');
    p.conf = req.user.name;
    await logit(req, `confirmed priority for ${p.name}: ${p.level}`);
  } else if (action === 'change') {
    if (!LEVELS.includes(level)) return fail(res, 400, 'Choose Emergency, High, Medium or Low.', 'level');
    const r = String(reason || '').trim();
    if (r.length < 5) return fail(res, 400, 'A short written reason is required to change a priority.', 'reason');
    const from = p.level || 'Not assessed';
    await logit(req, `${p.level ? 'changed' : 'assessed'} ${p.name} from ${from} to ${level}. Reason: ${r}`);
    p.change = { from, to: level, reason: r.slice(0, 300), by: req.user.name, at: new Date() };
    if (!p.level) p.triage = { ...(p.triage || {}), score: store.BASE[level], deciding: `Assessed by ${req.user.name}: ${r.slice(0, 120)}`, why: [`Assessed by ${req.user.name}: ${r.slice(0, 120)}`, ...((p.triage && p.triage.why) || []).slice(1)] };
    p.level = level;
    p.conf = `${req.user.name} (changed)`;
    p.markModified('triage');
  } else return fail(res, 400, 'Use confirm or change.');
  await p.save();
  ok(res, { id: String(p._id), level: p.level, conf: p.conf });
}));

// ---- Operations data (all computed from the dataset)
app.get('/api/beds', needTab('Beds & Discharges'), h(async (req, res) => { const s = await store.latest(); ok(res, { now: s.now, wards: s.wards, discharges: s.discharges }); }));
app.get('/api/diagnostics-staff', needTab('Diagnostics & Staff'), h(async (req, res) => {
  const s = await store.latest();
  ok(res, { now: s.now, diagnostics: s.diagnostics, doctors: s.doctors, slots: s.slots, roster: s.roster });
}));
app.get('/api/complaints', needTab('Complaints'), h(async (req, res) => { const s = await store.latest(); ok(res, { now: s.now, feedback: s.feedback, linked: s.feedbackLinked }); }));

// ---- Dataset: view, replace a file (for example the hour-14 update), set the snapshot time, reset
const needData = (req, res, next) => (req.perm.data ? next() : fail(res, 403, 'Only the Medical Superintendent or Shift Manager can change the hospital data.'));
app.get('/api/data', needTab('Data'), h(async (req, res) => {
  const [files, set, auto, snap] = await Promise.all([store.filesInfo(), store.nowSetting(), store.autoNow(), M.Snapshot.findById('latest', { result: 0 }).lean()]);
  ok(res, { files, snapshotTime: set, autoTime: auto, now: snap?.now, lastRun: snap?.at, reason: snap?.reason });
}));
app.put('/api/data/files/:name', needTab('Data'), needData, h(async (req, res) => {
  const name = String(req.params.name);
  if (!NAMES.includes(name)) return fail(res, 400, `Unknown file "${name}". Expected one of: ${NAMES.join(', ')}.`);
  if (typeof req.body !== 'string' || !req.body.trim()) return fail(res, 400, 'The file is empty.');
  const r = await store.replaceFile(name, req.body, req.user.name);
  if (r.error) return fail(res, 400, r.error);
  await logit(req, `replaced ${name} (${r.before} → ${r.rows} rows); the agent re-ran on the new data`);
  ok(res, r);
}));
app.put('/api/data/snapshot-time', needTab('Data'), needData, h(async (req, res) => {
  const v = req.body?.value ? String(req.body.value).trim() : '';
  const r = await store.setNow(v, req.user.name);
  if (r.error) return fail(res, 400, r.error, 'value');
  await logit(req, v ? `set the data snapshot time to ${v}` : 'set the data snapshot time to automatic');
  ok(res, { now: r.result.now, changes: r.changes });
}));
app.post('/api/data/reset', needTab('Data'), needData, h(async (req, res) => {
  await store.loadOriginal(req.user.name);
  await M.Setting.deleteOne({ _id: 'snapshotTime' });
  const r = await store.refresh('original dataset restored', req.user.name);
  await logit(req, 'restored the original dataset files');
  ok(res, { now: r.result.now, changes: r.changes });
}));

// Full demo reset: original data, no decisions (Medical Superintendent only)
app.post('/api/demo/reset', h(async (req, res) => {
  if (!req.perm.admin) return fail(res, 403, 'Only the Medical Superintendent can reset the demo data.');
  const counts = await seed(req.user.name);
  await logit(req, 'reset the demo data');
  ok(res, counts);
}));

app.use('/api', (req, res) => fail(res, 404, 'Not found'));
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  log('error', err.message, { path: req.originalUrl, stack: err.stack?.split('\n').slice(0, 3).join(' | ') });
  fail(res, 500, 'Something went wrong on the server. Please try again.');
});

const PORT = process.env.PORT || 4000;
if (require.main === module || process.env.START_SERVER === '1') {
  mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sanjeevani')
    .then(async () => {
      if ((await M.DataFile.estimatedDocumentCount()) === 0) { await seed(); log('info', 'Empty database - hospital dataset loaded'); }
      else await store.latest();
      app.listen(PORT, () => log('info', `Sanjeevani Operations API on http://localhost:${PORT}`));
    })
    .catch((e) => { log('error', 'Could not start. Is MongoDB running?', { detail: e.message }); process.exit(1); });
}
module.exports = app;
