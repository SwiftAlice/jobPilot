"""
Enhanced skill matching for resume-based job search
"""
import re
from typing import List, Dict, Set, Tuple
from dataclasses import dataclass

@dataclass
class SkillMatch:
    """Represents a skill match between job requirements and user skills"""
    skill: str
    category: str
    match_type: str  # 'exact', 'partial', 'synonym', 'related'
    confidence: float
    job_requirement: str
    user_skill: str

class EnhancedSkillMatcher:
    """Enhanced skill matcher that focuses on resume skills"""
    
    def __init__(self):
        # Comprehensive tech skill database
        self.skill_categories = {
            'programming_languages': {
                'python': ['python', 'py', 'python3', 'python2'],
                'javascript': ['javascript', 'js', 'ecmascript', 'es6', 'es2015'],
                'typescript': ['typescript', 'ts'],
                'java': ['java', 'jdk', 'jvm'],
                'c++': ['c++', 'cpp', 'c plus plus'],
                'c#': ['c#', 'csharp', 'c sharp'],
                'go': ['go', 'golang'],
                'rust': ['rust'],
                'kotlin': ['kotlin'],
                'swift': ['swift'],
                'php': ['php'],
                'ruby': ['ruby', 'rails'],
                'scala': ['scala'],
                'r': ['r', 'r language'],
                'matlab': ['matlab'],
                'perl': ['perl'],
                'bash': ['bash', 'shell', 'bash scripting'],
                'powershell': ['powershell', 'ps'],
                'sql': ['sql', 'mysql', 'postgresql', 'sqlite'],
                'html': ['html', 'html5'],
                'css': ['css', 'css3', 'scss', 'sass', 'less']
            },
            'frameworks_libraries': {
                'react': ['react', 'reactjs', 'react.js', 'jsx'],
                'angular': ['angular', 'angularjs', 'angular.js'],
                'vue': ['vue', 'vuejs', 'vue.js'],
                'node.js': ['node', 'nodejs', 'node.js', 'express'],
                'django': ['django', 'django framework'],
                'flask': ['flask', 'flask framework'],
                'spring': ['spring', 'spring boot', 'spring framework'],
                'laravel': ['laravel'],
                'rails': ['rails', 'ruby on rails'],
                'asp.net': ['asp.net', 'aspnet', 'dotnet'],
                'next.js': ['next', 'nextjs', 'next.js'],
                'nuxt.js': ['nuxt', 'nuxtjs', 'nuxt.js'],
                'svelte': ['svelte'],
                'ember': ['ember', 'emberjs'],
                'backbone': ['backbone', 'backbonejs'],
                'jquery': ['jquery', 'jq'],
                'bootstrap': ['bootstrap', 'twitter bootstrap'],
                'tailwind': ['tailwind', 'tailwindcss'],
                'material-ui': ['material-ui', 'mui', 'material design']
            },
            'databases': {
                'mysql': ['mysql', 'my sql'],
                'postgresql': ['postgresql', 'postgres', 'pg'],
                'mongodb': ['mongodb', 'mongo', 'nosql'],
                'redis': ['redis'],
                'elasticsearch': ['elasticsearch', 'elastic search'],
                'cassandra': ['cassandra'],
                'dynamodb': ['dynamodb', 'dynamo db'],
                'oracle': ['oracle', 'oracle db'],
                'sqlite': ['sqlite', 'sqlite3'],
                'mariadb': ['mariadb', 'maria db'],
                'neo4j': ['neo4j', 'neo 4j'],
                'influxdb': ['influxdb', 'influx db'],
                'couchdb': ['couchdb', 'couch db']
            },
            'cloud_platforms': {
                'aws': ['aws', 'amazon web services', 'amazon aws'],
                'azure': ['azure', 'microsoft azure'],
                'gcp': ['gcp', 'google cloud', 'google cloud platform'],
                'heroku': ['heroku'],
                'digital ocean': ['digital ocean', 'digitalocean', 'do'],
                'linode': ['linode'],
                'vultr': ['vultr'],
                'cloudflare': ['cloudflare'],
                'vercel': ['vercel'],
                'netlify': ['netlify'],
                'firebase': ['firebase', 'google firebase']
            },
            'devops_tools': {
                'docker': ['docker', 'docker container', 'dockerfile'],
                'kubernetes': ['kubernetes', 'k8s', 'kube'],
                'jenkins': ['jenkins', 'jenkins ci'],
                'gitlab ci': ['gitlab ci', 'gitlab-ci'],
                'github actions': ['github actions', 'github ci'],
                'terraform': ['terraform'],
                'ansible': ['ansible'],
                'chef': ['chef'],
                'puppet': ['puppet'],
                'vagrant': ['vagrant'],
                'consul': ['consul'],
                'vault': ['vault', 'hashicorp vault'],
                'prometheus': ['prometheus'],
                'grafana': ['grafana']
            },
            'mobile_development': {
                'react native': ['react native', 'react-native'],
                'flutter': ['flutter'],
                'xamarin': ['xamarin'],
                'ionic': ['ionic'],
                'cordova': ['cordova', 'phonegap'],
                'android': ['android', 'android development'],
                'ios': ['ios', 'ios development'],
                'swift': ['swift', 'swift ui'],
                'kotlin': ['kotlin', 'kotlin android'],
                'objective-c': ['objective-c', 'objc']
            },
            'data_science': {
                'machine learning': ['machine learning', 'ml', 'ai'],
                'deep learning': ['deep learning', 'neural networks'],
                'tensorflow': ['tensorflow', 'tf'],
                'pytorch': ['pytorch', 'torch'],
                'scikit-learn': ['scikit-learn', 'sklearn'],
                'pandas': ['pandas', 'pd'],
                'numpy': ['numpy', 'np'],
                'matplotlib': ['matplotlib', 'plt'],
                'seaborn': ['seaborn'],
                'jupyter': ['jupyter', 'jupyter notebook'],
                'spark': ['spark', 'apache spark'],
                'hadoop': ['hadoop', 'apache hadoop'],
                'kafka': ['kafka', 'apache kafka']
            },
            'testing': {
                'jest': ['jest'],
                'mocha': ['mocha'],
                'chai': ['chai'],
                'cypress': ['cypress'],
                'selenium': ['selenium'],
                'pytest': ['pytest', 'py test'],
                'junit': ['junit'],
                'testng': ['testng', 'test ng'],
                'karma': ['karma'],
                'jasmine': ['jasmine'],
                'protractor': ['protractor'],
                'playwright': ['playwright']
            },
            'other_tools': {
                'git': ['git', 'git version control'],
                'github': ['github'],
                'gitlab': ['gitlab'],
                'bitbucket': ['bitbucket'],
                'jira': ['jira', 'atlassian jira'],
                'confluence': ['confluence', 'atlassian confluence'],
                'slack': ['slack'],
                'figma': ['figma'],
                'sketch': ['sketch'],
                'adobe': ['adobe', 'adobe creative suite'],
                'photoshop': ['photoshop', 'ps'],
                'illustrator': ['illustrator', 'ai'],
                'wordpress': ['wordpress', 'wp'],
                'drupal': ['drupal'],
                'magento': ['magento'],
                'shopify': ['shopify']
            }
        }
        
        # Create reverse mapping for faster lookup
        self.skill_to_category = {}
        self.skill_variations = {}
        
        for category, skills in self.skill_categories.items():
            for main_skill, variations in skills.items():
                self.skill_to_category[main_skill] = category
                self.skill_variations[main_skill] = variations
                
                # Add variations to the mapping
                for variation in variations:
                    self.skill_to_category[variation] = category
                    self.skill_variations[variation] = variations
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job description text"""
        if not text:
            return []
        
        text_lower = text.lower()
        found_skills = []
        
        # Check for exact matches first
        for skill, variations in self.skill_variations.items():
            for variation in variations:
                if variation in text_lower:
                    found_skills.append(skill)
                    break
        
        # Remove duplicates and return
        return list(set(found_skills))
    
    def find_skill_matches(self, job_skills: List[str], user_skills: List[str]) -> List[SkillMatch]:
        """Find matches between job requirements and user skills"""
        matches = []
        user_skills_lower = [skill.lower() for skill in user_skills]
        
        for job_skill in job_skills:
            job_skill_lower = job_skill.lower()
            
            # Check for exact match
            if job_skill_lower in user_skills_lower:
                matches.append(SkillMatch(
                    skill=job_skill,
                    category=self.skill_to_category.get(job_skill_lower, 'other'),
                    match_type='exact',
                    confidence=1.0,
                    job_requirement=job_skill,
                    user_skill=job_skill
                ))
                continue
            
            # Check for variations match
            for user_skill in user_skills:
                user_skill_lower = user_skill.lower()
                
                # Check if they're variations of the same skill
                if (job_skill_lower in self.skill_variations.get(user_skill_lower, []) or
                    user_skill_lower in self.skill_variations.get(job_skill_lower, [])):
                    matches.append(SkillMatch(
                        skill=job_skill,
                        category=self.skill_to_category.get(job_skill_lower, 'other'),
                        match_type='variation',
                        confidence=0.9,
                        job_requirement=job_skill,
                        user_skill=user_skill
                    ))
                    break
                
                # Check for partial match (only for meaningful substrings)
                if (self._is_meaningful_partial_match(job_skill_lower, user_skill_lower)):
                    print(f"DEBUG: Partial match found: {job_skill_lower} <-> {user_skill_lower}")
                    matches.append(SkillMatch(
                        skill=job_skill,
                        category=self.skill_to_category.get(job_skill_lower, 'other'),
                        match_type='partial',
                        confidence=0.7,
                        job_requirement=job_skill,
                        user_skill=user_skill
                    ))
                    break
                
                # Check for related skills (same category)
                job_category = self.skill_to_category.get(job_skill_lower)
                user_category = self.skill_to_category.get(user_skill_lower)
                
                if job_category and user_category and job_category == user_category:
                    matches.append(SkillMatch(
                        skill=job_skill,
                        category=job_category,
                        match_type='related',
                        confidence=0.5,
                        job_requirement=job_skill,
                        user_skill=user_skill
                    ))
                    break
        
        return matches
    
    def calculate_match_score(self, job_skills: List[str], user_skills: List[str]) -> float:
        """Calculate overall match score between job and user skills"""
        if not job_skills or not user_skills:
            return 0.0
        
        matches = self.find_skill_matches(job_skills, user_skills)
        
        if not matches:
            return 0.0
        
        # Calculate weighted score based on match types
        total_score = 0.0
        for match in matches:
            total_score += match.confidence
        
        # Normalize by number of job requirements
        if len(job_skills) == 0:
            return 0.0  # No job skills to match against
        return min(total_score / len(job_skills), 1.0)
    
    def get_skill_gaps(self, job_skills: List[str], user_skills: List[str]) -> List[str]:
        """Get skills that job requires but user doesn't have"""
        matches = self.find_skill_matches(job_skills, user_skills)
        matched_skills = {match.skill.lower() for match in matches}
        
        gaps = []
        for job_skill in job_skills:
            if job_skill.lower() not in matched_skills:
                gaps.append(job_skill)
        
        return gaps
    
    def get_skill_recommendations(self, job_skills: List[str], user_skills: List[str]) -> List[str]:
        """Get skill recommendations based on job requirements"""
        gaps = self.get_skill_gaps(job_skills, user_skills)
        
        # Prioritize skills by category frequency
        category_counts = {}
        for skill in gaps:
            category = self.skill_to_category.get(skill.lower(), 'other')
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Sort gaps by category frequency and skill importance
        prioritized_gaps = sorted(gaps, key=lambda s: (
            category_counts.get(self.skill_to_category.get(s.lower(), 'other'), 0),
            len(s)  # Prefer shorter, more common skills
        ), reverse=True)
        
        return prioritized_gaps[:5]  # Return top 5 recommendations
    
    def calculate_profile_match_score(self, job, user_profile: Dict) -> float:
        """Calculate profile compatibility score considering role domain, experience, location, and other factors"""
        profile_score = 0.0
        factors = []
        
        # Check if job has no skills - prioritize role matching completely
        has_skills = job.skills_required and len(job.skills_required) > 0
        
        if not has_skills:
            # If no skills listed, prioritize role matching with 100% weight
            role_score = self._calculate_role_domain_match(job, user_profile)
            profile_score = role_score  # 100% role-based matching
            factors.append(f"Role-only: {role_score:.2f}")
        else:
            # Normal weighted scoring when skills are present
            # 1. Role/Domain Matching (50% weight) - MOST IMPORTANT
            role_score = self._calculate_role_domain_match(job, user_profile)
            profile_score += role_score * 0.5
            factors.append(f"Role: {role_score:.2f}")
            
            # 2. Experience Level Matching (25% weight)
            exp_score = self._calculate_experience_match(job, user_profile)
            profile_score += exp_score * 0.25
            factors.append(f"Experience: {exp_score:.2f}")
            
            # 3. Location Preference (15% weight)
            location_score = self._calculate_location_match(job, user_profile)
            profile_score += location_score * 0.15
            factors.append(f"Location: {location_score:.2f}")
            
            # 4. Employment Type (7% weight)
            employment_score = self._calculate_employment_match(job, user_profile)
            profile_score += employment_score * 0.07
            factors.append(f"Employment: {employment_score:.2f}")
            
            # 5. Company Size/Type Preference (3% weight)
            company_score = self._calculate_company_match(job, user_profile)
            profile_score += company_score * 0.03
            factors.append(f"Company: {company_score:.2f}")
        
        return profile_score
    
    def _calculate_role_domain_match(self, job, user_profile: Dict) -> float:
        """Calculate role/domain compatibility using semantic similarity and dynamic classification"""
        job_title = (job.title or '').lower()
        job_desc = (job.description or '').lower()
        job_text = f"{job_title} {job_desc}"
        
        # Get user's role preference from keywords or infer from skills
        user_keywords = user_profile.get('keywords', [])
        user_skills = user_profile.get('skills', [])
        
        # Method 1: Semantic similarity using job title patterns
        user_role_signature = self._extract_role_signature(user_keywords, user_skills)
        job_role_signature = self._extract_role_signature([job_title], [])
        
        # Calculate semantic similarity between user and job role signatures
        semantic_score = self._calculate_semantic_similarity(user_role_signature, job_role_signature)
        
        # Method 2: Skill-based domain inference
        skill_domain_score = self._calculate_skill_domain_compatibility(user_skills, job_text)
        
        # Method 3: Job title pattern matching (lightweight)
        title_pattern_score = self._calculate_title_pattern_match(user_keywords, job_title)
        
        # Weighted combination of all methods
        final_score = (semantic_score * 0.5) + (skill_domain_score * 0.3) + (title_pattern_score * 0.2)
        
        return min(1.0, max(0.0, final_score))
    
    def _extract_role_signature(self, keywords: List[str], skills: List[str]) -> Dict[str, float]:
        """Extract a semantic signature of the role from keywords and skills"""
        signature = {}
        
        # Role-level indicators (high weight)
        role_indicators = {
            'technical': ['engineer', 'developer', 'programmer', 'architect', 'scientist', 'analyst', 'specialist'],
            'management': ['manager', 'director', 'lead', 'head', 'vp', 'chief', 'executive'],
            'creative': ['designer', 'creative', 'artist', 'writer', 'editor', 'content'],
            'business': ['marketing', 'sales', 'business', 'strategy', 'operations', 'finance'],
            'data': ['data', 'analytics', 'intelligence', 'research', 'statistics', 'machine learning'],
            'product': ['product', 'strategy', 'roadmap', 'user', 'customer', 'growth'],
            'support': ['support', 'customer', 'service', 'help', 'success', 'account']
        }
        
        # Skill-level indicators (medium weight)
        skill_categories = {
            'programming': ['python', 'javascript', 'java', 'react', 'node', 'sql', 'git'],
            'design': ['figma', 'sketch', 'adobe', 'photoshop', 'illustrator', 'ui', 'ux'],
            'marketing': ['google analytics', 'hubspot', 'seo', 'sem', 'social media', 'campaign'],
            'data': ['sql', 'python', 'tableau', 'power bi', 'excel', 'statistics', 'ml'],
            'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform'],
            'management': ['leadership', 'management', 'team', 'project', 'agile', 'scrum']
        }
        
        # Calculate role signature scores
        all_text = ' '.join(keywords + skills).lower()
        
        for category, indicators in role_indicators.items():
            score = sum(1 for indicator in indicators if indicator in all_text)
            signature[f'role_{category}'] = min(1.0, score / len(indicators))
        
        for category, indicators in skill_categories.items():
            score = sum(1 for indicator in indicators if indicator in all_text)
            signature[f'skill_{category}'] = min(1.0, score / len(indicators))
        
        return signature
    
    def _calculate_semantic_similarity(self, user_signature: Dict[str, float], job_signature: Dict[str, float]) -> float:
        """Calculate semantic similarity between user and job role signatures"""
        if not user_signature or not job_signature:
            return 0.5  # Neutral score
        
        # Get all unique keys
        all_keys = set(user_signature.keys()) | set(job_signature.keys())
        
        if not all_keys:
            return 0.5
        
        # Calculate cosine similarity
        dot_product = sum(user_signature.get(key, 0) * job_signature.get(key, 0) for key in all_keys)
        user_magnitude = sum(val ** 2 for val in user_signature.values()) ** 0.5
        job_magnitude = sum(val ** 2 for val in job_signature.values()) ** 0.5
        
        if user_magnitude == 0 or job_magnitude == 0:
            return 0.5
        
        similarity = dot_product / (user_magnitude * job_magnitude)
        return similarity
    
    def _calculate_skill_domain_compatibility(self, user_skills: List[str], job_text: str) -> float:
        """Calculate compatibility based on skill domain overlap"""
        if not user_skills:
            return 0.5
        
        # Define skill domains dynamically
        skill_domains = {
            'frontend': ['react', 'angular', 'vue', 'javascript', 'html', 'css', 'ui', 'ux'],
            'backend': ['python', 'java', 'node', 'api', 'database', 'sql', 'server'],
            'data': ['python', 'sql', 'tableau', 'analytics', 'statistics', 'machine learning'],
            'design': ['figma', 'sketch', 'adobe', 'photoshop', 'design', 'ui', 'ux'],
            'marketing': ['google analytics', 'hubspot', 'seo', 'sem', 'social media', 'campaign'],
            'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform'],
            'mobile': ['react native', 'flutter', 'ios', 'android', 'swift', 'kotlin']
        }
        
        user_domain_scores = {}
        job_domain_scores = {}
        
        # Calculate user domain scores
        user_text = ' '.join(user_skills).lower()
        for domain, skills in skill_domains.items():
            score = sum(1 for skill in skills if skill in user_text)
            user_domain_scores[domain] = min(1.0, score / len(skills))
        
        # Calculate job domain scores
        for domain, skills in skill_domains.items():
            score = sum(1 for skill in skills if skill in job_text)
            job_domain_scores[domain] = min(1.0, score / len(skills))
        
        # Calculate overlap
        overlap_score = 0
        total_weight = 0
        
        for domain in skill_domains.keys():
            user_score = user_domain_scores.get(domain, 0)
            job_score = job_domain_scores.get(domain, 0)
            
            if user_score > 0 or job_score > 0:
                # Weight by the maximum of user or job score
                weight = max(user_score, job_score)
                overlap_score += min(user_score, job_score) * weight
                total_weight += weight
        
        return overlap_score / max(total_weight, 1)
    
    def _is_meaningful_partial_match(self, skill1: str, skill2: str) -> bool:
        """Check if two skills have a meaningful partial match (not just substring)"""
        # Avoid matching single characters or very short strings
        if len(skill1) < 3 or len(skill2) < 3:
            return False
        
        # Avoid matching very common substrings
        common_substrings = ['js', 'js', 'sql', 'api', 'ui', 'ux', 'ml', 'ai', 'db', 'os', 'io']
        if skill1 in common_substrings or skill2 in common_substrings:
            return False
        
        # Check if one skill is a meaningful prefix/suffix of another
        if len(skill1) >= 4 and len(skill2) >= 4:
            # Check prefix match (at least 4 characters)
            if skill1.startswith(skill2[:4]) or skill2.startswith(skill1[:4]):
                return True
            # Check suffix match (at least 4 characters)
            if skill1.endswith(skill2[-4:]) or skill2.endswith(skill1[-4:]):
                return True
        
        # Check for meaningful word boundaries
        if ' ' in skill1 or ' ' in skill2:
            words1 = set(skill1.split())
            words2 = set(skill2.split())
            # If they share meaningful words (at least 3 characters)
            shared_words = words1.intersection(words2)
            meaningful_words = [w for w in shared_words if len(w) >= 3]
            if meaningful_words:
                return True
        
        return False
    
    def _calculate_title_pattern_match(self, user_keywords: List[str], job_title: str) -> float:
        """Calculate match based on job title patterns"""
        if not user_keywords or not job_title:
            return 0.5
        
        # Extract role patterns from user keywords
        user_patterns = set()
        for keyword in user_keywords:
            keyword_lower = keyword.lower()
            # Extract role words (nouns that typically indicate roles)
            words = keyword_lower.split()
            for word in words:
                if len(word) > 3 and word in ['manager', 'engineer', 'developer', 'analyst', 'designer', 'specialist', 'coordinator', 'director', 'lead', 'architect']:
                    user_patterns.add(word)
        
        # Check job title for similar patterns
        job_words = set(job_title.lower().split())
        matching_patterns = user_patterns.intersection(job_words)
        
        if not user_patterns:
            return 0.5
        
        return len(matching_patterns) / len(user_patterns)
    
    def _calculate_experience_match(self, job, user_profile: Dict) -> float:
        """Calculate experience level compatibility"""
        user_exp = user_profile.get('experience_level', 'mid')
        job_title = (job.title or '').lower()
        job_desc = (job.description or '').lower()
        
        # Define experience indicators
        entry_indicators = ['junior', 'entry', 'graduate', 'intern', 'trainee', 'associate', '0-2', '1-2', '2-3']
        mid_indicators = ['mid', 'middle', 'intermediate', '3-5', '4-6', '5-7', 'senior', 'lead']
        senior_indicators = ['senior', 'lead', 'principal', 'staff', 'architect', 'manager', 'director', '5+', '7+', '10+']
        expert_indicators = ['expert', 'principal', 'staff', 'architect', 'fellow', 'distinguished', '10+', '15+']
        
        # Determine job experience level
        job_exp_level = 'mid'  # default
        text = f"{job_title} {job_desc}"
        
        if any(indicator in text for indicator in expert_indicators):
            job_exp_level = 'expert'
        elif any(indicator in text for indicator in senior_indicators):
            job_exp_level = 'senior'
        elif any(indicator in text for indicator in entry_indicators):
            job_exp_level = 'entry'
        
        # Calculate compatibility score
        exp_levels = ['entry', 'mid', 'senior', 'expert']
        user_idx = exp_levels.index(user_exp) if user_exp in exp_levels else 1
        job_idx = exp_levels.index(job_exp_level) if job_exp_level in exp_levels else 1
        
        # Perfect match = 1.0, adjacent levels = 0.7, far apart = 0.3
        diff = abs(user_idx - job_idx)
        if diff == 0:
            return 1.0
        elif diff == 1:
            return 0.7
        elif diff == 2:
            return 0.4
        else:
            return 0.2
    
    def _calculate_location_match(self, job, user_profile: Dict) -> float:
        """Calculate location compatibility"""
        user_location = user_profile.get('location', '').lower()
        user_remote_pref = user_profile.get('where', '').lower()
        job_location = (job.location or '').lower()
        
        # If user prefers remote
        if user_remote_pref == 'remote':
            if 'remote' in job_location or 'anywhere' in job_location or 'worldwide' in job_location:
                return 1.0
            elif job_location == '' or job_location == 'n/a':
                return 0.8  # Unknown location, assume might be remote
            else:
                return 0.3  # Specific location when user wants remote
        
        # If user has specific location preference
        if user_location:
            if user_location in job_location or job_location in user_location:
                return 1.0
            elif 'remote' in job_location:
                return 0.8  # Remote is usually acceptable
            else:
                return 0.2  # Different location
        
        # No specific preference
        return 0.7
    
    def _calculate_employment_match(self, job, user_profile: Dict) -> float:
        """Calculate employment type compatibility"""
        user_employment = user_profile.get('employment_type', 'full-time')
        job_desc = (job.description or '').lower()
        job_title = (job.title or '').lower()
        text = f"{job_title} {job_desc}"
        
        # Detect employment type from job
        if 'contract' in text or 'freelance' in text:
            job_employment = 'contract'
        elif 'part-time' in text or 'part time' in text:
            job_employment = 'part-time'
        elif 'intern' in text or 'internship' in text:
            job_employment = 'internship'
        else:
            job_employment = 'full-time'
        
        # Perfect match
        if user_employment == job_employment:
            return 1.0
        
        # Some flexibility
        if user_employment == 'full-time' and job_employment == 'contract':
            return 0.6
        elif user_employment == 'contract' and job_employment == 'full-time':
            return 0.6
        else:
            return 0.3
    
    def _calculate_company_match(self, job, user_profile: Dict) -> float:
        """Calculate company type/size compatibility"""
        # This is a simplified version - could be enhanced with company data
        company_name = (job.company or '').lower()
        
        # Startup indicators
        startup_indicators = ['startup', 'early stage', 'seed', 'series a', 'series b']
        # Enterprise indicators  
        enterprise_indicators = ['inc', 'corp', 'corporation', 'enterprise', 'fortune']
        
        user_company_pref = user_profile.get('company_type', 'any')
        
        if user_company_pref == 'startup':
            if any(indicator in company_name for indicator in startup_indicators):
                return 1.0
            elif any(indicator in company_name for indicator in enterprise_indicators):
                return 0.3
            else:
                return 0.7
        
        elif user_company_pref == 'enterprise':
            if any(indicator in company_name for indicator in enterprise_indicators):
                return 1.0
            elif any(indicator in company_name for indicator in startup_indicators):
                return 0.3
            else:
                return 0.7
        
        # No preference
        return 0.8
