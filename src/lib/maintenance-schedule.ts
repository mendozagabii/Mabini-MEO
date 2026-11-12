/** Inspection dates are calendar dates; Mabini uses Philippine local time. */
export function maintenanceStartDate(inspectionDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) return null;
  const date = new Date(`${inspectionDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== inspectionDate) return null;
  date.setUTCDate(date.getUTCDate() + 7);
  const result = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}
export function philippinesToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function effectiveMaintenanceStatus(status: string, inspectionDate: string, today = philippinesToday()): string {
  const start = maintenanceStartDate(inspectionDate);
  return status === 'Scheduled' && start && start <= today ? 'In Progress' : status;
}
