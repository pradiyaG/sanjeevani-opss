// Connects the Patient Triage form to the triage rules and returns what the screen shows:
// category, score, deciding factor, all factors, NEWS2 parts and what is not recorded.
const { analyse } = require('./triage');
const { analyse: design } = require('./design-triage');

const LV = { Emergency: 4, High: 3, Medium: 2, Low: 1 };
const LEVELS = ['Emergency', 'High', 'Medium', 'Low'];
const HIST = ['Heart disease', 'Blood thinners', 'Pregnancy', 'Diabetes', 'Lung disease', 'Cancer', 'Kidney disease', 'Previous stroke'];
const HIST_IDS = { 'Heart disease': 'heart', 'Blood thinners': 'thinners', Pregnancy: 'pregnant', Diabetes: 'diabetes', 'Lung disease': 'lung', Cancer: 'immuno', 'Kidney disease': 'kidney', 'Previous stroke': 'stroke' };
const { DEPARTMENT_NAMES: DEPTS } = require('./config');
const VIAS = ['Emergency', 'OPD', 'Referral'];
const BLOCKS = ['No bed free', 'Bed booked', 'Doctor busy', 'Test pending', 'Other'];

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));

// Accepts whatever the form sends and returns safe values (never throws)
function clean(b = {}) {
  const age = num(b.age);
  const v = b.vitals || b;
  return {
    name: String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    age: age !== undefined && age >= 0 && age <= 120 ? age : undefined,
    via: VIAS.includes(b.via) ? b.via : 'Emergency',
    dept: DEPTS.includes(b.dept) ? b.dept : 'Auto-detect',
    text: String(b.text || '').trim().slice(0, 600),
    block: BLOCKS.includes(b.block) ? b.block : 'No bed free',
    vitals: { spo2: num(v.spo2), hr: num(v.hr), sys: num(v.sys), rr: num(v.rr) },
    hist: (Array.isArray(b.hist) ? b.hist : []).filter((h) => HIST.includes(h)),
  };
}

// 1. The design's own rules decide the category, score and reasons (identical results to the HTML page).
// 2. Safety net: the stronger engine in triage.js (wider wording, typos, negation, NEWS2, child bands) also reads
//    the case. It only steps in when it finds a clear miss: an Emergency the rules did not see, or a case two
//    categories higher. Then it sets the category and says so in the reasons. It never lowers anything.
function assessRaw(p) {
  const v = p.vitals || {};
  const d = design({ text: p.text, age: p.age, hist: p.hist || [], dept: p.dept, spo2: v.spo2, hr: v.hr, sys: v.sys, rr: v.rr });
  let t = null;
  try {
    t = analyse({ name: p.name, age: p.age, arrival: p.via, complaint: p.text, vitals: { pulse: v.hr, spo2: v.spo2, sbp: v.sys, rr: v.rr },
      history: (p.hist || []).map((h) => HIST_IDS[h]).filter(Boolean) });
  } catch { t = null; }
  const gap = t ? LV[t.level] - LV[d.level] : 0;
  if (t && gap > 0 && (t.level === 'Emergency' || gap >= 2)) {
    const lvl = LV[t.level];
    const deciding = t.decidingFactor?.label || d.deciding;
    const score = [0, 0, 25, 50, 75][lvl] + Math.min(24, (d.score - [0, 0, 25, 50, 75][LV[d.level]]) + 4 + (lvl === 4 ? 6 : 0));
    const dept = p.dept && p.dept !== 'Auto-detect' ? p.dept : (t.dept || d.dept);
    return { ...d, level: t.level, score, deciding, dept, why: [...new Set([deciding, ...d.why.filter((w) => w !== 'No urgent signs found in the description' && !/priority one step$/.test(w)), `Safety check raised the category to ${t.level}`])], safetyNet: true };
  }
  return d;
}

// Departments outside this hospital's list (the design rules name Surgery, for example) go to Emergency
function assess(p) {
  const r = assessRaw(p);
  return DEPTS.includes(r.dept) ? r : { ...r, dept: 'Emergency' };
}

// Queue order, as in the design: category first, then score, then time waited (up to 30 points for 3 hours)
// Patients from the data are timed against the data snapshot; patients registered here against the clock.
const waitOf = (p, now = Date.now(), dataNow = now) => (p.arrivedAt ? Math.max(0, Math.round(((p.source === 'dataset' ? dataNow : now) - new Date(p.arrivedAt)) / 60000)) : null);
const key = (p, now, dataNow) => (LV[p.level] || 0) * 1000 + (p.triage?.score || 0) + Math.min(waitOf(p, now, dataNow) || 0, 180) / 6;
const compare = (a, b, now = Date.now(), dataNow = now) => key(b, now, dataNow) - key(a, now, dataNow);
// Why a sits above b. Same wording as the design; when a waited longer but has the lower score, it says so
// (the design page would print "higher score (90 vs 91)" in that case).
const rr = (a, b) => (LV[a.level] !== LV[b.level] ? `${a.level} outranks ${b.level}`
  : a.triage.score > b.triage.score ? `same category, higher score (${a.triage.score} vs ${b.triage.score})`
    : a.triage.score === b.triage.score ? 'same category and score, waited longer'
      : `same category, waited longer (${a.wait ?? '?'} vs ${b.wait ?? '?'} min)`);

module.exports = { assess, clean, compare, rr, waitOf, LV, LEVELS, HIST, DEPTS, VIAS, BLOCKS };
