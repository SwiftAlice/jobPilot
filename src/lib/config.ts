// Configuration file for Resume & JD Builder application

// Environment variables
export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
};

// API Configuration
export const API_CONFIG = {
  // OpenAI Configuration
  OPENAI: {
    API_KEY: process.env.OPENAI_API_KEY || '',
    MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
    TIMEOUT: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
  },

  // File Upload Configuration
  UPLOAD: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    ALLOWED_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    MAX_FILES: parseInt(process.env.MAX_FILES || '5'),
  },

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  // Hunter.io Configuration
  HUNTER_API_KEY: process.env.HUNTER_API_KEY || '',
  SERPAPI_KEY: process.env.SERPAPI_KEY || '',
  
  // Gmail API Configuration
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',

  // Security
  SECURITY: {
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
    SESSION_SECRET: process.env.SESSION_SECRET || 'your-session-secret',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};

// Application Configuration
export const APP_CONFIG = {
  // Resume Builder
  RESUME: {
    MAX_SKILLS: 20,
    MAX_EXPERIENCE_ITEMS: 10,
    MAX_EDUCATION_ITEMS: 5,
    MAX_PROJECT_ITEMS: 8,
    MAX_ACHIEVEMENT_ITEMS: 10,
    DEFAULT_TEMPLATE: 'professional',
    AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  },

  // Job Description Builder
  JD: {
    MAX_RESPONSIBILITIES: 15,
    MAX_REQUIREMENTS: 12,
    MAX_PREFERRED_SKILLS: 10,
    MAX_BENEFITS: 8,
    DEFAULT_EMPLOYMENT_TYPE: 'Full-time',
    DEFAULT_EXPERIENCE_LEVEL: 'Mid-level',
  },

  // ATS Scoring
  ATS: {
    MIN_SCORE: 30,
    MAX_SCORE: 95,
    EXCELLENT_THRESHOLD: 90,
    GOOD_THRESHOLD: 80,
    MODERATE_THRESHOLD: 70,
    POOR_THRESHOLD: 60,
    KEYWORD_MATCH_WEIGHT: 0.6,
    FORMAT_WEIGHT: 0.2,
    CONTENT_WEIGHT: 0.2,
  },

  // Templates
  TEMPLATES: {
    AVAILABLE: ['professional', 'modern', 'creative', 'minimal'],
    PREMIUM: ['creative', 'executive'],
    DEFAULT_CATEGORY: 'professional',
  },

  // Export Options
  EXPORT: {
    FORMATS: ['pdf', 'docx', 'json'],
    DEFAULT_FORMAT: 'pdf',
    MAX_PDF_SIZE: 'A4',
    INCLUDE_METADATA: true,
  },
};

// Database Configuration (if using a database)
export const DB_CONFIG = {
  // MongoDB (if using)
  MONGODB: {
    URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-builder',
    DATABASE: process.env.MONGODB_DATABASE || 'resume-builder',
    OPTIONS: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // PostgreSQL (if using)
  POSTGRES: {
    HOST: process.env.POSTGRES_HOST || 'localhost',
    PORT: parseInt(process.env.POSTGRES_PORT || '6543'),
    DATABASE: process.env.POSTGRES_DB || 'resume_builder',
    USERNAME: process.env.POSTGRES_USER || 'postgres',
    PASSWORD: process.env.POSTGRES_PASSWORD || '',
    SSL: process.env.POSTGRES_SSL === 'true',
  },
};

// Cache Configuration
export const CACHE_CONFIG = {
  REDIS: {
    URL: process.env.REDIS_URL || 'redis://localhost:6379',
    TTL: parseInt(process.env.REDIS_TTL || '3600'), // 1 hour
    MAX_MEMORY: process.env.REDIS_MAX_MEMORY || '100mb',
  },

  MEMORY: {
    MAX_SIZE: parseInt(process.env.MEMORY_CACHE_MAX_SIZE || '100'),
    TTL: parseInt(process.env.MEMORY_CACHE_TTL || '1800000'), // 30 minutes
  },
};

// Logging Configuration
export const LOG_CONFIG = {
  LEVEL: process.env.LOG_LEVEL || 'info',
  FORMAT: process.env.LOG_FORMAT || 'json',
  OUTPUT: process.env.LOG_OUTPUT || 'console',
  FILE_PATH: process.env.LOG_FILE_PATH || './logs/app.log',
  MAX_SIZE: process.env.LOG_MAX_SIZE || '10m',
  MAX_FILES: process.env.LOG_MAX_FILES || '5',
};

// Feature Flags
export const FEATURES = {
  AI_GENERATION: process.env.ENABLE_AI_GENERATION !== 'false',
  FILE_UPLOAD: process.env.ENABLE_FILE_UPLOAD !== 'false',
  ATS_SCORING: process.env.ENABLE_ATS_SCORING !== 'false',
  RESUME_OPTIMIZATION: process.env.ENABLE_RESUME_OPTIMIZATION !== 'false',
  MULTI_LANGUAGE: process.env.ENABLE_MULTI_LANGUAGE === 'true',
  PREMIUM_FEATURES: process.env.ENABLE_PREMIUM_FEATURES === 'true',
  ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
  EXPORT_FEATURES: process.env.ENABLE_EXPORT_FEATURES !== 'false',
};

// Validation Rules
export const VALIDATION_RULES = {
  PERSONAL_INFO: {
    FULL_NAME: { minLength: 2, maxLength: 100 },
    EMAIL: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    PHONE: { pattern: /^[\+]?[1-9][\d]{0,15}$/ },
    LOCATION: { minLength: 2, maxLength: 100 },
    LINKEDIN: { pattern: /^https?:\/\/[^\s/$.?#].[^\s]*$/i },
    WEBSITE: { pattern: /^https?:\/\/[^\s/$.?#].[^\s]*$/i },
    SUMMARY: { minLength: 50, maxLength: 500 },
  },

  EXPERIENCE: {
    TITLE: { minLength: 2, maxLength: 100 },
    COMPANY: { minLength: 2, maxLength: 100 },
    LOCATION: { minLength: 2, maxLength: 100 },
    DESCRIPTION: { minLength: 10, maxLength: 200 },
    DATE_FORMAT: { pattern: /^\d{4}-\d{2}$/ },
  },

  EDUCATION: {
    DEGREE: { minLength: 2, maxLength: 100 },
    INSTITUTION: { minLength: 2, maxLength: 100 },
    LOCATION: { minLength: 2, maxLength: 100 },
    YEAR: { pattern: /^\d{4}$/ },
    GPA: { pattern: /^[0-4]\.\d{1,2}$/ },
  },

  SKILLS: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 50,
    MAX_COUNT: 20,
  },

  PROJECTS: {
    NAME: { minLength: 2, maxLength: 100 },
    DESCRIPTION: { minLength: 10, maxLength: 300 },
    TECHNOLOGIES: { maxCount: 10 },
    LINK: { pattern: /^https?:\/\/[^\s/$.?#].[^\s]*$/i },
  },
};

// Error Messages
export const ERROR_MESSAGES = {
  VALIDATION: {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_PHONE: 'Please enter a valid phone number',
    INVALID_URL: 'Please enter a valid URL',
    INVALID_DATE: 'Please enter a valid date (YYYY-MM)',
    TOO_SHORT: 'This field is too short',
    TOO_LONG: 'This field is too long',
    INVALID_FORMAT: 'Invalid format',
  },

  FILE_UPLOAD: {
    NO_FILE: 'No file provided',
    INVALID_TYPE: 'File type not supported',
    TOO_LARGE: 'File size too large',
    UPLOAD_FAILED: 'File upload failed',
    PARSE_FAILED: 'File parsing failed',
  },

  AI_GENERATION: {
    API_ERROR: 'AI service temporarily unavailable',
    QUOTA_EXCEEDED: 'AI generation quota exceeded',
    INVALID_PROMPT: 'Invalid generation prompt',
    GENERATION_FAILED: 'Content generation failed',
  },

  ATS_SCORING: {
    INSUFFICIENT_DATA: 'Insufficient data for ATS scoring',
    SCORING_FAILED: 'ATS scoring failed',
    OPTIMIZATION_FAILED: 'Resume optimization failed',
  },

  GENERAL: {
    SERVER_ERROR: 'Internal server error',
    NETWORK_ERROR: 'Network error',
    TIMEOUT_ERROR: 'Request timeout',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    NOT_FOUND: 'Resource not found',
  },
};

// Success Messages
export const SUCCESS_MESSAGES = {
  RESUME: {
    CREATED: 'Resume created successfully',
    UPDATED: 'Resume updated successfully',
    DELETED: 'Resume deleted successfully',
    EXPORTED: 'Resume exported successfully',
    OPTIMIZED: 'Resume optimized successfully',
  },

  JD: {
    CREATED: 'Job description created successfully',
    UPDATED: 'Job description updated successfully',
    DELETED: 'Job description deleted successfully',
    GENERATED: 'Job description generated successfully',
  },

  FILE: {
    UPLOADED: 'File uploaded successfully',
    PARSED: 'File parsed successfully',
    PROCESSED: 'File processed successfully',
  },

  AI: {
    CONTENT_GENERATED: 'Content generated successfully',
    OPTIMIZATION_COMPLETE: 'Optimization completed successfully',
  },
};

// Export all configurations
export const CONFIG = {
  ENV,
  API: API_CONFIG,
  APP: APP_CONFIG,
  DB: DB_CONFIG,
  CACHE: CACHE_CONFIG,
  LOG: LOG_CONFIG,
  FEATURES,
  VALIDATION: VALIDATION_RULES,
  ERRORS: ERROR_MESSAGES,
  SUCCESS: SUCCESS_MESSAGES,
};

export default CONFIG;
