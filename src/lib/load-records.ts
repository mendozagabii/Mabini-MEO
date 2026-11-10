// @mine — a failed module refresh must not clear another module's records.
export async function loadRecords(url: string, request: typeof fetch = fetch): Promise<unknown[]> {
  const response = await request(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('Invalid record response.');
  return payload.data;
}
