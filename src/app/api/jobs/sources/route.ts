import { NextResponse } from 'next/server';

const JOB_SCRAPER_API_URL = process.env.JOB_SCRAPER_API_URL || 'http://localhost:5000';

export async function GET() {
  try {
    const response = await fetch(`${JOB_SCRAPER_API_URL}/api/sources`);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch job sources' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Failed to fetch job sources:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
