// @mine — fixed + moved to Supabase: this route was statically prerendered
// before (always returned {}), see docs/AUDIT-2026-11-09.md finding #7.
// Now reads login_attempts live. `export const dynamic` is the actual fix.
import { NextResponse } from 'next/server';
import { createAdminClient, supabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ locked: {} });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('login_attempts')
    .select('identifier, locked_until')
    .not('locked_until', 'is', null)
    .gt('locked_until', new Date().toISOString());
  if (error) return NextResponse.json({ locked: {} });
  const locked: Record<string, number> = {};
  for (const row of data ?? []) {
    locked[row.identifier] = Math.max(0, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000));
  }
  return NextResponse.json({ locked });
}
