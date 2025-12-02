import { NextRequest, NextResponse } from 'next/server';

const runningOnVercel = !!process.env.VERCEL;
const JOB_SCRAPER_API_URL =
  process.env.JOB_SCRAPER_API_URL ||
  process.env.NEXT_PUBLIC_JOB_SCRAPER_API_URL ||
  (!runningOnVercel ? 'http://localhost:5000' : '');

export async function POST(request: NextRequest) {
  if (!JOB_SCRAPER_API_URL) {
    return NextResponse.json(
      { error: 'Backend URL not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(`${JOB_SCRAPER_API_URL}/api/search-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return NextResponse.json({ error: err || 'Agent search failed' }, { status: 200 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 });
  }
}


