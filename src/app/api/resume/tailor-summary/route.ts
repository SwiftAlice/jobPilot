import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { API_CONFIG } from '@/lib/config';

const openai = new OpenAI({
  apiKey: API_CONFIG.OPENAI.API_KEY,
  timeout: 30000, // 30 second timeout
  maxRetries: 2,
});

export async function POST(request: NextRequest) {
  console.log('🎯 Tailor Summary API called');
  let currentSummary = '';
  let jobDescription = '';
  let resumeData: any = {};
  
  try {
    const requestData = await request.json();
    currentSummary = requestData.currentSummary;
    jobDescription = requestData.jobDescription;
    resumeData = requestData.resumeData;
    
    console.log('📝 Received summary length:', currentSummary?.length);
    console.log('📋 Received JD length:', jobDescription?.length);

    if (!currentSummary || !jobDescription) {
      return NextResponse.json(
        { success: false, error: 'Current summary and job description are required' },
        { status: 400 }
      );
    }

    // Create a focused prompt for tailoring the summary
    const prompt = `You are a professional resume writer. Your task is to rewrite the resume summary to naturally align with the job requirements while preserving all original achievements and metrics.

CURRENT SUMMARY:
${currentSummary}

JOB DESCRIPTION:
${jobDescription}

RESUME CONTEXT:
- Name: ${resumeData.personalInfo?.fullName || 'N/A'}
- Experience: ${resumeData.experience?.length || 0} positions
- Skills: ${resumeData.skills?.join(', ') || 'N/A'}
- Education: ${resumeData.education?.length || 0} entries

CRITICAL INSTRUCTIONS:
1. Extract the ESSENCE and CORE REQUIREMENTS from the job description - don't copy phrases
2. Use your own words to describe how the candidate's experience matches these requirements
3. Keep ALL original metrics, numbers, achievements, and accomplishments EXACTLY as they are
4. Write naturally - avoid sounding like a job posting
5. Focus on the candidate's VALUE and IMPACT, not just skills
6. Use professional but conversational language
7. Maintain the original length and structure
8. Do NOT copy sentences or phrases from the job description
9. Do NOT add information that wasn't in the original summary
10. Make it sound like a natural professional summary, not a job description

Return ONLY the rewritten summary text, no explanations or additional text.`;

    console.log('📝 Current summary preview:', currentSummary.substring(0, 200) + '...');
    console.log('📋 Job description preview:', jobDescription.substring(0, 200) + '...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional resume writer who specializes in creating natural, compelling summaries. Your expertise is in extracting the essence of job requirements and expressing them in your own words, focusing on the candidate\'s value and impact. You never copy phrases from job descriptions - instead, you translate requirements into natural professional language that highlights the candidate\'s strengths.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.5,
    });

    const tailoredSummary = completion.choices[0]?.message?.content?.trim();
    console.log('✅ OpenAI response received, length:', tailoredSummary?.length);
    console.log('📄 Tailored summary preview:', tailoredSummary?.substring(0, 200) + '...');

    if (!tailoredSummary) {
      console.error('❌ OpenAI returned empty response');
      throw new Error('Failed to generate tailored summary');
    }

    console.log('🎉 Returning tailored summary');
    return NextResponse.json({
      success: true,
      tailoredSummary,
    });

  } catch (error) {
    console.error('💥 Error in tailor summary API:', error);
    
    // Check if it's a network error
    if (error instanceof Error && error.message.includes('ENOTFOUND')) {
      console.error('🌐 Network connectivity issue detected - returning original summary as fallback');
      return NextResponse.json(
        { 
          success: true, 
          tailoredSummary: currentSummary,
          fallback: true,
          message: 'Network issue detected. Original summary returned. Please try again later.'
        },
        { status: 200 }
      );
    }
    
    // Check if it's an API key issue
    if (error instanceof Error && (error.message.includes('401') || error.message.includes('unauthorized'))) {
      console.error('🔑 API key issue detected');
      return NextResponse.json(
        { 
          success: false, 
          error: 'OpenAI API authentication failed. Please check your API key.' 
        },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to tailor summary' 
      },
      { status: 500 }
    );
  }
}
