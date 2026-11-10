// @mine — added the session check (was unauthenticated); AI logic unchanged.
// @mine (Phase 2.3) — generated runs are now also persisted to
// ai_analysis_runs / ai_priority_results, and GET returns the latest saved run.
import { NextResponse } from 'next/server';
import { AIServiceError, prioritizeMaintenance } from '@/lib/ai';
import { requireAuth, unauthorized, withRefresh } from '@/lib/api';
import { getLatestAiPredictions, saveAiRun } from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const data = await getLatestAiPredictions(auth.admin);
    return withRefresh(NextResponse.json({ success: true, data }), auth);
  } catch (error) {
    console.error('Failed to load saved AI recommendations.', error);
    return NextResponse.json({ message: 'Unable to load saved AI recommendations.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A valid JSON request body is required.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: 'A road assessment request is required.' }, { status: 400 });
  }
  if (!('items' in body)) {
    return NextResponse.json({ message: 'Road assessment items are required.' }, { status: 400 });
  }

  try {
    const prioritized = await prioritizeMaintenance(body.items);
    // @mine — persist the run so recommendations survive across browsers/users.
    // Best-effort: a persistence failure must not fail the generation itself.
    try {
      const items = Array.isArray(body.items) ? body.items : [];
      const factorsByProjectId: Record<string, Record<string, unknown>> = {};
      for (const item of items as Array<Record<string, unknown>>) {
        if (item && typeof item.id === 'string') {
          factorsByProjectId[item.id] = {
            name: item.name, type: item.type, condition: item.condition,
            lastInspection: item.lastInspection, dateBuilt: item.dateBuilt,
          };
        }
      }
      await saveAiRun(auth.admin, {
        userId: auth.userId,
        model: process.env.AI_GATEWAY_MODEL || 'meta/llama-4-scout',
        predictions: prioritized,
        factorsByProjectId,
      });
    } catch (persistError) {
      console.error('Failed to persist AI recommendations.', persistError);
    }
    return NextResponse.json({ success: true, data: prioritized });
  } catch (error) {
    if (error instanceof AIServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error('Failed to generate AI maintenance recommendations.', error);
    return NextResponse.json(
      { message: 'Unable to generate recommendations right now. Please try again.' },
      { status: 500 }
    );
  }
}
