// @mine — the registered inspectors a Head Engineer can assign (WORKFLOW-DECISIONS
// Q2/Q3, item 4 of the plan). Read-only list; the assignment itself is a POST.
import { NextResponse } from 'next/server';
import { requireAuth, forbidden, unauthorized, withRefresh } from '@/lib/api';
import { listInspectorOptions } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  if (auth.profile.roleDb !== 'head_engineer') return forbidden();
  try {
    const data = await listInspectorOptions(auth.admin);
    return withRefresh(NextResponse.json({ data }), auth);
  } catch (error) {
    console.error('Failed to load inspectors.', error);
    return NextResponse.json({ message: 'Unable to load the inspector list.' }, { status: 500 });
  }
}
