// @mine — rewritten for Supabase (was SQLite). See src/lib/supabase-data.ts.
import { validateAssessment, findingsSummary } from '@/lib/inspection-selection';
import { hasFourDigitYear, addCalendarMonths, addCalendarDays } from '@/lib/project-form-validation';
import { NextResponse } from 'next/server';
import { requireAuth, requireRole, forbidden, unauthorized, withRefresh } from '@/lib/api';
import {
  addActivityLog, archiveInspection, listArchivedInspections, listInspections, listRoads, listMaintenance, listArchivedMaintenance,
  permanentlyDeleteInspection, restoreInspection, saveInspection, saveRoad, type StoredRecord,
} from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function refreshRoadCondition(auth: Awaited<ReturnType<typeof requireAuth>>, roadId: string) {
  if (!auth) return null;
  const road = (await listRoads(auth.db)).find((item) => item.id === roadId);
  if (!road) return null;
  const latest = (await listInspections(auth.db))
    .filter((i) => i.localRoadId === roadId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  const rating = latest ? Number(latest.conditionRating) : 0;
  const condition = !latest || rating <= 0 ? 'Not rated' : rating >= 8 ? 'Good' : rating >= 5 ? 'Fair' : 'Poor';
  // @mine — deletion by a Head Engineer must not call the general project-edit
  // path. Return the derived condition for the UI; the DB's inspection trigger
  // remains responsible for its own road-condition synchronization.
  if (auth.profile.roleDb === 'head_engineer') {
    return { id: roadId, condition, lastInspection: latest?.date || '' };
  }
  // Note: the DB trigger sync_road_from_inspection also keeps roads in sync;
  // this preserves the app's exact Good/Fair/Poor wording in the response.
  const updated = await saveRoad(auth.db, { ...road, condition, lastInspection: latest?.date || '' }, auth.userId).catch(() => road);
  return { id: roadId, condition: (updated as StoredRecord).condition ?? condition, lastInspection: latest?.date || '' };
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const [data, archived] = await Promise.all([listInspections(auth.db, auth.admin), listArchivedInspections(auth.db)]);
    return withRefresh(NextResponse.json({ data, archived }), auth);
  } catch (error) {
    console.error('Failed to list inspections.', error);
    return NextResponse.json({ message: 'Unable to load inspections.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['inspector']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.localRoadId !== 'string' || !payload.localRoadId) {
    return NextResponse.json({ message: 'A valid road ID is required.' }, { status: 400 });
  }
  if (typeof payload.date !== 'string' || !hasFourDigitYear(payload.date)) {
    return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  }
  const ratings = (payload.conditionRatings || {}) as Record<string, string>;
  const remarks = (payload.conditionRemarks || {}) as Record<string, string>;
  const attachments = (payload.conditionAttachments || {}) as Record<string, unknown[]>;
  if (payload.inspectionType !== 'Monitoring and Maintenance Inspection' || !validateAssessment(ratings, remarks, attachments)) {
    return NextResponse.json({ message: 'Select an inspection type and complete every assessment, including remarks and attachments for applicable components.' }, { status: 400 });
  }
  payload.remarks = findingsSummary(ratings, remarks);
  const road = (await listRoads(auth.db)).find((item) => item.id === payload.localRoadId);
  if (!road) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
  const minimum = addCalendarMonths(String(road.actualCompletionDate || ''), 11);
  if (!minimum) return NextResponse.json({ message: 'The project completion date could not be verified.' }, { status: 400 });
  if (payload.date < minimum) return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  try {
    const inspection = await saveInspection(auth.db, { ...payload, id: '' }, road.id, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Inspection Created', details: `Created inspection ${inspection.id}` });
    await refreshRoadCondition(auth, road.id);
    return withRefresh(NextResponse.json({ success: true, data: inspection }), auth);
  } catch (error) {
    console.error('Failed to create inspection.', error);
    return NextResponse.json({ message: 'Unable to create this inspection. Your role may not permit it.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['inspector']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as StoredRecord | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.id !== 'string' || !payload.id || typeof payload.localRoadId !== 'string' || !payload.localRoadId) {
    return NextResponse.json({ message: 'A valid inspection and road ID are required.' }, { status: 400 });
  }
  if (typeof payload.date !== 'string' || !hasFourDigitYear(payload.date)) {
    return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  }
  const ratings = (payload.conditionRatings || {}) as Record<string, string>;
  const remarks = (payload.conditionRemarks || {}) as Record<string, string>;
  const attachments = (payload.conditionAttachments || {}) as Record<string, unknown[]>;
  if (payload.inspectionType !== 'Monitoring and Maintenance Inspection' || !validateAssessment(ratings, remarks, attachments)) {
    return NextResponse.json({ message: 'Select an inspection type and complete every assessment, including remarks and attachments for applicable components.' }, { status: 400 });
  }
  payload.remarks = findingsSummary(ratings, remarks);
  const existing = (await listInspections(auth.db)).find((item) => item.id === payload.id);
  if (!existing) return NextResponse.json({ message: 'Inspection not found.' }, { status: 404 });
  const road = (await listRoads(auth.db)).find((item) => item.id === payload.localRoadId);
  if (!road) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });
  const minimum = addCalendarMonths(String(road.actualCompletionDate || ''), 11);
  if (!minimum) return NextResponse.json({ message: 'The project completion date could not be verified.' }, { status: 400 });
  if (payload.date < minimum) return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  try {
    // Scheduled follow-ups have no inspector yet, and older results may belong
    // to another inspector. The role and record were checked above; use the
    // server client so the inspector can record/update these permitted entries.
    if (existing.localRoadId !== road.id) return NextResponse.json({ message: 'The project of an inspection cannot be changed.' }, { status: 400 });
    if (existing.date !== payload.date) {
      const minMaintenance = addCalendarDays(payload.date as string, 1);
      const [active, archived] = await Promise.all([listMaintenance(auth.admin), listArchivedMaintenance(auth.admin)]);
      if (!minMaintenance || [...active, ...archived].some(item => item.inspectionId === existing.id && [item.dateStarted, item.scheduledDate].some(date => typeof date === 'string' && date && date < minMaintenance))) {
        return NextResponse.json({ message: 'This inspection date conflicts with linked maintenance dates.' }, { status: 409 });
      }
    }
    const inspection = await saveInspection(auth.admin, { ...existing, ...payload, id: existing.id, annualFollowUpYear: existing.annualFollowUpYear, validationStatus: existing.validationStatus }, road.id, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Inspection Updated', details: `Updated inspection ${inspection.id}` });
    const roadUpdate = await refreshRoadCondition(auth, road.id);
    return withRefresh(NextResponse.json({ success: true, data: inspection, roadUpdates: roadUpdate ? [roadUpdate] : [] }), auth);
  } catch (error) {
    console.error('Failed to update inspection.', error);
    return NextResponse.json({ message: 'Unable to update this inspection. Your role may not permit it.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer', 'inspector']);
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'An inspection ID is required.' }, { status: 400 });
  const permanent = url.searchParams.get('permanent') === 'true';
  // @mine — reject before reading, as listing may create due annual follow-ups.
  if (permanent && auth.profile.roleDb !== 'head_engineer') return forbidden();
  const inspection = (await listInspections(auth.db)).find((item) => item.id === id);
  if (!inspection) return NextResponse.json({ message: 'Inspection not found.' }, { status: 404 });
  try {
    const changed = permanent ? await permanentlyDeleteInspection(auth.db, id) : await archiveInspection(auth.db, id);
    if (!changed) return NextResponse.json({ message: 'Inspection could not be deleted.' }, { status: 500 });
    const roadUpdate = await refreshRoadCondition(auth, String(inspection.localRoadId));
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: permanent ? 'Inspection Permanently Deleted' : 'Inspection Archived', details: `${permanent ? 'Permanently deleted' : 'Archived'} inspection ${id}` });
    return withRefresh(NextResponse.json({ success: true, roadUpdates: roadUpdate ? [roadUpdate] : [] }), auth);
  } catch (error) {
    console.error('Failed to delete inspection.', error);
    return NextResponse.json({ message: 'Unable to delete this inspection.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
  const { id, action } = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (typeof id !== 'string' || (action !== 'restore' && action !== 'archive')) {
    return NextResponse.json({ message: 'A valid inspection ID and action are required.' }, { status: 400 });
  }
  try {
    const changed = action === 'restore' ? await restoreInspection(auth.db, id) : await archiveInspection(auth.db, id);
    if (!changed) return NextResponse.json({ message: 'Inspection not found.' }, { status: 404 });
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: action === 'restore' ? 'Inspection Restored' : 'Inspection Archived', details: `${action === 'restore' ? 'Restored' : 'Archived'} inspection ${id}` });
    return withRefresh(NextResponse.json({ success: true }), auth);
  } catch (error) {
    console.error('Failed to change inspection archive state.', error);
    return NextResponse.json({ message: 'Unable to change this inspection.' }, { status: 500 });
  }
}
