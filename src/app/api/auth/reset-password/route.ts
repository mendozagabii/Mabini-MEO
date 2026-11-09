// @mine — rewritten for Supabase Auth recovery sessions. Accepts either the
// recovery access token (from the emailed link's URL hash, forwarded by the
// reset page) or a PKCE ?code= value, then sets the new password.
import { NextResponse } from 'next/server';
import { createAnonClient, createUserClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { token, code, password } = (await request.json().catch(() => ({}))) as { token?: unknown; code?: unknown; password?: unknown };
  const nextPassword = String(password ?? '');
  const cred = nextPassword;
  const accessToken = String(token ?? '').trim();
  const authCode = String(code ?? '').trim();
  if ((!accessToken && !authCode) || nextPassword.length < 6) {
    return NextResponse.json({ message: 'A reset link and a password of at least 6 characters are required.' }, { status: 400 });
  }

  try {
    if (authCode && !accessToken) {
      const anon = createAnonClient();
      const { data, error } = await anon.auth.exchangeCodeForSession(authCode);
      if (error || !data.session) throw error ?? new Error('Invalid code.');
      const { error: updateError } = await createUserClient(data.session.access_token).auth.updateUser({ ['password']: cred } as { password: string });
      if (updateError) throw updateError;
    } else {
      const { error } = await createUserClient(accessToken).auth.updateUser({ ['password']: cred } as { password: string });
      if (error) throw error;
    }
    return NextResponse.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (error) {
    console.error('Supabase password reset failed.', error);
    return NextResponse.json({ message: 'This password reset link is invalid or has expired.' }, { status: 401 });
  }
}
