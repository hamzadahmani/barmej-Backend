import {useState} from 'react';
import {api, json, Page} from '../api';
import {Badge, Button, Empty, ErrorState, fmtDate, fullName, Loading, PageHeader, Pager, Table, Tabs, useAction, useLoad} from '../ui';

type Media = {id: number; placeId: number; placeName: string; url: string; type: 'COVER' | 'GALLERY' | 'VIDEO'; keywords: string[]; duration: number | null; active: boolean; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string};
type Menu = {id: number; placeId: number; placeName: string; imageUrl: string; items: number; validatedAt: string | null; active: boolean; updatedAt: string};
type Report = {id: number; description: string; createdAt: string; place: {id: number; name: string}; user: {firstName: string; lastName: string; email: string} | null; flagged?: boolean};
type Review = {id: number; place: {id: number; name: string}; user: {firstName: string; lastName: string; email: string} | null; comment: string | null; rating: number; response: string | null; createdAt: string; flagged?: boolean};
type TabKey = 'media' | 'menus' | 'reports' | 'reviews';

function MediaTab() {
  const run = useAction();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const query = `/admin/v1/media?page=${page}&pageSize=24${status ? `&status=${status}` : ''}`;
  const {data, error, loading, reload} = useLoad(() => api<Page<Media>>(query), [query]);
  const moderate = (m: Media, body: {status?: string; active?: boolean}, message: string) => run(async () => {
    await api(`/admin/v1/media/${m.id}`, json('PATCH', body));
    reload();
  }, message);
  return (
    <>
      <div className="toolbar">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="PENDING">À modérer</option><option value="APPROVED">Approuvés</option><option value="REJECTED">Refusés</option><option value="">Tous</option>
        </select>
        <span className="muted small">Seules les vidéos approuvées et actives apparaissent dans le fil.</span>
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : !data?.items.length ? <Empty title="Rien à modérer" text="Les nouveaux médias apparaîtront ici." /> : (
        <>
          <div className="media-grid">
            {data.items.map(m => (
              <div key={m.id} className="media-card">
                <div className="media-frame">
                  {m.type === 'VIDEO' ? <video src={m.url} controls preload="metadata" /> : <img src={m.url} alt={`Média de ${m.placeName}`} loading="lazy" />}
                  <span className="media-type">{m.type === 'VIDEO' ? `Vidéo${m.duration ? ` · ${Math.round(m.duration)} s` : ''}` : m.type === 'COVER' ? 'Couverture' : 'Photo'}</span>
                </div>
                <div className="media-meta">
                  <strong>{m.placeName}</strong>
                  <span className="muted small">{fmtDate(m.createdAt)}{m.keywords.length ? ` · ${m.keywords.join(', ')}` : ''}</span>
                  <span className="row-gap"><Badge value={m.status} />{!m.active ? <Badge value="EXPIRED" label="Masqué" /> : null}</span>
                </div>
                <div className="media-actions">
                  {m.status !== 'APPROVED' ? <Button small onClick={() => moderate(m, {status: 'APPROVED', active: true}, 'Média approuvé')}>Approuver</Button> : null}
                  {m.status !== 'REJECTED' ? <Button small kind="danger" onClick={() => moderate(m, {status: 'REJECTED', active: false}, 'Média refusé')}>Refuser</Button> : null}
                  {m.status === 'APPROVED' ? <Button small kind="ghost" onClick={() => moderate(m, {active: !m.active}, m.active ? 'Média masqué' : 'Média réaffiché')}>{m.active ? 'Masquer' : 'Réafficher'}</Button> : null}
                </div>
              </div>
            ))}
          </div>
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

function MenusTab() {
  const run = useAction();
  const [page, setPage] = useState(1);
  const {data, error, loading, reload} = useLoad(() => api<Page<Menu>>(`/admin/v1/menus?page=${page}`), [page]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <div className="card card-flush">
      <Table
        rows={data?.items ?? []}
        rowKey={m => m.id}
        empty="Aucun menu photo"
        columns={[
          {key: 'img', label: 'Photo', width: '84px', render: m => <a href={m.imageUrl} target="_blank" rel="noreferrer"><img src={m.imageUrl} alt="Menu" className="thumb thumb-lg" /></a>},
          {key: 'place', label: 'Établissement', render: m => <strong>{m.placeName}</strong>},
          {key: 'items', label: 'Plats lus', align: 'center', render: m => m.items},
          {key: 'validated', label: 'Validé par le gérant', render: m => (m.validatedAt ? fmtDate(m.validatedAt) : <Badge value="PENDING" label="Brouillon" />)},
          {key: 'active', label: 'Visible', render: m => (m.active ? <Badge value="APPROVED" label="Visible" /> : <Badge value="EXPIRED" label="Masqué" />)},
          {key: 'x', label: '', align: 'right', render: m => (
            <Button small kind={m.active ? 'danger' : 'soft'} disabled={!m.validatedAt} onClick={() => run(async () => { await api(`/admin/v1/menus/${m.id}`, json('PATCH', {active: !m.active})); reload(); }, m.active ? 'Menu masqué' : 'Menu affiché')}>
              {m.active ? 'Masquer' : 'Afficher'}
            </Button>
          )},
        ]}
      />
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}

function ReportsTab() {
  const run = useAction();
  const [page, setPage] = useState(1);
  const {data, error, loading, reload} = useLoad(() => api<Page<Report>>(`/admin/v1/reports?page=${page}`), [page]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <div className="card card-flush">
      <Table
        rows={data?.items ?? []}
        rowKey={r => r.id}
        empty="Aucun signalement"
        columns={[
          {key: 'date', label: 'Date', width: '130px', render: r => fmtDate(r.createdAt)},
          {key: 'place', label: 'Établissement', render: r => <strong>{r.place.name}</strong>},
          {key: 'desc', label: 'Signalement', render: r => <span className="pre">{r.flagged ? <><Badge value="FLAGGED" label="Propos insultants" />{' '}</> : null}{r.description}</span>},
          {key: 'user', label: 'Par', render: r => <span className="small">{fullName(r.user)}<span className="muted block">{r.user?.email}</span></span>},
          {key: 'x', label: '', align: 'right', render: r => (
            <Button small kind="ghost" onClick={() => window.confirm('Classer ce signalement ? Il sera supprimé de la liste.') && run(async () => { await api(`/admin/v1/reports/${r.id}`, json('DELETE')); reload(); }, 'Signalement classé')}>Classer</Button>
          )},
        ]}
      />
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}

function ReviewsTab() {
  const run = useAction();
  const [page, setPage] = useState(1);
  const {data, error, loading, reload} = useLoad(() => api<Page<Review>>(`/admin/v1/reviews?page=${page}`), [page]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <div className="card card-flush">
      <Table
        rows={data?.items ?? []}
        rowKey={r => r.id}
        empty="Aucun avis"
        columns={[
          {key: 'date', label: 'Date', width: '130px', render: r => fmtDate(r.createdAt)},
          {key: 'place', label: 'Établissement', render: r => <strong>{r.place.name}</strong>},
          {key: 'rating', label: 'Note', align: 'center', render: r => <span className={`rating rating-${r.rating >= 4 ? 'good' : r.rating >= 3 ? 'mid' : 'bad'}`}>{r.rating.toFixed(1)} / 5</span>},
          {key: 'comment', label: 'Commentaire', render: r => <span className="pre">{r.flagged ? <><Badge value="FLAGGED" label="Propos insultants" />{' '}</> : null}{r.comment || '—'}{r.response ? <span className="muted block small">Réponse : {r.response}</span> : null}</span>},
          {key: 'user', label: 'Client', render: r => <span className="small">{fullName(r.user)}</span>},
          {key: 'x', label: '', align: 'right', render: r => (
            <Button small kind="danger" onClick={() => window.confirm('Supprimer définitivement cet avis ?') && run(async () => { await api(`/admin/v1/reviews/${r.id}`, json('DELETE')); reload(); }, 'Avis supprimé')}>Supprimer</Button>
          )},
        ]}
      />
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}

export default function Moderation() {
  const [tab, setTab] = useState<TabKey>('media');
  return (
    <>
      <PageHeader title="Modération" subtitle="Photos et vidéos, menus, signalements et avis." />
      <Tabs value={tab} onChange={setTab} items={[{key: 'media', label: 'Photos et vidéos'}, {key: 'menus', label: 'Menus'}, {key: 'reports', label: 'Signalements'}, {key: 'reviews', label: 'Avis'}]} />
      {tab === 'media' ? <MediaTab /> : tab === 'menus' ? <MenusTab /> : tab === 'reports' ? <ReportsTab /> : <ReviewsTab />}
    </>
  );
}
