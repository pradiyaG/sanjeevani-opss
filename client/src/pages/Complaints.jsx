import { api } from '../api';
import { Foot, Hd, Load, P, T, st, useData } from '../ui';

export default function Complaints() {
  const q = useData(api.complaints);
  return (
    <>
      <Hd eb="Feedback" h="Complaints & causes" p="Most complaints are symptoms of flow problems, not behaviour." />
      <section>
        <Load q={q}>{({ feedback, linked }) => (
          <div className="cardw">
            <p className="mut" style={{ marginTop: 0 }}>{linked} of {feedback.length} complaints trace to an operational issue the agent found. Fixing the bottleneck resolves them at source; the rest go to the usual teams.</p>
            <T h={['ID', 'Date', 'Complaint', 'Department', 'Category', 'Severity', 'Linked issue', 'Status']} rows={feedback.map((c) => [
              c.feedback_id, c.date, c.comment || '–', c.department, c.category, <P t={c.severity} c={c.severity === 'High' ? 't-r' : c.severity === 'Medium' ? 't-a' : 't-g'} />,
              c.issue || 'Not operational', <P t={c.resolution_status} c={/resolved|closed/i.test(c.resolution_status) ? 't-g' : st(c.resolution_status)} />])} />
          </div>
        )}</Load>
      </section>
      <Foot />
    </>
  );
}
