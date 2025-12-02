import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// In Vercel, prefer server env JOB_SCRAPER_API_URL; fallback to NEXT_PUBLIC_JOB_SCRAPER_API_URL.
// In local dev, default to localhost.
const runningOnVercel = !!process.env.VERCEL;
const JOB_SCRAPER_API_URL =
  process.env.JOB_SCRAPER_API_URL ||
  process.env.NEXT_PUBLIC_JOB_SCRAPER_API_URL ||
  (!runningOnVercel ? 'http://localhost:5000' : '');

export async function POST(request: NextRequest) {
  console.log('[Next.js Proxy] POST request received at /api/jobs/search');

  if (!JOB_SCRAPER_API_URL) {
    console.error('[Next.js Proxy] Missing JOB_SCRAPER_API_URL/NEXT_PUBLIC_JOB_SCRAPER_API_URL env var');
    return NextResponse.json(
      { error: 'Backend URL not configured. Set JOB_SCRAPER_API_URL or NEXT_PUBLIC_JOB_SCRAPER_API_URL.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    console.log('[Next.js Proxy] Request body:', {
      keywords: body.keywords,
      location: body.location,
      skills_count: body.skills?.length,
      sources: body.sources
    });
    
    // Validate required fields (location optional)
    if (!body.keywords || !body.skills) {
      return NextResponse.json(
        { error: 'Missing required fields: keywords, skills' },
        { status: 400 }
      );
    }

    // Call enhanced endpoint with a strict timeout
    const controller = new AbortController();
    const timeoutMs = 120000; // 120s
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response | null = null;
    try {
      response = await fetch(`${JOB_SCRAPER_API_URL}/api/search-enhanced`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      console.error('[Next.js Proxy] Fetch error:', err);
      clearTimeout(timeout);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Job search failed' },
        { status: 500 }
      );
    }
    
    if (!response) {
      return NextResponse.json(
        { error: 'Job search timed out' },
        { status: 504 }
      );
    }

    if (!response.ok) {
      const errorData = await safeJson(response);
      return NextResponse.json(
        { error: (errorData as any)?.error || 'Job search failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Debug logging
    console.log('[Next.js Proxy] Response from Flask:', {
      total_found: data.total_found,
      jobs_count: data.jobs?.length,
      pagination: data.pagination,
      errors: data.errors
    });
    
    // Do NOT filter out liked jobs from main list (show all). Keeping this block intentionally disabled.
    return NextResponse.json(data);

  } catch (error) {
    console.error('Job search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Job search API endpoint',
    endpoints: {
      search: 'POST /api/jobs/search',
      health: 'GET /api/jobs/health',
      sources: 'GET /api/jobs/sources'
    }
  });
}

async function safeJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
