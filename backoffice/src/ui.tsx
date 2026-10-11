import {createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState} from 'react';

/* ─────────── Libellés ─────────── */
export const statusLabels: Record<string, string> = {
  PENDING: 'En attente', PROPOSED: 'Proposé', CONFIRMED: 'Confirmé', DECLINED: 'Refusé', CANCELLED: 'Annulé',
  COMPLETED: 'Terminé', NO_SHOW: 'Absent', APPROVED: 'Approuvé', REJECTED: 'Refusé', ACTIVE: 'Active', SUSPENDED: 'Suspendue', EXPIRED: 'Expirée',
};
export const planLabels: Record<string, string> = {DISCOVERY: 'Découverte', ESSENTIAL: 'Essentiel', PRO: 'Pro', PREMIUM: 'Premium'};
export const roleLabels: Record<string, string> = {USER: 'Utilisateur', ADMIN: 'Administrateur', ESTABLISHMENT: 'Gérant', SCANNER: 'Contrôle QR'};
const tone: Record<string, string> = {
  PENDING: 'warn', PROPOSED: 'warn', CONFIRMED: 'good', COMPLETED: 'good', APPROVED: 'good', ACTIVE: 'good',
  SUB_ACTIVE: 'good', SUB_EXPIRING: 'warn', SUB_SCHEDULED: 'info', SUB_EXPIRED: 'bad', SUB_NONE: 'muted', SUB_CANCELLED: 'muted', SUB_ENDED: 'muted',
  FLAGGED: 'bad', DECLINED: 'bad', CANCELLED: 'muted', NO_SHOW: 'bad', REJECTED: 'bad', SUSPENDED: 'bad', EXPIRED: 'muted',
  DISCOVERY: 'muted', ESSENTIAL: 'info', PRO: 'brand', PREMIUM: 'gold', ADMIN: 'brand', ESTABLISHMENT: 'info', SCANNER: 'info', USER: 'muted',
};
export const Badge = ({value, label}: {value: string; label?: string}) => (
  <span className={`badge badge-${tone[value] ?? 'muted'}`}>{label ?? statusLabels[value] ?? planLabels[value] ?? roleLabels[value] ?? value}</span>
);

export const fmtDate = (value?: string | null, withTime = false) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? {hour: '2-digit', minute: '2-digit'} : {})}) : '—';
export const fullName = (u?: {firstName?: string; lastName?: string; email?: string} | null) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '—' : '—';

/* ─────────── Boutons et champs ─────────── */
type ButtonProps = {children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; type?: 'button' | 'submit'; disabled?: boolean; small?: boolean; title?: string; form?: string};
export const Button = ({children, onClick, kind = 'primary', type = 'button', disabled, small, title, form}: ButtonProps) => (
  <button type={type} form={form} title={title} className={`btn btn-${kind}${small ? ' btn-sm' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>
);

export const Field = ({label, hint, children, wide}: {label: string; hint?: string; children: ReactNode; wide?: boolean}) => (
  <label className={`field${wide ? ' field-wide' : ''}`}>
    <span className="field-label">{label}</span>
    {children}
    {hint ? <span className="field-hint">{hint}</span> : null}
  </label>
);

export const Toggle = ({checked, onChange, label}: {checked: boolean; onChange: (value: boolean) => void; label: string}) => (
  <label className="toggle">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className="toggle-track"><span className="toggle-thumb" /></span>
    <span>{label}</span>
  </label>
);

export const SearchInput = ({value, onChange, placeholder}: {value: string; onChange: (v: string) => void; placeholder: string}) => (
  <div className="search">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
    <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
  </div>
);

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/* ─────────── Données asynchrones ─────────── */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const counter = useRef(0);
  const reload = useCallback(() => {
    const ticket = ++counter.current;
    setLoading(true);
    setError(undefined);
    loader()
      .then(value => ticket === counter.current && setData(value))
      .catch((e: Error) => ticket === counter.current && setError(e.message))
      .finally(() => ticket === counter.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return {data, error, loading, reload, setData};
}

export const Loading = () => <div className="state"><span className="spinner" />Chargement…</div>;
export const ErrorState = ({message, retry}: {message: string; retry?: () => void}) => (
  <div className="state state-error"><strong>Impossible de charger les données</strong><span>{message}</span>{retry ? <Button kind="ghost" small onClick={retry}>Réessayer</Button> : null}</div>
);
export const Empty = ({title, text}: {title: string; text?: string}) => (
  <div className="state"><strong>{title}</strong>{text ? <span>{text}</span> : null}</div>
);

/* ─────────── Tableau ─────────── */
export type Column<T> = {key: string; label: string; render: (row: T) => ReactNode; width?: string; align?: 'right' | 'center'};
export function Table<T>({rows, columns, rowKey, onRowClick, empty = 'Aucun résultat'}: {rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string | number; onRowClick?: (row: T) => void; empty?: string}) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={{width: c.width, textAlign: c.align}}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map(c => <td key={c.key} style={{textAlign: c.align}}>{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Pager = ({page, pages, total, onPage}: {page: number; pages: number; total: number; onPage: (p: number) => void}) => (
  <div className="pager">
    <span>{total} résultat{total > 1 ? 's' : ''}</span>
    <div>
      <Button kind="ghost" small disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Précédent</Button>
      <span className="pager-page">Page {page} / {pages}</span>
      <Button kind="ghost" small disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant ›</Button>
    </div>
  </div>
);

export const Tabs = <K extends string>({value, onChange, items}: {value: K; onChange: (k: K) => void; items: Array<{key: K; label: string; count?: number}>}) => (
  <div className="tabs" role="tablist">
    {items.map(item => (
      <button key={item.key} role="tab" aria-selected={value === item.key} className={`tab${value === item.key ? ' tab-on' : ''}`} onClick={() => onChange(item.key)}>
        {item.label}{item.count ? <span className="tab-count">{item.count}</span> : null}
      </button>
    ))}
  </div>
);

/* ─────────── Panneau latéral ─────────── */
export function Drawer({open, title, subtitle, onClose, children, footer}: {open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header className="drawer-head">
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}>×</button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/* ─────────── Notifications ─────────── */
type Toast = {id: number; text: string; kind: 'ok' | 'error'};
const ToastContext = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list, {id, text, kind}]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}</div>
    </ToastContext.Provider>
  );
}

/** Exécute une action, affiche le résultat et renvoie true en cas de succès. */
export function useAction() {
  const toast = useToast();
  return useCallback(async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast(success);
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  }, [toast]);
}

export const StatCard = ({label, value, hint, accent, onClick}: {label: string; value: ReactNode; hint?: string; accent?: boolean; onClick?: () => void}) => (
  <button type="button" className={`stat${accent ? ' stat-accent' : ''}${onClick ? ' stat-link' : ''}`} onClick={onClick} disabled={!onClick}>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {hint ? <span className="stat-hint">{hint}</span> : null}
  </button>
);

export const PageHeader = ({title, subtitle, actions}: {title: string; subtitle?: string; actions?: ReactNode}) => (
  <div className="page-head">
    <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </div>
);
