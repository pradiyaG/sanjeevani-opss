import { useRef, useState } from 'react';
import { api } from '../api';
import { Foot, Load, Stage, lv, snapDate, useApp, useData } from '../ui';

const GR = ['#cfe8e6,#8fbfca', '#f0d9d3,#c9a5ba', '#d6e4f0,#93b1d3', '#e3ead2,#9fc29c', '#f4e3c9,#d3a985', '#e0d6ee,#ab9bd0', '#d3ecea,#8fb9c9', '#f0d9d3,#c9a5ba'];
const col = (h) => (h >= 75 ? 'red' : h >= 45 ? 'amb' : 'grn');
const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
const min = (v) => (v === null || v === undefined ? '–' : `${v} min`);

export default function Overview() {
  const q = useData(api.overview);
  const { perm, go } = useApp();
  const [sel, setSel] = useState('Emergency');
  const car = useRef(null);
  const can = (t) => perm.tabs.includes(t);

  return (
    <Load q={q} stage>{(o) => {
      const top = o.issues.slice(0, 3), d = o.departments.find((x) => x.name === sel) || o.departments[0], rel = o.issues.filter((i) => i.dept === d.name);
      const s = o.stats;
      return (
        <>
          <Stage>
            <div className="hero">
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="eb">Operations agent · data snapshot {snapDate(o.now)}</div>
                  <h1>{o.headline.h1.split('<br>').map((t, k) => <span key={k}>{k ? <br /> : null}{t}</span>)}</h1>
                  {can('Actions') && <button className="pill" onClick={() => go('Actions')}>Review {o.pending} actions</button>}
                  {can('Issues') && <button className="pill w" onClick={() => go('Issues')}>See why</button>}
                </div>
                <p className="lead">{o.headline.lead}</p>
              </div>
              <div className="stats">
                <div><b>{min(s.edWait)}</b><span>ED average wait today (usual {min(s.edUsual)})</span></div>
                <div><b>{s.edWaiting}</b><span>Patients waiting in ED with no bed</span></div>
                <div><b>{s.blocked}</b><span>Beds held by stuck discharges</span></div>
                <div><b>{s.freeElsewhere}</b><span>Free beds in other wards</span></div>
              </div>
            </div>
          </Stage>

          <section>
            <div className="head"><div><h2>Our goal</h2><div className="mut" style={{ maxWidth: 640 }}>Find what is really blocking patient movement, rank it by urgency and impact, and get the right team to act, with a human approving every step.</div></div></div>
            <div className="goal">
              <div><span className="mut">Emergency wait</span><b>{s.edWait} → {s.edUsual} min</b><span className="mut">back to the usual level</span></div>
              <div><span className="mut">Beds held by stuck discharges</span><b>{s.blocked} → 0</b><span className="mut">clear within the shift</span></div>
              <div><span className="mut">Critical patients placed</span><b>{s.crit} waiting</b><span className="mut">{s.unassessed ? `${s.unassessed} more not yet assessed · ` : ''}aim: bed or doctor in 15 min</span></div>
            </div>
          </section>

          <section>
            <h2>What needs my attention today?</h2>
            <div className="box" style={{ marginTop: 8 }}>
              {top.length ? top.map((i, n) => <div key={i.code} style={{ padding: '5px 0' }}><b style={{ fontWeight: 500 }}>{n + 1}. {i.title}.</b> <span className="mut">{i.short}.</span></div>) : <div>No operational issue needs action in the latest data.</div>}
              <div className="mut" style={{ marginTop: 6 }}>{o.issues.length} issues are open and {o.pending} actions are waiting for review.</div>
            </div>
          </section>

          <section>
            <div className="head">
              <div><h2>Ranked issues</h2><div className="mut">Scored by urgency × impact.</div></div>
              <div className="arrows">
                <button onClick={() => car.current?.scrollBy({ left: -520, behavior: 'smooth' })} aria-label="Previous">‹</button>
                <button onClick={() => car.current?.scrollBy({ left: 520, behavior: 'smooth' })} aria-label="Next">›</button>
              </div>
            </div>
            <div className="car" id="car" ref={car}>
              {o.issues.map((i, n) => (
                <div key={i.code} className="cc" style={{ background: `linear-gradient(160deg,${GR[n % GR.length]})` }}
                  {...(can('Issues') ? { onClick: () => go('Issues'), role: 'button', tabIndex: 0, onKeyDown: key(() => go('Issues')) } : {})}>
                  <span className="tg">#{n + 1} · {lv(i.score)[0]}</span>
                  <div className="em">{i.emoji}</div>
                  <div className="ov"><h3>{i.title}</h3><p>{i.short}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="head"><div><h2>Departments</h2><div className="mut">Pressure combines today's wait against the usual, bed occupancy, patients waiting and overdue items. Select one for details.</div></div></div>
            <div className="tiles">
              {o.departments.map((x) => {
                const h = x.heat;
                return (
                  <div key={x.name} className={`tile ${x.name === d.name ? 'on' : ''}`} onClick={() => setSel(x.name)} role="button" tabIndex={0} aria-pressed={x.name === d.name} onKeyDown={key(() => setSel(x.name))}>
                    <div className="top"><div className="ico">{x.emoji}</div><div><b style={{ fontWeight: 500 }}>{x.name}</b><div className="mut" style={{ color: `var(--${col(h)})` }}>{h >= 75 ? 'Needs attention' : h >= 45 ? 'Watch' : 'Healthy'} · {h}/100</div></div></div>
                    <div className="kv"><span>Avg wait today</span><b>{min(x.avgWait)}</b></div>
                    <div className="kv"><span>Usual wait</span><b>{min(x.usual)}</b></div>
                    <div className="kv"><span>Patients waiting</span><b>{x.waiting}</b></div>
                    {x.totalBeds ? <div className="kv"><span>Free beds</span><b>{x.freeBeds} / {x.totalBeds}</b></div> : <div className="kv"><span>Free beds</span><b>no ward</b></div>}
                    <div className="bar"><i style={{ width: `${h}%`, background: `var(--${col(h)})` }} /></div>
                  </div>
                );
              })}
            </div>
            <div className="box">
              <b style={{ fontWeight: 500 }}>{d.name}</b>
              <div className="mut">Usual wait {min(d.usual)} · Doctors on today's roster {d.doctors} · Overdue items {d.pending}{d.awaitingBed ? ` · ${d.awaitingBed} awaiting a bed` : ''}{d.wards.length ? ` · Wards: ${d.wards.join(', ')}` : ''}</div>
              {rel.length ? <ul>{rel.map((i) => <li key={i.code}>{i.title}</li>)}</ul> : <p className="mut" style={{ margin: '8px 0 0' }}>No open issue is tagged to this department.</p>}
            </div>
          </section>
          <Foot />
        </>
      );
    }}</Load>
  );
}
