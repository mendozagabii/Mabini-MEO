// @mine — new route: who am I? Used by the app shell to restore the session
// after a page refresh (previously login state vanished on refresh).
import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, withRefresh } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized('No active session.');
  return withRefresh(
    NextResponse.json({
      id: auth.profile.id,
      name: auth.profile.name,
      email: auth.profile.email,
      username: auth.profile.username,
      role: auth.profile.role,
    }),
    auth,
  );
}
