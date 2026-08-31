import {createClient, RedisClientType} from 'redis';
import {config} from './config';

type MemoryEntry = {value: string; expiresAt: number};
const memory = new Map<string, MemoryEntry>();
const memorySets = new Map<string, Set<string>>();
let redis: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType | null> | null = null;
let redisUnavailableUntil = 0;

const memoryGet = (key: string) => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
};

const memorySet = (key: string, value: string, ttlSeconds: number) => {
  memory.set(key, {value, expiresAt: Date.now() + ttlSeconds * 1000});
};

async function client() {
  if (!config.REDIS_URL || Date.now() < redisUnavailableUntil) return null;
  if (redis?.isReady) return redis;
  if (redisConnecting) return redisConnecting;
  redisConnecting = (async () => {
    try {
      const next = createClient({url: config.REDIS_URL, socket: {connectTimeout: 1200, reconnectStrategy: false}});
      next.on('error', () => undefined);
      await next.connect();
      redis = next as RedisClientType;
      console.log('Feed cache connected to Redis');
      return redis;
    } catch {
      redisUnavailableUntil = Date.now() + 30_000;
      console.warn('Redis unavailable; using the in-memory feed cache.');
      return null;
    } finally {
      redisConnecting = null;
    }
  })();
  return redisConnecting;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const active = await client();
  const value = active ? await active.get(key).catch(() => null) : memoryGet(key);
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number) {
  const serialized = JSON.stringify(value);
  const active = await client();
  if (active) await active.set(key, serialized, {EX: ttlSeconds}).catch(() => memorySet(key, serialized, ttlSeconds));
  else memorySet(key, serialized, ttlSeconds);
}

export async function feedCacheVersion(userId: number) {
  const key = `feed:version:${userId}`;
  const active = await client();
  const value = active ? await active.get(key).catch(() => null) : memoryGet(key);
  return value ?? '0';
}

export async function invalidateUserFeed(userId: number) {
  const key = `feed:version:${userId}`;
  const active = await client();
  if (active) await active.incr(key).catch(() => undefined);
  else {
    const version = Number(memoryGet(key) ?? 0) + 1;
    memorySet(key, String(version), 24 * 60 * 60);
  }
}

export async function rememberSeenVideos(userId: number, videoIds: number[]) {
  if (!videoIds.length) return;
  const key = `feed:seen:${userId}`;
  const values = videoIds.map(String);
  const active = await client();
  if (active) {
    await active.sAdd(key, values).catch(() => undefined);
    await active.expire(key, 30 * 24 * 60 * 60).catch(() => undefined);
  } else {
    const set = memorySets.get(key) ?? new Set<string>();
    values.forEach(value => set.add(value));
    memorySets.set(key, set);
  }
}

export async function getRememberedSeenVideos(userId: number) {
  const key = `feed:seen:${userId}`;
  const active = await client();
  const values = active ? await active.sMembers(key).catch(() => []) : [...(memorySets.get(key) ?? [])];
  return new Set(values.map(Number));
}

export async function consumeRateLimit(userId: number, bucket: string, limit: number, windowSeconds: number) {
  const period = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${bucket}:${userId}:${period}`;
  const active = await client();
  if (active) {
    const count = await active.incr(key);
    if (count === 1) await active.expire(key, windowSeconds + 1);
    return {allowed: count <= limit, remaining: Math.max(0, limit - count)};
  }
  const count = Number(memoryGet(key) ?? 0) + 1;
  memorySet(key, String(count), windowSeconds + 1);
  return {allowed: count <= limit, remaining: Math.max(0, limit - count)};
}

export const cacheMode = () => config.REDIS_URL ? (redis?.isReady ? 'redis' : 'memory-fallback') : 'memory';

export async function closeCache() {
  if (redis?.isOpen) await redis.quit().catch(() => undefined);
}

export function resetCacheForTests() {
  memory.clear();
  memorySets.clear();
}
