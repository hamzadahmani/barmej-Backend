import {FormEvent, useEffect, useState} from 'react';
import {api, Category, json, Page, PlaceDetail, PlaceRow} from '../api';
import {Badge, Button, Drawer, ErrorState, Field, fullName, Loading, PageHeader, Pager, planLabels, SearchInput, Table, Tabs, Toggle, useAction, useDebounced, useLoad} from '../ui';

const STAY_CATEGORY = 4;
type Form = {
  name: string; categoryId: number; categoryIds: number[]; subtitle: string; image: string; address: string; phone: string; email: string;
  description: string; schedule: string; happyHour: string; cuisineType: string; latitude: string; longitude: string;
  averagePrice: string; nightlyPrice: string; roomCount: string; capacityPerSlot: string; defaultDurationMin: string;
  verified: boolean; reviewsEnabled: boolean; weatherSensitive: boolean; environment: PlaceDetail['environment'];
  ambienceTags: string; suitabilityMoods: string; groupTypes: string;
};
const empty = (categoryId: number): Form => ({
  name: '', categoryId, categoryIds: [], subtitle: '', image: '', address: '', phone: '', email: '', description: '', schedule: '',
  happyHour: '', cuisineType: '', latitude: '36.8065', longitude: '10.1815', averagePrice: '', nightlyPrice: '', roomCount: '',
  capacityPerSlot: '20', defaultDurationMin: '60', verified: false, reviewsEnabled: true, weatherSensitive: false, environment: 'INDOOR',
  ambienceTags: '', suitabilityMoods: '', groupTypes: '',
});
const fromPlace = (p: PlaceDetail): Form => ({
  name: p.name, categoryId: p.categoryId, categoryIds: p.categoryIds.filter(id => id !== p.categoryId), subtitle: p.subtitle ?? '', image: p.image ?? '',
  address: p.address ?? '', phone: p.phone ?? '', email: p.email ?? '', description: p.description ?? '', schedule: p.schedule ?? '',
  happyHour: p.happyHour ?? '', cuisineType: p.cuisineType ?? '', latitude: String(p.latitude), longitude: String(p.longitude),
  averagePrice: p.averagePrice?.toString() ?? '', nightlyPrice: p.nightlyPrice?.toString() ?? '', roomCount: p.roomCount?.toString() ?? '',
  capacityPerSlot: String(p.capacityPerSlot), defaultDurationMin: String(p.defaultDurationMin), verified: p.verified,
  reviewsEnabled: p.reviewsEnabled, weatherSensitive: p.weatherSensitive, environment: p.environment,
  ambienceTags: p.ambienceTags.join(', '), suitabilityMoods: p.suitabilityMoods.join(', '), groupTypes: p.groupTypes.join(', '),
});
const list = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean);
const intOrNull = (value: string) => (value.trim() === '' ? null : Math.round(Number(value)));

function toPayload(f: Form) {
  const lat = Number(f.latitude), lng = Number(f.longitude);
  if (f.name.trim().length < 2) throw new Error('Le nom doit faire au moins 2 caractères.');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Latitude et longitude doivent être des nombres.');
  for (const [label, value] of [['Prix moyen', f.averagePrice], ['Prix par nuit', f.nightlyPrice], ['Chambres', f.roomCount]] as const) {
    if (value.trim() && !Number.isFinite(Number(value))) throw new Error(`${label} doit être un nombre.`);
  }
  return {
    name: f.name.trim(), categoryId: f.categoryId, categoryIds: f.categoryIds, subtitle: f.subtitle, image: f.image, address: f.address,
    phone: f.phone, email: f.email, description: f.description, schedule: f.schedule, happyHour: f.happyHour, cuisineType: f.cuisineType,
    latitude: lat, longitude: lng, averagePrice: intOrNull(f.averagePrice), nightlyPrice: intOrNull(f.nightlyPrice), roomCount: intOrNull(f.roomCount),
    capacityPerSlot: intOrNull(f.capacityPerSlot) ?? 20, defaultDurationMin: intOrNull(f.defaultDurationMin) ?? 60,
    verified: f.verified, reviewsEnabled: f.reviewsEnabled, weatherSensitive: f.weatherSensitive, environment: f.environment,
    ambienceTags: list(f.ambienceTags), suitabilityMoods: list(f.suitabilityMoods), groupTypes: list(f.groupTypes),
  };
}

function PlaceEditor({placeId, categories, onClose, onSaved}: {placeId: number | 'new'; categories: Category[]; onClose: () => void; onSaved: () => void}) {
  const run = useAction();
  const [tab, setTab] = useState<'info' | 'managers'>('info');
  const [place, setPlace] = useState<PlaceDetail>();
  const [form, setForm] = useState<Form>(empty(categories[0]?.id ?? 1));
  const [saving, setSaving] = useState(false);
  const [managerEmail, setManagerEmail] = useState('');
  const [managerRole, setManagerRole] = useState<'ESTABLISHMENT' | 'SCANNER'>('ESTABLISHMENT');
  const isNew = placeId === 'new';

  useEffect(() => {
    if (isNew) return;
    api<PlaceDetail>(`/admin/v1/places/${placeId}`).then(p => {
      setPlace(p);
      setForm(fromPlace(p));
    }).catch(() => undefined);
  }, [isNew, placeId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({...f, [key]: value}));
  const text = (key: keyof Form) => ({value: form[key] as string, onChange: (e: {target: {value: string}}) => set(key, e.target.value as never)});
  const isStay = form.categoryId === STAY_CATEGORY || form.categoryIds.includes(STAY_CATEGORY);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(async () => {
      const payload = toPayload(form);
      const saved = await api<PlaceDetail>(isNew ? '/admin/v1/places' : `/admin/v1/places/${placeId}`, json(isNew ? 'POST' : 'PATCH', payload));
      setPlace(saved);
    }, isNew ? 'Établissement créé' : 'Modifications enregistrées');
    setSaving(false);
    if (ok) {
      onSaved();
      if (isNew) onClose();
    }
  };

  const addManager = () => run(async () => {
    const saved = await api<PlaceDetail>(`/admin/v1/places/${placeId}/managers`, json('POST', {email: managerEmail, role: managerRole}));
    setPlace(saved);
    setManagerEmail('');
    onSaved();
  }, 'Gérant ajouté');
  const removeManager = (userId: number) => {
    if (!window.confirm('Retirer cet accès Barmej Pro ?')) return;
    void run(async () => {
      setPlace(await api<PlaceDetail>(`/admin/v1/places/${placeId}/managers/${userId}`, json('DELETE')));
      onSaved();
    }, 'Accès retiré');
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nouvel établissement' : place?.name ?? 'Établissement'}
      subtitle={isNew ? 'Les champs marqués * sont obligatoires.' : `#${placeId} · ${place?.categoryName ?? ''}`}
      onClose={onClose}
      footer={tab === 'info' ? <><Button kind="ghost" onClick={onClose}>Annuler</Button><Button type="submit" form="place-form" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button></> : undefined}>
      {!isNew ? <Tabs value={tab} onChange={setTab} items={[{key: 'info', label: 'Informations'}, {key: 'managers', label: 'Gérants', count: place?.managersList.length}]} /> : null}
      {tab === 'info' ? (
        <form id="place-form" className="form-grid" onSubmit={submit}>
          <Field label="Nom *" wide><input required {...text('name')} /></Field>
          <Field label="Catégorie principale *">
            <select value={form.categoryId} onChange={e => set('categoryId', Number(e.target.value))}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Sous-titre"><input {...text('subtitle')} placeholder="Ex. Terrasse vue mer" /></Field>
          <Field label="Autres catégories" wide>
            <div className="chips">
              {categories.filter(c => c.id !== form.categoryId).map(c => (
                <label key={c.id} className={`chip${form.categoryIds.includes(c.id) ? ' chip-on' : ''}`}>
                  <input type="checkbox" checked={form.categoryIds.includes(c.id)} onChange={e => set('categoryIds', e.target.checked ? [...form.categoryIds, c.id] : form.categoryIds.filter(id => id !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Adresse" wide><input {...text('address')} /></Field>
          <Field label="Latitude *"><input inputMode="decimal" {...text('latitude')} /></Field>
          <Field label="Longitude *"><input inputMode="decimal" {...text('longitude')} /></Field>
          <Field label="Téléphone"><input {...text('phone')} /></Field>
          <Field label="E-mail"><input type="email" {...text('email')} /></Field>
          <Field label="Image de couverture (URL)" wide><input {...text('image')} placeholder="https://…" /></Field>
          <Field label="Description" wide><textarea rows={4} {...text('description')} /></Field>
          <Field label="Horaires affichés"><input {...text('schedule')} placeholder="08:00 - 23:00" /></Field>
          <Field label="Type de cuisine"><input {...text('cuisineType')} /></Field>
          <Field label="Prix moyen (DT)" hint="Utilisé par Barmejli pour respecter le budget"><input inputMode="numeric" {...text('averagePrice')} /></Field>
          <Field label="Durée moyenne d’une visite (min)"><input inputMode="numeric" {...text('defaultDurationMin')} /></Field>
          <Field label="Capacité par créneau"><input inputMode="numeric" {...text('capacityPerSlot')} /></Field>
          <Field label="Environnement">
            <select value={form.environment} onChange={e => set('environment', e.target.value as Form['environment'])}>
              <option value="INDOOR">Intérieur</option><option value="OUTDOOR">Extérieur</option>
              <option value="COVERED_OUTDOOR">Terrasse couverte</option><option value="MIXED">Mixte</option>
            </select>
          </Field>
          {isStay ? (
            <>
              <Field label="Prix d’une nuit (DT)"><input inputMode="numeric" {...text('nightlyPrice')} /></Field>
              <Field label="Nombre de chambres"><input inputMode="numeric" {...text('roomCount')} /></Field>
            </>
          ) : null}
          <Field label="Bon plan / Happy hour" wide><input {...text('happyHour')} /></Field>
          <Field label="Ambiances" hint="Séparées par des virgules : romantique, calme, festive…" wide><input {...text('ambienceTags')} /></Field>
          <Field label="Humeurs Barmejli" hint="romantique, entre amis, famille…"><input {...text('suitabilityMoods')} /></Field>
          <Field label="Types de groupe" hint="couple, amis, famille, solo"><input {...text('groupTypes')} /></Field>
          <div className="field-wide toggles">
            <Toggle checked={form.verified} onChange={v => set('verified', v)} label="Établissement vérifié" />
            <Toggle checked={form.reviewsEnabled} onChange={v => set('reviewsEnabled', v)} label="Avis activés" />
            <Toggle checked={form.weatherSensitive} onChange={v => set('weatherSensitive', v)} label="Sensible à la météo" />
          </div>
        </form>
      ) : (
        <div className="stack">
          <p className="muted">Les gérants accèdent à cet établissement dans Barmej Pro. La personne doit déjà avoir un compte Barmej.</p>
          <div className="inline-form">
            <input type="email" placeholder="email@exemple.com" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} />
            <select value={managerRole} onChange={e => setManagerRole(e.target.value as 'ESTABLISHMENT' | 'SCANNER')}>
              <option value="ESTABLISHMENT">Gérant</option><option value="SCANNER">Contrôle QR seulement</option>
            </select>
            <Button disabled={!managerEmail.includes('@')} onClick={addManager}>Ajouter</Button>
          </div>
          <Table
            rows={place?.managersList ?? []}
            rowKey={m => m.id}
            empty="Aucun gérant rattaché"
            columns={[
              {key: 'name', label: 'Nom', render: m => fullName(m)},
              {key: 'email', label: 'E-mail', render: m => m.email},
              {key: 'role', label: 'Rôle', render: m => <Badge value={m.role} />},
              {key: 'x', label: '', align: 'right', render: m => <Button kind="danger" small onClick={() => removeManager(m.id)}>Retirer</Button>},
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}

export default function Places() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [verified, setVerified] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | 'new'>();
  const search = useDebounced(q);
  useEffect(() => setPage(1), [search, categoryId, verified]);
  const categories = useLoad(() => api<Category[]>('/admin/v1/categories'), []);
  const params = new URLSearchParams({page: String(page), ...(search ? {q: search} : {}), ...(categoryId ? {categoryId} : {}), ...(verified ? {verified} : {})});
  const {data, error, loading, reload} = useLoad(() => api<Page<PlaceRow>>(`/admin/v1/places?${params}`), [params.toString()]);
  return (
    <>
      <PageHeader title="Établissements" subtitle="Fiches, catégories, vérification et accès Barmej Pro." actions={<Button onClick={() => setEditing('new')} disabled={!categories.data}>+ Nouvel établissement</Button>} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Nom ou adresse…" />
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.data?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.places})</option>)}
        </select>
        <select value={verified} onChange={e => setVerified(e.target.value)}>
          <option value="">Vérifiés et non vérifiés</option><option value="true">Vérifiés</option><option value="false">Non vérifiés</option>
        </select>
      </div>
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card card-flush">
          <Table
            rows={data.items}
            rowKey={p => p.id}
            onRowClick={p => setEditing(p.id)}
            columns={[
              {key: 'name', label: 'Établissement', render: p => (
                <div className="cell-main">
                  {p.image ? <img src={p.image} alt="" className="thumb" /> : <span className="thumb thumb-empty">{p.name.charAt(0)}</span>}
                  <div><strong>{p.name}</strong><span className="muted small">{p.address ?? '—'}</span></div>
                </div>
              )},
              {key: 'cat', label: 'Catégorie', render: p => p.categoryName},
              {key: 'plan', label: 'Formule', render: p => <span className="row-gap"><Badge value={p.plan} />{p.requestedPlan ? <Badge value="PENDING" label={`→ ${planLabels[p.requestedPlan]}`} /> : null}</span>},
              {key: 'managers', label: 'Gérants', align: 'center', render: p => p.managers || '—'},
              {key: 'price', label: 'Prix moyen', align: 'right', render: p => (p.averagePrice != null ? `${p.averagePrice} DT` : '—')},
              {key: 'verified', label: 'Statut', render: p => (p.verified ? <Badge value="APPROVED" label="Vérifié" /> : <Badge value="EXPIRED" label="Non vérifié" />)},
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </div>
      ) : null}
      {editing !== undefined && categories.data ? <PlaceEditor placeId={editing} categories={categories.data} onClose={() => setEditing(undefined)} onSaved={reload} /> : null}
    </>
  );
}
