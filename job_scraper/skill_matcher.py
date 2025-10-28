"""
Skill matching and scoring system
"""
import re
from typing import List, Dict, Tuple, Set
from difflib import SequenceMatcher
from models import JobPosting, SkillMatch
from config import SKILLS_DATABASE

class SkillMatcher:
    """Advanced skill matching system"""
    
    def __init__(self):
        self.skills_db = SKILLS_DATABASE
        self.skill_synonyms = self._build_skill_synonyms()
        self.skill_categories = self._build_skill_categories()
    
    def _build_skill_synonyms(self) -> Dict[str, List[str]]:
        """Build a mapping of skills to their synonyms and variations"""
        synonyms = {}
        
        # Programming language synonyms
        synonyms.update({
            'javascript': ['js', 'ecmascript', 'nodejs', 'node.js'],
            'python': ['py', 'python3', 'python2'],
            'java': ['java8', 'java11', 'java17'],
            'c++': ['cpp', 'cplusplus', 'c plus plus'],
            'c#': ['csharp', 'c-sharp', 'dotnet', '.net'],
            'react': ['reactjs', 'react.js', 'reactjs'],
            'angular': ['angularjs', 'angular.js'],
            'vue': ['vuejs', 'vue.js'],
            'node.js': ['nodejs', 'node', 'nodejs'],
            'express': ['expressjs', 'express.js'],
            'django': ['djangoframework'],
            'flask': ['flaskframework'],
            'spring': ['springboot', 'spring framework'],
            'aws': ['amazon web services', 'amazonaws'],
            'gcp': ['google cloud', 'google cloud platform'],
            'azure': ['microsoft azure'],
            'kubernetes': ['k8s', 'kube'],
            'docker': ['docker container'],
            'machine learning': ['ml', 'machinelearning'],
            'deep learning': ['dl', 'deeplearning'],
            'artificial intelligence': ['ai', 'artificialintelligence'],
            'data science': ['datascience', 'data scientist'],
            'big data': ['bigdata', 'big-data'],
            'devops': ['dev ops', 'development operations'],
            'ci/cd': ['cicd', 'continuous integration', 'continuous deployment'],
            'rest api': ['restapi', 'rest', 'api'],
            'graphql': ['graph ql', 'graphql api'],
            'microservices': ['micro services', 'micro-services'],
            'agile': ['agile methodology', 'scrum', 'kanban'],
            'git': ['git version control', 'git vcs'],
            'github': ['git hub', 'github.com'],
            'gitlab': ['git lab', 'gitlab.com'],
            'jenkins': ['jenkins ci', 'jenkins pipeline'],
            'terraform': ['terraform infrastructure', 'infrastructure as code'],
            'ansible': ['ansible automation', 'ansible playbook'],
            'kubernetes': ['k8s', 'kube', 'kubernetes orchestration'],
            'docker': ['docker containerization', 'containerization'],
            'mongodb': ['mongo', 'mongo db'],
            'postgresql': ['postgres', 'postgres db', 'postgresql database'],
            'mysql': ['mysql database', 'mysql db'],
            'redis': ['redis cache', 'redis database'],
            'elasticsearch': ['elastic search', 'elasticsearch engine'],
            'kafka': ['apache kafka', 'kafka streaming'],
            'spark': ['apache spark', 'spark streaming'],
            'hadoop': ['apache hadoop', 'hadoop ecosystem'],
            'tableau': ['tableau visualization', 'tableau bi'],
            'power bi': ['powerbi', 'microsoft power bi'],
            'jupyter': ['jupyter notebook', 'jupyter lab'],
            'pandas': ['pandas library', 'pandas dataframe'],
            'numpy': ['numpy library', 'numpy array'],
            'scikit-learn': ['sklearn', 'scikit learn', 'sklearn library'],
            'tensorflow': ['tensor flow', 'tensorflow framework'],
            'pytorch': ['py torch', 'pytorch framework'],
            'keras': ['keras library', 'keras framework'],
            'opencv': ['open cv', 'opencv library'],
            'nltk': ['nltk library', 'natural language toolkit'],
            'spacy': ['spaCy', 'spacy library'],
            'react native': ['reactnative', 'react-native'],
            'flutter': ['flutter framework', 'flutter mobile'],
            'android': ['android development', 'android studio'],
            'ios': ['ios development', 'swift ios'],
            'xamarin': ['xamarin forms', 'xamarin development'],
            'ionic': ['ionic framework', 'ionic mobile'],
            'cordova': ['apache cordova', 'phonegap'],
            'html': ['html5', 'hypertext markup language'],
            'css': ['css3', 'cascading style sheets'],
            'bootstrap': ['bootstrap framework', 'bootstrap css'],
            'tailwind': ['tailwind css', 'tailwindcss'],
            'sass': ['sass css', 'sass preprocessor'],
            'less': ['less css', 'less preprocessor'],
            'webpack': ['webpack bundler', 'webpack build'],
            'babel': ['babel js', 'babel transpiler'],
            'typescript': ['ts', 'typescript js'],
            'es6': ['ecmascript 6', 'es2015'],
            'redux': ['redux state', 'redux management'],
            'mobx': ['mobx state', 'mobx management'],
            'vuex': ['vuex state', 'vuex management'],
            'next.js': ['nextjs', 'next js'],
            'nuxt.js': ['nuxtjs', 'nuxt js'],
            'gatsby': ['gatsby js', 'gatsby framework'],
            'svelte': ['svelte js', 'svelte framework'],
            'webpack': ['webpack bundler', 'webpack build'],
            'vite': ['vite bundler', 'vite build'],
            'parcel': ['parcel bundler', 'parcel build'],
            'rollup': ['rollup bundler', 'rollup build'],
            'babel': ['babel js', 'babel transpiler'],
            'eslint': ['eslint linter', 'eslint js'],
            'prettier': ['prettier formatter', 'prettier code'],
            'jest': ['jest testing', 'jest framework'],
            'mocha': ['mocha testing', 'mocha framework'],
            'chai': ['chai assertion', 'chai testing'],
            'cypress': ['cypress testing', 'cypress e2e'],
            'selenium': ['selenium webdriver', 'selenium testing'],
            'puppeteer': ['puppeteer automation', 'puppeteer testing'],
            'playwright': ['playwright testing', 'playwright automation'],
            'junit': ['junit testing', 'junit framework'],
            'testng': ['testng testing', 'testng framework'],
            'mockito': ['mockito mocking', 'mockito testing'],
            'wiremock': ['wiremock mocking', 'wiremock testing'],
            'postman': ['postman api', 'postman testing'],
            'insomnia': ['insomnia api', 'insomnia testing'],
            'swagger': ['swagger api', 'swagger documentation'],
            'openapi': ['openapi spec', 'openapi documentation'],
            'graphql': ['graph ql', 'graphql api'],
            'rest': ['rest api', 'restful api'],
            'soap': ['soap api', 'soap web service'],
            'grpc': ['grpc api', 'grpc service'],
            'microservices': ['micro services', 'micro-services'],
            'monolith': ['monolithic', 'monolithic architecture'],
            'serverless': ['serverless computing', 'serverless architecture'],
            'lambda': ['aws lambda', 'lambda function'],
            'api gateway': ['api gateway', 'aws api gateway'],
            'load balancer': ['load balancer', 'load balancing'],
            'cdn': ['content delivery network', 'cdn'],
            'cache': ['caching', 'cache strategy'],
            'redis': ['redis cache', 'redis database'],
            'memcached': ['memcached cache', 'memcached'],
            'varnish': ['varnish cache', 'varnish'],
            'nginx': ['nginx server', 'nginx web server'],
            'apache': ['apache server', 'apache web server'],
            'iis': ['iis server', 'internet information services'],
            'tomcat': ['apache tomcat', 'tomcat server'],
            'jetty': ['jetty server', 'eclipse jetty'],
            'wildfly': ['wildfly server', 'jboss wildfly'],
            'weblogic': ['oracle weblogic', 'weblogic server'],
            'websphere': ['ibm websphere', 'websphere server'],
            'glassfish': ['glassfish server', 'oracle glassfish'],
            'payara': ['payara server', 'payara micro'],
            'liberty': ['websphere liberty', 'ibm liberty'],
            'quarkus': ['quarkus framework', 'quarkus java'],
            'micronaut': ['micronaut framework', 'micronaut java'],
            'spring boot': ['springboot', 'spring boot framework'],
            'spring cloud': ['springcloud', 'spring cloud framework'],
            'spring security': ['springsecurity', 'spring security framework'],
            'spring data': ['springdata', 'spring data framework'],
            'spring mvc': ['springmvc', 'spring mvc framework'],
            'spring webflux': ['springwebflux', 'spring webflux framework'],
            'hibernate': ['hibernate orm', 'hibernate framework'],
            'jpa': ['java persistence api', 'jpa orm'],
            'jdbc': ['java database connectivity', 'jdbc driver'],
            'jooq': ['jooq orm', 'jooq framework'],
            'mybatis': ['mybatis orm', 'mybatis framework'],
            'jooq': ['jooq orm', 'jooq framework'],
            'querydsl': ['querydsl orm', 'querydsl framework'],
            'jooq': ['jooq orm', 'jooq framework'],
            'jooq': ['jooq orm', 'jooq framework'],
        })
        
        return synonyms
    
    def _build_skill_categories(self) -> Dict[str, str]:
        """Build a mapping of skills to their categories"""
        categories = {}
        
        for category, skills in self.skills_db.items():
            for skill in skills:
                categories[skill.lower()] = category
        
        return categories
    
    def find_skill_matches(self, job_posting: JobPosting, user_skills: List[str]) -> List[SkillMatch]:
        """Find skill matches between job requirements and user skills"""
        matches = []
        job_text = f"{job_posting.title} {job_posting.description}".lower()
        
        for user_skill in user_skills:
            user_skill_lower = user_skill.lower().strip()
            
            # Check for exact matches in job text
            if user_skill_lower in job_text:
                matches.append(SkillMatch(
                    skill=user_skill,
                    category=self.skill_categories.get(user_skill_lower, 'other'),
                    match_type='exact',
                    confidence=1.0,
                    job_requirement=user_skill,
                    user_skill=user_skill
                ))
                continue
            
            # Check for exact matches in job skills
            for job_skill in job_posting.skills_required:
                job_skill_lower = job_skill.lower().strip()
                if user_skill_lower == job_skill_lower:
                    matches.append(SkillMatch(
                        skill=user_skill,
                        category=self.skill_categories.get(user_skill_lower, 'other'),
                        match_type='exact',
                        confidence=1.0,
                        job_requirement=job_skill,
                        user_skill=user_skill
                    ))
                    break
            
            # Check for synonym matches
            if user_skill_lower in self.skill_synonyms:
                for synonym in self.skill_synonyms[user_skill_lower]:
                    if synonym in job_text:
                        matches.append(SkillMatch(
                            skill=user_skill,
                            category=self.skill_categories.get(user_skill_lower, 'other'),
                            match_type='synonym',
                            confidence=0.9,
                            job_requirement=synonym,
                            user_skill=user_skill
                        ))
                        break
            
            # Check for partial matches
            for job_skill in job_posting.skills_required:
                job_skill_lower = job_skill.lower().strip()
                similarity = self._calculate_similarity(user_skill_lower, job_skill_lower)
                if similarity > 0.7:
                    matches.append(SkillMatch(
                        skill=user_skill,
                        category=self.skill_categories.get(user_skill_lower, 'other'),
                        match_type='partial',
                        confidence=similarity,
                        job_requirement=job_skill,
                        user_skill=user_skill
                    ))
        
        return matches
    
    def _calculate_similarity(self, skill1: str, skill2: str) -> float:
        """Calculate similarity between two skills"""
        return SequenceMatcher(None, skill1, skill2).ratio()
    
    def calculate_advanced_match_score(self, job_posting: JobPosting, user_skills: List[str]) -> float:
        """Return coverage of job required skills by user's skills.

        - 1.0 only when ALL job required skills are covered by the user's skills
        - Otherwise, proportional to fraction of required skills covered
        - If the job has no explicit required skills, fall back to fraction of user skills matched in text
        """
        if not user_skills:
            return 0.0

        user_set = {s.lower().strip() for s in user_skills if s}
        job_required = [(skill or '').lower().strip() for skill in (job_posting.skills_required or []) if skill]
        job_required = [s for s in job_required if s]

        # If job lists required skills, compute coverage of those
        if job_required:
            covered = 0
            for req in job_required:
                if self._is_skill_covered_by_user(req, user_set):
                    covered += 1
            return covered / max(1, len(job_required))

        # Fallback: fraction of user skills present in job text when no explicit required skills
        job_text = f"{job_posting.title} {job_posting.description}".lower()
        matched_user = 0
        for u in user_set:
            if u and u in job_text:
                matched_user += 1
            else:
                # check synonyms presence in text
                for syn in self.skill_synonyms.get(u, []):
                    if syn in job_text:
                        matched_user += 1
                        break
        return matched_user / max(1, len(user_set))

    def _is_skill_covered_by_user(self, job_skill: str, user_set: Set[str]) -> bool:
        """Determine if a job-required skill is covered by the user's skills via:
        - exact match
        - synonym match (both directions)
        - partial similarity (>= 0.8)
        """
        if job_skill in user_set:
            return True

        # Check if any user skill has a synonym that equals the job skill
        for u in user_set:
            for syn in self.skill_synonyms.get(u, []):
                if syn == job_skill:
                    return True

        # Check synonyms defined on the job skill side
        for syn in self.skill_synonyms.get(job_skill, []):
            if syn in user_set:
                return True

        # Partial similarity against each user skill
        for u in user_set:
            if self._calculate_similarity(job_skill, u) >= 0.8:
                return True

        return False
    
    def get_skill_recommendations(self, job_posting: JobPosting, user_skills: List[str]) -> List[str]:
        """Get skill recommendations based on job requirements"""
        recommendations = []
        job_skills = set(job_posting.skills_required)
        user_skills_set = set(skill.lower() for skill in user_skills)
        
        for skill in job_skills:
            if skill.lower() not in user_skills_set:
                recommendations.append(skill)
        
        return recommendations[:10]  # Return top 10 recommendations
