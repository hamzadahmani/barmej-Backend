import {useEffect, useState} from 'react';
import {api, Page} from '../api';
import {Badge, ErrorState, fmtDate, fullName, Loading, PageHeader, Pager, SearchInput, Table, Tabs, useDebounced, useLoad} from '../ui';

type Person = {firstName: string; lastName: string; email: string; mobile?: string | null} | null;
type Reservation = {id: number; place: {id: number; name: string}; user: Person; date: string; time: string; persons: number; status: string; message: string | null; createdAt: string};
type Stay = {id: number; place: {id: number; name: string}; user: Person; checkIn: string; checkOut: string; nights: number; guests: number; rooms: number; estimate: number | null; status: string; createdAt: string};
const statusOptions = (
  <>
    <option value="">Tous les statuts</option>
    <option value="PENDING">En attente</option><option value="PROPOSED">Proposé</option><option value="CONFIRMED">Confirmé</option>
    <option value="COMPLETED">Terminé</option><option value="DECLINED">Refusé</option><option value="CANCELLED">Annulé</option><option value="NO_SHOW">Absent</option>
  </>
);

function Reservations() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  useEffect(() => setPage(1), [status, from, to, search]);
  const params = new URLSearchParams({page: String(page), ...(status ? {status} : {}), ...(from ? {from} : {}), ...(to ? {to} : {}), ...(search ? {q: search} : {})});
  const {data, error, loading, reload} = useLoad(() => api<Page<Reservation>>(`/admin/v1/reservations?${params}`), [params.toString()]);
  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Établissement ou client…" />
        <select value={status} onChange={e => setStatus(e.target.value)}>{statusOptions}</select>
        <label className="date-filter">Du <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="date-filter">au <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table
            rows={data.items}
            rowKey={r => r.id}
            empty="Aucune réservation pour ces filtres"
            columns={[
              {key: 'when', label: 'Date', render: r => <span><strong>{fmtDate(r.date)}</strong><span className="muted block small">{r.time}</span></span>},
              {key: 'place', label: 'Établissement', render: r => r.place.name},
              {key: 'user', label: 'Client', render: r => <span>{fullName(r.user)}<span className="muted block small">{r.user?.mobile ?? r.user?.email}</span></span>},
              {key: 'persons', label: 'Pers.', align: 'center', render: r => r.persons},
              {key: 'status', label: 'Statut', render: r => <Badge value={r.status} />},
              {key: 'created', label: 'Créée le', render: r => fmtDate(r.createdAt, true)},
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
}

function Stays() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = `/admin/v1/stays?page=${page}${status ? `&status=${status}` : ''}`;
  const {data, error, loading, reload} = useLoad(() => api<Page<Stay>>(query), [query]);
  return (
    <>
      <div className="toolbar"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{statusOptions}</select></div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table
            rows={data.items}
            rowKey={s => s.id}
            empty="Aucun séjour"
            columns={[
              {key: 'dates', label: 'Séjour', render: s => <span><strong>{fmtDate(s.checkIn)} → {fmtDate(s.checkOut)}</strong><span className="muted block small">{s.nights} nuit{s.nights > 1 ? 's' : ''}</span></span>},
              {key: 'place', label: 'Maison d’hôtes', render: s => s.place.name},
              {key: 'user', label: 'Voyageur', render: s => <span>{fullName(s.user)}<span className="muted block small">{s.user?.mobile ?? s.user?.email}</span></span>},
              {key: 'who', label: 'Voyageurs / ch.', align: 'center', render: s => `${s.guests} / ${s.rooms}`},
              {key: 'est', label: 'Estimation', align: 'right', render: s => (s.estimate != null ? `${s.estimate} DT` : '—')},
              {key: 'status', label: 'Statut', render: s => <Badge value={s.status} />},
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
}

export default function Bookings() {
  const [tab, setTab] = useState<'reservations' | 'stays'>('reservations');
  return (
    <>
      <PageHeader title="Réservations" subtitle="Toutes les réservations de tables et de séjours de la plateforme, en lecture." />
      <Tabs value={tab} onChange={setTab} items={[{key: 'reservations', label: 'Tables'}, {key: 'stays', label: 'Séjours'}]} />
      {tab === 'reservations' ? <Reservations /> : <Stays />}
    </>
  );
}
