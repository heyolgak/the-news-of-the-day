import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { setLatestNews } from '@/lib/kv';
import { crawlSources } from '@/lib/tavily';
import { synthesizeNews } from '@/lib/nebius';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const secret = requireEnv('CRON_SECRET');
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let articles;
  try {
    articles = await crawlSources();
  } catch (err) {
    console.error('[refresh] crawl failed', err);
    return NextResponse.json({ error: 'crawl_failed' }, { status: 503 });
  }
  console.log(`[refresh] crawled ${articles.length} articles`);

  if (articles.length < 3) {
    console.warn(`[refresh] too few articles (${articles.length}), aborting`);
    return NextResponse.json({ error: 'too_few_articles' }, { status: 503 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let entry;
  try {
    entry = await synthesizeNews(articles, todayIso);
  } catch (err) {
    console.error('[refresh] synthesis failed', err);
    return NextResponse.json({ error: 'synthesis_failed' }, { status: 503 });
  }

  try {
    await setLatestNews(entry);
  } catch (err) {
    console.error('[refresh] KV write failed', err);
    return NextResponse.json({ error: 'kv_write_failed' }, { status: 503 });
  }
  console.log(`[refresh] wrote KV in ${Date.now() - t0}ms total`);

  return NextResponse.json(entry);
}
