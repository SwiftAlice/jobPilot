import { NextRequest, NextResponse } from 'next/server';

const runningOnVercel = !!process.env.VERCEL;
const JOB_SCRAPER_API_URL =
  process.env.JOB_SCRAPER_API_URL ||
  process.env.NEXT_PUBLIC_JOB_SCRAPER_API_URL ||
  (!runningOnVercel ? 'http://localhost:5000' : '');

export async function POST(request: NextRequest) {
  if (!JOB_SCRAPER_API_URL) {
    return NextResponse.json(
      { roleProfiles: [], finalKeywords: [], error: 'Backend URL not configured' },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s to align with client

    let response: Response | null = null;
    try {
      response = await fetch(`${JOB_SCRAPER_API_URL}/api/keywords-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      return NextResponse.json({ roleProfiles: [], finalKeywords: [], error: String(err) }, { status: 200 });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ roleProfiles: [], finalKeywords: [] }, { status: 200 });
    }

    const data = await response.json();
    // Ensure shape
    return NextResponse.json({
      roleProfiles: Array.isArray(data?.roleProfiles) ? data.roleProfiles : [],
      finalKeywords: Array.isArray(data?.finalKeywords) ? data.finalKeywords : [],
    });
  } catch (e) {
    return NextResponse.json({ roleProfiles: [], finalKeywords: [], error: String(e) }, { status: 200 });
  }
}


