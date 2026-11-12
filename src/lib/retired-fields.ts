// @mine — step 9: PCAB License No., Completion Percentage and Actual Project Cost are
// being retired (WORKFLOW-DECISIONS B6). The order is export → hide → drop, so this
// builds the CSV that keeps the office's data before the columns are dropped.

/** The three retired fields, plus enough columns to identify the project. */
export const RETIRED_FIELD_COLUMNS = [
  'Project ID',
  'Project Name',
  'Contractor',
  'PCAB License No.',
  'Completion Percentage',
  'Actual Project Cost',
  'Archived',
] as const;

export type RetiredFieldRow = {
  id: string;
  projectName: string;
  contractorName: string;
  pcabLicenseNo: string;
  completionPercentage: string;
  adjustedProjectCost: string;
  archived: boolean;
};

/** RFC 4180 quoting: wrap when the value holds a comma, a quote, a newline or edge spaces. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** @mine — the export the office keeps. One row per project, archived ones included. */
export function retiredFieldsCsv(rows: RetiredFieldRow[]): string {
  const lines = [RETIRED_FIELD_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.projectName,
      row.contractorName,
      row.pcabLicenseNo,
      row.completionPercentage,
      row.adjustedProjectCost,
      row.archived ? 'Yes' : 'No',
    ].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** @mine — `retired-project-fields-2026-11-12.csv`. */
export function retiredFieldsFileName(now: Date = new Date()): string {
  return `retired-project-fields-${now.toISOString().slice(0, 10)}.csv`;
}
