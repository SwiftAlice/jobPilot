import { NextResponse } from 'next/server';

const JOB_SCRAPER_API_URL = process.env.JOB_SCRAPER_API_URL || 'http://localhost:5000';

export async function GET() {
  try {
    const response = await fetch(`${JOB_SCRAPER_API_URL}/api/health`);
    
    if (!response.ok) {
      return NextResponse.json(
        { status: 'unhealthy', error: 'Job scraper service unavailable' },
        { status: 503 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Job scraper health check failed:', error);
    return NextResponse.json(
      { status: 'unhealthy', error: 'Job scraper service unavailable' },
      { status: 503 }
    );
  }
}
