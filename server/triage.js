// =============================================================================
// Patient triage engine — DEMO decision support with fictional patients.
//
// How a level is decided (highest wins; nothing is averaged away):
//   1. Red-flag symptoms read from the description, ordered by the standard
//      emergency sequence: cardiac arrest, catastrophic bleeding, airway,
//      breathing, circulation, neurological (stroke, seizure), then others.
//   2. Vital signs scored with NEWS2 (Royal College of Physicians) for adults,
//      with simplified age bands for children.
//   3. Pain score (0-10).
//   4. Patient record: medical history (heart disease, blood thinners,
//      pregnancy, diabetes, lung disease, low immunity) and age can RAISE a
//      level for the symptoms they make more dangerous. They never lower one.
//   5. Explicitly mild / settled descriptions can lower an ordinary symptom by
//      one level, but never a red flag and never when vital signs are abnormal.
//
// Within a level, patients are ordered by how time-critical their deciding
// finding is ("acuity", 0-100), so heavy bleeding (98) always comes before
// stroke signs (90), and general weakness (24-38) sits far below both.
// Waiting time only breaks exact ties.
//
// This is an illustration for a hackathon. A nurse or doctor must confirm
// every level; the engine never diagnoses or recommends treatment.
// =============================================================================
'use strict';

const LEVELS = ['Low', 'Medium', 'High', 'Emergency'];
const RANK = { Low: 1, Medium: 2, High: 3, Emergency: 4 };
const BAND = { Emergency: [85, 100], High: [60, 84], Medium: [35, 59], Low: [5, 34] };
const SEE_WITHIN = { Emergency: 'Immediately', High: 'Within 15 minutes', Medium: 'Within 60 minutes', Low: 'Within 2 hours' };
const HISTORY = {
  heart: 'Heart disease', diabetes: 'Diabetes', thinners: 'On blood thinners', pregnant: 'Pregnant', lung: 'Asthma / lung disease',
  immuno: 'Low immunity (cancer treatment, transplant, steroids)', kidney: 'Kidney disease', hypertension: 'High blood pressure',
  stroke: 'Previous stroke', epilepsy: 'Epilepsy',
};

const levelOf = (i) => LEVELS[Math.max(0, Math.min(3, i))];
const idx = (lvl) => LEVELS.indexOf(lvl);
// Raise one level up to `max`; never lowers a level that is already higher than `max`
const raise = (lvl, max = 'Emergency') => levelOf(Math.max(idx(lvl), Math.min(idx(lvl) + 1, idx(max))));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ---------------------------------------------------------------- text helpers
const TYPOS = [
  [/\bblee?ding\b|\bbleding\b|\bbleeing\b/g, 'bleeding'], [/\bunconc?ious\b|\bunconcious\b/g, 'unconscious'],
  [/\bbreth(ing)?\b|\bbrething\b/g, 'breathing'], [/\bchestpain\b/g, 'chest pain'], [/\bstomache\b/g, 'stomach ache'],
  [/\bfeaver\b|\bfevar\b|\bfevr\b/g, 'fever'], [/\bvomitt?ing\b|\bvommiting\b/g, 'vomiting'], [/\bdiarr?h?o?ea\b|\bdiarhea\b|\bdiarrhea\b/g, 'diarrhoea'],
  [/\bseizer\b|\bseasure\b/g, 'seizure'], [/\bpalpitation\b/g, 'palpitations'], [/\bdizzyness\b/g, 'dizziness'], [/\bpt\b/g, 'patient'],
];
function normalise(text) {
  let t = ` ${String(text || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ')} `;
  for (const [re, to] of TYPOS) t = t.replace(re, to);
  return t;
}
const NEG = /\b(no|not|denies|denied|without|never|nil|free of|negative for|absence of|don'?t have|doesn'?t have|didn'?t have|no sign of|no signs of|ruled out)\b/;
function clausesOf(t) { return t.split(/[.;!?\n]+|,|\b(?:but|however|although|though|except|whereas)\b/).map((c) => ` ${c.trim()} `).filter((c) => c.trim()); }
// First match of `re` that is not negated inside its own clause ("no chest pain" does not count)
function findIn(clauses, re) {
  for (const c of clauses) {
    const m = c.match(re);
    if (!m) continue;
    const before = c.slice(Math.max(0, m.index - 32), m.index);
    if (NEG.test(before)) continue;
    return m[0].trim();
  }
  return null;
}

// ---------------------------------------------------------------- symptom rules
// level: the minimum level this finding sets. acuity: how time-critical it is (orders patients inside a level).
// group: only the strongest finding per group is kept. firm: mild wording cannot lower it.
const RULES = [
  // ---- Emergency: life-threatening, treat immediately (standard order: arrest, bleeding, airway, breathing, circulation, neuro)
  { id: 'arrest', label: 'Unresponsive or not breathing', cat: 'Resuscitation', level: 'Emergency', acuity: 100, group: 'conscious', firm: true, dept: 'Emergency',
    why: 'A patient who is unresponsive or not breathing needs resuscitation before anything else.',
    re: /\b(not breathing|(isn'?t|is not|stopped) breathing|no pulse|cardiac arrest|unresponsive|unconscious|not responding|won'?t wake( up)?|can'?t be woken|cannot be woken)\b/ },
  { id: 'haemorrhage', label: 'Heavy or uncontrolled bleeding', cat: 'Catastrophic bleeding', level: 'Emergency', acuity: 98, group: 'bleeding', firm: true, dept: 'Emergency',
    why: 'Uncontrolled bleeding can become fatal within minutes, so it is controlled first, ahead of airway and breathing problems.',
    re: /\b((heavy|heavily|severe|profuse|massive|uncontrolled|continuous|non ?-?stop|gushing|spurting|pouring|squirting|lots of|a lot of|too much|excessive|major) (bleeding|bleed|blood ?loss|blood)|bleed(ing|s)? (heavily|profusely|a lot|badly|non ?-?stop|everywhere|through|very much)|(bleeding|bleed|blood|wound)[^.,;]{0,25}?(not|n't|won'?t|never) stop\w*|(keeps|kept|still|continues to|continuing to|continuously|constantly) bleed\w*|(won'?t|will not|doesn'?t|does not|not|can'?t|cannot) stop (the )?bleed\w*|blood (is |was |keeps |keeps on )?(everywhere|soaking|spurting|pouring|gushing|squirting|flowing|dripping fast)|(spurting|gushing|pouring|squirting) (out )?(blood)?|(soaked|drenched|soaking) (in |with |through )?(blood|the (bandage|cloth|dressing))|losing (a lot of |lots of )?blood|lost (a lot of |lots of )blood|ha?emorrhag\w*|amputat\w*|(cut|chopped|severed|torn) off)\b/ },
  { id: 'airway', label: 'Airway at risk (swelling, choking, severe allergy)', cat: 'Airway', level: 'Emergency', acuity: 97, group: 'airway', firm: true, dept: 'Emergency',
    why: 'A blocked or swelling airway can stop breathing within minutes.',
    re: /\b(choking|can'?t swallow|cannot swallow|throat (is )?(closing|swelling|swollen|tight)|swollen (throat|tongue|lips|face)|swelling (of|in) (the |his |her )?(face|throat|lips|tongue)|face (is )?swell\w*|anaphyla\w*|severe allerg\w*|stridor|noisy breathing)\b/ },
  { id: 'breathing-severe', label: 'Severe breathing difficulty', cat: 'Breathing', level: 'Emergency', acuity: 96, group: 'breathing', firm: true, dept: 'Emergency',
    why: 'Severe breathlessness or blue lips mean the body is not getting enough oxygen.',
    re: /\b(can'?t breathe|cannot breathe|unable to breathe|struggling (to|for) breath\w*|gasping|fighting for breath|blue(ish)? lips|lips (look |are |turning |look |seem )?(blue|bluish|grey|gray)|turning blue|cyanos\w*|breathing (very |really |extremely )?(fast|rapidly|quickly|hard)|severe(ly)? (breathless\w*|short(ness)? of breath))\b/ },
  { id: 'pregnancy-red', label: 'Pregnancy with bleeding, severe pain, fits or fainting', cat: 'Circulation', level: 'Emergency', acuity: 93, group: 'pregnancy', firm: true, dept: 'Emergency',
    why: 'Bleeding, severe pain or fits in pregnancy can endanger both mother and baby.', combo: true },
  { id: 'seizure', label: 'Seizure / fits', cat: 'Neurological', level: 'Emergency', acuity: 92, group: 'seizure', firm: true, dept: 'Emergency',
    why: 'A seizure needs immediate protection of the airway and assessment.',
    re: /\b(seizures?|convuls\w*|fitting|having (a )?fits?|fits)\b/ },
  { id: 'head-red', label: 'Head injury with warning signs', cat: 'Neurological', level: 'Emergency', acuity: 91, group: 'head', firm: true, dept: 'Emergency',
    why: 'Vomiting, drowsiness or blackout after a head injury can mean bleeding inside the skull.', combo: true },
  { id: 'stroke', label: 'Possible stroke signs', cat: 'Neurological', level: 'Emergency', acuity: 90, group: 'stroke', firm: true, dept: 'General Medicine',
    why: 'Sudden one-sided weakness, facial droop or slurred speech suggest a stroke, where every minute of delay loses brain tissue.',
    re: /\b(stroke|face (is )?droop\w*|facial droop|droop\w* (face|mouth)|slurred speech|speech (is )?slurred|slurring|can'?t (speak|talk) properly|sudden(ly)? (numb\w*|weak\w*|paraly\w*)|(one|left|right)[- ]sided? (weakness|weak|numbness|paralysis)|weak(ness)? (on|of|in) (the |his |her |my )?(left|right|one) side|(left|right) (arm|leg|side) (is |went |feels )?(weak|numb|paraly\w*|dead)|paralys\w*)\b/ },
  { id: 'meningitis', label: 'Fever with stiff neck, rash or confusion', cat: 'Infection', level: 'Emergency', acuity: 90, group: 'fever', firm: true, dept: 'Emergency',
    why: 'Fever with a stiff neck, a non-fading rash or confusion can mean meningitis or sepsis.', combo: true },
  { id: 'cardiac', label: 'Chest pain with warning signs (possible heart attack)', cat: 'Circulation', level: 'Emergency', acuity: 89, group: 'chest', firm: true, dept: 'Cardiology',
    why: 'Chest pain with sweating, pain spreading to the arm or jaw, or breathlessness is a typical heart-attack pattern.', combo: true },
  { id: 'thunderclap', label: 'Sudden "worst ever" headache', cat: 'Neurological', level: 'Emergency', acuity: 88, group: 'headache', firm: true, dept: 'General Medicine',
    why: 'A sudden, worst-ever headache can be bleeding in the brain.',
    re: /\b(worst headache|worst ever headache|thunderclap|sudden (severe )?headache|headache (that is |is )?the worst)\b/ },
  { id: 'haematemesis', label: 'Vomiting or coughing up blood', cat: 'Circulation', level: 'Emergency', acuity: 87, group: 'bleeding', firm: true, dept: 'Emergency',
    why: 'Blood in vomit or cough can mean internal bleeding.',
    re: /\b((vomit\w*|throwing up|threw up|coughing( up)?|coughed( up)?) (lots of |large amounts of |a lot of |fresh )?blood|blood in (the )?vomit)\b/ },
  { id: 'poison', label: 'Poisoning or overdose', cat: 'Toxic', level: 'Emergency', acuity: 86, group: 'tox', firm: true, dept: 'Emergency',
    why: 'Poisons and overdoses can worsen suddenly and some need antidotes quickly.',
    re: /\b(overdos\w*|poison\w*|(took|taken|swallowed|consumed) (\d+|many|lots of|a lot of|too many|all (his|her|the)) ?(sleeping )?(pills|tablets|capsules)|ate (rat|mouse) poison|swallowed (pills|tablets|chemicals?|bleach|acid|kerosene|pesticide)|took too many (pills|tablets)|drank (bleach|acid|kerosene|pesticide))\b/ },
  { id: 'burns', label: 'Severe or large burns', cat: 'Exposure', level: 'Emergency', acuity: 85, group: 'burns', firm: true, dept: 'Surgery',
    why: 'Large or facial burns cause fluid loss and can affect breathing.',
    re: /\b((severe|major|large|big|extensive|deep|serious) burns?|burns? (on|over|to) (the |his |her )?(face|chest|airway|whole)|burnt? (badly|all over))\b/ },

  // ---- High: serious, should be seen within 15 minutes
  { id: 'open-fracture', label: 'Bone visible through the skin', cat: 'Limb injury', level: 'High', acuity: 82, group: 'limb', firm: true, dept: 'Orthopaedics',
    why: 'An open fracture has a high infection and bleeding risk.',
    re: /\b(bone (is )?(sticking|poking|visible|showing|out)|open fracture|compound fracture)\b/ },
  { id: 'suicidal', label: 'Risk of self-harm', cat: 'Safety', level: 'High', acuity: 80, group: 'mental', firm: true, dept: 'General Medicine',
    why: 'A person at risk of self-harm must not be left alone waiting.',
    re: /\b(suicid\w*|wants? to (die|end (his|her|my) life)|kill (him|her|my)self|self[- ]harm\w*)\b/ },
  { id: 'chest', label: 'Chest pain or pressure', cat: 'Circulation', level: 'High', acuity: 78, group: 'chest', firm: true, dept: 'Cardiology',
    why: 'Any chest pain needs an ECG quickly to rule out a heart attack.',
    re: /\b(chest (pain|pressure|tightness|heaviness|discomfort|ache|hurts|hurting)|pain (in|on|across) (the |my |his |her )?chest|crushing pain|tight(ness)? (in|on|across) (the |his |her |my )?chest)\b/ },
  { id: 'confusion', label: 'Confusion or drowsiness', cat: 'Neurological', level: 'High', acuity: 78, group: 'conscious', firm: true, dept: 'General Medicine',
    why: 'New confusion or drowsiness can mean low oxygen, infection, low sugar or a brain problem.',
    re: /\b(confus\w*|drows\w*|very sleepy|disorient\w*|not making sense|not (himself|herself)|delirious|hard to wake)\b/ },
  { id: 'mechanism', label: 'High-energy injury (road accident, fall from height, stabbing)', cat: 'Trauma', level: 'High', acuity: 74, group: 'mechanism', firm: true, dept: 'Emergency',
    why: 'High-energy injuries can hide internal bleeding even when the patient looks well.',
    re: /\b(road (traffic )?accident|rta|car (crash|accident)|(bike|motorbike|motorcycle|scooter|two[- ]wheeler) (accident|crash)|hit by (a |an )?(car|bus|truck|lorry|bike|vehicle|auto|train)|run over|fell from (a |the )?(height|roof|building|terrace|first floor|second floor|tree|balcony)|fall from (a |the )?(height|roof|building|terrace|tree|balcony)|stabb?\w*|gunshot|shot)\b/ },
  { id: 'head', label: 'Head injury', cat: 'Neurological', level: 'High', acuity: 72, group: 'head', firm: true, dept: 'Emergency',
    why: 'Head injuries need a check for bleeding inside the skull.',
    re: /\b(head injury|head (wound|trauma)|(hit|banged|bumped|struck|injured|hurt|cut) (his|her|my|the|their) head|fell on (his|her|my|the) head)\b/ },
  { id: 'breathing', label: 'Breathlessness or wheezing', cat: 'Breathing', level: 'High', acuity: 70, group: 'breathing', firm: false, dept: 'General Medicine',
    why: 'Breathlessness can worsen quickly and needs oxygen levels checked.',
    re: /\b(short(ness)? of breath|breathless\w*|difficulty (in )?breathing|trouble breathing|hard to breathe|wheez\w*|asthma attack|tight chest)\b/ },
  { id: 'sugar', label: 'Very low or very high blood sugar', cat: 'Metabolic', level: 'High', acuity: 70, group: 'sugar', firm: true, dept: 'General Medicine',
    why: 'Very low sugar can cause collapse within minutes; very high sugar can cause dehydration and acid build-up.',
    re: /\b((blood )?sugar (is |was |very )*(very )?(low|high)|hypoglycaemi\w*|hypoglycemi\w*|low sugar|high sugar|hypo)\b/ },
  { id: 'severe-abdo', label: 'Severe abdominal pain', cat: 'Abdomen', level: 'High', acuity: 68, group: 'abdomen', firm: false, dept: 'Surgery',
    why: 'Severe abdominal pain can be appendicitis, a blockage or internal bleeding.',
    re: /\b((severe|intense|unbearable|worst|excruciating|sharp|terrible) (abdominal|stomach|belly|tummy|lower abdominal|abdomen) pain|(abdominal|stomach|belly|tummy) pain (is )?(severe|unbearable|very bad)|appendic\w*|rigid (abdomen|belly|stomach)|right lower (side|abdomen|quadrant)( pain)?|pain (on|in) (the )?right lower (side|abdomen))\b/ },
  { id: 'faint', label: 'Fainting or collapse', cat: 'Circulation', level: 'High', acuity: 66, group: 'faint', firm: false, dept: 'Cardiology',
    why: 'Fainting can be caused by heart rhythm problems or blood loss.',
    re: /\b(faint\w*|syncope|black(ed)? out|blackout|passed out|lost consciousness|collapsed|collapse)\b/ },
  { id: 'severe-dehydration', label: 'Severe dehydration', cat: 'Circulation', level: 'High', acuity: 62, group: 'gi', firm: false, dept: 'General Medicine',
    why: 'Not passing urine or unable to keep fluids down means fluids are running low.',
    re: /\b(not passing urine|no urine|very dehydrated|severely dehydrated|can'?t keep (any )?(fluids|water|anything) down|unable to drink)\b/ },
  { id: 'deformity', label: 'Deformed limb (suspected fracture or dislocation)', cat: 'Limb injury', level: 'High', acuity: 62, group: 'limb', firm: false, dept: 'Orthopaedics',
    why: 'A deformed limb can trap nerves and blood vessels.',
    re: /\b(deform\w*|dislocat\w*|bent the wrong way)\b/ },

  // ---- Medium: needs care within the hour
  { id: 'palpitations', label: 'Palpitations', cat: 'Circulation', level: 'Medium', acuity: 50, group: 'palp', firm: false, dept: 'Cardiology',
    why: 'A racing or irregular heartbeat needs an ECG.',
    re: /\b(palpitat\w*|heart (is )?(racing|pounding|fluttering|beating fast)|racing (heart|heartbeat)|(irregular|fast|skipping) (heart ?beat|pulse))\b/ },
  { id: 'fracture', label: 'Suspected fracture', cat: 'Limb injury', level: 'Medium', acuity: 52, group: 'limb', firm: false, dept: 'Orthopaedics',
    why: 'A suspected fracture needs an X-ray and pain relief.',
    re: /\b(fracture\w*|broken (leg|arm|bone|wrist|hip|ankle|femur|finger|hand|foot|toe|rib)|(can'?t|cannot|unable to) (move|bear weight on|stand on|walk on|put weight on) (it|the |his |her |my )?(leg|arm|hip|ankle|foot)?)\b/ },
  { id: 'abdo', label: 'Abdominal pain', cat: 'Abdomen', level: 'Medium', acuity: 46, group: 'abdomen', firm: false, dept: 'Surgery',
    why: 'Abdominal pain needs assessment to rule out a surgical cause.',
    re: /\b((abdominal|stomach|belly|tummy|abdomen) (pain|ache|cramps?)|pain in (the |my |his |her )?(stomach|abdomen|belly|tummy)|stomach ache)\b/ },
  { id: 'high-fever', label: 'High fever', cat: 'Infection', level: 'Medium', acuity: 45, group: 'fever', firm: false, dept: 'General Medicine',
    why: 'A high fever needs a check for serious infection.',
    re: /\b(high fever|very high (fever|temperature)|fever of (39|40|41|10[2-6])|temperature (of )?(39|40|41|10[2-6]))\b/ },
  { id: 'bleeding', label: 'Bleeding or wound', cat: 'Wound', level: 'Medium', acuity: 45, group: 'bleeding', firm: false, dept: 'Surgery',
    why: 'A bleeding wound needs pressure, cleaning and possibly stitches.',
    re: /\b(bleeding(?! (has |had |now |is now )?(stopped|controlled))|blood loss|deep cut|laceration|gash|wound|cut (on|to) (his|her|my|the))\b/ },
  { id: 'fall', label: 'Fall', cat: 'Trauma', level: 'Medium', acuity: 42, group: 'mechanism', firm: false, dept: 'Orthopaedics',
    why: 'A fall needs a check for hidden injuries.',
    re: /\b(fell|fall from|had a fall|fallen|slipped and fell)\b/ },
  { id: 'bp', label: 'High blood pressure reading', cat: 'Circulation', level: 'Medium', acuity: 38, group: 'bp', firm: false, dept: 'Cardiology',
    why: 'A high reading should be re-checked and looked at with any symptoms.',
    re: /\b(high (blood pressure|bp)|bp (is |was )?(very )?high|hypertensi\w*)\b/ },
  { id: 'weak-marked', label: 'Marked weakness (cannot stand or very weak)', cat: 'General', level: 'Medium', acuity: 38, group: 'weakness', firm: false, dept: 'General Medicine',
    why: 'Being too weak to stand can point to dehydration, infection or low blood count.',
    re: /\b((very|extremely|too|really) weak|can'?t (stand|get up|walk)( (up|properly))?|unable to (stand|get up|walk))\b/ },
  { id: 'fever', label: 'Fever', cat: 'Infection', level: 'Medium', acuity: 36, group: 'fever', firm: false, dept: 'General Medicine',
    why: 'Fever suggests infection and needs basic checks.',
    re: /\b(fever|febrile|high temp(erature)?|temperature)\b/ },
  { id: 'gi', label: 'Vomiting or diarrhoea', cat: 'Abdomen', level: 'Medium', acuity: 34, group: 'gi', firm: false, dept: 'General Medicine',
    why: 'Vomiting or diarrhoea can lead to dehydration.',
    re: /\b(vomit\w*|throwing up|threw up|diarrhoea|loose (motions|stools)|dehydrat\w*)\b/ },
  { id: 'dizzy', label: 'Dizziness', cat: 'Neurological', level: 'Medium', acuity: 32, group: 'dizzy', firm: false, dept: 'General Medicine',
    why: 'Dizziness can come from low blood pressure, dehydration or heart rhythm problems.',
    re: /\b(dizz\w*|giddy|giddiness|light[- ]?headed|vertigo)\b/ },

  // ---- Low: stable, can wait
  { id: 'weak', label: 'General weakness or tiredness', cat: 'General', level: 'Low', acuity: 24, group: 'weakness', firm: false, dept: 'General Medicine',
    why: 'General weakness without danger signs is not immediately dangerous, but should be reviewed.',
    re: /\b(weak(ness)?|tired(ness)?|fatigue\w*|lethargic|low energy|no energy|exhausted|feeling unwell|not feeling well|unwell)\b/ },
  { id: 'headache', label: 'Headache', cat: 'Neurological', level: 'Low', acuity: 22, group: 'headache', firm: false, dept: 'General Medicine',
    why: 'An ordinary headache without warning signs can wait.',
    re: /\b(headache|head ache|migraine)\b/ },
  { id: 'msk', label: 'Back, joint or muscle pain', cat: 'Musculoskeletal', level: 'Low', acuity: 18, group: 'msk', firm: false, dept: 'Orthopaedics',
    why: 'Back or joint pain without injury or warning signs can wait.',
    re: /\b(back pain|back ache|backache|knee pain|joint pain|neck pain|shoulder pain|sprain\w*|muscle pain|body ache|body pain)\b/ },
  { id: 'minor', label: 'Minor or routine complaint', cat: 'Routine', level: 'Low', acuity: 8, group: 'minor', firm: false, dept: '',
    why: 'Minor or routine problems are safe to see after more urgent patients.',
    re: /\b(scratch\w*|graze\w*|bruis\w*|minor cut|small cut|cough|cold|sore throat|runny nose|sneez\w*|rash|itch\w*|acne|follow[- ]?up|check[- ]?up|routine|review|dressing|refill|prescription|certificate|vaccination|injection|mild fever)\b/ },
];

// Supporting cues used by combination rules
const CUE = {
  sweat: /\b(sweat\w*|clammy|diaphore\w*|cold sweat)\b/,
  radiate: /\b((radiat\w*|spread\w*|going|moving|travel\w*) (to|into|down|up) (the |his |her |my )?(left |right )?(arm|jaw|neck|back|shoulder)|(left|right) arm (pain|numb\w*|heavy|ache)|arm (pain|heaviness)|jaw pain|pain (in|to) (the |his |her |my )?(left |right )?(arm|jaw))\b/,
  breathless: /\b(short(ness)? of breath|breathless\w*|difficulty (in )?breathing|can'?t breathe|struggling to breathe)\b/,
  nausea: /\b(nause\w*|vomit\w*|feel(s|ing)? sick)\b/,
  faint: /\b(faint\w*|black(ed)? out|passed out|collapsed)\b/,
  dizzy: /\b(dizz\w*|giddy|light[- ]?headed)\b/,
  chest: /\bchest (pain|pressure|tightness|discomfort)\b/,
  headRed: /\b(vomit\w*|drows\w*|confus\w*|unconscious|black(ed)? out|passed out|knocked out|seizure|fits?|sleepy|memory loss)\b/,
  stiffNeck: /\b(stiff neck|neck stiffness|neck (is )?stiff|rash that (doesn'?t|does not|won'?t) fade|non[- ]blanching|purple (rash|spots)|confus\w*)\b/,
  pregnant: /\b(pregnan\w*|weeks pregnant|expecting a baby)\b/,
  pregnancyRed: /\b(bleeding|abdominal pain|stomach pain|severe headache|seizure|fits?|faint\w*|reduced (baby |fetal |foetal )?movements|baby (is )?not moving|waters broke)\b/,
  onsetHard: /\b(sudden\w*|just now|minutes? ago|started (suddenly|just|an hour ago)|getting worse|worsening|rapidly)\b/,
  mild: /\b(mild\w*|slight\w*|on and off|no pain now|relieved by rest|settled|resolved|better now|improving|drinking (fluids |water )?(okay|ok|well|fine)|eating and drinking (okay|ok|well|fine)|for (a few |several |many |\d+ )?(weeks|months|years)|long[- ]standing|chronic)\b/,
  severePain: /\b(severe pain|unbearable|excruciating|worst pain|(a lot|lots) of pain|terrible pain|screaming (in|with) pain|severe|(10|9|8) ?\/ ?10)\b/,
};
const HISTORY_TEXT = {
  heart: /\b(heart (disease|patient|problem|condition|failure)|cardiac patient|previous heart attack|had a heart attack|angina|bypass|stent)\b/,
  diabetes: /\b(diabet\w*|sugar patient)\b/,
  thinners: /\b(blood thinners?|warfarin|anticoagula\w*|apixaban|rivaroxaban|dabigatran|clopidogrel)\b/,
  pregnant: /\b(pregnan\w*|weeks pregnant)\b/,
  lung: /\b(asthma\w*|copd|lung disease|chronic bronchitis)\b/,
  immuno: /\b(chemo\w*|cancer treatment|immunocompromised|transplant|on steroids)\b/,
  kidney: /\b(kidney (disease|failure)|dialysis)\b/,
};

// ---------------------------------------------------------------- vital signs
const RANGES = { pulse: [20, 250, '/min', 'Pulse'], spo2: [50, 100, '%', 'SpO₂'], sbp: [40, 260, 'mmHg', 'Systolic BP'], rr: [4, 70, '/min', 'Breathing rate'], temp: [30, 44, '°C', 'Temperature'] };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// NEWS2 parameter points for adults (16+); simplified bands for children (demo)
function vitalPoints(key, v, age) {
  const child = age !== null && age < 16;
  if (key === 'spo2') return v <= 91 ? 3 : v <= 93 ? 2 : v <= 95 ? 1 : 0;
  if (key === 'temp') return v <= 35 ? 3 : v <= 36 ? 1 : v <= 38 ? 0 : v <= 39 ? 1 : 2;
  if (!child) {
    if (key === 'rr') return v <= 8 ? 3 : v <= 11 ? 1 : v <= 20 ? 0 : v <= 24 ? 2 : 3;
    if (key === 'sbp') return v <= 90 ? 3 : v <= 100 ? 2 : v <= 110 ? 1 : v <= 219 ? 0 : 3;
    if (key === 'pulse') return v <= 40 ? 3 : v <= 50 ? 1 : v <= 90 ? 0 : v <= 110 ? 1 : v <= 130 ? 2 : 3;
  }
  const band = age < 1 ? 0 : age < 6 ? 1 : 2; // infant, 1-5, 6-15
  const T = {
    pulse: [[100, 180, 160], [80, 160, 140], [70, 140, 120]], // [low3, high3, high2]
    rr: [[25, 60, 50], [20, 40, 35], [15, 30, 25]],
  };
  if (key === 'pulse' || key === 'rr') { const [lo, hi3, hi2] = T[key][band]; return v < lo || v > hi3 ? 3 : v > hi2 ? 2 : 0; }
  if (key === 'sbp') { const min = age < 1 ? 70 : 70 + 2 * Math.floor(age); return v < min ? 3 : 0; }
  return 0;
}
const AVPU = { A: ['Alert', 0], C: ['New confusion', 3], V: ['Responds to voice only', 3], P: ['Responds to pain only', 3], U: ['Unresponsive', 3] };

function scoreVitals(vitals = {}, age) {
  const rows = [], warnings = [], missing = [];
  let total = 0, counted = 0, single3 = false;
  for (const [key, [lo, hi, unit, name]] of Object.entries(RANGES)) {
    const v = num(vitals[key]);
    if (v === null) { missing.push(name); continue; }
    if (!Number.isFinite(v) || v < lo || v > hi) { warnings.push(`${name} of ${vitals[key]} looks wrong (expected ${lo}–${hi} ${unit}), so it was not used.`); continue; }
    const pts = vitalPoints(key, v, age);
    total += pts; counted += 1; if (pts === 3) single3 = true;
    rows.push({ key, name, value: `${v} ${unit}`, points: pts });
  }
  const av = vitals.avpu && AVPU[vitals.avpu] ? vitals.avpu : null;
  if (av) { const [label, pts] = AVPU[av]; total += pts; counted += 1; if (pts === 3) single3 = true; rows.push({ key: 'avpu', name: 'Consciousness', value: label, points: pts }); }
  else missing.push('Consciousness (AVPU)');

  // Explicit danger values (any one is an emergency regardless of the total)
  const v = Object.fromEntries(Object.keys(RANGES).map((k) => [k, rows.find((r) => r.key === k) ? num(vitals[k]) : null]));
  const danger = [];
  if (av === 'U') danger.push({ label: 'Unresponsive', acuity: 100 });
  if (av === 'P') danger.push({ label: 'Responds to pain only', acuity: 95 });
  if (v.spo2 !== null && v.spo2 < 90) danger.push({ label: `Very low oxygen (SpO₂ ${v.spo2}%)`, acuity: 95 });
  if (v.sbp !== null && v.sbp < 90 && v.pulse !== null && v.pulse >= 110) danger.push({ label: `Signs of shock (BP ${v.sbp} with pulse ${v.pulse})`, acuity: 94 });
  else if (v.sbp !== null && v.sbp < 80) danger.push({ label: `Very low blood pressure (${v.sbp} mmHg)`, acuity: 93 });
  if ((age === null || age >= 16) && v.rr !== null && (v.rr >= 30 || v.rr <= 8)) danger.push({ label: `Dangerous breathing rate (${v.rr}/min)`, acuity: 93 });
  if ((age === null || age >= 16) && v.pulse !== null && (v.pulse >= 140 || v.pulse <= 40)) danger.push({ label: `Dangerous heart rate (${v.pulse}/min)`, acuity: 91 });

  let level = null, acuity = 0, label = null;
  if (danger.length) { const d = danger.sort((a, b) => b.acuity - a.acuity)[0]; level = 'Emergency'; acuity = d.acuity; label = d.label; }
  else if (counted && total >= 7) { level = 'Emergency'; acuity = 86 + Math.min(total - 7, 6); label = `NEWS2 score ${total} (7 or more)`; }
  else if (counted && (total >= 5 || single3)) { level = 'High'; acuity = 70 + Math.min(total, 10); label = total >= 5 ? `NEWS2 score ${total} (5–6)` : `NEWS2 ${total} with one vital sign in the red zone`; }
  else if (counted && total >= 1) { level = 'Medium'; acuity = 36 + 2 * total; label = `NEWS2 score ${total} (1–4)`; }
  return { rows, total: counted ? total : null, counted, level, acuity, label, warnings, missing, danger };
}

// ---------------------------------------------------------------- main analysis
/**
 * @param {object} p { name, age, sex, arrival, complaint, vitals:{pulse,spo2,sbp,rr,temp,avpu}, pain, history:[ids] }
 */
function analyse(p = {}) {
  const ageRaw = num(p.age);
  const age = ageRaw !== null && Number.isFinite(ageRaw) && ageRaw >= 0 && ageRaw <= 120 ? ageRaw : null;
  const text = normalise(p.complaint);
  const clauses = clausesOf(text);
  const factors = [];
  const warnings = [];
  if (ageRaw !== null && age === null) warnings.push(`Age ${p.age} looks wrong, so it was not used.`);

  // History from the record checkboxes plus anything mentioned in the description
  const history = new Set((Array.isArray(p.history) ? p.history : []).filter((h) => HISTORY[h]));
  for (const [id, re] of Object.entries(HISTORY_TEXT)) if (findIn(clauses, re)) history.add(id);

  // 1. Symptoms (one per group, strongest wins)
  const found = new Map();
  const add = (rule, matched) => {
    const prev = found.get(rule.group);
    if (!prev || rule.acuity > prev.acuity) found.set(rule.group, { ...rule, matched, level: rule.level, acuity: rule.acuity, notes: [] });
  };
  for (const rule of RULES) if (rule.re) { const m = findIn(clauses, rule.re); if (m) add(rule, m); }
  const has = (g) => found.has(g);
  const cue = (k) => findIn(clauses, CUE[k]);
  const ruleById = (id) => RULES.find((r) => r.id === id);

  // 2. Combination rules: signs that are dangerous together
  if (has('chest')) {
    const extra = [cue('sweat') && 'sweating', cue('radiate') && 'pain spreading to the arm, jaw or back', cue('breathless') && 'breathlessness', cue('nausea') && 'nausea or vomiting', cue('faint') && 'fainting'].filter(Boolean);
    if (extra.length) add(ruleById('cardiac'), `chest pain with ${extra.join(', ')}`);
  }
  if (has('head') && found.get('head').id === 'head') {
    const h = cue('headRed'); const onThinners = history.has('thinners');
    if (h || onThinners) add(ruleById('head-red'), h ? `head injury with ${h}` : 'head injury while on blood thinners');
  }
  if ((has('fever') || /\bfever\b/.test(text)) && cue('stiffNeck')) add(ruleById('meningitis'), `fever with ${cue('stiffNeck')}`);
  if ((history.has('pregnant') || cue('pregnant')) && cue('pregnancyRed')) add(ruleById('pregnancy-red'), `pregnant with ${cue('pregnancyRed')}`);
  if (has('palp') && (cue('dizzy') || cue('faint') || cue('chest') || cue('breathless'))) {
    const f = found.get('palp'); f.level = 'High'; f.acuity = 70; f.label = 'Palpitations with dizziness, fainting or chest symptoms';
    f.why = 'A fast or irregular heartbeat that causes dizziness or fainting may not be pumping enough blood.';
  }
  if (has('faint') && found.get('faint').id === 'faint' && cue('onsetHard') && /twice|again|repeated|several times|\d+ times/.test(text)) {
    const f = found.get('faint'); f.acuity = 70; f.notes.push('repeated episodes');
  }

  // 3. Pain score (explicit 0-10, or severe pain described in words)
  const pain = num(p.pain);
  const painValid = pain !== null && Number.isFinite(pain) && pain >= 0 && pain <= 10;
  if (pain !== null && !painValid) warnings.push(`Pain score ${p.pain} looks wrong (0–10), so it was not used.`);
  const severeWords = !painValid && cue('severePain');
  const painLevel = painValid ? (pain >= 8 ? 'High' : pain >= 5 ? 'Medium' : pain >= 1 ? 'Low' : null) : severeWords ? 'High' : null;
  if (painLevel) add({ id: 'pain', group: 'pain', label: painValid ? `Pain ${pain}/10` : 'Severe pain (as described)', cat: 'Pain', level: painLevel, acuity: painLevel === 'High' ? 64 : painLevel === 'Medium' ? 40 : 15, firm: painLevel === 'High', dept: '', why: painLevel === 'High' ? 'Severe pain (8–10 out of 10) should be relieved within 15 minutes.' : 'Moderate pain should be assessed and relieved.' }, painValid ? `pain score ${pain}` : severeWords);

  // 4. Mild / settled wording lowers ordinary findings by one level (never red flags)
  const mild = cue('mild');
  const vit = scoreVitals(p.vitals || {}, age);
  const vitalsAbnormal = vit.level === 'High' || vit.level === 'Emergency';
  if (mild && !vitalsAbnormal) {
    for (const f of found.values()) {
      if (f.firm || f.level === 'Low') continue;
      const from = f.level; f.level = levelOf(idx(f.level) - 1); f.acuity = Math.min(f.acuity, BAND[f.level][1]);
      f.notes.push(`lowered from ${from}: described as "${mild}"`);
    }
  }

  // 5. Medical history and age raise the level for the findings they make more dangerous
  const bump = (groups, max, why, histKey) => {
    for (const g of groups) {
      const f = found.get(g); if (!f) continue;
      const to = raise(f.level, max);
      if (to !== f.level) { f.notes.push(`raised from ${f.level} to ${to}: ${why}`); f.level = to; f.acuity = Math.max(f.acuity, BAND[to][0] + 2); f.raisedBy = histKey; }
      else f.bonus = (f.bonus || 0) + 1;
    }
  };
  if (history.has('heart')) bump(['chest', 'faint', 'palp', 'breathing', 'dizzy'], 'High', 'known heart disease', 'heart');
  if (history.has('thinners')) bump(['bleeding', 'head', 'mechanism'], 'Emergency', 'on blood thinners, so bleeding is harder to stop', 'thinners');
  if (history.has('diabetes')) bump(['conscious', 'faint', 'gi', 'sugar', 'dizzy'], 'High', 'diabetes (risk of a sugar emergency)', 'diabetes');
  if (history.has('lung')) bump(['breathing'], 'Emergency', 'existing lung disease', 'lung');
  if (history.has('immuno')) bump(['fever'], 'High', 'low immunity, so infections spread fast', 'immuno');
  if (history.has('pregnant')) bump(['abdomen', 'faint', 'headache', 'bleeding'], 'Emergency', 'pregnancy', 'pregnant');

  const nonMinor = [...found.values()].some((f) => f.group !== 'minor');
  const ageFactor = [];
  if (age !== null && nonMinor) {
    if (age < 1) { bump([...found.keys()].filter((g) => g !== 'minor'), 'High', 'infant under 1 year', 'age'); ageFactor.push('Infant under 1 year'); }
    else if (age < 5) { bump(['fever', 'gi', 'breathing'], 'High', 'young child, dehydrates and tires quickly', 'age'); ageFactor.push('Young child (under 5)'); }
    else if (age >= 75) { bump(['weakness', 'gi', 'fever', 'dizzy', 'headache', 'msk'].filter((g) => found.get(g)?.level === 'Low'), 'Medium', 'age 75+, problems can hide serious illness', 'age'); bump(['chest', 'abdomen', 'faint', 'head', 'mechanism', 'conscious'], 'High', 'age 75+, higher risk', 'age'); ageFactor.push('Age 75 or over'); }
    else if (age >= 65) { bump(['abdomen', 'faint', 'head'], 'High', 'age 65+, higher risk', 'age'); ageFactor.push('Age 65 or over'); }
  }

  // 6. Decide: the strongest of symptoms and vital signs
  const candidates = [...found.values()].map((f) => ({ source: 'Symptom', label: f.label, level: f.level, acuity: f.acuity, cat: f.cat, why: f.why, dept: f.dept, matched: f.matched, notes: f.notes, bonus: f.bonus || 0, firm: f.firm, group: f.group }));
  if (vit.level) candidates.push({ source: 'Vital signs', label: vit.label, level: vit.level, acuity: vit.acuity, cat: 'Vital signs', why: vit.level === 'Emergency' ? 'Vital signs show the body is failing to cope (NEWS2 or a single dangerous value).' : vit.level === 'High' ? 'Vital signs are clearly abnormal (NEWS2 5–6 or one value in the red zone).' : 'Some vital signs are outside the normal range.', dept: '', notes: [], bonus: 0 });
  candidates.sort((a, b) => RANK[b.level] - RANK[a.level] || b.acuity - a.acuity);
  const top = candidates[0] || null;
  const level = top ? top.level : 'Low';

  // Score: deciding finding's acuity, small bonuses (max +2), kept inside the level's band
  let bonus = 0; const bonusNotes = [];
  if (top) {
    if (top.bonus) { bonus += 1; bonusNotes.push('medical history or age adds risk'); }
    if (cue('onsetHard')) { bonus += 1; bonusNotes.push(`onset: "${cue('onsetHard')}"`); }
    if (p.arrival === 'Ambulance') { bonus += 1; bonusNotes.push('arrived by ambulance'); }
    if (vit.total !== null && top.source !== 'Vital signs' && vit.total >= 3) { bonus += 1; bonusNotes.push(`NEWS2 ${vit.total} supports this`); }
  }
  bonus = Math.min(bonus, 2);
  const [lo, hi] = BAND[level];
  const score = top ? clamp(Math.max(top.acuity, lo) + bonus, lo, hi) : 10;

  // ---- Explanation
  for (const c of candidates) {
    const decides = c === top;
    factors.push({
      kind: c.source === 'Vital signs' ? 'Vital signs' : c.group === 'pain' ? 'Pain' : RANK[c.level] >= 3 && c.firm ? 'Red flag' : 'Symptom',
      label: c.label,
      detail: c.source === 'Vital signs' ? c.why : `${c.why}${c.matched ? ` (from: "${c.matched}")` : ''}`,
      level: c.level,
      effect: decides ? `Sets the level: ${c.level}` : RANK[c.level] === RANK[level] ? `Also ${c.level}, but less time-critical` : `${c.level} on its own`,
      notes: c.notes,
    });
  }
  for (const h of history) factors.push({ kind: 'Medical history', label: HISTORY[h], detail: candidates.some((c) => c.notes.some((n) => n.includes(HISTORY[h].toLowerCase()) || n.includes(h))) ? 'Raised the level of a related symptom (see notes above).' : 'Recorded; did not change this level.', level: null, effect: 'Considered' });
  for (const a of ageFactor) factors.push({ kind: 'Age', label: a, detail: 'Age changes how dangerous some symptoms are.', level: null, effect: 'Considered' });
  if (cue('onsetHard')) factors.push({ kind: 'Onset', label: `Sudden or worsening ("${cue('onsetHard')}")`, detail: 'Sudden or worsening symptoms move a patient up within their level.', level: null, effect: '+1 within level' });
  if (mild) factors.push({ kind: 'Onset', label: `Described as mild or settled ("${mild}")`, detail: vitalsAbnormal ? 'Ignored because vital signs are abnormal.' : 'Ordinary symptoms were lowered one level; red flags were not.', level: null, effect: vitalsAbnormal ? 'Ignored' : 'Lowered ordinary symptoms' });
  if (p.arrival === 'Ambulance') factors.push({ kind: 'Arrival', label: 'Arrived by ambulance', detail: 'Ambulance arrivals move up slightly within their level.', level: null, effect: '+1 within level' });

  const recognised = candidates.length > 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  let confidence;
  if (!recognised) confidence = { level: 'Low', reason: wordCount < 3 ? 'The description is too short to assess. Add the main problem and vital signs.' : 'No known symptom pattern was recognised. A nurse should assess the patient directly.' };
  else if (vit.counted >= 4) confidence = { level: 'High', reason: 'Based on the described symptoms and a full set of vital signs.' };
  else if (vit.counted >= 1) confidence = { level: 'Medium', reason: 'Some vital signs recorded; a full set (pulse, SpO₂, BP, breathing rate, temperature, consciousness) would make this more reliable.' };
  else confidence = { level: 'Medium', reason: 'Based on the description only. Record vital signs to confirm.' };

  const summary = top
    ? `${level}: ${top.label.charAt(0).toLowerCase() + top.label.slice(1)}. ${top.why}`
    : 'Low: no urgent signs were recognised in the description. A nurse should still assess the patient.';
  const reasonShort = top ? top.label : 'No urgent signs recognised';
  let dept = top?.dept || candidates.find((c) => c.dept)?.dept || '';
  if (level === 'Emergency') dept = 'Emergency';
  if (!dept) dept = p.arrival === 'OPD' ? 'General Medicine' : 'Emergency';
  if (age !== null && age < 16 && ['General Medicine'].includes(dept)) dept = 'Paediatrics';

  const watch = {
    Emergency: 'Keep under continuous observation. Call for help at once if the patient worsens.',
    High: 'Re-check vital signs every 15 minutes. Move to Emergency at once if breathing worsens, SpO₂ falls below 92%, BP falls below 90 or the patient becomes drowsy.',
    Medium: 'Re-check vital signs within 60 minutes, or sooner if new pain, breathlessness, bleeding or drowsiness appears.',
    Low: 'Re-assess if anything changes or if waiting goes beyond 2 hours.',
  }[level];

  return {
    level, score, seeWithin: SEE_WITHIN[level], dept,
    decidingFactor: top ? { label: top.label, source: top.source, why: top.why, matched: top.matched || null } : null,
    reasonShort, summary, confidence, factors, watch,
    vitals: { rows: vit.rows, news2: vit.total, missing: vit.missing },
    warnings: [...warnings, ...vit.warnings],
    acuity: top ? top.acuity : 0,
    scoreNote: bonusNotes.length ? `Score ${score} = ${top.label} (${top.acuity}) + ${bonus} for ${bonusNotes.slice(0, 2).join(' and ')}` : top ? `Score ${score} = ${top.label} (${top.acuity})` : 'No urgent findings',
    disclaimer: 'AI suggestion for a demo with fictional data. A nurse or doctor must confirm the priority.',
  };
}

// ---------------------------------------------------------------- queue ordering
// Clinician-confirmed overrides take precedence; otherwise AI level, then score, then waiting time.
const effectiveLevel = (p) => p.override?.level || p.triage.level;
function compare(a, b) {
  return RANK[effectiveLevel(b)] - RANK[effectiveLevel(a)] || b.triage.score - a.triage.score || (b.waitMins || 0) - (a.waitMins || 0);
}
function whyAbove(a, b) {
  const la = effectiveLevel(a), lb = effectiveLevel(b);
  if (la !== lb) return `${la} ranks above ${lb}: ${a.override?.level ? 'clinician set the level' : a.triage.reasonShort.toLowerCase()} outweighs ${b.override?.level ? 'their confirmed level' : b.triage.reasonShort.toLowerCase()}.`;
  if (a.triage.score !== b.triage.score) return `Same level (${la}), but ${a.triage.reasonShort.toLowerCase()} (${a.triage.score}) is more time-critical than ${b.triage.reasonShort.toLowerCase()} (${b.triage.score}).`;
  return `Same level and urgency; has waited longer (${a.waitMins || 0} vs ${b.waitMins || 0} min).`;
}

module.exports = { analyse, compare, whyAbove, effectiveLevel, LEVELS, RANK, HISTORY, SEE_WITHIN, normalise, scoreVitals };
