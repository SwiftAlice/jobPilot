#!/usr/bin/env python3
"""
ATS Scoring Web API
Simple Flask/FastAPI server that provides ATS scoring via HTTP endpoints
Works with Python 3.8+ and minimal dependencies
"""

import re
import json
import sys
import argparse
from collections import Counter
from dataclasses import dataclass, asdict
from typing import Dict, List, Tuple, Optional
import base64
import io

# Check if Flask is available, fallback to simple HTTP server
try:
    from flask import Flask, request, jsonify, render_template_string
    from flask_cors import CORS
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False

@dataclass
class ATSScoreResult:
    total_score: float
    keyword_score: float
    parsing_score: float
    section_score: float
    skills_score: float
    education_score: float
    recommendations: List[str]
    matched_keywords: List[str]
    missing_keywords: List[str]

class ATSScorer:
    def __init__(self):
        self.stop_words = {
            'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
            'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she',
            'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
            'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that',
            'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an',
            'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of',
            'at', 'by', 'for', 'with', 'through', 'during', 'before', 'after', 'above',
            'below', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
            'further', 'then', 'once', 'job', 'position', 'role', 'candidate', 'work'
        }
    
    def extract_keywords_from_job_description(self, job_description: str) -> Dict[str, List[str]]:
        """Extract keywords from job description"""
        # Skill patterns (all industries)
        skill_patterns = [
            r'\b(?:proficient|experienced|skilled|expertise|knowledge)\s+(?:in|with|of)\s+([^,.;]+)',
            r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:experience|skills?|knowledge|ability)',
            r'\b(?:experience|knowledge|proficiency)\s+(?:of|in|with)\s+([^,.;]+)',
            r'\b(?:must|should|required)\s+(?:have|know|understand)\s+([^,.;]+)',
            r'\b(?:familiar|comfortable)\s+with\s+([^,.;]+)',
        ]
        
        # Education patterns
        education_patterns = [
            r'\b(Bachelor|Master|PhD|Doctorate|Associate|degree)\s+(?:in|of)\s+([^,.;]+)',
            r'\b([^,.;]+)\s+(?:degree|diploma|certification)\b',
        ]
        
        # Certification patterns
        certification_patterns = [
            r'\b([A-Z]{2,})\s+(?:certification|certified|certificate)',
            r'\bcertified\s+([^,.;]+)',
            r'\b([^,.;]+)\s+(?:license|licensed)',
        ]
        
        # Extract components
        skills = []
        for pattern in skill_patterns:
            matches = re.findall(pattern, job_description, re.IGNORECASE)
            for match in matches:
                skill = ' '.join(match) if isinstance(match, tuple) else match
                if 2 < len(skill.strip()) < 50:
                    skills.append(skill.strip())
        
        education = []
        for pattern in education_patterns:
            matches = re.findall(pattern, job_description, re.IGNORECASE)
            for match in matches:
                edu = ' '.join(match) if isinstance(match, tuple) else match
                if len(edu.strip()) > 2:
                    education.append(edu.strip())
        
        certifications = []
        for pattern in certification_patterns:
            matches = re.findall(pattern, job_description, re.IGNORECASE)
            certifications.extend([m.strip() for m in matches if len(m.strip()) > 1])
        
        # Extract keywords by frequency
        words = re.findall(r'\b[a-zA-Z]{3,}\b', job_description.lower())
        filtered_words = [word for word in words if word not in self.stop_words]
        word_freq = Counter(filtered_words)
        top_keywords = [word for word, count in word_freq.most_common(20)]
        
        return {
            'required_keywords': top_keywords[:8],
            'preferred_keywords': top_keywords[8:16],
            'skills': list(set(skills)),
            'education': list(set(education)),
            'certifications': list(set(certifications))
        }
    
    def calculate_keyword_score(self, resume_text: str, keywords_dict: Dict[str, List[str]]) -> Tuple[float, List[str], List[str]]:
        """Calculate keyword matching score"""
        resume_lower = resume_text.lower()
        matched_keywords = []
        missing_keywords = []
        total_weight = 0
        matched_weight = 0
        
        # Required keywords (2x weight)
        for keyword in keywords_dict['required_keywords']:
            total_weight += 2
            if keyword.lower() in resume_lower:
                matched_keywords.append(keyword)
                matched_weight += 2
            else:
                missing_keywords.append(keyword)
        
        # Preferred keywords (1x weight)
        for keyword in keywords_dict['preferred_keywords']:
            total_weight += 1
            if keyword.lower() in resume_lower:
                matched_keywords.append(keyword)
                matched_weight += 1
            else:
                missing_keywords.append(keyword)
        
        # Skills and certifications (1.5x weight)
        for skill in keywords_dict['skills'] + keywords_dict['certifications']:
            total_weight += 1.5
            if skill.lower() in resume_lower:
                matched_keywords.append(skill)
                matched_weight += 1.5
            else:
                missing_keywords.append(skill)
        
        score = (matched_weight / total_weight * 100) if total_weight > 0 else 0
        return score, matched_keywords, missing_keywords
    
    def calculate_parsing_score(self, resume_text: str) -> float:
        """Calculate parsing quality score"""
        checks = {
            'has_email': bool(re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', resume_text)),
            'has_phone': bool(re.search(r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b', resume_text)),
            'has_work_experience': bool(re.search(r'\b(experience|employment|work|job|career)\b', resume_text, re.IGNORECASE)),
            'has_education': bool(re.search(r'\b(education|degree|university|college)\b', resume_text, re.IGNORECASE)),
            'has_skills': bool(re.search(r'\b(skills|proficient|experienced|knowledge)\b', resume_text, re.IGNORECASE)),
            'proper_length': 300 <= len(resume_text) <= 8000,
            'has_dates': bool(re.search(r'\b(?:19|20)\d{2}\b', resume_text)),
            'has_action_verbs': bool(re.search(r'\b(managed|led|developed|created|implemented|improved|achieved)\b', resume_text, re.IGNORECASE)),
            'has_quantifiable_results': bool(re.search(r'\b\d+%|\$\d+|increased|decreased|improved\b', resume_text, re.IGNORECASE)),
            'professional_tone': not bool(re.search(r'\b(awesome|cool|amazing|epic)\b', resume_text, re.IGNORECASE))
        }
        
        return (sum(checks.values()) / len(checks)) * 100
    
    def calculate_section_score(self, resume_text: str) -> float:
        """Calculate section completeness score"""
        sections = {
            'contact': bool(re.search(r'\b(contact|email|phone)\b', resume_text, re.IGNORECASE)),
            'summary': bool(re.search(r'\b(summary|objective|profile)\b', resume_text, re.IGNORECASE)),
            'experience': bool(re.search(r'\b(experience|employment|work)\b', resume_text, re.IGNORECASE)),
            'education': bool(re.search(r'\b(education|degree|university)\b', resume_text, re.IGNORECASE)),
            'skills': bool(re.search(r'\b(skills|technical|proficiencies)\b', resume_text, re.IGNORECASE)),
            'achievements': bool(re.search(r'\b(achievement|award|accomplishment)\b', resume_text, re.IGNORECASE))
        }
        
        weights = {'contact': 2, 'experience': 2, 'education': 2, 'skills': 2, 'summary': 1, 'achievements': 1}
        total_weight = sum(weights.values())
        achieved_weight = sum(weights[s] for s, present in sections.items() if present)
        
        return (achieved_weight / total_weight) * 100
    
    def calculate_skills_score(self, resume_text: str, keywords_dict: Dict[str, List[str]]) -> float:
        """Calculate skills matching score"""
        all_skills = keywords_dict['skills'] + keywords_dict['certifications']
        
        if not all_skills:
            # Fallback professional skills
            common_skills = ['management', 'leadership', 'communication', 'analytical', 'teamwork']
            all_skills = [s for s in common_skills if s in resume_text.lower()]
        
        matched = [s for s in all_skills if s.lower() in resume_text.lower()]
        return (len(matched) / len(all_skills) * 100) if all_skills else 80
    
    def calculate_education_score(self, resume_text: str, keywords_dict: Dict[str, List[str]]) -> float:
        """Calculate education score"""
        if not keywords_dict['education']:
            return 100  # No requirements
        
        resume_has_edu = any(edu.lower() in resume_text.lower() for edu in keywords_dict['education'])
        return 85 if resume_has_edu else 40
    
    def calculate_ats_score(self, resume_text: str, job_description: str) -> ATSScoreResult:
        """Main scoring function"""
        keywords_dict = self.extract_keywords_from_job_description(job_description)
        
        keyword_score, matched_keywords, missing_keywords = self.calculate_keyword_score(resume_text, keywords_dict)
        parsing_score = self.calculate_parsing_score(resume_text)
        section_score = self.calculate_section_score(resume_text)
        skills_score = self.calculate_skills_score(resume_text, keywords_dict)
        education_score = self.calculate_education_score(resume_text, keywords_dict)
        
        total_score = (
            keyword_score * 0.45 +
            parsing_score * 0.25 +
            section_score * 0.15 +
            skills_score * 0.10 +
            education_score * 0.05
        )
        
        result = ATSScoreResult(
            total_score=min(100, max(0, total_score)),
            keyword_score=keyword_score,
            parsing_score=parsing_score,
            section_score=section_score,
            skills_score=skills_score,
            education_score=education_score,
            matched_keywords=matched_keywords,
            missing_keywords=missing_keywords,
            recommendations=[]
        )
        
        # Generate recommendations
        recommendations = []
        if result.keyword_score < 70:
            recommendations.append("Add more relevant keywords from job description")
        if result.parsing_score < 80:
            recommendations.append("Improve formatting and structure")
        if result.section_score < 75:
            recommendations.append("Add missing resume sections")
        if result.total_score < 75:
            recommendations.append("Aim for 75%+ for better ATS compatibility")
        
        result.recommendations = recommendations
        return result

# Flask Web API (if available)
if FLASK_AVAILABLE:
    app = Flask(__name__)
    CORS(app)
    scorer = ATSScorer()
    
    HTML_TEMPLATE = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>ATS Score Calculator</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            textarea { width: 100%; height: 150px; margin: 10px 0; padding: 10px; }
            button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #005a87; }
            .score { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .excellent { color: #28a745; }
            .good { color: #17a2b8; }
            .fair { color: #ffc107; }
            .poor { color: #dc3545; }
            .breakdown { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 20px 0; }
            .component { background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #007cba; }
        </style>
    </head>
    <body>
        <h1>🎯 ATS Score Calculator</h1>
        <p>Calculate how well your resume matches a job description for Applicant Tracking Systems.</p>
        
        <div class="container">
            <h3>Job Description</h3>
            <textarea id="jobDescription" placeholder="Paste the job description here..."></textarea>
            
            <h3>Resume Text</h3>
            <textarea id="resumeText" placeholder="Paste your resume text here..."></textarea>
            
            <button onclick="calculateScore()">Calculate ATS Score</button>
        </div>
        
        <div id="results" style="display: none;">
            <div class="container">
                <h3>Results</h3>
                <div id="scoreDisplay"></div>
                <div id="breakdown"></div>
                <div id="recommendations"></div>
            </div>
        </div>
        
        <script>
        async function calculateScore() {
            const jobDesc = document.getElementById('jobDescription').value;
            const resumeText = document.getElementById('resumeText').value;
            
            if (!jobDesc || !resumeText) {
                alert('Please fill in both fields');
                return;
            }
            
            try {
                const response = await fetch('/api/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        job_description: jobDesc,
                        resume_text: resumeText
                    })
                });
                
                const result = await response.json();
                displayResults(result);
            } catch (error) {
                alert('Error calculating score: ' + error.message);
            }
        }
        
        function displayResults(result) {
            const resultsDiv = document.getElementById('results');
            const scoreDisplay = document.getElementById('scoreDisplay');
            const breakdown = document.getElementById('breakdown');
            const recommendations = document.getElementById('recommendations');
            
            // Score display
            const scoreClass = result.total_score >= 90 ? 'excellent' : 
                             result.total_score >= 80 ? 'good' : 
                             result.total_score >= 70 ? 'fair' : 'poor';
            
            scoreDisplay.innerHTML = `
                <div class="score ${scoreClass}">
                    Overall ATS Score: ${result.total_score.toFixed(1)}%
                </div>
            `;
            
            // Breakdown
            breakdown.innerHTML = `
                <div class="breakdown">
                    <div class="component">
                        <strong>Keyword Matching</strong><br>
                        ${result.keyword_score.toFixed(1)}% (45% weight)
                    </div>
                    <div class="component">
                        <strong>Parsing Quality</strong><br>
                        ${result.parsing_score.toFixed(1)}% (25% weight)
                    </div>
                    <div class="component">
                        <strong>Section Analysis</strong><br>
                        ${result.section_score.toFixed(1)}% (15% weight)
                    </div>
                    <div class="component">
                        <strong>Skills Matching</strong><br>
                        ${result.skills_score.toFixed(1)}% (10% weight)
                    </div>
                    <div class="component">
                        <strong>Education</strong><br>
                        ${result.education_score.toFixed(1)}% (5% weight)
                    </div>
                </div>
            `;
            
            // Recommendations
            recommendations.innerHTML = `
                <h4>💡 Recommendations:</h4>
                <ul>
                    ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
                <h4>✅ Matched Keywords (${result.matched_keywords.length}):</h4>
                <p>${result.matched_keywords.slice(0, 10).join(', ')}${result.matched_keywords.length > 10 ? '...' : ''}</p>
                <h4>❌ Missing Keywords (${result.missing_keywords.length}):</h4>
                <p>${result.missing_keywords.slice(0, 10).join(', ')}${result.missing_keywords.length > 10 ? '...' : ''}</p>
            `;
            
            resultsDiv.style.display = 'block';
        }
        </script>
    </body>
    </html>
    """
    
    @app.route('/')
    def home():
        return HTML_TEMPLATE
    
    @app.route('/api/score', methods=['POST'])
    def calculate_score():
        try:
            data = request.json
            job_description = data.get('job_description', '')
            resume_text = data.get('resume_text', '')
            
            if not job_description or not resume_text:
                return jsonify({'error': 'Missing job_description or resume_text'}), 400
            
            result = scorer.calculate_ats_score(resume_text, job_description)
            return jsonify(asdict(result))
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/keywords', methods=['POST'])
    def analyze_keywords():
        try:
            data = request.json
            job_description = data.get('job_description', '')
            
            if not job_description:
                return jsonify({'error': 'Missing job_description'}), 400
            
            keywords = scorer.extract_keywords_from_job_description(job_description)
            return jsonify(keywords)
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

def run_web_server(port=5000):
    """Run the Flask web server"""
    if not FLASK_AVAILABLE:
        print("Flask not available. Install with: pip3 install flask flask-cors")
        return
    
    print(f"🌐 Starting ATS Scorer Web API on http://localhost:{port}")
    print("📋 Endpoints:")
    print(f"  • Web Interface: http://localhost:{port}")
    print(f"  • API Score: POST http://localhost:{port}/api/score")
    print(f"  • API Keywords: POST http://localhost:{port}/api/keywords")
    
    app.run(host='0.0.0.0', port=port, debug=True)

def run_cli():
    """Run command line interface"""
    print("ATS Score Calculator - CLI Mode")
    print("=" * 40)
    
    print("\nEnter job description (press Enter twice when done):")
    job_lines = []
    empty_lines = 0
    while empty_lines < 2:
        line = input()
        if line.strip() == "":
            empty_lines += 1
        else:
            empty_lines = 0
        job_lines.append(line)
    job_description = '\n'.join(job_lines[:-2])  # Remove last two empty lines
    
    print("\nEnter resume text (press Enter twice when done):")
    resume_lines = []
    empty_lines = 0
    while empty_lines < 2:
        line = input()
        if line.strip() == "":
            empty_lines += 1
        else:
            empty_lines = 0
        resume_lines.append(line)
    resume_text = '\n'.join(resume_lines[:-2])
    
    # Calculate score
    scorer = ATSScorer()
    result = scorer.calculate_ats_score(resume_text, job_description)
    
    # Display results
    print(f"\n🎯 ATS Score: {result.total_score:.1f}%")
    print(f"📊 Breakdown:")
    print(f"  • Keywords: {result.keyword_score:.1f}%")
    print(f"  • Parsing: {result.parsing_score:.1f}%") 
    print(f"  • Sections: {result.section_score:.1f}%")
    print(f"  • Skills: {result.skills_score:.1f}%")
    print(f"  • Education: {result.education_score:.1f}%")
    
    if result.recommendations:
        print(f"\n💡 Recommendations:")
        for i, rec in enumerate(result.recommendations, 1):
            print(f"  {i}. {rec}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ATS Score Calculator")
    parser.add_argument("--mode", choices=["web", "cli"], default="cli", help="Run mode")
    parser.add_argument("--port", type=int, default=5000, help="Web server port")
    
    args = parser.parse_args()
    
    if args.mode == "web":
        run_web_server(args.port)
    else:
        run_cli()