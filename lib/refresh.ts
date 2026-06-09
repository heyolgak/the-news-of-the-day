import { crawlSources } from './tavily';
import { synthesizeNews } from './nebius';
import { setLatestNews } from './kv';
import type { NewsEntry } from './types';

export type RefreshReason =
  | 'crawl_failed'
  | 'too_few_articles'
  | 'synthesis_failed'
  | 'kv_write_failed';

export type RefreshResult =
  | { ok: true; entry: NewsEntry; durationMs: number }
  | { ok: false; reason: RefreshReason; error?: unknown };

/**
 * The full refresh pipeline — crawl → synthesize → write KV — shared by the
 * scheduled GitHub Actions script (`scripts/refresh.ts`). Never overwrites
 * `news:latest` on failure (the previous good entry stays).
 */
export async function runRefresh(): Promise<RefreshResult> {
  const t0 = Date.now();

  let articles;
  try {
    articles = await crawlSources();
  } catch (err) {
    console.error('[refresh] crawl failed', err);
    return { ok: false, reason: 'crawl_failed', error: err };
  }
  console.log(`[refresh] crawled ${articles.length} articles`);

  if (articles.length < 3) {
    console.warn(`[refresh] too few articles (${articles.length}), aborting`);
    return { ok: false, reason: 'too_few_articles' };
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let entry: NewsEntry;
  try {
    entry = await synthesizeNews(articles, todayIso);
  } catch (err) {
    console.error('[refresh] synthesis failed', err);
    return { ok: false, reason: 'synthesis_failed', error: err };
  }

  try {
    await setLatestNews(entry);
  } catch (err) {
    console.error('[refresh] KV write failed', err);
    return { ok: false, reason: 'kv_write_failed', error: err };
  }

  const durationMs = Date.now() - t0;
  console.log(`[refresh] wrote KV in ${durationMs}ms total`);
  return { ok: true, entry, durationMs };
}
