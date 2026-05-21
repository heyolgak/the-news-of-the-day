import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
