# Resume & JD Builder - Backend Documentation

## Overview

This document describes the backend architecture and implementation for the AI-powered Resume & JD Builder application. The backend provides comprehensive functionality for resume parsing, job description generation, ATS scoring, and AI-powered content optimization.

## Architecture

The backend is built using Next.js API routes with a modular, class-based architecture:

```
src/
├── lib/
│   ├── backend-handlers.ts    # Core business logic handlers
│   ├── utils.ts               # Utility functions
│   └── config.ts              # Configuration management
├── types/
│   └── resume-types.ts        # TypeScript type definitions
└── app/api/
    ├── resume/route.ts        # Resume-related API endpoints
    ├── jd/route.ts            # Job description API endpoints
    └── ats/route.ts           # ATS scoring API endpoints
```

## Core Components

### 1. Backend Handlers (`src/lib/backend-handlers.ts`)

The main business logic layer containing specialized handler classes:

#### ResumeHandler
- **`parseResumeFile(file: File)`**: Parses uploaded resume files (PDF, DOC, DOCX)
- **`extractStructuredData(content: string)`**: Uses AI to extract structured data from text
- **`fallbackExtraction(content: string)`**: Regex-based fallback extraction
- **`validateAndEnhanceResumeData(data)`**: Validates and enhances parsed data

#### JDHandler
- **`generateJobDescription(profile, requirements)`**: Generates job descriptions using AI
- **`validateAndEnhanceJDData(data)`**: Validates and enhances JD data

#### ATSHandler
- **`calculateATSScore(resumeData, jdText)`**: Calculates ATS compatibility score
- **`extractKeywords(jdText)`**: Extracts relevant keywords from job descriptions
- **`optimizeResumeForJD(resumeData, jdText)`**: AI-powered resume optimization
- **`generateFeedback(score, keywords)`**: Generates improvement recommendations

#### AIHandler
- **`callOpenAI(prompt)`**: OpenAI API integration for content generation
- **`generateResumeContent(profile, skills, jdText?)`**: AI-powered resume generation

#### ValidationHandler
- **`validateResumeData(data)`**: Validates resume data structure
- **`validateJDData(data)`**: Validates job description data
- **`sanitizeInput(input)`**: Sanitizes user input

### 2. Type Definitions (`src/types/resume-types.ts`)

Comprehensive TypeScript interfaces for all data structures:

- **ResumeData**: Complete resume structure
- **JDData**: Job description structure
- **ATSScore**: ATS scoring results
- **APIResponse**: Generic API response wrapper
- **ValidationResult**: Validation results
- **ExportOptions**: Export configuration

### 3. Utility Functions (`src/lib/utils.ts`)

Helper classes for common operations:

- **FileUtils**: File validation, processing, and management
- **DataUtils**: Data manipulation and processing
- **TextUtils**: Text analysis and processing
- **ValidationUtils**: Input validation helpers
- **PerformanceUtils**: Performance optimization utilities

### 4. Configuration (`src/lib/config.ts`)

Centralized configuration management:

- Environment variables
- API settings
- Application limits
- Feature flags
- Validation rules
- Error messages

## API Endpoints

### Resume API (`/api/resume`)

#### POST `/api/resume/parse`
Parses uploaded resume files and extracts structured data.

**Request:**
```typescript
FormData {
  file: File // PDF, DOC, or DOCX file
}
```

**Response:**
```typescript
{
  success: boolean;
  data: ResumeData;
  message: string;
  confidence: number;
  extractedFields: string[];
}
```

#### GET `/api/resume/templates`
Retrieves available resume templates.

**Response:**
```typescript
{
  success: boolean;
  data: ResumeTemplate[];
  message: string;
}
```

### Job Description API (`/api/jd`)

#### POST `/api/jd/generate`
Generates job descriptions using AI based on company profile and requirements.

**Request:**
```typescript
{
  companyProfile: string;
  requirements: string;
  industry?: string;
  level?: 'entry' | 'mid' | 'senior' | 'executive';
}
```

**Response:**
```typescript
{
  success: boolean;
  data: JDData;
  message: string;
  suggestions: string[];
  keywords: string[];
}
```

#### GET `/api/jd/templates`
Retrieves available job description templates.

### ATS API (`/api/ats`)

#### POST `/api/ats/score`
Calculates ATS compatibility score for a resume against a job description.

**Request:**
```typescript
{
  resumeData: ResumeData;
  jdText: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: ATSScore;
  message: string;
  recommendations: string[];
  optimizationTips: string[];
}
```

#### PUT `/api/ats/optimize`
Optimizes a resume for a specific job description using AI.

**Request:**
```typescript
{
  resumeData: ResumeData;
  jdText: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    optimizedResume: ResumeData;
    originalScore: ATSScore;
    optimizedScore: ATSScore;
    improvement: number;
  };
  message: string;
}
```

#### GET `/api/ats/keywords?text={text}`
Extracts keywords from provided text.

**Response:**
```typescript
{
  success: boolean;
  data: {
    keywords: string[];
    count: number;
    text: string;
  };
  message: string;
}
```

## Usage Examples

### Parsing a Resume

```typescript
import { BackendHandlers } from '@/lib/backend-handlers';

// Parse uploaded resume file
const resumeData = await BackendHandlers.resume.parseResumeFile(file);
console.log('Parsed resume:', resumeData);
```

### Generating a Job Description

```typescript
import { BackendHandlers } from '@/lib/backend-handlers';

const jdData = await BackendHandlers.jd.generateJobDescription(
  'Tech startup focused on AI solutions',
  'Looking for a senior developer with React and Python experience'
);
console.log('Generated JD:', jdData);
```

### Calculating ATS Score

```typescript
import { BackendHandlers } from '@/lib/backend-handlers';

const atsScore = BackendHandlers.ats.calculateATSScore(resumeData, jdText);
console.log('ATS Score:', atsScore.score);
console.log('Feedback:', atsScore.feedback);
```

### Optimizing a Resume

```typescript
import { BackendHandlers } from '@/lib/backend-handlers';

const optimizedResume = await BackendHandlers.ats.optimizeResumeForJD(
  resumeData,
  jdText
);
console.log('Optimized resume:', optimizedResume);
```

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=2000

# File Upload Limits
MAX_FILE_SIZE=10485760
MAX_FILES=5

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here
CORS_ORIGIN=http://localhost:3000

# Feature Flags
ENABLE_AI_GENERATION=true
ENABLE_FILE_UPLOAD=true
ENABLE_ATS_SCORING=true
ENABLE_RESUME_OPTIMIZATION=true
```

## Error Handling

The backend uses a custom `BackendError` class for consistent error handling:

```typescript
class BackendError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'BackendError';
  }
}
```

All API endpoints return standardized error responses:

```typescript
{
  success: false;
  error: string;
  statusCode?: number;
}
```

## Validation

The backend includes comprehensive validation for all inputs:

- **File validation**: Type, size, and format checking
- **Data validation**: Structure and content validation
- **Input sanitization**: XSS prevention and data cleaning
- **Business rule validation**: Application-specific validation rules

## Performance Features

- **Debouncing**: Prevents excessive API calls
- **Throttling**: Limits function execution frequency
- **Caching**: Configurable caching strategies
- **Async processing**: Non-blocking operations
- **Performance monitoring**: Execution time measurement

## Security Features

- **Input sanitization**: Prevents XSS attacks
- **File type validation**: Restricts uploads to safe formats
- **Rate limiting**: Prevents abuse
- **CORS configuration**: Controlled cross-origin access
- **Error masking**: Prevents information leakage

## Testing

The backend includes comprehensive error handling and validation that can be tested:

```typescript
// Test file validation
const validation = FileUtils.validateFile(file, allowedTypes, 10);
expect(validation.isValid).toBe(true);

// Test data validation
const validation = ValidationHandler.validateResumeData(resumeData);
expect(validation.isValid).toBe(true);
```

## Deployment

### Prerequisites
- Node.js 18+ 
- Next.js 13+ with App Router
- OpenAI API key

### Build and Deploy
```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring and Logging

The backend includes configurable logging and monitoring:

- **Log levels**: Debug, Info, Warn, Error
- **Log formats**: JSON, structured logging
- **Performance metrics**: Execution time tracking
- **Error tracking**: Comprehensive error logging
- **Audit trails**: User action logging

## Future Enhancements

- **Database integration**: MongoDB/PostgreSQL support
- **User authentication**: JWT-based auth system
- **File storage**: Cloud storage integration
- **Real-time processing**: WebSocket support
- **Advanced AI**: Fine-tuned models
- **Analytics**: Usage analytics and insights
- **Multi-language**: Internationalization support
- **Templates**: Advanced template system

## Support

For questions or issues with the backend implementation:

1. Check the error logs for detailed information
2. Verify environment variable configuration
3. Ensure all dependencies are properly installed
4. Check API rate limits and quotas
5. Review the validation rules and error messages

## License

This backend implementation is part of the Resume & JD Builder application and follows the same licensing terms.
