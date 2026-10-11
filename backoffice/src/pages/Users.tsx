import {FormEvent, useEffect, useState} from 'react';
import {AdminUser, api, json, Page, Role} from '../api';
import {
  Badge, Button, Drawer, ErrorState, Field, fmtDate, fullName, Loading, PageHeader, Pager, roleLabels, SearchInput, Table, Tabs, useAction, useDebounced, useLoad,
} from '../ui';

type Row = AdminUser & {createdAt: string; places: Array<{id: number; name: string}>; reservations: number; stays: number; plans: number};
type Kind = 'public' | 'pro' | 'admin';
type PlaceOption = {id: number; name: string; address?: string | null};

const PRO_ROLES: Role[] = ['ESTABLISHMENT', 'SCANNER'];

/** Mot de passe provisoire lisible (sans caractères ambigus), à transmettre au gérant. */
const generatePassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};

function StatusCell({user}: {user: Row}) {
  if (!user.suspendedAt) return <Badge value="ACTIVE" label="Actif" />;
  return (
    <div>
      <Badge value="SUSPENDED" label="Suspendu" />
      <span className="muted small block">depuis le {fmtDate(user.suspendedAt)}{user.suspendedReason ? ` · ${user.suspendedReason}` : ''}</span>
    </div>
  );
}

/** Création d'un compte Pro : identité, rôle, mot de passe provisoire et établissements gérés. */
function ProAccountDrawer({open, onClose, onCreated}: {open: boolean; onClose: () => void; onCreated: () => void}) {
  const run = useAction();
  const empty = {email: '', firstName: '', lastName: '', mobile: '', role: 'ESTABLISHMENT' as Role, password: ''};
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState<PlaceOption[]>([]);
  const [search, setSearch] = useState('');
  const [created, setCreated] = useState<{email: string; password: string} | null>(null);
  const q = useDebounced(search);
  const places = useLoad(
    () => (open ? api<Page<PlaceOption>>(`/admin/v1/places?pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`) : Promise.resolve(undefined)),
    [open, q],
  );
  useEffect(() => {
    if (open) { setForm({...empty, password: generatePassword()}); setSelected([]); setSearch(''); setCreated(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (key: keyof typeof empty) => (value: string) => setForm(f => ({...f, [key]: value}));
  const toggle = (place: PlaceOption) =>
    setSelected(list => (list.some(p => p.id === place.id) ? list.filter(p => p.id !== place.id) : [...list, place]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api('/admin/v1/pro-accounts', json('POST', {...form, mobile: form.mobile || null, placeIds: selected.map(p => p.id)}));
      setCreated({email: form.email.trim().toLowerCase(), password: form.password});
      onCreated();
    }, 'Compte Pro créé');
  };

  return (
    <Drawer
      open={open}
      title="Nouveau compte Pro"
      subtitle="Pour un gérant d’établissement ou une personne au contrôle des QR codes."
      onClose={onClose}
      footer={created
        ? <Button onClick={onClose}>Terminé</Button>
        : <><Button kind="ghost" onClick={onClose}>Annuler</Button><Button type="submit" form="pro-account-form">Créer le compte</Button></>}
    >
      {created ? (
        <div className="card">
          <h3>Compte créé</h3>
          <p className="muted small" style={{margin: '6px 0 12px'}}>Transmettez ces identifiants au gérant de façon privée. Le mot de passe ne sera plus affiché ensuite.</p>
          <div className="credentials">
            <span>E-mail</span><strong>{created.email}</strong>
            <span>Mot de passe provisoire</span><strong className="mono">{created.password}</strong>
          </div>
          <Button kind="soft" small onClick={() => void navigator.clipboard?.writeText(`Barmej Pro\nE-mail : ${created.email}\nMot de passe : ${created.password}`)}>Copier les identifiants</Button>
        </div>
      ) : (
        <form id="pro-account-form" className="form-grid" onSubmit={submit}>
          <Field label="E-mail" wide><input type="email" required value={form.email} onChange={e => set('email')(e.target.value)} /></Field>
          <Field label="Prénom"><input required value={form.firstName} onChange={e => set('firstName')(e.target.value)} /></Field>
          <Field label="Nom"><input value={form.lastName} onChange={e => set('lastName')(e.target.value)} /></Field>
          <Field label="Téléphone"><input value={form.mobile} onChange={e => set('mobile')(e.target.value)} /></Field>
          <Field label="Rôle" hint={form.role === 'SCANNER' ? 'Accès limité au scan des billets QR.' : 'Gère la fiche, les réservations et les statistiques.'}>
            <select value={form.role} onChange={e => set('role')(e.target.value)}>
              {PRO_ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
            </select>
          </Field>
          <Field label="Mot de passe provisoire" hint="8 caractères minimum. Il sera affiché une seule fois après la création." wide>
            <div className="inline-input">
              <input required minLength={8} className="mono" value={form.password} onChange={e => set('password')(e.target.value)} />
              <Button kind="ghost" small onClick={() => set('password')(generatePassword())}>Générer</Button>
            </div>
          </Field>
          <Field label={`Établissements gérés (${selected.length})`} hint="Le compte ne voit que ces établissements dans Barmej Pro." wide>
            {selected.length ? <div className="chips">{selected.map(p => <button type="button" key={p.id} className="chip" onClick={() => toggle(p)}>{p.name} ×</button>)}</div> : null}
            <SearchInput value={search} onChange={setSearch} placeholder="Chercher un établissement…" />
            <div className="checklist">
              {places.loading && !places.data ? <span className="muted small">Chargement…</span> : (places.data?.items ?? []).map(place => (
                <label key={place.id} className="check-row">
                  <input type="checkbox" checked={selected.some(p => p.id === place.id)} onChange={() => toggle(place)} />
                  <span>{place.name}{place.address ? <span className="muted small"> · {place.address}</span> : null}</span>
                </label>
              ))}
            </div>
          </Field>
        </form>
      )}
    </Drawer>
  );
}

export default function Users({me}: {me: AdminUser}) {
  const run = useAction();
  const [kind, setKind] = useState<Kind>('public');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const search = useDebounced(q);
  useEffect(() => setPage(1), [search, status, kind]);
  const params = new URLSearchParams({kind, page: String(page), ...(search ? {q: search} : {}), ...(status ? {status} : {})});
  const {data, error, loading, reload} = useLoad(() => api<Page<Row>>(`/admin/v1/users?${params}`), [params.toString()]);

  const suspend = (user: Row) => {
    const reason = window.prompt(`Suspendre ${fullName(user)} ?\n\nLa personne ne pourra plus se connecter et ses sessions seront coupées.\nMotif (facultatif, visible dans le backoffice) :`, '');
    if (reason === null) return;
    void run(async () => { await api(`/admin/v1/users/${user.id}/suspend`, json('POST', {reason: reason.trim() || undefined})); reload(); }, 'Compte suspendu');
  };
  const reactivate = (user: Row) => {
    if (!window.confirm(`Réactiver le compte de ${fullName(user)} ?`)) return;
    void run(async () => { await api(`/admin/v1/users/${user.id}/reactivate`, json('POST')); reload(); }, 'Compte réactivé');
  };
  const remove = (user: Row) => {
    if (!window.confirm(`Supprimer définitivement le compte Pro de ${fullName(user)} (${user.email}) ?\n\nIl perd l’accès à Barmej Pro. L’historique des actions est conservé sans son nom.`)) return;
    void run(async () => { await api(`/admin/v1/pro-accounts/${user.id}`, json('DELETE')); reload(); }, 'Compte supprimé');
  };
  const changeRole = (user: Row, next: Role) => {
    if (next === user.role) return;
    const warning = next === 'ADMIN' ? '\n\nUn administrateur a accès à tout le backoffice.' : '';
    if (!window.confirm(`Passer ${fullName(user)} en « ${roleLabels[next]} » ?${warning}`)) return;
    void run(async () => { await api(`/admin/v1/users/${user.id}`, json('PATCH', {role: next})); reload(); }, 'Rôle mis à jour');
  };

  const userCol = {key: 'name', label: 'Compte', render: (u: Row) => <div><strong>{fullName(u)}</strong><span className="muted small block">{u.email}</span></div>};
  const statusActions = (u: Row) => (u.suspendedAt
    ? <Button small kind="soft" onClick={() => reactivate(u)}>Réactiver</Button>
    : <Button small kind="ghost" onClick={() => suspend(u)}>Suspendre</Button>);

  const columns = kind === 'public' ? [
    userCol,
    {key: 'mobile', label: 'Téléphone', render: (u: Row) => u.mobile ?? '—'},
    {key: 'activity', label: 'Activité', render: (u: Row) => <span className="muted small">{u.reservations} rés. · {u.stays} séjours · {u.plans} programmes</span>},
    {key: 'created', label: 'Inscrit le', render: (u: Row) => fmtDate(u.createdAt)},
    {key: 'status', label: 'Statut', render: (u: Row) => <StatusCell user={u} />},
    {key: 'actions', label: '', align: 'right' as const, render: statusActions},
  ] : kind === 'pro' ? [
    userCol,
    {key: 'role', label: 'Rôle', render: (u: Row) => (
      <select value={u.role} onChange={e => changeRole(u, e.target.value as Role)}>
        {PRO_ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
      </select>
    )},
    {key: 'places', label: 'Établissements', render: (u: Row) => (u.places.length ? u.places.map(p => p.name).join(', ') : <span className="muted">Aucun</span>)},
    {key: 'created', label: 'Créé le', render: (u: Row) => fmtDate(u.createdAt)},
    {key: 'status', label: 'Statut', render: (u: Row) => <StatusCell user={u} />},
    {key: 'actions', label: '', align: 'right' as const, render: (u: Row) => <div className="row-actions">{statusActions(u)}<Button small kind="danger" onClick={() => remove(u)}>Supprimer</Button></div>},
  ] : [
    userCol,
    {key: 'role', label: 'Rôle', render: (u: Row) => (
      <select value={u.role} disabled={u.id === me.id} onChange={e => changeRole(u, e.target.value as Role)}>
        {(['ADMIN', 'USER'] as Role[]).map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
      </select>
    )},
    {key: 'created', label: 'Depuis le', render: (u: Row) => fmtDate(u.createdAt)},
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Clients de l’app, comptes Pro des établissements et équipe Barmej."
        actions={kind === 'pro' ? <Button onClick={() => setCreating(true)}>+ Nouveau compte Pro</Button> : undefined}
      />
      <Tabs<Kind> value={kind} onChange={setKind} items={[{key: 'public', label: 'Utilisateurs de l’app'}, {key: 'pro', label: 'Comptes Pro'}, {key: 'admin', label: 'Administrateurs'}]} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail ou téléphone…" />
        {kind !== 'admin' ? (
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
          </select>
        ) : null}
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table rows={data.items} rowKey={u => u.id} columns={columns} empty={kind === 'pro' ? 'Aucun compte Pro. Créez-en un avec « Nouveau compte Pro ».' : 'Aucun compte'} />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
      <ProAccountDrawer open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </>
  );
}
