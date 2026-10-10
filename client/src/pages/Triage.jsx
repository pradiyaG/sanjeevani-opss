import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Foot, Hd, LC, LV, Load, useApp, useData } from '../ui';

const HIST = ['Heart disease', 'Blood thinners', 'Pregnancy', 'Diabetes', 'Lung disease', 'Cancer', 'Kidney disease', 'Previous stroke'];
const DEPTS = ['Auto-detect', 'Emergency', 'Critical Care', 'General Medicine', 'Cardiology', 'Orthopaedics', 'Paediatrics', 'Gynaecology', 'Neurology', 'ENT', 'Dermatology'];
const BLANK = { name: '', age: '', via: 'Emergency', dept: 'Auto-detect', text: '', block: 'No bed free', spo2: '', hr: '', sys: '', rr: '', hist: [] };
const EX = {
  A: { ...BLANK, name: 'Suresh Patil', age: '56', via: 'Emergency', dept: 'Cardiology', text: 'Severe chest pain spreading to left arm, sweating a lot, started 30 minutes ago', block: 'No bed free' },
  B: { ...BLANK, name: 'Neha Kapoor', age: '31', via: 'Emergency', dept: 'Cardiology', text: 'Heart is racing on and off since two days, no chest pain, feels a bit anxious', block: 'No bed free' },
};
const COLOR = { Emergency: 'red', High: 'org', Medium: 'amb', Low: 'grn' };

// Live assessment line: asks the server's triage engine shortly after typing stops
function Live({ f }) {
  const [s, setS] = useState({ r: null, err: false });
  const key = JSON.stringify(f);
  useEffect(() => {
    if (!f.text.trim()) { setS({ r: null, err: false }); return undefined; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api.preview(f, ctl.signal).then((r) => setS({ r, err: false }), (e) => { if (e.name !== 'AbortError') setS({ r: null, err: true }); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  let body;
  if (!f.text.trim()) body = <span className="mut">Start typing the problem to see a live assessment.</span>;
  else if (s.err) body = <span className="mut">Assessment will appear when you submit.</span>;
  else if (!s.r) body = <span className="mut">Assessing…</span>;
  else body = <><span className={`tag ${LC[s.r.level]}`} style={{ margin: 0 }}>{s.r.level} · {s.r.score}</span><span className="mut">{s.r.deciding}</span></>;
  return <div id="live" aria-live="polite">{body}</div>;
}

function Form({ onAdded }) {
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const tick = (x) => (e) => setF((o) => ({ ...o, hist: e.target.checked ? [...o.hist, x] : o.hist.filter((h) => h !== x) }));
  const fill = (k) => { setF({ ...EX[k] }); setErr(''); onAdded(null); };
  const add = async () => {
    if (!f.name.trim() || !f.text.trim()) return setErr('Please enter the patient name and describe the problem in your own words.');
    setErr(''); setBusy(true);
    try { const r = await api.addPatient(f); setF(BLANK); onAdded(r); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const o = (list) => list.map((x) => <option key={x}>{x}</option>);
  return (
    <div className="cardw">
      <h2 style={{ fontSize: 20 }}>Register a waiting patient</h2>
      <div className="mut">Describe the problem in simple words. The assessment updates as you type and ranks the patient against everyone already waiting.</div>
      <div className="chips" style={{ marginTop: 10 }}>
        <button onClick={() => fill('A')}>Example: chest pain, sweating</button>
        <button onClick={() => fill('B')}>Example: racing heartbeat</button>
      </div>
      <div className="f2">
        <div><label htmlFor="pn">Patient name</label><input id="pn" value={f.name} onChange={set('name')} autoComplete="off" /></div>
        <div><label htmlFor="pa">Age</label><input id="pa" type="number" min="0" max="120" value={f.age} onChange={set('age')} /></div>
      </div>
      <div className="f2">
        <div><label htmlFor="pv">Came through</label><select id="pv" value={f.via} onChange={set('via')}>{o(['Emergency', 'OPD', 'Referral'])}</select></div>
        <div><label htmlFor="pd">Department needed</label><select id="pd" value={f.dept} onChange={set('dept')}>{o(DEPTS)}</select></div>
      </div>
      <label htmlFor="pt">What is the problem? (plain words are fine)</label>
      <textarea id="pt" value={f.text} onChange={set('text')} placeholder="e.g. Chest pain since 30 minutes, sweating, pain going to the arm" />
      <label>Vitals, if available</label>
      <div className="f4">
        <input id="ps" type="number" placeholder="SpO2 %" aria-label="SpO2 %" value={f.spo2} onChange={set('spo2')} />
        <input id="ph" type="number" placeholder="Pulse" aria-label="Pulse" value={f.hr} onChange={set('hr')} />
        <input id="py" type="number" placeholder="Systolic BP" aria-label="Systolic BP" value={f.sys} onChange={set('sys')} />
        <input id="pr" type="number" placeholder="Resp rate" aria-label="Resp rate" value={f.rr} onChange={set('rr')} />
      </div>
      <label>Known history</label>
      <div>{HIST.map((x) => <label className="ck" key={x}><input type="checkbox" className="hx" value={x} checked={f.hist.includes(x)} onChange={tick(x)} />{x}</label>)}</div>
      <label htmlFor="pb">Why is the patient not being treated yet?</label>
      <select id="pb" value={f.block} onChange={set('block')}>{o(['No bed free', 'Bed booked', 'Doctor busy', 'Test pending', 'Other'])}</select>
      <Live f={f} />
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ marginTop: 14 }}><button className="pill" onClick={add} disabled={busy}>Add to priority queue</button></div>
    </div>
  );
}

function Result({ r }) {
  const p = r.p, t = p.triage;
  return (
    <div className="cardw res" style={{ borderLeftColor: `var(--${COLOR[p.level]})` }}>
      <span className={`tag ${LC[p.level]}`}>{p.level} · score {t.score}</span><span className="tag t-i">{p.dept}</span>
      <h3 style={{ margin: '6px 0' }}>{p.name}, {p.age || 'age not recorded'}: queue position #{r.rank} of {r.n}</h3>
      <div className="ev">
        <div><b>DECIDING</b>{t.deciding}</div>
        <div><b>ALL FACTORS</b>{t.why.join(' · ')}</div>
        {t.news && <div><b>NEWS2</b>{t.news.total} ({t.news.parts.map((e) => `${e[0]} ${e[1]}: ${e[2]}`).join(', ')})</div>}
        {t.missing.length ? <div><b>NOT RECORDED</b>{t.missing.join(', ')}</div> : null}
        <div><b>QUEUE</b>{r.q}</div>
        <div><b>NEXT STEP</b>{r.tip}</div>
      </div>
      {LV[p.level] >= 3 && <div className="ok">A priority-placement action was added to the Action queue for review.</div>}
      <p className="mut">Decision support, not a diagnosis. A nurse or doctor must confirm the priority.</p>
    </div>
  );
}

const ageOf = (p) => (p.age !== undefined && p.age !== null ? p.age : p.ageGroup ? `age group ${p.ageGroup}` : 'age not recorded');
const waited = (p) => (p.wait === null || p.wait === undefined ? 'Waiting: time not recorded' : `Waiting ${p.wait ? `${p.wait} min` : 'just now'}`);

function QItem({ p, i, clin, chg, setChg, onDone }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = chg && chg.id === p._id;
  useEffect(() => { setReason(''); setErr(''); }, [mine, chg?.v]);
  const send = async (body) => {
    setBusy(true);
    try { await api.patientAction(p._id, body); setChg(null); await onDone(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const change = () => { if (reason.trim().length < 5) return setErr('A short written reason is required to change a priority.'); return send({ action: 'change', level: chg.v, reason: reason.trim() }); };
  return (
    <div className="q">
      <div className="rk">{p.level ? i + 1 : '?'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className={`tag ${p.level ? LC[p.level] : 't-i'}`}>{p.level || 'Not assessed'}</span><span className="tag t-i">{p.dept}</span>{p.source === 'dataset' ? <span className="tag t-i">Hospital data</span> : null} <b style={{ fontWeight: 500 }}>{p.name}, {ageOf(p)}</b>
        <div className="mut">{p.text}</div>
        {p.level ? <div className="mut">Why: {p.triage.deciding}</div> : null}
        <div className="mut">{waited(p)} · Blocked by: {p.block} · {p.conf ? `✔ confirmed by ${p.conf}` : p.level ? 'awaiting clinician confirmation' : 'needs a nurse or doctor to assess'}</div>
        {clin && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.conf || !p.level ? null : <button className="pill s o" style={{ margin: 0 }} disabled={busy} onClick={() => send({ action: 'confirm' })}>Confirm</button>}
            <select aria-label={p.level ? 'Change priority' : 'Assess priority'} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} value={mine ? chg.v : p.level || ''}
              onChange={(e) => { if (e.target.value && e.target.value !== p.level) setChg({ id: p._id, v: e.target.value }); }}>
              {p.level ? null : <option value="" disabled>Assess: choose category</option>}
              {Object.keys(LV).map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        )}
        {mine && (
          <>
            <label htmlFor={`cr-${p._id}`}>{p.level ? `Reason for changing to ${chg.v} (required)` : `Reason for assessing as ${chg.v} (required)`}</label>
            <textarea id={`cr-${p._id}`} autoFocus placeholder="e.g. Re-examined: pain settled, vitals normal" value={reason} onChange={(e) => setReason(e.target.value)} />
            {err && <div className="err" role="alert">{err}</div>}
            <div style={{ marginTop: 8 }}>
              <button className="pill s" disabled={busy} onClick={change}>Confirm change</button>
              <button className="pill s o" onClick={() => setChg(null)}>Cancel</button>
            </div>
          </>
        )}
        {!mine && err && <div className="err" role="alert">{err}</div>}
      </div>
    </div>
  );
}

export default function Triage() {
  const q = useData(api.patients);
  const { perm, refresh } = useApp();
  const [res, setRes] = useState(null);
  const [chg, setChg] = useState(null);
  const top = useRef(null);
  const onAdded = async (r) => { setRes(r); if (r) { await q.reload(); refresh(); } };
  return (
    <>
      <Hd eb="Patient flow" h="Patient triage" p="Enter patients who are waiting. The assessment reads the problem, explains the priority and fits them into the live queue." />
      <section>
        <div className="two">
          <div ref={top}>
            {perm.register ? <Form onAdded={onAdded} /> : <div className="cardw"><h2 style={{ fontSize: 20 }}>Registration</h2><p className="mut">Your role can view the queue but not register patients.</p></div>}
            {res && <Result r={res} />}
          </div>
          <Load q={q}>{({ ranked: rk, unassessed }) => (
            <div>
              <div className="cardw">
                <h2 style={{ fontSize: 20 }}>Priority queue ({rk.length} waiting)</h2>
                <div className="mut">Category first, then score within the category, then time waited.</div>
                {rk.length ? rk.map((p, i) => <QItem key={p._id} p={p} i={i} clin={perm.clinical} chg={chg} setChg={setChg} onDone={q.reload} />) : <p className="mut">Nobody is in the queue yet.</p>}
              </div>
              {unassessed.length ? (
                <div className="cardw">
                  <h2 style={{ fontSize: 20 }}>Needs assessment ({unassessed.length})</h2>
                  <div className="mut">These patients are waiting in the hospital data with no recorded triage priority. {perm.clinical ? 'Choose a category and give a reason to place them in the queue.' : 'A nurse or doctor must assess them before they can be ranked.'}</div>
                  {unassessed.map((p, i) => <QItem key={p._id} p={p} i={i} clin={perm.clinical} chg={chg} setChg={setChg} onDone={async () => { await q.reload(); refresh(); }} />)}
                </div>
              ) : null}
            </div>
          )}</Load>
        </div>
      </section>
      <Foot />
    </>
  );
}
