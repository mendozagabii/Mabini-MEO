// @mine — new route for the Supabase session: clears the session cookies.
import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response.headers);
  return response;
}
