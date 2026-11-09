// @mine — rewritten: delegates to Supabase Auth email reset (was custom Gmail
// SMTP + home-grown tokens). Supabase sends the recovery email; the link lands
// on /reset-password. Always answers generically (no user enumeration).
import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown };
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!normalizedEmail) return NextResponse.json({ message: 'Registered email is required.' }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const anon = createAnonClient();
  const { error } = await anon.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) {
    console.error('Supabase password reset request failed.', error);
  }
  return NextResponse.json({ message: 'If that email is registered, a password reset link was sent to it.' });
}
