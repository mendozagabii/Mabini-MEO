// @mine — Supabase connection layer (added during SQLite → Supabase migration).
// Three client flavours:
//  - anon:    public key, used server-side to perform password sign-in.
//  - user:    carries the logged-in user's JWT, so Postgres RLS policies apply.
//  - admin:   service-role key, BYPASSES RLS — server-only, used sparingly
//             (user administration, login bookkeeping RPCs, activity logs).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ACCESS_COOKIE = 'wblrms-access-token';
export const REFRESH_COOKIE = 'wblrms-refresh-token';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey && serviceRoleKey);
}

export function createAnonClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createAdminClient(): SupabaseClient {
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// App display role  <->  user_role enum
export const ROLE_TO_DB: Record<string, string> = {
  'Head Engineer': 'head_engineer',
  'Staff - Encoder': 'encoder',
  'Staff - Inspector': 'inspector',
  'Staff - Validator': 'validator',
};
export const ROLE_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_TO_DB).map(([display, db]) => [db, display]),
);

export interface SessionProfile {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string; // display role, e.g. 'Head Engineer'
  roleDb: string;
  status: 'Active' | 'Inactive';
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') ?? '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export async function getProfileForUser(admin: SupabaseClient, userId: string): Promise<SessionProfile | null> {
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).is('archived_at', null).single();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.full_name || data.name || data.username,
    email: data.email,
    username: data.username,
    role: ROLE_FROM_DB[data.role] ?? data.role,
    roleDb: data.role,
    status: data.status === 'inactive' || data.status === 'locked' ? 'Inactive' : 'Active',
  };
}

export interface AuthedContext {
  userId: string;
  email: string;
  profile: SessionProfile;
  /** RLS-scoped client (acts as the user). Use for all table data. */
  db: SupabaseClient;
  /** Service-role client (bypasses RLS). Use sparingly. */
  admin: SupabaseClient;
}

/**
 * Validate the session cookie on an API request. Returns null when there is
 * no valid session. Refreshes the access token (and reports new cookies via
 * `refreshed`) when the access token has expired but the refresh token works.
 */
export async function requireAuth(
  request: Request,
): Promise<(AuthedContext & { refreshed?: { access: string; refresh: string; expiresIn: number } }) | null> {
  if (!supabaseConfigured()) return null;
  const cookies = parseCookies(request);
  const access = cookies[ACCESS_COOKIE];
  const refresh = cookies[REFRESH_COOKIE];
  if (!access && !refresh) return null;

  const admin = createAdminClient();
  let userId: string | null = null;
  let email = '';
  let refreshed: { access: string; refresh: string; expiresIn: number } | undefined;

  if (access) {
    const { data } = await admin.auth.getUser(access);
    if (data.user) {
      userId = data.user.id;
      email = data.user.email ?? '';
    }
  }
  if (!userId && refresh) {
    const anon = createAnonClient();
    const { data } = await anon.auth.refreshSession({ refresh_token: refresh });
    if (data.session && data.user) {
      userId = data.user.id;
      email = data.user.email ?? '';
      refreshed = {
        access: data.session.access_token,
        refresh: data.session.refresh_token,
        expiresIn: data.session.expires_in ?? 3600,
      };
    }
  }
  if (!userId) return null;

  const profile = await getProfileForUser(admin, userId);
  if (!profile || profile.status !== 'Active') return null;

  const effectiveAccess = refreshed?.access ?? access!;
  return { userId, email, profile, db: createUserClient(effectiveAccess), admin, refreshed };
}

export function sessionCookieHeaders(access: string, refresh: string, expiresIn: number): Record<string, string> {
  const common = 'Path=/; HttpOnly; SameSite=Lax';
  // Two Set-Cookie values joined for the headers object via append in route helpers.
  return {
    [ACCESS_COOKIE]: `${ACCESS_COOKIE}=${encodeURIComponent(access)}; ${common}; Max-Age=${expiresIn}`,
    [REFRESH_COOKIE]: `${REFRESH_COOKIE}=${encodeURIComponent(refresh)}; ${common}; Max-Age=${60 * 60 * 24 * 30}`,
  };
}

export function applySessionCookies(headers: Headers, access: string, refresh: string, expiresIn: number): void {
  const cookies = sessionCookieHeaders(access, refresh, expiresIn);
  headers.append('Set-Cookie', cookies[ACCESS_COOKIE]);
  headers.append('Set-Cookie', cookies[REFRESH_COOKIE]);
}

export function clearSessionCookies(headers: Headers): void {
  const common = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  headers.append('Set-Cookie', `${ACCESS_COOKIE}=; ${common}`);
  headers.append('Set-Cookie', `${REFRESH_COOKIE}=; ${common}`);
}
