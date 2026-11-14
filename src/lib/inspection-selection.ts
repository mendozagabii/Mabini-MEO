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

/** An inspection can only be scheduled once; subsequent schedules require a newer annual follow-up. */
export function eligibleMaintenanceInspections<T extends InspectionSummary>(inspections: T[], scheduledIds: string[], archivedInspections: InspectionSummary[] = []): T[] {
  const scheduled = new Set(scheduledIds);
  const previousByRoad = new Map<string, number>();
  for (const inspection of [...inspections, ...archivedInspections]) {
    if (!scheduled.has(inspection.id)) continue;
    const year = inspection.annualFollowUpYear || Number(inspection.date?.slice(0, 4)) || 0;
    previousByRoad.set(inspection.localRoadId, Math.max(previousByRoad.get(inspection.localRoadId) || 0, year));
  }
  return latestByProject(inspections.filter(inspection => !isPendingInspection(inspection))).filter(inspection => {
    if (!maintenanceEligible(inspection) || scheduled.has(inspection.id)) return false;
    const previousYear = previousByRoad.get(inspection.localRoadId);
    return previousYear === undefined || (!!inspection.annualFollowUpYear && inspection.annualFollowUpYear > previousYear);
  });
}

export const assessmentComponents = ['Concrete', 'Asphalt', 'Gravel', 'Earth', 'Shoulder', 'Side Drain', 'Sidewalk', 'Drainage', 'Solar Lights', 'Slope Protection', 'Retaining Wall'];
export function findingsSummary(ratings: Record<string, string>, remarks: Record<string, string>): string {
  // Combine the inspector's observations without inventing details or exposing
  // a category-by-category list. Full remarks remain stored under each component.
  const seen = new Set<string>();
  const observations = assessmentComponents.flatMap(label => {
    if (!remarks[label]?.trim()) return [];
    const text = remarks[label].trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
    const key = text.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
  const combined = observations.join('; ');
  return combined ? `${combined}.` : '';
}
export function validateAssessment(ratings: Record<string, string>, remarks: Record<string, string>, attachments: Record<string, unknown[]>): boolean {
  const allowed = ['Good', 'Fair', 'Poor', 'Bad', 'N/A'];
  return assessmentComponents.every(label => allowed.includes(ratings[label])) &&
    assessmentComponents.some(label => ratings[label] !== 'N/A') &&
    assessmentComponents.every(label => ['N/A', 'Good'].includes(ratings[label]) ||
      (typeof remarks[label] === 'string' && !!remarks[label].trim() && Array.isArray(attachments[label]) && attachments[label].length > 0));
}
