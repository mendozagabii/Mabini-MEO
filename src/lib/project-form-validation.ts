/** @mine — preserve decimal input while grouping the amount for display. */
export function formatProjectCurrency(value: string): string {
  return value.split('\n').map((line) => {
    const cleaned = line.replace(/[^\d.]/g, '');
    const dot = cleaned.indexOf('.');
    const integer = dot < 0 ? cleaned : cleaned.slice(0, dot);
    const decimal = dot < 0 ? '' : `.${cleaned.slice(dot + 1).replace(/\./g, '')}`;
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decimal;
  }).join('\n');
}

export function isValidProjectCurrency(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value.replace(/,/g, '').trim());
}

/** Group saved values and show at least two decimal places without rounding. */
export function formatSavedProjectCurrency(value?: string | null): string {
  if (value == null || value === '') return '';
  if (!isValidProjectCurrency(value)) return value;
  const [integer, fraction = ''] = value.trim().split('.');
  return `${formatProjectCurrency(integer)}.${fraction.padEnd(2, '0')}`;
}

export function hasFourDigitYear(value: string): boolean {
  if (!/^(?:[2-9]\d{3})-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Add calendar months, clamping month-end dates (e.g. March 31 to February 28). */
export function addCalendarMonths(value: string, months: number): string | null {
  if (!hasFourDigitYear(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const total = year * 12 + month - 1 + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12;
  if (targetYear < 2000 || targetYear > 9999) return null;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Add exact calendar days in UTC, avoiding local time and daylight saving changes. */
export function addCalendarDays(value: string, days: number): string | null {
  if (!hasFourDigitYear(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const result = date.toISOString().slice(0, 10);
  return hasFourDigitYear(result) ? result : null;
}
