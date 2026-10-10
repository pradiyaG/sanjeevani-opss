// End-to-end API test on the hospital dataset. Start the server, then: BASE_URL=http://localhost:4000 npm run test:api
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:4000';
let failures = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failures += 1; };
async function call(method, p, body, token, raw) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': raw !== undefined ? 'text/csv' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const signIn = async (name, role, n) => (await call('POST', '/api/auth/signin', { name, email: `${name.split(' ')[0].toLowerCase()}@sanjeevani.org`, staffId: `SMH-1000${n}`, role })).data?.token;
const original = (f) => fs.readFileSync(path.join(__dirname, '..', 'data', 'original', f), 'utf8');

(async () => {
  check((await call('GET', '/api/health')).ok, 'health check');
  check((await call('POST', '/api/auth/signin', { name: 'A', email: 'a@b.co', staffId: 'SMH-10234', role: 'Nurse' })).error?.message === 'Please enter your full name.', 'sign-in: name required');
  check((await call('POST', '/api/auth/signin', { name: 'Asha', email: 'asha', staffId: 'SMH-10234', role: 'Nurse' })).error?.message === 'Please enter a valid work email.', 'sign-in: email checked');
  check((await call('POST', '/api/auth/signin', { name: 'Asha', email: 'asha@x.org', staffId: '12', role: 'Nurse' })).error?.message === 'Staff ID should look like SMH-10234.', 'sign-in: staff ID checked');
  check((await call('GET', '/api/overview')).status === 401, 'API requires a session');
  check((await call('GET', '/api/overview', null, 'forged.token')).status === 401, 'forged session refused');

  const sup = await signIn('Riya Sharma', 'Medical Superintendent', 1);
  const nurse = await signIn('Priya Nair', 'Nurse', 3);
  const lab = await signIn('Ravi Kulkarni', 'Lab Supervisor', 5);
  const front = await signIn('Vikram Singh', 'Front Office / Reception', 9);
  const shift = await signIn('Anita Desai', 'Shift Manager', 6);
  const dis = await signIn('Farah Khan', 'Discharge Coordinator', 8);
  check(!!(sup && nurse && lab && front && shift && dis), 'staff sign in with name, email, staff ID and role');
  check((await call('POST', '/api/demo/reset', {}, sup)).data?.snapshot === '2026-11-16 10:00', 'demo reset loads the dataset at the 10:00 snapshot');

  // Observe / decide
  const ov = (await call('GET', '/api/overview', null, sup)).data;
  check(ov.stats.edWait === 90 && ov.stats.edUsual === 35 && ov.stats.edWaiting === 9 && ov.stats.blocked === 6, 'overview figures come from the dataset (90 vs 35 min, 9 waiting, 6 beds blocked)');
  check(ov.issues[0].code === 'ed' && ov.issues[0].title === 'Emergency backed up by blocked beds, not patient volume', 'Emergency is the top issue');
  check(ov.departments.length === 10 && ov.departments[0].name === 'Emergency', '10 departments, Emergency under most pressure');
  check(ov.pending === 9, `9 proposed actions (got ${ov.pending})`);
  check((await call('GET', '/api/overview', null, nurse)).status === 403, 'nurse cannot open the Overview');

  // Reason / evaluate / explain
  const is = (await call('GET', '/api/issues', null, shift)).data.issues;
  check(is.every((i) => i.evidence.length && i.chain.length && i.options.length), 'every issue has a cause chain, options and evidence');
  check(is.find((i) => i.code === 'icu')?.why.includes('P1087'), 'ICU issue names the waiting P1 patient');

  // Screens
  const beds = (await call('GET', '/api/beds', null, nurse)).data;
  check(beds.wards.length === 7 && beds.discharges.length === 9 && beds.discharges.filter((d) => !d.blocked).length === 3, 'beds: 7 wards, 9 discharge requests, 3 leaving soon');
  const ds = (await call('GET', '/api/diagnostics-staff', null, sup)).data;
  check(ds.diagnostics.length === 11 && ds.doctors[0].name === 'Dr. Prakash Rao' && ds.roster.some((r) => r.status === 'Short by 1 doctor, 2 nurses'), 'diagnostics, doctors and roster tables');
  const cp = (await call('GET', '/api/complaints', null, front)).data;
  check(cp.feedback.length === 79 && cp.linked > 0, `complaints: 79 rows, ${cp.linked} linked to issues`);
  check((await call('GET', '/api/complaints', null, nurse)).status === 403, 'nurse cannot open Complaints');

  // Triage queue from the data
  const q0 = (await call('GET', '/api/patients', null, nurse)).data;
  check(q0.ranked.map((p) => p.name).join() === 'P1087,P1088' && q0.unassessed.length === 9, 'queue: ICU P1/P2 ranked, 9 ED patients need assessment');
  const un = q0.unassessed[0];
  check((await call('PATCH', `/api/patients/${un._id}`, { action: 'confirm' }, nurse)).status === 400, 'cannot confirm before assessing');
  check((await call('PATCH', `/api/patients/${un._id}`, { action: 'change', level: 'High', reason: 'Seen at bedside: chest pain, sweaty' }, nurse)).data?.level === 'High', 'nurse assesses a data patient as High');
  const bleed = (await call('POST', '/api/patients', { name: 'Test Bleed', age: 30, text: 'fell from bike, blood is gushing and will not stop', block: 'No bed free' }, front)).data;
  check(bleed.p.level === 'Emergency' && bleed.actionCreated, `new bleeding patient is Emergency at #${bleed.rank} with a priority action`);
  check((await call('POST', '/api/patients', { name: 'X Y', text: 'cough' }, lab)).status === 403, 'lab supervisor cannot register');

  // Act
  const A = (await call('GET', '/api/actions', null, sup)).data.actions;
  check(A[0].kind === 'triage' && A.some((a) => a.code === 'lab-escalate'), 'triage action on top; agent actions listed');
  check((await call('PATCH', '/api/actions/lab-escalate', { action: 'approve' }, front)).status === 403, 'reception cannot approve a lab escalation');
  check((await call('PATCH', '/api/actions/lab-escalate', { action: 'approve' }, lab)).data?.taskId === 'T-101', 'lab supervisor approves → task T-101');
  check((await call('PATCH', '/api/actions/ed-discharge', { action: 'reject', reason: 'no' }, dis)).status === 400, 'rejection needs a reason');

  // Data updates (the hour-14 file)
  check((await call('PUT', '/api/data/files/beds.csv', null, nurse, 'x')).status === 403, 'nurse cannot upload data');
  check((await call('PUT', '/api/data/files/beds.csv', null, sup, 'bed_id,ward\nA,B')).error?.message.includes('same columns'), 'wrong columns refused, nothing changed');
  const upd = original('discharge.csv').replace(/^(DR00[3-6],[^,]+,[^,]+,[^,]+,[^,]+),MRI report pending,Pending,Draft$/gm, '$1,None – leaving within the hour,Dispensed,Complete');
  const up = await call('PUT', '/api/data/files/discharge.csv', null, shift, upd);
  check(up.ok && up.data.changes.some((c) => /Beds held by stuck discharges: 6 → 2/.test(c)), `upload re-runs the agent: ${up.data?.changes?.join(' | ')}`);
  check((await call('GET', '/api/overview', null, sup)).data.stats.blocked === 2, 'overview shows the new figure');
  check((await call('GET', '/api/actions', null, sup)).data.actions.find((a) => a.code === 'lab-escalate')?.status === 'approved', 'approved decisions survive a data update');
  const t14 = await call('PUT', '/api/data/snapshot-time', { value: '2026-11-16 14:00' }, sup);
  check(t14.data?.now === '2026-11-16 14:00', 'snapshot time can be set to 14:00');
  check((await call('PUT', '/api/data/snapshot-time', { value: 'tomorrow' }, sup)).status === 400, 'bad time refused');
  const back = await call('POST', '/api/data/reset', {}, sup);
  check(back.data?.now === '2026-11-16 10:00', 'original dataset restored');
  const files = (await call('GET', '/api/data', null, shift)).data.files;
  check(files.length === 9 && files.every((f) => f.source === 'Original dataset'), 'data screen lists the nine files');
  check((await call('POST', '/api/demo/reset', {}, sup)).ok, 'demo data reset again');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
