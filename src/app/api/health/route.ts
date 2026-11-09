// @mine — was hardcoded to 'development'/'local-nextjs-sqlite'.
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'local-road',
    environment: process.env.NODE_ENV ?? 'development',
    mode: 'nextjs-supabase',
  });
}
