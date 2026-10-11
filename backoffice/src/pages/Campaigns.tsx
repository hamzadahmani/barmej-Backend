import {api, json} from '../api';
import {Badge, Button, ErrorState, fmtDate, Loading, PageHeader, Table, useAction, useLoad} from '../ui';

type Campaign = {id: number; name: string; place: {id: number; name: string}; active: boolean; startsAt: string; endsAt: string; dailyBudget: number; totalBudget: number; impressions: number};

export default function Campaigns() {
  const run = useAction();
  const {data, error, loading, reload} = useLoad(() => api<Campaign[]>('/admin/v1/campaigns'), []);
  const now = Date.now();
  return (
    <>
      <PageHeader title="Campagnes sponsorisées" subtitle="Vidéos mises en avant dans le fil. Coupez une campagne en un clic." />
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : (
        <div className="card card-flush">
          <Table
            rows={data ?? []}
            rowKey={c => c.id}
            empty="Aucune campagne"
            columns={[
              {key: 'name', label: 'Campagne', render: c => <span><strong>{c.name}</strong><span className="muted block small">{c.place.name}</span></span>},
              {key: 'period', label: 'Période', render: c => `${fmtDate(c.startsAt)} → ${fmtDate(c.endsAt)}`},
              {key: 'budget', label: 'Budget / jour', align: 'right', render: c => `${c.dailyBudget.toLocaleString('fr-FR')} DT`},
              {key: 'total', label: 'Budget total', align: 'right', render: c => `${c.totalBudget.toLocaleString('fr-FR')} DT`},
              {key: 'imp', label: 'Impressions', align: 'right', render: c => c.impressions.toLocaleString('fr-FR')},
              {key: 'state', label: 'État', render: c => (!c.active ? <Badge value="EXPIRED" label="Coupée" /> : new Date(c.endsAt).getTime() < now ? <Badge value="EXPIRED" label="Terminée" /> : new Date(c.startsAt).getTime() > now ? <Badge value="PENDING" label="Programmée" /> : <Badge value="ACTIVE" label="En cours" />)},
              {key: 'x', label: '', align: 'right', render: c => (
                <Button small kind={c.active ? 'danger' : 'soft'} onClick={() => run(async () => { await api(`/admin/v1/campaigns/${c.id}`, json('PATCH', {active: !c.active})); reload(); }, c.active ? 'Campagne coupée' : 'Campagne réactivée')}>
                  {c.active ? 'Couper' : 'Réactiver'}
                </Button>
              )},
            ]}
          />
        </div>
      )}
    </>
  );
}
