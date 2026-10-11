import {MouseEvent, useMemo, useRef, useState} from 'react';
import {api} from '../api';
import {Empty, ErrorState, Loading, PageHeader, StatCard, Table, useLoad} from '../ui';

type Metric = {value: number; change: number | null};
type Analytics = {
  periodDays: number;
  totals: Record<'profileViews' | 'videoViews' | 'reservations' | 'newUsers' | 'barmejliPlans' | 'activeUsers', Metric>;
  conversionRate: number;
  daily: Array<{date: string; profileViews: number; videoViews: number; reservations: number; newUsers: number; barmejliPlans: number}>;
  sources: Array<{source: string; label: string; views: number}>;
  topPlaces: Array<{id: number; name: string; image: string | null; profileViews: number; videoViews: number; reservations: number; conversionRate: number}>;
  topVideos: Array<{id: number; placeName: string; url: string | null; thumbnailUrl: string | null; views: number; completions: number; completionRate: number}>;
  barmejli: {plans: number; saved: number; saveRate: number; averageBudget: number | null; cities: Array<{city: string; plans: number}>; moods: Array<{mood: string; plans: number}>};
};

// Couleurs validées (lisibles en daltonisme, séparées de 31 ΔE) ; libellés toujours visibles à côté.
const SERIES = [
  {key: 'profileViews', label: 'Vues de fiches', color: '#7251C9'},
  {key: 'videoViews', label: 'Vues de vidéos', color: '#C98A2E'},
] as const;

const fmt = (n: number) => n.toLocaleString('fr-FR');
const day = (iso: string, long = false) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', long ? {weekday: 'long', day: 'numeric', month: 'long'} : {day: 'numeric', month: 'short'});
const change = (m: Metric) => (m.change == null ? 'Pas de période précédente' : `${m.change > 0 ? '+' : ''}${m.change} % vs période précédente`);
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Courbes quotidiennes avec réticule et info-bulle au survol. */
function TrendChart({daily}: {daily: Analytics['daily']}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const w = 760, h = 230, left = 40, right = 96, top = 14, bottom = 28;
  const max = Math.max(4, ...daily.flatMap(d => [d.profileViews, d.videoViews]));
  // Graduation « ronde » : pas de 1, 2 ou 5 × 10ⁿ, quatre intervalles.
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find(m => m * magnitude >= raw) ?? 10) * magnitude;
  const niceMax = step * 4;
  const x = (i: number) => left + (daily.length > 1 ? (i / (daily.length - 1)) * (w - left - right) : 0);
  const y = (v: number) => top + (1 - v / niceMax) * (h - top - bottom);
  const tickEvery = Math.max(1, Math.ceil(daily.length / 7));
  const onMove = (event: MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((event.clientX - box.left) / box.width) * w;
    const i = Math.round(((px - left) / (w - left - right)) * (daily.length - 1));
    setHover(Math.min(daily.length - 1, Math.max(0, i)));
  };
  const point = hover != null ? daily[hover] : null;
  return (
    <div className="trend">
      <div className="legend">
        {SERIES.map(s => <span key={s.key}><i style={{background: s.color}} />{s.label}</span>)}
      </div>
      <div className="trend-plot">
        <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Vues de fiches et de vidéos par jour" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={left} x2={w - right} y1={y(niceMax * f)} y2={y(niceMax * f)} className={f === 0 ? 'chart-axis' : 'chart-grid'} />
              <text x={left - 8} y={y(niceMax * f) + 4} textAnchor="end" className="chart-tick">{fmt(niceMax * f)}</text>
            </g>
          ))}
          {daily.map((d, i) => (i % tickEvery === 0 || i === daily.length - 1 ? (
            <text key={d.date} x={x(i)} y={h - 8} textAnchor="middle" className="chart-tick">{day(d.date)}</text>
          ) : null))}
          {SERIES.map(s => {
            const path = daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`).join(' ');
            const last = daily.at(-1);
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {last ? <text x={w - right + 8} y={y(last[s.key]) + 4} className="chart-label">{fmt(last[s.key])} {s.key === 'profileViews' ? 'fiches' : 'vidéos'}</text> : null}
              </g>
            );
          })}
          {point != null && hover != null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={h - bottom} className="chart-crosshair" />
              {SERIES.map(s => <circle key={s.key} cx={x(hover)} cy={y(point[s.key])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />)}
            </g>
          ) : null}
        </svg>
        {point != null && hover != null ? (
          <div className="tooltip" style={{left: `${(x(hover) / w) * 100}%`}}>
            <strong>{capital(day(point.date, true))}</strong>
            {SERIES.map(s => <span key={s.key}><i style={{background: s.color}} />{s.label}<b>{fmt(point[s.key])}</b></span>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Barres horizontales (une seule couleur : c'est la longueur qui compte). */
function BarList({rows, unit}: {rows: Array<{label: string; value: number}>; unit: string}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <p className="muted small">Pas encore de données sur la période.</p>;
  return (
    <div className="barlist">
      {rows.map(r => (
        <div key={r.label} className="barlist-row" title={`${r.label} : ${fmt(r.value)} ${unit}`}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track"><span className="barlist-fill" style={{width: `${Math.max(2, (r.value / max) * 100)}%`}} /></span>
          <span className="barlist-value">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Statistics() {
  const [days, setDays] = useState(30);
  const {data, error, loading, reload} = useLoad(() => api<Analytics>(`/admin/v1/analytics?days=${days}`), [days]);
  const sourceRows = useMemo(() => (data?.sources ?? []).map(s => ({label: s.label, value: s.views})), [data]);
  const periods = (
    <div className="segmented" role="group" aria-label="Période">
      {[7, 30, 90].map(d => <button key={d} type="button" className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>{d} jours</button>)}
    </div>
  );
  if (loading && !data) return <><PageHeader title="Statistiques" actions={periods} /><Loading /></>;
  if (error || !data) return <><PageHeader title="Statistiques" actions={periods} /><ErrorState message={error ?? ''} retry={reload} /></>;
  const t = data.totals;
  return (
    <>
      <PageHeader title="Statistiques" subtitle={`Audience, conversion et Barmejli sur les ${data.periodDays} derniers jours.`} actions={periods} />
      <div className="stats">
        <StatCard accent label="Vues de fiches" value={fmt(t.profileViews.value)} hint={change(t.profileViews)} />
        <StatCard label="Vues de vidéos" value={fmt(t.videoViews.value)} hint={change(t.videoViews)} />
        <StatCard label="Utilisateurs actifs" value={fmt(t.activeUsers.value)} hint={change(t.activeUsers)} />
        <StatCard label="Réservations" value={fmt(t.reservations.value)} hint={`${data.conversionRate} % des vues de fiches`} />
        <StatCard label="Nouveaux comptes" value={fmt(t.newUsers.value)} hint={change(t.newUsers)} />
      </div>

      <div className="card">
        <div className="card-head"><h3>Audience par jour</h3><span className="muted">Survolez pour le détail</span></div>
        <TrendChart daily={data.daily} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>D’où viennent les vues de fiches</h3></div>
          <BarList rows={sourceRows} unit="vues" />
        </div>
        <div className="card">
          <div className="card-head"><h3>Barmejli</h3><span className="muted">{fmt(data.barmejli.plans)} programmes</span></div>
          <div className="mini-stats">
            <div><b>{data.barmejli.saveRate} %</b><span>sauvegardés</span></div>
            <div><b>{data.barmejli.averageBudget ?? '—'}{data.barmejli.averageBudget ? ' DT' : ''}</b><span>budget moyen</span></div>
            <div><b>{t.barmejliPlans.change == null ? '—' : `${t.barmejliPlans.change > 0 ? '+' : ''}${t.barmejliPlans.change} %`}</b><span>vs période précédente</span></div>
          </div>
          <p className="small muted section-label">Villes les plus demandées</p>
          <BarList rows={data.barmejli.cities.map(c => ({label: capital(c.city), value: c.plans}))} unit="programmes" />
          <p className="small muted section-label">Ambiances</p>
          <BarList rows={data.barmejli.moods.map(m => ({label: capital(m.mood), value: m.plans}))} unit="programmes" />
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head pad"><h3>Établissements les plus vus</h3></div>
        {data.topPlaces.length ? (
          <Table
            rows={data.topPlaces}
            rowKey={p => String(p.id)}
            columns={[
              {key: 'name', label: 'Établissement', render: p => <span className="cell-place">{p.image ? <img src={p.image} alt="" /> : <span className="thumb-empty" />}{p.name}</span>},
              {key: 'views', label: 'Vues fiche', align: 'right', render: p => fmt(p.profileViews)},
              {key: 'video', label: 'Vues vidéo', align: 'right', render: p => fmt(p.videoViews)},
              {key: 'res', label: 'Réservations', align: 'right', render: p => fmt(p.reservations)},
              {key: 'conv', label: 'Conversion', align: 'right', render: p => `${p.conversionRate} %`},
            ]}
          />
        ) : <Empty title="Aucune vue de fiche sur la période" text="Les vues sont comptées à partir de la mise à jour de l’app." />}
      </div>

      <div className="card card-flush">
        <div className="card-head pad"><h3>Vidéos les plus regardées</h3></div>
        {data.topVideos.length ? (
          <Table
            rows={data.topVideos}
            rowKey={v => String(v.id)}
            columns={[
              {key: 'video', label: 'Vidéo', render: v => <a className="cell-place" href={v.url ?? '#'} target="_blank" rel="noreferrer">{v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" /> : <span className="thumb-empty" />}{v.placeName}</a>},
              {key: 'views', label: 'Vues', align: 'right', render: v => fmt(v.views)},
              {key: 'done', label: 'Vues complètes', align: 'right', render: v => fmt(v.completions)},
              {key: 'rate', label: 'Taux', align: 'right', render: v => `${v.completionRate} %`},
            ]}
          />
        ) : <Empty title="Aucune vue de vidéo sur la période" />}
      </div>
    </>
  );
}
