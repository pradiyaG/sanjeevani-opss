import { api } from '../api';
import { Foot, Hd, Load, P, T, snapDate, useData } from '../ui';

const Grid = ({ w }) => (
  <div className="beds">{Array.from({ length: w.total }, (_, i) => <i key={i} className={i < w.occupied - w.blocked ? 'o' : i < w.occupied ? 'b' : 'f'} />)}</div>
);

export default function Beds() {
  const q = useData(api.beds);
  return (
    <>
      <Hd eb="Capacity" h="Beds & discharges" p="Where beds are free, full, or held up by pending discharge tasks." />
      <section>
        <Load q={q}>{({ wards, discharges, now }) => (
          <>
            <div className="cardw">
              <div className="lg"><span>🟦 Occupied</span><span>🟥 Held by a stuck discharge</span><span>🟩 Free</span><span>From beds.csv and discharge.csv · {snapDate(now)}</span></div>
              <div className="two" style={{ marginTop: 12 }}>
                {wards.map((w) => (
                  <div className="box" style={{ margin: 0 }} key={w.name}>
                    <div className="row"><b style={{ fontWeight: 500 }}>{w.name}</b><span className="mut">{w.free} free of {w.total}</span></div>
                    <Grid w={w} />
                    <div className="mut">{w.dept} · {w.note}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cardw">
              <h2 style={{ fontSize: 20 }}>Discharge requests</h2>
              <T h={['ID', 'Patient', 'Bed', 'Ward', 'Waiting on', 'Medication', 'Documents', 'Requested']} rows={discharges.map((d) => [d.code, d.patient, d.bed, d.ward, d.waitingOn, d.medication, d.documents, <P t={d.blocked ? `${d.delay} ago` : 'Leaving soon'} c={d.blocked ? 't-a' : 't-g'} />])} />
            </div>
          </>
        )}</Load>
      </section>
      <Foot />
    </>
  );
}
