// @mine — step 8: the 30-day archive purge (WORKFLOW-REVIEW Q26 / WORKFLOW-DECISIONS B5a).
//
// Two modes, on purpose:
//   * report  — every call returns what *would* be deleted, and deletes nothing.
//   * live    — only when RETENTION_LIVE=1 is set in the hosting environment.
// The scheduled call (Vercel Cron, see vercel.json) may always read the report;
// the live path needs CRON_SECRET as well, and a Head Engineer can also trigger it
// by hand with an explicit confirmation.
import { NextResponse } from 'next/server';
import { requireAuth, requireRole, forbidden, unauthorized } from '@/lib/api';
import { addActivityLog, collectRetentionReport, purgeExpiredRecords, type RetentionReport } from '@/lib/supabase-data';
import { cronAuthorized, livePurgeEnabled, retentionCutoff } from '@/lib/retention';
import { createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function summary(report: RetentionReport) {
  return {
    cutoff: report.cutoff,
    projects: report.projects.length,
    inspections: report.inspections.length,
    maintenance: report.maintenance.length,
    files: report.files.length,
    archivedAccounts: report.accounts.length,
  };
}

export async function GET(request: Request) {
  const scheduled = Boolean(request.headers.get('x-vercel-cron')) || cronAuthorized(request.headers);

  if (scheduled) {
    // The scheduled call reports; it only deletes when the office has switched the
    // live run on, and then only when the call carries the shared secret.
    try {
      const admin = createAdminClient();
      const report = await collectRetentionReport(admin, retentionCutoff().toISOString());
      if (!livePurgeEnabled()) {
        return NextResponse.json({ mode: 'report', live: false, summary: summary(report), due: report });
      }
      if (!cronAuthorized(request.headers)) {
        return NextResponse.json({ mode: 'report', live: false, summary: summary(report), due: report });
      }
      const run = await purgeExpiredRecords(admin, retentionCutoff().toISOString());
      await addActivityLog(admin, {
        user: 'system',
        action: 'Archive Purge',
        details: `Scheduled purge deleted ${run.deleted.projects} project(s), ${run.deleted.inspections} inspection(s), ${run.deleted.maintenance} maintenance record(s) and ${run.deleted.files} file(s).`,
      });
      return NextResponse.json({ mode: 'live', live: true, summary: summary(run.report), deleted: run.deleted, errors: run.errors });
    } catch (error) {
      console.error('The scheduled archive purge failed.', error);
      return NextResponse.json({ message: 'The archive purge could not run.' }, { status: 500 });
    }
  }

  // A person asking for the report: Head Engineer only, and it never deletes.
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  if (auth.profile.roleDb !== 'head_engineer') return forbidden();
  try {
    const report = await collectRetentionReport(auth.admin, retentionCutoff().toISOString());
    return NextResponse.json({ mode: 'report', live: livePurgeEnabled(), summary: summary(report), due: report });
  } catch (error) {
    console.error('Could not build the archive retention report.', error);
    return NextResponse.json({ message: 'Unable to read the archived records.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, denied } = await requireRole(request, ['head_engineer']);
  if (denied) return denied;
  const payload = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (String(payload?.confirm ?? '') !== 'purge') {
    return NextResponse.json({ message: 'Type the confirmation to delete the expired archived records.' }, { status: 400 });
  }
  if (!livePurgeEnabled()) {
    return NextResponse.json({
      message: 'The automatic purge is switched off. Nothing was deleted; set RETENTION_LIVE=1 in the hosting environment to switch it on.',
    }, { status: 409 });
  }
  try {
    const run = await purgeExpiredRecords(auth.admin, retentionCutoff().toISOString());
    await addActivityLog(auth.admin, {
      userId: auth.userId,
      user: auth.profile.username,
      action: 'Archive Purge',
      details: `Deleted ${run.deleted.projects} archived project(s), ${run.deleted.inspections} inspection(s), ${run.deleted.maintenance} maintenance record(s) and ${run.deleted.files} file(s).`,
    });
    return NextResponse.json({ mode: 'live', live: true, summary: summary(run.report), deleted: run.deleted, errors: run.errors });
  } catch (error) {
    console.error('The archive purge failed.', error);
    return NextResponse.json({ message: 'The archive purge could not run.' }, { status: 500 });
  }
}
