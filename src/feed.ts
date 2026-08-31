import {FeedEventType, MediaModerationStatus, PlaceMediaType, Prisma} from '@prisma/client';
import jwt from 'jsonwebtoken';
import {config} from './config';
import {prisma} from './db';
import {placeDto} from './mappers';
import {cacheGetJson, cacheSetJson, feedCacheVersion, getRememberedSeenVideos} from './cache';
import {campaignEligible, isOpenAt, scoreCandidate} from './feedLogic';

export const FEED_MODEL_VERSION = 'feed-v1.0';

type FeedCursor = {type: 'feed-cursor'; offset: number; sessionId: string; modelVersion: string};
type FeedInput = {userId: number; limit: number; cursor?: string; latitude?: number; longitude?: number; mode?: 'for-you' | 'nearby'; keyword?: string};

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const matchesFeedKeyword = (keywords: string[], keyword?: string) => {
  if (!keyword) return true;
  const searched = normalized(keyword.trim());
  return keywords.some(item => normalized(item.trim()) === searched);
};

export const buildAvailableFilters = (videos: Array<{keywords: string[]}>) => {
  const filters = new Map<string, {keyword: string; count: number}>();
  for (const video of videos) {
    const unique = new Map(video.keywords.map(keyword => [normalized(keyword.trim()), keyword.trim()]));
    for (const [key, label] of unique) {
      if (!key) continue;
      const current = filters.get(key);
      filters.set(key, {keyword: current?.keyword ?? label, count: (current?.count ?? 0) + 1});
    }
  }
  return [...filters.values()].sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, 'fr'));
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = Math.PI / 180;
  const value = Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad) + Math.sin(lat1 * rad) * Math.sin(lat2 * rad);
  return 6371 * Math.acos(Math.min(1, value));
};

type PlaceDistance = {placeId: number; distanceKm: number};
let postgisAvailable: boolean | null = null;

async function hasPostgisLocation() {
  if (postgisAvailable !== null) return postgisAvailable;
  try {
    const rows = await prisma.$queryRaw<Array<{available: boolean}>>(Prisma.sql`
      SELECT (
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'location'
        )
      ) AS "available"
    `);
    postgisAvailable = Boolean(rows[0]?.available);
  } catch {
    postgisAvailable = false;
  }
  return postgisAvailable;
}

async function getPostgisDistances(latitude?: number, longitude?: number) {
  if (latitude === undefined || longitude === undefined) return null;
  if (!(await hasPostgisLocation())) return null;
  try {
    const rows = await prisma.$queryRaw<PlaceDistance[]>(Prisma.sql`
      SELECT
        "id_place" AS "placeId",
        ST_Distance(
          "location",
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) / 1000.0 AS "distanceKm"
      FROM "places"
      WHERE "location" IS NOT NULL
    `);
    return new Map(rows.map(row => [row.placeId, Number(row.distanceKm)]));
  } catch (error) {
    // Allows local databases without PostGIS to keep serving the feed.
    console.warn('PostGIS distance lookup unavailable; using Haversine fallback.');
    return null;
  }
}

const decodeCursor = (raw?: string): FeedCursor | null => {
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, config.JWT_SECRET) as jwt.JwtPayload & FeedCursor;
    return payload.type === 'feed-cursor' && payload.modelVersion === FEED_MODEL_VERSION ? payload : null;
  } catch {
    return null;
  }
};

const encodeCursor = (cursor: FeedCursor) => jwt.sign(cursor, config.JWT_SECRET, {expiresIn: '30m'});

export async function buildFeed(input: FeedInput) {
  const cursor = decodeCursor(input.cursor);
  const offset = cursor?.offset ?? 0;
  const sessionId = cursor?.sessionId ?? `feed_${crypto.randomUUID()}`;
  const cacheVersion = await feedCacheVersion(input.userId);
  const locationKey = input.latitude === undefined || input.longitude === undefined
    ? 'none'
    : `${input.latitude.toFixed(2)}:${input.longitude.toFixed(2)}`;
  const keywordKey = normalized(input.keyword ?? 'all').replace(/[^a-z0-9-]/g, '');
  const cacheKey = `feed:response:${input.userId}:${cacheVersion}:${input.mode ?? 'for-you'}:${keywordKey}:${offset}:${input.limit}:${locationKey}`;
  const cached = await cacheGetJson<Awaited<ReturnType<typeof createFeedResponse>>>(cacheKey);
  if (cached) return {...cached, cache: 'hit' as const};
  const response = await createFeedResponse(input, cursor, offset, sessionId);
  await Promise.all([
    cacheSetJson(cacheKey, response, config.FEED_CACHE_TTL_SECONDS),
    cacheSetJson(`feed:session:${sessionId}`, {userId: input.userId, modelVersion: FEED_MODEL_VERSION, createdAt: new Date().toISOString()}, 30 * 60),
  ]);
  return {...response, cache: 'miss' as const};
}

async function createFeedResponse(input: FeedInput, cursor: FeedCursor | null, offset: number, sessionId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekday = now.getUTCDay();
  const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const [user, favorites, states, videos, engagement, reports, postgisDistances, rememberedSeen, campaigns, campaignDailyCounts] = await Promise.all([
    prisma.user.findUniqueOrThrow({where: {id: input.userId}, select: {favoriteAmbiences: true, preferredBudget: true}}),
    prisma.favorite.findMany({where: {userId: input.userId}, select: {placeId: true, place: {select: {categoryId: true}}}}),
    prisma.userVideoState.findMany({where: {userId: input.userId}, select: {videoId: true, lastSeenAt: true, hidden: true}}),
    prisma.placeMedia.findMany({
      where: {type: PlaceMediaType.VIDEO, active: true, moderationStatus: MediaModerationStatus.APPROVED, secureUrl: {startsWith: 'https://'}},
      include: {place: {include: {categories: true, openingHours: {where: {weekday}}, closures: {where: {date: today}}}}},
      orderBy: {createdAt: 'desc'},
      take: 300,
    }),
    prisma.feedEvent.groupBy({by: ['videoId'], where: {occurredAt: {gte: since}, type: {in: [FeedEventType.VIDEO_COMPLETE, FeedEventType.PLACE_OPEN, FeedEventType.FAVORITE_ADD, FeedEventType.SHARE]}}, _count: {_all: true}}),
    prisma.feedEvent.groupBy({by: ['videoId'], where: {occurredAt: {gte: since}, type: FeedEventType.REPORT}, _count: {_all: true}}),
    getPostgisDistances(input.latitude, input.longitude),
    getRememberedSeenVideos(input.userId),
    prisma.sponsoredCampaign.findMany({
      where: {active: true, startsAt: {lte: now}, endsAt: {gte: now}},
      include: {
        video: {include: {place: {include: {categories: true, openingHours: {where: {weekday}}, closures: {where: {date: today}}}}}},
        impressions: {where: {userId: input.userId, createdAt: {gte: today}}, select: {id: true}},
        _count: {select: {impressions: true}},
      },
      orderBy: [{bidCpmCents: 'desc'}, {createdAt: 'asc'}],
    }),
    prisma.sponsoredImpression.groupBy({by: ['campaignId'], where: {createdAt: {gte: today}}, _count: {_all: true}}),
  ]);
  const favoritePlaces = new Set(favorites.map(item => item.placeId));
  const favoriteCategories = new Set(favorites.map(item => item.place.categoryId));
  const stateByVideo = new Map(states.map(state => [state.videoId, state]));
  const engagementByVideo = new Map(engagement.map(row => [row.videoId, row._count._all]));
  const reportCountByVideo = new Map(reports.map(row => [row.videoId, row._count._all]));
  const maxEngagement = Math.max(1, ...engagement.map(row => row._count._all));
  const coldStart = favorites.length === 0 && states.length < 3;
  const availableFilters = buildAvailableFilters(videos);

  const scored = videos.flatMap(video => {
    const state = stateByVideo.get(video.id);
    if (state?.hidden) return [];
    if (!matchesFeedKeyword(video.keywords, input.keyword)) return [];
    if ((reportCountByVideo.get(video.id) ?? 0) >= 3) return [];
    if (video.duration && (video.duration < 2 || video.duration > 90)) return [];
    const hours = video.place.openingHours[0];
    const open = video.place.closures.length === 0 && (!hours || isOpenAt(hours.openTime, hours.closeTime, hours.isClosed, currentTime));
    if (input.mode === 'nearby' && !open) return [];
    const categoryIds = [video.place.categoryId, ...video.place.categories.map(item => item.categoryId)];
    const categoryMatch = categoryIds.some(categoryId => favoriteCategories.has(categoryId));
    const ambienceMatch = video.place.ambienceTags.some(tag => user.favoriteAmbiences.includes(tag));
    const budgetMatch = user.preferredBudget && video.place.averagePrice ? video.place.averagePrice <= user.preferredBudget : false;
    const interest = clamp((categoryMatch ? 0.5 : 0) + (ambienceMatch ? 0.3 : 0) + (budgetMatch ? 0.2 : 0));
    const distance = input.latitude !== undefined && input.longitude !== undefined
      ? postgisDistances?.get(video.placeId) ?? distanceKm(input.latitude, input.longitude, video.place.latitude, video.place.longitude)
      : null;
    const proximity = distance === null ? 0.5 : Math.exp(-distance / 8);
    const engagementScore = clamp((engagementByVideo.get(video.id) ?? 0) / maxEngagement);
    const ageDays = Math.max(0, (Date.now() - video.createdAt.getTime()) / 86_400_000);
    const freshness = Math.exp(-ageDays / 14);
    const quality = video.place.verified ? 1 : 0.55;
    const popularity = engagementScore;
    const availability = open ? 1 : 0;
    const novelty = state || rememberedSeen.has(video.id) ? 0.15 : 1;
    let seenPenalty = 0;
    if (state || rememberedSeen.has(video.id)) {
      if (!state) seenPenalty = 0.55;
      else {
        const seenDays = (Date.now() - state.lastSeenAt.getTime()) / 86_400_000;
        seenPenalty = seenDays < 1 ? 1 : seenDays < 7 ? 0.55 : seenDays < 30 ? 0.2 : 0;
      }
    }
    const score = scoreCandidate({interest, proximity, engagement: engagementScore, freshness, quality, popularity, availability, novelty, seenPenalty}, coldStart);
    const reason = favoritePlaces.has(video.placeId) ? 'Une adresse que vous aimez' : distance !== null && distance <= 5 ? 'Près de vous' : categoryMatch ? 'Selon vos préférences' : freshness > 0.7 ? 'Nouveau sur Barmej' : 'Populaire sur Barmej';
    return [{video, score, distance, reason, sponsored: false, campaignId: null as number | null}];
  }).sort((a, b) => b.score - a.score || b.video.id - a.video.id);

  const diversified: typeof scored = [];
  const placeCounts = new Map<number, number>();
  for (const candidate of scored) {
    if ((placeCounts.get(candidate.video.placeId) ?? 0) >= 2) continue;
    diversified.push(candidate);
    placeCounts.set(candidate.video.placeId, (placeCounts.get(candidate.video.placeId) ?? 0) + 1);
  }
  const dailyCounts = new Map(campaignDailyCounts.map(row => [row.campaignId, row._count._all]));
  const sponsored = campaigns.find(campaign => {
    if (!matchesFeedKeyword(campaign.video.keywords, input.keyword)) return false;
    if (campaign.video.type !== PlaceMediaType.VIDEO || campaign.video.placeId !== campaign.placeId) return false;
    const campaignDistance = campaign.latitude !== null && campaign.longitude !== null && input.latitude !== undefined && input.longitude !== undefined
      ? distanceKm(input.latitude, input.longitude, campaign.latitude, campaign.longitude)
      : null;
    return campaignEligible({userImpressions: campaign.impressions.length, maxUserImpressions: campaign.maxImpressionsPerUserDay, dailyImpressions: dailyCounts.get(campaign.id) ?? 0, totalImpressions: campaign._count.impressions, bidCpmCents: campaign.bidCpmCents, dailyBudgetCents: campaign.dailyBudgetCents, totalBudgetCents: campaign.totalBudgetCents, distanceKm: campaignDistance, radiusKm: campaign.radiusKm});
  });
  if (sponsored) {
    const organicIndex = diversified.findIndex(candidate => candidate.video.id === sponsored.videoId);
    if (organicIndex >= 0) diversified.splice(organicIndex, 1);
    const distance = input.latitude !== undefined && input.longitude !== undefined
      ? postgisDistances?.get(sponsored.placeId) ?? distanceKm(input.latitude, input.longitude, sponsored.video.place.latitude, sponsored.video.place.longitude)
      : null;
    diversified.splice(Math.min(3, diversified.length), 0, {
      video: sponsored.video,
      score: 1,
      distance,
      reason: 'Sponsorisé',
      sponsored: true,
      campaignId: sponsored.id,
    });
  }
  const page = diversified.slice(offset, offset + input.limit);
  const nextOffset = offset + page.length;
  return {
    items: page.map(({video, score, distance, reason, sponsored, campaignId}) => ({
      idMedia: video.id, idPlace: video.placeId, publicId: video.publicId, secureUrl: video.secureUrl, width: video.width, height: video.height, duration: video.duration, keywords: video.keywords,
      place: placeDto(video.place), score: Math.round(score * 10_000) / 10_000, distanceKm: distance === null ? null : Math.round(distance * 10) / 10, reason, sponsored, campaignId,
    })),
    nextCursor: nextOffset < diversified.length ? encodeCursor({type: 'feed-cursor', offset: nextOffset, sessionId, modelVersion: FEED_MODEL_VERSION}) : null,
    hasMore: nextOffset < diversified.length,
    sessionId,
    requestId: crypto.randomUUID(),
    modelVersion: FEED_MODEL_VERSION,
    coldStart,
    availableFilters,
    filtersApplied: ['active', 'moderated', 'valid-url', 'report-threshold', 'duration', ...(input.mode === 'nearby' ? ['open-now'] : []), ...(input.keyword ? [`keyword:${input.keyword}`] : [])],
  };
}
