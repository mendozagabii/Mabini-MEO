// @mine — step 8: the 30-day archive retention the Archive screen has always promised
// (WORKFLOW-REVIEW Q26, accepted in WORKFLOW-DECISIONS B5a). Pure date rules only: the
// queries and the deletion live in src/lib/supabase-data.ts, the trigger in
// src/app/api/retention/route.ts.

/** How long an archived record is kept before it is deleted for good. */
export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @mine — anything archived at or before this moment is due for deletion.
 * `now` is passed in by every caller so the rule can be tested and audited.
 */
export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}

/** @mine — the exact moment a record archived at `archivedAt` is deleted. */
export function retentionDeadline(archivedAt: string | Date | null | undefined): Date | null {
  const archived = toDate(archivedAt);
  return archived ? new Date(archived.getTime() + RETENTION_DAYS * DAY_MS) : null;
}

/** @mine — whole days left before deletion; 0 means it goes on the next run. */
export function daysUntilPurge(archivedAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  const deadline = retentionDeadline(archivedAt);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS));
}

/** @mine — true once the 30 days are up. */
export function isPurgeDue(archivedAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  const archived = toDate(archivedAt);
  if (!archived) return false;
  return archived.getTime() <= retentionCutoff(now).getTime();
}

/** @mine — `2026-12-11` — the calendar day the record is deleted on (UTC). */
export function purgeDateLabel(archivedAt: string | Date | null | undefined): string {
  const deadline = retentionDeadline(archivedAt);
  return deadline ? deadline.toISOString().slice(0, 10) : '';
}

/** @mine — the sentence the Archive screen shows under each record. */
export function purgeScheduleLabel(archivedAt: string | Date | null | undefined, now: Date = new Date()): string {
  const days = daysUntilPurge(archivedAt, now);
  if (days === null) return '';
  if (days === 0) return 'Deleted on the next automatic run';
  return `Deletes on ${purgeDateLabel(archivedAt)} (${days} day${days === 1 ? '' : 's'} left)`;
}

/**
 * @mine — the live run is opt-in, so the report-only mode is what production gets
 * until the office says go (WORKFLOW-DECISIONS step 8).
 */
export function livePurgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.RETENTION_LIVE ?? '').trim() === '1';
}

/** @mine — optional shared secret for the scheduled call (Vercel Cron sends it). */
export function cronAuthorized(headers: { get?: (name: string) => string | null } | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const secret = String(env.CRON_SECRET ?? '').trim();
  if (!secret) return false;
  const sent = headers?.get?.('authorization') ?? '';
  return sent === `Bearer ${secret}`;
}
