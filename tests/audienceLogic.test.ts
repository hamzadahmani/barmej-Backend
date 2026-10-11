import {describe, expect, it} from 'vitest';
import {mergeDaily, normalizeSource, percentChange, periodDays, summarizeAudience, tunisDay, videoThumbnail} from '../src/audienceLogic';

const now = new Date('2026-10-10T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('statistiques d’audience', () => {
  it('compte les jours à l’heure de Tunis', () => {
    expect(tunisDay(at('2026-10-09T23:30:00Z'))).toBe('2026-10-10');
    expect(periodDays(7, now)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
  });

  it('calcule les évolutions et accepte seulement les sources connues', () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
    expect(normalizeSource('video')).toBe('video');
    expect(normalizeSource('<script>')).toBe('app');
  });

  it('résume les vues de fiche et de vidéo', () => {
    const result = summarizeAudience({
      days: 7,
      now,
      views: [
        {userId: 1, source: 'video', createdAt: at('2026-10-10T09:00:00Z')},
        {userId: 1, source: 'video', createdAt: at('2026-10-09T09:00:00Z')},
        {userId: 2, source: 'search', createdAt: at('2026-10-09T10:00:00Z')},
        {userId: null, source: 'list', createdAt: at('2026-10-08T10:00:00Z')},
      ],
      previousViews: 2,
      videoEvents: [
        {type: 'VIDEO_START', userId: 1, sessionId: 'a', videoId: 10, watchMs: null, occurredAt: at('2026-10-10T08:00:00Z')},
        {type: 'VIDEO_50_PERCENT', userId: 1, sessionId: 'a', videoId: 10, watchMs: 5000, occurredAt: at('2026-10-10T08:00:05Z')},
        {type: 'VIDEO_COMPLETE', userId: 1, sessionId: 'a', videoId: 10, watchMs: 10000, occurredAt: at('2026-10-10T08:00:10Z')},
        {type: 'PLACE_OPEN', userId: 1, sessionId: 'a', videoId: 10, watchMs: null, occurredAt: at('2026-10-10T08:00:11Z')},
        {type: 'VIDEO_START', userId: null, sessionId: 'b', videoId: 10, watchMs: null, occurredAt: at('2026-10-09T08:00:00Z')},
        {type: 'VIDEO_SKIP', userId: null, sessionId: 'b', videoId: 10, watchMs: 2000, occurredAt: at('2026-10-09T08:00:02Z')},
        {type: 'VIDEO_START', userId: 2, sessionId: 'c', videoId: 11, watchMs: null, occurredAt: at('2026-10-09T08:00:00Z')},
      ],
      previousVideoViews: 6,
      videos: [
        {id: 10, secureUrl: 'https://res.cloudinary.com/x/video/upload/v1/a.mp4', createdAt: at('2026-10-01T00:00:00Z')},
        {id: 11, secureUrl: 'https://cdn.example.com/b.mp4', createdAt: at('2026-10-02T00:00:00Z')},
      ],
    });
    expect(result.profile).toEqual({views: 4, uniqueVisitors: 2, change: 100});
    expect(result.video).toMatchObject({views: 3, uniqueViewers: 3, completions: 1, completionRate: 33.3, profileOpens: 1, change: -50});
    // (10 s + 2 s + 0 s) / 3 séances
    expect(result.video.averageWatchSeconds).toBe(4);
    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)).toEqual({date: '2026-10-10', profileViews: 1, videoViews: 1});
    expect(result.sources[0]).toMatchObject({source: 'video', label: 'Fil vidéo', views: 2, share: 50});
    expect(result.videos.map(video => [video.id, video.views, video.averageWatchSeconds])).toEqual([[10, 2, 6], [11, 1, 0]]);
    expect(result.videos[0]!.thumbnailUrl).toBe('https://res.cloudinary.com/x/video/upload/so_0,w_240/v1/a.jpg');
    expect(videoThumbnail('https://cdn.example.com/b.mp4')).toBeNull();
  });

  it('assemble les séries quotidiennes, jours vides compris', () => {
    const rows = mergeDaily(['2026-10-09', '2026-10-10'], {views: [{day: '2026-10-10', n: 3}], bookings: [{day: '2026-10-09', n: 1}]});
    expect(rows).toEqual([{date: '2026-10-09', views: 0, bookings: 1}, {date: '2026-10-10', views: 3, bookings: 0}]);
  });
});
