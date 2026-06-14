import { crawlSources } from './tavily';
import { synthesizeNews, MODEL } from './nebius';
import { resolveHeadlines } from './headlines';
import { setLatestNews, setLastRun } from './kv';
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
 * `news:latest` on failure (the previous good entry stays). Records the
 * outcome to `news:lastRun` either way (dead-man's-switch).
 */
export async function runRefresh(): Promise<RefreshResult> {
  const t0 = Date.now();

  let articles;
  try {
    articles = await crawlSources();
  } catch (err) {
    console.error('[refresh] crawl failed', err);
    return fail('crawl_failed', err);
  }
  console.log(`[refresh] crawled ${articles.length} articles`);

  if (articles.length < 3) {
    console.warn(`[refresh] too few articles (${articles.length}), aborting`);
    return fail('too_few_articles');
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  console.log(`[refresh] synthesizing with model ${MODEL}`);
  let entry: NewsEntry;
  try {
    entry = await synthesizeNews(articles, todayIso);
  } catch (err) {
    console.error('[refresh] synthesis failed', err);
    return fail('synthesis_failed', err);
  }

  // Re-resolve each chosen source's headline from its own og:title (Tavily
  // hands us the SEO <title>, brand suffix and all). Best-effort: never throws.
  entry = { ...entry, sources: await resolveHeadlines(entry.sources) };

  try {
    await setLatestNews(entry);
  } catch (err) {
    console.error('[refresh] KV write failed', err);
    return fail('kv_write_failed', err);
  }

  const durationMs = Date.now() - t0;
  console.log(`[refresh] wrote KV in ${durationMs}ms total (model ${MODEL})`);
  await recordLastRun('ok');
  return { ok: true, entry, durationMs };
}

async function fail(reason: RefreshReason, error?: unknown): Promise<RefreshResult> {
  await recordLastRun('error', `${reason}${error ? `: ${errMessage(error)}` : ''}`);
  return { ok: false, reason, error };
}

/** Best-effort: a lastRun write must never mask the real refresh outcome. */
async function recordLastRun(status: 'ok' | 'error', detail?: string): Promise<void> {
  try {
    await setLastRun(status, detail);
  } catch (err) {
    console.error('[refresh] failed to write lastRun', err);
  }
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
