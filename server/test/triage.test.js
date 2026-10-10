// Triage engine tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { analyse, compare } = require('../triage');

const T = (complaint, extra = {}) => analyse({ complaint, age: 40, ...extra });
const rankOf = (list) => list.map((p) => ({ ...p, triage: analyse(p) })).sort(compare).map((p) => p.name);

test('heavy bleeding after an accident is Emergency and outranks weakness and stroke', () => {
  const bleed = analyse({ name: 'Imran', age: 29, complaint: 'Road accident, heavy bleeding from the leg, in a lot of pain' });
  assert.strictEqual(bleed.level, 'Emergency');
  assert.match(bleed.decidingFactor.label, /bleeding/i);
  const order = rankOf([
    { name: 'Asha', age: 71, complaint: 'Fainted twice today, has known heart disease, feeling very weak', waitMins: 95 },
    { name: 'Prakash', age: 80, complaint: 'Sudden weakness on right side and slurred speech', waitMins: 20 },
    { name: 'Imran', age: 29, complaint: 'Road accident, heavy bleeding from the leg, in a lot of pain', waitMins: 12 },
    { name: 'Weak', age: 45, complaint: 'Feeling weak and tired since morning', waitMins: 200 },
  ]);
  assert.deepStrictEqual(order, ['Imran', 'Prakash', 'Asha', 'Weak']);
});

test('general weakness is not an emergency', () => {
  assert.strictEqual(T('Feeling weak and tired').level, 'Low');
  assert.strictEqual(T('Very weak, cannot stand').level, 'Medium');
});

test('one-sided weakness with slurred speech is a stroke emergency', () => {
  const r = T('Sudden weakness on right side and slurred speech', { age: 80 });
  assert.strictEqual(r.level, 'Emergency');
  assert.match(r.decidingFactor.label, /stroke/i);
});

test('negated symptoms are ignored', () => {
  const r = T('Palpitations since morning, feels dizzy, no chest pain', { age: 27 });
  assert.ok(!r.factors.some((f) => /chest pain/i.test(f.label)), 'chest pain should be ignored');
  assert.strictEqual(r.level, 'High');
  assert.strictEqual(T('Small cut on the finger, not bleeding now').factors.some((f) => /bleeding or uncontrolled/i.test(f.label)), false);
});

test('"bleeding has not stopped" is not treated as negated', () => {
  assert.strictEqual(T('Deep cut on the arm, bleeding has not stopped for 20 minutes').level, 'Emergency');
});

test('chest pain with warning signs is Emergency; alone is High', () => {
  assert.strictEqual(T('Severe chest pain spreading to left arm, sweating a lot', { age: 56 }).level, 'Emergency');
  assert.strictEqual(T('Chest pain since an hour', { age: 35 }).level, 'High');
});

test('vital signs alone can make a patient Emergency', () => {
  const r = T('Feels unwell', { vitals: { spo2: 86, pulse: 118, sbp: 104, rr: 28, temp: 38.9, avpu: 'A' } });
  assert.strictEqual(r.level, 'Emergency');
  assert.strictEqual(r.decidingFactor.source, 'Vital signs');
  const news = T('Mild cough', { vitals: { spo2: 93, pulse: 125, sbp: 100, rr: 23, temp: 38.5, avpu: 'A' } });
  assert.strictEqual(news.level, 'Emergency', 'NEWS2 >= 7 overrides mild wording');
  assert.strictEqual(news.vitals.news2, 2 + 2 + 2 + 2 + 1);
});

test('one red-zone vital sign makes a patient at least High', () => {
  assert.strictEqual(T('Headache', { vitals: { pulse: 135, spo2: 98, sbp: 130, rr: 16, temp: 37, avpu: 'A' } }).level, 'High');
});

test('minor problems are Low', () => {
  assert.strictEqual(T('Mild cough and cold for a few days, wants review', { age: 35 }).level, 'Low');
  assert.strictEqual(T('Back pain after lifting weights, mild', { age: 34 }).level, 'Low');
});

test('medical history raises related symptoms', () => {
  const r = T('Fell at home and hit her head', { age: 82, history: ['thinners'] });
  assert.strictEqual(r.level, 'Emergency');
  assert.strictEqual(T('Fainted twice today', { age: 50, history: ['heart'] }).level, 'High');
  assert.strictEqual(T('Light bleeding, 30 weeks pregnant', { age: 28 }).level, 'Emergency');
});

test('age is considered: infants and very old patients go up', () => {
  assert.strictEqual(T('Fever since morning', { age: 0.5 }).level, 'High');
  assert.strictEqual(T('Feeling weak and tired for one week, eating less', { age: 78 }).level, 'Medium');
});

test('pain score 8-10 is High', () => {
  assert.strictEqual(T('Back pain', { pain: 9 }).level, 'High');
});

test('wrong values are ignored with a warning, not a crash', () => {
  const r = T('Headache', { vitals: { pulse: 2000, spo2: 'abc' }, age: 'old', pain: 99 });
  assert.ok(r.warnings.length >= 3);
  assert.strictEqual(r.level, 'Low');
});

test('empty input never crashes and stays Low with low confidence', () => {
  for (const input of [{}, { complaint: '' }, { complaint: null, vitals: null }, { complaint: 'xyz' }]) {
    const r = analyse(input);
    assert.strictEqual(r.level, 'Low');
    assert.strictEqual(r.confidence.level, 'Low');
  }
});

test('common typos are understood', () => {
  assert.strictEqual(T('heavy bleding from head after bike accident').level, 'Emergency');
  assert.strictEqual(T('patient is unconcious').level, 'Emergency');
});

test('emergency order follows the clinical sequence', () => {
  const s = (c, extra) => analyse({ complaint: c, age: 40, ...extra }).score;
  assert.ok(s('Not breathing, no pulse') > s('Heavy bleeding from the thigh'));
  assert.ok(s('Heavy bleeding from the thigh') > s('Lips turning blue, gasping'));
  assert.ok(s('Lips turning blue, gasping') > s('Face drooping and slurred speech'));
  assert.ok(s('Face drooping and slurred speech') > s('Very weak, cannot stand'));
});

test('every result explains itself', () => {
  const r = T('Severe stomach pain on right lower side, vomiting', { age: 47 });
  assert.strictEqual(r.level, 'High');
  assert.ok(r.summary && r.decidingFactor && r.factors.length >= 2 && r.seeWithin && r.watch && r.confidence.reason);
});

// Many real-world wordings, so new records are categorised as reliably as the demo ones
const WORDINGS = {
  Emergency: ['Road accident, heavy bleeding from the leg', 'Cut his arm on glass, blood is spurting and will not stop', 'bleeding a lot from the head', 'losing a lot of blood',
    'the bleeding won\'t stop', 'blood soaked through the bandage', 'wound keeps bleeding and is not stopping', 'it is still bleeding', 'severe haemorrhage',
    'he is not breathing', 'collapsed and not responding', 'she can\'t breathe properly', 'gasping for air', 'lips are blue', 'face is drooping on one side',
    'left arm and leg suddenly weak', 'slurred speech since 20 minutes', 'having a fit right now', 'throat is swelling after eating peanuts', 'chest pain with sweating',
    'crushing chest pain going to the jaw', 'took 30 sleeping tablets', 'sudden worst headache of my life', 'hit his head and vomited twice', 'fever with stiff neck',
    '8 months pregnant and bleeding', 'vomiting blood', 'severe burns on face and chest'],
  High: ['chest pain', 'short of breath while walking', 'fell from the roof', 'confused since morning', 'fainted at home', 'severe abdominal pain', 'bone sticking out of the leg',
    'wants to kill himself', 'sugar is very high', 'pain 9/10 in the knee'],
  Medium: ['fever since two days', 'vomiting since morning', 'dizzy when standing', 'ankle sprain cannot walk on it', 'high blood pressure reading', 'stomach ache', 'small cut that is bleeding'],
  Low: ['mild cough', 'runny nose and sneezing', 'needs a prescription refill', 'feeling tired', 'feeling weak', 'mild back pain for weeks', 'headache',
    'small cut, not bleeding now', 'no bleeding', 'minor scratch, bleeding stopped', 'had a nosebleed, now stopped'],
};
for (const [want, list] of Object.entries(WORDINGS)) {
  test(`wordings that should be ${want}`, () => {
    for (const complaint of list) assert.strictEqual(analyse({ age: 40, complaint }).level, want, `"${complaint}"`);
  });
}
