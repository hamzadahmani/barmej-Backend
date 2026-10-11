import {useState} from 'react';
import {api, json, Page, Plan} from '../api';
import {Badge, Button, ErrorState, fmtDate, Loading, PageHeader, Pager, planLabels, Table, Tabs, useAction, useLoad} from '../ui';

type Row = {placeId: number; placeName: string; plan: Plan; status: string; requestedPlan: Plan | null; requestedAt: string | null; endsAt: string | null; activatedAt: string | null};
const PLANS: Plan[] = ['DISCOVERY', 'ESSENTIAL', 'PRO', 'PREMIUM'];

export default function Subscriptions() {
  const run = useAction();
  const [tab, setTab] = useState<'requests' | 'all'>('requests');
  const [page, setPage] = useState(1);
  const query = `/admin/v1/subscriptions?page=${page}${tab === 'requests' ? '&requested=true' : ''}`;
  const {data, error, loading, reload} = useLoad(() => api<Page<Row>>(query), [query]);

  const setPlan = (row: Row, plan: Plan, status = 'ACTIVE') => run(async () => {
    await api(`/admin/v1/subscriptions/${row.placeId}`, json('PUT', {plan, status}));
    reload();
  }, `${row.placeName} : formule ${planLabels[plan]} activée`);
  const decline = (row: Row) => run(async () => {
    await api(`/admin/v1/subscriptions/${row.placeId}/request`, json('DELETE'));
    reload();
  }, 'Demande refusée');

  return (
    <>
      <PageHeader title="Abonnements" subtitle="Validez les demandes de formule et ajustez les abonnements des établissements." />
      <Tabs value={tab} onChange={k => { setTab(k); setPage(1); }} items={[{key: 'requests', label: 'Demandes à traiter', count: tab === 'requests' ? data?.total : undefined}, {key: 'all', label: 'Tous les abonnements'}]} />
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        tab === 'requests' ? (
          data.items.length ? (
            <div className="cards">
              {data.items.map(row => (
                <div key={row.placeId} className="card request">
                  <div>
                    <strong>{row.placeName}</strong>
                    <p className="muted small">Demandé le {fmtDate(row.requestedAt, true)}</p>
                    <p className="request-plans"><Badge value={row.plan} /> <span>→</span> <Badge value={row.requestedPlan ?? 'DISCOVERY'} /></p>
                  </div>
                  <div className="row-gap">
                    <Button kind="ghost" onClick={() => decline(row)}>Refuser</Button>
                    <Button onClick={() => row.requestedPlan && setPlan(row, row.requestedPlan)}>Activer {planLabels[row.requestedPlan ?? 'DISCOVERY']}</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="card"><p className="muted">Aucune demande de formule en attente.</p></div>
        ) : (
          <div className="card card-flush">
            <Table
              rows={data.items}
              rowKey={r => r.placeId}
              columns={[
                {key: 'place', label: 'Établissement', render: r => <strong>{r.placeName}</strong>},
                {key: 'plan', label: 'Formule', render: r => (
                  <select value={r.plan} onChange={e => setPlan(r, e.target.value as Plan, r.status)}>
                    {PLANS.map(p => <option key={p} value={p}>{planLabels[p]}</option>)}
                  </select>
                )},
                {key: 'status', label: 'Statut', render: r => (
                  <select value={r.status} onChange={e => setPlan(r, r.plan, e.target.value)}>
                    <option value="ACTIVE">Active</option><option value="SUSPENDED">Suspendue</option><option value="EXPIRED">Expirée</option>
                  </select>
                )},
                {key: 'req', label: 'Demande', render: r => (r.requestedPlan ? <Badge value="PENDING" label={`→ ${planLabels[r.requestedPlan]}`} /> : '—')},
                {key: 'since', label: 'Activée le', render: r => fmtDate(r.activatedAt)},
                {key: 'ends', label: 'Fin', render: r => fmtDate(r.endsAt)},
              ]}
            />
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        )
      ) : null}
    </>
  );
}
