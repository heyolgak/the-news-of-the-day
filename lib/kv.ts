import { Redis } from '@upstash/redis';
import { requireEnv } from './env';
import type { NewsEntry } from './types';

export const NEWS_LATEST_KEY = 'news:latest';

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
