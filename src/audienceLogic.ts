/**
 * Statistiques d'audience : vues des fiches établissement et des vidéos.
 * Fonctions pures (sans base de données) pour pouvoir les tester.
 */

export const VIEW_SOURCES = ['video', 'list', 'search', 'barmejli', 'favorites', 'map', 'home', 'reservation', 'app'] as const;
export type ViewSource = (typeof VIEW_SOURCES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  video: 'Fil vidéo',
  list: 'Listes et catégories',
  search: 'Recherche',
  barmejli: 'Barmejli',
  favorites: 'Favoris',
  map: 'Carte',
  home: 'Accueil',
  reservation: 'Réservations',
  app: 'Autre',
};

export const normalizeSource = (value: unknown): ViewSource =>
  typeof value === 'string' && (VIEW_SOURCES as readonly string[]).includes(value) ? (value as ViewSource) : 'app';

/** Jour au format AAAA-MM-JJ à l'heure de Tunis (UTC+1, sans heure d'été). */
export const tunisDay = (date: Date) => new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10);

/** Liste des jours de la période, du plus ancien au plus récent (jours sans activité compris). */
export function periodDays(days: number, now = new Date()) {
  return Array.from({length: days}, (_, index) => tunisDay(new Date(now.getTime() - (days - 1 - index) * 86_400_000)));
}

/** Évolution en % par rapport à la période précédente (null si rien à comparer). */
export const percentChange = (current: number, previous: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

const rate = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : 0);

export type ViewRow = {userId: number | null; source: string; createdAt: Date};
export type VideoEventRow = {type: string; userId: number | null; sessionId: string; videoId: number; watchMs: number | null; occurredAt: Date};
export type VideoInfo = {id: number; secureUrl: string; createdAt: Date};

/** Miniature Cloudinary d'une vidéo (première image). */
export const videoThumbnail = (url: string) =>
  /res\.cloudinary\.com\/.+\/video\/upload\//.test(url) ? url.replace('/video/upload/', '/video/upload/so_0,w_240/').replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg') : null;

export function summarizeAudience(input: {
  days: number;
  now?: Date;
  views: ViewRow[];
  previousViews: number;
  videoEvents: VideoEventRow[];
  previousVideoViews: number;
  videos: VideoInfo[];
}) {
  const days = periodDays(input.days, input.now);
  const daily = new Map(days.map(day => [day, {date: day, profileViews: 0, videoViews: 0}]));
  for (const view of input.views) {
    const row = daily.get(tunisDay(view.createdAt));
    if (row) row.profileViews += 1;
  }
  const starts = input.videoEvents.filter(event => event.type === 'VIDEO_START');
  for (const event of starts) {
    const row = daily.get(tunisDay(event.occurredAt));
    if (row) row.videoViews += 1;
  }

  const sources = new Map<string, number>();
  for (const view of input.views) sources.set(view.source, (sources.get(view.source) ?? 0) + 1);

  const viewer = (event: {userId: number | null; sessionId?: string}) => (event.userId ? `u${event.userId}` : `s${event.sessionId ?? ''}`);
  const completions = input.videoEvents.filter(event => event.type === 'VIDEO_COMPLETE').length;
  const averageWatch = (events: VideoEventRow[]) => {
    // Temps regardé = position la plus avancée atteinte par une même séance sur une même vidéo
    // (paliers 25/50/75 %, fin, ou sortie avant la fin).
    const furthest = new Map<string, number>();
    for (const event of events) {
      const key = `${event.sessionId}:${event.videoId}`;
      if (event.type === 'VIDEO_START') furthest.set(key, furthest.get(key) ?? 0);
      else if (event.watchMs != null) furthest.set(key, Math.max(furthest.get(key) ?? 0, event.watchMs));
    }
    const seen = [...furthest.values()];
    return seen.length ? Math.round((seen.reduce((sum, ms) => sum + ms, 0) / seen.length / 1000) * 10) / 10 : 0;
  };

  const perVideo = input.videos.map(video => {
    const events = input.videoEvents.filter(event => event.videoId === video.id);
    const views = events.filter(event => event.type === 'VIDEO_START').length;
    const done = events.filter(event => event.type === 'VIDEO_COMPLETE').length;
    return {
      id: video.id,
      url: video.secureUrl,
      thumbnailUrl: videoThumbnail(video.secureUrl),
      publishedAt: video.createdAt.toISOString(),
      views,
      uniqueViewers: new Set(events.filter(event => event.type === 'VIDEO_START').map(viewer)).size,
      completions: done,
      completionRate: rate(done, views),
      averageWatchSeconds: averageWatch(events),
      profileOpens: events.filter(event => event.type === 'PLACE_OPEN').length,
    };
  }).sort((a, b) => b.views - a.views || b.id - a.id);

  return {
    periodDays: input.days,
    from: days[0],
    to: days.at(-1),
    profile: {
      views: input.views.length,
      uniqueVisitors: new Set(input.views.map(view => (view.userId ? `u${view.userId}` : null)).filter(Boolean)).size,
      change: percentChange(input.views.length, input.previousViews),
    },
    video: {
      views: starts.length,
      uniqueViewers: new Set(starts.map(viewer)).size,
      completions,
      completionRate: rate(completions, starts.length),
      averageWatchSeconds: averageWatch(input.videoEvents),
      profileOpens: input.videoEvents.filter(event => event.type === 'PLACE_OPEN').length,
      change: percentChange(starts.length, input.previousVideoViews),
    },
    daily: [...daily.values()],
    sources: [...sources.entries()]
      .map(([source, views]) => ({source, label: SOURCE_LABELS[source] ?? SOURCE_LABELS.app, views, share: rate(views, input.views.length)}))
      .sort((a, b) => b.views - a.views),
    videos: perVideo,
  };
}

/** Assemble plusieurs séries « jour → nombre » sur tous les jours de la période. */
export function mergeDaily<K extends string>(days: string[], series: Record<K, Array<{day: string; n: number}>>) {
  const keys = Object.keys(series) as K[];
  const rows = new Map(days.map(day => [day, {date: day, ...Object.fromEntries(keys.map(key => [key, 0]))} as {date: string} & Record<K, number>]));
  for (const key of keys) {
    for (const point of series[key]) {
      const row = rows.get(point.day);
      if (row) (row as Record<string, number | string>)[key] = Number(point.n);
    }
  }
  return [...rows.values()];
}

/** Taux de conversion fiche → réservation, en %. */
export const conversionRate = (reservations: number, views: number) => rate(reservations, views);
