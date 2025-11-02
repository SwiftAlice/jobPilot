import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: (session.user.user_metadata as any)?.full_name || (session.user.user_metadata as any)?.name || null,
      avatar_url: (session.user.user_metadata as any)?.avatar_url || (session.user.user_metadata as any)?.picture || null,
    },
  });
}
