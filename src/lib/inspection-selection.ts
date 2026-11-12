export interface InspectionSummary {
  id: string;
  localRoadId: string;
  date: string;
  annualFollowUpYear?: number;
  isScheduledAnnualFollowUp?: boolean;
  isPendingValidationInspection?: boolean;
  isValidationInspection?: boolean;
  conditionRatings?: Record<string, string>;
  conditionRating?: number;
}

export function isPendingInspection(inspection: InspectionSummary): boolean {
  return inspection.isScheduledAnnualFollowUp === true || inspection.isPendingValidationInspection === true ||
    (inspection.isValidationInspection === true && inspection.isPendingValidationInspection !== false);
}

// Annual year, not the date the results were entered, determines follow-up order.
export function latestByProject<T extends InspectionSummary>(inspections: T[]): T[] {
  const selected = new Map<string, T>();
  const compare = (a: T, b: T) => {
    const yearA = a.annualFollowUpYear || Number(a.date?.slice(0, 4)) || 0;
    const yearB = b.annualFollowUpYear || Number(b.date?.slice(0, 4)) || 0;
    const sameFollowUp = a.annualFollowUpYear && a.annualFollowUpYear === b.annualFollowUpYear;
    return yearA - yearB || (sameFollowUp ? Number(!isPendingInspection(a)) - Number(!isPendingInspection(b)) : 0) || String(a.date || '').localeCompare(String(b.date || '')) ||
      Number(!isPendingInspection(a)) - Number(!isPendingInspection(b)) || a.id.localeCompare(b.id);
  };
  for (const inspection of inspections) {
    const previous = selected.get(inspection.localRoadId);
    if (!previous || compare(inspection, previous) > 0) selected.set(inspection.localRoadId, inspection);
  }
  return Array.from(selected.values());
}

export function maintenanceEligible(inspection: InspectionSummary): boolean {
  if (isPendingInspection(inspection)) return false;
  const ratings = Object.values(inspection.conditionRatings || {});
  if (ratings.length) return ratings.some(rating => ['fair', 'poor', 'bad'].includes(String(rating).trim().toLowerCase()));
  const score = Number(inspection.conditionRating);
  return score > 0 && score < 8;
}

export const assessmentComponents = ['Concrete', 'Asphalt', 'Gravel', 'Earth', 'Shoulder', 'Side Drain', 'Sidewalk', 'Drainage', 'Solar Lights', 'Slope Protection', 'Retaining Wall'];
export function findingsSummary(ratings: Record<string, string>, remarks: Record<string, string>): string {
  return assessmentComponents.filter(label => ratings[label] !== 'N/A' && remarks[label]?.trim())
    .map(label => {
      const text = remarks[label].trim().replace(/\s+/g, ' ');
      return `${label}: ${text.length > 160 ? `${text.slice(0, 157)}...` : text}`;
    }).join('; ');
}
export function validateAssessment(ratings: Record<string, string>, remarks: Record<string, string>, attachments: Record<string, unknown[]>): boolean {
  const allowed = ['Good', 'Fair', 'Poor', 'Bad', 'N/A'];
  return assessmentComponents.every(label => allowed.includes(ratings[label])) &&
    assessmentComponents.some(label => ratings[label] !== 'N/A') &&
    assessmentComponents.every(label => ratings[label] === 'N/A' ||
      (typeof remarks[label] === 'string' && !!remarks[label].trim() && Array.isArray(attachments[label]) && attachments[label].length > 0));
}
