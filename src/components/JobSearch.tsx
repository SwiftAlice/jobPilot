'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Building, ExternalLink, Clock, DollarSign, User, Briefcase, Star, Globe, Briefcase as BriefcaseIcon } from 'lucide-react';
import { useResume } from '@/contexts/ResumeContext';
import { supabase } from '@/lib/supabaseClient';
import JobsYouLiked from './JobsYouLiked';
// import { toast } from 'react-hot-toast'; // COMMENTED OUT for linter

// Helper function to strip HTML and decode entities for card previews
const stripHtmlToPlainText = (html: string): string => {
  if (!html) return '';
  
  // Check if we're in browser environment
  if (typeof document === 'undefined') {
    // Fallback for SSR: basic regex-based stripping
    return html
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Create a temporary DOM element to parse HTML and extract text
  // This handles all HTML entities properly
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  
  // Get text content (automatically handles all HTML entities)
  let plainText = tmp.textContent || tmp.innerText || '';
  
  // Clean up extra whitespace
  plainText = plainText.replace(/\s+/g, ' ').trim();
  
  return plainText;
};

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
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [hiddenJobIds, setHiddenJobIds] = useState<string[]>([]);
  // Cache for loaded pages: Map<pageNumber, { jobs: JobPosting[], pagination: PaginationInfo }>
  const [jobsCache, setJobsCache] = useState<Map<number, { jobs: JobPosting[], pagination: any, total_found: number }>>(new Map());
  // Track search parameters to clear cache when they change
  const [lastSearchKey, setLastSearchKey] = useState<string>('');
  const [likedJobs, setLikedJobs] = useState<any[]>([]);
  const [recruitersOpen, setRecruitersOpen] = useState(false);
  const [recruitersLoading, setRecruitersLoading] = useState(false);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [recruiters, setRecruiters] = useState<Array<{ contact: any; templates: any; mailto: string }>>([]);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [gmailAuthenticated, setGmailAuthenticated] = useState(false);
  const [gmailTokens, setGmailTokens] = useState<any>(null);

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
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        if (mounted) setAuthEmail(data?.authenticated ? data.user?.email ?? null : null);
      } catch {
        if (mounted) setAuthEmail(null);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch liked jobs on mount and when actions change
  useEffect(() => {
    const fetchLikedJobs = async () => {
      try {
        const res = await fetch('/api/jobs/liked');
        const data = await res.json();
        setLikedJobs(data.liked || []);
      } catch (err) {
        console.error('Failed to fetch liked jobs:', err);
        setLikedJobs([]);
      }
    };
    fetchLikedJobs();
  }, [hiddenJobIds]); // Refresh when jobs are liked

  // Handle pagination - check cache first, only fetch if not cached
  useEffect(() => {
    // Only trigger if we have results (meaning a search has been performed)
    if (!results) return;
    
    // Don't trigger on initial mount or if page matches current results
    if (currentPage === results.pagination?.page && pageSize === results.pagination?.page_size) {
      return;
    }
    
    // Check if page size changed - if so, clear cache and refetch
    if (pageSize !== results.pagination?.page_size) {
      setJobsCache(new Map());
      setPaginationLoading(true);
      // Trigger search with current page
      const event = new Event('submit') as any;
      handleSearch(event);
      return;
    }
    
    // Check if current page is different from displayed page
    if (currentPage !== results.pagination?.page) {
      // Check if this page is already in cache
      const cachedPage = jobsCache.get(currentPage);
      if (cachedPage) {
        console.log(`[Cache] Loading page ${currentPage} from cache`);
        setPaginationLoading(false);
        setResults({
          ...results,
          jobs: cachedPage.jobs,
          pagination: cachedPage.pagination,
          total_found: cachedPage.total_found
        });
      } else {
        // Page not in cache, fetch from backend
        console.log(`[Cache] Page ${currentPage} not in cache, fetching from backend`);
        setPaginationLoading(true);
        const event = new Event('submit') as any;
        handleSearch(event);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Check if this is a new search (page 1) or just pagination
    // If page is 1, clear cache as it's a new search
    if (currentPage === 1) {
      setJobsCache(new Map());
      setResults(null);
    } else {
      // For pagination, we'll set paginationLoading instead
      setPaginationLoading(true);
    }

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
    
    // Create a search key to detect if search parameters changed
    const searchKey = JSON.stringify({
      keywords: requestBody.keywords,
      location: requestBody.location,
      skills: requestBody.skills,
      experience_level: requestBody.experience_level,
      where: requestBody.where,
      sources: requestBody.sources.sort()
    });
    
    // If search parameters changed (not just page), clear cache
    if (searchKey !== lastSearchKey && currentPage === 1) {
      console.log('[Cache] Search parameters changed, clearing cache');
      setJobsCache(new Map());
      setLastSearchKey(searchKey);
    } else if (currentPage === 1) {
      setLastSearchKey(searchKey);
    }
    
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
        
      // Cache the results for this page
      if (data.pagination && data.pagination.page) {
        setJobsCache(prev => {
          const newCache = new Map(prev);
          newCache.set(data.pagination.page, {
            jobs: data.jobs || [],
            pagination: data.pagination,
            total_found: data.total_found || 0
          });
          return newCache;
        });
        console.log(`[Cache] Cached page ${data.pagination.page} with ${data.jobs?.length || 0} jobs`);
      }
        
      setResults(data);
      if (data?.jobs?.length > 0) {
        setCompactMode(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setPaginationLoading(false);
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

  // Handler for liking a job
  const handleLikeJob = async (job: JobPosting) => {
    try {
      const jobPayload = {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        job_url: job.url,
        posted_at: job.posted_date || null,
        source: job.source,
        description: (job.description && job.description.trim()) || null
      };
      
      console.log('[Frontend] Saving job:', { 
        id: jobPayload.id, 
        title: jobPayload.title,
        posted_at: jobPayload.posted_at,
        has_description: !!jobPayload.description 
      });
      
      const response = await fetch('/api/jobs/like', {
        method: 'POST',
        body: JSON.stringify({ job: jobPayload }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to save job:', errorData.error);
        return;
      }
      
      setHiddenJobIds(ids => [...ids, job.id]);
      // Refresh liked jobs list after saving
      const likedRes = await fetch('/api/jobs/liked');
      const likedData = await likedRes.json();
      setLikedJobs(likedData.liked || []);
    } catch (err) {
      console.error('Error saving job:', err);
    }
  };

  const handleQuickLink = async (job: JobPosting) => {
    try {
      setSelectedJob(job);
      setRecruitersOpen(true);
      setRecruitersLoading(true);
      setRecruitersError(null);
      setRecruiters([]);

      // Count any action as like - await to ensure it completes
      await handleLikeJob(job);

      // Get candidate name from resume data or use a default
      const candidateName = resumeData?.personalInfo?.fullName || 'Candidate';
      
      const res = await fetch('/api/recruiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title, // API expects jobTitle, not title
          company: job.company,
          location: job.location || undefined,
          candidateName: candidateName, // Required field
          resumeData: resumeData || undefined, // Optional but helpful
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to fetch recruiters: ${res.status}`);
      }
      const data = await res.json();
      // API returns { success: true, data: [...] } or { success: false, error: ... }
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch recruiters');
      }
      // Extract the data array from the response
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.recruiters) ? data.recruiters : []);
      setRecruiters(list);
    } catch (e) {
      console.error('Error fetching recruiters:', e);
      setRecruitersError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRecruitersLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/jobs/liked')
      .then(res => res.json())
      .then(({ liked }) => setLikedJobs(liked || []));
  }, [results, hiddenJobIds]);

  // Check for Gmail tokens on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedTokens = localStorage.getItem('gmailTokens');
      if (storedTokens) {
        const tokens = JSON.parse(storedTokens);
        setGmailTokens(tokens);
        setGmailAuthenticated(true);
      }
    } catch (error) {
      console.error('Error loading stored Gmail tokens:', error);
    }
  }, []);

  const handleGmailAuth = async () => {
    try {
      const response = await fetch('/api/gmail/auth');
      const data = await response.json();
      
      if (data.success) {
        const popup = window.open(
          data.authUrl, 
          'gmailAuth', 
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );
        
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            const tokens = localStorage.getItem('gmailTokens');
            if (tokens) {
              setGmailTokens(JSON.parse(tokens));
              setGmailAuthenticated(true);
              alert('✅ Gmail authentication successful! You can now create drafts.');
            }
          }
        }, 1000);
        
        alert('✅ Gmail authentication popup opened. Complete the OAuth flow in the popup window.');
      }
    } catch (e) {
      console.error('Gmail auth error:', e);
      alert('Failed to authenticate with Gmail');
    }
  };

  const handleLinkedInOpen = (contact: any, templates: any) => {
    try {
      const personalizedMessage = templates.linkedinMessage;
      alert(`💼 LinkedIn Message Ready!\n\n📝 Pre-drafted message:\n\n"${personalizedMessage}"\n\n\nClick OK to open LinkedIn profile and send this message.`);
      const linkedinUrl = contact.linkedinUrl;
      window.open(linkedinUrl, '_blank');
    } catch (e) {
      console.error('Error opening LinkedIn:', e);
      window.open(contact.linkedinUrl, '_blank');
    }
  };

  const handleOpenGmail = (mailtoUrl: string) => {
    if (gmailAuthenticated) {
      // For now, just open mailto link. Full Gmail draft functionality can be added later if needed
      window.open(mailtoUrl, '_blank');
    } else {
      handleGmailAuth();
    }
  };

  return (
    <div className={`min-h-screen bg-white ${className}`}>
      <div className={`container-page ${likedJobs.length > 0 ? 'max-w-[800px]' : 'max-w-[1200px]'} mx-auto mt-16 md:mt-20 py-10 space-y-8 md:space-y-0 md:grid md:grid-cols-12 md:gap-8`}>
        <div className={likedJobs.length > 0 ? "md:col-span-9" : "md:col-span-12"}>
          <div className="shadow-lg rounded-xl bg-white px-8 py-8">
          {isPrefilled && resumeData && (
              <div className="flex items-center space-x-2 mb-4">
                <div className="flex items-center text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
                <User className="h-4 w-4 mr-1" />
                Pre-filled from resume
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
                    onChange={e => setSearchData(prev => ({ ...prev, keywords: e.target.value }))}
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
                    onChange={e => setSearchData(prev => ({ ...prev, location: e.target.value }))}
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
                    onChange={e => setSearchData(prev => ({ ...prev, where: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Any</option>
                <option value="remote">Remote</option>
              </select>
            </div>
          <div>
            <label htmlFor="skills" className="block text-sm font-medium text-gray-700 mb-1">
                    Your Skills
            </label>
                  <input
                    type="text"
              id="skills"
              value={searchData.skills}
                    onChange={e => setSearchData(prev => ({ ...prev, skills: e.target.value }))}
              placeholder="e.g., Python, React, AWS, Machine Learning"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
            <div>
                  <label htmlFor="experience_level" className="block text-sm font-medium text-gray-700 mb-1">
                Experience Level
              </label>
              <select
                    id="experience_level"
                value={searchData.experience_level}
                    onChange={e => setSearchData(prev => ({ ...prev, experience_level: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Any Level</option>
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="leadership">Leadership</option>
              </select>
            </div>
          </div>
              <button
                type="submit"
                className="w-full px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-teal-600"
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Search Jobs'}
              </button>
            </form>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700 mt-4">
                {error}
              </div>
            )}
            {results && Array.isArray(results.jobs) && results.jobs.length > 0 && (
              <div className="mt-8 space-y-4">
                {results.jobs
                  .filter(job => !hiddenJobIds.includes(job.id))
                  .map(job => (
                    <div key={job.id} className="p-4 mb-3 border rounded-xl shadow-md flex flex-col md:flex-row md:justify-between md:items-center bg-white">
                      <div className="md:max-w-[70%]">
                        <div className="font-bold text-lg">{job.title}</div>
                        <div className="text-gray-700">{job.company}, {job.location}</div>
                        <div className="text-gray-500 text-sm">{job.source} | {job.match_score && (Math.round(job.match_score * 100) + '% match')}</div>
                        {job.description && (
                          <p className="text-gray-600 text-sm mt-2">
                            {(() => {
                              // Strip HTML and get plain text for card preview
                              const plainText = stripHtmlToPlainText(job.description);
                              return plainText.length > 220 ? plainText.slice(0, 220) + '…' : plainText;
                            })()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2 md:mt-0">
                        <button
                          type="button"
                          className="px-4 py-2 rounded bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 shadow"
                          onClick={() => { 
                            // Open modal immediately, save in background
                            onJobSelect && onJobSelect(job);
                            // Don't await - let it save in background
                            handleLikeJob(job).catch(err => {
                              console.error('Background save failed (non-critical):', err);
                            });
                          }}
                        >Read More</button>
                        <button
                          type="button"
                          className="px-4 py-2 rounded bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow"
                          onClick={() => handleQuickLink(job)}
                        >Quick Link</button>
                      </div>
          </div>
                  ))}
                
                {/* Pagination Controls */}
                {results.pagination && (
                  <div className="mt-8 flex items-center justify-between border-t pt-6">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (results.pagination?.has_previous_page) {
                            setCurrentPage(prev => Math.max(1, prev - 1));
                          }
                        }}
                        disabled={!results.pagination?.has_previous_page || paginationLoading}
                        className={`px-4 py-2 rounded-md text-sm font-medium ${
                          results.pagination?.has_previous_page && !paginationLoading
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {results.pagination.page} of {results.pagination.total_pages || 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (results.pagination?.has_next_page) {
                            setCurrentPage(prev => prev + 1);
                          }
                        }}
                        disabled={!results.pagination?.has_next_page || paginationLoading}
                        className={`px-4 py-2 rounded-md text-sm font-medium ${
                          results.pagination?.has_next_page && !paginationLoading
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                    {paginationLoading && (
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Loading...
                      </div>
                    )}
                  </div>
                )}
      </div>
        )}
          </div>
        </div>
        {likedJobs.length > 0 && (
          <div className="hidden md:block md:col-span-3 pt-2">
            <JobsYouLiked jobs={likedJobs} onJobSelect={onJobSelect} />
        </div>
      )}
              </div>
      {/* Recruiter Modal - Full functionality like RecruiterOutreachButton */}
      {recruitersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRecruitersOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Recruiters for {selectedJob?.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{selectedJob?.company}{selectedJob?.location ? ` — ${selectedJob.location}` : ''}</p>
              </div>
                <button
                className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                onClick={() => setRecruitersOpen(false)}
              >Close</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {recruitersLoading && (
                <div className="py-12 text-center text-gray-600">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p>Finding recruiter contacts…</p>
                </div>
              )}
              {recruitersError && (
                <div className="py-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 mb-4">{recruitersError}</div>
              )}
              {!recruitersLoading && !recruitersError && recruiters.length === 0 && (
                <div className="border rounded-lg p-4 bg-gray-50 border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">🔍 No Recruiter Contacts Found</h3>
                  <p className="text-gray-700 text-sm mb-3">
                    We couldn't find any recruiter contacts for <strong>{selectedJob?.company}</strong>. This could be because:
                  </p>
                  <ul className="text-gray-700 text-sm space-y-1 mb-3">
                    <li>• The company doesn't have public recruiter information</li>
                    <li>• The company uses different job titles for recruiters</li>
                    <li>• The company's domain information isn't available</li>
                  </ul>
                </div>
              )}
              {!recruitersLoading && !recruitersError && recruiters.length > 0 && (
                <div className="space-y-4">
                  {recruiters.map((r: any, idx: number) => {
                    // Check if this is a domain not found result
                    if (r.contact?.source === 'domain-not-found') {
                      return (
                        <div key={idx} className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                          <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Company Domain Not Found</h3>
                          <p className="text-yellow-800 text-sm mb-3">
                            We couldn't find a domain for <strong>{selectedJob?.company}</strong>.
                          </p>
                        </div>
                      );
                    }
                    
                    // Regular contact display
                    return (
                      <div key={idx} className="border rounded-lg p-4 bg-white shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm text-gray-800">
                            <span className="font-semibold">{r.contact?.name || 'Recruiter'}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {r.contact?.confidence ? `${Math.round(r.contact.confidence * 100)}%` : ''}
                    </div>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          {r.contact?.title} @ {r.contact?.company}
                        </div>
                        <div className="text-xs text-gray-500 mb-3">
                          Source: {r.contact?.source}
                        </div>
                        {r.contact?.linkedinUrl && (
                          <div className="text-xs text-blue-700 mb-3">
                            <a href={r.contact.linkedinUrl} target="_blank" rel="noreferrer" className="underline">LinkedIn Profile</a>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap mb-3">
                          {r.mailto ? (
                            <button 
                              onClick={() => handleOpenGmail(r.mailto)}
                              className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                            >
                              {gmailAuthenticated ? 'Open Gmail' : 'Authenticate Gmail'}
                            </button>
                          ) : (
                            <div className="px-3 py-1.5 rounded bg-gray-400 text-white text-sm cursor-not-allowed" title="Email addresses not available">
                              Email Not Available
                  </div>
                )}
                          {!gmailAuthenticated && (
                            <button 
                              onClick={handleGmailAuth}
                              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                            >
                              Connect Gmail
                            </button>
                          )}
                          {gmailAuthenticated && (
                            <div className="px-3 py-1.5 rounded bg-green-100 text-green-700 text-sm">
                              ✅ Gmail Connected
                            </div>
                          )}
                          {r.contact?.linkedinUrl && (
                  <button
                              onClick={() => handleLinkedInOpen(r.contact, r.templates)}
                              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                              LinkedIn (Open Profile)
                  </button>
                          )}
                        </div>
                        <details className="mt-2">
                          <summary className="text-sm cursor-pointer text-gray-600 hover:text-gray-800">► Preview Messages</summary>
                          <div className="mt-3 space-y-3">
                            {r.templates?.subject && (
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Subject</div>
                                <div className="text-sm font-medium bg-gray-50 p-2 rounded">{r.templates.subject}</div>
                              </div>
                            )}
                            {r.templates?.emailBody && (
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Email Body</div>
                                <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded text-gray-700">{r.templates.emailBody}</pre>
                              </div>
                            )}
                            {r.templates?.linkedinMessage && (
                              <div>
                                <div className="text-xs text-gray-500 mb-1">LinkedIn Message</div>
                                <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded text-gray-700">{r.templates.linkedinMessage}</pre>
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
