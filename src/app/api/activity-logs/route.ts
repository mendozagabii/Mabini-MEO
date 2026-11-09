// @mine — rewritten for Supabase; now requires a session (was unauthenticated).
// Note: DB triggers already log most table changes automatically; this route
// keeps the app's explicit login/logout-style entries working.
import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, withRefresh } from '@/lib/api';
import { addActivityLog, listActivityLogs } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    return withRefresh(NextResponse.json({ logs: await listActivityLogs(auth.admin) }), auth);
  } catch (error) {
    console.error('Failed to list activity logs.', error);
    return NextResponse.json({ message: 'Unable to load activity logs.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  const payload = (await request.json().catch(() => null)) as { user?: unknown; action?: unknown; details?: unknown } | null;
  if (!payload?.user || !payload?.action || !payload?.details) {
    return NextResponse.json({ message: 'User, action, and details are required.' }, { status: 400 });
  }
  await addActivityLog(auth.admin, {
    userId: auth.userId,
    user: auth.profile.username,
    action: String(payload.action),
    details: String(payload.details),
  });
  return withRefresh(NextResponse.json({ success: true }, { status: 201 }), auth);
}
