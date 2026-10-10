import { useState } from 'react';
import { api } from '../api';

const ROLES = ['Medical Superintendent', 'Doctor', 'Nurse', 'Nursing Head', 'Lab Supervisor', 'Shift Manager', 'Department Head', 'Discharge Coordinator', 'Front Office / Reception'];

export default function Login({ onSignedIn }) {
  const [f, setF] = useState({ name: '', email: '', staffId: '', role: ROLES[0] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const signin = async () => {
    const n = f.name.trim(), e = f.email.trim(), i = f.staffId.trim();
    if (n.length < 2) return setErr('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('Please enter a valid work email.');
    if (!/^[A-Za-z]{2,5}-?\d{3,8}$/.test(i)) return setErr('Staff ID should look like SMH-10234.');
    setErr(''); setBusy(true);
    try { onSignedIn(await api.signIn({ name: n, email: e, staffId: i, role: f.role })); }
    catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="stage" style={{ minHeight: 'calc(100vh - 24px)' }}>
      <div className="nav"><span className="brand">SANJEEVANI</span><span className="mut">Multispeciality Hospital · Operations Agent</span></div>
      <div className="login">
        <div>
          <div className="eb">Staff sign-in</div>
          <h1 style={{ fontSize: 'clamp(32px,5vw,54px)' }}>Right view,<br />right person</h1>
          <p style={{ maxWidth: 380, opacity: 0.8 }}>Each role sees only the screens and approvals it is responsible for.</p>
          <div className="box" style={{ background: 'rgba(255,255,255,.5)', marginTop: 24 }}>
            <b style={{ fontWeight: 500 }}>Our goal</b>
            <div className="mut" style={{ color: 'var(--ink)', opacity: 0.75 }}>Find what is really blocking patient movement, rank it by urgency and impact, and get the right team to act, with a human approving every step.</div>
          </div>
        </div>
        <form className="cardw" noValidate onSubmit={(e) => { e.preventDefault(); signin(); }}>
          <h2 style={{ fontSize: 22 }}>Sign in</h2>
          <label htmlFor="ln">Full name</label><input id="ln" placeholder="Dr. Suresh Iyer" value={f.name} onChange={set('name')} autoComplete="name" />
          <label htmlFor="le">Work email</label><input id="le" type="email" placeholder="name@sanjeevani.org" value={f.email} onChange={set('email')} autoComplete="email" />
          <label htmlFor="li">Hospital staff ID</label><input id="li" placeholder="SMH-10234" value={f.staffId} onChange={set('staffId')} autoComplete="off" />
          <label htmlFor="lr">Role</label><select id="lr" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          {err && <div className="err" role="alert">{err}</div>}
          <div style={{ marginTop: 16 }}><button className="pill" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>Sign in</button></div>
        </form>
      </div>
    </div>
  );
}
