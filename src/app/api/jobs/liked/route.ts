import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ liked: [] });
  const { data, error: likedError } = await supabase
    .from('user_job_actions')
    .select('job_id')
    .eq('user_id', user.id)
    .eq('action', 'liked');
  if (likedError) return NextResponse.json({ liked: [] });
  const jobIds = data.map((item: any) => item.job_id);
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .in('id', jobIds);
  return NextResponse.json({ liked: jobs || [] });
}
