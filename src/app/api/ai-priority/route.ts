// @mine — added the session check (was unauthenticated); AI logic unchanged.
import { NextResponse } from 'next/server';
import { AIServiceError, prioritizeMaintenance } from '@/lib/ai';
import { requireAuth, unauthorized } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A valid JSON request body is required.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: 'A road assessment request is required.' }, { status: 400 });
  }
  if (!('items' in body)) {
    return NextResponse.json({ message: 'Road assessment items are required.' }, { status: 400 });
  }

  try {
    const prioritized = await prioritizeMaintenance(body.items);
    return NextResponse.json({ success: true, data: prioritized });
  } catch (error) {
    if (error instanceof AIServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error('Failed to generate AI maintenance recommendations.', error);
    return NextResponse.json(
      { message: 'Unable to generate recommendations right now. Please try again.' },
      { status: 500 }
    );
  }
}
