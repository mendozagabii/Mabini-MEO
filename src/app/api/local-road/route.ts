// @mine — rewritten for Supabase (was SQLite). App "road" records are
// projects joined to roads; see src/lib/supabase-data.ts for the mapping.
import { NextResponse } from 'next/server';
import { hasFourDigitYear, projectLocationsError } from '@/lib/project-form-validation';
import { isValidationLocked, validationTask, type ValidationProject } from '@/lib/project-validation-workflow';
import { requireAuth, requireRole, forbidden, unauthorized, withRefresh } from '@/lib/api';
// @mine — step 6: the six workflow emails. Never throws; off until the mailbox is set.
import { actionNote, notifyWorkflow } from '@/lib/notifications';
import {
  addActivityLog, archiveRoad, listArchivedRoads, listRoads,
  permanentlyDeleteRoad, restoreRoad, saveAnnualValidation, requeueReturnedValidation, saveRoad, type StoredRecord,
} from '@/lib/supabase-data';

/** @mine — the project details compared when an encoder returns a revision (WORKFLOW-DECISIONS Q5). */
const COMPARED_DETAIL_FIELDS = [
  'projectName', 'roadName', 'roadNetworkId', 'location', 'barangay', 'projectCategory', 'contractor',
  'contractedAmount', 'contractorName', 'contractorAddress', 'contactInformation', 'projectDescription', 'components', 'description', 'dateStarted',
  'targetCompletionDate', 'actualCompletionDate', 'turnoverDate', 'noOfExtensions',
  'sourceOfFunds', 'appropriation',
];

/**
 * @mine — a returned project only goes back to the validator when something changed
 * (WORKFLOW-DECISIONS Q5). Compares the fields the encoder actually submitted, so a
 * partial payload is judged on what it carries, plus the attachment set by identity.
 */
function projectDetailsChanged(payload: StoredRecord, current: StoredRecord): boolean {
  const text = (value: unknown) => String(value ?? '').trim();
  for (const key of COMPARED_DETAIL_FIELDS) {
    if (!(key in payload)) continue;
    if (key === 'roadName' && Array.isArray(payload.locations)) {
      const locationName = (Array.isArray(current.locations) && current.locations.length ? current.locations : [current.location])
        .map(text).filter(Boolean).join('\n');
      if (text(payload.roadName) === text(current.roadName || current.name) || text(payload.roadName) === locationName) continue;
    }
    const previous = key === 'dateStarted' ? (current.dateStarted || current.dateBuilt)
      : key === 'roadName' ? (current.roadName || current.name)
      : key === 'projectDescription' ? (current.projectDescription || current.description)
      : key === 'projectCategory' ? (current.projectCategory || current.type)
      : key === 'projectName' ? (current.projectName || current.name) : current[key];
    const normalize = (value: unknown) => ['appropriation', 'contractedAmount'].includes(key)
      ? String(Number(text(value).replace(/,/g, '') || '0')) : text(value);
    if (normalize(payload[key]) !== normalize(previous)) return true;
  }
  if (Array.isArray(payload.locations)) {
    const normalizeLocations = (value: unknown) => (Array.isArray(value) ? value : [])
      .map(text).filter(Boolean).join('\n');
    if (normalizeLocations(payload.locations) !== normalizeLocations(
      Array.isArray(current.locations) && current.locations.length ? current.locations : [current.location],
    )) return true;
  }
  const attachmentKey = (value: unknown) => (Array.isArray(value) ? value : [])
    .map((item) => text((item as StoredRecord)?.id || (item as StoredRecord)?.name || (item as StoredRecord)?.fileName))
    .filter(Boolean).sort().join('|');
  return Array.isArray(payload.attachments) && attachmentKey(payload.attachments) !== attachmentKey(current.attachments);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  try {
    const [data, archived] = await Promise.all([listRoads(auth.db, auth.admin), listArchivedRoads(auth.db)]);
    if (auth.profile.roleDb === 'inspector') {
      return withRefresh(NextResponse.json({
        data: data.filter(road => String(road.inspectorId || '') === auth.userId),
        archived: archived.filter(road => String(road.inspectorId || '') === auth.userId),
      }, { headers: { 'Cache-Control': 'private, no-store' } }), auth);
    }
    return withRefresh(NextResponse.json({ data, archived }, { headers: { 'Cache-Control': 'private, no-store' } }), auth);
  } catch (error) {
    console.error('Failed to list roads/projects.', error);
    return NextResponse.json({ message: 'Unable to load projects.' }, { status: 500 });
  }
}

// @mine — turn known saveRoad validation errors into 400s with the real reason, so an
// encoder missing a barangay sees "A barangay is required" instead of a role warning.
function saveFailure(error: unknown, fallback: string): { message: string; status: number } {
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
  if (['dateStarted', 'dateBuilt', 'targetCompletionDate', 'actualCompletionDate', 'turnoverDate'].some(key => payload[key] && (typeof payload[key] !== 'string' || !hasFourDigitYear(payload[key] as string)))) {
    return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  }
  // @mine — task 12: at most five coverage locations, each up to 500 characters.
  const postLocationsError = projectLocationsError(payload.locations);
  if (postLocationsError) return NextResponse.json({ message: postLocationsError }, { status: 400 });
  // @mine — validation belongs to the Validator, not project creation.
  if (['validationResult', 'validationRemarks', 'annualValidationYear'].some((key) => key in payload)) return forbidden();
  try {
    const saved = await saveRoad(auth.db, { ...payload, id: '' }, auth.userId);
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Created', details: `Created project ${String(saved.projectName || saved.name || saved.id)}` });
    // Email 1 is not sent here: the officer's flow drives it from the calendar, when the
    // 30-day validation window opens (src/app/api/validation-reminders/route.ts).
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
  if (auth.profile.roleDb === 'encoder' && ['dateStarted', 'dateBuilt', 'targetCompletionDate', 'actualCompletionDate', 'turnoverDate'].some(key => payload[key] && (typeof payload[key] !== 'string' || !hasFourDigitYear(payload[key] as string)))) {
    return NextResponse.json({ message: 'Please fill out valid date.' }, { status: 400 });
  }
  if (auth.profile.roleDb === 'encoder' && ['validationResult', 'validationRemarks', 'annualValidationYear'].some((key) => key in payload)) return forbidden();
  // @mine — task 12: at most five coverage locations, each up to 500 characters.
  const patchLocationsError = projectLocationsError(payload.locations);
  if (patchLocationsError) return NextResponse.json({ message: patchLocationsError }, { status: 400 });
  try {
    const roads = await listRoads(auth.db, auth.admin);
    const current = roads.find((road) => road.id === payload.id);
    if (!current) return NextResponse.json({ message: 'Road not found.' }, { status: 404 });

    const project = current as unknown as ValidationProject;
    // @mine — multiple outstanding returned annual decisions may exist; requeue each one
    // that was visible before the edit, without overwriting newer validator work.
    const returned = (project.annualValidationEntries ?? [])
      .filter(entry => entry.result === 'Return for Revision')
      .map(entry => ({ year: entry.year, validatedAt: entry.validatedAt, remarks: entry.remarks }));

    if (auth.profile.roleDb === 'encoder') {
      const locked = isValidationLocked(project);
      if (locked) {
        return NextResponse.json({
          message: `This project is validated for ${locked.year}. It can be edited again when the next annual validation opens.`,
        }, { status: 409 });
      }
      if (returned.length && !projectDetailsChanged(payload, current)) {
        return NextResponse.json({
          message: 'Change at least one project detail before returning this project to the validator.',
        }, { status: 400 });
      }
    }

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

    if (auth.profile.roleDb === 'validator') {
      const task = validationTask(current as unknown as ValidationProject);
      const year = payload.annualValidationYear;
      if (!task || year !== task.year) {
        return NextResponse.json({ message: 'This validation is not currently due. Refresh the project list and try again.' }, { status: 409 });
      }
      const result = String(payload.validationResult);
      const remarks = String(payload.validationRemarks);
      // @mine — only anniversary entries are actionable; legacy initial decisions remain untouched.
      await saveAnnualValidation(auth.db, payload.id, task.year, result, remarks, auth.userId);
      await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Validation Saved', details: `Saved ${task.year} annual validation for project ${String(current.projectName || current.name || payload.id)}` });
      // Email 2 (Validator → Encoder) or email 4 (Validator → Head Engineer), never both.
      await notifyWorkflow(auth.admin, {
        kind: result === 'Validated' ? 'validated' : 'for-revision',
        projectName: String(current.projectName || current.name || ''),
        note: actionNote(auth.profile),
      });
      let updated: StoredRecord | undefined;
      try { updated = (await listRoads(auth.db, auth.admin)).find((road) => road.id === payload.id); }
      catch (error) { console.error('Validation saved but refresh failed.', error); }
      if (!updated) return NextResponse.json({ message: 'Validation was saved, but the project could not be reloaded. Please refresh.' }, { status: 500 });
      return withRefresh(NextResponse.json({ success: true, data: updated }), auth);
    }

    const saved = await saveRoad(auth.db, { ...current, ...payload, id: current.id }, auth.userId);
    if (returned.length && !saved.attachmentWarning) {
      let requeueFailed = false;
      for (const decision of returned) {
        try {
          if (!await requeueReturnedValidation(auth.admin, payload.id, decision.year, decision.validatedAt, decision.remarks)) {
            requeueFailed = true;
          }
        } catch (error) {
          requeueFailed = true;
          console.error('Project saved but validation could not be requeued.', error);
        }
      }
      try {
        const updated = (await listRoads(auth.db, auth.admin)).find(road => road.id === payload.id);
        if (!updated) throw new Error('Could not refresh the updated validation.');
        Object.assign(saved, updated);
      } catch (error) {
        requeueFailed = true;
        console.error('Project saved but validation refresh failed.', error);
      }
      if (requeueFailed) saved.attachmentWarning = 'The project was saved, but its validation status could not be confirmed. Please refresh and contact the validator.';
    }
    await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Project Updated', details: `Updated project ${String(saved.projectName || saved.name || saved.id)}` });
    // Email 3 — Encoder → Validator: a returned project came back with changes.
    if (returned.length && !saved.attachmentWarning) {
      await notifyWorkflow(auth.admin, {
        kind: 'information-updated',
        projectName: String(saved.projectName || saved.name || ''),
        note: actionNote(auth.profile),
      });
    }
    return withRefresh(NextResponse.json({ success: true, data: saved }), auth);
  } catch (error) {
    console.error('Failed to update project.', error);
    const failure = saveFailure(error, 'Unable to update this project. Your role may not permit it.');
    return NextResponse.json({ message: failure.message }, { status: failure.status });
  }
}

export async function DELETE(request: Request) {
  // @mine — enforce the module action on the server, not just in the UI.
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
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
