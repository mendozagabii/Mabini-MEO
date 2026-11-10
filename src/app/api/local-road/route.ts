// @mine — rewritten for Supabase (was SQLite). App "road" records are
// projects joined to roads; see src/lib/supabase-data.ts for the mapping.
import { NextResponse } from 'next/server';
import { validationTask, type ValidationProject } from '@/lib/project-validation-workflow';
import { requireAuth, requireRole, forbidden, unauthorized, withRefresh } from '@/lib/api';
import {
  addActivityLog, archiveRoad, listArchivedRoads, listRoads,
  permanentlyDeleteRoad, restoreRoad, saveAnnualValidation, saveInitialValidation, markValidationResubmitted, saveRoad, type StoredRecord,
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

    if (auth.profile.roleDb === 'validator') {
      const task = validationTask(current as unknown as ValidationProject);
      const year = payload.annualValidationYear;
      if (!task || (task.year === undefined ? year !== undefined : year !== task.year)) {
        return NextResponse.json({ message: 'This validation is not currently due. Refresh the project list and try again.' }, { status: 409 });
      }
      const result = String(payload.validationResult);
      const remarks = String(payload.validationRemarks);
      const project = current as unknown as ValidationProject;
      if (task.year !== undefined) {
        const entry = project.annualValidationEntries?.find(item => item.year === task.year);
        await saveAnnualValidation(auth.db, payload.id, task.year, result, remarks, auth.userId, !!entry?.revisionWorkflowAvailable);
      } else {
        // Scoped service-role update: only these two validation columns, after role and eligibility checks.
        await saveInitialValidation(auth.admin, payload.id, result, remarks, auth.userId, !!project.revisionWorkflowAvailable);
      }
      await addActivityLog(auth.admin, { userId: auth.userId, user: auth.profile.username, action: 'Validation Saved', details: `Saved ${task.year ? `${task.year} annual` : 'initial'} validation for project ${String(current.projectName || current.name || payload.id)}` });
      let updated: StoredRecord | undefined;
      try { updated = (await listRoads(auth.db, auth.admin)).find((road) => road.id === payload.id); }
      catch (error) { console.error('Validation saved but refresh failed.', error); }
      if (!updated) return NextResponse.json({ message: 'Validation was saved, but the project could not be reloaded. Please refresh.' }, { status: 500 });
      return withRefresh(NextResponse.json({ success: true, data: updated }), auth);
    }

    const project = current as unknown as ValidationProject;
    const task = validationTask(project);
    const returned = task?.result === 'Return for Revision' && !task.resubmittedAt;
    const annual = task?.year === undefined ? undefined : project.annualValidationEntries?.find(entry => entry.year === task.year);
    if (returned && !(task?.year === undefined ? project.revisionWorkflowAvailable : annual?.revisionWorkflowAvailable)) {
      return NextResponse.json({ message: 'This returned project cannot be updated until the revision workflow database migration is applied.' }, { status: 503 });
    }
    const saved = await saveRoad(auth.db, { ...current, ...payload, id: current.id }, auth.userId);
    if (returned && !saved.attachmentWarning) {
      try {
        const marked = await markValidationResubmitted(auth.admin, payload.id, task?.year,
          task?.year === undefined ? project.validationValidatedAt : annual?.validatedAt, task?.remarks ?? '');
        if (!marked) throw new Error('The validation changed while the project was being updated.');
        const updated = (await listRoads(auth.db, auth.admin)).find(road => road.id === payload.id);
        if (updated) Object.assign(saved, updated);
        else throw new Error('Could not refresh the updated validation.');
      } catch (error) {
        console.error('Project saved but revision status could not be confirmed.', error);
        saved.attachmentWarning = 'The project was saved, but its revision status could not be confirmed. Please refresh and contact the validator.';
      }
    }
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
