// =============================================================================
// Sanjeevani Operations Agent: reads the nine dataset files and works through
//   Observe -> Reason -> Evaluate -> Decide -> Act -> Explain.
// Everything shown on the screens is computed here from the data. Nothing is typed in by hand,
// so when a file is replaced (for example the hour-14 update) every figure, issue and action changes with it.
// Rules are deterministic and explainable. Scores are demonstration settings, not hospital standards.
// =============================================================================
'use strict';

// ------------------------------------------------------------------ small helpers
const ms = (s) => { if (!s) return NaN; const t = Date.parse(String(s).trim().replace(' ', 'T') + (String(s).length <= 16 ? ':00Z' : 'Z')); return t; };
const fmtTime = (t) => new Date(t).toISOString().slice(11, 16);
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
const fmtStamp = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
const dur = (min) => { const m = Math.max(0, Math.round(min)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2, '0')} m` : `${h} h`; };
const num = (v) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const round = (v) => (v === null || v === undefined ? null : Math.round(v));
const by = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
const uniq = (a) => [...new Set(a)];
const list = (a, max = 4) => (a.length <= max ? a.join(', ') : `${a.slice(0, max).join(', ')} and ${a.length - max} more`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const EMOJI = { Emergency: '🚑', 'Critical Care': '🫁', 'General Medicine': '🩺', Cardiology: '❤️', Orthopaedics: '🦴', Paediatrics: '🧸', Gynaecology: '🤰', Neurology: '🧠', ENT: '👂', Dermatology: '🧴' };
const TYPE_DEPT = { Emergency: 'Emergency', ICU: 'Critical Care', General: 'General Medicine', Orthopaedic: 'Orthopaedics', Paediatric: 'Paediatrics', Maternity: 'Gynaecology' };
const P_LEVEL = { P1: 'Emergency', P2: 'High', P3: 'Medium', P4: 'Low' };

// Default "now": one hour after the latest Emergency waiting-time reading (10:00 for the original snapshot)
function defaultNow(d) {
  const t = (d.ed_wait_times || []).map((r) => ms(`${r.date} ${r.hour}`)).filter(Number.isFinite);
  return t.length ? Math.max(...t) + 3600e3 : Date.now();
}

// ------------------------------------------------------------------ OBSERVE
function observe(d, now) {
  const today = fmtDate(now);
  const patients = Object.fromEntries((d.patients || []).map((p) => [p.patient_id, p]));

  // Wards and the department each one serves (from admissions; bed type as a fallback)
  const wardDeptVotes = by((d.admissions || []).filter((a) => a.ward), (a) => a.ward);
  const wardDept = (ward, type) => {
    const v = wardDeptVotes[ward];
    if (v) { const c = by(v, (a) => a.department); return Object.keys(c).sort((x, y) => c[y].length - c[x].length)[0]; }
    return TYPE_DEPT[type] || ward;
  };

  // Discharge requests: blocked unless the only "task" is leaving and medication + documents are done
  const tests = d.diagnostics || [];
  const discharges = (d.discharge || []).map((r) => {
    const tasks = r.pending_tasks.split(/;\s*/).map((x) => x.trim()).filter(Boolean);
    const leaving = tasks.length === 0 || tasks.every((x) => /^none\b/i.test(x));
    const medsDone = /dispensed|done|complete/i.test(r.medication_status);
    const docsDone = /^complete/i.test(r.document_status);
    const blocked = !(leaving && medsDone && docsDone);
    const waiting = (now - ms(r.requested_time)) / 60000;
    const linkedTests = tests.filter((t) => t.patient_id === r.patient_id && !/completed/i.test(t.status));
    const waitingOn = blocked ? [...tasks.filter((x) => !/^none\b/i.test(x)), ...(!medsDone ? [`medication ${r.medication_status.toLowerCase()}`] : []), ...(!docsDone ? [`documents ${r.document_status.toLowerCase()}`] : [])] : [];
    return { ...r, tasks, blocked, leavingSoon: !blocked, waitingMin: waiting, waitingOn: uniq(waitingOn), linkedTests: linkedTests.map((t) => t.test_id) };
  });
  const dischargeByBed = Object.fromEntries(discharges.map((x) => [x.bed_id, x]));

  // Beds and wards
  const beds = (d.beds || []).map((b) => ({ ...b, free: /free|available/i.test(b.occupancy) || /available/i.test(b.admission_discharge_status), discharge: dischargeByBed[b.bed_id] || null }));
  const wards = Object.entries(by(beds, (b) => b.ward)).map(([name, bs], order) => {
    const dept = wardDept(name, bs[0].bed_type);
    const pending = bs.filter((b) => /discharge pending/i.test(b.admission_discharge_status) || b.discharge);
    const blocked = pending.filter((b) => !b.discharge || b.discharge.blocked);
    return { name, dept, type: bs[0].bed_type, total: bs.length, occupied: bs.filter((b) => !b.free).length, free: bs.filter((b) => b.free).length,
      blocked: blocked.length, blockedBeds: blocked.map((b) => b.bed_id), leaving: pending.length - blocked.length, freeBeds: bs.filter((b) => b.free).map((b) => b.bed_id), order };
  });

  // Overdue tests (not completed and past expected completion)
  const overdue = tests.filter((t) => !/completed/i.test(t.status) && ms(t.expected_completion) < now).map((t) => {
    const dis = discharges.find((x) => x.patient_id === t.patient_id && x.blocked);
    const bed = beds.find((b) => b.patient_id === t.patient_id);
    return { ...t, lateMin: (now - ms(t.expected_completion)) / 60000, holdsUp: dis ? `Discharge ${dis.request_id} (${dis.bed_id})` : bed ? `Patient in ${bed.bed_id}` : t.department, blocksDischarge: !!dis };
  }).sort((a, b) => b.lateMin - a.lateMin);

  // Emergency waiting time: today so far vs the usual for the previous days
  const ed = (d.ed_wait_times || []).map((r) => ({ t: ms(`${r.date} ${r.hour}`), date: r.date, hour: r.hour, v: num(r.ed_avg_wait_min) })).filter((r) => r.v !== null && r.t < now);
  const edToday = ed.filter((r) => r.date === today);
  const edBefore = ed.filter((r) => r.date < today);
  const edLatest = ed.length ? ed.reduce((a, b) => (b.t > a.t ? b : a)) : null;
  const edWait = { today: round(avg(edToday.map((r) => r.v))), usual: round(avg(edBefore.map((r) => r.v))), latest: edLatest ? edLatest.v : null, latestAt: edLatest ? edLatest.hour : null, days: uniq(edBefore.map((r) => r.date)).length, readingsToday: edToday.length };

  // Patients waiting for a bed
  const awaitingAdmission = (d.admissions || []).filter((a) => /awaiting/i.test(a.status)).map((a) => ({ ...a, patient: patients[a.patient_id] || null, waitingMin: (now - ms(a.admission_time)) / 60000 }));
  const waitingPatients = (d.patients || []).filter((p) => /wait|awaiting/i.test(p.status));
  const edWaiting = waitingPatients.filter((p) => /no bed/i.test(p.status) || (/emergency/i.test(p.department) && /wait/i.test(p.status)));

  // Appointments: today and the days before
  const appts = (d.appointments || []).map((a) => ({ ...a, t: ms(a.datetime), day: String(a.datetime).slice(0, 10), hour: String(a.datetime).slice(11, 13), wait: num(a.waiting_time_min) }));
  const apptToday = appts.filter((a) => a.day === today);
  const apptBefore = appts.filter((a) => a.day < today);

  // Staff on today's roster
  const staffToday = (d.staff || []).filter((s) => !s.date || s.date === today);
  const wardNames = Object.fromEntries((d.beds || []).map((b) => [b.ward, wardDept(b.ward, b.bed_type)]));
  // A department named after a ward (staff "ICU") is the department that ward serves ("Critical Care")
  const staff = (staffToday.length ? staffToday : (d.staff || [])).map((x) => (wardNames[x.department] && wardNames[x.department] !== x.department ? { ...x, department: wardNames[x.department] } : x));
  const doctorIds = uniq(staff.filter((s) => /doctor/i.test(s.role)).map((s) => s.staff_id));
  const doctors = doctorIds.map((id) => {
    const rows = staff.filter((s) => s.staff_id === id);
    const mine = apptToday.filter((a) => a.doctor === rows[0].name);
    const seen = mine.filter((a) => a.wait !== null && /completed|waiting/i.test(a.status));
    const usual = apptBefore.filter((a) => a.doctor === rows[0].name && a.wait !== null && /completed/i.test(a.status));
    const days = uniq(apptBefore.filter((a) => a.doctor === rows[0].name).map((a) => a.day)).length || 1;
    return {
      id, name: rows[0].name, dept: rows[0].department,
      onShift: rows.filter((r) => /available/i.test(r.availability)).map((r) => r.shift),
      onLeave: rows.filter((r) => /leave|absent|unavailable/i.test(r.availability)).map((r) => r.shift),
      assigned: Math.max(...rows.map((r) => num(r.patients_assigned) || 0)),
      today: mine.filter((a) => !/open slot|cancel/i.test(a.status)).length,
      waitingNow: mine.filter((a) => /waiting/i.test(a.status)).length,
      avgWait: round(avg(seen.map((a) => a.wait))),
      usualWait: round(avg(usual.map((a) => a.wait))),
      usualPerDay: Math.round(apptBefore.filter((a) => a.doctor === rows[0].name && !/open slot/i.test(a.status)).length / days),
      openSlots: mine.filter((a) => /open slot/i.test(a.status) && a.t >= now).map((a) => String(a.datetime).slice(11, 16)),
    };
  });
  doctors.forEach((doc) => {
    const peers = doctors.filter((x) => x.dept === doc.dept);
    const med = peers.map((x) => x.today).sort((a, b) => a - b)[Math.floor(peers.length / 2)] || 0;
    doc.status = (doc.waitingNow >= 10 || (doc.avgWait !== null && doc.avgWait >= 60) || (peers.length > 1 && doc.today >= 1.5 * med && doc.today >= 20)) ? 'Overloaded'
      : doc.openSlots.length ? 'Spare capacity' : (doc.avgWait !== null && doc.avgWait >= 35) ? 'Busy' : 'Normal';
  });

  // Recurring late hours per department (from completed appointments before today)
  const hotspots = [];
  for (const [dept, rows] of Object.entries(by(apptBefore.filter((a) => a.wait !== null && /completed/i.test(a.status)), (a) => a.department))) {
    const hours = Object.entries(by(rows, (a) => a.hour)).map(([h, r]) => ({ h, avg: avg(r.map((x) => x.wait)), n: r.length, days: uniq(r.map((x) => x.day)).length }));
    const typical = hours.map((x) => x.avg).sort((a, b) => a - b)[Math.floor(hours.length / 2)];
    for (const x of hours) if (x.avg >= 45 && x.avg >= 2 * typical) hotspots.push({ dept, hour: x.h, avg: Math.round(x.avg), typical: Math.round(typical), n: x.n, days: x.days });
  }

  // Appointment summary per department (all days in the file)
  const slots = Object.entries(by(appts, (a) => a.department)).map(([dept, rows]) => {
    const booked = rows.filter((a) => !/open slot/i.test(a.status));
    const done = rows.filter((a) => a.wait !== null && /completed/i.test(a.status));
    const t = rows.filter((a) => a.day === today);
    const hs = hotspots.filter((h) => h.dept === dept);
    const noShow = booked.length ? rows.filter((a) => /no-?show/i.test(a.status)).length / booked.length : 0;
    const cancel = booked.length ? rows.filter((a) => /cancel/i.test(a.status)).length / booked.length : 0;
    const waitNow = t.filter((a) => /waiting/i.test(a.status));
    const status = waitNow.length >= 10 ? 'Overloaded' : hs.length ? 'Late hour' : noShow >= 0.08 ? 'No-shows' : 'Normal';
    return { dept, today: t.filter((a) => !/open slot|cancel/i.test(a.status)).length, waitingNow: waitNow.length, open: t.filter((a) => /open slot/i.test(a.status)).length,
      avgWait: round(avg(done.map((a) => a.wait))), noShow: Math.round(noShow * 100), cancel: Math.round(cancel * 100), hotspot: hs[0] || null, status };
  }).sort((a, b) => a.dept.localeCompare(b.dept));

  // Shift cover: compare each shift with the best-covered shift of the same department and role
  const roster = [];
  for (const [dept, rows] of Object.entries(by(staff, (s) => s.department))) {
    const shifts = uniq(rows.map((r) => r.shift));
    const roles = uniq(rows.map((r) => r.role));
    const cap = {};
    roles.forEach((role) => { cap[role] = Math.max(0, ...shifts.map((sh) => rows.filter((r) => r.role === role && r.shift === sh).length)); });
    for (const sh of shifts) {
      const here = rows.filter((r) => r.shift === sh);
      const parts = roles.map((role) => {
        const rostered = here.filter((r) => r.role === role);
        const available = rostered.filter((r) => /available/i.test(r.availability));
        return { role, rostered: rostered.length, available: available.length, usual: cap[role], away: rostered.filter((r) => !/available/i.test(r.availability)).map((r) => `${r.name} (${r.availability.toLowerCase()})`) };
      }).filter((p) => p.usual > 0 && p.rostered > 0); // a role with nobody rostered on a shift (e.g. doctors at night) is how the roster is designed, not a gap
      const gaps = parts.filter((p) => p.available < p.usual);
      roster.push({ dept, shift: sh, parts, short: gaps.reduce((s, p) => s + p.usual - p.available, 0), gaps, status: gaps.length ? `Short by ${gaps.map((g) => `${g.usual - g.available} ${g.role.toLowerCase()}${g.usual - g.available > 1 ? 's' : ''}`).join(', ')}` : 'Full' });
    }
  }

  return { now, today, patients, wards, beds, discharges, overdue, edWait, awaitingAdmission, waitingPatients, edWaiting, appts, apptToday, doctors, hotspots, slots, roster, feedback: d.feedback || [], staff };
}

// ------------------------------------------------------------------ REASON + EVALUATE + DECIDE + ACT
// Each rule looks for one kind of problem. A rule only reports an issue when the data supports it.
function reason(o) {
  const issues = [];
  const add = (x) => issues.push(x);
  const wardOf = (dept) => o.wards.find((w) => w.dept === dept);
  const edWard = o.wards.find((w) => /^ed$|emergency/i.test(w.name) || w.dept === 'Emergency');
  const blockedDis = o.discharges.filter((x) => x.blocked);
  const leaving = o.discharges.filter((x) => !x.blocked);
  const edShort = o.roster.find((r) => r.dept === 'Emergency' && r.short > 0);

  // 1. Emergency backed up
  const edBlocked = edWard ? blockedDis.filter((x) => x.ward === edWard.name) : [];
  const edRatio = o.edWait.usual ? o.edWait.today / o.edWait.usual : 1;
  if (o.edWaiting.length || (edRatio >= 1.5 && o.edWait.today)) {
    const freeElsewhere = o.wards.filter((w) => w !== edWard && w.free > 0 && !/icu|critical|maternity|paediatric/i.test(`${w.name} ${w.type}`));
    const freeCount = freeElsewhere.reduce((s, w) => s + w.free, 0);
    const overdueIds = new Set(o.overdue.map((t) => t.test_id));
    const edTests = edBlocked.flatMap((x) => x.linkedTests).filter((id) => overdueIds.has(id)); // only reports that are actually late
    const chain = [];
    if (edTests.length) chain.push({ label: `Late ${uniq(o.overdue.filter((t) => edTests.includes(t.test_id)).map((t) => t.test)).join(', ') || 'test'} reports`, sub: 'Diagnostics' });
    if (edBlocked.length) chain.push({ label: 'Emergency discharges stuck', sub: `${plural(edBlocked.length, 'ED bed')} held` });
    chain.push({ label: `${edWard ? edWard.free : 0} free ED beds`, sub: `${plural(o.edWaiting.length, 'patient')} waiting, no bed` });
    chain.push({ label: `ED wait ${o.edWait.today} min`, sub: `usual ${o.edWait.usual} min` });
    const urgency = clamp(Math.round(2 + edRatio + o.edWaiting.length / 5), 1, 5);
    const impact = clamp(2 + Math.ceil(o.edWaiting.length / 4), 1, 5);
    const why = [
      `Emergency is averaging ${o.edWait.today} min today (latest ${o.edWait.latest} min at ${o.edWait.latestAt}) against a usual ${o.edWait.usual} min over the previous ${o.edWait.days} days.`,
      edWard ? `All ${edWard.total} ED beds are taken and ${plural(o.edWaiting.length, 'patient is', 'patients are')} waiting in Emergency with no bed.` : '',
      edBlocked.length ? `${edBlocked.length} of those ED beds (${list(edBlocked.map((x) => x.bed_id))}) belong to patients whose discharge was requested ${dur(Math.max(...edBlocked.map((x) => x.waitingMin)))} ago but is waiting on ${list(uniq(edBlocked.flatMap((x) => x.waitingOn)).map((s) => s.toLowerCase()))}.` : '',
      freeCount ? `Meanwhile ${plural(freeCount, 'bed')} ${freeCount === 1 ? 'is' : 'are'} free in ${list(freeElsewhere.map((w) => w.name))}.` : '',
      edShort ? `The ${edShort.shift.replace(/\s*\(.*/, '').toLowerCase()} Emergency shift is ${edShort.status.toLowerCase()}, so the queue is likely to grow later today.` : '',
    ].filter(Boolean).join(' ');
    const options = [];
    if (edBlocked.length) options.push({ id: 'ed-discharge', text: `Clear the ${plural(edBlocked.length, 'stuck ED discharge')} (chase ${edTests.length ? `reports ${list(edTests)}` : 'pending tasks'} and get summaries signed)`, effect: `${plural(edBlocked.length, 'ED bed')} free in about 1–2 h, no patient moved`, score: 9 });
    if (freeCount) options.push({ id: 'ed-bedreview', text: `Ask doctors to review ED patients for the ${plural(freeCount, 'free bed')} in ${list(freeElsewhere.map((w) => w.name))}`, effect: `Up to ${Math.min(freeCount, o.edWaiting.length)} patients placed; each move needs a doctor's sign-off`, score: 7 });
    if (edShort) options.push({ id: 'ed-cover', text: `Find cover for the ${edShort.shift} Emergency shift`, effect: 'Protects capacity later today; frees no beds now', score: 5 });
    add({ code: 'ed', emoji: '🚑', type: 'Patient flow', dept: 'Emergency', urgency, impact,
      title: edBlocked.length ? 'Emergency backed up by blocked beds, not patient volume' : 'Emergency backed up: patients waiting with no bed',
      short: `${o.edWait.today} min wait vs ${o.edWait.usual} usual`, why, chain, rootIndex: edBlocked.length ? chain.findIndex((c) => /discharges stuck/.test(c.label)) : chain.length - 2,
      options, chosen: options[0]?.id,
      evidence: [
        { source: 'ED WAIT', text: `Today ${o.edWait.today} min average over ${o.edWait.readingsToday} hourly readings; usual ${o.edWait.usual} min (ed_wait_times.csv)` },
        { source: 'PATIENTS', text: `${plural(o.edWaiting.length, 'patient')} "${o.edWaiting[0]?.status || 'waiting'}": ${list(o.edWaiting.map((p) => p.patient_id), 6)} (patients.csv)` },
        edWard ? { source: 'BEDS', text: `${edWard.name}: ${edWard.occupied} of ${edWard.total} occupied, ${edWard.free} free (beds.csv)` } : null,
        ...edBlocked.map((x) => ({ source: 'DISCHARGE', text: `${x.request_id} bed ${x.bed_id}, requested ${x.requested_time}: ${x.pending_tasks}; medication ${x.medication_status.toLowerCase()}, documents ${x.document_status.toLowerCase()} (discharge.csv)` })),
        freeCount ? { source: 'BEDS', text: `Free: ${list(freeElsewhere.flatMap((w) => w.freeBeds), 8)} (beds.csv)` } : null,
        edShort ? { source: 'STAFF', text: `Emergency ${edShort.shift}: ${edShort.parts.map((p) => `${p.available} of ${p.usual} ${p.role.toLowerCase()}s`).join(', ')}${edShort.gaps.flatMap((g) => g.away).length ? `; ${edShort.gaps.flatMap((g) => g.away).join(', ')}` : ''} (staff.csv)` } : null,
      ].filter(Boolean),
      actions: [
        edBlocked.length && { code: 'ed-discharge', kind: 'discharge', label: 'Task priority', owner: 'Discharge Coordinator',
          title: `Fast-track the ${plural(edBlocked.length, 'stuck Emergency discharge')} (${list(edBlocked.map((x) => `${x.request_id} ${x.bed_id}`))}): ${list(uniq(edBlocked.flatMap((x) => x.waitingOn)).map((s) => s.toLowerCase()))}` },
        freeCount && o.edWaiting.length && { code: 'ed-bedreview', kind: 'bed', label: 'Bed review', owner: 'Shift Manager + treating doctors',
          title: `Ask doctors whether any of the ${plural(o.edWaiting.length, 'patient')} waiting in Emergency can use the ${plural(freeCount, 'free bed')} in ${list(freeElsewhere.map((w) => w.name))} (doctors confirm suitability)` },
      ].filter(Boolean) });
  }

  // 2. Discharges stuck on pending tasks (whole hospital)
  if (blockedDis.length) {
    const longest = blockedDis.reduce((a, b) => (b.waitingMin > a.waitingMin ? b : a));
    const causes = by(blockedDis, (x) => x.waitingOn[0] || 'other');
    add({ code: 'discharge', emoji: '📄', type: 'Discharge', dept: wardOf('General Medicine') && blockedDis.some((x) => /general/i.test(x.ward)) ? 'General Medicine' : 'Hospital-wide',
      urgency: clamp(2 + Math.floor(longest.waitingMin / 360) + (blockedDis.length >= 4 ? 1 : 0), 1, 5), impact: clamp(1 + Math.ceil(blockedDis.length / 2), 1, 5),
      title: `${plural(blockedDis.length, 'discharge')} stuck on pending tasks`, short: `${plural(blockedDis.length, 'bed')} held · longest ${dur(longest.waitingMin)}`,
      why: `${plural(blockedDis.length, 'patient')} cleared to leave are still in a bed: ${Object.entries(causes).map(([c, xs]) => `${xs.length} waiting on ${c.toLowerCase()}`).join(', ')}. The longest (${longest.request_id}, ${longest.bed_id}) was requested ${dur(longest.waitingMin)} ago.${leaving.length ? ` ${plural(leaving.length, 'discharge')} in ${list(uniq(leaving.map((x) => x.ward)))} ${leaving.length === 1 ? 'is' : 'are'} complete and leaving within the hour, so ${leaving.length === 1 ? 'it is' : 'they are'} not flagged.` : ''}`,
      chain: [{ label: 'Pending reports, summaries, medication', sub: 'Task owners' }, { label: 'Bed held after clinical clearance', sub: `${plural(blockedDis.length, 'bed')}` }, { label: 'Admissions wait', sub: 'ED and ICU queue' }], rootIndex: 0,
      options: [
        { id: 'discharge', text: 'Fast-track each stuck task with its owner (reports, summaries, pharmacy)', effect: `${plural(blockedDis.length, 'bed')} released once staff confirm the bed is ready`, score: 8 },
        { id: 'discharge-wait', text: 'Wait for tasks to finish in the normal order', effect: 'No change today; beds stay held', score: 2 },
      ], chosen: 'discharge',
      evidence: blockedDis.map((x) => ({ source: 'DISCHARGE', text: `${x.request_id} ${x.ward} ${x.bed_id}: ${x.pending_tasks} · waiting ${dur(x.waitingMin)}` }))
        .concat(leaving.length ? [{ source: 'DISCHARGE', text: `${list(leaving.map((x) => x.request_id))}: "${leaving[0].pending_tasks}" (not flagged)` }] : []),
      actions: [{ code: 'discharge-fasttrack', kind: 'discharge', label: 'Task priority', owner: 'Discharge Coordinator',
        title: `Fast-track pending tasks for ${list(blockedDis.filter((x) => !edBlocked.includes(x)).map((x) => `${x.request_id} (${x.bed_id})`)) || 'the stuck discharges'}; staff confirm each bed is ready before it is reallocated` }].filter(() => blockedDis.some((x) => !edBlocked.includes(x))) });
  }

  // 3. Late diagnostic reports
  if (o.overdue.length) {
    const blocking = o.overdue.filter((t) => t.blocksDischarge);
    const worst = o.overdue[0];
    add({ code: 'diagnostics', emoji: '🧪', type: 'Diagnostics', dept: worst.department,
      urgency: clamp(2 + (blocking.length ? 1 : 0) + (worst.lateMin >= 360 ? 1 : 0) + (o.overdue.length >= 8 ? 1 : 0), 1, 5), impact: clamp(2 + Math.ceil(blocking.length / 3), 1, 5),
      title: `${plural(o.overdue.length, 'test report')} overdue, ${blocking.length} holding a discharge`, short: `Up to ${dur(worst.lateMin)} late`,
      why: `${plural(o.overdue.length, 'test')} are past their expected completion time. ${blocking.length ? `${list(blocking.map((t) => `${t.test} ${t.test_id}`))} ${blocking.length === 1 ? 'is' : 'are'} holding a discharge, so ${blocking.length === 1 ? 'a bed stays' : 'beds stay'} blocked until the report arrives. ` : ''}The most overdue is ${worst.test} ${worst.test_id} (${dur(worst.lateMin)} late). The data does not say why reports are late, so the agent does not guess a cause.`,
      chain: [{ label: `${plural(o.overdue.length, 'report')} overdue`, sub: 'Diagnostics' }, { label: `${plural(blocking.length, 'discharge')} waiting`, sub: 'Beds held' }, { label: 'Admissions delayed', sub: 'Downstream' }], rootIndex: 0,
      options: [
        { id: 'lab', text: `Escalate the ${plural(blocking.length || o.overdue.length, 'report')} that ${blocking.length ? 'hold a discharge' : 'are most overdue'} first`, effect: 'Releases beds as soon as results are signed', score: 8 },
        { id: 'lab-all', text: 'Escalate every overdue test in date order', effect: 'Treats bed-blocking reports like any other; slower to free beds', score: 4 },
      ], chosen: 'lab',
      evidence: o.overdue.slice(0, 8).map((t) => ({ source: 'DIAGNOSTICS', text: `${t.test_id} ${t.test} (${t.department}) ${t.status.toLowerCase()}, due ${t.expected_completion}, ${dur(t.lateMin)} late → ${t.holdsUp}` })),
      actions: [{ code: 'lab-escalate', kind: 'lab', label: 'Escalation', owner: 'Lab Supervisor',
        title: `Escalate overdue reports, bed-blocking first: ${list((blocking.length ? blocking : o.overdue).map((t) => `${t.test_id} ${t.test}`), 6)}` }] });
  }

  // 4. Critical-care bed shortage
  const icu = o.wards.find((w) => /icu|critical/i.test(`${w.name} ${w.type} ${w.dept}`));
  const icuWaiting = o.awaitingAdmission.filter((a) => icu && (a.ward === icu.name || /critical/i.test(a.department)));
  if (icu && icuWaiting.length) {
    const top = [...icuWaiting].sort((a, b) => String(a.triage_priority || 'P9').localeCompare(String(b.triage_priority || 'P9')))[0];
    const icuLeaving = o.discharges.filter((x) => x.ward === icu.name);
    add({ code: 'icu', emoji: '🫁', type: 'Bed allocation', dept: icu.dept, urgency: clamp(3 + (icu.free === 0 ? 1 : 0) + (top.triage_priority === 'P1' ? 1 : 0), 1, 5), impact: clamp(3 + icuWaiting.length, 1, 5),
      title: `${icu.name} full: ${plural(icuWaiting.length, 'critical patient')} waiting for a bed`, short: `${top.triage_priority || 'Unprioritised'} waiting ${dur(top.waitingMin)}`,
      why: `${icu.name} has ${icu.occupied} of ${icu.total} beds occupied and ${icu.free} free. ${list(icuWaiting.map((a) => `${a.patient_id} (${a.triage_priority || 'no priority'}, since ${String(a.admission_time).slice(11)})`))} ${icuWaiting.length === 1 ? 'is' : 'are'} waiting for an ICU bed. ${icuLeaving.length ? `${plural(icuLeaving.length, 'ICU discharge')} pending.` : 'No ICU discharge is pending, so no bed will free up on its own.'}`,
      chain: [{ label: `${icu.free} free ${icu.name} beds`, sub: `${icu.occupied}/${icu.total} occupied` }, { label: 'No ICU discharge pending', sub: 'No bed coming' }, { label: `${plural(icuWaiting.length, 'patient')} waiting`, sub: `top priority ${top.triage_priority || '-'}` }], rootIndex: icuLeaving.length ? 0 : 1,
      options: [
        { id: 'icu', text: 'Ask the ICU team to review step-down for the most stable ICU patients', effect: 'Can free a bed within hours; doctors decide who is safe to move', score: 8 },
        { id: 'icu-transfer', text: 'Escalate a transfer to a partner hospital', effect: 'Guarantees a bed but moves a critical patient; slower to arrange', score: 5 },
      ], chosen: 'icu',
      evidence: [{ source: 'BEDS', text: `${icu.name}: ${icu.occupied} of ${icu.total} occupied (beds.csv)` },
        ...icuWaiting.map((a) => ({ source: 'ADMISSIONS', text: `${a.admission_id} ${a.patient_id} ${a.status} since ${a.admission_time}, priority ${a.triage_priority || 'not recorded'} (admissions.csv)` })),
        { source: 'DISCHARGE', text: `${icuLeaving.length ? list(icuLeaving.map((x) => x.request_id)) : 'No'} ICU discharge requests (discharge.csv)` }],
      actions: [{ code: 'icu-stepdown', kind: 'bed', label: 'Bed review', owner: 'Shift Manager + ICU consultant',
        title: `Ask the ICU team to review step-down options so ${top.patient_id} (${top.triage_priority || 'critical'}, waiting ${dur(top.waitingMin)}) can get an ICU bed (doctors decide who is safe to move)` }] });
  }

  // 5. Overloaded doctors while a colleague has open slots
  for (const doc of o.doctors.filter((x) => x.status === 'Overloaded')) {
    const helpers = o.doctors.filter((x) => x.dept === doc.dept && x.id !== doc.id && x.openSlots.length);
    const others = o.doctors.filter((x) => x.dept === doc.dept && x.id !== doc.id);
    add({ code: `doctor-${doc.id}`, emoji: '👩‍⚕️', type: 'Staff workload', dept: doc.dept,
      urgency: clamp(2 + Math.floor((doc.avgWait || 0) / 40), 1, 5), impact: clamp(1 + Math.ceil(doc.waitingNow / 10), 1, 5),
      title: helpers.length ? `${doc.name} overloaded while ${helpers[0].name} has open slots` : `${doc.name} overloaded`,
      short: `${doc.today} patients today vs usual ${doc.usualPerDay}`,
      why: `${doc.name} (${doc.dept}) has ${doc.today} appointments today against a usual ${doc.usualPerDay} a day. ${doc.waitingNow} patients are waiting now, averaging ${doc.avgWait} min. ${helpers.length ? `${helpers.map((h) => `${h.name} has ${plural(h.openSlots.length, 'open slot')} from ${h.openSlots[0]} to ${h.openSlots[h.openSlots.length - 1]}`).join('; ')}.` : `Colleagues: ${others.map((x) => `${x.name} ${x.today} today`).join(', ') || 'none in this department'}.`}`,
      chain: [{ label: `${doc.today} bookings for one doctor`, sub: 'Overload' }, { label: `${doc.waitingNow} waiting, ${doc.avgWait} min`, sub: 'Delay' }, ...(helpers.length ? [{ label: `${helpers[0].openSlots.length} open slots unused`, sub: helpers[0].name }] : [])], rootIndex: 0,
      options: [
        helpers.length && { id: `doctor-${doc.id}`, text: `Offer waiting patients ${helpers[0].name}'s ${plural(helpers[0].openSlots.length, 'open slot')}`, effect: `Up to ${Math.min(helpers[0].openSlots.length, doc.waitingNow)} patients seen sooner, same department`, score: 8 },
        { id: `doctor-${doc.id}-wait`, text: 'Keep the bookings and extend the session', effect: 'Patients still wait; doctor works late', score: 3 },
      ].filter(Boolean), chosen: helpers.length ? `doctor-${doc.id}` : `doctor-${doc.id}-wait`,
      evidence: [{ source: 'APPOINTMENTS', text: `${doc.name}: ${doc.today} today, ${doc.waitingNow} with status Waiting, average wait ${doc.avgWait} min (appointments.csv)` },
        ...helpers.map((h) => ({ source: 'APPOINTMENTS', text: `${h.name}: open slots ${list(h.openSlots, 9)} (appointments.csv)` })),
        { source: 'STAFF', text: `${doc.name} has ${doc.assigned} patients assigned (staff.csv)` }],
      actions: helpers.length ? [{ code: `rebalance-${doc.id}`, kind: 'workload', label: 'Reallocation', owner: 'Department Head',
        title: `Offer up to ${Math.min(helpers[0].openSlots.length, doc.waitingNow)} of ${doc.name}'s waiting patients ${helpers[0].name}'s open slots (${helpers[0].openSlots[0]}–${helpers[0].openSlots[helpers[0].openSlots.length - 1]})` }] : [] });
  }

  // 6. A clinic hour that runs late every day (and the complaints that mention it)
  for (const h of o.hotspots) {
    const hh = `${h.hour}:00–${String(Number(h.hour) + 1).padStart(2, '0')}:00`;
    const mentions = o.feedback.filter((f) => f.department === h.dept && (String(f.comment).includes(`${h.hour}:00`) || /waiting/i.test(f.category)));
    add({ code: `slot-${h.dept}-${h.hour}`.toLowerCase().replace(/\s+/g, '-'), emoji: '📅', type: 'Appointments', dept: h.dept,
      urgency: clamp(1 + Math.floor(h.avg / 45), 1, 5), impact: clamp(1 + Math.ceil(mentions.length / 4), 1, 5),
      title: `${h.dept} ${hh} runs late every day`, short: `${h.avg} min wait vs ${h.typical} other hours`,
      why: `Across ${plural(h.days, 'day')}, ${h.dept} patients booked ${hh} waited ${h.avg} min on average, against ${h.typical} min in other hours. ${mentions.length ? `${plural(mentions.length, 'complaint')} about waiting in ${h.dept} ${mentions.length === 1 ? 'matches' : 'match'} this pattern.` : ''} The data shows the pattern but not its cause (for example ward rounds or late starts), so the action asks the team to check.`,
      chain: [{ label: `${hh} bookings`, sub: h.dept }, { label: `${h.avg} min average wait`, sub: 'Every day' }, { label: `${plural(mentions.length, 'complaint')}`, sub: 'Feedback' }], rootIndex: 0,
      options: [
        { id: `slot-${h.dept}`, text: `Spread ${hh} bookings over the next hours and check why this hour starts late`, effect: 'Shorter waits from tomorrow; needs the clinic to confirm the cause', score: 7 },
        { id: `slot-${h.dept}-none`, text: 'Leave the schedule unchanged', effect: 'Complaints continue', score: 2 },
      ], chosen: `slot-${h.dept}`,
      evidence: [{ source: 'APPOINTMENTS', text: `${h.n} completed ${hh} appointments: average wait ${h.avg} min; other hours ${h.typical} min (appointments.csv)` },
        ...mentions.slice(0, 4).map((f) => ({ source: 'FEEDBACK', text: `${f.feedback_id} ${f.date} ${f.severity}: ${f.comment || f.category} (feedback.csv)` }))],
      actions: [{ code: `resched-${h.dept}-${h.hour}`.toLowerCase().replace(/\s+/g, '-'), kind: 'sched', label: 'Rescheduling', owner: 'Front Office Manager',
        title: `Spread ${h.dept} ${hh} bookings across later slots and ask the clinic why this hour runs late` }] });
  }

  // 7. Short-staffed shifts
  const short = o.roster.filter((r) => r.short > 0);
  if (short.length) {
    const ed = short.find((r) => r.dept === 'Emergency');
    const firstShort = ed || short[0];
    add({ code: 'staffing', emoji: '🕒', type: 'Staffing', dept: firstShort.dept,
      urgency: clamp(2 + (ed ? 2 : 0), 1, 5), impact: clamp(2 + Math.min(2, short.reduce((s, r) => s + r.short, 0) - 1), 1, 5),
      title: short.length === 1 ? `${firstShort.dept} ${firstShort.shift.replace(/\s*\(.*/, '').toLowerCase()} shift short-staffed` : `${plural(short.length, 'shift')} short-staffed${ed ? `, including Emergency ${ed.shift.replace(/\s*\(.*/, '').toLowerCase()}` : ''}`,
      short: short.map((r) => `${r.dept} ${r.shift.replace(/\s*\(.*/, '').toLowerCase()}: ${r.status.toLowerCase()}`).join(' · '),
      why: short.map((r) => `${r.dept} ${r.shift}: ${r.parts.map((p) => `${p.available} of ${p.usual} ${p.role.toLowerCase()}s`).join(', ')}${r.gaps.flatMap((g) => g.away).length ? ` (${r.gaps.flatMap((g) => g.away).join(', ')})` : ''}.`).join(' ') + ' "Usual" is the best-covered shift of the same department today. The agent recommends asking for cover; it never reassigns staff itself.',
      chain: [{ label: 'Rostered below usual cover', sub: 'Short' }, { label: 'Fewer staff at the busiest time', sub: 'Risk' }], rootIndex: 0,
      options: [
        { id: 'staffing', text: `Ask the Nursing Head and Shift Manager to find cover before the shift starts`, effect: 'Keeps usual cover; needs someone available', score: 7 },
        { id: 'staffing-none', text: 'Run the shift short', effect: 'Longer waits and more pressure on staff', score: 2 },
      ], chosen: 'staffing',
      evidence: short.map((r) => ({ source: 'STAFF', text: `${r.dept} ${r.shift}: ${r.status} (staff.csv)` })),
      actions: [{ code: 'staff-cover', kind: 'staff', label: 'Staff reallocation', owner: 'Nursing Head',
        title: `Find cover for ${short.map((r) => `${r.dept} ${r.shift} (${r.status.replace(/^Short by /, '')})`).join('; ')} and confirm with the Shift Manager` }] });
  }

  // 8. Complaints that trace back to the issues above (linked in explain())
  return issues;
}

// Which issue (if any) a complaint points to
function linkFeedback(f, issues) {
  const cat = `${f.category}`.toLowerCase();
  const pick = (pred) => issues.find(pred) || null;
  if (/waiting/.test(cat)) {
    return pick((i) => i.code.startsWith('slot-') && i.dept === f.department && (!f.comment || /\d\d:00/.test(f.comment)))
      || pick((i) => i.code.startsWith('doctor-') && i.dept === f.department)
      || (f.department === 'Emergency' ? pick((i) => i.code === 'ed') : null)
      || pick((i) => i.code.startsWith('slot-') && i.dept === f.department);
  }
  if (/discharge/.test(cat)) return pick((i) => i.code === 'discharge');
  return null;
}

// ------------------------------------------------------------------ EXPLAIN: everything the screens show
function run(d, nowArg) {
  const now = Number.isFinite(nowArg) ? nowArg : defaultNow(d);
  const o = observe(d, now);
  let issues = reason(o);

  // Complaints
  const feedback = o.feedback.map((f, order) => { const i = linkFeedback(f, issues); return { ...f, issueCode: i ? i.code : null, issue: i ? i.title : null, order }; });
  const linked = feedback.filter((f) => f.issueCode);
  const openLinked = linked.filter((f) => !/resolved|closed/i.test(f.resolution_status));
  if (linked.length) {
    const cats = by(linked, (f) => f.category);
    issues.push({ code: 'feedback', emoji: '💬', type: 'Feedback', dept: 'Hospital-wide', urgency: clamp(1 + Math.ceil(openLinked.length / 6), 1, 5), impact: 3,
      title: `${linked.length} of ${feedback.length} complaints trace to operations`, short: Object.entries(cats).map(([c, xs]) => `${xs.length} ${c.toLowerCase()}`).join(', '),
      why: `${linked.length} complaints match an operational issue the agent found (${Object.entries(cats).map(([c, xs]) => `${xs.length} about ${c.toLowerCase()}`).join(', ')}). The other ${feedback.length - linked.length} are about food, billing, cleanliness or staff behaviour, or have no matching issue, so they are left to the usual teams.`,
      chain: [{ label: 'Complaints', sub: 'Symptom' }, { label: 'Linked to waits and discharges', sub: 'Root cause' }], rootIndex: 1,
      options: [{ id: 'feedback', text: 'Tell Patient Relations which fixes address which complaints', effect: 'Families get a real answer; no extra work for wards', score: 6 }], chosen: 'feedback',
      evidence: Object.entries(by(linked, (f) => f.issue)).map(([t, xs]) => ({ source: 'FEEDBACK', text: `${xs.length} → ${t}` })),
      actions: [{ code: 'complaints-summary', kind: 'complaint', label: 'Escalation', owner: 'Front Office Manager', title: `Send Patient Relations a summary linking ${openLinked.length} open complaints to the fixes in progress` }] });
  }

  // DECIDE: rank by urgency × impact
  const TIE = ['ed', 'icu', 'discharge', 'diagnostics', 'doctor', 'staffing', 'slot', 'feedback'];
  const tie = (c) => { const k = TIE.findIndex((x) => c === x || c.startsWith(`${x}-`)); return k < 0 ? 99 : k; };
  issues = issues.map((i) => ({ ...i, score: i.urgency * i.impact })).sort((a, b) => b.score - a.score || tie(a.code) - tie(b.code) || a.code.localeCompare(b.code))
    .map((i, n) => ({ ...i, rank: n + 1, level: i.score >= 20 ? 'Urgent' : i.score >= 12 ? 'Soon' : 'Routine' }));
  const actions = issues.flatMap((i, n) => (i.actions || []).map((a, k) => ({ ...a, issueCode: i.code, order: n * 10 + k })));

  // Departments (tiles on the Overview)
  const deptNames = uniq([...o.wards.map((w) => w.dept), ...o.slots.map((s) => s.dept), ...o.roster.map((r) => r.dept)]);
  const pendingFor = (dept) => o.overdue.filter((t) => t.department === dept).length + o.discharges.filter((x) => x.blocked && o.wards.find((w) => w.name === x.ward)?.dept === dept).length;
  const departments = deptNames.map((name) => {
    const ward = o.wards.filter((w) => w.dept === name);
    const slot = o.slots.find((s) => s.dept === name);
    const docs = o.doctors.filter((x) => x.dept === name);
    const nowShift = o.roster.filter((r) => r.dept === name);
    const isEd = name === 'Emergency';
    const avgWait = isEd ? o.edWait.today : (docs.length ? round(avg(docs.filter((x) => x.avgWait !== null).map((x) => x.avgWait))) : null);
    const usual = isEd ? o.edWait.usual : slot?.avgWait ?? null;
    const waiting = isEd ? o.edWaiting.length : (/critical/i.test(name) ? o.awaitingAdmission.filter((a) => a.department === name).length : slot?.waitingNow || 0);
    const total = ward.reduce((s, w) => s + w.total, 0), free = ward.reduce((s, w) => s + w.free, 0);
    const awaitingBed = isEd ? o.edWaiting.length : o.awaitingAdmission.filter((a) => a.department === name).length;
    const occ = total ? (total - free) / total : 0;
    const ratio = avgWait && usual ? Math.min(avgWait / usual, 3) : 1;
    const heat = Math.min(100, Math.round((ratio - 1) / 2 * 45 + occ * 30 + Math.min(awaitingBed + waiting, 12) * 2 + pendingFor(name) * 2 + (total && free === 0 && awaitingBed ? 20 : 0)));
    const short = nowShift.filter((r) => r.short > 0).length;
    return { name, emoji: EMOJI[name] || '🏥', avgWait, usual, waiting, totalBeds: total, freeBeds: free, awaitingBed, heat: Math.max(0, heat), pending: pendingFor(name),
      doctors: docs.length, shortShifts: short, wards: ward.map((w) => w.name) };
  }).sort((a, b) => b.heat - a.heat);

  // Triage queue entries that come from the data
  const queuePatients = [
    ...o.awaitingAdmission.map((a) => ({ patientId: a.patient_id, ageGroup: a.patient?.age_group || '', dept: a.department, via: a.patient?.visit_type || 'Admission',
      text: `${a.status} in ${a.ward} since ${String(a.admission_time).slice(11)} (${a.department}${a.patient?.age_group ? `, age group ${a.patient.age_group}` : ''})`,
      arrivedAt: new Date(ms(a.admission_time)), priority: a.triage_priority || '', level: P_LEVEL[a.triage_priority] || null, block: 'No bed free' })),
    ...o.edWaiting.filter((p) => !o.awaitingAdmission.some((a) => a.patient_id === p.patient_id)).map((p) => ({ patientId: p.patient_id, ageGroup: p.age_group, dept: p.department, via: p.visit_type,
      text: `${p.status} (${p.department}, age group ${p.age_group})`, arrivedAt: null, priority: '', level: null, block: 'No bed free' })),
  ];

  const blockedBeds = o.wards.reduce((s, w) => s + w.blocked, 0);
  const freeElsewhere = o.wards.filter((w) => w.dept !== 'Emergency' && !/icu|critical|maternity|paediatric/i.test(`${w.name} ${w.type}`)).reduce((s, w) => s + w.free, 0);
  const top = issues[0];
  return {
    now: fmtStamp(now), nowMs: now, generatedAt: new Date().toISOString(),
    headline: blockedBeds && o.edWaiting.length ? { h1: 'Blocked beds,<br>not busy wards', lead: `Emergency is waiting ${o.edWait.today} min against a usual ${o.edWait.usual}. ${plural(blockedBeds, 'bed')} ${blockedBeds === 1 ? 'is' : 'are'} held by stuck discharges and ${plural(freeElsewhere, 'bed')} ${freeElsewhere === 1 ? 'is' : 'are'} free in other wards. Clear the stuck discharges first and the wait falls fastest.` }
      : { h1: top ? 'Where the<br>hospital is stuck' : 'No blocking<br>issues found', lead: top ? `${top.title}. ${top.short}.` : 'The latest data shows no operational issue that needs action.' },
    stats: { edWait: o.edWait.today, edUsual: o.edWait.usual, edLatest: o.edWait.latest, edLatestAt: o.edWait.latestAt, edWaiting: o.edWaiting.length, blocked: blockedBeds, freeElsewhere, overdue: o.overdue.length },
    issues, actions, departments,
    wards: o.wards.map((w) => ({ ...w, note: [w.free ? `${w.free} free` : '0 free', w.blocked ? `${w.blocked} held by a stuck discharge` : '', w.leaving ? `${w.leaving} leaving within the hour` : '', w.dept === 'Emergency' && o.edWaiting.length ? `${o.edWaiting.length} waiting with no bed` : '', o.awaitingAdmission.filter((a) => a.ward === w.name).length ? `${o.awaitingAdmission.filter((a) => a.ward === w.name).length} awaiting a bed` : ''].filter(Boolean).join(' · ') })),
    discharges: o.discharges.map((x) => ({ code: x.request_id, patient: x.patient_id, bed: x.bed_id, ward: x.ward, waitingOn: x.blocked ? x.pending_tasks : 'Nothing: leaving within the hour', medication: x.medication_status, documents: x.document_status, delay: dur(x.waitingMin), blocked: x.blocked })),
    diagnostics: o.overdue.map((t) => ({ code: t.test_id, test: t.test, dept: t.department, patient: t.patient_id, status: t.status, lateBy: `+${dur(t.lateMin)}`, holdsUp: t.holdsUp })),
    doctors: o.doctors.map((x) => ({ name: x.name, dept: x.dept, today: x.today, waiting: x.waitingNow, avgWait: x.avgWait, open: x.openSlots.length, status: x.status })).sort((a, b) => (b.status === 'Overloaded') - (a.status === 'Overloaded') || b.today - a.today),
    slots: o.slots.map((s) => ({ ...s, label: s.hotspot ? `${s.dept} (late ${s.hotspot.hour}:00–${String(Number(s.hotspot.hour) + 1).padStart(2, '0')}:00)` : s.dept })),
    roster: o.roster.map((r) => ({ dept: r.dept, shift: r.shift, doctors: r.parts.find((p) => /doctor/i.test(p.role)) || null, nurses: r.parts.find((p) => /nurse/i.test(p.role)) || null, status: r.status, away: r.parts.flatMap((p) => p.away) })),
    feedback, feedbackLinked: linked.length,
    queuePatients,
    counts: { patients: Object.keys(o.patients).length, beds: o.beds.length, appointments: o.appts.length, tests: (d.diagnostics || []).length },
  };
}

module.exports = { run, observe, reason, defaultNow, ms, dur, fmtStamp, P_LEVEL };
