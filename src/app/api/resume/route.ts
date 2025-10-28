import { NextRequest, NextResponse } from 'next/server';
import { BackendHandlers } from '../../../lib/backend-handlers';
import { ResumeParseResponse } from '../../../types/resume-types';

// POST /api/resume/parse - Parse uploaded resume file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    console.log('File validation - Name:', file.name, 'Type:', file.type, 'Size:', file.size);
    
    if (!allowedTypes.includes(file.type)) {
      console.log('File type not allowed:', file.type);
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Please upload PDF, DOC, or DOCX files.' },
        { status: 400 }
      );
    }
    
    console.log('File validation passed');

    // Parse resume file
    console.log('Starting resume parsing for file:', file.name, 'Type:', file.type);
    const parsedResume = await BackendHandlers.parseResumeFile(file);
    console.log('Resume parsing completed successfully');
    
    const response: ResumeParseResponse = {
      success: true,
      data: parsedResume,
      message: 'Resume parsed successfully',
      confidence: 0.85,
      extractedFields: ['personalInfo', 'experience', 'education', 'skills']
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Resume parsing error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      cause: error instanceof Error ? error.cause : 'No cause'
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to parse resume' 
      },
      { status: 500 }
    );
  }
}

// GET /api/resume/templates - Get available resume templates
export async function GET() {
  try {
    const templates = [
      {
        id: 'professional',
        name: 'Professional',
        category: 'professional',
        preview: '/templates/professional-preview.png',
        isPremium: false
      },
      {
        id: 'modern',
        name: 'Modern',
        category: 'modern',
        preview: '/templates/modern-preview.png',
        isPremium: false
      },
      {
        id: 'creative',
        name: 'Creative',
        category: 'creative',
        preview: '/templates/creative-preview.png',
        isPremium: true
      },
      {
        id: 'minimal',
        name: 'Minimal',
        category: 'minimal',
        preview: '/templates/minimal-preview.png',
        isPremium: false
      }
    ];

    return NextResponse.json({
      success: true,
      data: templates,
      message: 'Templates retrieved successfully'
    });
  } catch (error) {
    console.error('Template retrieval error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve templates' 
      },
      { status: 500 }
    );
  }
}
