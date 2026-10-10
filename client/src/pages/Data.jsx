import { useRef, useState } from 'react';
import { api } from '../api';
import { Foot, Hd, Load, P, T, snapDate, time, useApp, useData } from '../ui';

// Upload an updated dataset file (same columns), change the snapshot time, or restore the original files
export default function Data() {
  const q = useData(api.data);
  const { perm, refresh } = useApp();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { ok, title, lines }
  const [when, setWhen] = useState('');
  const pick = useRef(null);
  const target = useRef('');

  const done = async (title, r) => { setMsg({ ok: true, title, lines: r.changes?.length ? r.changes : ['No issue changed.'] }); await q.reload(); refresh(); };
  const wrap = (key, fn) => async () => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, title: e.message, lines: [] }); }
    finally { setBusy(''); }
  };
  const choose = (name) => { target.current = name; if (pick.current) { pick.current.value = ''; pick.current.click(); } };
  const upload = async (file) => {
    if (!file) return;
    const files = q.data?.files.map((f) => f.name) || [];
    const name = target.current || (files.includes(file.name) ? file.name : '');
    if (!name) { setMsg({ ok: false, title: `Choose which file "${file.name}" replaces: use the Upload button on that file's row.`, lines: [] }); return; }
    await wrap(name, async () => {
      const text = await file.text();
      const r = await api.uploadFile(name, text);
      await done(`${name} updated: ${r.before} → ${r.rows} rows${r.skipped?.length ? ` (${r.skipped.length} rows skipped: ${r.skipped.slice(0, 2).join('; ')})` : ''}. The agent re-ran on the new data.`, r);
    })();
  };

  return (
    <>
      <Hd eb="Hospital data" h="Data & updates" p="The agent reads these nine files. Upload an updated file with the same columns and every screen recalculates." />
      <section>
        <Load q={q}>{(d) => (
          <>
            {msg && (msg.ok
              ? <div className="ok" role="status" style={{ marginBottom: 14 }}><b style={{ fontWeight: 600 }}>{msg.title}</b>{msg.lines.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{msg.lines.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}</div>
              : <div className="err" role="alert" style={{ marginBottom: 14 }}>{msg.title}</div>)}
            <div className="two">
              <div className="cardw">
                <h2 style={{ fontSize: 20 }}>Snapshot time</h2>
                <p className="mut">The agent measures waits and overdue reports against this time. Right now: <b style={{ color: 'var(--ink)' }}>{snapDate(d.now)}</b>{d.snapshotTime ? ' (set by hand)' : ' (automatic)'}.</p>
                <p className="mut">Automatic uses one hour after the latest Emergency waiting-time reading: {d.autoTime}. When an updated file arrives at 14:00, set 2026-11-16 14:00 here.</p>
                {perm.data ? (
                  <>
                    <label htmlFor="snap">New snapshot time (YYYY-MM-DD HH:MM)</label>
                    <input id="snap" placeholder="2026-11-16 14:00" value={when} onChange={(e) => setWhen(e.target.value)} />
                    <div style={{ marginTop: 10 }}>
                      <button className="pill s" disabled={!!busy || !when.trim()} onClick={wrap('time', async () => { const r = await api.setSnapshot(when.trim()); setWhen(''); await done(`Snapshot time set to ${r.now}.`, r); })}>Save time</button>
                      <button className="pill s o" disabled={!!busy || !d.snapshotTime} onClick={wrap('auto', async () => { const r = await api.setSnapshot(''); await done(`Snapshot time is automatic again (${r.now}).`, r); })}>Use automatic</button>
                    </div>
                  </>
                ) : <p className="mut">Your role can view the data but not change it.</p>}
              </div>
              <div className="cardw">
                <h2 style={{ fontSize: 20 }}>Last agent run</h2>
                <p className="mut">{d.lastRun ? `${time(d.lastRun)} · ${d.reason}` : 'Not run yet.'}</p>
                <p className="mut">An upload is checked first: it must have exactly the same columns as the original file. If it does not, nothing is changed and the reason is shown here.</p>
                {perm.data && <button className="pill s o" disabled={!!busy} onClick={wrap('reset', async () => { const r = await api.resetData(); await done('Original dataset restored.', r); })}>Restore original dataset</button>}
              </div>
            </div>
            <div className="cardw">
              <h2 style={{ fontSize: 20 }}>Dataset files</h2>
              <input ref={pick} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} aria-label="Choose a CSV file" />
              <T h={['File', 'Rows', 'Columns', 'Source', 'Loaded', '']} rows={d.files.map((f) => [
                <b style={{ fontWeight: 500 }}>{f.name}</b>, f.rows, <span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', minWidth: 220 }}>{f.columns.join(', ')}</span>,
                <P t={f.source} c={f.source === 'Uploaded update' ? 't-a' : 't-g'} />, f.loadedAt ? `${time(f.loadedAt)} · ${f.loadedBy}` : '–',
                perm.data ? <button className="pill s o" style={{ margin: 0 }} disabled={!!busy} onClick={() => choose(f.name)}>{busy === f.name ? 'Uploading…' : 'Upload update'}</button> : '',
              ])} />
            </div>
          </>
        )}</Load>
      </section>
      <Foot />
    </>
  );
}
