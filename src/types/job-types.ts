export interface JobPosting {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source: string;
  posted_date?: string;
  salary?: string;
  employment_type?: string;
  experience_level?: string;
  skills_required: string[];
  skills_matched: string[];
  match_score: number;
  profile_score?: number;
  skill_score?: number;
  raw_data?: Record<string, unknown>;
}

export interface JobSearchQuery {
  keywords: string[];
  location: string;
  skills: string[];
  experience_level?: string;
  employment_type?: string;
  salary_range?: [number, number];
  max_results: number;
  sources: string[];
  page?: number;
  page_size?: number;
}

export interface JobSearchResult {
  query: JobSearchQuery;
  jobs: JobPosting[];
  total_found: number;
  estimated_total?: number;
  search_timestamp: string;
  sources_searched: string[];
  errors: string[];
  statistics?: JobStatistics;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export interface JobStatistics {
  total_jobs: number;
  average_match_score: number;
  source_distribution: Record<string, number>;
  match_score_distribution: {
    'high (0.8-1.0)': number;
    'medium (0.5-0.8)': number;
    'low (0.0-0.5)': number;
  };
  top_companies: [string, number][];
  top_skills: [string, number][];
}

export interface SkillMatch {
  skill: string;
  category: string;
  match_type: 'exact' | 'partial' | 'synonym';
  confidence: number;
  job_requirement: string;
  user_skill: string;
}

export interface JobSource {
  id: string;
  name: string;
  enabled: boolean;
}

export interface JobSearchFilters {
  min_match_score: number;
  max_results: number;
  sources: string[];
  experience_levels: string[];
  employment_types: string[];
  salary_range: [number, number];
}
