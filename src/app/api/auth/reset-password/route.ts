// @mine — rewritten for Supabase Auth recovery sessions. Accepts either the
// recovery access token (from the emailed link's URL hash, forwarded by the
// reset page) or a PKCE ?code= value, then sets the new password.
import { NextResponse } from 'next/server';
import { createAdminClient, createAnonClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INVALID_LINK =
  'This password reset link is invalid, already used, or has expired. Request a new one from the login screen.';

export async function POST(request: Request) {
  const { token, code, password } = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    code?: unknown;
    password?: unknown;
  };
  const nextPassword = String(password ?? '');
  const accessToken = String(token ?? '').trim();
  const authCode = String(code ?? '').trim();

  if (!accessToken && !authCode) {
    return NextResponse.json(
      { message: 'Open the reset link from your e-mail to set a password.' },
      { status: 400 },
    );
  }
  if (nextPassword.length < 8 || nextPassword.length > 64) {
    return NextResponse.json(
      { message: 'Password must be between 8 and 64 characters.' },
      { status: 400 },
    );
  }

  try {
    // @mine — the previous version passed the recovery JWT as a global header and
    // called auth.updateUser(). gotrue-js resolves that call through _useSession()
    // and throws AuthSessionMissingError when no session is stored, so EVERY link
    // answered "invalid or expired" however fresh it was. Resolve the token to a
    // user (getUser accepts an explicit JWT) and set the password as the admin.
    if (accessToken) {
      const anon = createAnonClient();
      const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
      if (userError || !userData?.user) {
        return NextResponse.json({ message: INVALID_LINK }, { status: 401 });
      }
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(userData.user.id, {
        password: nextPassword,
      });
      if (error) throw error;
      return NextResponse.json({
        message: 'Password updated successfully. You can now sign in with the new password.',
      });
    }

    // PKCE links carry ?code= and need the verifier stored by whoever started the
    // flow; the request is made server-side, so this path only succeeds when that
    // verifier still exists.
    const anon = createAnonClient();
    const { data, error } = await anon.auth.exchangeCodeForSession(authCode);
    if (error || !data?.session) {
      return NextResponse.json({ message: INVALID_LINK }, { status: 401 });
    }
    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(data.session.user.id, {
      password: nextPassword,
    });
    if (updateError) throw updateError;
    return NextResponse.json({
      message: 'Password updated successfully. You can now sign in with the new password.',
    });
  } catch (error) {
    console.error('Supabase password reset failed.', error);
    return NextResponse.json(
      { message: 'Unable to update the password right now. Please try again or request a new link.' },
      { status: 500 },
    );
  }
}
