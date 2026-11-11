// @mine — annual validation opens 30 days before each anniversary of actual completion.
export type ValidationResult = 'Validated' | 'Return for Revision';
export type AnnualValidation = { year: number; dueDate: string; result: 'Pending' | ValidationResult; remarks: string; validatedAt?: string };
export type ValidationProject = { actualCompletionDate?: string; validationResult?: ValidationResult; validationRemarks?: string; validationValidatedAt?: string; annualValidationEntries?: AnnualValidation[] };

// Legacy initial decisions remain in the database but are no longer validation tasks.
export function latestValidation(project: ValidationProject): { result?: ValidationResult | 'Pending'; remarks?: string; year?: number } {
  const entries = project.annualValidationEntries ?? [];
  const returned = [...entries].filter(entry => entry.result === 'Return for Revision').sort((a, b) => a.year - b.year)[0];
  if (returned) return { result: 'Return for Revision', remarks: returned.remarks, year: returned.year };
  const requeued = [...entries].filter(entry => entry.result === 'Pending' && entry.remarks?.trim()).sort((a, b) => a.year - b.year)[0];
  if (requeued) return { result: 'Pending', remarks: requeued.remarks, year: requeued.year };
  const latest = [...entries].filter(entry => entry.result !== 'Pending').sort((a, b) => b.year - a.year)[0];
  if (latest && latest.result !== 'Pending') return { result: latest.result, remarks: latest.remarks, year: latest.year };
  return {};
}

export function validationTask(project: ValidationProject, now = new Date()): { year: number; result?: ValidationResult; remarks?: string; dueDate?: string } | null {
  const raw = project.actualCompletionDate;
  const completion = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  if (!completion || !Number.isFinite(completion.getTime()) || completion.toISOString().slice(0, 10) !== raw) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDue = new Date(Date.UTC(completion.getUTCFullYear() + 1, completion.getUTCMonth(), completion.getUTCDate()));
  firstDue.setUTCDate(firstDue.getUTCDate() - 30);
  if (today < firstDue.getTime()) return null;

  // A returned annual decision remains actionable after a date change once the
  // first anniversary window has opened, preserving its remarks for revalidation.
  const requeued = [...(project.annualValidationEntries ?? [])]
    .filter(entry => entry.result !== 'Validated' && entry.remarks?.trim())
    .sort((a, b) => a.year - b.year)[0];
  if (requeued) return { year: requeued.year, result: requeued.result === 'Pending' ? undefined : requeued.result, remarks: requeued.remarks, dueDate: requeued.dueDate };
  const entry = [...(project.annualValidationEntries ?? [])]
    .filter(item => item.result !== 'Validated' && item.year > completion.getUTCFullYear())
    .map(item => {
      const due = new Date(Date.UTC(item.year, completion.getUTCMonth(), completion.getUTCDate()));
      due.setUTCDate(due.getUTCDate() - 30);
      return { ...item, dueDate: due.toISOString().slice(0, 10) };
    })
    .filter(item => item.dueDate <= new Date(today).toISOString().slice(0, 10))
    .sort((a, b) => a.year - b.year)[0];
  if (!entry) return null;
  return { year: entry.year, result: entry.result === 'Pending' ? undefined : entry.result, remarks: entry.remarks, dueDate: entry.dueDate };
}
