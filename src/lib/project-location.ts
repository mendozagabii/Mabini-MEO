/** Match a complete barangay name in a comma/conjunction-separated location. */
export function projectMatchesLocation(location: string, filter: string): boolean {
  if (filter === 'All') return true;
  const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const target = normalize(filter);
  if (!target) return false;
  return location.split(/\s*[,;\n/&]\s*|\s+and\s+/iu).some(part =>
    normalize(part.replace(/^\s*(?:barangay|brgy\.?)\s+/iu, '')) === target,
  );
}
