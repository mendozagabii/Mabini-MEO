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

const MASTER_KEY = 'master_unlock_code_hash';
const MIN_LENGTH = 8;
const HEAD = 'head_engineer';

/**
 * @mine — Is a master code configured? (Head Engineer only.)
 * Lets the UI say "set one" instead of "change it", and lets the owner check the
 * state of this feature without touching the database.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: 'You must be signed in.' }, { status: 401 });
  if (auth.profile.roleDb !== HEAD) {
    return NextResponse.json({ message: 'Only the Head Engineer can view the master code status.' }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('system_settings')
    .select('key, updated_at, updated_by')
    .eq('key', MASTER_KEY)
    .maybeSingle();
  return withRefresh(
    NextResponse.json({
      hasMasterCode: Boolean(data),
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
      minLength: MIN_LENGTH,
    }),
    auth,
  );
}

export async function POST(request: Request) {
  const { username, masterCode } = (await request.json().catch(() => ({}))) as { username?: unknown; masterCode?: unknown };
  const identifier = String(username ?? '').trim();
  if (!identifier) return NextResponse.json({ message: 'Username is required.' }, { status: 400 });
  const key = identifier.toLowerCase();
  const admin = createAdminClient();

  const auth = await requireAuth(request);
  const byAdmin = auth?.profile.roleDb === HEAD;
  let byMasterCode = false;
  const provided = String(masterCode ?? '').trim();
  if (provided) {
    // @mine — distinguish "wrong code" from "no code configured yet", which used to
    // look identical (both a bare 401) and left the login screen with no way forward.
    const { data: configured } = await admin.from('system_settings').select('key').eq('key', MASTER_KEY).maybeSingle();
    if (!configured) {
      return NextResponse.json(
        {
          message:
            'No master code has been set for this system yet. Ask the Head Engineer to set one in System Management → Master Security Key.',
          requiresMaster: true,
          masterCodeConfigured: false,
        },
        { status: 409 },
      );
    }
    const { data } = await admin.rpc('verify_master_code', { p_code: provided });
    byMasterCode = data === true;
  }
  if (!byAdmin && !byMasterCode) {
    return NextResponse.json(
      { message: 'Invalid master unlock code.', requiresMaster: true, masterCodeConfigured: true },
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
  // Change (or set, the first time) the master code: Head Engineer session required.
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: 'You must be signed in.' }, { status: 401 });
  if (auth.profile.roleDb !== HEAD) {
    return NextResponse.json({ message: 'Only the Head Engineer can change the master code.' }, { status: 403 });
  }

  const { currentPassword, newPassword } = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };
  const currentValue = String(currentPassword ?? '').trim();
  const nextValue = String(newPassword ?? '').trim();
  if (!nextValue) return NextResponse.json({ message: 'A new master code is required.' }, { status: 400 });
  if (nextValue.length < MIN_LENGTH) {
    return NextResponse.json({ message: `The master code must be at least ${MIN_LENGTH} characters long.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from('system_settings').select('key').eq('key', MASTER_KEY).maybeSingle();
  const firstTime = !existing;

  if (!firstTime) {
    const { data: ok } = await admin.rpc('verify_master_code', { p_code: currentValue });
    if (ok !== true) return NextResponse.json({ message: 'Current master password is incorrect.' }, { status: 401 });
  }

  // @mine — call with the SERVICE ROLE, not the user client: EXECUTE on this RPC is
  // revoked from `authenticated` (that revoke is what broke this endpoint), and this
  // route already gates on head_engineer above. The actor is passed explicitly so
  // system_settings.updated_by is still accurate.
  const { error } = await admin.rpc('set_master_code', {
    p_new: nextValue,
    p_current: firstTime ? null : currentValue,
    p_updated_by: auth.userId,
  });
  if (error) {
    return NextResponse.json({ message: error.message || 'Unable to save the new master code.' }, { status: 400 });
  }

  await addActivityLog(auth.admin, {
    userId: auth.userId,
    user: auth.profile.username,
    action: firstTime ? 'Master Code Set' : 'Master Code Changed',
    details: firstTime ? 'Initial master unlock code configured' : 'Master unlock code changed',
  });

  return withRefresh(
    NextResponse.json({
      success: true,
      firstTime,
      message: firstTime
        ? 'Master code set. You can now unlock a locked account from the login screen.'
        : 'Master password updated successfully.',
    }),
    auth,
  );
}
