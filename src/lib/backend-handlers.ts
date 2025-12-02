import { ResumeData, PersonalInfo, Experience, Education, Project } from '../types/resume-types';

// Configuration for APIs
const API_CONFIG = {
  OPENAI_API_KEY: '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',
  MAX_TOKENS: 16000,
  MODEL: 'gpt-4o', // Using GPT-4o for file analysis
  // Optional external services (set via env or here for local dev)
  SERPAPI_KEY: process.env.SERPAPI_KEY || '2d68960274bc67a3e843b93eb270609aa9210b71d898cc1f60b21ec7313489f2',
  HUNTER_API_KEY: process.env.HUNTER_API_KEY || '6d031a75c9e3377fe321b39a9de8dae83403f6f2',
};

export class BackendHandlers {
  /**
   * Discover recruiter / hiring manager contacts for a given job
   * Tries LinkedIn profile discovery (via SerpAPI) and email enrichment (via Hunter.io) when keys available
   */
  static async findRecruiterContactsForJob(params: {
    jobTitle: string;
    company: string;
    location?: string;
  }): Promise<Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number; // 0-1
    source: string;
  }>> {
    // Enforce required API keys (no fallbacks)
    if (!API_CONFIG.SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY is required');
    }
    if (!API_CONFIG.HUNTER_API_KEY) {
      throw new Error('HUNTER_API_KEY is required');
    }

    const results: Array<{ name: string; title: string; company: string; linkedinUrl?: string; email?: string; confidence: number; source: string; }> = [];

    const { jobTitle, company, location } = params;
    const roleKeywords = ['Recruiter', 'Talent Acquisition', 'TA', 'Hiring Manager', 'HR Manager', 'Technical Recruiter', 'People Ops'];

    // 1) LinkedIn profile discovery via SerpAPI (Google)
    const query = `site:linkedin.com/in (${roleKeywords.join(' OR ')}) ${company} ${location || ''}`.trim();
    const normalize = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s&]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const companyNorm = normalize(company);
    const rootFromDomain = (domain: string | null): string | null => {
      if (!domain) return null;
      try {
        const parts = domain.split('.').filter(Boolean);
        if (parts.length >= 2) return normalize(parts[parts.length - 2]);
      } catch {}
      return null;
    };

    const buildCompanyAliases = (rawCompany: string, domain: string | null): string[] => {
      const base = normalize(rawCompany)
        .replace(/\b(incorporated|inc|llc|ltd|co|corp|company|group|holdings?|ag|gmbh|plc|pvt)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const aliases = new Set<string>([base, companyNorm]);
      const root = rootFromDomain(domain);
      if (root) aliases.add(root);
      return Array.from(aliases).filter(Boolean);
    };
    const roleKeywordsNorm = roleKeywords.map(k => normalize(k));

    const looksLikeCompanyMatch = (title: string, snippet: string | undefined, aliases: string[]): { matched: boolean; reason: string } => {
      const t = normalize(title);
      const s = normalize(snippet || '');

      // Extract explicit company candidates from common patterns
      const candidateCompanies: string[] = [];
      const pushCandidate = (raw?: string) => {
        if (!raw) return;
        const n = normalize(raw).replace(/^@\s*/, '').trim();
        if (n && !candidateCompanies.includes(n)) candidateCompanies.push(n);
      };
      // Patterns: "@ Company", " at Company", " with Company", " for Company"
      const patternPairs: Array<[RegExp, number]> = [
        [/\s@\s*([a-z0-9 &._-]{2,})/, 1],
        [/\sat\s+([a-z0-9 &._-]{2,})/, 1],
        [/\swith\s+([a-z0-9 &._-]{2,})/, 1],
        [/\sfor\s+([a-z0-9 &._-]{2,})/, 1],
        [/on\s+behalf\s+of\s+([a-z0-9 &._-]{2,})/, 1]
      ];
      for (const [rx] of patternPairs) {
        const mt = t.match(rx) || s.match(rx);
        if (mt && mt[1]) pushCandidate(mt[1]);
      }

      // If a clear different company is stated (e.g., "on behalf of X") and not our target, reject
      if (candidateCompanies.length > 0) {
        const hasExact = candidateCompanies.some(c => aliases.includes(c));
        const hasDifferent = candidateCompanies.some(c => !aliases.includes(c));
        if (hasExact && !hasDifferent) return { matched: true, reason: 'explicit-company-match' };
        if (!hasExact && hasDifferent) return { matched: false, reason: 'explicit-company-mismatch' };
      }

      if (aliases.some(a => t.includes(a))) return { matched: true, reason: 'title-contains-company' };
      if (aliases.some(a => s.includes(a))) return { matched: true, reason: 'snippet-contains-company' };
      // Heuristic: if title includes a hyphen section that equals company
      const parts = t.split(' - ').map(p => p.trim());
      if (parts.some(p => aliases.includes(p))) return { matched: true, reason: 'title-segment-equals-company' };
      return { matched: false, reason: 'no-company-match' };
    };

    const searchOnce = async (q: string, label: string) => {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&engine=google&num=30&hl=en&gl=us&api_key=${API_CONFIG.SERPAPI_KEY}`;
      const resp = await fetch(url);
      console.log(`[SerpAPI:${label}] url=`, url);
      console.log(`[SerpAPI:${label}] status=`, resp.status);
      if (!resp.ok) throw new Error(`SerpAPI HTTP ${resp.status}`);
      const data = await resp.json();
      const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
      console.log(`[SerpAPI:${label}] organic_results=`, organic.length);
      for (const item of organic) {
        console.log('[SerpAPI:debug] raw item:', JSON.stringify({
          title: item.title,
          snippet: item.snippet,
          link: item.link
        }, null, 2));
        const link: string | undefined = item.link;
        const title: string = String(item.title || '');
        const snippet: string | undefined = item.snippet || item.snippet_highlighted_words?.join(' ');
        const isLinkedIn = !!link && /linkedin\.com\/(in|pub)\//i.test(link);
        
        // For non-LinkedIn results, check if they contain LinkedIn links in snippet
        const hasLinkedInInSnippet = !isLinkedIn && snippet && /linkedin\.com\/(in|pub)\//i.test(snippet);
        
        if (!link || (!isLinkedIn && !hasLinkedInInSnippet)) continue;

        // Get company aliases first for filtering
        const domain = await this.findCompanyDomain(company);
        const companyAliases = buildCompanyAliases(company, domain);

        // Heuristic parse of name and title
        // Prefer parsing from title; fallback to link path segment
        let name = '';
        let role = 'Recruiter';
        if (title) {
          const cleaned = title.replace(' | LinkedIn', '');
          const parts = cleaned.split(' - ');
          name = parts[0] || '';
          role = parts[1] || role;
        }
        if (!name) {
          try {
            const u = new URL(link);
            const seg = u.pathname.split('/').filter(Boolean)[1] || '';
            name = decodeURIComponent(seg).replace(/[-_]/g, ' ').trim();
          } catch {}
        }

        // CRITICAL: Reject if person's name contains the company name (common false positive)
        const nameNorm = normalize(name);
        const companyInName = companyAliases.some(alias => nameNorm.includes(alias));
        if (companyInName) {
          console.log('[SerpAPI:filter] rejecting - company name in person name', { name, companyAliases });
          continue;
        }
        console.log('[SerpAPI:debug] company aliases:', companyAliases);
        const companyCheck = looksLikeCompanyMatch(title, snippet, companyAliases);
        console.log('[SerpAPI:debug] company check result:', companyCheck);
        if (!companyCheck.matched) {
          console.log('[SerpAPI:filter]', 'rejecting due to company mismatch', { name, link, reason: companyCheck.reason });
          continue;
        }

        // Require role alignment to recruiting/talent roles to avoid false positives like "Executive Assistant"
        const tNorm = normalize(title);
        const sNorm = normalize(snippet || '');
        const roleMatch = roleKeywordsNorm.some(k => tNorm.includes(k) || sNorm.includes(k));
        console.log('[SerpAPI:debug] role match check:', { tNorm, sNorm, roleKeywordsNorm, roleMatch });
        if (!roleMatch) {
          console.log('[SerpAPI:filter]', 'rejecting due to role mismatch', { name, link, title });
          continue;
        }

        results.push({
          name,
          title: role,
          company,
          linkedinUrl: link,
          confidence: 0.7,
          source: 'serpapi-google'
        });
      }
    };

    try {
      // Try different search strategies
      const strategies = [
        // Strategy 1: Direct LinkedIn search
        {
          query: `site:linkedin.com/in ${company} recruiter`,
          label: 'direct-linkedin'
        },
        // Strategy 2: Google search with LinkedIn filter
        {
          query: `${company} recruiter hiring manager talent acquisition`,
          label: 'google-general'
        },
        // Strategy 3: Company-specific search
        {
          query: `"${company}" "talent acquisition" OR "hiring manager" OR "recruiter"`,
          label: 'company-quoted'
        },
        // Strategy 4: Location-based if provided
        ...(location ? [{
          query: `${company} recruiter ${location}`,
          label: 'with-location'
        }] : [])
      ];
      
      for (const strategy of strategies) {
        if (results.length > 0) break;
        console.log(`[SerpAPI:${strategy.label}] trying:`, strategy.query);
        await searchOnce(strategy.query, strategy.label);
      }
      
      // If still no results, try a very broad search
      if (results.length === 0) {
        console.log('[SerpAPI:broad] trying broad search');
        await searchOnce(`recruiter talent acquisition hiring manager`, 'broad');
      }
    } catch (e) {
      console.log('SerpAPI lookup failed:', e);
      // Do not rethrow; allow flow to continue so endpoint can return empty set gracefully
    }

    // 2) Email enrichment via Hunter.io using company domain + name (optional, non-fatal)
    if (results.length > 0) {
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const domain = await this.findCompanyDomain(company);
      console.log('[Hunter] resolved domain:', domain || '(none)');
      if (!domain) {
        console.log('[Hunter] domain missing; skipping email enrichment');
      } else {
        for (const contact of results) {
          if (!contact.name) continue;
          try {
            const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&full_name=${encodeURIComponent(contact.name)}&api_key=${API_CONFIG.HUNTER_API_KEY}`;
            const safeUrl = url.replace(/api_key=[^&]+/, 'api_key=***');
            console.log('[Hunter] email-finder url:', safeUrl);

            let resp: Response | null = null;
            const maxAttempts = 3;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              resp = await fetch(url).catch((err: any) => {
                console.log('[Hunter] fetch error on attempt', attempt, err);
                return null as any;
              });
              const status = resp?.status ?? 0;
              console.log('[Hunter] email-finder status (attempt', attempt + ')', status);
              if (resp && resp.ok) break;
              // Retry only on 5xx or network error
              if (!resp || (status >= 500 && status < 600)) {
                const delayMs = 300 * attempt;
                console.log('[Hunter] retrying after', delayMs, 'ms');
                await sleep(delayMs);
                continue;
              }
              break;
            }

            if (!resp || !resp.ok) {
              let txt = '';
              try { txt = await resp?.text?.() as any; } catch {}
              console.log('[Hunter] non-OK response body:', (txt || '').slice(0, 300));
              continue; // do not fail the whole request
            }

            const data = await resp.json();
            const email: string | undefined = data?.data?.email;
            const score: number | undefined = data?.data?.score;
            console.log('[Hunter] parsed email:', email || '(none)', 'score:', score ?? '(n/a)');
            if (email) {
              contact.email = email;
              contact.confidence = Math.max(contact.confidence, typeof score === 'number' ? Math.min(score / 100, 1) : 0.8);
              contact.source += '+hunter';
            }
          } catch (e) {
            console.log('[Hunter] email finder failed for', contact.name, e);
            // continue without email instead of throwing
          }
        }
      }
    }

    // De-duplicate by name/link
    const deduped: typeof results = [];
    const seen = new Set<string>();
    for (const r of results) {
      const key = `${r.name}|${r.linkedinUrl || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    return deduped;
  }

  /** Resolve company domain using Hunter.io domain search (optional) */
  private static async findCompanyDomain(company: string): Promise<string | null> {
    console.log('[Hunter] findCompanyDomain called for:', company);
    console.log('[Hunter] API key exists:', !!API_CONFIG.HUNTER_API_KEY);
    console.log('[Hunter] API key length:', API_CONFIG.HUNTER_API_KEY?.length || 0);
    
    if (!API_CONFIG.HUNTER_API_KEY) {
      console.log('[Hunter] No API key, returning null');
      return null;
    }
    
    try {
      const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&api_key=${API_CONFIG.HUNTER_API_KEY}`;
      console.log('[Hunter] API URL:', url.replace(API_CONFIG.HUNTER_API_KEY, '***'));
      
      const resp = await fetch(url);
      console.log('[Hunter] API response status:', resp.status);
      
      if (!resp.ok) {
        console.log('[Hunter] API failed:', resp.status, resp.statusText);
        const errorText = await resp.text();
        console.log('[Hunter] error response:', errorText);
        return null;
      }
      
      const data = await resp.json();
      console.log('[Hunter] API response data:', JSON.stringify(data, null, 2));
      
      const domain: string | undefined = data?.data?.domain;
      console.log('[Hunter] extracted domain:', domain || '(none)');
      return domain || null;
    } catch (e) {
      console.log('[Hunter] findCompanyDomain failed:', e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /**
   * Build compelling outreach messages with dynamic metrics from resume data
   */
  static buildOutreachTemplates(params: {
    candidateName: string;
    targetRole: string;
    company: string;
    recruiterName?: string;
    resumeData?: any; // ResumeData type
  }): { subject: string; emailBody: string; linkedinMessage: string } {
    const { candidateName, targetRole, company, recruiterName, resumeData } = params;
    const greeting = recruiterName ? `Hi ${recruiterName},` : 'Hi there,';

    // Extract dynamic metrics from resume data
    const metrics = this.extractResumeMetrics(resumeData);
    const skills = this.extractTopSkills(resumeData);
    const achievements = this.extractAchievements(resumeData);
    const experience = this.extractRelevantExperience(resumeData, targetRole);

    // More compelling subject line - subtle and professional
    const subject = `Re: ${targetRole} position at ${company}`;
    
    // Enhanced email body with dynamic metrics
    const emailBody = `${greeting}

I'm ${candidateName}, a ${targetRole} with a track record of delivering results and driving innovation.

🚀 PROVEN IMPACT:
${metrics.length > 0 ? metrics.map(m => `• ${m}`).join('\n') : '• Delivered measurable results in previous roles'}

💡 KEY SKILLS & EXPERTISE:
${skills.length > 0 ? skills.map(s => `• ${s}`).join('\n') : '• Strong technical foundation and problem-solving abilities'}

${achievements.length > 0 ? `🏆 NOTABLE ACHIEVEMENTS:\n${achievements.map(a => `• ${a}`).join('\n')}\n\n` : ''}🎯 WHY ${company.toUpperCase()}:
Your mission resonates with my passion for building products that matter. I'm excited about the opportunity to bring my problem-solving mindset and proven track record to your team.

Would you be open to a 15-minute call this week to discuss how I can contribute to ${company}'s success?

Best regards,
${candidateName}

P.S. Please find my resume attached with detailed metrics`;

    const linkedinMessage = `${greeting} I'm a ${targetRole} with a track record of delivering measurable results and driving innovation. I'd love to discuss how I can contribute to ${company}'s success. Available for a quick chat this week? – ${candidateName}`;

    return { subject, emailBody, linkedinMessage };
  }

  /**
   * Extract quantifiable metrics from resume data
   */
  private static extractResumeMetrics(resumeData: any): string[] {
    if (!resumeData) return [];
    
    const metrics: string[] = [];
    const experience = resumeData.experience || [];
    const achievements = resumeData.achievements || [];
    
    // Extract metrics from experience descriptions
    experience.forEach((exp: any) => {
      if (exp.description) {
        exp.description.forEach((desc: string) => {
          // Look for percentage improvements
          const percentMatch = desc.match(/(\d+%)/g);
          if (percentMatch) {
            metrics.push(`Improved ${desc.toLowerCase()}`);
          }
          // Look for dollar amounts
          const dollarMatch = desc.match(/\$[\d,]+/g);
          if (dollarMatch) {
            metrics.push(`Generated ${desc.toLowerCase()}`);
          }
          // Look for team sizes
          const teamMatch = desc.match(/(\d+)\+?\s*(team|people|engineers|developers)/gi);
          if (teamMatch) {
            metrics.push(`Led ${desc.toLowerCase()}`);
          }
          // Look for user counts
          const userMatch = desc.match(/(\d+[KMB]?)\+?\s*(users|customers|clients)/gi);
          if (userMatch) {
            metrics.push(`Served ${desc.toLowerCase()}`);
          }
        });
      }
    });
    
    // Extract metrics from achievements
    achievements.forEach((achievement: string) => {
      if (achievement.match(/\d+/)) {
        metrics.push(achievement);
      }
    });
    
    return metrics.slice(0, 4); // Limit to top 4 metrics
  }

  /**
   * Extract top relevant skills from resume
   */
  private static extractTopSkills(resumeData: any): string[] {
    if (!resumeData || !resumeData.skills) return [];
    
    const skills = resumeData.skills || [];
    return skills.slice(0, 5); // Top 5 skills
  }

  /**
   * Extract achievements from resume
   */
  private static extractAchievements(resumeData: any): string[] {
    if (!resumeData || !resumeData.achievements) return [];
    
    const achievements = resumeData.achievements || [];
    return achievements.slice(0, 3); // Top 3 achievements
  }

  /**
   * Extract relevant experience for the target role
   */
  private static extractRelevantExperience(resumeData: any, targetRole: string): string[] {
    if (!resumeData || !resumeData.experience) return [];
    
    const experience = resumeData.experience || [];
    const roleKeywords = targetRole.toLowerCase().split(' ');
    
    return experience
      .filter((exp: any) => 
        roleKeywords.some(keyword => 
          exp.title?.toLowerCase().includes(keyword) || 
          exp.description?.some((desc: string) => desc.toLowerCase().includes(keyword))
        )
      )
      .slice(0, 2)
      .map((exp: any) => `${exp.title} at ${exp.company}`);
  }

  /** Create a Gmail compose link with attachment support */
  static buildMailtoLink(params: { to?: string; subject: string; body: string; cc?: string; bcc?: string; resumeData?: any }): string {
    const { to, subject, body, cc, bcc, resumeData } = params;
    const query: string[] = [];
    if (to) query.push(`to=${encodeURIComponent(to)}`);
    if (subject) query.push(`su=${encodeURIComponent(subject)}`); // Gmail uses 'su' for subject
    if (body) query.push(`body=${encodeURIComponent(body)}`);
    if (cc) query.push(`cc=${encodeURIComponent(cc)}`);
    if (bcc) query.push(`bcc=${encodeURIComponent(bcc)}`);
    
    const qs = query.join('&');
    return `https://mail.google.com/mail/?view=cm&fs=1&${qs}`;
  }

  /** Create email with attachment using Outlook Web App */
  static async createEmailWithAttachment(params: {
    to: string;
    subject: string;
    body: string;
    resumeData: any;
  }): Promise<string> {
    const { to, subject, body, resumeData } = params;
    
    try {
      // Generate resume PDF
      const { generatePDF } = await import('@/lib/pdf-utils');
      const pdfBlob = await generatePDF(resumeData, 'modern');
      
      // Convert PDF to base64 for attachment
      const base64Pdf = await this.blobToBase64(pdfBlob);
      
      // Create Outlook Web App URL with attachment
      const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}&attachment=${encodeURIComponent(base64Pdf)}`;
      
      return outlookUrl;
    } catch (error) {
      console.error('Error creating email with attachment:', error);
      // Fallback to regular mailto
      return this.buildMailtoLink({ to, subject, body });
    }
  }

  /** Convert blob to base64 */
  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Convenience: Find contacts and return outreach-ready payloads */
  static async getRecruiterOutreachForJob(params: {
    jobTitle: string;
    company: string;
    location?: string;
    candidateName: string;
    resumeData?: any;
  }): Promise<Array<{
    contact: { name: string; title: string; company: string; linkedinUrl?: string; email?: string; confidence: number; source: string };
    templates: { subject: string; emailBody: string; linkedinMessage: string };
    mailto: string;
  }>> {
    console.log('[getRecruiterOutreachForJob] Starting for', params.company);
    
    // Use manual research approach instead of SerpAPI
    const contacts = await this.findRecruiterContactsManual(params);
    console.log('[getRecruiterOutreachForJob] Found', contacts.length, 'contacts');

    const outputs: Array<{ contact: any; templates: any; mailto: string }> = [];
    for (const c of contacts) {
      const templates = this.buildOutreachTemplates({
        candidateName: params.candidateName,
        targetRole: params.jobTitle,
        company: params.company,
        recruiterName: c.name,
        resumeData: params.resumeData,
      });
      // Only create Gmail link if we have an email address
      let mailto = '';
      if (c.email) {
        mailto = this.buildMailtoLink({ 
          to: c.email, 
          subject: templates.subject, 
          body: templates.emailBody 
        });
        console.log('[Gmail] Contact:', c.name, 'Email:', c.email, 'Subject:', templates.subject);
        console.log('[Gmail] Generated URL:', mailto.substring(0, 100) + '...');
      } else {
        console.log('[Gmail] No email available for:', c.name);
      }
      
      outputs.push({ contact: c, templates, mailto });
    }
    
    console.log('[getRecruiterOutreachForJob] Returning', outputs.length, 'results');
    return outputs;
  }

  /**
   * Automated recruiter research using Hunter.io and other cost-effective methods
   * No manual user input required
   */
  static async findRecruiterContactsManual(params: {
    jobTitle: string;
    company: string;
    location?: string;
  }): Promise<Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }>> {
    const { jobTitle, company, location } = params;
    console.log('[RecruiterSearch] ========== STARTING SEARCH ==========');
    console.log('[RecruiterSearch] Company:', company);
    console.log('[RecruiterSearch] JobTitle:', jobTitle);
    console.log('[RecruiterSearch] Location:', location);
    
    try {
      // Use the working approach from our debug endpoint
      console.log('[Hunter] ========== WORKING APPROACH ==========');
      console.log('[Hunter] Getting employees for:', company);
      
      const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&limit=10&api_key=${API_CONFIG.HUNTER_API_KEY}`;
      console.log('[Hunter] API URL:', url.replace(API_CONFIG.HUNTER_API_KEY, '***'));
      
      const resp = await fetch(url);
      console.log('[Hunter] API response status:', resp.status);
      
      if (!resp.ok) {
        console.log('[Hunter] API failed:', resp.status, resp.statusText);
        const errorText = await resp.text();
        console.log('[Hunter] Error details:', errorText);
        return [];
      }
      
      const data = await resp.json();
      console.log('[Hunter] API response received');
      console.log('[Hunter] Full API response:', JSON.stringify(data, null, 2));
      
      const domain = data?.data?.domain;
      const employees = data?.data?.emails || [];
      
      console.log('[Hunter] Domain:', domain);
      console.log('[Hunter] Employees found:', employees.length);
      console.log('[Hunter] First employee sample:', employees[0]);
      
      if (employees.length === 0) {
        console.log('[Hunter] No employees in response');
        return [];
      }
      
      // Process employees directly
      const hunterResults = this.processEmployees(employees, company, jobTitle, domain);

      // Step 3: If no results, return empty array (no dummy data)
      if (hunterResults.length === 0) {
        console.log('[RecruiterSearch] No real contacts found for', company);
        return [];
      }

      // Step 4: Deduplicate results
      const deduped = this.deduplicateContacts(hunterResults);
      console.log('[RecruiterSearch] Returning', deduped.length, 'contacts');
      return deduped;
      
    } catch (e) {
      console.log('[RecruiterSearch] Error:', e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  /**
   * Process employees from Hunter.io response
   */
  private static processEmployees(employees: any[], company: string, jobTitle: string, domain: string): Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }> {
    const results: Array<{ name: string; title: string; company: string; linkedinUrl?: string; email?: string; confidence: number; source: string; domain?: string; }> = [];
    
    console.log('[Hunter] ========== PROCESSING EMPLOYEES ==========');
    console.log('[Hunter] Processing', employees.length, 'employees for jobTitle:', jobTitle);
    
    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      const position = employee.position?.toLowerCase() || '';
      
      console.log(`[Hunter] [${i+1}/${employees.length}] Checking: ${employee.position}`);
      
      // Match management, leadership, recruiting roles
      const isRelevant = position.includes('manager') || 
                        position.includes('director') || 
                        position.includes('lead') || 
                        position.includes('head') || 
                        position.includes('vp') || 
                        position.includes('chief') ||
                        position.includes('recruiter') || 
                        position.includes('talent') ||
                        position.includes('hr');
      
      if (isRelevant) {
        const contact = {
          name: `${employee.first_name} ${employee.last_name}`,
          title: employee.position,
          company,
          email: employee.value, // Hunter.io uses 'value' field for email addresses
          linkedinUrl: employee.linkedin,
          confidence: 0.8,
          source: 'hunter-domain-search',
          domain
        };
        
        results.push(contact);
        console.log('[Hunter] ✓ MATCH:', employee.first_name, employee.last_name, employee.position);
      } else {
        console.log('[Hunter] ✗ no match');
      }
    }
    
    console.log('[Hunter] ========== RESULTS ==========');
    console.log('[Hunter] Total relevant contacts found:', results.length);
    
    return results;
  }

  /**
   * Get employees from Hunter.io domain search (simplified approach)
   */
  private static async getHunterEmployees(company: string, jobTitle: string): Promise<Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }>> {
    const results: Array<{ name: string; title: string; company: string; linkedinUrl?: string; email?: string; confidence: number; source: string; domain?: string; }> = [];
    
    try {
      console.log('[Hunter] Getting employees for:', company);
      
      const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&limit=50&api_key=${API_CONFIG.HUNTER_API_KEY}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        console.log('[Hunter] API failed:', resp.status);
        return results;
      }
      
      const data = await resp.json();
      const employees = data?.data?.emails || [];
      console.log('[Hunter] Found', employees.length, 'employees');
      
      // Process each employee
      for (const employee of employees) {
        const position = employee.position?.toLowerCase() || '';
        
        // Match management, leadership, recruiting roles
        const isRelevant = position.includes('manager') || 
                          position.includes('director') || 
                          position.includes('lead') || 
                          position.includes('head') || 
                          position.includes('vp') || 
                          position.includes('chief') ||
                          position.includes('recruiter') || 
                          position.includes('talent') ||
                          position.includes('hr');
        
        if (isRelevant) {
          results.push({
            name: `${employee.first_name} ${employee.last_name}`,
            title: employee.position,
            company,
            email: employee.email,
            linkedinUrl: employee.linkedin,
            confidence: 0.8,
            source: 'hunter-domain-search',
            domain: data?.data?.domain
          });
          console.log('[Hunter] ✓ Found:', employee.first_name, employee.last_name, employee.position);
        }
      }
      
      console.log('[Hunter] Total relevant contacts:', results.length);
      
    } catch (e) {
      console.log('[Hunter] Error:', e instanceof Error ? e.message : String(e));
    }
    
    return results;
  }

  /**
   * Search Hunter.io for employees with relevant titles using domain search data
   * Dynamically determines relevant roles based on job title and company context
   */
  private static async searchHunterEmployeesFromDomain(domain: string, company: string, jobTitle: string): Promise<Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }>> {
    const results: Array<{ name: string; title: string; company: string; linkedinUrl?: string; email?: string; confidence: number; source: string; domain?: string; }> = [];
    
    try {
      // Get domain search data which includes employee emails
      const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=50&api_key=${API_CONFIG.HUNTER_API_KEY}`;
      console.log('[Hunter] searching employees for domain:', domain);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const resp = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'JobPilot-AI/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!resp.ok) {
        console.log('[Hunter] domain search failed:', resp.status, resp.statusText);
        return results;
      }
      
      const data = await resp.json();
      console.log('[Hunter] API response:', JSON.stringify(data, null, 2));
      
      const employees = data?.data?.emails || [];
      console.log('[Hunter] found', employees.length, 'total employees');
      
      // Debug: show first few employees to see what we're getting
      if (employees.length > 0) {
        console.log('[Hunter] First few employees:', employees.slice(0, 3).map((emp: any) => ({
          name: `${emp.first_name} ${emp.last_name}`,
          position: emp.position,
          email: emp.email
        })));
      } else {
        console.log('[Hunter] No employees found in API response');
      }
      
      // For now, let's be permissive and include all management-level roles and recruiters
      console.log('[Hunter] Processing employees for jobTitle:', jobTitle);
      
      for (let i = 0; i < employees.length; i++) {
        const employee = employees[i];
        const position = employee.position?.toLowerCase() || '';
        
        // Log all positions for debugging
        console.log(`[Hunter] [${i+1}/${employees.length}] Checking: ${employee.position}`);
        
        // Check for management, leadership, recruiting, or relevant technical roles
        const isManagementRole = position.includes('manager') || position.includes('director') || 
                                 position.includes('lead') || position.includes('head') || 
                                 position.includes('vp') || position.includes('vice president') ||
                                 position.includes('cto') || position.includes('chief') ||
                                 position.includes('recruiter') || position.includes('talent') ||
                                 position.includes('hr') || position.includes('people');
        
        if (isManagementRole) {
          results.push({
            name: employee.first_name && employee.last_name ? `${employee.first_name} ${employee.last_name}` : 'Unknown',
            title: employee.position || 'Relevant Contact',
            company,
            email: employee.email,
            confidence: 0.7,
            source: 'hunter-domain-search',
            domain
          });
          console.log('[Hunter] ✓ MATCH:', employee.first_name, employee.last_name, employee.position);
        } else {
          console.log('[Hunter] ✗ no match');
        }
      }
      
      console.log('[Hunter] found', results.length, 'recruiting contacts');
      
    } catch (e) {
      console.log('[Hunter] employee search failed:', e instanceof Error ? e.message : String(e));
    }
    
    return results;
  }

  /**
   * Dynamically determine relevant keywords based on job title
   */
  private static getRelevantKeywordsForJob(jobTitle: string): string[] {
    const title = jobTitle.toLowerCase();
    
    // Base keywords that are always relevant
    const baseKeywords = [
      'recruiter', 'talent', 'hiring', 'hr', 'people', 'acquisition',
      'recruitment', 'talent acquisition', 'talent management', 'people operations',
      'human resources', 'staffing', 'sourcing', 'talent partner', 'talent lead',
      'recruiting manager', 'talent manager', 'hiring manager', 'people manager',
      'talent coordinator', 'recruitment coordinator', 'talent specialist',
      'campus recruiter', 'technical recruiter', 'senior recruiter', 'lead recruiter'
    ];
    
    // Engineering-specific keywords
    if (title.includes('engineer') || title.includes('developer') || title.includes('programmer') || title.includes('software')) {
      return [
        ...baseKeywords,
        'engineering manager', 'engineering director', 'engineering lead', 'engineering head',
        'senior engineering manager', 'principal engineering manager', 'staff engineering manager',
        'vp engineering', 'vice president engineering', 'cto', 'chief technology officer',
        'technical director', 'technical lead', 'tech lead', 'development manager',
        'software engineering manager', 'engineering director', 'head of engineering',
        'managing director', 'senior partner development manager', 'partner development manager',
        'director of engineering', 'engineering operations', 'technical operations',
        'product engineering', 'engineering excellence', 'engineering productivity'
      ];
    }
    
    // Product-specific keywords
    if (title.includes('product') || title.includes('pm') || title.includes('product manager')) {
      return [
        ...baseKeywords,
        'product manager', 'senior product manager', 'principal product manager',
        'product director', 'vp product', 'vice president product', 'head of product',
        'product lead', 'product owner', 'product operations', 'product strategy',
        'director of product', 'product excellence', 'product management'
      ];
    }
    
    // Design-specific keywords
    if (title.includes('design') || title.includes('designer') || title.includes('ux') || title.includes('ui')) {
      return [
        ...baseKeywords,
        'design manager', 'design director', 'design lead', 'head of design',
        'ux manager', 'ui manager', 'design operations', 'creative director',
        'director of design', 'design excellence', 'user experience manager',
        'product design manager', 'design systems manager'
      ];
    }
    
    // Marketing-specific keywords
    if (title.includes('marketing') || title.includes('growth') || title.includes('brand')) {
      return [
        ...baseKeywords,
        'marketing manager', 'marketing director', 'marketing lead', 'head of marketing',
        'growth manager', 'brand manager', 'marketing operations', 'marketing strategy',
        'director of marketing', 'vp marketing', 'vice president marketing',
        'digital marketing manager', 'content marketing manager'
      ];
    }
    
    // Sales-specific keywords
    if (title.includes('sales') || title.includes('account') || title.includes('business development')) {
      return [
        ...baseKeywords,
        'sales manager', 'sales director', 'sales lead', 'head of sales',
        'account manager', 'business development manager', 'sales operations',
        'director of sales', 'vp sales', 'vice president sales',
        'regional sales manager', 'territory sales manager'
      ];
    }
    
    // Data/Analytics-specific keywords
    if (title.includes('data') || title.includes('analyst') || title.includes('analytics') || title.includes('scientist')) {
      return [
        ...baseKeywords,
        'data manager', 'data director', 'data lead', 'head of data',
        'analytics manager', 'data science manager', 'business intelligence manager',
        'director of data', 'vp data', 'vice president data',
        'data operations', 'analytics operations', 'data strategy'
      ];
    }
    
    // Operations-specific keywords
    if (title.includes('operations') || title.includes('ops') || title.includes('operations')) {
      return [
        ...baseKeywords,
        'operations manager', 'operations director', 'operations lead', 'head of operations',
        'ops manager', 'business operations manager', 'operations excellence',
        'director of operations', 'vp operations', 'vice president operations',
        'operational excellence', 'business operations'
      ];
    }
    
    // Default: return base keywords plus some general management roles
    return [
      ...baseKeywords,
      'manager', 'director', 'lead', 'head of', 'vp', 'vice president',
      'senior manager', 'principal manager', 'staff manager',
      'managing director', 'senior director', 'executive director'
    ];
  }

  /**
   * Scrape LinkedIn company page for employees (placeholder for future implementation)
   */
  private static async scrapeLinkedInCompany(company: string, domain: string): Promise<Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }>> {
    // This would require LinkedIn API access or web scraping
    // For now, return empty array
    console.log('[LinkedIn] company scraping not implemented yet');
    return [];
  }


  /**
   * Deduplicate contacts by name and email
   */
  private static deduplicateContacts(contacts: Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }>): Array<{
    name: string;
    title: string;
    company: string;
    linkedinUrl?: string;
    email?: string;
    confidence: number;
    source: string;
    domain?: string;
  }> {
    const seen = new Set<string>();
    const deduped: Array<{
      name: string;
      title: string;
      company: string;
      linkedinUrl?: string;
      email?: string;
      confidence: number;
      source: string;
      domain?: string;
    }> = [];
    
    for (const contact of contacts) {
      const key = `${contact.name.toLowerCase()}|${contact.email?.toLowerCase() || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(contact);
    }
    
    return deduped;
  }

  /**
   * Generate optimized LinkedIn search queries for manual recruiter discovery
   */
  private static generateLinkedInSearchQueries(company: string, jobTitle: string, location?: string, domain?: string | null): Array<{
    query: string;
    url: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    const queries = [];
    const companyVariations = [company];
    
    // Add domain-based variations if available
    if (domain) {
      const domainRoot = domain.split('.')[0];
      if (domainRoot && domainRoot !== company.toLowerCase()) {
        companyVariations.push(domainRoot);
      }
    }

    // High priority queries
    for (const companyVar of companyVariations) {
      queries.push({
        query: `site:linkedin.com/in "${companyVar}" recruiter`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" recruiter`)}`,
        description: `Find recruiters at ${companyVar}`,
        priority: 'high' as const
      });

      queries.push({
        query: `site:linkedin.com/in "${companyVar}" "talent acquisition"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" "talent acquisition"`)}`,
        description: `Find talent acquisition professionals at ${companyVar}`,
        priority: 'high' as const
      });

      queries.push({
        query: `site:linkedin.com/in "${companyVar}" "hiring manager"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" "hiring manager"`)}`,
        description: `Find hiring managers at ${companyVar}`,
        priority: 'high' as const
      });
    }

    // Medium priority queries
    if (location) {
      queries.push({
        query: `site:linkedin.com/in "${company}" recruiter "${location}"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" recruiter "${location}"`)}`,
        description: `Find recruiters at ${company} in ${location}`,
        priority: 'medium' as const
      });
    }

    queries.push({
      query: `site:linkedin.com/in "${company}" "HR manager"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" "HR manager"`)}`,
      description: `Find HR managers at ${company}`,
      priority: 'medium' as const
    });

    // Low priority queries
    queries.push({
      query: `site:linkedin.com/in "${company}" "people ops"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" "people ops"`)}`,
      description: `Find people operations at ${company}`,
      priority: 'low' as const
    });

    return queries;
  }

  /**
   * Parse resume file using OpenAI file upload API
   */
  static async parseResumeFile(file: File): Promise<ResumeData> {
    try {
      console.log('Starting resume parsing with OpenAI file upload...');
      
      // Upload file to OpenAI and get structured data
      const parsedData = await this.analyzeWithOpenAI(file);
      
      if (parsedData) {
        console.log('Successfully parsed resume with OpenAI');
        return this.mergeWithDefaults(parsedData);
      }
      
      throw new Error('Failed to parse resume with OpenAI');
      
    } catch (error) {
      console.log('Resume parsing failed:', error);
      throw new Error('Failed to parse resume');
    }
  }

  /**
   * Analyze file directly with OpenAI using file upload API
   */
  private static async analyzeWithOpenAI(file: File): Promise<Partial<ResumeData> | null> {
    const startTime = Date.now();
    try {
      console.log('Uploading file to OpenAI for analysis...');
      
      // Create OpenAI client with optimized settings
      const openai = await import('openai');
      const client = new openai.default({ 
        apiKey: API_CONFIG.OPENAI_API_KEY,
        timeout: 30000, // 30 second timeout
        maxRetries: 2
      });
      
      // Optimize file before upload - reject very large files
      let optimizedFile = file;
      if (file.size > 2 * 1024 * 1024) { // If file > 2MB
        throw new Error('File too large for fast processing. Please use a smaller file (< 2MB).');
      }
      if (file.size > 1024 * 1024) { // If file > 1MB
        console.log('Large file detected, processing may be slower...');
      }
      
      // Upload file to OpenAI with ultra-aggressive timeout
      const uploadStart = Date.now();
      const uploadedFile = await Promise.race([
        client.files.create({
          file: optimizedFile,
          purpose: "assistants"
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('File upload timeout')), 10000) // 5 second upload timeout
        )
      ]) as any;
      
      const uploadTime = Date.now() - uploadStart;
      console.log(`File uploaded successfully in ${uploadTime}ms, ID:`, uploadedFile.id);
      
      // Clear prompt with actual placeholder text
      const prompt = `Extract ALL data from the resume file and return as JSON:

{
  "personalInfo": {
    "fullName": "actual name from resume",
    "email": "actual email", 
    "phone": "actual phone",
    "location": "actual location",
    "linkedin": "actual linkedin",
    "website": "actual website",
    "summary": "actual summary text from resume"
  },
  "experience": [{"id": 1, "title": "actual job title", "company": "actual company", "location": "actual location", "startDate": "YYYY-MM", "endDate": "YYYY-MM", "current": false, "description": ["actual bullet 1", "actual bullet 2"]}],
  "education": [{"id": 1, "degree": "actual degree", "institution": "actual school", "location": "actual location", "year": "actual year", "gpa": "actual gpa"}],
  "skills": ["actual skill 1", "actual skill 2"],
  "projects": [{"id": 1, "name": "actual project", "description": "actual description", "technologies": ["actual tech"], "link": "actual link"}]
}

CRITICAL: For the "summary" field, you MUST copy the EXACT text from the resume's summary/professional summary section. Do NOT:
- Paraphrase or rewrite
- Improve or enhance the language
- Add or remove any words
- Change any metrics or numbers
- Modify the structure or format

Copy the summary word-for-word exactly as it appears in the resume. If no summary exists, use "".

IMPORTANT: Detect and preserve bold text formatting by wrapping bold text with **double asterisks**. For example:
- If the resume shows "Revenue Growth & Strategic Planning:" in bold, extract it as: "**Revenue Growth & Strategic Planning:** regular text here"
- Only mark text that is actually bold in the original document`;

      // Use fastest available model for speed
      const assistant = await client.beta.assistants.create({
        name: "Resume Parser",
        model: "gpt-4o-mini", // Fastest available model for Assistants API
        tools: [{ type: "file_search" }],
        instructions: "Extract resume data as fast as possible. For the summary field, copy the EXACT text from the resume without any changes, paraphrasing, or improvements. Preserve all metrics, numbers, achievements, and original wording. Do not summarize or rewrite the summary. IMPORTANT: Detect and preserve bold text formatting by wrapping bold text with **double asterisks** (e.g., **Bold Text:** regular text). Only mark text that is actually bold in the original document."
      });
      
      const thread = await client.beta.threads.create({
        messages: [{
          role: "user",
          content: prompt,
          attachments: [{ file_id: uploadedFile.id, tools: [{ type: "file_search" }] }],
        }],
      });

      const run = await client.beta.threads.runs.create(
        thread.id,
        {
          assistant_id: assistant.id
        }
      );
      
      // Ultra-aggressive polling with 15-second timeout
      let runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
      let attempts = 3;
      const maxAttempts = 10; // 15 seconds max (15 * 1s = 15s)
      
      while ((runStatus.status === 'in_progress' || runStatus.status === 'queued') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s intervals for faster checking
        runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
        attempts++;
        
        console.log(`Processing... ${attempts}s`);
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - taking too long');
      }
      
      if (runStatus.status === 'completed') {
        const messages = await client.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0];
        
        if (lastMessage?.content?.[0]?.type === 'text') {
          const response = lastMessage.content[0].text.value;
          
          // Clean and parse the response
          const cleanedResponse = this.cleanAIResponse(response);
          const parsedData = JSON.parse(cleanedResponse);
          
          // Parallel cleanup (don't wait for it)
          Promise.all([
            client.files.del(uploadedFile.id).catch(console.warn),
            client.beta.assistants.del(assistant.id).catch(console.warn)
          ]);
          
          const totalTime = Date.now() - startTime;
          console.log(`Resume parsing completed successfully in ${totalTime}ms`);
          return parsedData;
        }
      }
      
      // Cleanup on failure
      Promise.all([
        client.files.del(uploadedFile.id).catch(console.warn),
        client.beta.assistants.del(assistant.id).catch(console.warn)
      ]);
      
      throw new Error('Failed to get response from OpenAI');
      
    } catch (error) {
      console.log('OpenAI analysis failed:', error);
      return null;
    }
  }

  /**
   * Clean AI response to extract valid JSON
   */
  private static cleanAIResponse(response: string): string {
    // Remove markdown code blocks
    let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    
    // Find JSON content
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    
    return cleaned;
  }

  /**
   * Merge parsed data with default structure
   */
  private static mergeWithDefaults(parsedData: Partial<ResumeData>): ResumeData {
    return {
      personalInfo: {
        fullName: parsedData.personalInfo?.fullName || '',
        email: parsedData.personalInfo?.email || '',
        phone: parsedData.personalInfo?.phone || '',
        location: parsedData.personalInfo?.location || '',
        linkedin: parsedData.personalInfo?.linkedin || '',
        website: parsedData.personalInfo?.website || '',
        summary: parsedData.personalInfo?.summary || '',
      },
      experience: parsedData.experience || [],
      education: parsedData.education || [],
      skills: parsedData.skills || [],
      projects: parsedData.projects || [],
      achievements: parsedData.achievements || [],
    };
  }


  /**
   * Generate Job Description using AI
   */
  static async generateJD(requirements: string, resumeData: ResumeData): Promise<string> {
    try {
      const openai = await import('openai');
      const client = new openai.default({ 
        apiKey: API_CONFIG.OPENAI_API_KEY 
      });

      const prompt = `Based on these requirements and the candidate's resume, generate a comprehensive job description:

Requirements: ${requirements}

Candidate's Background:
- Experience: ${resumeData.experience.map(exp => `${exp.title} at ${exp.company}`).join(', ')}
- Skills: ${resumeData.skills.join(', ')}
- Education: ${resumeData.education.map(edu => `${edu.degree} from ${edu.institution}`).join(', ')}

Generate a detailed job description that matches the requirements while considering the candidate's background.`;

      const response = await client.chat.completions.create({
        model: API_CONFIG.MODEL,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: API_CONFIG.MAX_TOKENS
      });

      return response.choices[0]?.message?.content || 'Failed to generate job description';
    } catch (error) {
      console.log('JD generation failed:', error);
      return 'Failed to generate job description';
    }
  }

  /**
   * Calculate ATS Score using local calculation (no external server)
   */
  static async calculateATSScore(resumeData: ResumeData, jobDescription: string): Promise<{
    score: number;
    matchedKeywords: string[];
    suggestions: string[];
  }> {
    // Use local calculation directly (no external server)
    console.log('Using local ATS calculation...');
    return this.calculateATSScoreLocal(resumeData, jobDescription);
  }

  /**
   * Local ATS Score calculation using realistic scoring algorithm
   */
  private static calculateATSScoreLocal(resumeData: ResumeData, jobDescription: string): {
    score: number;
    matchedKeywords: string[];
    suggestions: string[];
  } {
    // Use the same realistic scoring algorithm from resume-utils.ts
    const { calculateATSScore } = require('./resume-utils');
    const atsResult = calculateATSScore(resumeData, jobDescription);
    
    return {
      score: atsResult.score,
      matchedKeywords: atsResult.matchedKeywords || [],
      suggestions: this.generateSuggestions(resumeData, atsResult.matchedKeywords || [], atsResult.matchedKeywords || [])
    };
  }

  /**
   * Extract text content from resume data
   */
  private static extractResumeText(resumeData: ResumeData): string {
    const parts = [
      resumeData.personalInfo.summary,
      ...resumeData.experience.map(exp => `${exp.title} ${exp.company} ${exp.description.join(' ')}`),
      ...resumeData.education.map(edu => `${edu.degree} ${edu.institution}`),
      ...resumeData.skills,
      ...resumeData.projects.map(proj => `${proj.name} ${proj.description} ${proj.technologies.join(' ')}`),
      ...resumeData.achievements
    ];
    
    return parts.join(' ').toLowerCase();
  }

  /**
   * Extract keywords from job description using local calculation
   */
  static async extractKeywords(jobDescription: string): Promise<string[]> {
    // Use local keyword extraction directly (no external server)
    console.log('Using local keyword extraction...');
    return this.extractKeywordsLocal(jobDescription);
  }

  /**
   * Local keyword extraction using the same algorithm as resume-utils.ts
   */
  private static extractKeywordsLocal(jobDescription: string): string[] {
    // Use the same keyword extraction algorithm from resume-utils.ts
    const { extractKeywords } = require('./resume-utils');
    return extractKeywords(jobDescription);
  }

  /**
   * Generate improvement suggestions
   */
  private static generateSuggestions(
    resumeData: ResumeData, 
    jobKeywords: string[], 
    matchedKeywords: string[]
  ): string[] {
    const suggestions: string[] = [];
    const missingKeywords = jobKeywords.filter(keyword => !matchedKeywords.includes(keyword));
    
    if (missingKeywords.length > 0) {
      suggestions.push(`Add these keywords to your resume: ${missingKeywords.slice(0, 5).join(', ')}`);
    }
    
    if (resumeData.skills.length < 10) {
      suggestions.push('Expand your skills section with more technical and soft skills');
    }
    
    if (resumeData.experience.length < 2) {
      suggestions.push('Add more detailed experience descriptions with quantifiable achievements');
    }
    
    return suggestions;
  }
}
