import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  
  // Get origin from request - works in both local and production
  // In production, this will be the Vercel/deployed URL
  // In local dev, this will be http://localhost:3000
  const origin = req.nextUrl.origin;
  const redirectTo = `${origin}/api/auth/callback`;
  
  console.log('[Auth/Login] Redirect URI:', redirectTo);
  console.log('[Auth/Login] Request origin:', origin);
  console.log('[Auth/Login] Request URL:', req.url);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('[Auth/Login] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[Auth/Login] OAuth URL generated:', data.url);
  return NextResponse.redirect(data.url);
}
