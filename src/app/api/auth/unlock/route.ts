// @mine — rewritten for Supabase. Previously, non-admin accounts could be
// unlocked by ANYONE with no code (audit finding #5). Now every unlock needs
// either (a) a signed-in Head Engineer session, or (b) a valid master code
// verified by the DB (verify_master_code; code is bcrypt-hashed in
// system_settings). If no master code has been set yet, only (a) works.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireAuth, withRefresh } from '@/lib/api';
import { addActivityLog } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { username, masterCode } = (await request.json().catch(() => ({}))) as { username?: unknown; masterCode?: unknown };
  const identifier = String(username ?? '').trim();
  if (!identifier) return NextResponse.json({ message: 'Username is required.' }, { status: 400 });
  const key = identifier.toLowerCase();
  const admin = createAdminClient();

  const auth = await requireAuth(request);
  const byAdmin = auth?.profile.roleDb === 'head_engineer';
  let byMasterCode = false;
  const provided = String(masterCode ?? '').trim();
  if (provided) {
    const { data } = await admin.rpc('verify_master_code', { p_code: provided });
    byMasterCode = data === true;
  }
  if (!byAdmin && !byMasterCode) {
    return NextResponse.json(
      { message: 'Invalid master unlock code.', requiresMaster: true },
      { status: 401 },
    );
  }

  const { data: lockedRows } = await admin.rpc('is_login_locked', { p_identifier: key });
  const wasLocked = Boolean((Array.isArray(lockedRows) ? lockedRows[0] : lockedRows)?.locked);
  await admin.rpc('unlock_account', { p_identifier: key });
  if (auth) {
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Account Unlock', details: `Unlocked account ${key}` });
  }
  const response = NextResponse.json({
    success: true,
    unlocked: true,
    wasLocked,
    message: wasLocked ? 'Account unlocked.' : 'Account is not currently locked.',
  });
  return auth ? withRefresh(response, auth) : response;
}

export async function PATCH(request: Request) {
  // Change the master code: Head Engineer session required (previously anyone
  // who knew the old code — which defaulted to master123 — could change it).
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: 'You must be signed in.' }, { status: 401 });
  if (auth.profile.roleDb !== 'head_engineer') {
    return NextResponse.json({ message: 'Only the Head Engineer can change the master code.' }, { status: 403 });
  }
  const { currentPassword, newPassword } = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };
  const currentValue = String(currentPassword ?? '').trim();
  const nextValue = String(newPassword ?? '').trim();
  if (!nextValue) return NextResponse.json({ message: 'A new master code is required.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from('system_settings').select('key').eq('key', 'master_unlock_code_hash').maybeSingle();
  if (existing) {
    const { data: ok } = await admin.rpc('verify_master_code', { p_code: currentValue });
    if (ok !== true) return NextResponse.json({ message: 'Current master password is incorrect.' }, { status: 401 });
  }
  // set_master_code uses auth.uid() for updated_by; call it with the user client.
  const { error } = await auth.db.rpc('set_master_code', { p_new: nextValue, p_current: currentValue || null });
  if (error) {
    return NextResponse.json({ message: error.message || 'Unable to save the new master code.' }, { status: 400 });
  }
  return withRefresh(NextResponse.json({ success: true, message: 'Master password updated successfully.' }), auth);
}
