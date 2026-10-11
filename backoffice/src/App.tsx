import {FormEvent, ReactNode, useEffect, useState} from 'react';
import {AdminUser, api, hasSession, login, logout, onSessionExpired} from './api';
import {Button, fullName, Loading, ToastProvider} from './ui';
import {go, Route, useRoute} from './router';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import Places from './pages/Places';
import Subscriptions from './pages/Subscriptions';
import Users from './pages/Users';
import Moderation from './pages/Moderation';
import Bookings from './pages/Bookings';
import Campaigns from './pages/Campaigns';

const icon = (d: ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const NAV: Array<{route: Route; label: string; icon: ReactNode}> = [
  {route: 'dashboard', label: 'Tableau de bord', icon: icon(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>)},
  {route: 'statistics', label: 'Statistiques', icon: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>)},
  {route: 'places', label: 'Établissements', icon: icon(<><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>)},
  {route: 'subscriptions', label: 'Abonnements', icon: icon(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>)},
  {route: 'users', label: 'Utilisateurs', icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" /></>)},
  {route: 'moderation', label: 'Modération', icon: icon(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>)},
  {route: 'bookings', label: 'Réservations', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>)},
  {route: 'campaigns', label: 'Campagnes', icon: icon(<><path d="M3 11v2a2 2 0 0 0 2 2h1l4 4V5L6 9H5a2 2 0 0 0-2 2Z" /><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" /></>)},
];

function Login({onLogged}: {onLogged: (user: AdminUser) => void}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogged(await login(email, password));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><img src="/logo-drop.svg" alt="" /></div>
        <h1>Backoffice Barmej</h1>
        <p className="muted">Réservé à l’équipe Barmej.</p>
        <label className="field"><span className="field-label">E-mail</span><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span className="field-label">Mot de passe</span><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</Button>
      </form>
    </div>
  );
}

function Shell({me, onLogout}: {me: AdminUser; onLogout: () => void}) {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [route]);
  const page = route === 'statistics' ? <Statistics /> : route === 'places' ? <Places /> : route === 'subscriptions' ? <Subscriptions /> : route === 'users' ? <Users me={me} />
    : route === 'moderation' ? <Moderation /> : route === 'bookings' ? <Bookings /> : route === 'campaigns' ? <Campaigns /> : <Dashboard />;
  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><img src="/logo-drop.svg" alt="" /><div><strong>Barmej</strong><span>Backoffice</span></div></div>
        <nav>
          {NAV.map(item => (
            <a key={item.route} href={`#/${item.route}`} className={`nav-item${route === item.route ? ' nav-on' : ''}`} aria-current={route === item.route ? 'page' : undefined}>
              {item.icon}<span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="me">
          <div className="me-avatar">{me.firstName.charAt(0).toUpperCase()}</div>
          <div className="me-text"><strong>{fullName(me)}</strong><span>{me.email}</span></div>
          <button className="icon-btn" title="Se déconnecter" aria-label="Se déconnecter" onClick={onLogout}>
            {icon(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>)}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenuOpen(v => !v)}>{icon(<path d="M4 7h16M4 12h16M4 17h16" />)}</button>
          <span className="topbar-title">{NAV.find(n => n.route === route)?.label}</span>
        </header>
        <main className="content">{page}</main>
      </div>
      <div className="scrim" onClick={() => setMenuOpen(false)} />
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<AdminUser | null>();
  useEffect(() => {
    if (!hasSession()) return setMe(null);
    api<AdminUser>('/admin/v1/me').then(setMe).catch(async () => {
      await logout();
      setMe(null);
    });
  }, []);
  useEffect(() => {
    const off = onSessionExpired(() => setMe(null));
    return () => {
      off();
    };
  }, []);
  const signOut = async () => {
    await logout();
    setMe(null);
    go('dashboard');
  };
  return (
    <ToastProvider>
      {me === undefined ? <div className="boot"><Loading /></div> : me ? <Shell me={me} onLogout={signOut} /> : <Login onLogged={setMe} />}
    </ToastProvider>
  );
}
