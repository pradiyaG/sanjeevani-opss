import { Fragment, useState } from 'react';
import { api } from '../api';
import { Foot, Hd, Load, lv, snapDate, useData } from '../ui';

const STATUS = { proposed: ['Awaiting approval', 't-a'], approved: ['Approved', 't-g'], done: ['Done', 't-g'], rejected: ['Rejected', 't-r'] };

export default function Issues() {
  const q = useData(api.issues);
  const [ev, setEv] = useState({});
  return (
    <>
      <Hd eb="Root-cause analysis" h="Why it’s happening" p="Signals from appointments, beds, discharges, diagnostics, staff and feedback are linked to explain causes, then ranked by urgency × impact." />
      <section>
        <Load q={q}>{({ issues, now }) => (
          <>
            <p className="mut" style={{ marginTop: 0 }}>Worked out from the hospital data as of {snapDate(now)}. Scores are demonstration settings, not validated hospital standards.</p>
            {issues.length ? null : <div className="cardw"><p className="mut">The latest data shows no operational issue that needs action.</p></div>}
            {issues.map((i, n) => (
              <div className="cardw" key={i.code}>
                <div className="row">
                  <div><span className={`tag ${lv(i.score)[1]}`}>#{n + 1} · {lv(i.score)[0]}</span><span className="tag t-i">{i.type}</span><h2 style={{ fontSize: 21, marginTop: 6 }}>{i.title}</h2><div className="mut">{i.dept}</div></div>
                  <span className="tag t-i">Score {i.score} (U{i.urgency} × I{i.impact})</span>
                </div>
                <p>{i.why}</p>
                <div className="chain">
                  {i.chain.map((c, x) => (
                    <Fragment key={x}>
                      {x ? <span className="arrow">→</span> : null}
                      <div className={`node ${x === i.rootIndex ? 'root' : ''}`}><b style={{ fontWeight: 500 }}>{c.label}</b><div className="mut">{c.sub}</div></div>
                    </Fragment>
                  ))}
                </div>
                {i.options?.length ? (
                  <div className="ev" style={{ marginBottom: 10 }}>
                    {i.options.map((op, k) => (
                      <div key={op.id}><b>{k ? '' : 'OPTIONS'}</b>{op.id === i.chosen ? '✔ Chosen: ' : 'Considered: '}{op.text}. <span style={{ opacity: 0.85 }}>{op.effect}.</span></div>
                    ))}
                    {(i.actions || []).map((a, k) => (
                      <div key={a.code}><b>{k ? '' : 'ACTION'}</b>{a.title} · Owner: {a.owner} <span className={`tag ${STATUS[a.status][1]}`} style={{ margin: '0 0 0 6px' }}>{STATUS[a.status][0]}</span></div>
                    ))}
                  </div>
                ) : null}
                <button className="pill s o" aria-expanded={!!ev[i.code]} onClick={() => setEv({ ...ev, [i.code]: !ev[i.code] })}>{ev[i.code] ? 'Hide' : 'Show'} evidence ({i.evidence.length})</button>
                {ev[i.code] && <div className="ev">{i.evidence.map((e, k) => <div key={k}><b>{e.source}</b>{e.text}</div>)}</div>}
              </div>
            ))}
          </>
        )}</Load>
      </section>
      <Foot />
    </>
  );
}
