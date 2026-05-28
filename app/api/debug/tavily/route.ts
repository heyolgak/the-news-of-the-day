import { NextRequest, NextResponse } from 'next/server';
import { crawlSources } from '@/lib/tavily';
import { requireEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = requireEnv('CRON_SECRET');
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const articles = await crawlSources();
    return NextResponse.json({
      count: articles.length,
      sample: articles.slice(0, 3).map((a) => ({
        outlet: a.outlet,
        title: a.title,
        url: a.url,
        bodyLen: a.body.length,
      })),
    });
  } catch (err) {
    console.error('[api/_debug/tavily] crawl failed', err);
    return NextResponse.json({ error: 'tavily_failed' }, { status: 503 });
  }
}
