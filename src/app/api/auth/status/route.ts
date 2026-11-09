// @mine — rewritten for Supabase (was SQLite users table). User administration
// is restricted to Head Engineer server-side (previously it was unauthenticated).
// Accounts now live in Supabase Auth + public.profiles.
import { NextResponse } from 'next/server';
import { requireRole, withRefresh } from '@/lib/api';
import { ROLE_TO_DB, addActivityLog, listArchivedUsers, listUsers, mapProfile } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEAD = ['head_engineer'];

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
  const { name, email, username, password, role, status } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(name ?? '').trim() || !String(email ?? '').trim() || !String(password ?? '') || !String(role ?? '').trim()) {
    return NextResponse.json({ message: 'Name, email, password, and role are required.' }, { status: 400 });
  }
  if (status !== 'Active' && status !== 'Inactive') {
    return NextResponse.json({ message: 'Invalid account status.' }, { status: 400 });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const cred = String(password ?? '');
  const cleanUsername = (String(username ?? '').trim() || cleanEmail.split('@')[0]).toLowerCase();
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
    const { data: profile, error: updateError } = await auth.admin
      .from('profiles')
      .update({
        full_name: String(name).trim(),
        name: String(name).trim(),
        username: cleanUsername,
        role: ROLE_TO_DB[String(role)] ?? 'encoder',
        status: status === 'Inactive' ? 'inactive' : 'active',
      })
      .eq('id', data.user.id)
      .select('*')
      .single();
    if (updateError) throw updateError;
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'User Created', details: `Created user ${cleanUsername}` });
    return withRefresh(NextResponse.json({ user: mapProfile(profile) }, { status: 201 }), auth);
  } catch (error) {
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
      const { error, count } = await auth.admin
        .from('profiles')
        .update({
          full_name: String(payload.name).trim(),
          name: String(payload.name).trim(),
          email: String(payload.email).trim().toLowerCase(),
          username: String(payload.username).trim().toLowerCase(),
          role: ROLE_TO_DB[String(payload.role)] ?? 'encoder',
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
  const { error, count } = await auth.admin
    .from('profiles')
    .update({ archived_at: action === 'archive' ? new Date().toISOString() : null }, { count: 'exact' })
    .eq('id', userId);
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
