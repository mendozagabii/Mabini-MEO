// @mine — rewritten for Supabase (was SQLite users table). User administration
// is restricted to Head Engineer server-side (previously it was unauthenticated).
// Accounts now live in Supabase Auth + public.profiles.
import { NextResponse } from 'next/server';
import { requireRole, withRefresh } from '@/lib/api';
import { addActivityLog, listArchivedUsers, listUsers, mapProfile } from '@/lib/supabase-data';
import { toDbRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEAD = ['head_engineer'];
const HEAD_EXISTS = 'Only one current Head Engineer account is allowed.';

// Applies to non-archived profiles, even if an account is inactive.
async function anotherHeadExists(admin: any, exceptId?: string): Promise<boolean> {
  let query = admin.from('profiles').select('id').eq('role', 'head_engineer').is('archived_at', null);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function isHeadConstraintError(error: unknown): boolean {
  const value = error as { code?: string; message?: string; details?: string } | null;
  return value?.code === '23505' && `${value.message ?? ''} ${value.details ?? ''}`.includes('profiles_one_current_head_engineer');
}


// @mine — the login handle IS the display name, normalised (lower-case, single
// spaces). Identity is then guaranteed by the unique constraint on
// profiles.username: two accounts can never share a name, and no legacy handle
// like 'admin' survives a rename. `admin` is no longer a valid login.
function deriveUsername(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export async function GET(request: Request) {
  const { auth, denied } = await requireRole(request, HEAD);
  if (denied) return denied;
  try {
    const [users, archivedUsers] = await Promise.all([listUsers(auth.admin), listArchivedUsers(auth.admin)]);
    return withRefresh(NextResponse.json({ users, archivedUsers }), auth);
  } catch (error) {
    console.error('Failed to list users.', error);
    return NextResponse.json({ message: 'Unable to load users.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, denied } = await requireRole(request, HEAD);
  if (denied) return denied;
  const { name, email, password, role, status } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(name ?? '').trim() || !String(email ?? '').trim() || !String(password ?? '') || !String(role ?? '').trim()) {
    return NextResponse.json({ message: 'Name, email, password, and role are required.' }, { status: 400 });
  }
  if (status !== 'Active' && status !== 'Inactive') {
    return NextResponse.json({ message: 'Invalid account status.' }, { status: 400 });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  // @mine — reject an unknown role instead of silently creating an encoder.
  const dbRole = toDbRole(role);
  if (!dbRole) {
    return NextResponse.json({ message: `Unknown role: ${String(role)}.` }, { status: 400 });
  }
  if (dbRole === 'head_engineer') {
    try { if (await anotherHeadExists(auth.admin)) return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 }); }
    catch { return NextResponse.json({ message: 'Unable to verify Head Engineer accounts.' }, { status: 500 }); }
  }
  const cred = String(password ?? '');
  if (cred.length < 8 || cred.length > 64) return NextResponse.json({ message: 'Password must be between 8 and 64 characters.' }, { status: 400 });
  // @mine — the handle follows the displayed name (no more e-mail-prefix handles).
  const cleanUsername = deriveUsername(name);
  if (!cleanUsername) {
    return NextResponse.json({ message: 'A name is required to build the username.' }, { status: 400 });
  }
  const { data: taken } = await auth.admin
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle();
  if (taken) {
    return NextResponse.json(
      { message: `An account is already named "${cleanUsername}". Add a distinguishing name (e.g. a middle name) first.` },
      { status: 409 },
    );
  }
  let createdUserId: string | undefined;
  try {
    // Trigger create_profile_for_auth_user creates the profile from metadata;
    // we then correct role/status/name (trigger defaults to encoder/active).
    const { data, error } = await auth.admin.auth.admin.createUser({
      email: cleanEmail,
      ['password']: cred,
      email_confirm: true,
      user_metadata: { name: String(name).trim(), username: cleanUsername },
    });
    if (error || !data.user) throw error ?? new Error('No user returned.');
    createdUserId = data.user.id;
    const { data: profile, error: updateError } = await auth.admin
      .from('profiles')
      .update({
        full_name: String(name).trim(),
        name: String(name).trim(),
        username: cleanUsername,
        role: dbRole,
        status: status === 'Inactive' ? 'inactive' : 'active',
      })
      .eq('id', data.user.id)
      .select('*')
      .single();
    if (updateError) throw updateError;
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'User Created', details: `Created user ${cleanUsername}` });
    return withRefresh(NextResponse.json({ user: mapProfile(profile) }, { status: 201 }), auth);
  } catch (error) {
    if (isHeadConstraintError(error)) {
      if (createdUserId) {
        try {
          const { error: cleanupError } = await auth.admin.auth.admin.deleteUser(createdUserId);
          if (cleanupError) console.error('Unable to clean up the rejected account.', cleanupError);
        } catch (cleanupError) { console.error('Unable to clean up the rejected account.', cleanupError); }
      }
      return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 });
    }
    const message = error instanceof Error && /already|exists|registered/i.test(error.message)
      ? 'That email or username is already registered.'
      : 'Unable to create the user account.';
    return NextResponse.json({ message }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const { auth, denied } = await requireRole(request, HEAD);
  if (denied) return denied;
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { email, status } = payload;
  if (status !== 'Active' && status !== 'Inactive') {
    return NextResponse.json({ message: 'Invalid email or status.' }, { status: 400 });
  }
  const dbStatus = status === 'Inactive' ? 'inactive' : 'active';
  try {
    if (typeof payload.id === 'string') {
      if (!String(payload.name ?? '').trim() || !String(payload.email ?? '').trim() || !String(payload.username ?? '').trim() || !String(payload.role ?? '').trim()) {
        return NextResponse.json({ message: 'Name, email, username, and role are required.' }, { status: 400 });
      }
      // @mine — the sign-in identity lives in auth.users; profiles only holds the
      // display copy. Editing either one alone leaves the account unusable (name/email
      // resolve through profiles, the credential is checked against auth.users), so an
      // email or password edit must be applied to auth.users FIRST and profiles second.
      const userId = String(payload.id);
      const nextEmail = String(payload.email).trim().toLowerCase();
      const nextPassword = String(payload.password ?? '');
      if (nextPassword && (nextPassword.length < 8 || nextPassword.length > 64)) {
        return NextResponse.json({ message: 'Password must be between 8 and 64 characters.' }, { status: 400 });
      }
      // @mine — same tolerant resolution as create; an unknown value is an error,
      // not a silent fallback to encoder.
      const dbRole = toDbRole(payload.role);
      if (!dbRole) {
        return NextResponse.json({ message: `Unknown role: ${String(payload.role)}.` }, { status: 400 });
      }
      const { data: current, error: currentError } = await auth.admin
        .from('profiles')
        .select('email, role')
        .eq('id', userId)
        .is('archived_at', null)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      if (dbRole === 'head_engineer' && await anotherHeadExists(auth.admin, userId)) return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 });

      // @mine — a Head Engineer demoting themselves would leave the system with no
      // one able to administer users (the master code does not grant roles).
      if (userId === auth.userId && dbRole !== current.role) {
        return NextResponse.json(
          { message: 'You cannot change your own role. Ask another Head Engineer to do it.' },
          { status: 400 },
        );
      }
      // @mine — the handle must always equal the name, and must not collide.
      const nextUsername = deriveUsername(payload.name);
      if (!nextUsername) {
        return NextResponse.json({ message: 'A name is required to build the username.' }, { status: 400 });
      }
      const { data: clash } = await auth.admin
        .from('profiles')
        .select('id')
        .eq('username', nextUsername)
        .neq('id', userId)
        .maybeSingle();
      if (clash) {
        return NextResponse.json(
          { message: `Another account is already named "${nextUsername}". Add a distinguishing name (e.g. a middle name) first.` },
          { status: 409 },
        );
      }

      const emailChanged = nextEmail !== String(current.email ?? '').trim().toLowerCase();
      if (emailChanged || nextPassword) {
        const { error: authError } = await auth.admin.auth.admin.updateUserById(userId, {
          ...(emailChanged ? { email: nextEmail, email_confirm: true } : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        });
        if (authError) {
          const message = /already|registered|exists|duplicate/i.test(authError.message)
            ? 'That email is already registered to another account.'
            : `Unable to update the sign-in account: ${authError.message}`;
          return NextResponse.json({ message }, { status: 409 });
        }
      }

      const { error, count } = await auth.admin
        .from('profiles')
        .update({
          full_name: String(payload.name).trim(),
          name: String(payload.name).trim(),
          email: String(payload.email).trim().toLowerCase(),
          username: nextUsername,
          role: dbRole,
          status: dbStatus,
        }, { count: 'exact' })
        .eq('id', payload.id)
        .is('archived_at', null);
      if (error) throw error;
      if (!count) return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      return withRefresh(NextResponse.json({ success: true }), auth);
    }
    if (!email) return NextResponse.json({ message: 'Invalid email or status.' }, { status: 400 });
    const { error, count } = await auth.admin
      .from('profiles')
      .update({ status: dbStatus }, { count: 'exact' })
      .eq('email', String(email).trim().toLowerCase())
      .is('archived_at', null);
    if (error) throw error;
    if (!count) return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    return withRefresh(NextResponse.json({ success: true, status }), auth);
  } catch (error) {
    if (isHeadConstraintError(error)) return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 });
    const message = error instanceof Error && /unique|duplicate/i.test(error.message)
      ? 'That email or username is already registered.'
      : 'Unable to update the user account.';
    return NextResponse.json({ message }, { status: 409 });
  }
}

export async function PUT(request: Request) {
  const { auth, denied } = await requireRole(request, HEAD);
  if (denied) return denied;
  const { userId, action } = (await request.json().catch(() => ({}))) as { userId?: unknown; action?: unknown };
  if (typeof userId !== 'string' || (action !== 'archive' && action !== 'restore')) {
    return NextResponse.json({ message: 'A valid user ID and action are required.' }, { status: 400 });
  }
  if (action === 'restore') {
    const { data: profile, error: profileError } = await auth.admin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profileError) return NextResponse.json({ message: 'Unable to verify this user.' }, { status: 500 });
    try { if (profile?.role === 'head_engineer' && await anotherHeadExists(auth.admin, userId)) return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 }); }
    catch { return NextResponse.json({ message: 'Unable to verify Head Engineer accounts.' }, { status: 500 }); }
  }
  const { error, count } = await auth.admin
    .from('profiles')
    .update({ archived_at: action === 'archive' ? new Date().toISOString() : null }, { count: 'exact' })
    .eq('id', userId);
  if (isHeadConstraintError(error)) return NextResponse.json({ message: HEAD_EXISTS }, { status: 409 });
  if (error) return NextResponse.json({ message: 'Unable to change this user.' }, { status: 500 });
  if (!count) return NextResponse.json({ message: 'User not found.' }, { status: 404 });
  return withRefresh(NextResponse.json({ success: true }), auth);
}

export async function DELETE(request: Request) {
  const { auth, denied } = await requireRole(request, HEAD);
  if (denied) return denied;
  const userId = new URL(request.url).searchParams.get('id');
  if (!userId) return NextResponse.json({ message: 'A user ID is required.' }, { status: 400 });
  // Permanent delete only for archived accounts — removes the Auth user too
  // (profiles row cascades from auth.users).
  const { data: profile } = await auth.admin.from('profiles').select('archived_at').eq('id', userId).maybeSingle();
  if (!profile?.archived_at) {
    return NextResponse.json({ message: 'Archived user not found.' }, { status: 404 });
  }
  const { error } = await auth.admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ message: 'Unable to delete this user.' }, { status: 500 });
  return withRefresh(NextResponse.json({ success: true }), auth);
}
