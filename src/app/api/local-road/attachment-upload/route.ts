// @mine — issue a scoped, one-use-style storage destination for an encoder upload.
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireRole, withRefresh } from '@/lib/api';
import { attachmentError, attachmentMime } from '@/lib/attachment-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { auth, denied } = await requireRole(request, ['encoder']);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || typeof body.type !== 'string' || typeof body.size !== 'number') {
    return NextResponse.json({ message: 'A valid attachment is required.' }, { status: 400 });
  }
  const problem = attachmentError(body);
  if (problem) return NextResponse.json({ message: problem }, { status: 400 });
  const mime = attachmentMime(body.name, body.type)!;
  const extension = body.name.split('.').pop()!.toLowerCase();
  const path = `project-uploads/${auth.userId}/${randomUUID()}.${extension}`;
  const { data, error } = await auth.db.storage.from('wblrms-files').createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Could not prepare project attachment upload.', error);
    return NextResponse.json({ message: 'Unable to prepare the attachment upload. Please try again.' }, { status: 500 });
  }
  return withRefresh(NextResponse.json({ signedUrl: data.signedUrl, path, type: mime }), auth);
}
