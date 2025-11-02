import { cookies as nextCookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function createSupabaseServerClient() {
  const cookieStore = await nextCookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}
