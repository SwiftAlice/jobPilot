// Types for Resume and Job Description Builder

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
}

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

export interface Education {
  id: number;
  degree: string;
  institution: string;
  location: string;
  year: string;
  gpa: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  technologies: string[];
  link: string;
}

export interface ResumeData {
  personalInfo: PersonalInfo;
  experience: Experience[];
  education: Education[];
  skills: string[];
  projects: Project[];
  achievements: string[];
}

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

export interface ATSScore {
  score: number;
  feedback: string;
  matchedKeywords?: string[];
  missingKeywords?: string[];
}

export interface UploadedFiles {
  resume: File | null;
  profile: File | null;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  category: 'modern' | 'classic' | 'creative' | 'minimal' | 'ats';
  atsOptimized: boolean;
  colorScheme: string;
  icon: string;
}
