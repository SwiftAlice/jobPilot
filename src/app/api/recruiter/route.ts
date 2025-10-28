import { NextRequest, NextResponse } from 'next/server';

// Ensure Node.js runtime so process.env is available
export const runtime = 'nodejs';
import { BackendHandlers } from '@/lib/backend-handlers';

export async function POST(req: NextRequest) {
  try {
    console.log('[API] Starting recruiter request');
    const body = await req.json();
    const { jobTitle, company, location, candidateName, resumeData } = body || {};

    if (!jobTitle || !company || !candidateName) {
      return NextResponse.json({ success: false, error: 'Missing required fields: jobTitle, company, candidateName' }, { status: 400 });
    }

    console.log('[API] Calling BackendHandlers.getRecruiterOutreachForJob');
    console.log('[API] Request params:', { jobTitle, company, location, candidateName });
    
    const results = await BackendHandlers.getRecruiterOutreachForJob({
      jobTitle,
      company,
      location,
      candidateName,
      resumeData,
    });

    console.log('[API] Returning results:', results.length);
    console.log('[API] Results data:', JSON.stringify(results, null, 2));
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Recruiter outreach API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}


