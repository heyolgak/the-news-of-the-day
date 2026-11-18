import { crawlSources } from './tavily';
import { synthesizeNews, MODEL_CHAIN } from './nebius';
import { resolveHeadlines } from './headlines';
import { setLatestNews, setLastRun, type LastRun } from './kv';
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

  console.log(`[refresh] synthesizing with model chain ${MODEL_CHAIN.join(' → ')}`);
  let entry: NewsEntry;
  let model: string;
  let fallbackReason: string | undefined;
  try {
    ({ entry, model, fallbackReason } = await synthesizeNews(articles, todayIso));
  } catch (err) {
    console.error('[refresh] synthesis failed', err);
    return fail('synthesis_failed', err);
  }
  if (fallbackReason) {
    // A silent fallback would hide the next model removal until the whole chain
    // is gone. `::warning::` is a GitHub Actions workflow command: it renders as
    // a yellow annotation on the (still green) run.
    console.log(
      `::warning::Nebius primary ${MODEL_CHAIN[0]} failed (${oneLine(fallbackReason)}); used fallback ${model}`,
    );
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
  console.log(`[refresh] wrote KV in ${durationMs}ms total (model ${model})`);
  await recordLastRun('ok', { model, fallbackReason });
  return { ok: true, entry, durationMs };
}

async function fail(reason: RefreshReason, error?: unknown): Promise<RefreshResult> {
  await recordLastRun('error', { error: `${reason}${error ? `: ${errMessage(error)}` : ''}` });
  return { ok: false, reason, error };
}

/** Best-effort: a lastRun write must never mask the real refresh outcome. */
async function recordLastRun(
  status: 'ok' | 'error',
  detail: Omit<LastRun, 'at' | 'status'> = {},
): Promise<void> {
  try {
    await setLastRun(status, detail);
  } catch (err) {
    console.error('[refresh] failed to write lastRun', err);
  }
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Workflow-command annotations are single-line; collapse newlines. */
function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ');
}
