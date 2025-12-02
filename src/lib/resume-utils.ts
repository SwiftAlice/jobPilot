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
    // Generic mode: Focus on resume quality and internal consistency
    // Check if skills are present and align with experience
    const resumeSkills = resumeData.skills || [];
    const hasSkills = resumeSkills.length > 0;
    const hasReasonableSkillCount = resumeSkills.length >= 5;
    
    // Check if skills mentioned in experience descriptions
    const skillsInExperience = resumeData.experience.some(exp => 
      Array.isArray(exp.description) && exp.description.some(desc => 
        resumeSkills.some(skill => desc.toLowerCase().includes(skill.toLowerCase()))
      )
    );
    
    // Base score for having skills
    if (hasReasonableSkillCount) keywordScore = 35; // Good skill coverage
    else if (hasSkills) keywordScore = 25; // Some skills present
    else keywordScore = 15; // No skills listed
    
    // Bonus for skills aligning with experience
    if (skillsInExperience) keywordScore += 10; // Skills match experience
    if (resumeSkills.length >= 10) keywordScore += 5; // Comprehensive skill list
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
    // Generic mode: Focus on resume completeness and internal consistency
    // Summary quality and alignment with experience
    const summary = resumeData.personalInfo.summary || '';
    const hasGoodSummary = summary.length >= 100;
    const hasExcellentSummary = summary.length >= 200;
    
    if (hasExcellentSummary) roleFitScore += 8; // Comprehensive summary
    else if (hasGoodSummary) roleFitScore += 6; // Good summary
    else if (summary.length > 0) roleFitScore += 3; // Basic summary
    else roleFitScore += 0; // No summary
    
    // Check if summary aligns with experience (mentions skills/roles from experience)
    const experienceText = resumeData.experience.map(exp => 
      `${exp.title || ''} ${exp.company || ''} ${Array.isArray(exp.description) ? exp.description.join(' ') : ''}`
    ).join(' ').toLowerCase();
    
    const summaryWords = summary.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const summaryMatchesExperience = summaryWords.some(word => 
      experienceText.includes(word)
    );
    
    if (summaryMatchesExperience && hasGoodSummary) roleFitScore += 5; // Summary aligns with experience
    else if (summaryMatchesExperience) roleFitScore += 3; // Some alignment
    
    // Skills count bonus
    const skillCount = (resumeData.skills || []).length;
    if (skillCount >= 15) roleFitScore += 2; // Comprehensive skills
    else if (skillCount >= 8) roleFitScore += 1; // Good skill coverage
    
    // Cap generic role fit to 20 (more lenient than JD-specific)
    roleFitScore = Math.min(roleFitScore, 20);
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
      // Generic mode: Focus on experience quality and completeness
      const experienceCount = resumeData.experience.length;
      
      // Base score for having experience entries
      if (experienceCount >= 3) experienceScore += 10; // Multiple experiences
      else if (experienceCount >= 2) experienceScore += 7; // Some experience
      else if (experienceCount >= 1) experienceScore += 4; // At least one experience
      
      // Quality of experience descriptions
      const experiencesWithDescriptions = resumeData.experience.filter(exp => 
        Array.isArray(exp.description) && exp.description.length > 0
      ).length;
      
      if (experiencesWithDescriptions === experienceCount && experienceCount > 0) {
        experienceScore += 5; // All experiences have descriptions
      } else if (experiencesWithDescriptions >= experienceCount * 0.7) {
        experienceScore += 3; // Most experiences have descriptions
      } else if (experiencesWithDescriptions > 0) {
        experienceScore += 1; // Some descriptions present
      }
      
      // Check for detailed descriptions (multiple bullet points)
      const hasDetailedDescriptions = resumeData.experience.some(exp => 
        Array.isArray(exp.description) && exp.description.length >= 3
      );
      if (hasDetailedDescriptions) experienceScore += 3; // Detailed experience descriptions
      
      // Recency bonus
      const hasRecentExperience = resumeData.experience.some(exp => exp.current || 
        (exp.endDate && new Date().getFullYear() - new Date(exp.endDate).getFullYear() <= 2));
      if (hasRecentExperience) experienceScore += 2;

      // Years of experience bonus (more lenient)
      if (totalYears >= 5) experienceScore += 3; // Experienced professional
      else if (totalYears >= 2) experienceScore += 2; // Some experience
      else if (totalYears >= 1) experienceScore += 1; // Entry level

      // Cap generic experience to 25 (more lenient than JD-specific)
      experienceScore = Math.min(experienceScore, 25);
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
      // Generic mode: Focus on education completeness rather than role relevance
      const educationCount = resumeData.education.length;
      
      // Base score for having education entries
      if (educationCount >= 2) educationScore += 3; // Multiple education entries
      else if (educationCount >= 1) educationScore += 2; // At least one education entry
      
      // Check for complete education information
      const completeEducationEntries = resumeData.education.filter(edu => 
        edu.degree && edu.institution
      ).length;
      
      if (completeEducationEntries === educationCount && educationCount > 0) {
        educationScore += 3; // All entries have degree and institution
      } else if (completeEducationEntries > 0) {
        educationScore += 1; // Some complete entries
      }
      
      // Degree level bonus (any degree is good)
      const hasDegree = resumeData.education.some(edu => 
        edu.degree && /bachelor|master|phd|mba|degree|diploma|certification/i.test(edu.degree)
      );
      if (hasDegree) educationScore += 2;
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
    // Generic mode feedback - focused on resume quality
    feedback = finalScore >= 90 ? 'Exceptional resume quality! Your resume is well-structured and complete.' : 
              finalScore >= 80 ? 'Excellent resume quality! Your resume is well-organized and comprehensive.' : 
              finalScore >= 70 ? 'Good resume quality. Your resume is well-structured with room for minor improvements.' : 
              finalScore >= 60 ? 'Fair resume quality. Consider adding more details to strengthen your resume.' : 
              finalScore >= 50 ? 'Basic resume quality. Your resume needs more content and detail.' : 
              'Resume needs improvement. Add more experience details, skills, and a comprehensive summary.';
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
