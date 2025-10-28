'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Building, ExternalLink, Clock, DollarSign, User, Briefcase, Star, Globe, Briefcase as BriefcaseIcon } from 'lucide-react';
import { useResume } from '@/contexts/ResumeContext';

interface JobPosting {
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
}

interface JobSearchResult {
  jobs: JobPosting[];
  total_found: number;
  search_timestamp: string;
  sources_searched: string[];
  errors: string[];
  estimated_total?: number;
  pagination?: {
    page: number;
    page_size: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
  statistics?: {
    total_jobs: number;
    average_match_score: number;
    source_distribution: Record<string, number>;
    top_skills: [string, number][];
  };
}

interface JobSearchProps {
  onJobSelect?: (job: JobPosting) => void;
  className?: string;
}

export default function JobSearch({ onJobSelect, className = '' }: JobSearchProps) {
  const { resumeData, isLoading: resumeLoading } = useResume();
  
  // Utility function to deduplicate jobs by ID
  const deduplicateJobs = (jobs: JobPosting[]): JobPosting[] => {
    const seen = new Set<string>();
    const uniqueJobs: JobPosting[] = [];
    
    for (const job of jobs) {
      if (!seen.has(job.id)) {
        seen.add(job.id);
        uniqueJobs.push(job);
      } else {
        console.warn(`Duplicate job ID detected: ${job.id} - ${job.title}`);
      }
    }
    
    return uniqueJobs;
  };
  
  const [searchData, setSearchData] = useState({
    keywords: '',
    location: '',
    skills: '',
    experience_level: '',
    where: 'Remote',
    max_results: 50,
    sources: ['indeed', 'remoteok', 'adzuna', 'jooble', 'naukri', 'linkedin']
  });
  
  const [results, setResults] = useState<JobSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [sortOption, setSortOption] = useState<'match_desc' | 'match_asc' | 'matched_skills_desc' | 'requirements_asc' | 'source_priority'>('match_desc');
  const [minMatchFilter, setMinMatchFilter] = useState<'all' | '100' | '80' | '60'>('all');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Deterministic themed colors for skill pills (restricted to theme colors)
  const skillColorClasses = [
    'bg-teal-50 text-teal-700 border-teal-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-pink-50 text-pink-700 border-pink-200',
    'bg-green-50 text-green-700 border-green-200',
  ];

  const getSkillColorClass = (skill: string) => {
    const hash = Array.from(skill.toLowerCase())
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
    return skillColorClasses[hash % skillColorClasses.length];
  };

  // Pre-fill form with resume data
  useEffect(() => {
    if (resumeData && !isPrefilled && !resumeLoading) {
      const skills = resumeData.skills || [];
      const experience = resumeData.experience || [];
      const location = resumeData.personalInfo?.location || '';
      
      // Extract job titles from experience
      const jobTitles = experience.map(exp => exp.title).filter(Boolean);
      
      // Determine experience level based on years of experience
      let experienceLevel = '';
      if (experience.length > 0) {
        const totalYears = experience.reduce((total, exp) => {
          const startYear = new Date(exp.startDate).getFullYear();
          const endYear = exp.endDate ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
          return total + (endYear - startYear);
        }, 0);
        
        if (totalYears >= 9) {
          experienceLevel = 'leadership';
        } else if (totalYears >= 5) {
          experienceLevel = 'senior';
        } else if (totalYears >= 2) {
          experienceLevel = 'mid';
        } else {
          experienceLevel = 'entry';
        }
      }

      setSearchData(prev => ({
        ...prev,
        keywords: jobTitles.join(', '),
        location: location,
        skills: skills.join(', '),
        experience_level: experienceLevel,
      }));
      
      setIsPrefilled(true);
    }
  }, [resumeData, isPrefilled, resumeLoading]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Trigger search when pagination changes
  useEffect(() => {
    if (results && (currentPage !== results.pagination?.page || pageSize !== results.pagination?.page_size)) {
      // Always fetch from backend when navigating to new pages
      console.log(`Fetching page ${currentPage} from backend (current: ${results.pagination?.page}, size: ${results.pagination?.page_size})`);
      handleSearch(new Event('submit') as any);
    }
  }, [currentPage, pageSize]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    // Normalize location: pass empty string for Remote/Any
    const normalizedLocation = (searchData.where && searchData.where.toLowerCase() !== 'remote' && searchData.where.toLowerCase() !== 'any') 
      ? searchData.where 
      : '';

    const requestBody = {
      keywords: searchData.keywords.split(',').map(k => k.trim()).filter(k => k),
      // Don't send user's current location, only send where they want to search
      location: normalizedLocation,  // Use 'where' field for job search location
      skills: searchData.skills.split(',').map(s => s.trim()).filter(s => s),
      experience_level: searchData.experience_level || undefined,
      where: searchData.where || undefined,
      max_results: searchData.max_results,
      sources: searchData.sources,
      page: currentPage,
      page_size: pageSize
    };
    
    console.log('[Frontend] Sending search request:', requestBody);

    try {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      
      console.log('[Frontend] Received response:', {
        total_found: data.total_found,
        jobs_count: data.jobs?.length,
        pagination: data.pagination
      });
        
        // Deduplicate jobs to prevent React key conflicts
        if (data.jobs && Array.isArray(data.jobs)) {
          data.jobs = deduplicateJobs(data.jobs);
        }
        
      setResults(data);
      if (data?.jobs?.length > 0) {
        setCompactMode(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceToggle = (source: string) => {
    setSearchData(prev => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter(s => s !== source)
        : [...prev.sources, source]
    }));
  };

  const formatMatchScore = (score: number) => {
    return `${Math.round(score * 100)}%`;
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100';
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const hasJobs = !!(results && Array.isArray(results.jobs) && results.jobs.length > 0);

  // Pointer-follow glow for cards
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty('--mx', `${x}px`);
    target.style.setProperty('--my', `${y}px`);
  };
  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget as HTMLDivElement;
    target.style.removeProperty('--mx');
    target.style.removeProperty('--my');
  };

  return (
    <div className={`min-h-screen bg-white ${className}`}>
      {/* Header */}
      <header className="sticky top-0 z-50">
        <div className="container-page py-4">
          <div className="flex items-center justify-between h-16 rounded-xl bg-white/60 backdrop-blur-xl px-4 md:px-6">
            <Link href="/" className="flex items-center space-x-3">
              <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 p-1 flex items-center justify-center">
                <img src="/logo.svg" alt="JobPilot AI" width={1044} height={1044} />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="heading text-lg md:text-xl font-extrabold text-gray-900">
                  JobPilot <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-600">AI</span>
                </span>
                <span className="text-[10px] md:text-xs text-gray-500">Build · Tailor · Apply — on autopilot</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link href="/#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="/#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How it Works</Link>
              <Link href="/jobs" className="text-gray-600 hover:text-gray-900 transition-colors">Find Jobs</Link>
              <Link href="/jdBuilder" className="text-gray-600 hover:text-gray-900 transition-colors">Resume Builder</Link>
            </nav>

            <div className="flex items-center">
              <Link href="/jdBuilder" className="px-5 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-blue-600 to-teal-600 shadow-[0_10px_24px_rgba(59,130,246,0.25)] hover:shadow-[0_14px_30px_rgba(59,130,246,0.35)] hover:translate-y-[-1px] active:translate-y-[0px] transition-all">
                Build Resume
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* Explicit spacer to ensure separation below sticky header */}
      <div className="h-12 md:h-16"></div>

      <div className="container-page mt-16 md:mt-20 py-10 space-y-8">
        {/* Compact filter chips when results visible */}
        {hasJobs && compactMode && (
          <div className="transition-all duration-700 ease-in-out">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
              <button
                type="button"
                onClick={() => setCompactMode(false)}
                className="text-sm text-teal-600 hover:text-teal-700 underline"
              >
                Edit
              </button>
            </div>
            {/* Pills row matching reference layout */}
            <div className="flex flex-wrap gap-2">
              {/* Highlighted: Keywords */}
              {searchData.keywords && (
                <span className="px-4 py-1.5 rounded-full text-sm border bg-gradient-to-r from-blue-600 to-teal-500 text-white border-transparent">
                  {searchData.keywords}
                </span>
              )}
              {/* Neutral skills */}
              {searchData.skills && searchData.skills.split(',').map((raw, i) => {
                const s = raw.trim();
                return (
                  <span key={`${s}-${i}`} className={`px-4 py-1.5 rounded-full text-sm border bg-white text-gray-700 border-gray-300`}>
                    {s}
                  </span>
                );
              })}
              {/* Highlighted: Where */}
              {searchData.where && (
                <span className="px-4 py-1.5 rounded-full text-sm border bg-gradient-to-r from-blue-600 to-teal-500 text-white border-transparent">
                  {searchData.where === 'remote' ? 'Remote' : searchData.where}
                </span>
              )}
              {/* Highlighted: Location */}
              {searchData.location && (
                <span className="px-4 py-1.5 rounded-full text-sm border bg-gradient-to-r from-blue-600 to-teal-500 text-white border-transparent">
                  {searchData.location}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Search Form */}
        {!(hasJobs && compactMode) && (
        <div className="card anim-card p-6 md:p-8 transition-all duration-500 ease-in-out">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Search className="mr-2 h-6 w-6 text-blue-600" />
            Find Your Dream Job
          </h2>
          {isPrefilled && resumeData && (
            <div className="flex items-center space-x-2">
              <div className="flex items-center text-sm text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                <User className="h-4 w-4 mr-1" />
                Pre-filled from resume
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchData({
                    keywords: '',
                    location: '',
                    skills: '',
                    experience_level: '',
                    where: '',
                    max_results: 50,
                    sources: ['indeed', 'remoteok', 'adzuna', 'jooble', 'naukri', 'linkedin']
                  });
                  setIsPrefilled(false);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        
        {!resumeData && !resumeLoading && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-start">
              <Briefcase className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-blue-800">Pro Tip</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Create your resume first to automatically pre-fill job search fields with your skills, experience, and location.
                </p>
                <Link
                  href="/"
                  className="text-sm text-blue-600 hover:text-blue-800 underline mt-1 inline-block"
                >
                  Go to Resume Builder →
                </Link>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-1">
                Job Keywords
              </label>
              <input
                type="text"
                id="keywords"
                value={searchData.keywords}
                onChange={(e) => setSearchData(prev => ({ ...prev, keywords: e.target.value }))}
                placeholder="e.g., Software Engineer, Developer"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                id="location"
                value={searchData.location}
                onChange={(e) => setSearchData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Mumbai, Remote"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="where" className="block text-sm font-medium text-gray-700 mb-1">
                Where
              </label>
              <select
                id="where"
                value={searchData.where}
                onChange={(e) => setSearchData(prev => ({ ...prev, where: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="remote">Remote</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="skills" className="block text-sm font-medium text-gray-700 mb-1">
              Your Skills (comma-separated)
            </label>
            <textarea
              id="skills"
              value={searchData.skills}
              onChange={(e) => setSearchData(prev => ({ ...prev, skills: e.target.value }))}
              placeholder="e.g., Python, React, AWS, Machine Learning"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div>
              <label htmlFor="experience" className="block text-sm font-medium text-gray-700 mb-1">
                Experience Level
              </label>
              <select
                id="experience"
                value={searchData.experience_level}
                onChange={(e) => setSearchData(prev => ({ ...prev, experience_level: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any Level</option>
                <option value="entry">Entry Level (0-2 years)</option>
                <option value="mid">Mid Level (2-5 years)</option>
                <option value="senior">Senior Level (5+ years)</option>
                <option value="leadership">Leadership (9+ years)</option>
              </select>
            </div>
          </div>

          {/* Sources UI removed by request; still included in payload */}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-teal-600 shadow hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search Jobs
              </>
            )}
          </button>
          <div className="flex items-center justify-end pt-2">
            {hasJobs && (
              <button
                type="button"
                onClick={() => setCompactMode(true)}
                className="text-sm text-teal-600 hover:text-teal-700 underline"
              >
                Collapse filters
              </button>
            )}
          </div>
        </form>
      </div>
        )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Search Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Statistics */}
          {results.statistics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card anim-card p-5 text-center">
                <div className="text-sm text-gray-600 mb-1">Total Jobs</div>
                <div className="text-2xl font-bold text-purple-600">{results.estimated_total || results.total_found}</div>
              </div>
              <div className="card anim-card p-5 text-center">
                <div className="text-sm text-gray-600 mb-1">Avg Match Score</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatMatchScore(results.statistics.average_match_score)}
                </div>
              </div>
              <div className="card anim-card p-5 text-center">
                <div className="text-sm text-gray-600 mb-1">Sources Searched</div>
                <div className="text-2xl font-bold text-purple-600">{results.sources_searched.length}</div>
              </div>
              <div className="card anim-card p-5 text-center">
                <div className="text-sm text-gray-600 mb-1">Jobs Displayed</div>
                <div className="text-2xl font-bold text-blue-600">
                  {(() => {
                    const deduplicatedJobs = deduplicateJobs(results.jobs);
                    const filteredJobs = deduplicatedJobs
                      .filter((job) => {
                        const threshold = minMatchFilter === '100' ? 1.0 : minMatchFilter === '80' ? 0.8 : minMatchFilter === '60' ? 0.6 : 0.0;
                        return (job.match_score ?? 0) >= threshold;
                      });
                    return filteredJobs.length;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Sort + Quick Filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: '60', label: '60%+' },
                { key: '80', label: '80%+' },
                { key: '100', label: '100%' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMinMatchFilter(key as any)}
                  className={`px-3 py-1 rounded-full text-xs border ${minMatchFilter === key ? 'bg-gradient-to-r from-blue-600 to-teal-500 text-white border-transparent' : 'bg-white text-gray-700 border-gray-300'} `}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end">
              <label htmlFor="sort" className="mr-2 text-sm text-gray-600">Sort by</label>
              <select
                id="sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="match_desc">Best match (coverage %)</option>
                <option value="match_asc">Match (low to high)</option>
                <option value="matched_skills_desc">Most matched skills</option>
                <option value="requirements_asc">Fewest requirements</option>
                <option value="source_priority">Source priority</option>
              </select>
            </div>
          </div>

          {/* Job Listings */}
          <div className="space-y-3">
            {(() => {
              // First deduplicate all jobs to prevent React key conflicts
              const deduplicatedJobs = deduplicateJobs(results.jobs);
              
              const filteredJobs = deduplicatedJobs
              .filter((job) => {
                const threshold = minMatchFilter === '100' ? 1.0 : minMatchFilter === '80' ? 0.8 : minMatchFilter === '60' ? 0.6 : 0.0;
                  const passes = (job.match_score ?? 0) >= threshold;
                  // Debug logging
                  if (!passes) {
                    console.log(`Job "${job.title}" filtered out: match_score=${job.match_score}, threshold=${threshold}`);
                  }
                  return passes;
              })
              .sort((a, b) => {
                const sourceRank = (s: string) => {
                    const order = ['linkedin', 'naukri', 'instahyre', 'remoteok', 'remotejobs', 'foundit', 'monster', 'hrist', 'flexjobs', 'adzuna', 'jooble', 'google'];
                  const idx = order.indexOf((s || '').toLowerCase());
                  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
                };
                switch (sortOption) {
                  case 'match_asc':
                    return (a.match_score ?? 0) - (b.match_score ?? 0);
                  case 'matched_skills_desc':
                    return (b.skills_matched?.length ?? 0) - (a.skills_matched?.length ?? 0);
                  case 'requirements_asc':
                    return (a.skills_required?.length ?? 0) - (b.skills_required?.length ?? 0);
                  case 'source_priority':
                    return sourceRank(a.source) - sourceRank(b.source);
                  case 'match_desc':
                  default:
                    return (b.match_score ?? 0) - (a.match_score ?? 0);
                }
                });
              
              // Debug logging
              console.log(`========================================`);
              console.log(`[Frontend] Total jobs from backend: ${results.jobs.length}`);
              console.log(`[Frontend] Deduplicated jobs: ${deduplicatedJobs.length}`);
              console.log(`[Frontend] Filtered jobs (filter: ${minMatchFilter}): ${filteredJobs.length}`);
              console.log(`[Frontend] Current page: ${currentPage}`);
              console.log(`[Frontend] Page size: ${pageSize}`);
              console.log(`[Frontend] Results pagination:`, results.pagination);
              console.log(`========================================`);
              
              return filteredJobs.map((job) => (
              <div
                key={job.id}
                className="card card-hover anim-inward rounded-2xl p-6 md:p-7 border-emerald-100 cursor-pointer"
                onClick={() => onJobSelect?.(job)}
                onMouseMove={handleCardMouseMove}
                onMouseLeave={handleCardMouseLeave}
              >
                <div className="flex justify-between items-start mb-5">
                  <div className="flex-1 pr-4">
                    <h3 className="text-2xl font-semibold text-slate-900 mb-2">{job.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-gray-600 mb-2">
                      <span className="px-3 py-1 rounded-full text-xs bg-gray-100 border border-gray-200 flex items-center">
                        <Building className="h-3.5 w-3.5 mr-1" />
                        <span className="font-medium">{job.company}</span>
                      </span>
                      {job.location && (
                        <span className="flex items-center text-gray-600 text-xs">
                          <MapPin className="h-3.5 w-3.5 mr-1" />
                          {job.location}
                        </span>
                      )}
                      {/* Remote chip removed: only show explicit remote text if part of location/title from backend */}
                      {job.salary && (
                        <span className="px-3 py-1 rounded-full text-xs bg-gray-100 border border-gray-200 flex items-center">
                          <DollarSign className="h-3.5 w-3.5 mr-1" />
                          {job.salary}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                        {formatMatchScore(job.match_score)} overall match
                    </span>
                      <div className="flex gap-2 text-xs">
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                          Profile: {formatMatchScore(job.profile_score || 0)}
                        </span>
                        <span className="px-2 py-1 rounded bg-purple-100 text-purple-700">
                          Skills: {formatMatchScore(job.skill_score || 0)}
                    </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full bg-white text-gray-700 border border-gray-200 shadow-sm flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Star className="h-4 w-4" /> Save
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {job.description.substring(0, 200)}
                    {job.description.length > 200 && '...'}
                  </p>
                </div>

                {job.skills_required.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Required Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {job.skills_required.slice(0, 8).map((skill, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200"
                        >
                          {skill}
                        </span>
                      ))}
                      {job.skills_required.length > 8 && (
                        <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-500">
                          +{job.skills_required.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center gap-3">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-blue-600 to-teal-500 shadow hover:shadow-md hover:translate-y-[-1px] active:translate-y-[0px] transition-all"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Quick Apply
                  </a>
                  <button
                    type="button"
                    className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onJobSelect?.(job); }}
                  >
                    Read more
                  </button>
                </div>
              </div>
            ));
            })()}
          </div>

          {/* Pagination Controls */}
          {results.pagination && (results.pagination.total_pages > 1 || currentPage > 1) && (
            <div className="flex items-center justify-between mt-8 px-6 py-4 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {(() => {
                    const deduplicatedJobs = deduplicateJobs(results.jobs);
                    const filteredJobs = deduplicatedJobs
                      .filter((job) => {
                        const threshold = minMatchFilter === '100' ? 1.0 : minMatchFilter === '80' ? 0.8 : minMatchFilter === '60' ? 0.6 : 0.0;
                        return (job.match_score ?? 0) >= threshold;
                      });
                    const startIdx = (currentPage - 1) * results.pagination.page_size + 1;
                    const endIdx = filteredJobs.length > 0 ? startIdx + filteredJobs.length - 1 : startIdx - 1;
                    const totalJobs = results.estimated_total || results.total_found;
                    if (filteredJobs.length === 0) {
                      return `Showing ${startIdx} to ${startIdx - 1} of ${totalJobs}+ jobs (no matches)`;
                    }
                    return `Showing ${startIdx} to ${endIdx} of ${totalJobs}+ jobs`;
                  })()}
                </span>
                {(results as any).cached && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    ⚡ Cached
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (results.pagination?.has_previous_page) {
                      setCurrentPage(currentPage - 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      alert('You are already on the first page');
                    }
                  }}
                  disabled={!results.pagination.has_previous_page}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                
                <span className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
                  Page {currentPage} of {results.pagination.total_pages}
                </span>
                
                <button
                  onClick={async () => {
                    if (results.pagination?.has_next_page) {
                      // If we have cached data for the next page, just navigate
                      setCurrentPage(currentPage + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      // If no cached data, fetch more jobs
                      setPaginationLoading(true);
                      try {
                        // Normalize location for pagination
                        const normalizedLocation = (searchData.where && searchData.where.toLowerCase() !== 'remote' && searchData.where.toLowerCase() !== 'any') 
                          ? searchData.where 
                          : '';

                        const response = await fetch('/api/jobs/search', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            keywords: searchData.keywords.split(',').map(k => k.trim()).filter(k => k),
                            location: normalizedLocation,
                            skills: searchData.skills.split(',').map(s => s.trim()).filter(s => s),
                            where: searchData.where || undefined,
                            experience_level: searchData.experience_level || undefined,
                            max_results: searchData.max_results,
                            sources: searchData.sources,
                            page: currentPage + 1,
                            page_size: pageSize
                          })
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to fetch more jobs');
                        }
                        
                        const newResults = await response.json();
                        
                        // Deduplicate new results before processing
                        if (newResults.jobs && Array.isArray(newResults.jobs)) {
                          newResults.jobs = deduplicateJobs(newResults.jobs);
                        }
                        
                        // Check if we actually got new jobs
                        if (newResults.jobs && newResults.jobs.length > 0) {
                          // Merge new results with existing ones, removing duplicates
                          if (results && newResults.jobs) {
                            // Create a map of existing job IDs for quick lookup
                            const existingJobIds = new Set(results.jobs.map((job: JobPosting) => job.id));
                            
                            // Filter out duplicate jobs from new results
                            const uniqueNewJobs = newResults.jobs.filter((job: JobPosting) => !existingJobIds.has(job.id));
                            
                            console.log(`Fetched ${newResults.jobs.length} jobs, ${uniqueNewJobs.length} unique new jobs (${newResults.jobs.length - uniqueNewJobs.length} duplicates removed)`);
                            
                            if (uniqueNewJobs.length > 0) {
                              const allJobs = [...results.jobs, ...uniqueNewJobs];
                              const deduplicatedJobs = deduplicateJobs(allJobs);
                              
                              const updatedResults = {
                                ...newResults,
                                jobs: deduplicatedJobs,
                                total_found: Math.max(results.total_found, newResults.total_found),
                                estimated_total: Math.max(results.estimated_total || 0, newResults.estimated_total || 0)
                              };
                              setResults(updatedResults);
                            } else {
                              // All new jobs were duplicates, no more unique jobs available
                              alert('No more jobs available. You have reached the last page.');
                              return;
                            }
                          } else {
                            setResults(newResults);
                          }
                          
                          setCurrentPage(currentPage + 1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        } else {
                          // No more jobs available
                          alert('No more jobs available. You have reached the last page.');
                        }
                      } catch (err) {
                        console.error('Error fetching more jobs:', err);
                        alert('Failed to load more jobs. Please try again.');
                      } finally {
                        setPaginationLoading(false);
                      }
                    }
                  }}
                  disabled={paginationLoading || !results.pagination?.has_next_page}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-2"
                >
                  {paginationLoading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                      Loading...
                    </>
                  ) : (
                    'Next'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Load More Button */}
          {results.pagination && results.pagination.has_next_page && (
            <div className="text-center mt-6">
              <button
                onClick={async () => {
                  if (results.pagination?.has_next_page) {
                    // If we have cached data for the next page, just navigate
                    setCurrentPage(currentPage + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } else {
                    // If no cached data, fetch more jobs
                    setPaginationLoading(true);
                    try {
                      // Normalize location for Load More
                      const normalizedLocation = (searchData.where && searchData.where.toLowerCase() !== 'remote' && searchData.where.toLowerCase() !== 'any') 
                        ? searchData.where 
                        : '';

                      const response = await fetch('/api/jobs/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          keywords: searchData.keywords.split(',').map(k => k.trim()).filter(k => k),
                          location: normalizedLocation,
                          skills: searchData.skills.split(',').map(s => s.trim()).filter(s => s),
                          where: searchData.where || undefined,
                          experience_level: searchData.experience_level || undefined,
                          max_results: searchData.max_results,
                          sources: searchData.sources,
                          page: currentPage + 1,
                          page_size: pageSize
                        })
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to fetch more jobs');
                      }
                      
                      const newResults = await response.json();
                      
                      // Deduplicate new results before processing
                      if (newResults.jobs && Array.isArray(newResults.jobs)) {
                        newResults.jobs = deduplicateJobs(newResults.jobs);
                      }
                      
                      // Check if we actually got new jobs
                      if (newResults.jobs && newResults.jobs.length > 0) {
                        // Merge new results with existing ones, removing duplicates
                        if (results && newResults.jobs) {
                          // Create a map of existing job IDs for quick lookup
                          const existingJobIds = new Set(results.jobs.map((job: JobPosting) => job.id));
                          
                          // Filter out duplicate jobs from new results
                          const uniqueNewJobs = newResults.jobs.filter((job: JobPosting) => !existingJobIds.has(job.id));
                          
                          console.log(`Load More: Fetched ${newResults.jobs.length} jobs, ${uniqueNewJobs.length} unique new jobs (${newResults.jobs.length - uniqueNewJobs.length} duplicates removed)`);
                          
                          if (uniqueNewJobs.length > 0) {
                            const allJobs = [...results.jobs, ...uniqueNewJobs];
                            const deduplicatedJobs = deduplicateJobs(allJobs);
                            
                            const updatedResults = {
                              ...newResults,
                              jobs: deduplicatedJobs,
                              total_found: Math.max(results.total_found, newResults.total_found),
                              estimated_total: Math.max(results.estimated_total || 0, newResults.estimated_total || 0)
                            };
                            setResults(updatedResults);
                          } else {
                            // All new jobs were duplicates, no more unique jobs available
                            alert('No more jobs available. You have reached the last page.');
                            return;
                          }
                        } else {
                          setResults(newResults);
                        }
                        
                        setCurrentPage(currentPage + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      } else {
                        // No more jobs available
                        alert('No more jobs available. You have reached the last page.');
                      }
                    } catch (err) {
                      console.error('Error fetching more jobs:', err);
                      alert('Failed to load more jobs. Please try again.');
                    } finally {
                      setPaginationLoading(false);
                    }
                  }
                }}
                disabled={paginationLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {paginationLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Loading More Jobs...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Jobs</span>
                    <span className="text-sm opacity-75">({results.pagination.total_pages - currentPage} pages remaining)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {(() => {
            const deduplicatedJobs = deduplicateJobs(results.jobs);
            const filteredJobs = deduplicatedJobs
              .filter((job) => {
                const threshold = minMatchFilter === '100' ? 1.0 : minMatchFilter === '80' ? 0.8 : minMatchFilter === '60' ? 0.6 : 0.0;
                return (job.match_score ?? 0) >= threshold;
              });
            
            if (filteredJobs.length === 0) {
              return (
            <div className="text-center py-12">
              <div className="text-gray-500 text-lg">No jobs found matching your criteria</div>
              <div className="text-gray-400 text-sm mt-2">Try adjusting your search terms or location</div>
            </div>
              );
            }
            
            return null;
          })()}
        </div>
      )}

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 h-10 w-10 rounded-full bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-lg hover:shadow-xl transition-all"
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
      </div>
    </div>
  );
}
