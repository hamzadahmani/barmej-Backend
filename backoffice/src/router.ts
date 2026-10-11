import {useEffect, useState} from 'react';

export type Route = 'dashboard' | 'statistics' | 'places' | 'subscriptions' | 'users' | 'moderation' | 'bookings' | 'campaigns';
const routes: Route[] = ['dashboard', 'statistics', 'places', 'subscriptions', 'users', 'moderation', 'bookings', 'campaigns'];
const read = (): Route => {
  const key = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return routes.includes(key) ? key : 'dashboard';
};
export const go = (route: string) => {
  window.location.hash = `/${route}`;
};
export function useRoute() {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
