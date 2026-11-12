// @mine — assign (or clear) the single inspector of a project. Head Engineer only.
// WORKFLOW-DECISIONS Q2/Q3/Q7, item 4 of the plan. An empty inspectorId clears it.
import { NextResponse } from 'next/server';
import { requireRole, withRefresh } from '@/lib/api';
// @mine — step 6: email 5, Head Engineer → the assigned inspector.
import { notifyWorkflow } from '@/lib/notifications';
import {
  addActivityLog, findInspectorProfile, listRoads, setProjectInspector,
} from '@/lib/supabase-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // The assignment is the Head Engineer's action; nobody else may set it.
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;

  const payload = (await request.json().catch(() => null)) as { projectId?: unknown; inspectorId?: unknown } | null;
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
  const inspectorId = typeof payload?.inspectorId === 'string' ? payload.inspectorId.trim() : '';
  if (!projectId) return NextResponse.json({ message: 'A project is required.' }, { status: 400 });

  try {
    const project = (await listRoads(auth.db, auth.admin)).find((record) => record.id === projectId);
    if (!project) return NextResponse.json({ message: 'Project not found.' }, { status: 404 });

    const inspector = inspectorId ? await findInspectorProfile(auth.admin, inspectorId) : null;
    if (inspectorId && !inspector) {
      return NextResponse.json({ message: 'Select a registered inspector.' }, { status: 400 });
    }

    await setProjectInspector(auth.admin, projectId, inspector ? inspector.id : null);
    await addActivityLog(auth.admin, {
      userId: auth.userId,
      user: auth.profile.username,
      action: inspector ? 'Inspector Assigned' : 'Inspector Unassigned',
      details: `${inspector ? `Assigned ${inspector.name}` : 'Cleared the inspector'} on project ${String(project.projectName || project.name || projectId)}`,
    });

    // Email 5 — only when someone was actually assigned; clearing sends nothing.
    if (inspector) {
      await notifyWorkflow(auth.admin, {
        kind: 'inspector-assigned',
        projectName: String(project.projectName || project.name || ''),
        inspectorId: inspector.id,
      });
    }

    const updated = (await listRoads(auth.db, auth.admin)).find((record) => record.id === projectId);
    if (!updated) return NextResponse.json({ message: 'The assignment was saved, but the project could not be reloaded. Please refresh.' }, { status: 500 });
    return withRefresh(NextResponse.json({ success: true, data: updated }), auth);
  } catch (error) {
    console.error('Failed to assign the inspector.', error);
    return NextResponse.json({ message: 'Unable to assign this inspector. Your role may not permit it.' }, { status: 500 });
  }
}
