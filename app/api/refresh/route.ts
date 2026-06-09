import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { runRefresh } from '@/lib/refresh';

export const runtime = 'nodejs';
// Backup/manual path only. The scheduled refresh runs in GitHub Actions
// (no 60s ceiling); this 60s cap is just the Vercel-Hobby function limit for
// an on-demand trigger.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${requireEnv('CRON_SECRET')}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await runRefresh();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  return NextResponse.json(result.entry);
}

export const GET = handle;
export const POST = handle;
