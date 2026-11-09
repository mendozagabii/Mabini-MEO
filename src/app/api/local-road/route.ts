// @mine — rewritten for Supabase (was SQLite). App "road" records are
// projects joined to roads; see src/lib/supabase-data.ts for the mapping.
import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, withRefresh } from '@/lib/api';
import {
  addActivityLog, archiveRoad, listArchivedRoads, listRoads,
  permanentlyDeleteRoad, restoreRoad, saveRoad, type StoredRecord,
} from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const [data, archived] = await Promise.all([listRoads(auth.db), listArchivedRoads(auth.db)]);
    return withRefresh(NextResponse.json({ data, archived }), auth);
  } catch (error) {
    console.error('Failed to list roads/projects.', error);
    return NextResponse.json({ message: 'Unable to load projects.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ message: 'A road record is required.' }, { status: 400 });
  }
  try {
    const saved = await saveRoad(auth.db, { ...payload, id: '' }, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Created', details: `Created project ${String(saved.projectName || saved.name || saved.id)}` });
    return withRefresh(NextResponse.json({ success: true, data: saved }), auth);
  } catch (error) {
    console.error('Failed to create project.', error);
    return NextResponse.json({ message: 'Unable to create this project. Your role may not permit it.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ message: 'A road ID is required.' }, { status: 400 });
  }
  try {
    const roads = await listRoads(auth.db);
    const current = roads.find((road) => road.id === payload.id);
    if (!current) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });

    // Validation submissions (non-annual) keep the original gate: remarks required.
    if (payload.validationResult !== undefined && payload.annualValidationYear === undefined) {
      if (
        !['Validated', 'Return for Revision'].includes(String(payload.validationResult)) ||
        typeof payload.validationRemarks !== 'string' ||
        !payload.validationRemarks.trim()
      ) {
        return NextResponse.json({ message: 'A valid validation result and remarks are required.' }, { status: 400 });
      }
      // Annual-validation entries are not stored in Supabase (see migration doc);
      // a validated project records the result on projects.validation_status.
    }
    if (payload.annualValidationYear !== undefined) {
      return NextResponse.json(
        { message: 'Annual validation entries are not available in the Supabase schema yet.' },
        { status: 400 },
      );
    }

    const saved = await saveRoad(auth.db, { ...current, ...payload, id: current.id }, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Updated', details: `Updated project ${String(saved.projectName || saved.name || saved.id)}` });
    return withRefresh(NextResponse.json({ success: true, data: saved }), auth);
  } catch (error) {
    console.error('Failed to update project.', error);
    return NextResponse.json({ message: 'Unable to update this project. Your role may not permit it.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'A road ID is required.' }, { status: 400 });
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
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
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
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
