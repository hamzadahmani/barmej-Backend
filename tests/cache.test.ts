import {beforeEach, describe, expect, it} from 'vitest';
import {cacheGetJson, cacheSetJson, consumeRateLimit, feedCacheVersion, getRememberedSeenVideos, invalidateUserFeed, rememberSeenVideos, resetCacheForTests} from '../src/cache';

describe('feed cache memory fallback', () => {
  beforeEach(() => resetCacheForTests());

  it('stores JSON with a TTL', async () => {
    await cacheSetJson('test:value', {ok: true}, 30);
    await expect(cacheGetJson('test:value')).resolves.toEqual({ok: true});
  });

  it('invalidates a user ranking with a version', async () => {
    expect(await feedCacheVersion(42)).toBe('0');
    await invalidateUserFeed(42);
    expect(await feedCacheVersion(42)).toBe('1');
  });

  it('remembers watched videos and limits abusive traffic', async () => {
    await rememberSeenVideos(42, [1, 2]);
    expect(await getRememberedSeenVideos(42)).toEqual(new Set([1, 2]));
    expect((await consumeRateLimit(42, 'test', 2, 60)).allowed).toBe(true);
    expect((await consumeRateLimit(42, 'test', 2, 60)).allowed).toBe(true);
    expect((await consumeRateLimit(42, 'test', 2, 60)).allowed).toBe(false);
  });
});
