import {useEffect, useState} from 'react';
import {AdminUser, api, json, Page, Role} from '../api';
import {ErrorState, fmtDate, fullName, Loading, PageHeader, Pager, roleLabels, SearchInput, Table, useAction, useDebounced, useLoad} from '../ui';

type Row = AdminUser & {createdAt: string; places: Array<{id: number; name: string}>; reservations: number; stays: number; plans: number};
const ROLES: Role[] = ['USER', 'ESTABLISHMENT', 'SCANNER', 'ADMIN'];

export default function Users({me}: {me: AdminUser}) {
  const run = useAction();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  useEffect(() => setPage(1), [search, role]);
  const params = new URLSearchParams({page: String(page), ...(search ? {q: search} : {}), ...(role ? {role} : {})});
  const {data, error, loading, reload} = useLoad(() => api<Page<Row>>(`/admin/v1/users?${params}`), [params.toString()]);

  const changeRole = (user: Row, next: Role) => {
    if (next === user.role) return;
    const warning = next === 'ADMIN' ? '\n\nUn administrateur a accès à tout le backoffice.' : '';
    if (!window.confirm(`Passer ${fullName(user)} en « ${roleLabels[next]} » ?${warning}`)) return;
    void run(async () => {
      await api(`/admin/v1/users/${user.id}`, json('PATCH', {role: next}));
      reload();
    }, 'Rôle mis à jour');
  };

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes clients, gérants et administrateurs." />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail ou téléphone…" />
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="">Tous les rôles</option>
          {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table
            rows={data.items}
            rowKey={u => u.id}
            columns={[
              {key: 'name', label: 'Utilisateur', render: u => <div><strong>{fullName(u)}</strong><span className="muted small block">{u.email}</span></div>},
              {key: 'mobile', label: 'Téléphone', render: u => u.mobile ?? '—'},
              {key: 'role', label: 'Rôle', render: u => (
                <select value={u.role} disabled={u.id === me.id} onChange={e => changeRole(u, e.target.value as Role)}>
                  {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
                </select>
              )},
              {key: 'places', label: 'Établissements gérés', render: u => (u.places.length ? u.places.map(p => p.name).join(', ') : '—')},
              {key: 'activity', label: 'Activité', render: u => <span className="muted small">{u.reservations} rés. · {u.stays} séjours · {u.plans} programmes</span>},
              {key: 'created', label: 'Inscrit le', render: u => fmtDate(u.createdAt)},
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
}
