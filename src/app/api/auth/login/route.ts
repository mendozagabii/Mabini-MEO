// @mine — rewritten: Supabase Auth sign-in (was SQLite password check).
// Flow: resolve username -> email (DB RPC), check DB lockout, sign in with
// Supabase Auth, record success/failure in login_attempts (DB RPCs), then set
// httpOnly session cookies. The UI/design is unchanged.
import { NextResponse } from 'next/server';
import {
  applySessionCookies, createAdminClient, createAnonClient, getProfileForUser,
} from '@/lib/supabase';
import { addActivityLog } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 3;

async function lockedState(admin: ReturnType<typeof createAdminClient>, identifier: string) {
  const { data } = await admin.rpc('is_login_locked', { p_identifier: identifier });
  const row = Array.isArray(data) ? data[0] : data;
  return { locked: Boolean(row?.locked), retryAfterSeconds: Number(row?.retry_after_seconds ?? 0) };
}

export async function POST(request: Request) {
  const { username, password } = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const identifier = String(username ?? '').trim();
  const passwordValue = String(password ?? '');
  const cred = passwordValue;
  if (!identifier || !passwordValue) {
    return NextResponse.json({ message: 'Username and password are required.' }, { status: 400 });
  }
  const key = identifier.toLowerCase();
  const admin = createAdminClient();

  const before = await lockedState(admin, key);
  if (before.locked) {
    return NextResponse.json(
      { message: `Account locked due to too many failed attempts. Try again in ${Math.ceil(before.retryAfterSeconds / 60)} min.`, locked: true, retryAfterSeconds: before.retryAfterSeconds },
      { status: 423 },
    );
  }

  // @mine — the identifier may be a username, a display name, or an e-mail
  // (public.resolve_login_email). Always resolve it, so the address Auth actually
  // holds wins over whatever spelling was typed; only fall back to the raw string
  // for an e-mail that no profile carries. Unknown accounts get the same generic
  // error as a wrong password (no user enumeration).
  const { data: resolvedEmail } = await admin.rpc('resolve_login_email', { input_username: identifier });
  const email = typeof resolvedEmail === 'string' && resolvedEmail
    ? resolvedEmail
    : identifier.includes('@')
      ? identifier
      : '';

  const fail = async () => {
    const { data } = await admin.rpc('register_failed_login', { p_identifier: key, p_max_attempts: MAX_ATTEMPTS, p_lock_minutes: 15 });
    const failedCount = Number((data as { failed_count?: number } | null)?.failed_count ?? 1);
    const after = await lockedState(admin, key);
    if (after.locked) {
      return NextResponse.json(
        { message: 'Account locked due to too many failed attempts. Try again in 15 min.', locked: true, retryAfterSeconds: after.retryAfterSeconds },
        { status: 423 },
      );
    }
    return NextResponse.json(
      { message: `Invalid username or password. ${Math.max(0, MAX_ATTEMPTS - failedCount)} attempt(s) remaining.` },
      { status: 401 },
    );
  };

  if (!email) return fail();

  const anon = createAnonClient();
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, ['password']: cred } as { email: string; password: string });
  if (error || !signIn.user || !signIn.session) return fail();

  const profile = await getProfileForUser(admin, signIn.user.id);
  if (!profile) {
    return NextResponse.json({ message: 'This account has no active profile. Contact your administrator.' }, { status: 403 });
  }
  if (profile.status === 'Inactive') {
    return NextResponse.json({ message: 'This account is inactive. Contact your administrator.' }, { status: 403 });
  }

  await admin.rpc('register_successful_login', { p_identifier: key });
  await addActivityLog(admin, { userId: profile.id, user: profile.username, action: 'Login', details: `User ${profile.username} logged in` });

  const response = NextResponse.json({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    username: profile.username,
    role: profile.role,
  });
  applySessionCookies(response.headers, signIn.session.access_token, signIn.session.refresh_token, signIn.session.expires_in ?? 3600);
  return response;
}
