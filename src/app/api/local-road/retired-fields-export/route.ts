// @mine — step 9: the CSV that keeps PCAB License No., Completion Percentage and
// Actual Project Cost before those columns are dropped (WORKFLOW-DECISIONS B6).
// Head Engineer only, read-only, and it reads the columns straight from the database
// so it keeps working even though the app no longer maps them (until the drop).
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api';
import { addActivityLog } from '@/lib/supabase-data';
import { retiredFieldsCsv, retiredFieldsFileName, type RetiredFieldRow } from '@/lib/retired-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

export async function GET(request: Request) {
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
  try {
    const { data, error } = await auth.admin
      .from('projects')
      .select('id, project_name, completion_percentage, adjusted_project_cost, archived_at, contractors!projects_contractor_id_fkey(name, pcab_license_no)')
      .order('project_name');
    if (error) throw error;

    const rows: RetiredFieldRow[] = ((data ?? []) as any[]).map((row) => {
      const contractor = (row.contractors ?? {}) as any;
      return {
        id: text(row.id),
        projectName: text(row.project_name),
        contractorName: text(contractor.name),
        pcabLicenseNo: text(contractor.pcab_license_no),
        completionPercentage: text(row.completion_percentage),
        adjustedProjectCost: text(row.adjusted_project_cost),
        archived: Boolean(row.archived_at),
      };
    });

    await addActivityLog(auth.admin, {
      userId: auth.userId,
      user: auth.profile.username,
      action: 'Retired Fields Exported',
      details: `Exported the retired project fields for ${rows.length} project(s) to CSV.`,
    });

    return new Response(retiredFieldsCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${retiredFieldsFileName()}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Could not export the retired project fields.', error);
    return NextResponse.json({ message: 'Unable to export the retired fields.' }, { status: 500 });
  }
}
