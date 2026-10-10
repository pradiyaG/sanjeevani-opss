// Shared layout pieces, written to produce the same markup as the original page.
import { Component, createContext, useCallback, useContext, useEffect, useState } from 'react';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const LV = { Emergency: 4, High: 3, Medium: 2, Low: 1 };
export const LC = { Emergency: 't-r', High: 't-o', Medium: 't-a', Low: 't-g' };
export const lv = (s) => (s >= 20 ? ['Urgent', 't-r'] : s >= 12 ? ['Soon', 't-a'] : ['Routine', 't-g']);
export const st = (s) => (/Over|Short|High|Open|No-show/.test(s) ? 't-r' : /Busy|Tight|progress|Medium|Normal/.test(s) ? 't-a' : 't-g');
// "2026-11-16 10:00" -> "Monday 16 November 2026, 10:00" (the data's own clock, not this computer's)
export const snapDate = (s) => {
  if (!s) return '';
  const d = new Date(`${s.replace(' ', 'T')}:00Z`);
  return Number.isNaN(d.getTime()) ? s : `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}, ${s.slice(11, 16)}`;
};
export const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Loads data from the API; reload() refreshes it after a change
export function useData(load) {
  const [s, setS] = useState({ data: null, error: null });
  const reload = useCallback(() => load().then((data) => setS({ data, error: null }), (error) => setS((o) => ({ data: o.data, error }))), [load]);
  useEffect(() => { reload(); }, [reload]);
  return { ...s, reload };
}

// Shows loading / error text, or the content once data has arrived
export function Load({ q, children, stage }) {
  const wrap = (x) => (stage ? <Stage><div style={{ padding: '30px 14px' }}>{x}</div></Stage> : x);
  if (q.error && !q.data) return wrap(<div className="cardw"><p className="err" role="alert" style={{ marginTop: 0 }}>{q.error.message}</p><button className="pill s o" onClick={q.reload}>Try again</button></div>);
  if (!q.data) return wrap(<p className="loading" role="status">Loading…</p>);
  return children(q.data);
}

export function Stage({ children }) {
  const { user, tab, go, pending, signOut } = useApp();
  return (
    <div className="stage">
      <div className="nav">
        <span className="brand">SANJEEVANI</span>
        <div className="links">
          {user.permissions.tabs.map((t) => (
            <button key={t} className={t === tab ? 'on' : ''} onClick={() => go(t)} aria-current={t === tab ? 'page' : undefined}>
              {t}{t === 'Actions' ? ` (${pending ?? '…'})` : ''}
            </button>
          ))}
        </div>
        <div className="me"><span><b>{user.name}</b><br />{user.role}</span><button className="pill s" style={{ margin: 0 }} onClick={signOut}>Sign out</button></div>
      </div>
      {children}
    </div>
  );
}

export const Hd = ({ eb, h, p }) => (
  <Stage>
    <div className="hero sub" style={{ display: 'block', minHeight: 0 }}>
      <div className="eb">{eb}</div><h1>{h}</h1><p className="mut" style={{ maxWidth: 560 }}>{p}</p>
    </div>
  </Stage>
);

export const Foot = () => <p className="note">Decision support only. Every operational or clinical action is reviewed by authorised staff. The agent never diagnoses, prescribes or advises on treatment.</p>;

export const P = ({ t, c }) => <span className={`tag ${c}`} style={{ margin: 0 }}>{t}</span>;

export const T = ({ h, rows }) => (
  <div className="wrap">
    <table>
      <tbody>
        <tr>{h.map((x) => <th key={x}>{x}</th>)}</tr>
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

// Same screen as the original when something fails while drawing a page
export class Boundary extends Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  componentDidCatch(e) { console.error(e); }
  render() {
    if (!this.state.e) return this.props.children;
    return (
      <div className="stage"><div className="box"><h2>This screen hit a problem</h2><p className="mut">{String(this.state.e.message || this.state.e)}</p>
        <button className="pill" onClick={() => { this.setState({ e: null }); this.props.onReset(); }}>Back to start</button></div></div>
    );
  }
}
