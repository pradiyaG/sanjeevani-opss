import { api } from '../api';
import { Foot, Hd, Load, P, T, st, useData } from '../ui';

const m = (v) => (v === null || v === undefined ? '–' : `${v} min`);
const who = (x) => (x ? `${x.available} of ${x.usual}` : '–');

export default function Diag() {
  const q = useData(api.diagStaff);
  return (
    <>
      <Hd eb="Tests, doctors and roster" h="Diagnostics & staff" p="Reports holding up patient movement, doctor workload, appointment slots and shift cover." />
      <section>
        <Load q={q}>{({ diagnostics, doctors, slots, roster }) => (
          <>
            <div className="cardw"><h2 style={{ fontSize: 20 }}>Late tests and reports ({diagnostics.length})</h2>
              {diagnostics.length ? <T h={['ID', 'Test', 'Dept', 'Patient', 'Status', 'Late by', 'Holds up']} rows={diagnostics.map((d) => [d.code, d.test, d.dept, d.patient, d.status, <P t={d.lateBy} c="t-r" />, d.holdsUp])} /> : <p className="mut">No test is past its expected completion time.</p>}</div>
            <div className="two">
              <div className="cardw"><h2 style={{ fontSize: 20 }}>Doctor workload today</h2>
                <T h={['Doctor', 'Dept', 'Today', 'Waiting', 'Avg wait', 'Open slots', 'Status']} rows={doctors.map((d) => [d.name, d.dept, d.today, d.waiting, m(d.avgWait), d.open, <P t={d.status} c={d.status === 'Overloaded' ? 't-r' : d.status === 'Busy' ? 't-a' : 't-g'} />])} /></div>
              <div className="cardw"><h2 style={{ fontSize: 20 }}>Clinics and appointment slots</h2>
                <T h={['Clinic', 'Booked today', 'Waiting', 'Avg wait', 'No-show', 'Status']} rows={slots.map((s) => [s.label, s.today, s.waitingNow, m(s.avgWait), `${s.noShow}%`, <P t={s.status} c={s.status === 'Normal' ? 't-g' : s.status === 'No-shows' ? 't-a' : 't-r'} />])} /></div>
            </div>
            <div className="cardw"><h2 style={{ fontSize: 20 }}>Shift cover today</h2>
              <T h={['Department', 'Shift', 'Doctors', 'Nurses', 'Status', 'Away']} rows={roster.map((r) => [r.dept, r.shift, who(r.doctors), who(r.nurses), <P t={r.status} c={st(r.status)} />, r.away.join(', ') || '–'])} />
              <p className="mut">"2 of 3" means available of the usual cover for that department's best-covered shift today. Shifts where a role is never rostered (for example doctors at night) are not counted as gaps.</p></div>
          </>
        )}</Load>
      </section>
      <Foot />
    </>
  );
}
