import { NextRequest, NextResponse } from 'next/server';
import { BackendHandlers } from '../../../../lib/backend-handlers';
import { ResumeData, ATSScore, ATSScoreResponse } from '../../../../types/resume-types';

// POST /api/ats/calculate - Calculate ATS score
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resumeData, jdText }: { resumeData: ResumeData; jdText: string } = body;

    if (!resumeData) {
      return NextResponse.json(
        { success: false, error: 'Resume data is required' },
        { status: 400 }
      );
    }

    // Calculate ATS score using the Python server
    const atsResult = await BackendHandlers.calculateATSScore(resumeData, jdText || '');
    
    const response: ATSScoreResponse = {
      success: true,
      data: {
        score: atsResult.score,
        matchedKeywords: atsResult.matchedKeywords,
        missingKeywords: [],
        feedback: atsResult.score > 80 ? 'Excellent match!' : atsResult.score > 60 ? 'Good match with room for improvement' : 'Needs optimization'
      },
      message: 'ATS score calculated successfully',
      recommendations: generateRecommendations(atsResult),
      optimizationTips: generateOptimizationTips(atsResult)
    };

    return NextResponse.json(response);
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

// Helper functions
function generateRecommendations(atsResult: { score: number; matchedKeywords: string[]; suggestions: string[] }): string[] {
  const recommendations: string[] = [];
  
  if (atsResult.score < 70) {
    recommendations.push('Add more relevant keywords from the job description');
    recommendations.push('Include specific technical skills mentioned in the job posting');
    recommendations.push('Quantify your achievements with numbers and metrics');
  }
  
  if (atsResult.score < 80) {
    recommendations.push('Ensure your summary highlights key qualifications');
    recommendations.push('Use industry-standard terminology');
    recommendations.push('Include relevant certifications and training');
  }
  
  if (atsResult.suggestions && atsResult.suggestions.length > 0) {
    recommendations.push(...atsResult.suggestions.slice(0, 3));
  }
  
  return recommendations;
}

function generateOptimizationTips(atsResult: { score: number; matchedKeywords: string[]; suggestions: string[] }): string[] {
  const tips: string[] = [];
  
  if (atsResult.score >= 90) {
    tips.push('Your resume is highly optimized! Maintain this level of alignment.');
    tips.push('Consider adding more specific achievements to stand out further.');
  } else if (atsResult.score >= 80) {
    tips.push('Good optimization! Focus on adding more quantifiable achievements.');
    tips.push('Consider customizing your summary for each application.');
  } else if (atsResult.score >= 70) {
    tips.push('Moderate optimization needed. Review and update your skills section.');
    tips.push('Add more specific project examples that match the job requirements.');
  } else {
    tips.push('Significant optimization needed. Consider a complete resume rewrite.');
    tips.push('Focus on aligning your experience descriptions with job requirements.');
  }
  
  return tips;
}