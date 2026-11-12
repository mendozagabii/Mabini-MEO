// @mine — rewritten for Supabase (was SQLite). See src/lib/supabase-data.ts.
import { NextResponse } from 'next/server';
import { eligibleMaintenanceInspections } from '@/lib/inspection-selection';
import { hasFourDigitYear } from '@/lib/project-form-validation';
import { requireAuth, requireRole, forbidden, unauthorized, withRefresh } from '@/lib/api';
import {
  addActivityLog, archiveMaintenance, listArchivedMaintenance, listMaintenance, listRoads, listInspections, listArchivedInspections,
  permanentlyDeleteMaintenance, restoreMaintenance, saveMaintenance, type StoredRecord,
} from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const [data, archived, archivedInspections] = await Promise.all([listMaintenance(auth.db), listArchivedMaintenance(auth.db), listArchivedInspections(auth.db)]);
    const scheduledInspectionIds = [...data, ...archived].map(record => record.inspectionId).filter(Boolean);
    return withRefresh(NextResponse.json({ data, archived, scheduledInspectionIds, scheduledArchivedInspections: archivedInspections.filter(item => scheduledInspectionIds.includes(item.id)) }), auth);
  } catch (error) {
    console.error('Failed to list maintenance records.', error);
    return NextResponse.json({ message: 'Unable to load maintenance records.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['encoder']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.localRoadId !== 'string' || !payload.localRoadId) {
    return NextResponse.json({ message: 'A valid road ID is required.' }, { status: 400 });
  }
  if (typeof payload.remarks !== 'string' || !payload.remarks.trim()) return NextResponse.json({ message: 'Please fill out this field.' }, { status: 400 });
  if (typeof payload.scheduledDate !== 'string' || !hasFourDigitYear(payload.scheduledDate)) return NextResponse.json({ message: 'Enter a valid completion date from 2000 onward.' }, { status: 400 });
  if (typeof payload.inspectionId !== 'string' || !payload.inspectionId) return NextResponse.json({ message: 'Select a project with an eligible inspection.' }, { status: 400 });
  try {
    const [inspections, active, archived, archivedInspections] = await Promise.all([listInspections(auth.db), listMaintenance(auth.db), listArchivedMaintenance(auth.db), listArchivedInspections(auth.db)]);
    const scheduledIds = [...active, ...archived].map(item => item.inspectionId).filter((id): id is string => typeof id === 'string');
    const eligible = eligibleMaintenanceInspections(inspections as any[], scheduledIds, archivedInspections as any[]).find(item => item.localRoadId === payload.localRoadId);
    if (!eligible || eligible.id !== payload.inspectionId) {
      return NextResponse.json({ message: 'This inspection is no longer available for scheduling. Refresh and try again.' }, { status: 409 });
    }
  } catch (error) { console.error('Failed to check inspection eligibility.', error); return NextResponse.json({ message: 'Unable to check inspection eligibility.' }, { status: 500 }); }
  const road = (await listRoads(auth.db)).find((item) => item.id === payload.localRoadId);
  if (!road) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
  try {
    const record = await saveMaintenance(auth.db, { ...payload, id: '' }, road.id, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Maintenance Created', details: `Created maintenance record ${record.id}` });
    return withRefresh(NextResponse.json({ success: true, data: record }), auth);
  } catch (error) {
    console.error('Failed to create maintenance record.', error);
    return NextResponse.json({ message: 'Unable to create this maintenance record. Your role may not permit it.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['encoder']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ message: 'A valid maintenance record ID is required.' }, { status: 400 });
  }
  const record = (await listMaintenance(auth.db)).find((item) => item.id === payload.id);
  if (!record) return NextResponse.json({ message: 'Maintenance record not found.' }, { status: 404 });

  const isStatusOnlyUpdate =
    payload.status !== undefined && payload.localRoadId === undefined && payload.type === undefined &&
    payload.scheduledDate === undefined && payload.description === undefined && payload.cost === undefined;
  try {
    if (isStatusOnlyUpdate) {
      if (!['Scheduled', 'In Progress', 'Completed', 'Deferred'].includes(String(payload.status))) {
        return NextResponse.json({ message: 'A valid maintenance status is required.' }, { status: 400 });
      }
      if (payload.completedDate != null && payload.completedDate !== '' && (typeof payload.completedDate !== 'string' || !hasFourDigitYear(payload.completedDate))) return NextResponse.json({ message: 'Enter a valid completion date from 2000 onward.' }, { status: 400 });
      if (record.status === 'Completed' && payload.status === 'Deferred') return NextResponse.json({ message: 'Completed maintenance cannot be deferred.' }, { status: 409 });
      const updated = await saveMaintenance(auth.db, {
        ...record, status: payload.status,
        ...(payload.completedDate !== undefined ? { completedDate: payload.completedDate } : {}),
      }, String(record.localRoadId), auth.userId);
      await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Maintenance Updated', details: `Updated maintenance record ${updated.id}` });
      return withRefresh(NextResponse.json({ success: true, data: updated }), auth);
    }

    if (typeof payload.remarks !== 'string' || !payload.remarks.trim()) return NextResponse.json({ message: 'Please fill out this field.' }, { status: 400 });
    if (typeof payload.localRoadId !== 'string' || typeof payload.type !== 'string' || typeof payload.scheduledDate !== 'string' || typeof payload.description !== 'string' || !Number.isFinite(Number(payload.cost))) {
      return NextResponse.json({ message: 'Valid maintenance details are required.' }, { status: 400 });
    }
    if (!hasFourDigitYear(payload.scheduledDate)) return NextResponse.json({ message: 'Enter a valid completion date from 2000 onward.' }, { status: 400 });
    if (payload.localRoadId !== record.localRoadId) return NextResponse.json({ message: 'The project of an existing maintenance record cannot be changed.' }, { status: 400 });
    const road = (await listRoads(auth.db)).find((item) => item.id === payload.localRoadId);
    if (!road) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
    const updated = await saveMaintenance(auth.db, {
      ...record,
      localRoadId: road.id,
      type: payload.type,
      scheduledDate: payload.scheduledDate,
      status: record.status === 'Deferred' && payload.scheduledDate !== record.scheduledDate ? 'Scheduled' : record.status,
      cost: Number(payload.cost),
      description: payload.description,
      ...(payload.remarks !== undefined ? { remarks: payload.remarks } : {}),
    }, road.id, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Maintenance Updated', details: `Updated maintenance record ${updated.id}` });
    return withRefresh(NextResponse.json({ success: true, data: updated }), auth);
  } catch (error) {
    console.error('Failed to update maintenance record.', error);
    return NextResponse.json({ message: 'Unable to update this maintenance record. Your role may not permit it.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer', 'encoder']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ message: 'A valid maintenance record ID is required.' }, { status: 400 });
  }
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  // @mine — staff may archive, but permanent deletion remains a Head Engineer action.
  if (permanent && auth.profile.roleDb !== 'head_engineer') return forbidden();
  try {
    const changed = permanent ? await permanentlyDeleteMaintenance(auth.db, payload.id) : await archiveMaintenance(auth.db, payload.id);
    if (!changed) return NextResponse.json({ message: 'Maintenance record not found.' }, { status: 404 });
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: permanent ? 'Maintenance Permanently Deleted' : 'Maintenance Archived', details: `${permanent ? 'Permanently deleted' : 'Archived'} maintenance record ${payload.id}` });
    return withRefresh(NextResponse.json({ success: true }), auth);
  } catch (error) {
    console.error('Failed to delete maintenance record.', error);
    return NextResponse.json({ message: 'Unable to delete this maintenance record.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
  const { id, action } = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (typeof id !== 'string' || (action !== 'restore' && action !== 'archive')) {
    return NextResponse.json({ message: 'A valid maintenance ID and action are required.' }, { status: 400 });
  }
  try {
    const changed = action === 'restore' ? await restoreMaintenance(auth.db, id) : await archiveMaintenance(auth.db, id);
    if (!changed) return NextResponse.json({ message: 'Maintenance record not found.' }, { status: 404 });
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: action === 'restore' ? 'Maintenance Restored' : 'Maintenance Archived', details: `${action === 'restore' ? 'Restored' : 'Archived'} maintenance record ${id}` });
    return withRefresh(NextResponse.json({ success: true }), auth);
  } catch (error) {
    console.error('Failed to change maintenance archive state.', error);
    return NextResponse.json({ message: 'Unable to change this maintenance record.' }, { status: 500 });
  }
}
