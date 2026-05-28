import { NextResponse } from 'next/server';
import { getLatestNews } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entry = await getLatestNews();
    if (entry === null) {
      return NextResponse.json({ entry: null });
    }
    return NextResponse.json(entry);
  } catch (err) {
    console.error('[api/latest] redis error', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
