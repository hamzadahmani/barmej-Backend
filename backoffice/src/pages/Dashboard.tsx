import {api, Overview} from '../api';
import {ErrorState, Loading, PageHeader, StatCard, planLabels, useLoad} from '../ui';
import {go} from '../router';

function Bars({title, data, color}: {title: string; data: Array<{date: string; value: number}>; color: string}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const w = 560, h = 180, pad = 28, bw = (w - pad * 2) / data.length;
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="muted">{total} sur 14 jours</span></div>
      <svg viewBox={`0 0 ${w} ${h + 30}`} className="chart" role="img" aria-label={`${title} : ${total} sur 14 jours`}>
        <line x1={pad} x2={w - pad} y1={h} y2={h} className="chart-axis" />
        {data.map((d, i) => {
          const bh = (d.value / max) * (h - 30);
          const x = pad + i * bw + bw * 0.18;
          return (
            <g key={d.date}>
              <title>{`${new Date(`${d.date}T12:00:00`).toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})} : ${d.value}`}</title>
              <rect x={x} y={h - bh} width={bw * 0.64} height={Math.max(bh, d.value ? 2 : 0)} rx="4" fill={color} />
              {d.value ? <text x={x + bw * 0.32} y={h - bh - 6} textAnchor="middle" className="chart-value">{d.value}</text> : null}
              {i % 2 === 0 ? <text x={x + bw * 0.32} y={h + 20} textAnchor="middle" className="chart-tick">{Number(d.date.slice(8))}/{Number(d.date.slice(5, 7))}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Dashboard() {
  const {data, error, loading, reload} = useLoad(() => api<Overview>('/admin/v1/overview'), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? ''} retry={reload} />;
  const todo = [
    {label: 'Demandes de formule', value: data.subscriptionRequests, to: 'subscriptions'},
    {label: 'Médias à modérer', value: data.pendingMedia, to: 'moderation'},
    {label: 'Réservations en attente', value: data.pendingReservations, to: 'bookings'},
    {label: 'Séjours à confirmer', value: data.pendingStays, to: 'bookings'},
  ];
  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="L’activité de la plateforme Barmej en un coup d’œil." actions={<button className="btn btn-ghost btn-sm" onClick={reload}>Actualiser</button>} />
      <div className="todo">
        {todo.map(item => (
          <button key={item.label} className={`todo-item${item.value ? ' todo-hot' : ''}`} onClick={() => go(item.to)}>
            <span className="todo-value">{item.value}</span>
            <span>{item.label}</span>
            <span className="todo-arrow">›</span>
          </button>
        ))}
      </div>
      <div className="stats">
        <StatCard accent label="Utilisateurs" value={data.users.toLocaleString('fr-FR')} hint={`+${data.newUsers} cette semaine`} onClick={() => go('users')} />
        <StatCard label="Établissements" value={data.places} hint={`${data.verifiedPlaces} vérifiés`} onClick={() => go('places')} />
        <StatCard label="Réservations aujourd’hui" value={data.todayReservations} onClick={() => go('bookings')} />
        <StatCard label="Programmes Barmejli" value={data.barmejliPlans7d} hint="7 derniers jours" />
        <StatCard label="Signalements" value={data.reports30d} hint="30 derniers jours" onClick={() => go('moderation')} />
      </div>
      <div className="grid-2">
        <Bars title="Réservations créées par jour" color="var(--brand)" data={data.daily.map(d => ({date: d.date, value: d.reservations}))} />
        <Bars title="Nouveaux comptes par jour" color="var(--gold-strong)" data={data.daily.map(d => ({date: d.date, value: d.signups}))} />
      </div>
      <div className="card">
        <div className="card-head"><h3>Établissements par formule</h3></div>
        <div className="plans">
          {(['DISCOVERY', 'ESSENTIAL', 'PRO', 'PREMIUM'] as const).map(plan => (
            <div key={plan} className={`plan plan-${plan.toLowerCase()}`}>
              <span className="plan-value">{data.plans[plan] ?? 0}</span>
              <span>{planLabels[plan]}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Un établissement sans abonnement enregistré est en Découverte et n’apparaît pas ici.</p>
      </div>
    </>
  );
}
