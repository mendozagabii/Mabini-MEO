// @mine — 2026-11-11: issue a scoped Storage destination for a per-category inspection
// attachment (Local Road Condition Assessment → one file set underneath each category).
// Mirrors /api/local-road/attachment-upload, but for the inspector role and its own folder.
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireRole, withRefresh } from '@/lib/api';
import { attachmentError, attachmentMime } from '@/lib/attachment-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ITEM_UPLOAD_FOLDER = 'inspection-item-uploads';

export async function POST(request: Request) {
  const { auth, denied } = await requireRole(request, ['inspector']);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || typeof body.type !== 'string' || typeof body.size !== 'number') {
    return NextResponse.json({ message: 'A valid attachment is required.' }, { status: 400 });
  }
  const problem = attachmentError(body);
  if (problem) return NextResponse.json({ message: problem }, { status: 400 });
  const mime = attachmentMime(body.name, body.type)!;
  const extension = body.name.split('.').pop()!.toLowerCase();
  const path = `${ITEM_UPLOAD_FOLDER}/${auth.userId}/${randomUUID()}.${extension}`;
  const { data, error } = await auth.db.storage.from('wblrms-files').createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Could not prepare inspection attachment upload.', error);
    return NextResponse.json({ message: 'Unable to prepare the attachment upload. Please try again.' }, { status: 500 });
  }
  return withRefresh(NextResponse.json({ signedUrl: data.signedUrl, path, type: mime }), auth);
}
