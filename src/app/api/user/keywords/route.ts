import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
    const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !srk) {
      const missing: string[] = [];
      if (!url) missing.push('SUPABASE_URL or SUPABASE_URL');
      if (!srk) missing.push('SUPABASE_SERVICE_ROLE_KEY');
      console.error('[API][UserKeywords][GET] Missing env:', missing.join(', '));
      return NextResponse.json({ keywords: [], error: `supabase env not configured: missing ${missing.join(', ')}` }, { status: 200 });
    }
    const sb = createClient(url, srk, { auth: { persistSession: false } });
    const userId = req.nextUrl.searchParams.get('user_id');
    if (!userId) return NextResponse.json({ keywords: [], error: 'missing user_id' }, { status: 200 });
    const { data, error } = await sb
      .from('user_keywords')
      .select('keywords')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error && (error as any).code !== 'PGRST116') {
      // PGRST116 is "Results contain 0 rows" for single() – we already used maybeSingle but keep safe
      return NextResponse.json({ keywords: [], error: error.message }, { status: 200 });
    }
    return NextResponse.json({ keywords: Array.isArray(data?.keywords) ? data.keywords : [] }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ keywords: [], error: String(e) }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
    const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !srk) {
      const missing: string[] = [];
      if (!url) missing.push('SUPABASE_URL or SUPABASE_URL');
      if (!srk) missing.push('SUPABASE_SERVICE_ROLE_KEY');
      console.error('[API][UserKeywords][POST] Missing env:', missing.join(', '));
      return NextResponse.json({ success: false, error: `supabase env not configured: missing ${missing.join(', ')}` }, { status: 200 });
    }
    const sb = createClient(url, srk, { auth: { persistSession: false } });

    const body = await req.json();
    const userId = body?.user_id;
    const keywords = Array.isArray(body?.keywords) ? body.keywords : [];
    if (!userId) return NextResponse.json({ success: false, error: 'missing user_id' }, { status: 200 });
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ success: false, error: 'empty keywords' }, { status: 200 });
    }
    // Normalize keywords to strings trimmed
    const cleaned = keywords.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0);
    const { error } = await sb
      .from('user_keywords')
      .upsert({ user_id: userId, keywords: cleaned, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    return NextResponse.json({ success: true, keywords: cleaned }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 200 });
  }
}


