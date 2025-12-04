'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Building, ExternalLink, Clock, DollarSign, User, Briefcase, Star, Globe, Briefcase as BriefcaseIcon, Trash2 } from 'lucide-react';
import { useResume } from '@/contexts/ResumeContext';
import { supabase } from '@/lib/supabaseClient';
import JobsYouLiked from './JobsYouLiked';
import ResumePreview from './ResumePreview';
import { generatePDFFromDom } from '@/lib/pdf-utils';
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
  last_match_score?: number;
  score?: number;
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

const computeResumeSignature = (resume: any | null): string => {
  if (!resume) return '';
  try {
    const summary = (resume.personalInfo?.summary || '').trim();
    const skills = Array.isArray(resume.skills) ? resume.skills.join('|') : '';
    const exp = Array.isArray(resume.experience)
      ? resume.experience
          .map((role: any) => `${role?.title || ''}|${role?.company || ''}|${role?.startDate || ''}|${role?.endDate || ''}`)
          .join('||')
      : '';
    const projects = Array.isArray(resume.projects)
      ? resume.projects.map((p: any) => `${p?.name || ''}|${(p?.technologies || []).join('&')}`).join('||')
      : '';
    return `${summary}##${skills}##${exp}##${projects}`;
  } catch {
    return '';
  }
};

const getLocalStorageItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setLocalStorageItem = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export default function JobSearch({ onJobSelect, className = '' }: JobSearchProps) {
  const { resumeData, isLoading: resumeLoading } = useResume();
  const USE_CACHE = false; // caching disabled for now
  const resumeSignature = useMemo(() => computeResumeSignature(resumeData), [resumeData]);
  const prefFilledSignatureRef = useRef<string | null>(null);
  const KEYWORD_SIGNATURE_STORAGE_KEY = 'jobpilot_keywords_signature';
  const KEYWORD_LIST_STORAGE_KEY = 'jobpilot_keywords_cached';
  
  // Build fallback smart keywords (no titles) from resume data when LLM is unavailable
  const buildFallbackKeywords = (where: string, experienceLevel: string): string[] => {
    try {
      const skills: string[] = (resumeData?.skills || []).map((s: string) => String(s).toLowerCase().trim());
      const techs: string[] = (resumeData?.projects || [])
        .flatMap((p: any) => Array.isArray(p?.technologies) ? p.technologies : [])
        .map((t: string) => String(t).toLowerCase().trim());
      const summaryTerms: string[] = String(resumeData?.personalInfo?.summary || '')
        .toLowerCase()
        .split(/[^a-z0-9+]+/)
        .filter(Boolean)
        .filter(w => w.length > 2);
      const genericStop = new Set(['and','with','for','the','a','an','in','on','of','to','from','by','at','this','that','these','those','work','role','team','project','company','years','year']);
      const bag = new Set<string>();
      [...skills, ...techs, ...summaryTerms].forEach(tok => {
        if (!genericStop.has(tok)) bag.add(tok);
      });
      let out = Array.from(bag).slice(0, 16);
      if ((where || '').toLowerCase().includes('remote') && !out.includes('remote')) out = [...out, 'remote'];
      return out;
    } catch {
      return [];
    }
  };
  
  // Utility function to deduplicate jobs across sources/pages
  const deduplicateJobs = (jobs: JobPosting[]): JobPosting[] => {
    const seen = new Set<string>();
    const uniqueJobs: JobPosting[] = [];
    for (const job of jobs) {
      const src = (job as any).source || '';
      const extFromId = (job.id || '').split('_').slice(1).join('_');
      const url = (job as any).url || '';
      const extFromUrl = url ? url.split('/').pop()?.split('?')[0] || '' : '';
      const key = `${src}|${extFromId || extFromUrl || job.id}`;
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueJobs.push(job);
      }
    }
    return uniqueJobs;
  };
  
  const [searchData, setSearchData] = useState({
    keywords: '',
    location: '',
    skills: '',
    experience_level: '',
    where: '',  // Default to "Any" (empty string) instead of "Remote"
    max_results: 500,  // Increased to show all jobs (was 50)
    // Enable all job sources by default
    sources: ['remoteok', 'adzuna', 'jooble', 'linkedin', 'iimjobs']
  });
  
  const [results, setResults] = useState<JobSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<{total_in_db: number, last_updated: string | null} | null>(null);
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [sortOption, setSortOption] = useState<'match_desc' | 'match_asc' | 'matched_skills_desc' | 'requirements_asc' | 'source_priority'>('match_desc');
  const [minMatchFilter, setMinMatchFilter] = useState<'all' | '100' | '80' | '60'>('all');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState<boolean>(false);
  const [hiddenJobIds, setHiddenJobIds] = useState<string[]>([]);
  // Quick filters: Set of active filter keys (e.g., "keyword:python", "location:Bangalore", "remote")
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<string>>(new Set());
  // Sort by option: 'overall' | 'skills' | 'recency' | 'location'
  const [sortBy, setSortBy] = useState<'overall' | 'skills' | 'recency' | 'location'>('overall');
  // Cache for loaded pages: Map<pageNumber, { jobs: JobPosting[], pagination: PaginationInfo }>
  const [jobsCache, setJobsCache] = useState<Map<number, { jobs: JobPosting[], pagination: any, total_found: number }>>(new Map());
  // Track search parameters to clear cache when they change
  const [lastSearchKey, setLastSearchKey] = useState<string>('');
  // Transient bottom notice for pagination end
  const [noMoreJobsToast, setNoMoreJobsToast] = useState(false);
  // Cache of city aliases fetched from backend for user's location
  const [locationAliasCache, setLocationAliasCache] = useState<Record<string, string[]>>({});
  // Form visibility: hide when jobs appear, show when "Edit details" is clicked
  const [showForm, setShowForm] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);
  const [formHeight, setFormHeight] = useState<number | 'auto'>('auto');
  const [refreshingKeywords, setRefreshingKeywords] = useState(false);
  
  // Measure form height when it's shown
  useEffect(() => {
    if (showForm && formRef.current) {
      const height = formRef.current.scrollHeight;
      setFormHeight(height);
    } else if (!showForm) {
      // Set to 0 when hiding
      setFormHeight(0);
    }
  }, [showForm]);
  
  // Auto-hide form when jobs appear
  useEffect(() => {
    if (results && Array.isArray(results.jobs) && results.jobs.length > 0) {
      setShowForm(false);
    }
  }, [results]);
  // When user's location changes, fetch aliases once
  useEffect(() => {
    const loc = (searchData.location || '').trim();
    if (!loc) return;
    const city = loc.split(',')[0]?.trim().toLowerCase();
    if (!city) return;
    if (locationAliasCache[city]) return;
    const aliasApiBase = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || '';
    const aliasUrl = aliasApiBase
      ? `${aliasApiBase}/api/geo/city-aliases?city=${encodeURIComponent(city)}`
      : `/api/geo/city-aliases?city=${encodeURIComponent(city)}`;
    fetch(aliasUrl)
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.aliases)) {
          setLocationAliasCache(prev => ({ ...prev, [city]: data.aliases }));
          // Debug
          try { console.log('[QuickFilters] Aliases for city', city, data.aliases); } catch {}
        }
      })
      .catch(err => {
        try { console.warn('[QuickFilters] Alias fetch failed', err); } catch {}
      });
  }, [searchData.location]); 
  const [likedJobs, setLikedJobs] = useState<any[]>([]);
  const [recruitersOpen, setRecruitersOpen] = useState(false);
  const [recruitersLoading, setRecruitersLoading] = useState(false);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [recruiters, setRecruiters] = useState<Array<{ contact: any; templates: any; mailto: string }>>([]);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [gmailAuthenticated, setGmailAuthenticated] = useState(false);
  const [gmailTokens, setGmailTokens] = useState<any>(null);
  const keywordsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (resumeData && resumeSignature && prefFilledSignatureRef.current === resumeSignature) {
      return;
    }
    if (resumeData && !resumeLoading && authResolved) {
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
      console.log('[Frontend] Smart keywords fetch (checking saved first)');
      const storedSignature = getLocalStorageItem(KEYWORD_SIGNATURE_STORAGE_KEY);

      // Check saved keywords first, then agent if needed
      (async () => {
        try {
          // 1) Try saved keywords for this user
          if (authUserId && storedSignature && storedSignature === resumeSignature) {
            const savedResp = await fetch(`/api/user/keywords?user_id=${encodeURIComponent(authUserId)}`, { cache: 'no-store' });
            const savedJson = await savedResp.json();
            const saved = Array.isArray(savedJson?.keywords) ? savedJson.keywords : [];
            if (saved.length > 0) {
              setSearchData(prev => ({ ...prev, keywords: saved.join(', ') }));
              prefFilledSignatureRef.current = resumeSignature;
              setLocalStorageItem(KEYWORD_LIST_STORAGE_KEY, JSON.stringify(saved));
      setIsPrefilled(true);
              console.log('[Frontend] Using saved keywords:', saved);
              return;
            }
          }
          // 2) No saved keywords; call agent
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
          const targetKeywordHints = jobTitles;
          const kwResp = await fetch('/api/keywords-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resume: resumeData || {},
              where: '',  // Default to "Any" (empty string)
              experience_level: experienceLevel,
              target_keywords: targetKeywordHints,
              resume_signature: resumeSignature
            }),
            cache: 'no-store',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (kwResp.ok) {
            const kwJson = await kwResp.json();
            const finalKeywords = Array.isArray(kwJson?.finalKeywords) ? kwJson.finalKeywords : [];
            if (finalKeywords.length > 0) {
              setSearchData(prev => ({ ...prev, keywords: finalKeywords.join(', ') }));
              // Save agent-generated keywords
              if (authUserId) {
                await fetch('/api/user/keywords', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: authUserId, keywords: finalKeywords })
                }).catch(e => console.warn('[Frontend] Failed to save keywords:', e));
              }
                prefFilledSignatureRef.current = resumeSignature;
                setLocalStorageItem(KEYWORD_SIGNATURE_STORAGE_KEY, resumeSignature || '');
                setLocalStorageItem(KEYWORD_LIST_STORAGE_KEY, JSON.stringify(finalKeywords));
            } else {
              const fallback = buildFallbackKeywords('Remote', experienceLevel);
              if (fallback.length > 0) setSearchData(prev => ({ ...prev, keywords: fallback.join(', ') }));
            }
            console.log('[Frontend] Agent keywords:', finalKeywords);
          }
        } catch (e: any) {
          const fallback = buildFallbackKeywords('Remote', experienceLevel);
          if (fallback.length > 0) setSearchData(prev => ({ ...prev, keywords: fallback.join(', ') }));
          console.warn('[Frontend] Keywords fetch failed; using fallback');
        }
        prefFilledSignatureRef.current = resumeSignature;
        setIsPrefilled(true);
      })();
    }
  }, [resumeData, resumeSignature, resumeLoading, authUserId, authResolved]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        if (mounted) {
          setAuthEmail(data?.authenticated ? data.user?.email ?? null : null);
          setAuthUserId(data?.authenticated ? (data.user?.id ?? null) : null);
        }
      } catch {
        if (mounted) {
          setAuthEmail(null);
          setAuthUserId(null);
        }
      } finally {
        if (mounted) setAuthResolved(true);
      }
    };
    load();
    
    return () => {
      mounted = false;
    };
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
    // If no results and we're on page 1, don't auto-fetch (let user trigger search)
    if (!results && currentPage === 1) return;
    
    // If we have results and we're already on the correct page, do nothing
    if (results && currentPage === results.pagination?.page && pageSize === results.pagination?.page_size) return;
    
    // If page size changed, clear cache and refetch
    if (pageSize !== results?.pagination?.page_size) {
      setJobsCache(new Map());
      setPaginationLoading(true);
      const event = new Event('submit') as any;
      handleSearch(event);
      return;
    }
    
    // If page changed, try cache first, then fetch
    // Always check cache for pagination (even if USE_CACHE is false for other features)
    const cachedPage = jobsCache.get(currentPage);
    if (cachedPage) {
      console.log(`[Cache] ✅ Loading page ${currentPage} from cache (${cachedPage.jobs?.length || 0} jobs)`);
      setPaginationLoading(false);
      setResults({
        jobs: cachedPage.jobs,
        pagination: cachedPage.pagination,
        total_found: cachedPage.total_found,
        search_timestamp: results?.search_timestamp || new Date().toISOString(),
        sources_searched: results?.sources_searched || [],
        errors: results?.errors || [],
        ...(results?.statistics ? { statistics: results.statistics } : {}),
        ...(results?.estimated_total !== undefined ? { estimated_total: results.estimated_total } : {})
      });
      return;
    }
    
    // Cache miss - need to fetch
    if (results && currentPage !== results.pagination?.page) {
      console.log(`[Cache] ❌ Cache miss for page ${currentPage}; fetching from backend`);
      setPaginationLoading(true);
      // Don't clear results when paginating - preserve existing jobs while loading
      // Only clear if it's a completely new search (handled in handleSearch)
      const event = new Event('submit') as any;
      handleSearch(event);
    } else if (!results && currentPage !== 1) {
      // If no results but we're trying to go to a different page, fetch it
      console.log(`[Cache] ❌ No cache for page ${currentPage} and no results; fetching from backend`);
      setPaginationLoading(true);
      const event = new Event('submit') as any;
      handleSearch(event);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProgress(5);
    let progTimer: NodeJS.Timeout | null = null;
    // Track seen job IDs across pages for the current search to detect "no more jobs"
    // Reset when search params change (handled below via lastSearchKey)
    const seenIdsRef = (window as any).__JOB_SEEN_IDS__ as React.MutableRefObject<Set<string>> | undefined;
    if (!seenIdsRef) {
      (window as any).__JOB_SEEN_IDS__ = { current: new Set<string>() };
    }
    const seenIds = ((window as any).__JOB_SEEN_IDS__ as { current: Set<string> }).current;
    try {
      // Smoothly increase to 90% while waiting for network
      progTimer = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 1 : 90));
      }, 120);
    } catch {}
    setError(null);
    
    // Check if this is a new search (page 1) or just pagination
    // Only clear results if search parameters actually changed (not just page navigation)
    // Check if search key changed to determine if it's a new search
    const currentSearchKey = JSON.stringify({
      keywords: searchData.keywords,
      location: searchData.location,
      sources: searchData.sources?.sort() || [],
      skills: searchData.skills,
      experience_level: searchData.experience_level,
      where: searchData.where,
    });
    
    const isNewSearch = currentSearchKey !== lastSearchKey;
    
    if (isNewSearch && currentPage === 1) {
      // Only clear cache and results if it's actually a new search (different parameters)
      console.log('[Search] New search detected (parameters changed), clearing cache and results');
      setJobsCache(new Map());
    setResults(null);
    } else if (currentPage === 1 && results && !isNewSearch) {
      // Page 1 but same search - don't clear results, just refresh if needed
      console.log('[Search] Same search, page 1 - keeping existing results while fetching');
      // Don't clear results - preserve them while fetching fresh data
      // This prevents the UI from showing empty state when navigating back to page 1
    } else if (currentPage !== 1) {
      // For pagination to other pages, we'll set paginationLoading
      // But don't clear results - keep current page visible while loading next page
      setPaginationLoading(true);
    } else {
      // Fallback: if we're on page 1 but no results yet, that's fine - will fetch
      setPaginationLoading(true);
    }

    // Normalize location: pass empty string for Remote/Any
    const normalizedLocation = (searchData.where && searchData.where.toLowerCase() !== 'remote' && searchData.where.toLowerCase() !== 'any') 
      ? searchData.where 
      : '';

    // Get user's current location from resume data for tiered location matching when "Any" is selected
    // IMPORTANT: When "Any" is selected, only use the user's actual location from resume, not searchData.location
    // searchData.location might be "Remote" or other search preferences, which are not real locations
    // "Any" is represented as empty string "" in the form
    const isAnySelected = !searchData.where || searchData.where.trim() === '' || searchData.where.toLowerCase() === 'any' || searchData.where.toLowerCase() === 'anywhere';
    const userCurrentLocation = isAnySelected 
      ? (resumeData?.personalInfo?.location || '')  // Only use resume location when "Any" is selected
      : (resumeData?.personalInfo?.location || searchData.location || '');  // Otherwise, allow fallback to searchData.location

    // Normalize where field: empty string means "Any"
    const normalizedWhere = searchData.where && searchData.where.trim() !== '' ? searchData.where : undefined;

    const requestBody = {
          keywords: searchData.keywords.split(',').map(k => k.trim()).filter(k => k),
      // Send user's current location for tiered matching when "Any" is selected
      // The backend will use this to prioritize: exact location > city > country > rest of world
      location: userCurrentLocation,  // User's current location (e.g., "Bangalore, India")
      // Send search preference in 'where' field
      // Empty string or undefined means "Any" - backend will use tiered location matching
      where: normalizedWhere,  // Search preference: undefined/"Any", "Remote", or specific location
          skills: searchData.skills.split(',').map(s => s.trim()).filter(s => s),
          experience_level: searchData.experience_level || undefined,
          max_results: searchData.max_results,
      sources: searchData.sources,
      page: currentPage,
      page_size: pageSize,
      user_id: authUserId || undefined,  // User ID for user-specific scoring
      resume_signature: resumeSignature || undefined
    };
    
    // Debug: log what we're sending
    console.log('[Frontend] FINAL payload for /api/jobs/search-new:', {
      ...requestBody,
      isAnySelected,
      userCurrentLocation,
      normalizedWhere,
      searchDataWhere: searchData.where
    });
    
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
      // Reset seen IDs for a new search
      seenIds.clear();
    } else if (currentPage === 1) {
      setLastSearchKey(searchKey);
    }
    
    console.log('[Frontend] Preparing search request:', requestBody);

    try {
      // For now, use Naukri only to validate that other scrapers are working.
      // To switch back to LinkedIn or multi-source, change this array.
      // Naukri removed - using default sources
      console.log('[Frontend] FINAL payload for /api/jobs/search-new:', requestBody);
      const response = await fetch('/api/jobs/search-new', {
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
      
      // If backend explicitly signals there are no more results for this page,
      // keep user on previous page and show a clear notice.
      if (currentPage > 1 && data?.no_more_results) {
        const previousPage = Math.max(1, currentPage - 1);
        console.log(`[Pagination] Backend reported no more results for page ${currentPage}. Reverting to page ${previousPage}.`);
        setPaginationLoading(false);
        setCurrentPage(previousPage);
        setNoMoreJobsToast(true);
        setTimeout(() => setNoMoreJobsToast(false), 2500);
        return;
      }
      
      console.log('[Frontend] Received response:', {
        total_found: data.total_found,
        jobs_count: data.jobs?.length,
        pagination: data.pagination
      });
        
        // Deduplicate jobs to prevent React key conflicts
        if (data.jobs && Array.isArray(data.jobs)) {
          data.jobs = deduplicateJobs(data.jobs);
        }
        
        // Detect "no more jobs": if this is a forward pagination (going to next page)
        // and the backend returned 0 new unique job IDs compared to previously seen IDs,
        // keep user on previous page and show a transient notice.
        try {
          const requestedPage = data?.pagination?.page ?? currentPage;
          const previousPage = results?.pagination?.page ?? 1;
          const isGoingForward = requestedPage > previousPage;
          const jobsArr = Array.isArray(data.jobs) ? data.jobs : [];
          if (isGoingForward && requestedPage > 1) {
            let newUnique = 0;
            const newIds: string[] = [];
            for (const j of jobsArr) {
              const id = j?.id || j?.external_id || j?.url;
              if (!id) continue;
              if (!seenIds.has(String(id))) {
                newUnique++;
                newIds.push(String(id));
              }
            }
            if (newUnique === 0) {
              // Revert page and show notice (only when going forward)
              const previousPage = Math.max(1, requestedPage - 1);
              console.log(`[Pagination] No new jobs found for page ${requestedPage}. Reverting to page ${previousPage}.`);
              setPaginationLoading(false);
              setCurrentPage(previousPage);
              
              // Explicitly restore from cache if available
              const cachedPrevPage = jobsCache.get(previousPage);
              if (cachedPrevPage) {
                console.log(`[Pagination] Restoring page ${previousPage} from cache`);
                setResults({
                  jobs: cachedPrevPage.jobs,
                  pagination: cachedPrevPage.pagination,
                  total_found: cachedPrevPage.total_found,
                  search_timestamp: results?.search_timestamp || new Date().toISOString(),
                  sources_searched: results?.sources_searched || [],
                  errors: results?.errors || [],
                  ...(results?.statistics ? { statistics: results.statistics } : {}),
                  ...(results?.estimated_total !== undefined ? { estimated_total: results.estimated_total } : {})
                });
              }
              
              // Show 2s disappearing message
              setNoMoreJobsToast(true);
              setTimeout(() => setNoMoreJobsToast(false), 2000);
              return; // Do not call setResults again; already restored from cache
            } else {
              // Add newly seen IDs
              for (const nid of newIds) seenIds.add(nid);
            }
          } else if (requestedPage === 1) {
            // Page 1: reset seen IDs based on current jobs
            seenIds.clear();
            for (const j of jobsArr) {
              const id = j?.id || j?.external_id || j?.url;
              if (id) seenIds.add(String(id));
            }
          } else {
            // Going backward or same page: just add any new IDs we haven't seen
            for (const j of jobsArr) {
              const id = j?.id || j?.external_id || j?.url;
              if (id && !seenIds.has(String(id))) {
                seenIds.add(String(id));
              }
            }
          }
        } catch (e) {
          // Non-fatal
        }
        
      // Synthesize pagination if backend didn't include it
      if (!data.pagination) {
        const hasNext = Array.isArray(data.jobs) && data.jobs.length >= pageSize;
        data.pagination = {
          page: currentPage,
          page_size: pageSize,
          total_pages: hasNext ? currentPage + 1 : currentPage,
          has_next_page: hasNext,
          has_previous_page: currentPage > 1,
        };
      }

      // Always cache pages for pagination (even if USE_CACHE is false for other features)
      // This ensures smooth navigation between already-loaded pages
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
        console.log(`[Cache] 💾 Cached page ${data.pagination.page} with ${data.jobs?.length || 0} jobs`);
      }
        
      setResults(data);
      if (data?.jobs?.length > 0) {
        setCompactMode(true);
      }
      // Store update info for auto-refresh polling
      const totalInDb = (data as any)?.total_in_db || 0;
      const lastUpdated = (data as any)?.last_updated || null;
      setLastUpdateCheck({ total_in_db: totalInDb, last_updated: lastUpdated });
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (progTimer) clearInterval(progTimer);
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
      
      // Do not hide liked jobs from the main list
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

  // ============================================================================
  // AUTO-REFRESH POLLING: COMMENTED OUT - Testing Realtime functionality only
  // ============================================================================
  // This entire useEffect block is disabled. Only Supabase Realtime is active.
  // To re-enable polling, uncomment this block and comment out the Realtime useEffect.
  // ============================================================================
  // RUNTIME GUARD: If this code executes, something is wrong!
  if (typeof window !== 'undefined') {
    (window as any).__POLLING_DISABLED__ = true;
  }
  /*
  useEffect(() => {
    // RUNTIME CHECK: This should NEVER execute
    console.error('[CRITICAL] POLLING CODE IS RUNNING BUT SHOULD BE DISABLED!');
    throw new Error('Polling code should be commented out!');
    
    if (!results || !lastUpdateCheck || loading) {
      console.log('[Auto-refresh] Polling disabled:', { hasResults: !!results, hasLastUpdate: !!lastUpdateCheck, loading });
      return;
    }
    
    console.log('[Auto-refresh] Starting polling (fallback), checking every 30s');
    
    const pollInterval = setInterval(async () => {
      try {
        // Make a lightweight check request (just metadata, no_cache to get fresh data)
        const checkBody = {
          keywords: searchData.keywords.split(',').map(k => k.trim()).filter(Boolean),
          location: searchData.location,
          skills: searchData.skills.split(',').map(s => s.trim()).filter(Boolean),
          experience_level: searchData.experience_level,
          where: searchData.where,
          sources: searchData.sources,
          page: currentPage,
          page_size: pageSize,
          no_cache: true,  // Get fresh data
          user_id: authUserId || undefined  // User ID for user-specific scoring
        };
        
        const resp = await fetch('/api/jobs/search-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkBody),
        });
        
        if (!resp.ok) {
          console.log('[Auto-refresh] Poll check failed:', resp.status);
          return;
        }
        
        const checkData = await resp.json();
        const newTotal = (checkData as any)?.total_in_db || 0;
        const newLastUpdated = (checkData as any)?.last_updated || null;
        const newJobs = Array.isArray(checkData.jobs) ? checkData.jobs : [];
        const newJobsCount = newJobs.length;
        const currentJobs = Array.isArray(results.jobs) ? results.jobs : [];
        const currentJobsCount = currentJobs.length;
        
        // Create a simple hash of job IDs to detect if jobs changed
        const newJobIds = new Set(newJobs.map((j: any) => j.id || j.external_id || j.url).filter(Boolean));
        const currentJobIds = new Set(currentJobs.map((j: any) => j.id || j.external_id || j.url).filter(Boolean));
        const jobIdsChanged = newJobIds.size !== currentJobIds.size || 
          Array.from(newJobIds).some(id => !currentJobIds.has(id));
        
        console.log('[Auto-refresh] Poll check:', {
          oldTotal: lastUpdateCheck.total_in_db,
          newTotal,
          oldLastUpdated: lastUpdateCheck.last_updated,
          newLastUpdated,
          oldJobsCount: currentJobsCount,
          newJobsCount,
          jobIdsChanged,
        });
        
        // Check if we should refresh:
        // 1. total_in_db increased
        // 2. last_updated changed
        // 3. number of jobs on current page changed
        // 4. job IDs changed (new jobs replaced old ones)
        // 5. We have jobs now but didn't before (or vice versa)
        const hadJobs = currentJobsCount > 0;
        const hasJobsNow = newJobsCount > 0;
        const jobsAppeared = !hadJobs && hasJobsNow;
        
        const shouldRefresh = 
          newTotal > lastUpdateCheck.total_in_db || 
          (newLastUpdated && newLastUpdated !== lastUpdateCheck.last_updated) ||
          newJobsCount !== currentJobsCount ||
          jobIdsChanged ||
          jobsAppeared;
        
        if (shouldRefresh) {
          console.log(`[Auto-refresh] Changes detected! Refreshing UI...`);
          
          // Use the data from the poll check directly (already fresh, no need for another request)
          if (checkData.jobs && Array.isArray(checkData.jobs)) {
            checkData.jobs = deduplicateJobs(checkData.jobs);
          }
          
          // Create a new object reference to ensure React detects the change
          const updatedResults = {
            ...checkData,
            jobs: checkData.jobs ? [...checkData.jobs] : [],
          };
          
          console.log(`[Auto-refresh] Refreshed! Got ${updatedResults.jobs?.length || 0} jobs (was ${currentJobsCount})`);
          
          // Update state - this should trigger a re-render
          setResults(updatedResults);
          setLastUpdateCheck({ 
            total_in_db: newTotal, 
            last_updated: newLastUpdated 
          });
          
          // Force a small delay to ensure state update is processed
          setTimeout(() => {
            console.log('[Auto-refresh] State updated, UI should have refreshed');
          }, 100);
        } else {
          console.log('[Auto-refresh] No changes detected, skipping refresh');
        }
      } catch (err) {
        console.error('[Auto-refresh] Poll error:', err);
      }
    }, 30000);  // Poll every 30 seconds (fallback - Realtime is primary)
    
    return () => {
      console.log('[Auto-refresh] Stopping polling');
      clearInterval(pollInterval);
    };
  }, [results, lastUpdateCheck, currentPage, searchData, pageSize, loading]);
  */

  // Ref to store debounce timeout for realtime updates
  const realtimeRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to store reconnection timeout and attempts
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 20; // Increased from 5 to handle long sessions
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessfulConnectionRef = useRef<number>(Date.now());
  const consecutiveFailuresRef = useRef(0);
  // Ref to store current search params (to avoid re-subscribing when they don't change)
  const searchParamsRef = useRef<{
    keywords: string;
    location: string;
    sources: string[];
    currentPage: number;
    pageSize: number;
    where?: string; // Search preference (Any, Remote, etc.)
    skills?: string; // Skills for search
    experience_level?: string; // Experience level
  } | null>(null);
  // Ref to track if subscription is active
  const subscriptionActiveRef = useRef(false);

  // ============================================================================
  // SUPABASE REALTIME SUBSCRIPTION: ACTIVE
  // ============================================================================
  // This is the ONLY auto-refresh mechanism currently active.
  // Polling is COMMENTED OUT - see above.
  // See SUPABASE_REALTIME_SETUP.md for configuration instructions
  // ============================================================================
  useEffect(() => {
    // Check if old polling code is somehow running
    if (typeof window !== 'undefined') {
      const checkInterval = setInterval(() => {
        if ((window as any).__POLLING_ACTIVE__) {
          console.error('[Realtime] ⚠️ WARNING: Old polling code detected! Clear browser cache!');
        }
      }, 1000);
      
      // Cleanup check
      return () => clearInterval(checkInterval);
    }
  }, []);
  
  useEffect(() => {
    // Create a stable key from search params to detect actual query changes
    const searchKey = JSON.stringify({
      keywords: searchData.keywords,
      location: searchData.location,
      sources: searchData.sources?.sort() || [],
    });
    
    const currentSearchKey = searchParamsRef.current 
      ? JSON.stringify({
          keywords: searchParamsRef.current.keywords,
          location: searchParamsRef.current.location,
          sources: searchParamsRef.current.sources.sort(),
        })
      : null;

    console.log('[Realtime] ========================================');
    console.log('[Realtime] ⚡ REALTIME useEffect triggered (POLLING IS DISABLED)');
    console.log('[Realtime] If you see [Auto-refresh] logs, clear browser cache!');
    console.log('[Realtime] ========================================');
    console.log('[Realtime] useEffect triggered', {
      hasResults: !!results,
      currentPage,
      pageSize,
      sources: searchData.sources,
      keywords: searchData.keywords,
      searchKeyChanged: searchKey !== currentSearchKey,
      subscriptionActive: subscriptionActiveRef.current,
    });

    // Check if we have at least keywords or sources to subscribe
    const hasSearchCriteria = (searchData.keywords && searchData.keywords.trim()) || 
                              (searchData.sources && searchData.sources.length > 0);
    
    if (!hasSearchCriteria) {
      console.log('[Realtime] Subscription disabled:', { 
        reason: 'No search criteria yet (keywords or sources)'
      });
      return;
    }

    // Only re-subscribe if search query actually changed OR if reconnectTrigger changed (for error recovery)
    // reconnectTrigger is used to force reconnection on errors without changing search params
    const shouldReconnect = reconnectTrigger > 0;
    if (subscriptionActiveRef.current && searchKey === currentSearchKey && !shouldReconnect) {
      console.log('[Realtime] Search query unchanged, keeping existing subscription');
      // Update refs with current page info (for refresh callback)
      searchParamsRef.current = {
        keywords: searchData.keywords,
        location: searchData.location,
        sources: searchData.sources || [],
        currentPage,
        pageSize,
        where: searchData.where,
        skills: searchData.skills,
        experience_level: searchData.experience_level,
      };
      return;
    }
    
    if (shouldReconnect) {
      console.log('[Realtime] Reconnection triggered (error recovery)');
    }

    console.log('[Realtime] ========================================');
    console.log('[Realtime] Setting up Supabase Realtime subscription');
    console.log('[Realtime] Table: jobs');
    console.log('[Realtime] Events: INSERT, UPDATE, DELETE');
    console.log('[Realtime] Current search params:', {
      keywords: searchData.keywords,
      location: searchData.location,
      sources: searchData.sources,
      page: currentPage,
      page_size: pageSize,
    });
    console.log('[Realtime] ========================================');

    // Set up the realtime subscription
    const channelName = `jobs-changes-${Date.now()}`;
    console.log(`[Realtime] Creating channel: ${channelName}`);
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'jobs',
          // Note: We can't filter by FTS match in realtime, so we'll refresh and let the backend filter
        },
        (payload) => {
          const timestamp = new Date().toISOString();
          console.log('[Realtime] ========================================');
          console.log(`[Realtime] [${timestamp}] Job change detected!`);
          console.log('[Realtime] Event type:', payload.eventType);
          console.log('[Realtime] Full payload:', JSON.stringify(payload, null, 2));
          
          if (payload.new) {
            const newRecord = payload.new as any;
            console.log('[Realtime] New record:', {
              id: newRecord.id,
              title: newRecord.title,
              company: newRecord.company,
              source_id: newRecord.source_id,
              external_id: newRecord.external_id,
              scraped_at: newRecord.scraped_at,
            });
          }
          
          if (payload.old) {
            const oldRecord = payload.old as any;
            console.log('[Realtime] Old record:', {
              id: oldRecord.id,
              title: oldRecord.title,
            });
          }
          console.log('[Realtime] ========================================');

          // Handle INSERT: Add new job directly to UI from DB payload (NO API CALL)
          if (payload.eventType === 'INSERT' && payload.new) {
            const newJob = payload.new as any;
            console.log('[Realtime] New job inserted in DB:', {
              id: newJob.id,
              title: newJob.title,
              company: newJob.company,
              source_id: newJob.source_id,
              external_id: newJob.external_id,
            });

            // Get current search params
            const currentParams = searchParamsRef.current;
            if (!currentParams || !results) {
              console.log('[Realtime] No search params or results, skipping job addition');
              return;
            }

            // Show ALL jobs that are in the database - no filtering by match score
            // Backend shows all jobs that match FTS query (even with 1% match)
            // Frontend should accept ALL jobs from Realtime, regardless of match score
            
            // Handle keywords as both string (comma-separated) and array
            let keywords: string[] = [];
            if (currentParams.keywords) {
              if (Array.isArray(currentParams.keywords)) {
                keywords = currentParams.keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean);
              } else {
                keywords = String(currentParams.keywords).toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
              }
            }
            
            const jobTitle = (newJob.title || '').toLowerCase();
            const jobDescription = (newJob.description || '').toLowerCase();
            const combinedText = `${jobTitle} ${jobDescription}`;

            // VERY LENIENT keyword matching - accept if:
            // 1. No keywords provided (accept all)
            // 2. ANY keyword word appears in title OR description (even partial match)
            // 3. This matches backend FTS behavior which is lenient
            const matchesKeywords = keywords.length === 0 || keywords.some(kw => {
              const kwLower = kw.toLowerCase().trim();
              if (!kwLower) return true; // Empty keyword, accept
              
              // Remove quotes if present
              const cleanKw = kwLower.replace(/^["']|["']$/g, '');
              
              // Direct phrase match
              if (combinedText.includes(cleanKw)) {
                return true;
              }
              
              // Split into words and check if ANY word appears (very lenient)
              const kwWords = cleanKw.split(/\s+/).filter(w => w.length > 1); // Words longer than 1 char
              
              // Check if any word from keyword appears in job (very lenient)
              return kwWords.some(word => {
                // Check if word appears in title or description
                if (combinedText.includes(word)) return true;
                
                // Also check for partial matches (e.g., "manager" matches "managers")
                const wordStem = word.substring(0, Math.max(3, word.length - 2)); // Take first 3+ chars
                return combinedText.includes(wordStem);
              });
            });

            // NO location filtering - show ALL jobs (location is only used for ranking in backend)
            const matchesLocation = true; // Always true - no location filtering

            // VERY LENIENT source matching - accept if:
            // 1. No source filter (accept all)
            // 2. Job is from LinkedIn (source_id 1) and LinkedIn is in sources
            // 3. Job source matches any requested source
            // 4. If sources filter is empty, accept all
            const matchesSource = currentParams.sources.length === 0 || 
              // LinkedIn is most common, so be lenient
              newJob.source_id === 1 ||
              currentParams.sources.some(s => {
                const sourceLower = s.toLowerCase();
                // Accept if filter includes common sources
                return sourceLower === 'linkedin' || sourceLower === 'adzuna' || 
                       sourceLower === 'jooble' || sourceLower === 'remoteok';
              });
            
            // Debug logging
            console.log('[Realtime] Matching check (show all jobs):', {
              keywords,
              jobTitle: jobTitle.substring(0, 50),
              matchesKeywords,
              matchesLocation: true,
              sources: currentParams.sources,
              source_id: newJob.source_id,
              matchesSource,
              finalMatch: matchesKeywords && matchesLocation && matchesSource
            });

            // Accept job if it passes all checks (very lenient)
            if (matchesKeywords && matchesLocation && matchesSource) {
              console.log('[Realtime] ✅ New job matches current search! Adding to UI...');
              
              // Convert DB job to UI job format (outside setResults for scope)
              const addedAt = Date.now();
              const uiJob: any = {
                id: newJob.id,
                title: newJob.title || '',
                company: newJob.company || '',
                location: newJob.location || '',
                description: newJob.description || '',
                url: newJob.url || '',
                source: 'linkedin', // Default, could be determined from source_id
                match_score: newJob.last_match_score || 0,
                last_match_score: newJob.last_match_score,
                posted_date: newJob.posted_at,
                skills_matched: [],
                skills_required: [],
                _isNew: true, // Mark as newly added for animation
                _addedAt: addedAt, // Timestamp for animation
              };
              
              // Add the new job directly to the UI
              // Always add if we're on page 1, or initialize results if null
              setResults(prev => {
                const currentPage = currentParams?.currentPage || 1;
                const pageSize = currentParams?.pageSize || 25;
                
                // Initialize results if null
                if (!prev) {
                  console.log('[Realtime] Initializing results with new job');
                  const initialPagination = {
                    page: 1,
                    page_size: pageSize,
                    total_pages: 1,
                    has_next_page: false,
                    has_previous_page: false,
                  };
                  return {
                    jobs: [uiJob],
                    total_found: 1,
                    search_timestamp: new Date().toISOString(),
                    sources_searched: [],
                    errors: [],
                    total_in_db: 1,
                    last_updated: new Date().toISOString(),
                    pagination: initialPagination,
                  };
                }
                
                // Initialize jobs array if null
                if (!prev.jobs) {
                  console.log('[Realtime] Initializing jobs array with new job');
                  const initialPagination = {
                    page: currentPage,
                    page_size: pageSize,
                    total_pages: 1,
                    has_next_page: false,
                    has_previous_page: currentPage > 1,
                  };
                  return {
                    ...prev,
                    jobs: [uiJob],
                    total_found: 1,
                    total_in_db: (prev as any).total_in_db ? (prev as any).total_in_db + 1 : 1,
                    last_updated: new Date().toISOString(),
                    pagination: prev.pagination || initialPagination,
                  };
                }
                
                // Check if job already exists (avoid duplicates)
                const existingJob = prev.jobs.find(j => 
                  j.id === newJob.id || 
                  (j as any).external_id === newJob.external_id ||
                  j.url === newJob.url
                );
                
                if (existingJob) {
                  console.log('[Realtime] Job already in list, skipping');
                  return prev;
                }
                
                // Only add to current page if we're on page 1
                // On other pages, just update the total count (job will appear when user navigates)
                if (currentPage === 1) {
                  // Add job and re-sort by match score
                  const updatedJobs = [...prev.jobs, uiJob];
                  updatedJobs.sort((a, b) => {
                    const scoreA = a.match_score || a.last_match_score || a.score || 0;
                    const scoreB = b.match_score || b.last_match_score || b.score || 0;
                    return scoreB - scoreA;
                  });
                  
                  // Limit to page size (25) - remove lowest scored job if over limit
                  const trimmedJobs = updatedJobs.slice(0, pageSize);
                  
                  // Calculate new total (including the job we just added)
                  const newTotalFound = (prev.total_found || prev.jobs.length) + 1;
                  
                  // Update pagination: enable "Next" if total exceeds current page capacity
                  // If we have 25 jobs on page 1 and total is 26+, there's a next page
                  const hasNextPage = newTotalFound > (currentPage * pageSize);
                  
                  // Update or create pagination object
                  const updatedPagination = prev.pagination ? {
                    ...prev.pagination,
                    has_next_page: hasNextPage,
                    total_pages: hasNextPage ? Math.ceil(newTotalFound / pageSize) : currentPage,
                  } : {
                    page: currentPage,
                    page_size: pageSize,
                    total_pages: hasNextPage ? Math.ceil(newTotalFound / pageSize) : currentPage,
                    has_next_page: hasNextPage,
                    has_previous_page: false,
                  };
                  
                  console.log('[Realtime] ✅ Added new job to page 1, total jobs:', trimmedJobs.length, 'total_found:', newTotalFound, 'has_next_page:', hasNextPage, 'job title:', uiJob.title);
                  
                  return {
                    ...prev,
                    jobs: trimmedJobs,
                    total_found: newTotalFound,
                    total_in_db: (prev as any).total_in_db ? (prev as any).total_in_db + 1 : undefined,
                    pagination: updatedPagination,
                    last_updated: new Date().toISOString(),
                  };
                } else {
                  // On other pages, just update the total count and pagination
                  const newTotalFound = (prev.total_found || prev.jobs.length) + 1;
                  const hasNextPage = newTotalFound > (currentPage * pageSize);
                  
                  // Update pagination for other pages too
                  const updatedPagination = prev.pagination ? {
                    ...prev.pagination,
                    has_next_page: hasNextPage,
                    total_pages: hasNextPage ? Math.ceil(newTotalFound / pageSize) : currentPage,
                  } : {
                    page: currentPage,
                    page_size: pageSize,
                    total_pages: hasNextPage ? Math.ceil(newTotalFound / pageSize) : currentPage,
                    has_next_page: hasNextPage,
                    has_previous_page: currentPage > 1,
                  };
                  
                  console.log('[Realtime] Not on page 1 (page', currentPage, '), updating total count. Total:', newTotalFound, 'has_next_page:', hasNextPage);
                  return {
                    ...prev,
                    total_found: newTotalFound,
                    total_in_db: (prev as any).total_in_db ? (prev as any).total_in_db + 1 : undefined,
                    pagination: updatedPagination,
                    last_updated: new Date().toISOString(),
                  };
                }
              });
              
              // Update last update check
              setLastUpdateCheck(prev => ({
                total_in_db: (prev?.total_in_db || 0) + 1,
                last_updated: new Date().toISOString(),
              }));
              
              // Clear the _isNew flag after animation completes (2 seconds)
              setTimeout(() => {
                setResults(prev => {
                  if (!prev || !prev.jobs) return prev;
                  const updatedJobs = prev.jobs.map(j => {
                    if (j.id === uiJob.id && (j as any)._isNew && (j as any)._addedAt === addedAt) {
                      const { _isNew, _addedAt, ...rest } = j as any;
                      return rest;
                    }
                    return j;
                  });
                  return { ...prev, jobs: updatedJobs };
                });
              }, 2000);
            } else {
              console.log('[Realtime] ⏭️ New job does not match current search, skipping');
            }
          } 
          // Handle UPDATE: Update existing job in UI if present
          else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedJob = payload.new as any;
            console.log('[Realtime] Job updated in DB:', {
              id: updatedJob.id,
              title: updatedJob.title,
            });

            setResults(prev => {
              if (!prev || !prev.jobs) return prev;
              
              const jobIndex = prev.jobs.findIndex(j => 
                j.id === updatedJob.id || 
                (j as any).external_id === updatedJob.external_id ||
                j.url === updatedJob.url
              );

              if (jobIndex >= 0) {
                console.log('[Realtime] ✅ Updating existing job in UI');
                const updatedJobs = [...prev.jobs];
                updatedJobs[jobIndex] = {
                  ...updatedJobs[jobIndex],
                  title: updatedJob.title || updatedJobs[jobIndex].title,
                  company: updatedJob.company || updatedJobs[jobIndex].company,
                  location: updatedJob.location || updatedJobs[jobIndex].location,
                  description: updatedJob.description || updatedJobs[jobIndex].description,
                  match_score: updatedJob.last_match_score || updatedJobs[jobIndex].match_score,
                  last_match_score: updatedJob.last_match_score,
                };
                // Re-sort by score
                updatedJobs.sort((a, b) => {
                  const scoreA = a.match_score || a.last_match_score || a.score || 0;
                  const scoreB = b.match_score || b.last_match_score || b.score || 0;
                  return scoreB - scoreA;
                });
                return {
                  ...prev,
                  jobs: updatedJobs,
                };
              }
              return prev;
            });
          } 
          // Handle DELETE: Remove job from UI if present
          else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedJob = payload.old as any;
            console.log('[Realtime] Job deleted from DB:', {
              id: deletedJob.id,
              title: deletedJob.title,
            });

            setResults(prev => {
              if (!prev || !prev.jobs) return prev;
              
              const filteredJobs = prev.jobs.filter(j => 
                j.id !== deletedJob.id && 
                (j as any).external_id !== deletedJob.external_id &&
                j.url !== deletedJob.url
              );

              if (filteredJobs.length !== prev.jobs.length) {
                console.log('[Realtime] ✅ Removed deleted job from UI');
                return {
                  ...prev,
                  jobs: filteredJobs,
                  total: filteredJobs.length,
                };
              }
              return prev;
            });
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] ========================================');
        console.log('[Realtime] Subscription status changed:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Successfully subscribed to jobs table changes!');
          console.log('[Realtime] Listening for INSERT, UPDATE, DELETE events...');
          
          // Reset all failure counters on successful subscription
          reconnectAttemptsRef.current = 0;
          consecutiveFailuresRef.current = 0;
          lastSuccessfulConnectionRef.current = Date.now();
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          
          // Start periodic health check to keep connection alive
          // Supabase Realtime can close idle connections, so we ping periodically
          if (healthCheckIntervalRef.current) {
            clearInterval(healthCheckIntervalRef.current);
          }
          healthCheckIntervalRef.current = setInterval(() => {
            // Check if connection is still active
            // Use a try-catch to safely check channel state
            try {
              const isChannelActive = channel && (channel.state === 'joined' || channel.state === 'joining');
              if (subscriptionActiveRef.current && isChannelActive) {
                // Connection is healthy, reset failure counter
                consecutiveFailuresRef.current = 0;
                // Reset reconnect attempts if we've been connected for a while
                const timeSinceLastSuccess = Date.now() - lastSuccessfulConnectionRef.current;
                if (timeSinceLastSuccess > 60000) { // After 1 minute of stable connection
                  reconnectAttemptsRef.current = 0;
                }
              } else {
                // Connection appears dead, try to reconnect
                console.log('[Realtime] Health check: Connection appears inactive (state:', channel?.state, 'active:', subscriptionActiveRef.current, '), triggering reconnect...');
                consecutiveFailuresRef.current += 1;
                if (consecutiveFailuresRef.current >= 3) {
                  // Force reconnection
                  console.log('[Realtime] Health check: 3 consecutive failures detected, forcing reconnection...');
                  setReconnectTrigger(prev => prev + 1);
                  consecutiveFailuresRef.current = 0;
                }
              }
            } catch (err) {
              // Channel might be undefined or in an invalid state
              console.warn('[Realtime] Health check error:', err);
              consecutiveFailuresRef.current += 1;
              if (consecutiveFailuresRef.current >= 3) {
                setReconnectTrigger(prev => prev + 1);
                consecutiveFailuresRef.current = 0;
              }
            }
          }, 30000); // Check every 30 seconds
          
          // Mark subscription as active and store current search params
          subscriptionActiveRef.current = true;
          searchParamsRef.current = {
            keywords: searchData.keywords,
            location: searchData.location,
            sources: searchData.sources || [],
            currentPage,
            pageSize,
            where: searchData.where,
            skills: searchData.skills,
            experience_level: searchData.experience_level,
          };
          console.log('[Realtime] Stored search params in ref:', searchParamsRef.current);
        } else if (status === 'CHANNEL_ERROR') {
          subscriptionActiveRef.current = false;
          reconnectAttemptsRef.current += 1;
          consecutiveFailuresRef.current += 1;
          
          // Log error details
          const errorDetails = err ? (typeof err === 'string' ? err : JSON.stringify(err)) : 'Unknown error';
          console.warn(`[Realtime] ❌ Channel error (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`, errorDetails);
          
          // Only show detailed error after multiple failures
          if (reconnectAttemptsRef.current >= 10) {
            console.error('[Realtime] Multiple reconnection failures. Check Supabase Realtime configuration:');
            console.error('[Realtime] 1. Go to Supabase Dashboard → Database → Replication');
            console.error('[Realtime] 2. Enable Realtime for the "jobs" table');
            console.error('[Realtime] 3. Verify WebSocket connections are allowed');
            console.error('[Realtime] 4. Check network connectivity and firewall settings');
          }
          
          // Auto-reconnect with exponential backoff with jitter (only if under max attempts)
          if (reconnectAttemptsRef.current < maxReconnectAttempts && searchParamsRef.current) {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
            const baseBackoff = Math.min(1000 * Math.pow(2, Math.min(reconnectAttemptsRef.current - 1, 4)), 30000);
            // Add jitter (±20%) to prevent thundering herd
            const jitter = baseBackoff * 0.2 * (Math.random() * 2 - 1);
            const backoffMs = Math.max(500, baseBackoff + jitter);
            
            console.log(`[Realtime] Reconnecting in ${Math.round(backoffMs)}ms (attempt ${reconnectAttemptsRef.current})...`);
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              // Trigger re-subscription by updating reconnect trigger state
              console.log('[Realtime] Attempting to reconnect...');
              reconnectTimeoutRef.current = null;
              setReconnectTrigger(prev => prev + 1);
            }, backoffMs);
          } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.error('[Realtime] Max reconnection attempts reached. Connection will remain disconnected.');
            console.error('[Realtime] You can try refreshing the page or check your Supabase configuration.');
          }
        } else if (status === 'TIMED_OUT') {
          subscriptionActiveRef.current = false;
          reconnectAttemptsRef.current += 1;
          consecutiveFailuresRef.current += 1;
          console.warn(`[Realtime] ⚠️ Subscription timed out (attempt ${reconnectAttemptsRef.current})`);
          
          // Auto-reconnect for timeout with shorter backoff
          if (reconnectAttemptsRef.current < maxReconnectAttempts && searchParamsRef.current) {
            const backoffMs = Math.min(2000 * reconnectAttemptsRef.current, 10000);
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[Realtime] Reconnecting after timeout...');
              reconnectTimeoutRef.current = null;
              setReconnectTrigger(prev => prev + 1);
            }, backoffMs);
          }
        } else if (status === 'CLOSED') {
          console.log('[Realtime] ⚠️ Channel closed');
          subscriptionActiveRef.current = false;
          
          // Supabase may close connections after inactivity
          // If we have active search params, try to reconnect after a delay
          if (searchParamsRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            console.log('[Realtime] Channel closed but search is active, will attempt to reconnect...');
            reconnectAttemptsRef.current += 1;
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[Realtime] Reconnecting after channel close...');
              reconnectTimeoutRef.current = null;
              setReconnectTrigger(prev => prev + 1);
            }, 3000); // Wait 3 seconds before reconnecting
          }
        }
        console.log('[Realtime] ========================================');
      });

    // Cleanup on unmount or when search query changes
    return () => {
      console.log('[Realtime] ========================================');
      console.log('[Realtime] Cleaning up subscription...');
      console.log('[Realtime] Channel:', channelName);
      
      subscriptionActiveRef.current = false;
      
      if (realtimeRefreshTimeoutRef.current) {
        console.log('[Realtime] Clearing debounce timeout');
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        console.log('[Realtime] Clearing reconnection timeout');
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (healthCheckIntervalRef.current) {
        console.log('[Realtime] Clearing health check interval');
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      
      console.log('[Realtime] Removing channel...');
      supabase.removeChannel(channel);
      console.log('[Realtime] ✅ Cleanup complete');
      console.log('[Realtime] ========================================');
    };
  }, [
    // Only re-subscribe when search query actually changes (keywords, location, sources)
    // NOT when results or currentPage changes (those are handled by the refresh callback)
    searchData.keywords,
    searchData.location,
    // Create stable key for sources array (sorted for consistency)
    (searchData.sources || []).slice().sort().join(','),
    // Include reconnectTrigger to allow manual reconnection on errors
    reconnectTrigger,
    // Still need results and loading to know when to enable subscription
    !!results,
  ]);

  // Update search params ref when page changes (without re-subscribing)
  useEffect(() => {
    if (searchParamsRef.current && subscriptionActiveRef.current) {
      console.log('[Realtime] Updating page info in ref (no re-subscription):', {
        oldPage: searchParamsRef.current.currentPage,
        newPage: currentPage,
        oldPageSize: searchParamsRef.current.pageSize,
        newPageSize: pageSize,
      });
      searchParamsRef.current.currentPage = currentPage;
      searchParamsRef.current.pageSize = pageSize;
    }
  }, [currentPage, pageSize]);

  const handleGmailAuth = async () => {
    try {
      const response = await fetch('/api/gmail/auth');
      const data = await response.json();
      
      if (data.success) {
        // Open Gmail OAuth in a new browser tab instead of a popup window
        const popup = window.open(
          data.authUrl, 
          '_blank'
        );
        
        // Listen for message from popup window
        const handleMessage = (event: MessageEvent) => {
          // Verify origin for security
          if (event.origin !== window.location.origin) return;
          
          if (event.data?.type === 'gmail-auth-success') {
            // Authentication successful - update state without reloading page
            try {
              const tokensJson = decodeURIComponent(event.data.tokens);
              const tokens = JSON.parse(tokensJson);
              localStorage.setItem('gmailTokens', tokensJson);
              setGmailTokens(tokens);
              setGmailAuthenticated(true);
              // Stop monitoring popup
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              // Show success message
              alert('✅ Gmail authentication successful! You can now create drafts.');
            } catch (e) {
              console.error('Failed to parse tokens:', e);
              alert('⚠️ Authentication completed but failed to save tokens. Please try again.');
            }
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Monitor popup for completion (fallback if message doesn't arrive)
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            // Check if authentication was successful
            const tokens = localStorage.getItem('gmailTokens');
            if (tokens) {
              try {
                setGmailTokens(JSON.parse(tokens));
                setGmailAuthenticated(true);
                alert('✅ Gmail authentication successful! You can now create drafts.');
              } catch (e) {
                console.error('Failed to parse tokens:', e);
              }
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

  const [pendingGmailContext, setPendingGmailContext] = useState<null | { mailtoUrl: string; contact: any; templates: any }>(null);
  const [showResumeTemplateOverlay, setShowResumeTemplateOverlay] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('ats-modern');
  const [overlayResume, setOverlayResume] = useState<any | null>(null);
  const [overlayJD, setOverlayJD] = useState<string>('');
  const [overlayAts, setOverlayAts] = useState<{ score: number; matchedKeywords?: string[] } | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [showOverlayJDPanel, setShowOverlayJDPanel] = useState(false);
  const [overlayEditingSection, setOverlayEditingSection] = useState<string | null>(null);
  const [overlayEditingIndex, setOverlayEditingIndex] = useState<number | null>(null);
  const [overlaySuggestionLoading, setOverlaySuggestionLoading] = useState(false);
  const [overlaySuggestions, setOverlaySuggestions] = useState<{
    missingKeywords: string[];
    suggestedSummary?: string;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Enrich resume with JS-specific keywords from JD (simple heuristic merge)
  const enrichResumeWithJsKeywords = (resume: any, jd: string) => {
    const jsKeywords = [
      'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express', 'Redux', 'Jest', 'Cypress',
      'HTML', 'CSS', 'Tailwind', 'REST', 'GraphQL', 'Webpack', 'Vite', 'Babel', 'ES6', 'CI/CD'
    ];
    const present = new Set((resume.skills || []).map((s: string) => s.toLowerCase()));
    const toAdd: string[] = [];
    const hay = (jd || '').toLowerCase();
    jsKeywords.forEach(k => { if (hay.includes(k.toLowerCase()) && !present.has(k.toLowerCase())) toAdd.push(k); });
    const merged = { ...resume, skills: Array.from(new Set([...(resume.skills || []), ...toAdd])) };
    return merged;
  };

  const recalcOverlayATS = async (resume: any, jd: string) => {
    try {
      setOverlayBusy(true);
      const res = await fetch('/api/ats/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData: resume, jdText: jd || '' })
      });
      const data = await res.json();
      if (res.ok && data.success) setOverlayAts({ score: data.data?.score || 0, matchedKeywords: data.data?.matchedKeywords || [] });
      else setOverlayAts(null);
    } catch (_) {
      setOverlayAts(null);
    } finally {
      setOverlayBusy(false);
    }
  };

  // Local helper to find missing *relevant* skills between JD and resume
  const analyzeMissingKeywordsForOverlay = (jd: string, resume: any): string[] => {
    const jdText = (jd || '').toLowerCase();
    const resumeText = JSON.stringify(resume || {}).toLowerCase();

    // Curated list of common technical / role skills we'll look for in the JD
    const knownSkills = [
      // General engineering / product
      'javascript', 'typescript', 'react', 'next.js', 'node.js', 'express', 'python', 'java', 'kotlin',
      'swift', 'objective-c', 'react native', 'ios', 'android',
      'graphql', 'rest', 'api design',
      'docker', 'kubernetes', 'k8s',
      'aws', 'gcp', 'azure', 'terraform',
      'sql', 'postgres', 'mysql', 'mongodb', 'redis',
      'microservices', 'event-driven', 'distributed systems',
      'cicd', 'ci/cd', 'jenkins', 'github actions', 'gitlab ci',
      'testing', 'unit testing', 'integration testing', 'jest', 'cypress', 'playwright',
      'design systems', 'figma',
      // Soft / leadership skills often explicitly required
      'stakeholder management', 'cross-functional', 'mentoring', 'people management',
      'leadership', 'communication skills', 'collaboration'
    ];

    const missing: string[] = [];
    for (const rawSkill of knownSkills) {
      const needle = rawSkill.toLowerCase();
      if (!jdText.includes(needle)) continue; // not actually required in JD
      if (resumeText.includes(needle)) continue; // already present in resume
      if (missing.includes(rawSkill)) continue;
      missing.push(rawSkill);
      if (missing.length >= 25) break;
    }
    return missing;
  };

  const runOverlayAtsSuggestions = async () => {
    if (!overlayResume) return;
    setOverlaySuggestionLoading(true);
    try {
      const jdText = overlayJD || selectedJob?.description || '';
      const missingKeywords = jdText ? analyzeMissingKeywordsForOverlay(jdText, overlayResume) : [];

      let suggestedSummary: string | undefined;
      try {
        if (jdText) {
          const response = await fetch('/api/resume/tailor-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentSummary: overlayResume.personalInfo?.summary || '',
              jobDescription: jdText,
              resumeData: overlayResume,
            }),
          });
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.tailoredSummary) {
              suggestedSummary = result.tailoredSummary as string;
            }
          }
        }
      } catch {
        // Ignore summary suggestion errors; keep other suggestions
      }

      setOverlaySuggestions({
        missingKeywords,
        suggestedSummary,
      });
    } finally {
      setOverlaySuggestionLoading(false);
    }
  };

  // Load selected template from localStorage when overlay opens
  useEffect(() => {
    if (showResumeTemplateOverlay) {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null;
      if (stored) {
        setSelectedTemplate(stored);
      }
    }
  }, [showResumeTemplateOverlay]);

  const handleOpenGmail = (mailtoUrl: string, contact?: any, templates?: any) => {
    if (!gmailAuthenticated) {
      handleGmailAuth();
      return;
    }
    
    // If we have contact and templates, show resume preview overlay
    if (contact && templates) {
      setPendingGmailContext({ mailtoUrl, contact, templates });
      
      // Load resume data and set up preview
      try {
        const storedResume = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
        const storedTemplate = typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null;
        const jobDescription = selectedJob?.description || '';
        
        if (storedTemplate) setSelectedTemplate(storedTemplate);
        if (jobDescription) setOverlayJD(jobDescription);
        
        if (storedResume) {
          const parsed = JSON.parse(storedResume);
          const enriched = enrichResumeWithJsKeywords(parsed, jobDescription);
          setOverlayResume(enriched);
          void recalcOverlayATS(enriched, jobDescription);
        }
      } catch (_) {}
      
      setShowResumeTemplateOverlay(true);
    } else {
      // Fallback to mailto link if no contact/templates
      window.open(mailtoUrl, '_blank');
    }
  };

  const proceedGmailWithTemplate = async () => {
    if (!pendingGmailContext || !gmailTokens || !overlayResume) return;
    
    const { mailtoUrl, contact, templates } = pendingGmailContext;
    setRecruitersLoading(true);
    
    try {
      // Generate PDF from the preview DOM element
      let pdfBase64: string | null = null;
      try {
        console.log('Starting PDF generation with template:', selectedTemplate);
        await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
        
        // Find the preview element
        let source = previewRef.current as HTMLElement | null;
        if (!source) {
          await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
          source = document.querySelector('.print-optimized') as HTMLElement | null;
        }
        
        if (source) {
          console.log('Found preview element, cloning to sandbox');
          // Create offscreen sandbox with exact A4 size
          const sandbox = document.createElement('div');
          sandbox.setAttribute('data-pdf-sandbox', 'true');
          sandbox.style.position = 'fixed';
          sandbox.style.left = '-10000px';
          sandbox.style.top = '0';
          sandbox.style.width = '210mm';
          sandbox.style.minHeight = '297mm';
          sandbox.style.background = '#ffffff';
          sandbox.style.zIndex = '-1';
          sandbox.style.padding = '0';
          sandbox.style.margin = '0';
          sandbox.style.boxShadow = 'none';
          
          const cloned = source.cloneNode(true) as HTMLElement;
          cloned.style.transform = 'none';
          cloned.style.boxShadow = 'none';
          cloned.style.background = '#ffffff';
          sandbox.appendChild(cloned);
          document.body.appendChild(sandbox);

          console.log('Generating PDF from sandbox');
          const arrayBufferOrName = await generatePDFFromDom(sandbox as unknown as HTMLElement, '__BUFFER_ONLY__' as any);
          if (arrayBufferOrName && (arrayBufferOrName as any).byteLength !== undefined) {
            const ab = arrayBufferOrName as unknown as ArrayBuffer;
            // Convert ArrayBuffer to base64 (browser-compatible)
            const bytes = new Uint8Array(ab);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            pdfBase64 = btoa(binary);
            console.log('PDF generated successfully, size:', ab.byteLength);
          }

          // Cleanup
          document.body.removeChild(sandbox);
        } else {
          console.log('No preview element found');
        }
      } catch (e) {
        console.error('PDF generation error:', e);
      }

      // Use Gmail API to create draft with resume attached
      const response = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.email,
          subject: templates.subject,
          text: templates.emailBody,
          resumeData: overlayResume,
          tokens: gmailTokens,
          selectedTemplate: selectedTemplate,
          jdText: overlayJD || '',
          pdfBase64
        })
      });

      const data = await response.json();
      if (data.success) {
        const messageId = data.messageId;
        if (messageId) {
          const composeUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
          window.open(composeUrl, '_blank');
        } else {
          window.open('https://mail.google.com/mail/u/0/#drafts', '_blank');
        }
        setShowResumeTemplateOverlay(false);
        setPendingGmailContext(null);
        setOverlayResume(null);
        setOverlayJD('');
        setOverlayAts(null);
      } else {
        throw new Error(data.error || 'Failed to create Gmail draft');
      }
    } catch (e) {
      console.error('Error creating Gmail draft:', e);
      alert(e instanceof Error ? e.message : 'Failed to create Gmail draft');
      // Fallback to mailto
      window.open(mailtoUrl, '_blank');
    } finally {
      setRecruitersLoading(false);
    }
  };

  // Realtime subscription for user_job_scores to live-update match_score and match_components
  useEffect(() => {
    // Require authUserId and an active result set
    if (!authUserId) {
      console.log('[Realtime][scores] Skipping: no authUserId');
      return;
    }
    if (!results || !Array.isArray(results.jobs) || results.jobs.length === 0) {
      console.log('[Realtime][scores] Skipping: no jobs in results');
      return;
    }

    const scoresChannelName = `user-job-scores-${authUserId}-${Date.now()}`;
    console.log(`[Realtime][scores] Creating channel: ${scoresChannelName}`);

    const scoresChannel = supabase
      .channel(scoresChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_job_scores',
          filter: `user_id=eq.${authUserId}`,
        },
        (payload: any) => {
          try {
            const rec = payload.new || payload.record || {};
            const jobId = rec.job_id?.toString?.() ?? String(rec.job_id);
            const newScore = typeof rec.last_match_score === 'number' ? rec.last_match_score : parseFloat(rec.last_match_score);
            const newComponents = rec.match_components || {};
            console.log('[Realtime][scores] Change detected:', { eventType: payload.eventType, jobId, newScore, newComponents });

            // Merge into current results
            setResults(prev => {
              if (!prev || !Array.isArray(prev.jobs)) return prev;
              const idx = prev.jobs.findIndex(j => String(j.id) === String(jobId));
              if (idx === -1) return prev; // Not in current page
              const updatedJobs = [...prev.jobs];
              const updated = { ...updatedJobs[idx] } as any;
              if (!Number.isNaN(newScore)) {
                updated.match_score = newScore;
                updated.last_match_score = newScore;
              }
              if (newComponents && typeof newComponents === 'object') updated.match_components = newComponents;
              updatedJobs[idx] = updated;
              // Resort by score desc (match_score/last_match_score/score)
              const sorted = [...updatedJobs].sort((a: any, b: any) => {
                const sa = (typeof a.match_score === 'number' ? a.match_score : (typeof a.last_match_score === 'number' ? a.last_match_score : (typeof a.score === 'number' ? a.score : 0)));
                const sb = (typeof b.match_score === 'number' ? b.match_score : (typeof b.last_match_score === 'number' ? b.last_match_score : (typeof b.score === 'number' ? b.score : 0)));
                return sb - sa;
              });
              return { ...prev, jobs: sorted } as any;
            });
          } catch (e) {
            console.warn('[Realtime][scores] Merge error:', e);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime][scores] Status:', status, err || '');
      });

    return () => {
      try {
        console.log('[Realtime][scores] Cleaning up channel');
        supabase.removeChannel(scoresChannel);
      } catch {}
    };
  }, [authUserId, results?.jobs?.length]);

  return (
    <div className={`min-h-screen bg-white ${className}`}>
      <div className={`container-page ${likedJobs.length > 0 ? 'max-w-[800px]' : 'max-w-[1200px]'} mx-auto mt-16 md:mt-20 py-10 space-y-8 md:space-y-0 md:grid md:grid-cols-12 md:gap-8`}>
        <div className={likedJobs.length > 0 ? "md:col-span-9" : "md:col-span-12"}>
          <div className="shadow-lg rounded-xl bg-white px-8 py-8">
          <div className="flex items-center justify-between mb-4">
          {isPrefilled && resumeData && (
              <div className="flex items-center text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
                <User className="h-4 w-4 mr-1" />
                Pre-filled from resume
              </div>
            )}
            {results && Array.isArray(results.jobs) && results.jobs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="px-3 py-1.5 text-sm rounded-full border border-teal-300 bg-white text-gray-700 hover:border-teal-400 hover:bg-teal-50 transition-all duration-200"
              >
                {showForm ? '✕ Hide details' : '✏️ Edit details'}
              </button>
          )}
        </div>
        <div
          ref={formRef}
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{
            maxHeight: typeof formHeight === 'number' ? `${formHeight}px` : formHeight,
            opacity: showForm ? 1 : 0,
            marginBottom: showForm ? '1.5rem' : '0',
            transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease-in-out, margin-bottom 0.5s ease-in-out'
          }}
        >
        <form onSubmit={handleSearch} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                <span>Job Keywords</span>
              <button
                type="button"
                  onClick={async () => {
                    try {
                    setRefreshingKeywords(true);
                    const targetKeywordHints = (searchData.keywords || '')
                      .split(',')
                      .map(k => k.trim())
                      .filter(Boolean);
                    const requestPayload = {
                          resume: resumeData || {},
                          where: searchData.where || undefined,  // Default to "Any" (undefined) not "Remote"
                      experience_level: searchData.experience_level,
                      current_keywords: searchData.keywords,
                      current_skills: searchData.skills,
                      location: searchData.location,
                      refreshSeed: Date.now(),
                      target_keywords: targetKeywordHints,
                      resume_signature: resumeSignature
                    };
                    const resp = await fetch('/api/keywords-agent', {
                      method: 'POST',
                      cache: 'no-store',
                      headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store'
                      },
                      body: JSON.stringify(requestPayload)
                      });
                      const data = await resp.json();
                      const finalKeywords = Array.isArray(data?.finalKeywords) ? data.finalKeywords : [];
                      if (finalKeywords.length > 0) {
                        setSearchData(prev => ({ ...prev, keywords: finalKeywords.join(', ') }));
                      if (resumeSignature) {
                        setLocalStorageItem(KEYWORD_SIGNATURE_STORAGE_KEY, resumeSignature);
                      }
                      setLocalStorageItem(KEYWORD_LIST_STORAGE_KEY, JSON.stringify(finalKeywords));
                      prefFilledSignatureRef.current = resumeSignature;
                        if (authUserId) {
                          await fetch('/api/user/keywords', {
                            method: 'POST',
                          cache: 'no-store',
                          headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-store'
                          },
                          body: JSON.stringify({
                            user_id: authUserId,
                            keywords: finalKeywords,
                            refreshSeed: Date.now(),
                            source: 'refresh',
                            requestPayload
                          })
                          }).catch(e => console.warn('[Frontend] Failed to save refreshed keywords:', e));
                        }
                      }
                    } catch (e) {
                      console.warn('[Frontend] Refresh keywords failed:', e);
                  } finally {
                    setRefreshingKeywords(false);
                    }
                  }}
                className={`text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 ${refreshingKeywords ? 'opacity-70 cursor-not-allowed' : ''}`}
                  title="Refresh keywords from AI agent"
                disabled={refreshingKeywords}
              >
                {refreshingKeywords ? (
                  <>
                    <span className="inline-block h-3 w-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Refreshing…
                  </>
                ) : (
                  <>
                  🔄 Refresh
                  </>
                )}
              </button>
              </label>
              <input
                type="text"
                id="keywords"
                value={searchData.keywords}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchData(prev => ({ ...prev, keywords: val }));
                  // Save edited keywords to DB (debounce: wait 1s after last change)
                  if (authUserId) {
                    if (keywordsSaveTimeoutRef.current) {
                      clearTimeout(keywordsSaveTimeoutRef.current);
                    }
                    keywordsSaveTimeoutRef.current = setTimeout(async () => {
                      const parts = val.split(',').map(k => k.trim()).filter(Boolean);
                      if (parts.length > 0) {
                        await fetch('/api/user/keywords', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ user_id: authUserId, keywords: parts })
                        }).catch(e => console.warn('[Frontend] Failed to save edited keywords:', e));
                      }
                    }, 1000);
                  }
                }}
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
                className={`w-full px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-teal-600 flex items-center justify-center gap-2 ${loading ? 'opacity-90' : ''}`}
            disabled={loading}
              >
                {loading && (
                  <span className="inline-block h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                )}
                {loading ? `Searching… ${progress}%` : 'Search Jobs'}
          </button>
          {loading && (
            <div className="w-full h-1 bg-gray-200 rounded mt-2 overflow-hidden">
              <div className="h-1 bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        </form>
        </div>
      {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700 mt-4">
                {error}
        </div>
      )}
      {/* Quick Filters and Sort */}
      {results && Array.isArray(results.jobs) && results.jobs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3 bg-white/70">
          <div className="flex flex-wrap gap-2 items-center">
          {/* User's current location filter */}
          {searchData.location && searchData.location.trim() && (
              <button
                type="button"
              onClick={() => {
                const filterKey = `location:${searchData.location}`;
                // Fetch aliases lazily when toggling on
                if (!activeQuickFilters.has(filterKey)) {
                  const city = (searchData.location || '').split(',')[0]?.trim().toLowerCase();
                  if (city && !locationAliasCache[city]) {
                    const aliasApiBase = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || '';
                    const aliasUrl = aliasApiBase
                      ? `${aliasApiBase}/api/geo/city-aliases?city=${encodeURIComponent(city)}`
                      : `/api/geo/city-aliases?city=${encodeURIComponent(city)}`;
                    fetch(aliasUrl)
                      .then(r => r.json())
                      .then(data => {
                        if (data && Array.isArray(data.aliases)) {
                          setLocationAliasCache(prev => ({ ...prev, [city]: data.aliases }));
                        }
                      })
                      .catch(() => {});
                  }
                }
                setActiveQuickFilters(prev => {
                  const next = new Set(prev);
                  if (next.has(filterKey)) {
                    next.delete(filterKey);
                  } else {
                    next.add(filterKey);
                  }
                  return next;
                });
              }}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                activeQuickFilters.has(`location:${searchData.location}`)
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-700 border-teal-300 hover:border-teal-400'
              }`}
            >
              📍 {searchData.location}
              </button>
            )}
          {/* Individual keyword filters */}
          {searchData.keywords && searchData.keywords.trim() && (() => {
            // Parse keywords (comma-separated or space-separated)
            const keywords = searchData.keywords
              .split(/[,\n]/)
              .map(k => k.trim())
              .filter(k => k.length > 0);
            return keywords.map(keyword => (
              <button
                key={`keyword:${keyword}`}
                type="button"
                onClick={() => {
                  const filterKey = `keyword:${keyword}`;
                  setActiveQuickFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(filterKey)) {
                      next.delete(filterKey);
                    } else {
                      next.add(filterKey);
                    }
                    return next;
                  });
                }}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  activeQuickFilters.has(`keyword:${keyword}`)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-teal-300 hover:border-teal-400'
                }`}
              >
                🔍 {keyword}
              </button>
            ));
          })()}
          {/* Remote filter */}
          <button
            type="button"
            onClick={() => {
              const filterKey = 'remote';
              setActiveQuickFilters(prev => {
                const next = new Set(prev);
                if (next.has(filterKey)) {
                  next.delete(filterKey);
                } else {
                  next.add(filterKey);
                }
                return next;
              });
            }}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              activeQuickFilters.has('remote')
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-700 border-teal-300 hover:border-teal-400'
            }`}
          >
            🏠 Remote
          </button>
          {/* Clear all filters button */}
          {activeQuickFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveQuickFilters(new Set())}
              className="px-3 py-1.5 text-sm rounded-full border border-teal-300 bg-white text-gray-700 hover:border-teal-400 transition-colors"
            >
              ✕ Clear filters
              </button>
            )}
            </div>
          {/* Sort by dropdown on the right */}
          <div className="flex-shrink-0 ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'overall' | 'skills' | 'recency' | 'location')}
              className="px-3 py-1.5 text-sm border border-teal-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm hover:border-teal-400 transition-colors"
            >
              <option value="overall">Overall Match</option>
              <option value="skills">Skills Match</option>
              <option value="recency">Recency</option>
              <option value="location">Location</option>
            </select>
          </div>
        </div>
      )}
            {results && Array.isArray(results.jobs) && results.jobs.length > 0 && (
              <div className="mt-8 space-y-4">
                <style jsx>{`
                  @keyframes fadeInSlideUp {
                    from {
                      opacity: 0;
                      transform: translateY(10px);
                    }
                    to {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }
                  .animate-fade-in {
                    animation: fadeInSlideUp 0.4s ease-out;
                  }
                `}</style>
                {(() => {
                  // First, filter and sort jobs
                  const filteredAndSorted = results.jobs
                    .filter(job => !hiddenJobIds.includes(job.id))
                    .filter(job => {
                      // Apply quick filters
                      if (activeQuickFilters.size === 0) return true;
                      
                      // Check location filter (use city aliases via backend geonames)
                      const locationFilter = Array.from(activeQuickFilters).find(f => f.startsWith('location:'));
                      if (locationFilter) {
                        const locationValue = locationFilter.replace('location:', '').toLowerCase();
                        const jobLocation = (job.location || '').toString().toLowerCase();
                        // Extract city from user's location
                        const city = (locationValue.split(',')[0] || '').trim();
                        // Aliases plus raw city and full location string
                        const aliasList = Array.from(new Set([
                          ...(city ? (locationAliasCache[city] || []) : []),
                          city,
                          locationValue
                        ].filter(Boolean) as string[]));
                        const matchesAlias = aliasList.some(alias => alias && jobLocation.includes(alias.toLowerCase()));
                        if (!matchesAlias) return false;
                      }
                      
                      // Check keyword filters (job must match at least one active keyword filter)
                      const keywordFilters = Array.from(activeQuickFilters).filter(f => f.startsWith('keyword:'));
                      if (keywordFilters.length > 0) {
                        const jobTitle = (job.title || '').toString().toLowerCase();
                        const jobDesc = stripHtmlToPlainText(job.description || '').toLowerCase();
                        const matchesAnyKeyword = keywordFilters.some(filterKey => {
                          const keyword = filterKey.replace('keyword:', '').toLowerCase();
                          return jobTitle.includes(keyword) || jobDesc.includes(keyword);
                        });
                        if (!matchesAnyKeyword) {
                          return false;
                        }
                      }
                      
                      // Check remote filter
                      if (activeQuickFilters.has('remote')) {
                        const remoteType = ((job as any).remote_type || '').toString().toLowerCase();
                        const jobLocation = (job.location || '').toString().toLowerCase();
                        if (remoteType !== 'remote' && !jobLocation.includes('remote')) {
                          return false;
                        }
                      }
                      
                      return true;
                    })
                    .sort((a, b) => {
                      if (sortBy === 'overall') {
                        // Sort by last_match_score in descending order
                        const sa = (typeof a.match_score === 'number' ? a.match_score : (typeof (a as any).last_match_score === 'number' ? (a as any).last_match_score : (typeof (a as any).score === 'number' ? (a as any).score : 0)));
                        const sb = (typeof b.match_score === 'number' ? b.match_score : (typeof (b as any).last_match_score === 'number' ? (b as any).last_match_score : (typeof (b as any).score === 'number' ? (b as any).score : 0)));
                        const ca = Math.max(0, Math.min(1, sa));
                        const cb = Math.max(0, Math.min(1, sb));
                        return cb - ca; // Descending (highest first)
                      } else if (sortBy === 'skills') {
                        // Sort by skills match component
                        const componentsA = (a as any).match_components || {};
                        const componentsB = (b as any).match_components || {};
                        const skillsA = typeof componentsA.skills === 'number' ? componentsA.skills : 0;
                        const skillsB = typeof componentsB.skills === 'number' ? componentsB.skills : 0;
                        return skillsB - skillsA; // Descending (highest first)
                      } else if (sortBy === 'recency') {
                        // Sort by recency match component
                        const componentsA = (a as any).match_components || {};
                        const componentsB = (b as any).match_components || {};
                        const recencyA = typeof componentsA.recency === 'number' ? componentsA.recency : 0;
                        const recencyB = typeof componentsB.recency === 'number' ? componentsB.recency : 0;
                        return recencyB - recencyA; // Descending (highest first)
                      } else if (sortBy === 'location') {
                        // Sort by location match component
                        const componentsA = (a as any).match_components || {};
                        const componentsB = (b as any).match_components || {};
                        const locationA = typeof componentsA.location === 'number' ? componentsA.location : 0;
                        const locationB = typeof componentsB.location === 'number' ? componentsB.location : 0;
                        return locationB - locationA; // Descending (highest first)
                      }
                      // Fallback to overall match score
                      const sa = (typeof a.match_score === 'number' ? a.match_score : (typeof (a as any).last_match_score === 'number' ? (a as any).last_match_score : (typeof (a as any).score === 'number' ? (a as any).score : 0)));
                      const sb = (typeof b.match_score === 'number' ? b.match_score : (typeof (b as any).last_match_score === 'number' ? (b as any).last_match_score : (typeof (b as any).score === 'number' ? (b as any).score : 0)));
                      const ca = Math.max(0, Math.min(1, sa));
                      const cb = Math.max(0, Math.min(1, sb));
                      return cb - ca;
                    });
                  
                  // Group jobs by location_tier if available
                  const groupedJobs = filteredAndSorted.reduce((acc, job, idx) => {
                    const locationTier = (job as any).location_tier;
                    if (locationTier) {
                      if (!acc.groups[locationTier]) {
                        acc.groups[locationTier] = [];
                      }
                      acc.groups[locationTier].push({ job, idx });
                    } else {
                      acc.ungrouped.push({ job, idx });
                    }
                    return acc;
                  }, { groups: {} as Record<string, Array<{ job: any, idx: number }>>, ungrouped: [] as Array<{ job: any, idx: number }> });
                  
                  // Disable grouped view: always render as a single continuous list
                  const shouldGroupByLocation = false;
                  
                  if (!shouldGroupByLocation) {
                    // Render ungrouped jobs (normal view)
                    return filteredAndSorted.map((job, idx) => {
                    const rawScore = (typeof job.match_score === 'number' ? job.match_score : (typeof (job as any).last_match_score === 'number' ? (job as any).last_match_score : (typeof (job as any).score === 'number' ? (job as any).score : undefined)));
                    const normalizedScore = typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore)) : undefined;
                    const matchComponents = (job as any).match_components || null;
                    const componentOrder: Array<[keyof typeof matchComponents | string, string]> = [
                      ['keywords', 'Keywords'],
                      ['semantic', 'Semantic'],
                      ['skills', 'Skills'],
                      ['experience', 'Experience'],
                      ['location', 'Location'],
                      ['recency', 'Recency'],
                    ];
                    const componentBadges = matchComponents
                      ? componentOrder
                          .map(([key, label]) => {
                            const value = (matchComponents as any)?.[key];
                            if (typeof value !== 'number') return null;
                            return { label, value };
                          })
                          .filter(Boolean)
                          .map(item => item as { label: string; value: number })
                      : [];
                    const matchDetails = (job as any).match_details || {};
                    const matchedSkills: string[] = Array.isArray(matchDetails?.matched_skills) && matchDetails.matched_skills.length > 0
                      ? matchDetails.matched_skills
                      : (Array.isArray(job.skills_matched) ? job.skills_matched : []);

                    // Check if this is a newly added job (for animation)
                    const isNewJob = (job as any)._isNew && (job as any)._addedAt;
                    const animationDelay = isNewJob 
                      ? '0s' // New jobs animate immediately
                      : `${Math.min(idx * 0.03, 0.5)}s`; // Existing jobs have staggered animation
                    
                    return (
                    <div 
                      key={job.id || job.url || `${job.source}-${job.title}-${job.company}-${idx}`} 
                      className="p-4 mb-3 border rounded-xl shadow-md flex flex-col md:flex-row md:justify-between md:items-start bg-white transition-all duration-300 ease-out hover:scale-[1.04] hover:-translate-y-1 cursor-pointer"
                      style={{
                        animation: 'fadeInSlideUp 0.5s ease-out',
                        animationDelay: animationDelay,
                        animationFillMode: 'both',
                        ...(isNewJob ? {
                          // Highlight new jobs with a subtle border color change
                          borderColor: '#3b82f6',
                          boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)'
                        } : {})
                      }}
                      onMouseEnter={(e) => {
                        if (!isNewJob) {
                          e.currentTarget.style.boxShadow = '0 0 8px 2px rgba(20, 184, 166, 0.3), 0 0 4px 1px rgba(20, 184, 166, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isNewJob) {
                          e.currentTarget.style.boxShadow = '';
                        }
                      }}
                    >
                      <div className="md:max-w-[70%] flex-1">
                        <div className="font-bold text-lg">{job.title}</div>
                        <div className="text-gray-700">{job.company}, {job.location}</div>
                        <div className="text-gray-500 text-sm">
                          {typeof normalizedScore === 'number' ? `${Math.round(normalizedScore * 100)}% match` : ''}
              </div>
                        {componentBadges.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2 text-xs">
                            {componentBadges.map(({ label, value }) => (
                              <span
                                key={`${job.id || job.url}-${label}`}
                                className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                              >
                                {label}: {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
                              </span>
                            ))}
                </div>
      )}
                        {matchedSkills && matchedSkills.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600">
                            {matchedSkills.slice(0, 6).map(skill => (
                              <span key={`${job.id || job.url}-skill-${skill}`} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {skill}
                              </span>
                            ))}
                            {matchedSkills.length > 6 && (
                              <span className="text-gray-400">+{matchedSkills.length - 6} more</span>
                            )}
              </div>
      )}
                        <div className="text-gray-600 text-sm mt-2 min-h-[4.5rem]">
                          {job.description ? (
                            <p>
                              {(() => {
                                // Strip HTML and get plain text for card preview
                                const plainText = stripHtmlToPlainText(job.description);
                                return plainText.length > 220 ? plainText.slice(0, 220) + '…' : plainText;
                              })()}
                            </p>
                          ) : (
                            <div className="space-y-2 animate-pulse">
                              <div className="h-3 bg-gray-200 rounded w-full"></div>
                              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                              <div className="h-3 bg-gray-200 rounded w-4/6"></div>
              </div>
                          )}
              </div>
            </div>
                      <div className="flex gap-2 mt-2 md:mt-0 md:self-start">
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
                  );
                  });
                  }
                  
                  // Helper function to get country code from country name
                  const getCountryCode = (countryName: string): string | null => {
                    if (!countryName) return null;
                    const country = countryName.trim();
                    
                    // Common country name to code mapping
                    const countryMap: Record<string, string> = {
                      'india': 'IN',
                      'united states': 'US',
                      'usa': 'US',
                      'united kingdom': 'GB',
                      'uk': 'GB',
                      'canada': 'CA',
                      'australia': 'AU',
                      'germany': 'DE',
                      'france': 'FR',
                      'spain': 'ES',
                      'italy': 'IT',
                      'netherlands': 'NL',
                      'belgium': 'BE',
                      'switzerland': 'CH',
                      'austria': 'AT',
                      'sweden': 'SE',
                      'norway': 'NO',
                      'denmark': 'DK',
                      'finland': 'FI',
                      'poland': 'PL',
                      'portugal': 'PT',
                      'greece': 'GR',
                      'ireland': 'IE',
                      'japan': 'JP',
                      'china': 'CN',
                      'south korea': 'KR',
                      'singapore': 'SG',
                      'malaysia': 'MY',
                      'thailand': 'TH',
                      'indonesia': 'ID',
                      'philippines': 'PH',
                      'vietnam': 'VN',
                      'brazil': 'BR',
                      'mexico': 'MX',
                      'argentina': 'AR',
                      'chile': 'CL',
                      'colombia': 'CO',
                      'south africa': 'ZA',
                      'egypt': 'EG',
                      'uae': 'AE',
                      'united arab emirates': 'AE',
                      'saudi arabia': 'SA',
                      'israel': 'IL',
                      'turkey': 'TR',
                      'russia': 'RU',
                      'new zealand': 'NZ',
                    };
                    
                    const countryLower = country.toLowerCase();
                    
                    // Check if it's already a 2-letter code
                    if (country.length === 2 && /^[A-Z]{2}$/i.test(country)) {
                      return country.toUpperCase();
                    }
                    
                    // Check if country code is in parentheses (e.g., "India (IN)")
                    const parenMatch = country.match(/\(([A-Z]{2})\)/);
                    if (parenMatch) {
                      return parenMatch[1];
                    }
                    
                    // Look up in mapping
                    return countryMap[countryLower] || null;
                  };
                  
                  // Extract country and code from location
                  const locationStr = resumeData?.personalInfo?.location || '';
                  const locationParts = locationStr.split(',').map(p => p.trim());
                  const countryName = locationParts.length > 1 ? locationParts[locationParts.length - 1] : '';
                  const countryCode = getCountryCode(countryName);
                  const countryDisplay = countryCode 
                    ? `${countryName} (${countryCode})`
                    : countryName || 'Your Country';
                  
                  // Render grouped jobs with headings
                  const tierOrder = ['exact', 'city', 'country', 'other'];
                  const tierLabels: Record<string, string> = {
                    exact: `📍 In ${resumeData?.personalInfo?.location || 'Your Location'}`,
                    city: `🏙️ In ${resumeData?.personalInfo?.location?.split(',')[0] || 'Your City'}`,
                    country: `🌍 In ${countryDisplay}`,
                    other: '🌐 Other Locations',
                  };
                  
                  const elements: React.ReactNode[] = [];
                  let globalIdx = 0;
                  
                  // Render grouped jobs by tier
                  for (const tier of tierOrder) {
                    const groupJobs = groupedJobs.groups[tier] || [];
                    if (groupJobs.length > 0) {
                      // Add heading for this tier
                      elements.push(
                        <div key={`heading-${tier}`} className="mt-6 mb-3 first:mt-0">
                          <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                            {tierLabels[tier]} ({groupJobs.length} {groupJobs.length === 1 ? 'job' : 'jobs'})
                          </h3>
          </div>
                      );
                      
                      // Add jobs for this tier (reuse same rendering logic as ungrouped)
                      groupJobs.forEach(({ job }) => {
                        const rawScore = (typeof job.match_score === 'number' ? job.match_score : (typeof (job as any).last_match_score === 'number' ? (job as any).last_match_score : (typeof (job as any).score === 'number' ? (job as any).score : undefined)));
                        const normalizedScore = typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore)) : undefined;
                        const matchComponents = (job as any).match_components || null;
                        const componentOrder: Array<[keyof typeof matchComponents | string, string]> = [
                          ['keywords', 'Keywords'],
                          ['semantic', 'Semantic'],
                          ['skills', 'Skills'],
                          ['experience', 'Experience'],
                          ['location', 'Location'],
                          ['recency', 'Recency'],
                        ];
                        const componentBadges = matchComponents
                          ? componentOrder
                              .map(([key, label]) => {
                                const value = (matchComponents as any)?.[key];
                                if (typeof value !== 'number') return null;
                                return { label, value };
                              })
                              .filter(Boolean)
                              .map(item => item as { label: string; value: number })
                          : [];
                        const matchDetails = (job as any).match_details || {};
                        const matchedSkills: string[] = Array.isArray(matchDetails?.matched_skills) && matchDetails.matched_skills.length > 0
                          ? matchDetails.matched_skills
                          : (Array.isArray(job.skills_matched) ? job.skills_matched : []);

                        const isNewJob = (job as any)._isNew && (job as any)._addedAt;
                        const animationDelay = isNewJob 
                          ? '0s'
                          : `${Math.min(globalIdx * 0.03, 0.5)}s`;
                        
                        elements.push(
                          <div 
                            key={job.id || job.url || `${job.source}-${job.title}-${job.company}-${globalIdx}`} 
                            className="p-4 mb-3 border rounded-xl shadow-md flex flex-col md:flex-row md:justify-between md:items-start bg-white transition-all duration-300 ease-out hover:scale-[1.04] hover:-translate-y-1 cursor-pointer"
                            style={{
                              animation: 'fadeInSlideUp 0.5s ease-out',
                              animationDelay: animationDelay,
                              animationFillMode: 'both',
                              ...(isNewJob ? {
                                borderColor: '#3b82f6',
                                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)'
                              } : {})
                            }}
                            onMouseEnter={(e) => {
                              if (!isNewJob) {
                                e.currentTarget.style.boxShadow = '0 0 8px 2px rgba(20, 184, 166, 0.3), 0 0 4px 1px rgba(20, 184, 166, 0.2)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isNewJob) {
                                e.currentTarget.style.boxShadow = '';
                              }
                            }}
                          >
                            <div className="md:max-w-[70%] flex-1">
                              <div className="font-bold text-lg">{job.title}</div>
                              <div className="text-gray-700">{job.company}, {job.location}</div>
                              <div className="text-gray-500 text-sm">
                                {typeof normalizedScore === 'number' ? `${Math.round(normalizedScore * 100)}% match` : ''}
                              </div>
                              {componentBadges.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                  {componentBadges.map(({ label, value }) => (
                                    <span
                                      key={`${job.id || job.url}-${label}`}
                                      className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                                    >
                                      {label}: {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
                      </span>
                                  ))}
                                </div>
                              )}
                              {matchedSkills && matchedSkills.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600">
                                  {matchedSkills.slice(0, 6).map(skill => (
                                    <span key={`${job.id || job.url}-skill-${skill}`} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                      {skill}
                        </span>
                                  ))}
                                  {matchedSkills.length > 6 && (
                                    <span className="text-gray-400">+{matchedSkills.length - 6} more</span>
                                  )}
                                </div>
                              )}
                              <div className="text-gray-600 text-sm mt-2 min-h-[4.5rem]">
                                {job.description ? (
                                  <p>
                                    {(() => {
                                      const plainText = stripHtmlToPlainText(job.description);
                                      return plainText.length > 220 ? plainText.slice(0, 220) + '…' : plainText;
                                    })()}
                                  </p>
                                ) : (
                                  <div className="space-y-2 animate-pulse">
                                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                                    <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                                    <div className="h-3 bg-gray-200 rounded w-4/6"></div>
                    </div>
                                )}
                  </div>
                    </div>
                            <div className="flex gap-2 mt-2 md:mt-0 md:self-start">
                    <button
                      type="button"
                                className="px-4 py-2 rounded bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 shadow"
                                onClick={() => { 
                                  onJobSelect && onJobSelect(job);
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
                        );
                        globalIdx++;
                      });
                    }
                  }
                  
                  // Render ungrouped jobs (if any)
                  if (groupedJobs.ungrouped.length > 0) {
                    groupedJobs.ungrouped.forEach(({ job }) => {
                      // Reuse same rendering logic
                      const rawScore = (typeof job.match_score === 'number' ? job.match_score : (typeof (job as any).last_match_score === 'number' ? (job as any).last_match_score : (typeof (job as any).score === 'number' ? (job as any).score : undefined)));
                      const normalizedScore = typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore)) : undefined;
                      const matchComponents = (job as any).match_components || null;
                      const componentOrder: Array<[keyof typeof matchComponents | string, string]> = [
                        ['keywords', 'Keywords'],
                        ['semantic', 'Semantic'],
                        ['skills', 'Skills'],
                        ['experience', 'Experience'],
                        ['location', 'Location'],
                        ['recency', 'Recency'],
                      ];
                      const componentBadges = matchComponents
                        ? componentOrder
                            .map(([key, label]) => {
                              const value = (matchComponents as any)?.[key];
                              if (typeof value !== 'number') return null;
                              return { label, value };
                            })
                            .filter(Boolean)
                            .map(item => item as { label: string; value: number })
                        : [];
                      const matchDetails = (job as any).match_details || {};
                      const matchedSkills: string[] = Array.isArray(matchDetails?.matched_skills) && matchDetails.matched_skills.length > 0
                        ? matchDetails.matched_skills
                        : (Array.isArray(job.skills_matched) ? job.skills_matched : []);

                      const isNewJob = (job as any)._isNew && (job as any)._addedAt;
                      const animationDelay = isNewJob 
                        ? '0s'
                        : `${Math.min(globalIdx * 0.03, 0.5)}s`;
                      
                      elements.push(
                        <div 
                          key={job.id || job.url || `${job.source}-${job.title}-${job.company}-${globalIdx}`} 
                          className="p-4 mb-3 border rounded-xl shadow-md flex flex-col md:flex-row md:justify-between md:items-start bg-white transition-all duration-300 ease-out hover:scale-[1.04] hover:-translate-y-1 cursor-pointer"
                          style={{
                            animation: 'fadeInSlideUp 0.5s ease-out',
                            animationDelay: animationDelay,
                            animationFillMode: 'both',
                            ...(isNewJob ? {
                              borderColor: '#3b82f6',
                              boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)'
                            } : {})
                          }}
                          onMouseEnter={(e) => {
                            if (!isNewJob) {
                              e.currentTarget.style.boxShadow = '0 0 8px 2px rgba(20, 184, 166, 0.3), 0 0 4px 1px rgba(20, 184, 166, 0.2)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isNewJob) {
                              e.currentTarget.style.boxShadow = '';
                            }
                          }}
                        >
                          <div className="md:max-w-[70%] flex-1">
                            <div className="font-bold text-lg">{job.title}</div>
                            <div className="text-gray-700">{job.company}, {job.location}</div>
                            <div className="text-gray-500 text-sm">
                              {typeof normalizedScore === 'number' ? `${Math.round(normalizedScore * 100)}% match` : ''}
                            </div>
                            {componentBadges.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                {componentBadges.map(({ label, value }) => (
                        <span
                                    key={`${job.id || job.url}-${label}`}
                                    className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                        >
                                    {label}: {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
                        </span>
                      ))}
                              </div>
                            )}
                            {matchedSkills && matchedSkills.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600">
                                {matchedSkills.slice(0, 6).map(skill => (
                                  <span key={`${job.id || job.url}-skill-${skill}`} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    {skill}
                        </span>
                                ))}
                                {matchedSkills.length > 6 && (
                                  <span className="text-gray-400">+{matchedSkills.length - 6} more</span>
                      )}
                    </div>
                )}
                            <div className="text-gray-600 text-sm mt-2 min-h-[4.5rem]">
                              {job.description ? (
                                <p>
                                  {(() => {
                                    const plainText = stripHtmlToPlainText(job.description);
                                    return plainText.length > 220 ? plainText.slice(0, 220) + '…' : plainText;
                                  })()}
                                </p>
                              ) : (
                                <div className="space-y-2 animate-pulse">
                                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                                  <div className="h-3 bg-gray-200 rounded w-4/6"></div>
                  </div>
                )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2 md:mt-0 md:self-start">
                            <button
                              type="button"
                              className="px-4 py-2 rounded bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 shadow"
                              onClick={() => { 
                                onJobSelect && onJobSelect(job);
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
                      );
                      globalIdx++;
                    });
                  }
                  
                  return elements;
                })()}
                
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
                          // Always allow trying to load the next page; backend will signal when there are no more results
                            setCurrentPage(prev => prev + 1);
                        }}
                        disabled={paginationLoading}
                        className={`px-4 py-2 rounded-md text-sm font-medium ${
                          !paginationLoading
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
                              onClick={() => handleOpenGmail(r.mailto, r.contact, r.templates)}
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
                          {r.contact?.linkedinUrl && (
        <button
                              onClick={() => handleLinkedInOpen(r.contact, r.templates)}
                              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                              LinkedIn
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
      {/* Resume Preview Overlay for Gmail Draft */}
      {showResumeTemplateOverlay && overlayResume && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl rounded-md bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <select 
                  value={selectedTemplate} 
                  onChange={(e) => {
                    const template = e.target.value;
                    setSelectedTemplate(template);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('selectedTemplate', template);
                      }
                    } catch (_) {}
                    // Recalculate ATS when template changes
                    if (overlayResume && overlayJD) {
                      void recalcOverlayATS(overlayResume, overlayJD);
                    }
                  }} 
                  className="border rounded px-2 py-1 text-sm"
                >
                  {/* Match JD Builder templates */}
                  <option value="template-01">Professional creative</option>
                  <option value="template-02">Template 2</option>
                  <option value="template-04">Template 3</option>
                  <option value="minimal">Minimal</option>
                  <option value="skyline">Skyline Signature</option>
                </select>
                <div className="flex items-center gap-3 text-sm">
                  <span>
                  {overlayBusy ? 'Calculating ATS…' : overlayAts ? `ATS: ${Math.round(overlayAts.score)}` : 'ATS: —'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowOverlayJDPanel((v) => !v)}
                    className="px-3 py-1 rounded border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    {showOverlayJDPanel ? 'Hide ATS Options' : 'Improve ATS here'}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setShowResumeTemplateOverlay(false);
                    setPendingGmailContext(null);
                    setOverlayResume(null);
                    setOverlayJD('');
                    setOverlayAts(null);
                  }} 
                  className="rounded px-3 py-1.5 text-sm hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={proceedGmailWithTemplate} 
                  disabled={recruitersLoading}
                  className="rounded bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {recruitersLoading ? 'Creating Draft...' : 'Use & Draft'}
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {showOverlayJDPanel && (
                <div className="border rounded p-3 bg-gray-50 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium">ATS Optimizer</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (overlayResume) {
                            void recalcOverlayATS(overlayResume, overlayJD || '');
                          }
                        }}
                        className="px-3 py-1 rounded bg-gray-900 text-white text-xs font-medium hover:bg-gray-800"
                      >
                        Recalculate ATS
                      </button>
                      <button
                        type="button"
                        onClick={runOverlayAtsSuggestions}
                        className="px-3 py-1 rounded border border-indigo-300 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        {overlaySuggestionLoading ? 'Analyzing…' : 'Analyze & Suggest Improvements'}
                      </button>
                    </div>
                  </div>

                  {overlayAts && overlayAts.matchedKeywords && overlayAts.matchedKeywords.length > 0 && (
                    <div className="text-[11px] text-gray-600">
                      <div className="font-medium mb-1">Currently matched keywords:</div>
                      <div className="flex flex-wrap gap-1">
                        {overlayAts.matchedKeywords.slice(0, 20).map((kw) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {overlaySuggestions && (
                    <div className="space-y-3 text-xs text-gray-700">
                      {overlaySuggestions.missingKeywords.length > 0 && (
                        <div className="border rounded-md border-amber-200 bg-amber-50 p-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-amber-900">Suggested keywords to add</div>
                            <button
                              type="button"
                              onClick={() => {
                                const currentSkills: string[] = Array.isArray(overlayResume?.skills)
                                  ? overlayResume.skills
                                  : [];
                                const merged = Array.from(
                                  new Set([...currentSkills, ...overlaySuggestions.missingKeywords]),
                                );
                                const newData = { ...overlayResume, skills: merged };
                                setOverlayResume(newData);
                                try {
                                  if (typeof window !== 'undefined') {
                                    window.localStorage.setItem('resumeData', JSON.stringify(newData));
                                  }
                                } catch (_) {}
                              }}
                              className="px-3 py-1 rounded bg-amber-600 text-white text-[11px] font-medium hover:bg-amber-700"
                            >
                              Add to Skills
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {overlaySuggestions.missingKeywords.slice(0, 25).map((kw) => (
                              <span
                                key={kw}
                                className="px-2 py-0.5 rounded-full bg-white text-amber-900 border border-amber-300"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {overlaySuggestions.suggestedSummary && (
                        <div className="border rounded-md border-purple-200 bg-purple-50 p-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-purple-900">Suggested summary</div>
                            <button
                              type="button"
                              onClick={() => {
                                const newData = {
                                  ...overlayResume,
                                  personalInfo: {
                                    ...(overlayResume.personalInfo || {}),
                                    summary: overlaySuggestions.suggestedSummary,
                                  },
                                };
                                setOverlayResume(newData);
                                try {
                                  if (typeof window !== 'undefined') {
                                    window.localStorage.setItem('resumeData', JSON.stringify(newData));
                                  }
                                } catch (_) {}
                              }}
                              className="px-3 py-1 rounded bg-purple-600 text-white text-[11px] font-medium hover:bg-purple-700"
                            >
                              Use this summary
                            </button>
                          </div>
                          <div className="text-[11px] text-purple-800 whitespace-pre-wrap">
                            {overlaySuggestions.suggestedSummary}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="border rounded p-3 overflow-auto">
                <div className="text-sm font-medium mb-2">Resume Preview</div>
                <div className="print-optimized" ref={previewRef}>
                  <ResumePreview 
                    resumeData={overlayResume} 
                    selectedTemplate={selectedTemplate} 
                    atsScore={overlayAts ? { score: overlayAts.score, feedback: '', matchedKeywords: overlayAts.matchedKeywords || [] } : null}
                    keywordMatches={overlayAts?.matchedKeywords || []}
                    resumeType={"generated"}
                    extractedData={null}
                    uploadedFiles={{ resume: null, profile: null }}
                    previewRef={previewRef}
                    inputJD={overlayJD}
                    editable={true}
                    onResumeDataChange={(newResume) => {
                      setOverlayResume(newResume);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newResume));
                        }
                      } catch (_) {}
                    }}
                    onSectionClick={(section, index) => {
                      setOverlayEditingSection(section);
                      setOverlayEditingIndex(index ?? null);
                    }}
                    onProfileUpload={async (file: File) => {
                      try {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result as string);
                          reader.onerror = (err) => reject(err);
                          reader.readAsDataURL(file);
                        });
                        const newData = {
                          ...overlayResume,
                          personalInfo: {
                            ...(overlayResume.personalInfo || {}),
                            profileImageDataUrl: dataUrl,
                          },
                        };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      } catch (e) {
                        console.error('Error processing profile image upload:', e);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Edit Modal for overlay resume (reusing ResumeEditor-style editors) */}
      {overlayEditingSection === 'experience' && overlayResume && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100]"
          onClick={() => setOverlayEditingSection(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setOverlayEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">Edit Professional Experience</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                <input
                  type="text"
                  value={overlayResume.sectionTitles?.experience || ''}
                  onChange={(e) => {
                    const newData = {
                      ...overlayResume,
                      sectionTitles: {
                        ...(overlayResume.sectionTitles || {}),
                        experience: e.target.value || undefined,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Professional Experience"
                />
              </div>
              {overlayResume.experience.map((exp: any, idx: number) => (
                <div
                  key={exp.id || idx}
                  className="rounded-lg p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-gray-900">Experience {idx + 1}</h4>
                    <button
                      onClick={() => {
                        const newExp = overlayResume.experience.filter((_: any, i: number) => i !== idx);
                        const newData = { ...overlayResume, experience: newExp };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      }}
                      className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete experience"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                      <input
                        type="text"
                        value={exp.title}
                        onChange={(e) => {
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, title: e.target.value };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                      <input
                        type="text"
                        value={exp.company}
                        onChange={(e) => {
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, company: e.target.value };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={exp.location}
                        onChange={(e) => {
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, location: e.target.value };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <input
                        type="text"
                        value={exp.startDate || ''}
                        onChange={(e) => {
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, startDate: e.target.value };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Oct. 2024 or MM/YYYY"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="text"
                        value={exp.endDate || ''}
                        onChange={(e) => {
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, endDate: e.target.value };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Oct. 2025 or MM/YYYY"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                      <span className="text-xs text-gray-500 ml-2">
                        (Tip: One bullet per line; wrap text with **asterisks** to make it bold)
                      </span>
                    </label>
                    <textarea
                      id={`overlay-exp-desc-${idx}`}
                      value={(exp.description && Array.isArray(exp.description) ? exp.description.join('\n') : exp.description || '')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const newExp = [...overlayResume.experience];
                        newExp[idx] = { ...exp, description: lines };
                        const newData = { ...overlayResume, experience: newExp };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[120px]"
                      placeholder="Add bullet points for this role... (one per line)"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById(`overlay-exp-desc-${idx}`) as HTMLTextAreaElement | null;
                          if (!textarea) return;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const text =
                            (exp.description && Array.isArray(exp.description)
                              ? exp.description.join('\n')
                              : exp.description || '');
                          const selectedText = text.substring(start, end);
                          let newText: string;
                          if (selectedText) {
                            newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
                          } else {
                            newText = text.substring(0, start) + '****' + text.substring(end);
                          }
                          const lines = newText.split('\n');
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, description: lines };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                          setTimeout(() => {
                            textarea.focus();
                            if (selectedText) {
                              textarea.setSelectionRange(start, end + 4);
                            } else {
                              textarea.setSelectionRange(start + 2, start + 2);
                            }
                          }, 0);
                        }}
                        className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                      >
                        B Bold
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById(`overlay-exp-desc-${idx}`) as HTMLTextAreaElement | null;
                          const text =
                            (exp.description && Array.isArray(exp.description)
                              ? exp.description.join('\n')
                              : exp.description || '');
                          const newText = text.replace(/\*\*/g, '');
                          const lines = newText.split('\n');
                          const newExp = [...overlayResume.experience];
                          newExp[idx] = { ...exp, description: lines };
                          const newData = { ...overlayResume, experience: newExp };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                          if (textarea) {
                            setTimeout(() => {
                              textarea.focus();
                            }, 0);
                          }
                        }}
                        className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                      >
                        Clear Bold
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {overlayEditingSection === 'personalInfo' && overlayResume && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100]"
          onClick={() => setOverlayEditingSection(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setOverlayEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">Edit Personal Information</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={overlayResume.personalInfo?.fullName || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          fullName: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Your Full Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={overlayResume.personalInfo?.title || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          title: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Your Professional Title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={overlayResume.personalInfo?.email || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          email: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="your.email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={overlayResume.personalInfo?.phone || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          phone: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={overlayResume.personalInfo?.location || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          location: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="City, Country"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
                  <input
                    type="text"
                    value={overlayResume.personalInfo?.linkedin || ''}
                    onChange={(e) => {
                      const newData = {
                        ...overlayResume,
                        personalInfo: {
                          ...(overlayResume.personalInfo || {}),
                          linkedin: e.target.value,
                        },
                      };
                      setOverlayResume(newData);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('resumeData', JSON.stringify(newData));
                        }
                      } catch (_) {}
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="linkedin.com/in/yourprofile"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {overlayEditingSection === 'summary' && overlayResume && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100]"
          onClick={() => setOverlayEditingSection(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setOverlayEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">Edit Professional Summary</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                <input
                  type="text"
                  value={overlayResume.sectionTitles?.summary || ''}
                  onChange={(e) => {
                    const newData = {
                      ...overlayResume,
                      sectionTitles: {
                        ...(overlayResume.sectionTitles || {}),
                        summary: e.target.value || undefined,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-4"
                  placeholder="Professional Summary"
                />
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Content
                <span className="text-xs text-gray-500 ml-2">
                  (Tip: Wrap text with **asterisks** to make it bold)
                </span>
              </label>
              <textarea
                id="overlay-summary-textarea"
                value={overlayResume.personalInfo?.summary || ''}
                onChange={(e) => {
                  const newData = {
                    ...overlayResume,
                    personalInfo: {
                      ...(overlayResume.personalInfo || {}),
                      summary: e.target.value,
                    },
                  };
                  setOverlayResume(newData);
                  try {
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem('resumeData', JSON.stringify(newData));
                    }
                  } catch (_) {}
                }}
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[200px]"
                placeholder="Enter your professional summary... (use **text** for bold)"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('overlay-summary-textarea') as HTMLTextAreaElement | null;
                    if (!textarea) return;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = overlayResume.personalInfo?.summary || '';
                    const selectedText = text.substring(start, end);
                    let newText: string;
                    if (selectedText) {
                      newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
                    } else {
                      newText = text.substring(0, start) + '****' + text.substring(end);
                    }
                    const newData = {
                      ...overlayResume,
                      personalInfo: {
                        ...(overlayResume.personalInfo || {}),
                        summary: newText,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                    setTimeout(() => {
                      textarea.focus();
                      if (selectedText) {
                        textarea.setSelectionRange(start, end + 4);
                      } else {
                        textarea.setSelectionRange(start + 2, start + 2);
                      }
                    }, 0);
                  }}
                  className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                >
                  B Bold
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const textarea = document.getElementById('overlay-summary-textarea') as HTMLTextAreaElement | null;
                    const text = overlayResume.personalInfo?.summary || '';
                    const newText = text.replace(/\*\*/g, '');
                    const newData = {
                      ...overlayResume,
                      personalInfo: {
                        ...(overlayResume.personalInfo || {}),
                        summary: newText,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                    if (textarea) {
                      setTimeout(() => {
                        textarea.focus();
                      }, 0);
                    }
                  }}
                  className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                >
                  Clear Bold
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {overlayEditingSection === 'skills' && overlayResume && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100]"
          onClick={() => setOverlayEditingSection(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setOverlayEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">Edit Skills</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                <input
                  type="text"
                  value={overlayResume.sectionTitles?.skills || ''}
                  onChange={(e) => {
                    const newData = {
                      ...overlayResume,
                      sectionTitles: {
                        ...(overlayResume.sectionTitles || {}),
                        skills: e.target.value || undefined,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-4"
                  placeholder="Core Competencies"
                />
              </div>
              <label className="block text-sm font-medium text-gray-700">Skills</label>
              <div className="space-y-2">
                {(overlayResume.skills || []).map((skill: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={skill}
                      onChange={(e) => {
                        const newSkills = [...(overlayResume.skills || [])];
                        newSkills[idx] = e.target.value;
                        const newData = { ...overlayResume, skills: newSkills };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      }}
                      className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <button
                      onClick={() => {
                        const newSkills = (overlayResume.skills || []).filter((_: any, i: number) => i !== idx);
                        const newData = { ...overlayResume, skills: newSkills };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Delete skill"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newSkills = [...(overlayResume.skills || []), ''];
                    const newData = { ...overlayResume, skills: newSkills };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                  }}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600"
                >
                  + Add Skill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {overlayEditingSection === 'education' && overlayResume && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100]"
          onClick={() => setOverlayEditingSection(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setOverlayEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">Edit Education</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                <input
                  type="text"
                  value={overlayResume.sectionTitles?.education || ''}
                  onChange={(e) => {
                    const newData = {
                      ...overlayResume,
                      sectionTitles: {
                        ...(overlayResume.sectionTitles || {}),
                        education: e.target.value || undefined,
                      },
                    };
                    setOverlayResume(newData);
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('resumeData', JSON.stringify(newData));
                      }
                    } catch (_) {}
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Education & Credentials"
                />
              </div>
              {(overlayResume.education || []).map((edu: any, idx: number) => (
                <div
                  key={edu.id || idx}
                  className="rounded-lg p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-gray-900">Education {idx + 1}</h4>
                    <button
                      onClick={() => {
                        const newEdu = (overlayResume.education || []).filter((_: any, i: number) => i !== idx);
                        const newData = { ...overlayResume, education: newEdu };
                        setOverlayResume(newData);
                        try {
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('resumeData', JSON.stringify(newData));
                          }
                        } catch (_) {}
                      }}
                      className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete education"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Degree</label>
                      <input
                        type="text"
                        value={edu.degree || ''}
                        onChange={(e) => {
                          const newEdu = [...(overlayResume.education || [])];
                          newEdu[idx] = { ...edu, degree: e.target.value };
                          const newData = { ...overlayResume, education: newEdu };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                      <input
                        type="text"
                        value={edu.institution || ''}
                        onChange={(e) => {
                          const newEdu = [...(overlayResume.education || [])];
                          newEdu[idx] = { ...edu, institution: e.target.value };
                          const newData = { ...overlayResume, education: newEdu };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={edu.location || ''}
                        onChange={(e) => {
                          const newEdu = [...(overlayResume.education || [])];
                          newEdu[idx] = { ...edu, location: e.target.value };
                          const newData = { ...overlayResume, education: newEdu };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                      <input
                        type="text"
                        value={edu.year || ''}
                        onChange={(e) => {
                          const newEdu = [...(overlayResume.education || [])];
                          newEdu[idx] = { ...edu, year: e.target.value };
                          const newData = { ...overlayResume, education: newEdu };
                          setOverlayResume(newData);
                          try {
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem('resumeData', JSON.stringify(newData));
                            }
                          } catch (_) {}
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    {/* Bottom transient notice */}
    {noMoreJobsToast && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="px-4 py-2 rounded-md bg-gray-900/90 text-white text-sm shadow-lg">
          Please Adjust keywords to get more results.
        </div>
      </div>
    )}
    </div>
  );
}
