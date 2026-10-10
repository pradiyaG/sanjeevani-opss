import { useState } from 'react';
import { api } from '../api';
import { Foot, Hd, Load, time, useApp, useData } from '../ui';

const FL = ['proposed', 'approved', 'done', 'rejected'];
const cap = (f) => f[0].toUpperCase() + f.slice(1);

function ActRow({ a, rej, setRej, act, busy }) {
  const ok = a.canAct;
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const reject = async () => {
    const v = reason.trim();
    if (v.length < 5) return setErr('Please give a reason (at least a few words).');
    const e = await act(a.code, 'reject', v);
    if (e) setErr(e);
  };
  return (
    <div className="act">
      <span className="tag t-i">{a.label}</span><b style={{ fontWeight: 500 }}>{a.title}</b>
      <div className="mut">Owner: {a.owner} · Can approve: {a.approvers.join(', ')}</div>
      {a.status === 'proposed' ? (rej === a.code ? (
        <>
          <label htmlFor={`rr-${a.code}`}>Reason for rejection (required)</label>
          <textarea id={`rr-${a.code}`} autoFocus placeholder="e.g. Bed already allocated, doctor advises against transfer" value={reason} onChange={(e) => setReason(e.target.value)} />
          {err && <div className="err" role="alert">{err}</div>}
          <div style={{ marginTop: 10 }}>
            <button className="pill s" disabled={busy} onClick={reject}>Confirm rejection</button>
            <button className="pill s o" onClick={() => setRej(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button className="pill s" disabled={!ok || busy} onClick={() => act(a.code, 'approve')}>Approve</button>
          <button className="pill s o" disabled={!ok || busy} onClick={() => setRej(a.code)}>Reject</button>
          {ok ? null : <span className="mut">Your role cannot approve this</span>}
        </div>
      )) : a.status === 'approved' ? (
        <div className="ok">✔ Task {a.taskId} sent to {a.owner} · alert raised · approved by {a.by} <button className="pill s o" style={{ margin: '0 0 0 8px' }} disabled={!ok || busy} onClick={() => act(a.code, 'done')}>Mark done</button></div>
      ) : a.status === 'done' ? (
        <div className="ok">✔ Completed ({a.taskId})</div>
      ) : (
        <div className="mut" style={{ marginTop: 8 }}><span className="tag t-r">Rejected</span> by {a.by}: “{a.reason}”</div>
      )}
    </div>
  );
}

export default function Actions() {
  const q = useData(api.actions);
  const { user, refresh } = useApp();
  const [fl, setFl] = useState('proposed');
  const [rej, setRej] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Returns an error message, or nothing when it worked
  const act = async (code, action, reason) => {
    setBusy(true); setMsg('');
    try { await api.decide(code, action, reason); setRej(null); await q.reload(); refresh(); return ''; }
    catch (e) { await q.reload(); if (action !== 'reject') setMsg(e.message); return e.message; }
    finally { setBusy(false); }
  };

  const kinds = q.data ? [...new Set(q.data.actions.filter((a) => a.canAct).map((a) => a.label))].join(', ') : '';
  return (
    <>
      <Hd eb="Human review required" h="Action queue" p={<>Every action needs approval from authorised staff. You are signed in as <b>{user.role}</b> and can approve: {q.data ? kinds || 'nothing (view only)' : '…'}.</>} />
      <section>
        <Load q={q}>{({ actions, log }) => {
          const L = actions.filter((a) => a.status === fl);
          return (
            <>
              <div className="chips" style={{ marginBottom: 16 }}>
                {FL.map((f) => (
                  <button key={f} aria-pressed={f === fl} style={f === fl ? { background: 'var(--btn)', color: 'var(--btnT)' } : undefined} onClick={() => { setFl(f); setRej(null); }}>
                    {cap(f)} ({actions.filter((a) => a.status === f).length})
                  </button>
                ))}
              </div>
              {msg && <div className="err" role="alert" style={{ marginBottom: 12 }}>{msg}</div>}
              <div className="two">
                <div className="cardw">{L.length ? L.map((a) => <ActRow key={a.code} a={a} rej={rej} setRej={setRej} act={act} busy={busy} />) : <p className="mut">Nothing here.</p>}</div>
                <div className="cardw"><h2 style={{ fontSize: 20 }}>Audit log</h2>
                  {log.length ? log.map((l) => <div className="log" key={l._id}>{time(l.at)} · {l.by} ({l.role}) {l.text}</div>) : <span className="mut">No decisions yet.</span>}
                </div>
              </div>
            </>
          );
        }}</Load>
      </section>
      <Foot />
    </>
  );
}
