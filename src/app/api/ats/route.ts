import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('ATS route called');
    const body = await request.json();
    console.log('Request body:', body);
    
    return NextResponse.json({
      success: true,
      data: {
        score: 85,
        matchedKeywords: ['JavaScript', 'React'],
        missingKeywords: [],
        feedback: 'Test response from ATS route'
      },
      message: 'ATS score calculated successfully (test mode)'
    });
  } catch (error) {
    console.error('ATS scoring error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to calculate ATS score' 
      },
      { status: 500 }
    );
  }
}