import {FormEvent, useEffect, useMemo, useState} from 'react';
import {api, json, Page, Plan} from '../api';
import {
  Badge, Button, Drawer, Empty, ErrorState, Field, fmtDate, Loading, PageHeader, Pager, planLabels, SearchInput, StatCard, Table, Tabs, useAction, useDebounced, useLoad,
} from '../ui';

type PaidPlan = Exclude<Plan, 'DISCOVERY'>;
type State = 'active' | 'expiring' | 'scheduled' | 'expired' | 'none';
type Period = {id: number; placeId: number; plan: PaidPlan; startsAt: string; endsAt: string; amount: number; months: number; note: string | null; state: 'active' | 'scheduled' | 'ended' | 'cancelled'; cancelledAt: string | null; createdAt: string};
type Row = {
  placeId: number; placeName: string; image: string | null; plan: Plan; status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'; state: State;
  current: Period | null; next: Period | null; lastEndedAt: string | null; daysLeft: number | null; totalPaid: number;
  requestedPlan: Plan | null; requestedAt: string | null;
};
type PlanInfo = {plan: Plan; label: string; tagline: string; features: string[]; monthlyPrice: number | null; yearlyPrice: number | null; places: number};
type Stats = {
  payingPlaces: number; freePlaces: number; placeCount: number; payingShare: number; mrr: number; arr: number; revenueThisMonth: number; revenueLast12: number;
  averageMonthlyPrice: number; renewalRate: number | null; pendingRequests: number;
  byPlan: Array<{plan: PaidPlan; active: number; mrr: number}>;
  monthly: Array<{month: string; revenue: number; newSubscriptions: number; renewals: number}>;
  expiringSoon: Array<{placeId: number; placeName: string; plan: PaidPlan; endsAt: string; daysLeft: number; amount: number}>;
  recentlyExpired: Array<{placeId: number; placeName: string; plan: PaidPlan; endedAt: string; amount: number}>;
};
type History = {place: {id: number; name: string}; periods: Period[]; prices: Partial<Record<Plan, {monthlyPrice: number; yearlyPrice: number | null}>>; suggestedStart: string};

const PAID: PaidPlan[] = ['ESSENTIAL', 'PRO', 'PREMIUM'];
const STATE_LABELS: Record<State, string> = {active: 'En cours', expiring: 'Expire bientôt', scheduled: 'Programmé', expired: 'Expiré', none: 'Sans abonnement'};
const PERIOD_LABELS: Record<Period['state'], string> = {active: 'En cours', scheduled: 'À venir', ended: 'Terminée', cancelled: 'Annulée'};
const dt = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('fr-FR')} DT`);
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});

/* ─── Dates (jours entiers, fin incluse) : mêmes règles que le serveur ─── */
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, n: number) => new Date(date.getTime() + n * 86_400_000);
const addMonths = (date: Date, months: number) => {
  const r = new Date(date); const dom = r.getUTCDate(); r.setUTCDate(1); r.setUTCMonth(r.getUTCMonth() + months);
  r.setUTCDate(Math.min(dom, new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate())); return r;
};
const monthsCovered = (start: Date, end: Date) => {
  const endEx = addDays(end, 1); let m = 0;
  while (addMonths(start, m + 1) <= endEx) m += 1;
  return Math.round((m + (endEx.getTime() - addMonths(start, m).getTime()) / 86_400_000 / 30.4375) * 100) / 100;
};
const suggested = (price: {monthlyPrice: number; yearlyPrice: number | null} | undefined, start: string, end: string) => {
  if (!price || !start || !end || day(end) < day(start)) return null;
  const months = monthsCovered(day(start), day(end));
  return months === 12 && price.yearlyPrice != null ? price.yearlyPrice : Math.round(price.monthlyPrice * months);
};

/* ─── Revenus par mois (une série : la hauteur compte) ─── */
function RevenueChart({rows}: {rows: Stats['monthly']}) {
  const w = 760, h = 220, left = 46, bottom = 26, top = 18;
  const max = Math.max(1, ...rows.map(r => r.revenue));
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find(m => m * mag >= raw) ?? 10) * mag;
  const niceMax = step * 4;
  const bw = (w - left - 8) / rows.length;
  const y = (v: number) => top + (1 - v / niceMax) * (h - top - bottom);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Revenus des abonnements par mois">
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={left} x2={w - 8} y1={y(niceMax * f)} y2={y(niceMax * f)} className={f ? 'chart-grid' : 'chart-axis'} />
          <text x={left - 8} y={y(niceMax * f) + 4} textAnchor="end" className="chart-tick">{(niceMax * f).toLocaleString('fr-FR')}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const x = left + i * bw + bw * 0.2, bh = (h - top - bottom) * (r.revenue / niceMax);
        return (
          <g key={r.month} className="bar-hover">
            <title>{`${monthLabel(r.month)} : ${dt(r.revenue)} · ${r.newSubscriptions} nouveau(x), ${r.renewals} renouvellement(s)`}</title>
            <rect x={left + i * bw} y={top} width={bw} height={h - top - bottom} fill="transparent" />
            <rect x={x} y={y(r.revenue)} width={bw * 0.6} height={Math.max(r.revenue ? 2 : 0, bh)} rx="4" fill="#7251C9" />
            {r.revenue ? <text x={x + bw * 0.3} y={y(r.revenue) - 5} textAnchor="middle" className="chart-value">{r.revenue.toLocaleString('fr-FR')}</text> : null}
            <text x={x + bw * 0.3} y={h - 8} textAnchor="middle" className="chart-tick">{monthLabel(r.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Panneau : historique et ajout d'une période ─── */
function PeriodDrawer({placeId, presetPlan, onClose, onChanged}: {placeId: number | 'pick' | null; presetPlan?: PaidPlan; onClose: () => void; onChanged: () => void}) {
  const run = useAction();
  const [picked, setPicked] = useState<{id: number; name: string} | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const activeId = placeId === 'pick' ? picked?.id ?? null : placeId;
  const places = useLoad(() => (placeId === 'pick' && !picked ? api<Page<{id: number; name: string; address?: string | null}>>(`/admin/v1/places?pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`) : Promise.resolve(undefined)), [placeId, picked, q]);
  const history = useLoad(() => (activeId ? api<History>(`/admin/v1/subscriptions/${activeId}/periods`) : Promise.resolve(undefined)), [activeId]);
  const [form, setForm] = useState({plan: 'PRO' as PaidPlan, startsAt: '', endsAt: '', amount: '', note: ''});
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => { if (placeId !== 'pick') setPicked(null); setSearch(''); }, [placeId]);
  useEffect(() => {
    if (!history.data) return;
    const start = history.data.suggestedStart;
    setForm({plan: presetPlan ?? 'PRO', startsAt: start, endsAt: iso(addDays(addMonths(day(start), 1), -1)), amount: '', note: ''});
    setAmountTouched(false);
  }, [history.data, presetPlan]);
  const autoAmount = suggested(history.data?.prices[form.plan], form.startsAt, form.endsAt);
  const amount = amountTouched ? form.amount : autoAmount == null ? '' : String(autoAmount);
  const setMonths = (m: number) => form.startsAt && setForm(f => ({...f, endsAt: iso(addDays(addMonths(day(f.startsAt), m), -1))}));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeId) return;
    void run(async () => {
      await api(`/admin/v1/subscriptions/${activeId}/periods`, json('POST', {plan: form.plan, startsAt: form.startsAt, endsAt: form.endsAt, amount: amount === '' ? undefined : Number(amount), note: form.note || undefined}));
      history.reload(); onChanged();
    }, 'Abonnement ajouté');
  };
  const cancel = (p: Period) => {
    if (!window.confirm(`Annuler la période ${planLabels[p.plan]} du ${fmtDate(p.startsAt)} au ${fmtDate(p.endsAt)} (${dt(p.amount)}) ?\n\nElle ne comptera plus dans les revenus. Si elle est en cours, l’établissement repasse en Découverte.`)) return;
    void run(async () => { await api(`/admin/v1/subscriptions/periods/${p.id}/cancel`, json('POST')); history.reload(); onChanged(); }, 'Période annulée');
  };
  const open = placeId !== null;
  const title = history.data?.place.name ?? (placeId === 'pick' ? 'Ajouter un abonnement' : 'Abonnement');

  return (
    <Drawer open={open} title={title} subtitle="Périodes d’abonnement : dates incluses, montant payé en dinars." onClose={onClose}
      footer={activeId ? <><Button kind="ghost" onClick={onClose}>Fermer</Button><Button type="submit" form="period-form">Ajouter la période</Button></> : <Button kind="ghost" onClick={onClose}>Fermer</Button>}>
      {placeId === 'pick' && !picked ? (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Chercher un établissement…" />
          <div className="checklist">
            {(places.data?.items ?? []).map(p => (
              <button type="button" key={p.id} className="check-row pick-row" onClick={() => setPicked({id: p.id, name: p.name})}>
                <strong>{p.name}</strong>{p.address ? <span className="muted small"> · {p.address}</span> : null}<span className="todo-arrow">›</span>
              </button>
            ))}
          </div>
        </>
      ) : history.error ? <ErrorState message={history.error} retry={history.reload} /> : !history.data ? <Loading /> : (
        <>
          <form id="period-form" className="card form-grid" onSubmit={submit}>
            <Field label="Formule">
              <select value={form.plan} onChange={e => setForm(f => ({...f, plan: e.target.value as PaidPlan}))}>
                {PAID.map(p => <option key={p} value={p}>{planLabels[p]}{history.data?.prices[p] ? ` · ${history.data.prices[p]!.monthlyPrice} DT/mois` : ''}</option>)}
              </select>
            </Field>
            <Field label="Durée rapide">
              <div className="row-actions start">{[1, 3, 6, 12].map(m => <Button key={m} small kind="ghost" onClick={() => setMonths(m)}>{m} mois</Button>)}</div>
            </Field>
            <Field label="Début"><input type="date" required value={form.startsAt} onChange={e => setForm(f => ({...f, startsAt: e.target.value}))} /></Field>
            <Field label="Fin (incluse)"><input type="date" required min={form.startsAt} value={form.endsAt} onChange={e => setForm(f => ({...f, endsAt: e.target.value}))} /></Field>
            <Field label="Montant payé (DT)" hint={autoAmount != null ? `Prix catalogue : ${dt(autoAmount)} pour ${monthsCovered(day(form.startsAt), day(form.endsAt))} mois.` : 'Fixez le prix de la formule dans « Formules et prix » pour un calcul automatique.'}>
              <input type="number" min={0} required value={amount} onChange={e => { setAmountTouched(true); setForm(f => ({...f, amount: e.target.value})); }} />
            </Field>
            <Field label="Note" hint="Mode de paiement, remise, référence…"><input value={form.note} maxLength={300} onChange={e => setForm(f => ({...f, note: e.target.value}))} /></Field>
          </form>
          <h3 className="section-title">Historique</h3>
          {history.data.periods.length ? (
            <div className="card card-flush">
              <Table rows={history.data.periods} rowKey={p => p.id} columns={[
                {key: 'plan', label: 'Formule', render: p => <Badge value={p.plan} />},
                {key: 'dates', label: 'Période', render: p => <span>{fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}<span className="muted small block">{p.months} mois{p.note ? ` · ${p.note}` : ''}</span></span>},
                {key: 'amount', label: 'Montant', align: 'right', render: p => <span className={p.state === 'cancelled' ? 'muted strike' : ''}>{dt(p.amount)}</span>},
                {key: 'state', label: 'État', render: p => <Badge value={`SUB_${p.state.toUpperCase()}`} label={PERIOD_LABELS[p.state]} />},
                {key: 'act', label: '', align: 'right', render: p => (p.state === 'cancelled' || p.state === 'ended' ? null : <Button small kind="ghost" onClick={() => cancel(p)}>Annuler</Button>)},
              ]} />
            </div>
          ) : <p className="muted">Aucune période pour l’instant : l’établissement est en Découverte (gratuit).</p>}
        </>
      )}
    </Drawer>
  );
}

/* ─── Onglets ─── */
function Overview({onOpen}: {onOpen: (placeId: number, plan?: PaidPlan) => void}) {
  const {data, error, loading, reload} = useLoad(() => api<Stats>('/admin/v1/subscriptions/stats'), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? ''} retry={reload} />;
  const maxPlan = Math.max(1, ...data.byPlan.map(p => p.mrr));
  return (
    <>
      <div className="stats">
        <StatCard accent label="Revenu mensuel récurrent" value={dt(data.mrr)} hint={`${dt(data.arr)} sur un an`} />
        <StatCard label="Établissements payants" value={`${data.payingPlaces} / ${data.placeCount}`} hint={`${data.payingShare} % des établissements`} />
        <StatCard label="Encaissé ce mois" value={dt(data.revenueThisMonth)} hint={`${dt(data.revenueLast12)} sur 12 mois`} />
        <StatCard label="Prix moyen" value={dt(data.averageMonthlyPrice)} hint="par établissement et par mois" />
        <StatCard label="Renouvellement" value={data.renewalRate == null ? '—' : `${data.renewalRate} %`} hint="fins de période sur 90 jours" />
      </div>
      <div className="card">
        <div className="card-head"><h3>Revenus par mois</h3><span className="muted">Montant compté au mois de début de période</span></div>
        <RevenueChart rows={data.monthly} />
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Par formule</h3><span className="muted">Abonnements en cours</span></div>
          <div className="barlist">
            {data.byPlan.map(p => (
              <div key={p.plan} className="barlist-row wide" title={`${planLabels[p.plan]} : ${p.active} établissement(s), ${dt(p.mrr)} par mois`}>
                <span className="barlist-label">{planLabels[p.plan]} · {p.active}</span>
                <span className="barlist-track"><span className="barlist-fill" style={{width: `${Math.max(2, (p.mrr / maxPlan) * 100)}%`}} /></span>
                <span className="barlist-value">{dt(p.mrr)}</span>
              </div>
            ))}
          </div>
          <p className="small muted">Revenu mensuel par formule ; le chiffre après le nom est le nombre d’établissements.</p>
        </div>
        <div className="card">
          <div className="card-head"><h3>Expirent dans 14 jours</h3><span className="muted">{data.expiringSoon.length}</span></div>
          {data.expiringSoon.length ? data.expiringSoon.map(e => (
            <div key={e.placeId} className="list-row">
              <div><strong>{e.placeName}</strong><span className="muted small block">{planLabels[e.plan]} · fin le {fmtDate(e.endsAt)} · {e.daysLeft === 0 ? 'aujourd’hui' : `dans ${e.daysLeft} j`}</span></div>
              <Button small onClick={() => onOpen(e.placeId, e.plan)}>Renouveler</Button>
            </div>
          )) : <p className="muted small">Aucune échéance proche.</p>}
          <div className="card-head spaced"><h3>Expirés récemment</h3><span className="muted">90 jours</span></div>
          {data.recentlyExpired.length ? data.recentlyExpired.slice(0, 8).map(e => (
            <div key={`${e.placeId}-${e.endedAt}`} className="list-row">
              <div><strong>{e.placeName}</strong><span className="muted small block">{planLabels[e.plan]} · terminé le {fmtDate(e.endedAt)}</span></div>
              <Button small kind="soft" onClick={() => onOpen(e.placeId, e.plan)}>Réabonner</Button>
            </div>
          )) : <p className="muted small">Aucun abonnement perdu.</p>}
        </div>
      </div>
    </>
  );
}

function PlacesTab({onOpen, refreshKey, requestsOnly}: {onOpen: (placeId: number, plan?: PaidPlan) => void; refreshKey: number; requestsOnly?: boolean}) {
  const run = useAction();
  const [q, setQ] = useState('');
  const [state, setState] = useState(requestsOnly ? '' : 'paying');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  useEffect(() => setPage(1), [search, state]);
  const params = new URLSearchParams({page: String(page), ...(search ? {q: search} : {}), ...(state ? {state} : {}), ...(requestsOnly ? {requested: 'true'} : {})});
  const {data, error, loading, reload} = useLoad(() => api<Page<Row>>(`/admin/v1/subscriptions?${params}`), [params.toString(), refreshKey]);
  const decline = (r: Row) => run(async () => { await api(`/admin/v1/subscriptions/${r.placeId}/request`, json('DELETE')); reload(); }, 'Demande refusée');
  const toggleStatus = (r: Row) => {
    const next = r.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    if (next === 'SUSPENDED' && !window.confirm(`Suspendre l’abonnement de ${r.placeName} ? Ses fonctionnalités payantes seront bloquées jusqu’à réactivation.`)) return;
    void run(async () => { await api(`/admin/v1/subscriptions/${r.placeId}/status`, json('PUT', {status: next})); reload(); }, next === 'SUSPENDED' ? 'Abonnement suspendu' : 'Abonnement réactivé');
  };

  if (requestsOnly) {
    if (loading && !data) return <Loading />;
    if (error || !data) return <ErrorState message={error ?? ''} retry={reload} />;
    return data.items.length ? (
      <div className="cards">
        {data.items.map(r => (
          <div key={r.placeId} className="card request">
            <div>
              <strong>{r.placeName}</strong>
              <p className="muted small">Demandé le {fmtDate(r.requestedAt, true)}</p>
              <p className="request-plans"><Badge value={r.plan} /> <span>→</span> <Badge value={r.requestedPlan ?? 'DISCOVERY'} /></p>
            </div>
            <div className="row-gap">
              <Button kind="ghost" onClick={() => decline(r)}>Refuser</Button>
              <Button onClick={() => onOpen(r.placeId, r.requestedPlan && r.requestedPlan !== 'DISCOVERY' ? r.requestedPlan : undefined)}>Activer avec des dates</Button>
            </div>
          </div>
        ))}
      </div>
    ) : <Empty title="Aucune demande de formule en attente" />;
  }

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Chercher un établissement…" />
        <select value={state} onChange={e => setState(e.target.value)}>
          <option value="">Tous les établissements</option>
          <option value="paying">Abonnés (payants)</option>
          <option value="expiring">Expirent bientôt</option>
          <option value="scheduled">Programmés</option>
          <option value="expired">Expirés</option>
          <option value="none">Sans abonnement</option>
        </select>
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table rows={data.items} rowKey={r => r.placeId} empty="Aucun établissement pour ce filtre" columns={[
            {key: 'place', label: 'Établissement', render: r => <span className="cell-place">{r.image ? <img src={r.image} alt="" /> : <span className="thumb-empty" />}{r.placeName}</span>},
            {key: 'plan', label: 'Formule', render: r => <span><Badge value={r.plan} />{r.status === 'SUSPENDED' ? <> <Badge value="SUSPENDED" label="Suspendue" /></> : null}</span>},
            {key: 'period', label: 'Période en cours', render: r => (r.current
              ? <span>{fmtDate(r.current.startsAt)} → {fmtDate(r.current.endsAt)}{r.next ? <span className="muted small block">puis {planLabels[r.next.plan]} dès le {fmtDate(r.next.startsAt)}</span> : null}</span>
              : r.next ? <span className="muted">Commence le {fmtDate(r.next.startsAt)}</span>
              : r.lastEndedAt ? <span className="muted">Terminé le {fmtDate(r.lastEndedAt)}</span> : <span className="muted">—</span>)},
            {key: 'left', label: 'Reste', align: 'right', render: r => (r.daysLeft == null ? '—' : r.daysLeft === 0 ? 'Dernier jour' : `${r.daysLeft} j`)},
            {key: 'amount', label: 'Montant', align: 'right', render: r => dt(r.current?.amount)},
            {key: 'total', label: 'Total payé', align: 'right', render: r => dt(r.totalPaid)},
            {key: 'state', label: 'État', render: r => <Badge value={`SUB_${r.state.toUpperCase()}`} label={STATE_LABELS[r.state]} />},
            {key: 'act', label: '', align: 'right', render: r => (
              <div className="row-actions">
                <Button small onClick={() => onOpen(r.placeId)}>{r.current || r.next ? 'Gérer' : '+ Abonnement'}</Button>
                {r.plan !== 'DISCOVERY' ? <Button small kind="ghost" onClick={() => toggleStatus(r)}>{r.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}</Button> : null}
              </div>
            )},
          ]} />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
}

function PlansTab() {
  const run = useAction();
  const {data, error, loading, reload} = useLoad(() => api<PlanInfo[]>('/admin/v1/subscription-plans'), []);
  const [draft, setDraft] = useState<Record<string, {monthly: string; yearly: string}>>({});
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.map(p => [p.plan, {monthly: p.monthlyPrice == null ? '' : String(p.monthlyPrice), yearly: p.yearlyPrice == null ? '' : String(p.yearlyPrice)}])));
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? ''} retry={reload} />;
  const save = (plan: Plan) => {
    const d = draft[plan];
    if (!d || d.monthly === '') return;
    void run(async () => {
      await api(`/admin/v1/subscription-plans/${plan}`, json('PUT', {monthlyPrice: Number(d.monthly), yearlyPrice: d.yearly === '' ? null : Number(d.yearly)}));
      reload();
    }, `Prix ${planLabels[plan]} enregistré`);
  };
  return (
    <div className="plan-cards">
      {data.map(p => (
        <div key={p.plan} className={`card plan-card plan-${p.plan.toLowerCase()}`}>
          <div><h3>{p.label}</h3><span className="muted small">{p.places} établissement(s)</span></div>
          <p className="muted small">{p.tagline}</p>
          <div className="price-line">{p.monthlyPrice == null ? <span className="muted">Prix à définir</span> : <><b>{dt(p.monthlyPrice)}</b><span className="muted"> / mois</span>{p.yearlyPrice != null ? <span className="muted small block">ou {dt(p.yearlyPrice)} / an</span> : null}</>}</div>
          {p.plan === 'DISCOVERY' ? <p className="small muted">Formule gratuite.</p> : (
            <form className="price-form" onSubmit={e => { e.preventDefault(); save(p.plan); }}>
              <Field label="Prix mensuel (DT)"><input type="number" min={0} required value={draft[p.plan]?.monthly ?? ''} onChange={e => setDraft(s => ({...s, [p.plan]: {...s[p.plan]!, monthly: e.target.value}}))} /></Field>
              <Field label="Prix annuel (DT)" hint="Facultatif"><input type="number" min={0} value={draft[p.plan]?.yearly ?? ''} onChange={e => setDraft(s => ({...s, [p.plan]: {...s[p.plan]!, yearly: e.target.value}}))} /></Field>
              <Button small type="submit">Enregistrer</Button>
            </form>
          )}
          <details className="features"><summary>{p.features.length} fonctionnalités</summary><ul>{p.features.map(f => <li key={f}>{FEATURE_LABELS[f] ?? f}</li>)}</ul></details>
        </div>
      ))}
    </div>
  );
}

const FEATURE_LABELS: Record<string, string> = {
  PROFILE: 'Fiche établissement', RESERVATIONS: 'Réservations', PHOTOS: 'Photos', BASIC_STATS: 'Statistiques de base', QR_SCANNER: 'Scan des billets QR',
  EVENTS: 'Événements', REVIEWS: 'Réponses aux avis', WAITLIST: 'Liste d’attente', VIDEO: 'Vidéos dans le fil', LOYALTY: 'Programme de fidélité',
  ADVANCED_STATS: 'Statistiques avancées', CUSTOMER_INSIGHTS: 'Connaissance client', SPONSORED_CAMPAIGNS: 'Campagnes sponsorisées',
  FEED_PRIORITY: 'Priorité dans le fil', PREMIUM_SUPPORT: 'Support prioritaire',
};

export default function Subscriptions() {
  type Tab = 'overview' | 'places' | 'requests' | 'plans';
  const [tab, setTab] = useState<Tab>('overview');
  const [drawer, setDrawer] = useState<{placeId: number | 'pick'; plan?: PaidPlan} | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requests = useLoad(() => api<Page<Row>>('/admin/v1/subscriptions?requested=true&pageSize=5'), [refreshKey]);
  const open = (placeId: number, plan?: PaidPlan) => setDrawer({placeId, plan});
  const tabs = useMemo(() => [
    {key: 'overview' as Tab, label: 'Vue d’ensemble'},
    {key: 'places' as Tab, label: 'Établissements'},
    {key: 'requests' as Tab, label: 'Demandes', count: requests.data?.total},
    {key: 'plans' as Tab, label: 'Formules et prix'},
  ], [requests.data]);
  return (
    <>
      <PageHeader title="Abonnements" subtitle="Formules, prix, périodes d’abonnement et revenus des établissements."
        actions={<Button onClick={() => setDrawer({placeId: 'pick'})}>+ Ajouter un abonnement</Button>} />
      <Tabs<Tab> value={tab} onChange={setTab} items={tabs} />
      {tab === 'overview' ? <Overview key={refreshKey} onOpen={open} />
        : tab === 'places' ? <PlacesTab onOpen={open} refreshKey={refreshKey} />
        : tab === 'requests' ? <PlacesTab key="requests" requestsOnly onOpen={open} refreshKey={refreshKey} />
        : <PlansTab />}
      <PeriodDrawer placeId={drawer?.placeId ?? null} presetPlan={drawer?.plan} onClose={() => setDrawer(null)} onChanged={() => setRefreshKey(k => k + 1)} />
    </>
  );
}
