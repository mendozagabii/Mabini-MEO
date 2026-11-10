// @mine — rewritten for Supabase (was SQLite). App "road" records are
// projects joined to roads; see src/lib/supabase-data.ts for the mapping.
import { NextResponse } from 'next/server';
import { requireAuth, requireRole, forbidden, unauthorized, withRefresh } from '@/lib/api';
import {
  addActivityLog, archiveRoad, listArchivedRoads, listRoads,
  permanentlyDeleteRoad, restoreRoad, saveAnnualValidation, saveRoad, type StoredRecord,
} from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const [data, archived] = await Promise.all([listRoads(auth.db, auth.admin), listArchivedRoads(auth.db)]);
    return withRefresh(NextResponse.json({ data, archived }), auth);
  } catch (error) {
    console.error('Failed to list roads/projects.', error);
    return NextResponse.json({ message: 'Unable to load projects.' }, { status: 500 });
  }
}

// @mine — turn known saveRoad validation errors into 400s with the real reason, so an
// encoder missing a barangay sees "A barangay is required" instead of a role warning.
function saveFailure(error: unknown, fallback: string): { message: string; status: number } {
  if (error instanceof Error && /database update is required to save project locations/i.test(error.message)) {
    return { message: error.message, status: 503 };
  }
  if (error instanceof Error && /(is required for a road project|could not save the barangay|could not save the project category|could not (save|update) the contractor|invalid project attachment|attachment (upload|type|has|content)|please upload the project attachment|attachments must)/i.test(error.message)) {
    return { message: error.message, status: 400 };
  }
  return { message: fallback, status: 500 };
}

export async function POST(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['encoder']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ message: 'A road record is required.' }, { status: 400 });
  }
  // @mine — validation belongs to the Validator, not project creation.
  if (['validationResult', 'validationRemarks', 'annualValidationYear'].some((key) => key in payload)) return forbidden();
  try {
    const saved = await saveRoad(auth.db, { ...payload, id: '' }, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Created', details: `Created project ${String(saved.projectName || saved.name || saved.id)}` });
    return withRefresh(NextResponse.json({ success: true, data: saved }), auth);
  } catch (error) {
    console.error('Failed to create project.', error);
    const failure = saveFailure(error, 'Unable to create this project. Your role may not permit it.');
    return NextResponse.json({ message: failure.message }, { status: failure.status });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  // @mine — validators may submit validation only; encoders edit project details.
  if (!['encoder', 'validator'].includes(auth.profile.roleDb)) return forbidden();
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (auth.profile.roleDb === 'validator' && payload &&
      (payload.validationResult === undefined || Object.keys(payload).some((key) => !['id', 'validationResult', 'validationRemarks', 'annualValidationYear'].includes(key)))) {
    return forbidden();
  }
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ message: 'A road ID is required.' }, { status: 400 });
  }
  if (auth.profile.roleDb === 'encoder' && ['validationResult', 'validationRemarks', 'annualValidationYear'].some((key) => key in payload)) return forbidden();
  try {
    const roads = await listRoads(auth.db, auth.admin);
    const current = roads.find((road) => road.id === payload.id);
    if (!current) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });

    // Validation submissions (annual and non-annual) keep the original gate: remarks required.
    if (payload.validationResult !== undefined) {
      if (
        !['Validated', 'Return for Revision'].includes(String(payload.validationResult)) ||
        typeof payload.validationRemarks !== 'string' ||
        !payload.validationRemarks.trim()
      ) {
        return NextResponse.json({ message: 'A valid validation result and remarks are required.' }, { status: 400 });
      }
    }

    // @mine — annual validation entries are now stored in
    // public.annual_validation_entries (Phase 2.1); the project itself is untouched.
    if (payload.annualValidationYear !== undefined) {
      const year = Number(payload.annualValidationYear);
      if (!Number.isInteger(year)) {
        return NextResponse.json({ message: 'A valid annual validation year is required.' }, { status: 400 });
      }
      await saveAnnualValidation(auth.db, payload.id, year, String(payload.validationResult), String(payload.validationRemarks), auth.userId);
      await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Annual Validation Saved', details: `Saved ${year} annual validation for project ${String(current.projectName || current.name || payload.id)}` });
      const [updated] = (await listRoads(auth.db, auth.admin)).filter((road) => road.id === payload.id);
      return withRefresh(NextResponse.json({ success: true, data: updated ?? current }), auth);
    }

    const saved = await saveRoad(auth.db, { ...current, ...payload, id: current.id }, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Updated', details: `Updated project ${String(saved.projectName || saved.name || saved.id)}` });
    return withRefresh(NextResponse.json({ success: true, data: saved }), auth);
  } catch (error) {
    console.error('Failed to update project.', error);
    const failure = saveFailure(error, 'Unable to update this project. Your role may not permit it.');
    return NextResponse.json({ message: failure.message }, { status: failure.status });
  }
}

export async function DELETE(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer', 'encoder']);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'A road ID is required.' }, { status: 400 });
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  // @mine — staff may archive, but permanent deletion remains a Head Engineer action.
  if (permanent && auth.profile.roleDb !== 'head_engineer') return forbidden();
  try {
    const changed = permanent ? await permanentlyDeleteRoad(auth.db, id) : await archiveRoad(auth.db, id);
    if (!changed) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: permanent ? 'Project Permanently Deleted' : 'Project Archived', details: `${permanent ? 'Permanently deleted' : 'Archived'} project ${id}` });
    return withRefresh(NextResponse.json({ success: true }), auth);
  } catch (error) {
    console.error('Failed to delete project.', error);
    return NextResponse.json({ message: 'Unable to delete this project. Your role may not permit it.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
  const { id, action } = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (typeof id !== 'string' || (action !== 'restore' && action !== 'archive')) {
    return NextResponse.json({ message: 'A valid road ID and action are required.' }, { status: 400 });
  }
  try {
    const changed = action === 'restore' ? await restoreRoad(auth.db, id) : await archiveRoad(auth.db, id);
    if (!changed) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: action === 'restore' ? 'Project Restored' : 'Project Archived', details: `${action === 'restore' ? 'Restored' : 'Archived'} project ${id}` });
    return withRefresh(NextResponse.json({ success: true }), auth);
  } catch (error) {
    console.error('Failed to change project archive state.', error);
    return NextResponse.json({ message: 'Unable to change this project.' }, { status: 500 });
  }
}
