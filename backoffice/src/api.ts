// Client HTTP du backoffice : jetons en localStorage, renouvellement automatique.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8091').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const TOKEN = 'bo_token';
const REFRESH = 'bo_refresh';
const store = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : la session reste en mémoire */
    }
  },
};

let memoryToken = store.get(TOKEN);
let renewal: Promise<string> | null = null;
const listeners = new Set<() => void>();
export const onSessionExpired = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const hasSession = () => Boolean(memoryToken ?? store.get(TOKEN));

function saveTokens(token: string | null, refreshToken: string | null) {
  memoryToken = token;
  store.set(TOKEN, token);
  store.set(REFRESH, refreshToken);
}

async function send(path: string, init: RequestInit = {}, token?: string | null) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(API_URL + path, {...init, headers});
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    // Erreur de validation du backend : on précise le premier champ en cause.
    const fields = body?.errors?.fieldErrors as Record<string, string[]> | undefined;
    const first = fields ? Object.entries(fields).find(([, messages]) => messages?.length) : undefined;
    const detail = first ? ` (${first[0]} : ${first[1][0]})` : '';
    throw new ApiError(`${body?.message ?? `Erreur ${response.status}`}${detail}`, response.status);
  }
  return body;
}

function renew() {
  renewal ??= (async () => {
    const refreshToken = store.get(REFRESH);
    if (!refreshToken) throw new ApiError('Session expirée', 401);
    const tokens = await send('/auth/refresh', {method: 'POST', body: JSON.stringify({refreshToken})});
    saveTokens(tokens.token, tokens.refreshToken);
    return tokens.token as string;
  })().finally(() => {
    renewal = null;
  });
  return renewal;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await send(path, init, memoryToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      const token = await renew();
      return await send(path, init, token);
    } catch (again) {
      if (again instanceof ApiError && again.status === 401) {
        saveTokens(null, null);
        listeners.forEach(listener => listener());
      }
      throw again;
    }
  }
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
});

export async function login(email: string, password: string) {
  const session = await send('/authenticate', {method: 'POST', body: JSON.stringify({userMail: email, userPwd: password})});
  saveTokens(session.token, session.refreshToken);
  try {
    return await api<AdminUser>('/admin/v1/me');
  } catch (error) {
    await logout();
    if (error instanceof ApiError && error.status === 403) throw new ApiError('Ce compte n’est pas administrateur Barmej.', 403);
    throw error;
  }
}

export async function logout() {
  const refreshToken = store.get(REFRESH);
  saveTokens(null, null);
  if (refreshToken) await send('/auth/logout', {method: 'POST', body: JSON.stringify({refreshToken})}).catch(() => undefined);
}

/* ─────────── Types partagés ─────────── */
export type Role = 'USER' | 'ADMIN' | 'ESTABLISHMENT' | 'SCANNER';
export type Plan = 'DISCOVERY' | 'ESSENTIAL' | 'PRO' | 'PREMIUM';
export type AdminUser = {id: number; email: string; firstName: string; lastName: string; mobile?: string | null; role: Role};
export type Page<T> = {items: T[]; total: number; page: number; pageSize: number; pages: number};
export type Category = {id: number; name: string; image?: string | null; places: number};
export type PlaceRow = {
  id: number; name: string; subtitle?: string | null; image?: string | null; address?: string | null; phone?: string | null;
  categoryId: number; categoryName?: string; verified: boolean; averagePrice?: number | null; plan: Plan; requestedPlan: Plan | null;
  managers: number; media: number; createdAt: string;
};
export type PlaceDetail = PlaceRow & {
  latitude: number; longitude: number; email?: string | null; description?: string | null; schedule?: string | null;
  happyHour?: string | null; outfit?: string | null; musicStyle?: string | null; nightlyPrice?: number | null; roomCount?: number | null;
  capacityPerSlot: number; reviewsEnabled: boolean; cuisineType?: string | null; ambienceTags: string[]; suitabilityMoods: string[];
  groupTypes: string[]; environment: 'INDOOR' | 'OUTDOOR' | 'COVERED_OUTDOOR' | 'MIXED'; weatherSensitive: boolean;
  defaultDurationMin: number; categoryIds: number[];
  subscription: {plan: Plan; status: string; requestedPlan: Plan | null; requestedAt?: string | null; endsAt?: string | null} | null;
  managersList: AdminUser[];
};
export type Overview = {
  users: number; newUsers: number; places: number; verifiedPlaces: number; pendingReservations: number; todayReservations: number;
  pendingStays: number; barmejliPlans7d: number; subscriptionRequests: number; pendingMedia: number; reports30d: number;
  daily: Array<{date: string; reservations: number; signups: number}>; plans: Partial<Record<Plan, number>>;
};
