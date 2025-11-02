import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?auth=error', req.url));
  }

  if (code) {
    // Exchange code for session (returns session)
    const { data: sessionData, error: exhError } = await supabase.auth.exchangeCodeForSession(code);
    if (exhError) return NextResponse.redirect(new URL('/?error=auth', req.url));

    // Get current user and session after exchange
    const { data: { user } } = await supabase.auth.getUser();
    const session = sessionData?.session;
    if (user) {
      // Upsert user profile (one row per user)
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      // Upsert session/token for later use if needed
      await supabase.from('user_sessions').upsert({
        user_id: user.id,
        access_token: session?.access_token,
        refresh_token: session?.refresh_token,
        last_seen: new Date().toISOString()
      });
    }
  }

  return NextResponse.redirect(new URL('/jdBuilder', req.url));
}
