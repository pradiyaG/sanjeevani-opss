// Tests for the operations agent on the real dataset, plus "hour 14" style updates.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { readOriginal, readFile, short, parseCsv } = require('../dataset');
const { run, ms } = require('../agent');

const original = () => Object.fromEntries(Object.entries(readOriginal()).map(([k, v]) => [short(k), v.map((r) => ({ ...r }))]));
const codes = (r) => r.issues.map((i) => i.code);

test('reads all nine files with the documented row counts', () => {
  const d = original();
  const counts = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length]));
  assert.deepStrictEqual(counts, { admissions: 79, appointments: 4145, beds: 89, diagnostics: 71, discharge: 9, ed_wait_times: 184, feedback: 79, patients: 88, staff: 131 });
});

test('CSV reader handles quotes, commas and line breaks inside fields', () => {
  assert.deepStrictEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n"1\n2",3\r\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1\n2', '3']]);
});

test('an updated file must keep the same columns', () => {
  assert.match(readFile('beds.csv', 'bed_id,ward\nX,Y').error, /same columns/);
  assert.match(readFile('nope.csv', 'a\n1').error, /Unknown file/);
  assert.strictEqual(readFile('discharge.csv', 'request_id,patient_id,ward,bed_id,requested_time,pending_tasks,medication_status,document_status\nDR1,P1,ED,ED-01,2026-11-16 05:00,x,Pending,Draft').rows.length, 1);
});

test('snapshot time defaults to one hour after the latest ED reading (10:00)', () => {
  assert.strictEqual(run(original()).now, '2026-11-16 10:00');
});

test('observes the key facts in the data', () => {
  const r = run(original());
  assert.strictEqual(r.stats.edWait, 90);
  assert.strictEqual(r.stats.edUsual, 35);
  assert.strictEqual(r.stats.edWaiting, 9);
  assert.strictEqual(r.stats.blocked, 6, 'ED-06, ED-07 and four General Ward beds');
  assert.strictEqual(r.stats.overdue, 11);
  const ed = r.wards.find((w) => w.name === 'ED');
  assert.deepStrictEqual([ed.total, ed.free, ed.blocked], [7, 0, 2]);
  const paed = r.discharges.filter((x) => x.ward === 'Paediatric Ward');
  assert.ok(paed.length === 3 && paed.every((x) => !x.blocked), 'discharges leaving within the hour are not flagged');
});

test('finds the planted problems and ranks Emergency first', () => {
  const r = run(original());
  assert.deepStrictEqual(codes(r).slice(0, 2), ['ed', 'icu']);
  for (const c of ['discharge', 'diagnostics', 'doctor-D03', 'staffing', 'feedback', 'slot-orthopaedics-10']) assert.ok(codes(r).includes(c), `missing ${c}`);
  const ed = r.issues[0];
  assert.match(ed.why, /ED-06, ED-07/);
  assert.ok(ed.chain[ed.rootIndex].label.includes('discharges stuck'), 'root cause is the stuck discharges');
  assert.ok(ed.options.length >= 2 && ed.chosen === 'ed-discharge', 'Evaluate compares options and chooses one');
  assert.match(r.issues.find((i) => i.code === 'doctor-D03').title, /Prakash Rao.*Anita Menon/);
  assert.match(r.issues.find((i) => i.code === 'staffing').title, /Emergency evening/);
  assert.ok(!r.roster.some((x) => /Night/.test(x.shift) && x.status !== 'Full'), 'doctors not rostered at night is not a gap');
  assert.ok(r.issues.every((i) => i.evidence.length && i.score === i.urgency * i.impact));
});

test('every action has an owner and a kind someone can approve', () => {
  const r = run(original());
  assert.ok(r.actions.length >= 8);
  const kinds = ['discharge', 'lab', 'bed', 'staff', 'workload', 'sched', 'complaint'];
  assert.ok(r.actions.every((a) => a.owner && kinds.includes(a.kind) && a.title.length > 20));
  assert.strictEqual(new Set(r.actions.map((a) => a.code)).size, r.actions.length, 'action codes are unique');
});

test('waiting patients come from the data: 2 ICU with P1/P2, 9 ED with no recorded priority', () => {
  const r = run(original());
  const icu = r.queuePatients.filter((q) => q.priority);
  assert.deepStrictEqual(icu.map((q) => `${q.patientId}:${q.level}`), ['P1087:Emergency', 'P1088:High']);
  assert.strictEqual(r.queuePatients.filter((q) => !q.level).length, 9);
});

test('hour-14 style update: the MRI reports arrive and the General Ward discharges complete', () => {
  const d = original();
  d.diagnostics.forEach((t) => { if (t.test === 'MRI' && t.status === 'Report pending') t.status = 'Completed'; });
  d.discharge.forEach((x) => { if (/MRI/.test(x.pending_tasks)) Object.assign(x, { pending_tasks: 'None – leaving within the hour', medication_status: 'Dispensed', document_status: 'Complete' }); });
  const r = run(d, ms('2026-11-16 14:00'));
  assert.strictEqual(r.now, '2026-11-16 14:00');
  assert.strictEqual(r.stats.blocked, 2, 'only the two ED beds stay blocked');
  assert.match(r.issues.find((i) => i.code === 'discharge').title, /^2 discharges/);
});

test('update that clears Emergency: beds free, nobody waiting, waits normal', () => {
  const d = original();
  d.patients.forEach((p) => { if (/no bed/i.test(p.status)) p.status = 'In bed'; });
  d.ed_wait_times.forEach((x) => { if (x.date === '2026-11-16') x.ed_avg_wait_min = '30'; });
  d.discharge = d.discharge.filter((x) => x.ward !== 'ED');
  d.beds.forEach((b) => { if (b.bed_id === 'ED-06' || b.bed_id === 'ED-07') Object.assign(b, { occupancy: 'Free', patient_id: '', admission_discharge_status: 'Available' }); });
  const r = run(d);
  assert.ok(!codes(r).includes('ed'), 'no Emergency issue when the data no longer supports it');
  assert.strictEqual(r.stats.edWaiting, 0);
});

test('a doctor going on leave shows up as a staffing gap', () => {
  const d = original();
  d.staff.forEach((s) => { if (s.name === 'Dr. Pooja Joshi' && /Evening/.test(s.shift)) s.availability = 'On leave'; });
  const r = run(d);
  assert.ok(r.roster.some((x) => x.dept === 'General Medicine' && /Evening/.test(x.shift) && x.status === 'Short by 1 doctor'));
});
