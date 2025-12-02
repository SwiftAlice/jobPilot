// Core data types for Resume & JD Builder application

// Personal Information
export interface PersonalInfo {
  fullName: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
}

// Professional Experience
export interface Experience {
  id: number;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
}

// Education
export interface Education {
  id: number;
  degree: string;
  institution: string;
  location: string;
  year: string;
  gpa: string;
}

// Project
export interface Project {
  id: number;
  name: string;
  description: string;
  technologies: string[];
  link: string;
}

// Complete Resume Data
export interface ResumeData {
  personalInfo: PersonalInfo;
  experience: Experience[];
  education: Education[];
  skills: string[];
  projects: Project[];
  achievements: string[];
}

// Job Description Data
export interface JDData {
  jobTitle: string;
  company: string;
  department: string;
  location: string;
  employmentType: string;
  experienceLevel: string;
  salary: string;
  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  benefits: string[];
  companyInfo: string;
}

// ATS Score Result
export interface ATSScore {
  score: number;
  feedback: string;
  matchedKeywords?: string[];
  missingKeywords?: string[];
}

// File Upload Types
export interface UploadedFiles {
  resume: File | null;
  profile: File | null;
}

// Resume Generation Options
export interface ResumeGenerationOptions {
  type: 'generic' | 'jd-specific';
  jdText?: string;
  profile: string;
  skills: string[];
  template?: string;
}

// JD Generation Options
export interface JDGenerationOptions {
  companyProfile: string;
  requirements: string;
  industry?: string;
  level?: 'entry' | 'mid' | 'senior' | 'executive';
}

// API Response Types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ResumeParseResponse extends APIResponse<ResumeData> {
  confidence?: number;
  extractedFields?: string[];
}

export interface JDGenerateResponse extends APIResponse<JDData> {
  suggestions?: string[];
  keywords?: string[];
}

export interface ATSScoreResponse extends APIResponse<ATSScore> {
  recommendations?: string[];
  optimizationTips?: string[];
}

// Form Data Types
export interface ResumeFormData {
  personalInfo: Partial<PersonalInfo>;
  experience: Partial<Experience>[];
  education: Partial<Education>[];
  skills: string[];
  projects: Partial<Project>[];
  achievements: string[];
}

export interface JDFormData {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  experienceLevel: string;
  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface FieldValidation {
  field: string;
  isValid: boolean;
  error?: string;
  value: unknown;
}

// Export/Import Types
export interface ExportOptions {
  format: 'pdf' | 'docx' | 'json';
  template?: string;
  includeMetadata?: boolean;
}

export interface ImportOptions {
  format: 'pdf' | 'docx' | 'json';
  overwrite?: boolean;
  merge?: boolean;
}

// AI Generation Types
export interface AIGenerationRequest {
  prompt: string;
  context?: string;
  maxTokens?: number;
  model?: string;
}

export interface AIGenerationResponse {
  content: string;
  tokens: number;
  model: string;
  confidence?: number;
}

// Resume Template Types
export interface ResumeTemplate {
  id: string;
  name: string;
  category: 'professional' | 'creative' | 'minimal' | 'modern';
  preview: string;
  css: string;
  sections: string[];
  isPremium: boolean;
}

// User Preferences
export interface UserPreferences {
  defaultTemplate: string;
  autoSave: boolean;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  currency: string;
  dateFormat: string;
}

// Analytics and Tracking
export interface ResumeAnalytics {
  views: number;
  downloads: number;
  atsScores: number[];
  lastUpdated: Date;
  version: number;
}

export interface UserActivity {
  action: 'create' | 'edit' | 'export' | 'share' | 'delete';
  timestamp: Date;
  resumeId?: string;
  details?: Record<string, unknown>;
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
}

// Success Types
export interface SuccessMessage {
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

// All types are already exported above
