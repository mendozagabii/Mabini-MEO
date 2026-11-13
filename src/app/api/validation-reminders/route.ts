// @mine — email 1 of the officer's flow (2026-11-12): Encoder → Validator, driven by
// the calendar. Once the 30-day window opens before an anniversary, the Validator is
// told the project is waiting. Encoding a project sends nothing.
//
// Runs daily from Vercel Cron (vercel.json), and the Head Engineer can run it by hand.
// One email per project per validation year, recorded in the activity log so a repeat
// run — or the next day's run — never sends it twice.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, unauthorized, forbidden } from '@/lib/api';
import { recordValidationReminder, listValidationReminderLogs, listRoads } from '@/lib/supabase-data';
import { automaticNote, notifyWorkflow } from '@/lib/notifications';
import { cronAuthorized } from '@/lib/retention';
import { createAdminClient } from '@/lib/supabase';
import {
  pendingValidationReminders, reminderDetails,
} from '@/lib/validation-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** @mine — send every reminder that is owed; returns what happened, never throws. */
async function runValidationReminders(db: SupabaseClient, admin: SupabaseClient) {
  const projects = await listRoads(db, admin);
  const logs = await listValidationReminderLogs(admin);
  const due = pendingValidationReminders(projects, logs);

  const reminders: Array<{ id: string; year: number; name: string; sent: number; skipped?: string }> = [];
  for (const reminder of due) {
    let sent = 0;
    let skipped: string | undefined;
    try {
      const result = await notifyWorkflow(admin as never, {
        kind: 'for-validation',
        projectName: reminder.name,
        note: automaticNote(
          reminder.dueDate
            ? `the ${reminder.year} validation window opened on ${reminder.dueDate}`
            : `the ${reminder.year} validation window is open`,
        ),
      });
      sent = result.sent;
      skipped = result.skipped;
    } catch (error) {
      console.error('Could not send a validation reminder.', error);
    }
    // Only a message that actually left the building is recorded, so a missing
    // mailbox delays the reminder instead of swallowing it for the whole year.
    if (sent > 0) {
      await recordValidationReminder(admin, reminderDetails(reminder.id, reminder.year, reminder.name));
    }
    reminders.push({ id: reminder.id, year: reminder.year, name: reminder.name, sent, skipped });
  }

  return {
    due: reminders.length,
    sent: reminders.reduce((total, item) => total + item.sent, 0),
    reminders,
  };
}

export async function GET(request: Request) {
  const scheduled = cronAuthorized(request.headers);

  if (scheduled) {
    try {
      const admin = createAdminClient();
      return NextResponse.json(await runValidationReminders(admin, admin));
    } catch (error) {
      console.error('The scheduled validation reminders failed.', error);
      return NextResponse.json({ message: 'The validation reminders could not run.' }, { status: 500 });
    }
  }

  // A person asking by hand: Head Engineer only.
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();
  if (auth.profile.roleDb !== 'head_engineer') return forbidden();
  try {
    return NextResponse.json(await runValidationReminders(auth.db, auth.admin));
  } catch (error) {
    console.error('The validation reminders could not run.', error);
    return NextResponse.json({ message: 'The validation reminders could not run.' }, { status: 500 });
  }
}

/** @mine — a scheduled call carrying the shared secret may also ask for them. */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers)) return unauthorized();
  try {
    const admin = createAdminClient();
    return NextResponse.json(await runValidationReminders(admin, admin));
  } catch (error) {
    console.error('The scheduled validation reminders failed.', error);
    return NextResponse.json({ message: 'The validation reminders could not run.' }, { status: 500 });
  }
}
