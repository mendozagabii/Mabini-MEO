// @mine — shared validation for user-uploaded project and inspection attachments.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const types: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

export function attachmentMime(name: string, type: string): string | null {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (!name.includes('.') || !types[extension]) return null;
  const expected = types[extension];
  if (type && type.toLowerCase() !== expected && !(expected === 'image/jpeg' && type.toLowerCase() === 'image/jpg')) return null;
  return expected;
}

export function attachmentError(file: { name: string; type: string; size: number }): string | null {
  if (!file.name || file.name.length > 255 || !attachmentMime(file.name, file.type)) return 'Choose a PDF, JPG, or PNG file.';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) return 'Attachments must be non-empty and no larger than 10 MB.';
  return null;
}

/** File signatures are checked server-side after upload, not just extensions/MIME. */
export function matchesAttachmentSignature(name: string, bytes: Uint8Array): boolean {
  const type = attachmentMime(name, '');
  if (type === 'application/pdf') return bytes.length >= 5 && [0x25, 0x50, 0x44, 0x46, 0x2d].every((value, index) => bytes[index] === value);
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return false;
}
