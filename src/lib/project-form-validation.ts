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
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value);
}
