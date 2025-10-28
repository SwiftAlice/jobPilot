import { ResumeData, ATSScore } from '@/types/resume-builder-types';

// Debounce utility function
export const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Dynamic skill extraction and matching
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasWholeWord = (haystack: string, needle: string): boolean => {
  if (!needle) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i');
  return pattern.test(haystack);
};

export const extractKeywords = (text: string): string[] => {
  const commonKeywords = [
    'JavaScript', 'React', 'Node.js', 'Python', 'Java', 'AWS', 'Docker', 
    'Kubernetes', 'PostgreSQL', 'MongoDB', 'Git', 'Agile', 'Scrum',
    'Machine Learning', 'Data Analysis', 'Project Management', 'Leadership',
    'Communication', 'Problem Solving', 'Team Collaboration'
  ];
  
  const lower = text.toLowerCase();
  return commonKeywords.filter(keyword => hasWholeWord(lower, keyword));
};

// Dynamic skill clustering and semantic matching
export const getSkillClusters = () => {
  return {
    // Technical Skills
    'programming': ['javascript', 'python', 'java', 'typescript', 'c++', 'c#', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin'],
    'web_frontend': ['react', 'vue', 'angular', 'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind', 'jquery', 'webpack', 'vite'],
    'web_backend': ['node.js', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'asp.net', 'fastapi', 'gin'],
    'databases': ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb', 'oracle', 'sqlite'],
    'cloud_aws': ['aws', 'ec2', 's3', 'lambda', 'rds', 'cloudformation', 'cloudwatch', 'iam', 'vpc', 'route53'],
    'cloud_azure': ['azure', 'azure functions', 'azure sql', 'azure storage', 'azure devops', 'azure active directory'],
    'cloud_gcp': ['gcp', 'google cloud', 'bigquery', 'cloud functions', 'cloud storage', 'kubernetes engine'],
    'devops': ['docker', 'kubernetes', 'jenkins', 'gitlab ci', 'github actions', 'terraform', 'ansible', 'chef', 'puppet'],
    'data_science': ['python', 'pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'jupyter', 'r', 'matplotlib', 'seaborn'],
    'mobile': ['react native', 'flutter', 'ios', 'android', 'swift', 'kotlin', 'xamarin', 'ionic', 'cordova'],
    
    // Business Skills
    'project_management': ['agile', 'scrum', 'kanban', 'waterfall', 'jira', 'confluence', 'trello', 'asana', 'monday.com'],
    'analytics': ['google analytics', 'mixpanel', 'amplitude', 'tableau', 'power bi', 'looker', 'snowflake', 'databricks'],
    'marketing': ['seo', 'sem', 'ppc', 'google ads', 'facebook ads', 'email marketing', 'content marketing', 'social media'],
    'sales': ['crm', 'salesforce', 'hubspot', 'pipedrive', 'lead generation', 'cold calling', 'negotiation', 'closing'],
    'finance': ['financial modeling', 'excel', 'vba', 'sql', 'power bi', 'tableau', 'budgeting', 'forecasting', 'roi'],
    
    // Soft Skills
    'leadership': ['team leadership', 'mentoring', 'coaching', 'people management', 'strategic planning', 'decision making'],
    'communication': ['presentation', 'public speaking', 'technical writing', 'documentation', 'stakeholder management'],
    'problem_solving': ['critical thinking', 'analytical skills', 'troubleshooting', 'debugging', 'root cause analysis'],
    'collaboration': ['teamwork', 'cross-functional', 'remote work', 'agile', 'pair programming', 'code review']
  };
};

// Semantic skill matching - finds related skills even if not exact matches
export const findRelatedSkills = (skill: string, clusters: Record<string, string[]>): string[] => {
  const skillLower = skill.toLowerCase();
  const related: string[] = [];
  
  for (const [clusterName, skills] of Object.entries(clusters)) {
    // Direct match
    if (skills.some(s => s.toLowerCase() === skillLower)) {
      related.push(...skills);
    }
    // Partial match (contains or is contained)
    else if (skills.some(s => 
      s.toLowerCase().includes(skillLower) || 
      skillLower.includes(s.toLowerCase())
    )) {
      related.push(...skills);
    }
    // Semantic similarity (simple keyword matching)
    else if (skills.some(s => {
      const skillWords = skillLower.split(/[\s\-_]+/);
      const clusterWords = s.toLowerCase().split(/[\s\-_]+/);
      return skillWords.some(word => 
        word.length > 3 && clusterWords.some(cw => 
          cw.includes(word) || word.includes(cw)
        )
      );
    })) {
      related.push(...skills);
    }
  }
  
  return [...new Set(related)]; // Remove duplicates
};

// Industry standard skill requirements by role level
export const getIndustryStandards = () => {
  return {
    'entry': {
      minSkills: 3,
      expectedSkills: 5,
      strongSkills: 8,
      experienceYears: 0,
      strongExperienceYears: 2
    },
    'mid': {
      minSkills: 5,
      expectedSkills: 8,
      strongSkills: 12,
      experienceYears: 2,
      strongExperienceYears: 5
    },
    'senior': {
      minSkills: 8,
      expectedSkills: 12,
      strongSkills: 16,
      experienceYears: 5,
      strongExperienceYears: 8
    },
    'lead': {
      minSkills: 10,
      expectedSkills: 15,
      strongSkills: 20,
      experienceYears: 7,
      strongExperienceYears: 10
    }
  };
};

// Dynamic role inference with confidence scoring
export const inferRoleWithConfidence = (resume: ResumeData): { role: string; confidence: number; skills: string[] } => {
  const text = JSON.stringify(resume).toLowerCase();
  const clusters = getSkillClusters();
  const roleScores: Record<string, number> = {};
  
  // Calculate role scores based on skill clusters
  for (const [clusterName, skills] of Object.entries(clusters)) {
    const matches = skills.filter(skill => text.includes(skill.toLowerCase())).length;
    if (matches > 0) {
      // Map clusters to roles
      const roleMapping: Record<string, string[]> = {
        'software_engineer': ['programming', 'web_frontend', 'web_backend', 'databases', 'devops'],
        'data_scientist': ['data_science', 'programming', 'databases', 'cloud_aws', 'cloud_gcp'],
        'devops_engineer': ['devops', 'cloud_aws', 'cloud_azure', 'cloud_gcp', 'programming'],
        'product_manager': ['project_management', 'analytics', 'communication', 'leadership'],
        'marketing_specialist': ['marketing', 'analytics', 'communication', 'project_management'],
        'business_analyst': ['analytics', 'databases', 'project_management', 'communication'],
        'data_engineer': ['databases', 'programming', 'cloud_aws', 'cloud_gcp', 'devops'],
        'mobile_developer': ['mobile', 'programming', 'web_frontend'],
        'full_stack_developer': ['web_frontend', 'web_backend', 'programming', 'databases'],
        'cloud_architect': ['cloud_aws', 'cloud_azure', 'cloud_gcp', 'devops', 'databases']
      };
      
      for (const [role, relevantClusters] of Object.entries(roleMapping)) {
        if (relevantClusters.includes(clusterName)) {
          roleScores[role] = (roleScores[role] || 0) + matches;
        }
      }
    }
  }
  
  // Find the role with highest score
  const sortedRoles = Object.entries(roleScores).sort(([,a], [,b]) => b - a);
  const [topRole, topScore] = sortedRoles[0] || ['general_professional', 0];
  
  // Calculate confidence (0-1)
  const totalPossibleScore = Object.values(clusters).flat().length;
  const confidence = Math.min(topScore / 10, 1); // Normalize to 0-1
  
  // Extract matched skills
  const matchedSkills = Object.entries(clusters)
    .filter(([, skills]) => skills.some(skill => text.includes(skill.toLowerCase())))
    .flatMap(([, skills]) => skills.filter(skill => text.includes(skill.toLowerCase())));
  
  return {
    role: topRole,
    confidence,
    skills: [...new Set(matchedSkills)]
  };
};

// ATS Score calculation using comprehensive scoring algorithm
export const calculateATSScore = (resumeData: ResumeData, jdText: string): ATSScore => {
  // Use dynamic role inference with confidence scoring
  const roleInference = inferRoleWithConfidence(resumeData);
  const clusters = getSkillClusters();
  const industryStandards = getIndustryStandards();
  
  // Determine role level based on experience
  const totalYears = resumeData.experience.reduce((total, exp) => {
    if (exp.startDate && exp.endDate) {
      const start = new Date(exp.startDate);
      const end = exp.current ? new Date() : new Date(exp.endDate);
      return total + (end.getFullYear() - start.getFullYear());
    }
    return total;
  }, 0);
  
  let roleLevel: 'entry' | 'mid' | 'senior' | 'lead' = 'entry';
  if (totalYears >= 7) roleLevel = 'lead';
  else if (totalYears >= 5) roleLevel = 'senior';
  else if (totalYears >= 2) roleLevel = 'mid';
  
  const standards = industryStandards[roleLevel];
  
  // Dynamic keyword extraction - use JD keywords or role-based clusters
  let jdKeywords: string[] = [];
  if (jdText) {
    jdKeywords = extractKeywords(jdText);
  } else {
    // Use all skills from relevant clusters for the inferred role
    const roleMapping: Record<string, string[]> = {
      'software_engineer': ['programming', 'web_frontend', 'web_backend', 'databases', 'devops'],
      'data_scientist': ['data_science', 'programming', 'databases', 'cloud_aws', 'cloud_gcp'],
      'devops_engineer': ['devops', 'cloud_aws', 'cloud_azure', 'cloud_gcp', 'programming'],
      'product_manager': ['project_management', 'analytics', 'communication', 'leadership'],
      'marketing_specialist': ['marketing', 'analytics', 'communication', 'project_management'],
      'business_analyst': ['analytics', 'databases', 'project_management', 'communication'],
      'data_engineer': ['databases', 'programming', 'cloud_aws', 'cloud_gcp', 'devops'],
      'mobile_developer': ['mobile', 'programming', 'web_frontend'],
      'full_stack_developer': ['web_frontend', 'web_backend', 'programming', 'databases'],
      'cloud_architect': ['cloud_aws', 'cloud_azure', 'cloud_gcp', 'devops', 'databases']
    };
    
    const relevantClusters = roleMapping[roleInference.role] || ['leadership', 'communication', 'problem_solving', 'collaboration'];
    jdKeywords = relevantClusters.flatMap(cluster => (clusters as any)[cluster] || []);
  }
  const resumeText = JSON.stringify(resumeData).toLowerCase();
  
  // Enhanced keyword matching with semantic similarity
  const matchedKeywords = jdKeywords.filter(keyword => hasWholeWord(resumeText, keyword));
  
  // Find related skills for better matching
  const resumeSkills = resumeData.skills || [];
  const relatedSkills = resumeSkills.flatMap(skill => findRelatedSkills(skill, clusters));
  const semanticMatches = relatedSkills.filter(skill => 
    jdKeywords.some(keyword => hasWholeWord(skill.toLowerCase(), keyword))
  );
  
  // Combine direct and semantic matches
  const allMatches = [...new Set([...matchedKeywords, ...semanticMatches])];
  
  // Debug logging
  console.log('ATS Score Calculation Debug:');
  console.log('- JD Text:', jdText || 'None (Dynamic mode)');
  console.log('- Inferred Role:', roleInference.role, 'Confidence:', roleInference.confidence);
  console.log('- Role Level:', roleLevel);
  console.log('- Keywords to check:', jdKeywords.length);
  console.log('- Direct matches:', matchedKeywords.length);
  console.log('- Semantic matches:', semanticMatches.length);
  console.log('- Total matches:', allMatches.length);
  console.log('- Resume skills:', resumeSkills);
  
  // 1. Keywords & Skills Match (Dynamic scoring based on role level)
  let keywordScore = 0;
  if (jdText) {
    // JD-specific: up to 60 based on exact JD coverage
    keywordScore = Math.min(60, (matchedKeywords.length / jdKeywords.length) * 60);
  } else {
    // Dynamic role-based: score based on industry standards for role level
    const skillCount = allMatches.length;
    const expectedSkills = standards.expectedSkills;
    const strongSkills = standards.strongSkills;
    
    if (skillCount >= strongSkills) keywordScore = 50; // Excellent
    else if (skillCount >= expectedSkills) keywordScore = 40; // Good
    else if (skillCount >= standards.minSkills) keywordScore = 30; // Fair
    else keywordScore = Math.min(25, (skillCount / standards.minSkills) * 25); // Below expectations
  }
  
  // 2. Role/Domain Fit (Dynamic based on role inference confidence)
  let roleFitScore = 0;
  
  // Base score for summary quality
  if (resumeData.personalInfo.summary && resumeData.personalInfo.summary.length > 100) roleFitScore += 3;
  if (Array.isArray(resumeData.skills) && resumeData.skills.length >= 8) roleFitScore += 2;

  if (jdText) {
    // JD-specific role alignment - heavily reward matching
    const jdLower = jdText.toLowerCase();
    const resumeSummary = resumeData.personalInfo.summary.toLowerCase();
    
    // Check for direct keyword matches between JD and resume summary
    const jdWords = jdLower.split(/\s+/).filter(word => word.length > 6);
    const matchingWords = jdWords.filter(word => resumeSummary.includes(word));
    
    // Heavily reward JD-specific matching
    if (matchingWords.length >= 5) roleFitScore += 8;
    else if (matchingWords.length >= 3) roleFitScore += 6;
    else if (matchingWords.length >= 2) roleFitScore += 4;
    else if (matchingWords.length >= 1) roleFitScore += 2;
    
    // Bonus for skills matching JD keywords
    const skillsMatchCount = resumeData.skills.filter(skill => 
      jdKeywords.some(keyword => hasWholeWord(skill.toLowerCase(), keyword))
    ).length;
    if (skillsMatchCount >= 5) roleFitScore += 5;
    else if (skillsMatchCount >= 3) roleFitScore += 3;
    else if (skillsMatchCount >= 1) roleFitScore += 1;
  } else {
    // Dynamic role alignment based on inferred role confidence
    const confidence = roleInference.confidence;
    const skillCount = allMatches.length;
    
    // Role confidence scoring (0-8 points)
    if (confidence >= 0.8) roleFitScore += 8; // Very high confidence
    else if (confidence >= 0.6) roleFitScore += 6; // High confidence
    else if (confidence >= 0.4) roleFitScore += 4; // Medium confidence
    else if (confidence >= 0.2) roleFitScore += 2; // Low confidence
    
    // Skills alignment with role expectations
    const expectedSkills = standards.expectedSkills;
    if (skillCount >= expectedSkills) roleFitScore += 5; // Meets expectations
    else if (skillCount >= standards.minSkills) roleFitScore += 3; // Minimum requirements
    else roleFitScore += 1; // Below minimum
    
    // Cap dynamic role fit to 15
    roleFitScore = Math.min(roleFitScore, 15);
  }
  
  // 3. Experience Evidence (Dynamic based on role level and industry standards)
  let experienceScore = 0;
  if (Array.isArray(resumeData.experience) && resumeData.experience.length > 0) {
    if (jdText) {
      // JD-specific experience scoring
      const jdLower = jdText.toLowerCase();
      
      // Check for required experience level in JD
      const requiredYears = jdLower.match(/(\d+)\+?\s*years?/i);
      const requiredLevel = jdLower.match(/(senior|mid|junior|entry|lead|principal)/i);
      
      // Score based on JD requirements
      if (requiredYears) {
        const required = parseInt(requiredYears[1]);
        if (totalYears >= required) experienceScore += 8;
        else if (totalYears >= required * 0.7) experienceScore += 6;
        else if (totalYears >= required * 0.5) experienceScore += 4;
        else experienceScore += 2;
      } else {
        // Default scoring if no specific years mentioned
        if (totalYears >= 5) experienceScore += 8;
        else if (totalYears >= 3) experienceScore += 6;
        else if (totalYears >= 1) experienceScore += 4;
        else experienceScore += 2;
      }
      
      // Check for relevant experience descriptions matching JD
      const relevantExperienceCount = resumeData.experience.filter(exp => 
        Array.isArray(exp.description) && exp.description.some(desc => {
          const descLower = desc.toLowerCase();
          return jdKeywords.some(keyword => descLower.includes(keyword.toLowerCase()));
        })
      ).length;
      
      if (relevantExperienceCount >= 2) experienceScore += 6;
      else if (relevantExperienceCount >= 1) experienceScore += 4;
      
      // Recency bonus
      const hasRecentExperience = resumeData.experience.some(exp => exp.current || 
        (exp.endDate && new Date().getFullYear() - new Date(exp.endDate).getFullYear() <= 2));
      if (hasRecentExperience) experienceScore += 3;
    } else {
      // Dynamic experience scoring based on role level and industry standards
      const minYears = standards.experienceYears;
      const strongYears = standards.strongExperienceYears;
      
      // Years of experience scoring
      if (totalYears >= strongYears) experienceScore += 12; // Exceeds expectations
      else if (totalYears >= minYears) experienceScore += 8; // Meets expectations
      else if (totalYears >= Math.max(minYears - 1, 0)) experienceScore += 5; // Close to expectations
      else experienceScore += 2; // Below expectations

      // Recency bonus
      const hasRecentExperience = resumeData.experience.some(exp => exp.current || 
        (exp.endDate && new Date().getFullYear() - new Date(exp.endDate).getFullYear() <= 2));
      if (hasRecentExperience) experienceScore += 3;

      // Relevance bonus: descriptions containing role-relevant keywords
      const relevantExperienceCount = resumeData.experience.filter(exp => 
        Array.isArray(exp.description) && exp.description.some(desc => {
          const descLower = desc.toLowerCase();
          return allMatches.some(match => descLower.includes(match.toLowerCase()));
        })
      ).length;
      
      if (relevantExperienceCount >= 2) experienceScore += 4; // Multiple relevant experiences
      else if (relevantExperienceCount >= 1) experienceScore += 2; // Some relevant experience
      
      // Leadership/management experience bonus for senior roles
      if (roleLevel === 'senior' || roleLevel === 'lead') {
        const hasLeadership = resumeData.experience.some(exp => 
          Array.isArray(exp.description) && exp.description.some(desc => 
            /lead|manage|mentor|team|supervise|direct|coordinate|oversee|guide|train/i.test(desc)
          )
        );
        if (hasLeadership) experienceScore += 3;
      }

      // Cap dynamic experience to 20
      experienceScore = Math.min(experienceScore, 20);
    }
  }
  
  // 4. Education/Certs (10 pts)
  let educationScore = 0;
  if (Array.isArray(resumeData.education) && resumeData.education.length > 0) {
    educationScore += 1;
    
    if (jdText) {
      // JD-specific education scoring
      const jdLower = jdText.toLowerCase();
      
      // Check for required education level in JD
      const requiredEducation = jdLower.match(/(bachelor|master|phd|mba|degree|certification|diploma)/i);
      const hasRequiredEducation = resumeData.education.some(edu => 
        edu.degree && requiredEducation && edu.degree.toLowerCase().includes(requiredEducation[1].toLowerCase())
      );
      
      if (hasRequiredEducation) educationScore += 1;
      else {
        // Fallback to generic degree checking
        const relevantDegrees = ['bachelor', 'master', 'phd', 'mba', 'certification', 'diploma'];
        const hasRelevantDegree = resumeData.education.some(edu => 
          edu.degree && relevantDegrees.some(degree => edu.degree.toLowerCase().includes(degree))
        );
        if (hasRelevantDegree) educationScore += 0.5;
      }
      
      // Check for field relevance to JD
      const fieldRelevance = resumeData.education.some(edu => {
        if (!edu.degree) return false;
        const degreeLower = edu.degree.toLowerCase();
        return jdKeywords.some(keyword => degreeLower.includes(keyword.toLowerCase()));
      });
      if (fieldRelevance) educationScore += 0.5;
    } else {
      // Dynamic education scoring for non-JD resumes using role-relevant degrees
      const roleDegrees: Record<string, string[]> = {
        'software_engineer': ['bachelor', 'master', 'b.tech', 'be', 'bs cs', 'computer science', 'engineering'],
        'data_scientist': ['master', 'phd', 'statistics', 'mathematics', 'computer science', 'data science'],
        'product_manager': ['bachelor', 'mba', 'business', 'economics', 'engineering'],
        'marketing_specialist': ['marketing', 'communications', 'business', 'mba', 'bachelor'],
        'business_analyst': ['business', 'information systems', 'engineering', 'economics', 'bachelor', 'master'],
        'devops_engineer': ['bachelor', 'master', 'computer science', 'engineering', 'information technology'],
        'data_engineer': ['bachelor', 'master', 'computer science', 'engineering', 'data science'],
        'mobile_developer': ['bachelor', 'master', 'computer science', 'engineering'],
        'full_stack_developer': ['bachelor', 'master', 'computer science', 'engineering'],
        'cloud_architect': ['bachelor', 'master', 'computer science', 'engineering', 'information technology']
      };
      
      const relevantDegrees = roleDegrees[roleInference.role] || ['bachelor', 'master', 'mba', 'diploma', 'certification'];
      const hasRelevantDegree = resumeData.education.some(edu => 
        edu.degree && relevantDegrees.some((degree: string) => edu.degree.toLowerCase().includes(degree))
      );
      if (hasRelevantDegree) educationScore += 2;
    }
    
    // GPA bonus (universal)
    if (resumeData.education.some(edu => edu.gpa && parseFloat(edu.gpa) >= 3.5)) educationScore += 1;
  }
  
  // 5. Formatting/Parse Quality (5 pts)
  let formattingScore = 0;
  if (resumeData.personalInfo.fullName && resumeData.personalInfo.email) formattingScore += 1;
  if (resumeData.personalInfo.phone) formattingScore += 0.5;
  if (resumeData.personalInfo.location) formattingScore += 0.5;
  if (resumeData.personalInfo.linkedin || resumeData.personalInfo.website) formattingScore += 0.5;
  
  // 6. Bonus for Impact/Outcomes (5 pts)
  let impactScore = 0;
  if (Array.isArray(resumeData.experience)) {
    // Check for quantified results across different industries
    const hasQuantifiedResults = resumeData.experience.some(exp => 
      Array.isArray(exp.description) && exp.description.some(desc => 
        /\d+%|\d+x|\d+ users|\d+ million|\d+ clients|\d+ projects|\d+ students|\d+ patients|\$\d+|\d+ employees/i.test(desc)
      )
    );
    if (hasQuantifiedResults) impactScore += 1;
    
    // Check for leadership and management experience
    const hasLeadership = resumeData.experience.some(exp => 
      Array.isArray(exp.description) && exp.description.some(desc => 
        /lead|manage|mentor|team|supervise|direct|coordinate|oversee|guide|train/i.test(desc)
      )
    );
    if (hasLeadership) impactScore += 0.5;
  }
  
  // 7. JD-Specific Optimization Bonus (10 pts) - Reward high keyword matching
  let optimizationBonus = 0;
  if (jdText && jdKeywords.length > 0) {
    const matchPercentage = (matchedKeywords.length / jdKeywords.length) * 100;
    if (matchPercentage >= 90) optimizationBonus += 10; // Perfect match
    else if (matchPercentage >= 80) optimizationBonus += 8; // Excellent match
    else if (matchPercentage >= 70) optimizationBonus += 6; // Very good match
    else if (matchPercentage >= 60) optimizationBonus += 4; // Good match
    else if (matchPercentage >= 50) optimizationBonus += 2; // Fair match
  }
  
  // Calculate total score
  const totalScore = keywordScore + roleFitScore + experienceScore + educationScore + formattingScore + impactScore + optimizationBonus;
  
  console.log('- Keyword score (JD max 60, Dynamic max 50):', keywordScore);
  console.log('- Role fit score (JD max 20, Dynamic max 15):', roleFitScore);
  console.log('- Experience score (JD max 15, Dynamic max 20):', experienceScore);
  console.log('- Education score (10 pts):', educationScore);
  console.log('- Formatting score (5 pts):', formattingScore);
  console.log('- Impact score (5 pts):', impactScore);
  console.log('- Optimization bonus (10 pts):', optimizationBonus);
  console.log('- Total score (before cap):', totalScore);
  
  // Cap the score at 100%
  const finalScore = Math.min(Math.round(totalScore), 100);
  console.log('- Final score (capped at 100%):', finalScore);
  
  // Dynamic feedback based on role and scoring method
  let feedback = '';
  if (jdText) {
    // JD-specific feedback
    feedback = finalScore >= 90 ? 'Exceptional ATS score! Resume is highly optimized for this specific role.' : 
              finalScore >= 80 ? 'Excellent ATS optimization for this job!' : 
              finalScore >= 70 ? 'Good ATS optimization with room for improvement' : 
              finalScore >= 60 ? 'Fair ATS optimization - needs enhancement' : 
              finalScore >= 50 ? 'Basic ATS optimization - significant improvements needed' : 
              'Requires major ATS optimization';
  } else {
    // Dynamic role-based feedback
    const roleName = roleInference.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const confidence = Math.round(roleInference.confidence * 100);
    
    feedback = finalScore >= 90 ? `Exceptional ATS score! Strong ${roleName} profile (${confidence}% confidence).` : 
              finalScore >= 80 ? `Excellent ATS optimization! Good ${roleName} profile (${confidence}% confidence).` : 
              finalScore >= 70 ? `Good ATS optimization for ${roleName} role. Consider adding more relevant skills.` : 
              finalScore >= 60 ? `Fair ATS optimization. ${roleName} profile needs strengthening.` : 
              finalScore >= 50 ? `Basic ATS optimization. Consider focusing on ${roleName} skills and experience.` : 
              `Requires major ATS optimization. Resume needs more ${roleName}-specific content.`;
  }
  
  return {
    score: finalScore,
    matchedKeywords: allMatches,
    missingKeywords: jdKeywords.filter(keyword => 
      !resumeText.includes(keyword.toLowerCase())
    ),
    feedback
  };
};
