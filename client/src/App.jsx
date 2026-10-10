import { useCallback, useEffect, useState } from 'react';
import { api, auth } from './api';
import { Boundary, Ctx } from './ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Triage from './pages/Triage';
import Issues from './pages/Issues';
import Actions from './pages/Actions';
import Beds from './pages/Beds';
import Diag from './pages/Diag';
import Complaints from './pages/Complaints';
import Data from './pages/Data';

const V = { 'Overview': Overview, 'Patient Triage': Triage, 'Issues': Issues, 'Actions': Actions, 'Beds & Discharges': Beds, 'Diagnostics & Staff': Diag, 'Complaints': Complaints, 'Data': Data };
const TAB_KEY = 'sanjeevani.tab';
const savedTab = () => { try { return sessionStorage.getItem(TAB_KEY) || ''; } catch { return ''; } };

export default function App() {
  const [user, setUser] = useState(auth.user);
  const [tab, setTab] = useState(() => (auth.user && auth.user.permissions.tabs.includes(savedTab()) ? savedTab() : auth.user?.permissions.tabs[0] || ''));
  const [pending, setPending] = useState(null);

  const refresh = useCallback(() => { if (auth.user) api.meta().then((m) => setPending(m.pending), () => {}); }, []);
  const signOut = useCallback(() => { auth.clear(); setUser(null); setTab(''); setPending(null); }, []);
  useEffect(() => { auth.onExpired(signOut); }, [signOut]);
  useEffect(() => { refresh(); }, [refresh, user, tab]);

  const go = (t) => { setTab(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ } window.scrollTo(0, 0); };
  const onSignedIn = (s) => { auth.set(s); setUser(s.user); go(s.user.permissions.tabs[0]); };

  if (!user) return <Login onSignedIn={onSignedIn} />;
  const Page = V[tab] || V[user.permissions.tabs[0]];
  return (
    <Ctx.Provider value={{ user, tab, go, pending, refresh, signOut, perm: user.permissions }}>
      <Boundary key={tab} onReset={() => go(user.permissions.tabs[0])}>
        <Page />
      </Boundary>
    </Ctx.Provider>
  );
}
