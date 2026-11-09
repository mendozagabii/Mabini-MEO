// @mine — shared helpers for API routes after the Supabase migration.
import { NextResponse } from 'next/server';
import { applySessionCookies, requireAuth, type AuthedContext } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function unauthorized(message = 'You must be signed in to do that.'): NextResponse {
  return NextResponse.json({ message }, { status: 401 });
}

export function forbidden(message = 'Your role does not allow that action.'): NextResponse {
  return NextResponse.json({ message }, { status: 403 });
}

/** Attach refreshed session cookies (if requireAuth refreshed the token) to a response. */
export function withRefresh(
  response: NextResponse,
  auth: (AuthedContext & { refreshed?: { access: string; refresh: string; expiresIn: number } }) | null,
): NextResponse {
  if (auth?.refreshed) {
    applySessionCookies(response.headers, auth.refreshed.access, auth.refreshed.refresh, auth.refreshed.expiresIn);
  }
  return response;
}

export async function requireRole(
  request: Request,
  roles: string[],
): Promise<{ auth: AuthedContext & { refreshed?: { access: string; refresh: string; expiresIn: number } }; denied?: undefined } | { auth?: undefined; denied: NextResponse }> {
  const auth = await requireAuth(request);
  if (!auth) return { denied: unauthorized() };
  if (!roles.includes(auth.profile.roleDb)) return { denied: forbidden() };
  return { auth };
}

export { requireAuth };
