import { Redis } from '@upstash/redis';
import { requireEnv } from './env';
import type { NewsEntry } from './types';

export const NEWS_LATEST_KEY = 'news:latest';
export const NEWS_LAST_RUN_KEY = 'news:lastRun';

export type LastRun = {
  at: string; // ISO timestamp of the run
  status: 'ok' | 'error';
  error?: string; // short reason, present when status === 'error'
};

const redis = new Redis({
  url: requireEnv('KV_REST_API_URL'),
  token: requireEnv('KV_REST_API_TOKEN'),
});

export async function getLatestNews(): Promise<NewsEntry | null> {
  return await redis.get<NewsEntry>(NEWS_LATEST_KEY);
}

export async function setLatestNews(entry: NewsEntry): Promise<void> {
  await redis.set(NEWS_LATEST_KEY, entry);
}

/**
 * Dead-man's-switch: every refresh records its outcome here, success or
 * failure, so a silently-failing pipeline is queryable (the scheduled run also
 * exits non-zero on failure, which turns the GitHub Actions job red).
 */
export async function setLastRun(status: 'ok' | 'error', error?: string): Promise<void> {
  const payload: LastRun = {
    at: new Date().toISOString(),
    status,
    ...(error ? { error } : {}),
  };
  await redis.set(NEWS_LAST_RUN_KEY, payload);
}

export async function getLastRun(): Promise<LastRun | null> {
  return await redis.get<LastRun>(NEWS_LAST_RUN_KEY);
}
