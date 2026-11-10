export type ValidationResult = 'Validated' | 'Return for Revision';
export type AnnualValidation = { year: number; dueDate: string; result: 'Pending' | ValidationResult; remarks: string; validatedAt?: string };
export type ValidationProject = { actualCompletionDate?: string; validationResult?: ValidationResult; validationRemarks?: string; annualValidationEntries?: AnnualValidation[] };

// Show the latest completed decision, not a new pending anniversary, to the encoder.
export function latestValidation(project: ValidationProject): { result?: ValidationResult; remarks?: string; year?: number } {
  if (project.validationResult === 'Return for Revision') return { result: project.validationResult, remarks: project.validationRemarks };
  const returned = [...(project.annualValidationEntries ?? [])]
    .filter(entry => entry.result === 'Return for Revision')
    .sort((a, b) => a.year - b.year)[0];
  if (returned) return { result: 'Return for Revision', remarks: returned.remarks, year: returned.year };
  const latest = [...(project.annualValidationEntries ?? [])]
    .filter(entry => entry.result !== 'Pending')
    .sort((a, b) => b.year - a.year)[0];
  if (latest && latest.result !== 'Pending') return { result: latest.result, remarks: latest.remarks, year: latest.year };
  return { result: project.validationResult, remarks: project.validationRemarks };
}

// Work through the initial validation first, then the oldest unresolved annual entry.
export function validationTask(project: ValidationProject, now = new Date()): { year?: number; result?: ValidationResult; remarks?: string; dueDate?: string } | null {
  const raw = project.actualCompletionDate;
  const completion = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  if (!completion || !Number.isFinite(completion.getTime()) || completion.toISOString().slice(0, 10) !== raw) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (today < completion.getTime() - 30 * 86400000) return null;
  if (project.validationResult !== 'Validated') return { result: project.validationResult, remarks: project.validationRemarks };
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
