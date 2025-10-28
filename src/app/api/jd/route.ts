import { NextRequest, NextResponse } from 'next/server';
import { BackendHandlers } from '../../../lib/backend-handlers';
import { JDGenerateResponse, JDGenerationOptions, ResumeData } from '../../../types/resume-types';

// POST /api/jd/generate - Generate job description
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyProfile, requirements }: JDGenerationOptions = body;

    if (!companyProfile || !requirements) {
      return NextResponse.json(
        { success: false, error: 'Company profile and requirements are required' },
        { status: 400 }
      );
    }

    // Generate job description using AI
    const generatedJD = await BackendHandlers.generateJD(requirements, {} as ResumeData);
    
    const response: JDGenerateResponse = {
      success: true,
      data: {
        jobTitle: 'Generated Position',
        company: 'Company',
        department: 'Department',
        location: 'Location',
        employmentType: 'Full-time',
        experienceLevel: 'Mid-level',
        salary: 'Competitive',
        overview: generatedJD,
        responsibilities: ['Responsibility 1', 'Responsibility 2'],
        requirements: requirements.split(',').map(r => r.trim()),
        preferredSkills: ['Skill 1', 'Skill 2'],
        benefits: ['Benefit 1', 'Benefit 2'],
        companyInfo: 'Company information'
      },
      message: 'Job description generated successfully',
      suggestions: [
        'Consider adding specific salary ranges',
        'Include company culture details',
        'Add specific technical requirements'
      ],
      keywords: (await BackendHandlers.calculateATSScore({} as ResumeData, requirements)).matchedKeywords || []
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('JD generation error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate job description' 
      },
      { status: 500 }
    );
  }
}

// GET /api/jd/templates - Get JD templates
export async function GET() {
  try {
    const templates = [
      {
        id: 'software-engineer',
        name: 'Software Engineer',
        industry: 'Technology',
        level: 'mid',
        template: 'We are seeking a talented {level} {title} to join our dynamic team...'
      },
      {
        id: 'product-manager',
        name: 'Product Manager',
        industry: 'Technology',
        level: 'senior',
        template: 'We are looking for an experienced {level} {title} to drive product strategy...'
      },
      {
        id: 'data-scientist',
        name: 'Data Scientist',
        industry: 'Technology',
        level: 'mid',
        template: 'Join our data team as a {level} {title} to build innovative solutions...'
      },
      {
        id: 'marketing-specialist',
        name: 'Marketing Specialist',
        industry: 'Marketing',
        level: 'entry',
        template: 'We are hiring a {level} {title} to support our marketing initiatives...'
      }
    ];

    return NextResponse.json({
      success: true,
      data: templates,
      message: 'JD templates retrieved successfully'
    });
  } catch (error) {
    console.error('JD template retrieval error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve JD templates' 
      },
      { status: 500 }
    );
  }
}
