import React, { useRef, useState, useEffect } from 'react';
import { 
  Download, 
  FileText, 
  Eye,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Zap,
  Target,
  Palette,
  X,
  CheckCircle,
  AlertCircle,
  Wand2,
  Loader2
} from 'lucide-react';
import ResumePreview from './ResumePreview';
import { ResumeData, ATSScore, UploadedFiles, ResumeTemplate } from '@/types/resume-builder-types';

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

interface ResumeEditorProps {
  resumeData: ResumeData;
  setResumeData: React.Dispatch<React.SetStateAction<ResumeData>>;
  atsScore: ATSScore | null;
  setAtsScore: (score: ATSScore | null) => void;
  keywordMatches: string[];
  setKeywordMatches: (keywords: string[]) => void;
  resumeType: string;
  setResumeType: (type: string) => void;
  selectedTemplate: string;
  setSelectedTemplate: (template: string) => void;
  resumeTemplates: ResumeTemplate[];
  uploadedFiles: UploadedFiles;
  setUploadedFiles?: React.Dispatch<React.SetStateAction<UploadedFiles>>;
  onBack: () => void;
  onGeneratePDF: () => void;
  onSave: () => void;
  updateATSScore: (resumeData: ResumeData, jdText?: string) => Promise<void>;
  inputJD: string;
  tailorSummaryToJD?: () => Promise<void>;
  isTailoringSummary?: boolean;
  setInputJD?: (jd: string) => void;
  onResumeDataChange?: (newResumeData: ResumeData) => void;
  onATSScoreUpdate?: (score: ATSScore, keywords: string[]) => void;
}

const ResumeEditor: React.FC<ResumeEditorProps> = ({
  resumeData,
  setResumeData,
  atsScore,
  setAtsScore,
  keywordMatches,
  setKeywordMatches,
  resumeType,
  setResumeType,
  selectedTemplate,
  setSelectedTemplate,
  resumeTemplates,
  uploadedFiles,
  setUploadedFiles,
  onBack,
  onGeneratePDF,
  onSave,
  updateATSScore,
  inputJD,
  tailorSummaryToJD,
  isTailoringSummary,
  setInputJD,
  onResumeDataChange,
  onATSScoreUpdate
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [showJDModal, setShowJDModal] = useState(false);
  const [jdText, setJdText] = useState('');
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Helper function to format date for template-01 (Oct. 2024 format) or MM/YYYY for other templates
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return '';
    
    // If template-01, use "Oct. 2024" format
    if (selectedTemplate === 'template-01') {
      // If already in template-01 format (contains month name), return as-is
      if (dateString.match(/^[A-Za-z]+\.\s*\d{4}$/)) {
        return dateString;
      }
      // If in MM/YYYY format, convert to template-01 format
      if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 2) {
          const month = parseInt(parts[0]);
          const year = parts[1];
          const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
          if (month >= 1 && month <= 12) {
            return `${monthNames[month - 1]} ${year}`;
          }
        }
      }
      // If in YYYY-MM format, convert to template-01 format
      const parts = dateString.split('-');
      if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 2) {
        const year = parts[0];
        const month = parseInt(parts[1]);
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        if (month >= 1 && month <= 12) {
          return `${monthNames[month - 1]} ${year}`;
        }
      }
      return dateString;
    } else {
      // For other templates, use MM/YYYY format
      // If it's already in MM/YYYY format (contains /), return as-is
      if (dateString.includes('/')) {
        return dateString;
      }
      // Convert YYYY-MM to MM/YYYY
      const parts = dateString.split('-');
      if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 2) {
        return `${parts[1]}/${parts[0]}`;
      }
      return dateString;
    }
  };

  // Helper function to parse date from display format to YYYY-MM for storage
  const parseDateForStorage = (dateString: string): string => {
    if (!dateString) return '';
    // If already in YYYY-MM format, return as-is
    if (dateString.match(/^\d{4}-\d{2}$/)) {
      return dateString;
    }
    
    if (selectedTemplate === 'template-01') {
      // If in template-01 format (Oct. 2024), convert to YYYY-MM
      const template1Match = dateString.match(/^([A-Za-z]+)\.\s*(\d{4})$/);
      if (template1Match) {
        const monthName = template1Match[1];
        const year = template1Match[2];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
        if (monthIndex !== -1) {
          const month = String(monthIndex + 1).padStart(2, '0');
          return `${year}-${month}`;
        }
      }
    }
    
    // If in MM/YYYY format, convert to YYYY-MM
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 2) {
        const month = parts[0].padStart(2, '0');
        const year = parts[1];
        return `${year}-${month}`;
      }
    }
    return dateString;
  };

  // Track ATS score changes
  useEffect(() => {
    console.log('=== ATS SCORE CHANGED IN RESUMEEDITOR ===');
    console.log('New ATS score:', atsScore);
    console.log('ATS score value:', atsScore?.score);
    console.log('Keyword matches:', keywordMatches);
    console.log('=== ATS SCORE CHANGE END ===');
  }, [atsScore, keywordMatches]);

  // Force ATS score update on component mount
  useEffect(() => {
    console.log('=== RESUMEDITOR MOUNTED ===');
    console.log('Initial ATS score:', atsScore);
    console.log('Initial keyword matches:', keywordMatches);
    console.log('=== RESUMEDITOR MOUNTED END ===');
  }, []);

  

  // Function to analyze missing keywords from JD
  const analyzeMissingKeywords = (jd: string, resume: ResumeData): string[] => {
    const jdKeywords = jd.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const resumeText = JSON.stringify(resume).toLowerCase();
    
    // Common professional keywords to look for
    const importantKeywords = [
      'javascript', 'react', 'node', 'python', 'java', 'aws', 'docker', 'kubernetes',
      'project management', 'leadership', 'communication', 'analytics', 'strategy',
      'agile', 'scrum', 'devops', 'machine learning', 'data analysis', 'sql',
      'frontend', 'backend', 'full stack', 'api', 'database', 'cloud', 'security',
      'testing', 'ci/cd', 'microservices', 'rest', 'graphql', 'typescript'
    ];
    
    const missing = jdKeywords
      .filter(keyword => keyword.length > 3)
      .filter(keyword => !resumeText.includes(keyword))
      .filter(keyword => importantKeywords.some(important => 
        important.includes(keyword) || keyword.includes(important)
      ))
      .slice(0, 10); // Limit to top 10 missing keywords
    
    return missing;
  };

  // Function to handle JD analysis and optimization
  const handleJDAnalysis = async () => {
    if (!jdText.trim()) return;
    
    setIsAnalyzing(true);
    
    // Simulate analysis delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const missing = analyzeMissingKeywords(jdText, resumeData);
    setMissingKeywords(missing);
    setIsAnalyzing(false);
  };

  // Function to apply missing keywords to resume
  const applyMissingKeywords = async () => {
    if (missingKeywords.length === 0) return;
    
    console.log('=== APPLYING MISSING KEYWORDS ===');
    console.log('Missing keywords:', missingKeywords);
    console.log('Current resume data before update:', resumeData);
    console.log('JD text for ATS calculation:', jdText);
    
    const updatedResumeData = {
      ...resumeData,
      skills: [...new Set([...(resumeData.skills || []), ...missingKeywords.slice(0, 5)])],
      personalInfo: {
        ...resumeData.personalInfo,
        summary: resumeData.personalInfo.summary + 
          ` Key expertise includes ${missingKeywords.slice(0, 3).join(', ')} and related technologies.`
      }
    };
    
    console.log('Updated resume data:', updatedResumeData);
    
    // Update resume data in both local and parent state
    console.log('Setting resume data in ResumeEditor...');
    setResumeData(updatedResumeData);
    
    if (onResumeDataChange) {
      console.log('Notifying parent of resume data change...');
      onResumeDataChange(updatedResumeData);
    }
    
    setResumeType('jd-specific');
    console.log('Resume type set to jd-specific');
    
    // Only calculate ATS score if JD is provided
    if (!jdText || !jdText.trim()) {
      console.log('Skipping ATS calculation - no JD text provided');
      setAtsScore(null);
      setKeywordMatches([]);
      return;
    }
    
    // Calculate ATS score directly using the local calculation
    console.log('Calculating ATS score directly with JD text:', jdText);
    const { calculateATSScore } = await import('@/lib/resume-utils');
    const newAtsScore = calculateATSScore(updatedResumeData, jdText);
    console.log('New ATS score calculated:', newAtsScore);
    console.log('ATS score value:', newAtsScore.score);
    
    // Update ATS score and keyword matches directly
    console.log('Setting ATS score in ResumeEditor to:', newAtsScore.score);
    setAtsScore(newAtsScore);
    setKeywordMatches(newAtsScore.matchedKeywords || []);
    console.log('ATS score set in ResumeEditor');
    
    // Also notify parent component of ATS score update
    if (onATSScoreUpdate) {
      console.log('Notifying parent component of ATS score update...');
      onATSScoreUpdate(newAtsScore, newAtsScore.matchedKeywords || []);
      console.log('Parent notified of ATS score update');
    }
    
    // Also call the parent's updateATSScore for consistency
    console.log('Calling parent updateATSScore for consistency...');
    await updateATSScore(updatedResumeData, jdText);
    console.log('Parent updateATSScore completed');
    
    console.log('=== APPLYING MISSING KEYWORDS COMPLETED ===');
    
    setShowJDModal(false);
    setJdText('');
    setMissingKeywords([]);
  };

  const addSkill = () => {
    const newSkill = prompt('Enter a new skill:');
    if (newSkill && newSkill.trim()) {
      setResumeData(prev => ({
        ...prev,
        skills: [...(prev.skills || []), newSkill.trim()]
      }));
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setResumeData(prev => ({
      ...prev,
      skills: (prev.skills || []).filter(skill => skill !== skillToRemove)
    }));
  };

  const addExperience = () => {
    const newId = Math.max(...resumeData.experience.map(exp => exp.id), 0) + 1;
    setResumeData(prev => ({
      ...prev,
      experience: [...prev.experience, {
        id: newId,
        title: '',
        company: '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        description: []
      }]
    }));
  };

  const removeExperience = (id: number) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.filter(exp => exp.id !== id)
    }));
  };

  const addEducation = () => {
    const newId = Math.max(...resumeData.education.map(edu => edu.id), 0) + 1;
    setResumeData(prev => ({
      ...prev,
      education: [...prev.education, {
        id: newId,
        degree: '',
        institution: '',
        location: '',
        year: '',
        gpa: ''
      }]
    }));
  };

  const removeEducation = (id: number) => {
    setResumeData(prev => ({
      ...prev,
      education: prev.education.filter(edu => edu.id !== id)
    }));
  };

  const addProject = () => {
    const newId = Math.max(...resumeData.projects.map(proj => proj.id), 0) + 1;
    setResumeData(prev => ({
      ...prev,
      projects: [...prev.projects, {
        id: newId,
        name: '',
        description: '',
        technologies: [],
        link: ''
      }]
    }));
  };

  const removeProject = (id: number) => {
    setResumeData(prev => ({
      ...prev,
      projects: prev.projects.filter(proj => proj.id !== id)
    }));
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <div className="bg-white shadow-sm px-6 py-2">
        <div className="flex items-center justify-end">
          {/* Tailor Summary to JD Button */}
          {inputJD?.trim() && resumeData.personalInfo.summary && tailorSummaryToJD && (
            <button
              onClick={tailorSummaryToJD}
              disabled={isTailoringSummary}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                isTailoringSummary
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-[0_0_10px_rgba(0,0,0,0.15)] hover:shadow-[0_0_15px_rgba(0,0,0,0.2)] transform hover:-translate-y-0.5'
              }`}
            >
              {isTailoringSummary ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Tailoring...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4" />
                  Tailor Summary
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-60px)]">
        {/* Left Side - Form Fields */}
        <div className="w-[600px] bg-white shadow-[0_4px_20px_rgba(20,184,166,0.15)]">
          <div className="p-6 space-y-5">
            {/* Back Button */}
            <div className="mb-2">
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 font-medium"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Builder
              </button>
            </div>

            {/* Template Selection */}
            <div className="bg-white rounded-xl p-5 shadow-[0_0_10px_rgba(0,0,0,0.08)] hover:shadow-[0_0_15px_rgba(0,0,0,0.12)] transition-shadow duration-200">
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-teal-600 rounded-full"></span>
                Resume Template
              </h3>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full p-3 pr-10 rounded-lg focus:ring-2 focus:ring-teal-500 text-base bg-white shadow-[0_0_8px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_0_12px_rgba(0,0,0,0.12)] font-medium text-gray-900"
              >
                {resumeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.icon} {template.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                {resumeTemplates.find(t => t.id === selectedTemplate)?.description}
              </p>
            </div>

            {/* ATS Score */}
            {inputJD?.trim() && (
              <div className="bg-white rounded-xl p-5 shadow-[0_0_10px_rgba(0,0,0,0.08)] hover:shadow-[0_0_15px_rgba(0,0,0,0.12)] transition-shadow duration-200">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-1 h-5 bg-green-600 rounded-full"></span>
                  ATS Score
                </h3>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg shadow-[0_0_6px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-green-700 font-bold text-sm">ATS</span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Score</div>
                        <div className="text-xl font-bold text-gray-900">{atsScore?.score || 'N/A'}%</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Keywords</div>
                      <div className="text-lg font-semibold text-gray-900">{keywordMatches.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resume Type Selection */}
            <div className="bg-white rounded-xl p-5 shadow-[0_0_10px_rgba(0,0,0,0.08)] hover:shadow-[0_0_15px_rgba(0,0,0,0.12)] transition-shadow duration-200">
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-purple-600 rounded-full"></span>
                Resume Type
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setResumeType('generic')}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    resumeType === 'generic'
                      ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-[0_0_10px_rgba(0,0,0,0.15)] transform scale-105'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-[0_0_6px_rgba(0,0,0,0.06)]'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Generic
                </button>
                <button
                  onClick={() => setShowJDModal(true)}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    resumeType === 'jd-specific'
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-[0_0_10px_rgba(0,0,0,0.15)] transform scale-105'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-[0_0_6px_rgba(0,0,0,0.06)]'
                  }`}
                >
                  <Target className="w-4 h-4" />
                  JD-Specific
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={onSave}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg hover:from-teal-700 hover:to-teal-800 transition-all duration-200 font-semibold shadow-[0_0_10px_rgba(0,0,0,0.15)] hover:shadow-[0_0_15px_rgba(0,0,0,0.2)] transform hover:-translate-y-0.5"
              >
                <Save className="w-5 h-5" />
                Save Resume
              </button>
              <button
                onClick={onGeneratePDF}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-200 font-semibold shadow-[0_0_10px_rgba(0,0,0,0.15)] hover:shadow-[0_0_15px_rgba(0,0,0,0.2)] transform hover:-translate-y-0.5"
              >
                <Download className="w-5 h-5" />
                Download PDF
              </button>
            </div>
          </div>
        </div>

        {/* Right Side - Resume Preview */}
        <div className="flex-1 p-4 bg-[#FAFAFA] flex justify-center">
          <div className="w-full max-w-[210mm]">
            <ResumePreview
              key={forceRender}
              resumeData={resumeData}
              selectedTemplate={selectedTemplate}
              atsScore={atsScore}
              keywordMatches={keywordMatches}
              resumeType={resumeType}
              extractedData={null}
              uploadedFiles={uploadedFiles}
              previewRef={previewRef}
              inputJD={jdText || inputJD}
              editable={true}
              onResumeDataChange={(newResumeData) => {
                setResumeData(newResumeData);
                if (onResumeDataChange) {
                  onResumeDataChange(newResumeData);
                }
              }}
              onSectionClick={(section: string, index?: number) => {
                setEditingSection(section);
                setEditingIndex(index ?? null);
              }}
              onProfileUpload={async (file: File) => {
                if (setUploadedFiles) {
                  setUploadedFiles(prev => ({ ...prev, profile: file }));
                }
                try {
                  const dataUrl = await fileToDataUrl(file);
                  const updatedData = {
                    ...resumeData,
                    personalInfo: {
                      ...resumeData.personalInfo,
                      profileImageDataUrl: dataUrl,
                    },
                  };
                  setResumeData(updatedData);
                  if (onResumeDataChange) {
                    onResumeDataChange(updatedData);
                  }
                } catch (error) {
                  console.error('Error processing profile image upload:', error);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* JD-Specific Modal */}
      {showJDModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <Target className="w-6 h-6 text-purple-600" />
                Job Description Analysis
              </h3>
              <button
                onClick={() => {
                  setShowJDModal(false);
                  setJdText('');
                  setMissingKeywords([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* JD Input */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-3">
                  Paste the job description you want to optimize your resume for:
                </label>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  className="w-full h-64 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                  placeholder="Paste the complete job description here..."
                />
              </div>

              {/* Analysis Button */}
              {jdText.trim() && (
                <div className="flex justify-center">
                  <button
                    onClick={handleJDAnalysis}
                    disabled={isAnalyzing}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-teal-600 text-white rounded-xl font-medium hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Analyzing Job Description...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5" />
                        Analyze & Find Missing Keywords
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Missing Keywords Results */}
              {missingKeywords.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-teal-50 border border-purple-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 text-purple-600" />
                    <h4 className="text-lg font-semibold text-purple-800">
                      Missing Keywords Found
                    </h4>
                  </div>
                  
                  <p className="text-gray-700 mb-4">
                    We found {missingKeywords.length} important keywords from the job description that are missing from your resume. 
                    Would you like to add them to optimize your resume for this position?
                  </p>

                  <div className="mb-6">
                    <h5 className="font-medium text-gray-800 mb-3">Missing Keywords:</h5>
                    <div className="flex flex-wrap gap-2">
                      {missingKeywords.map((keyword, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4 justify-end">
                    <button
                      onClick={() => {
                        setShowJDModal(false);
                        setJdText('');
                        setMissingKeywords([]);
                      }}
                      className="px-6 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={applyMissingKeywords}
                      className="px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-95 transition-opacity flex items-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Add Keywords & Optimize Resume
                    </button>
                  </div>
                </div>
              )}

              {/* No Missing Keywords */}
              {jdText.trim() && missingKeywords.length === 0 && !isAnalyzing && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h4 className="text-lg font-semibold text-green-800">
                      Great Match!
                    </h4>
                  </div>
                  <p className="text-green-700">
                    Your resume already contains most of the important keywords from this job description. 
                    Your resume is well-optimized for this position!
                  </p>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        if (setInputJD) {
                          setInputJD(jdText);
                        }
                        setResumeType('jd-specific');
                        setShowJDModal(false);
                        setJdText('');
                        setMissingKeywords([]);
                      }}
                      className="px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-95 transition-opacity"
                    >
                      Set as JD-Specific Resume
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section Edit Modal */}
      {editingSection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setEditingSection(null)}>
          <div className="bg-white rounded-lg w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto shadow-[0_0_25px_rgba(20,184,166,0.6)]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-6 py-4 flex items-center gap-4 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setEditingSection(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
              >
                ×
              </button>
              <h3 className="text-2xl font-bold text-gray-900">
                Edit {editingSection === 'personalInfo' ? 'Personal Information' :
                      editingSection === 'summary' ? 'Professional Summary' : 
                      editingSection === 'skills' ? 'Core Competencies' :
                      editingSection === 'experience' ? 'Professional Experience' :
                      editingSection === 'education' ? 'Education & Credentials' :
                      editingSection === 'projects' ? 'Projects' :
                      editingSection === 'achievements' ? 'Key Achievements' :
                      editingSection}
              </h3>
            </div>
            <div className="p-6">
              {editingSection === 'personalInfo' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={resumeData.personalInfo.fullName || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              fullName: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Your Full Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input
                        type="text"
                        value={resumeData.personalInfo.title || resumeData.personalInfo.summary?.split('.')[0] || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              title: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Your Professional Title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={resumeData.personalInfo.email || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              email: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="your.email@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={resumeData.personalInfo.phone || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              phone: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={resumeData.personalInfo.location || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              location: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="City, State"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
                      <input
                        type="text"
                        value={resumeData.personalInfo.linkedin || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              linkedin: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="linkedin.com/in/yourprofile"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website (Optional)</label>
                      <input
                        type="text"
                        value={resumeData.personalInfo.website || ''}
                        onChange={(e) => {
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              website: e.target.value
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="yourwebsite.com"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'summary' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                    <input
                      type="text"
                      value={resumeData.sectionTitles?.summary || ''}
                      onChange={(e) => {
                        const newData = {
                          ...resumeData,
                          sectionTitles: {
                            ...resumeData.sectionTitles,
                            summary: e.target.value || undefined
                          }
                        };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-4"
                      placeholder="Professional Summary"
                    />
                  </div>
                  <label className="block text-sm font-medium text-gray-700">
                    Content
                    <span className="text-xs text-gray-500 ml-2">(Tip: Wrap text with **asterisks** to make it bold)</span>
                  </label>
                  <textarea
                    value={resumeData.personalInfo.summary || ''}
                    onChange={(e) => {
                      const newData = {
                        ...resumeData,
                        personalInfo: {
                          ...resumeData.personalInfo,
                          summary: e.target.value
                        }
                      };
                      setResumeData(newData);
                      if (onResumeDataChange) onResumeDataChange(newData);
                    }}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[200px]"
                    placeholder="Enter your professional summary... (use **text** for bold)"
                    id="summary-textarea"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const textarea = document.getElementById('summary-textarea') as HTMLTextAreaElement;
                        if (!textarea) return;
                        
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const text = resumeData.personalInfo.summary || '';
                        const selectedText = text.substring(start, end);
                        
                        if (selectedText) {
                          const newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              summary: newText
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                          
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(start, end + 4);
                          }, 0);
                        } else {
                          const newText = text.substring(0, start) + '****' + text.substring(end);
                          const newData = {
                            ...resumeData,
                            personalInfo: {
                              ...resumeData.personalInfo,
                              summary: newText
                            }
                          };
                          setResumeData(newData);
                          if (onResumeDataChange) onResumeDataChange(newData);
                          
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(start + 2, start + 2);
                          }, 0);
                        }
                      }}
                      className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1 text-gray-700"
                      title="Make selected text bold"
                    >
                      <strong>B</strong> Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newText = (resumeData.personalInfo.summary || '').replace(/\*\*/g, '');
                        const newData = {
                          ...resumeData,
                          personalInfo: {
                            ...resumeData.personalInfo,
                            summary: newText
                          }
                        };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                      title="Remove all bold formatting"
                    >
                      Clear Bold
                    </button>
                  </div>
                </div>
              )}

              {editingSection === 'skills' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                    <input
                      type="text"
                      value={resumeData.sectionTitles?.skills || ''}
                      onChange={(e) => {
                        const newData = {
                          ...resumeData,
                          sectionTitles: {
                            ...resumeData.sectionTitles,
                            skills: e.target.value || undefined
                          }
                        };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-4"
                      placeholder={selectedTemplate === 'template-01' ? 'SKILLS' : 'Core Competencies'}
                    />
                  </div>
                  <label className="block text-sm font-medium text-gray-700">Skills</label>
                  <div className="space-y-2">
                    {resumeData.skills.map((skill, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={skill}
                          onChange={(e) => {
                            const newSkills = [...resumeData.skills];
                            newSkills[idx] = e.target.value;
                            const newData = { ...resumeData, skills: newSkills };
                            setResumeData(newData);
                            if (onResumeDataChange) onResumeDataChange(newData);
                          }}
                          className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <button
                          onClick={() => {
                            const newSkills = resumeData.skills.filter((_, i) => i !== idx);
                            const newData = { ...resumeData, skills: newSkills };
                            setResumeData(newData);
                            if (onResumeDataChange) onResumeDataChange(newData);
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
                        const newSkills = [...resumeData.skills, ''];
                        const newData = { ...resumeData, skills: newSkills };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600"
                    >
                      + Add Skill
                    </button>
                  </div>
                </div>
              )}

              {editingSection === 'experience' && (
                <div className="space-y-6">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                    <input
                      type="text"
                      value={resumeData.sectionTitles?.experience || ''}
                      onChange={(e) => {
                        const newData = {
                          ...resumeData,
                          sectionTitles: {
                            ...resumeData.sectionTitles,
                            experience: e.target.value || undefined
                          }
                        };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Professional Experience"
                    />
                  </div>
                  {resumeData.experience.map((exp, idx) => (
                    <div key={exp.id || idx} className="rounded-lg p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-gray-900">Experience {idx + 1}</h4>
                        <button
                          onClick={() => {
                            const newExp = resumeData.experience.filter((_, i) => i !== idx);
                            const newData = { ...resumeData, experience: newExp };
                            setResumeData(newData);
                            if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, title: e.target.value };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, company: e.target.value };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, location: e.target.value };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input
                            type="text"
                            value={formatDateForDisplay(exp.startDate || '')}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Store the display value temporarily while typing
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, startDate: value };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            onBlur={(e) => {
                              // On blur, convert to YYYY-MM format for storage
                              const value = e.target.value;
                              const formattedValue = parseDateForStorage(value);
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, startDate: formattedValue };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder={selectedTemplate === 'template-01' ? 'Oct. 2024' : 'MM/YYYY'}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <input
                            type="text"
                            value={formatDateForDisplay(exp.endDate || '')}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Store the display value temporarily while typing
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, endDate: value, current: !value };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            onBlur={(e) => {
                              // On blur, convert to YYYY-MM format for storage
                              const value = e.target.value;
                              const formattedValue = parseDateForStorage(value);
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, endDate: formattedValue, current: !formattedValue };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder={selectedTemplate === 'template-01' ? 'Oct. 2024 or leave empty for current' : 'MM/YYYY or leave empty for current'}
                          />
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={exp.current || false}
                            onChange={(e) => {
                              const newExp = [...resumeData.experience];
                              newExp[idx] = { ...exp, current: e.target.checked, endDate: e.target.checked ? '' : exp.endDate };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="mr-2"
                          />
                          <label className="text-sm font-medium text-gray-700">Current Position</label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description 
                          <span className="text-xs text-gray-500 ml-2">(Tip: Wrap text with **asterisks** to make it bold)</span>
                        </label>
                        <div className="space-y-2">
                          {exp.description.map((desc, descIdx) => (
                            <div key={descIdx} className="space-y-1">
                              <div className="flex items-start gap-2">
                                <textarea
                                  value={desc}
                                  onChange={(e) => {
                                    const newExp = [...resumeData.experience];
                                    const newDesc = [...exp.description];
                                    newDesc[descIdx] = e.target.value;
                                    newExp[idx] = { ...exp, description: newDesc };
                                    const newData = { ...resumeData, experience: newExp };
                                    setResumeData(newData);
                                    if (onResumeDataChange) onResumeDataChange(newData);
                                  }}
                                  rows={2}
                                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                                  placeholder="Enter bullet point... (use **text** for bold)"
                                  id={`desc-${idx}-${descIdx}`}
                                />
                                <button
                                  onClick={() => {
                                    const newExp = [...resumeData.experience];
                                    const newDesc = exp.description.filter((_, i) => i !== descIdx);
                                    newExp[idx] = { ...exp, description: newDesc };
                                    const newData = { ...resumeData, experience: newExp };
                                    setResumeData(newData);
                                    if (onResumeDataChange) onResumeDataChange(newData);
                                  }}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                  title="Delete bullet point"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                              <div className="flex gap-2 ml-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const textarea = document.getElementById(`desc-${idx}-${descIdx}`) as HTMLTextAreaElement;
                                    if (!textarea) return;
                                    
                                    const start = textarea.selectionStart;
                                    const end = textarea.selectionEnd;
                                    const selectedText = desc.substring(start, end);
                                    
                                    if (selectedText) {
                                      // If text is selected, wrap it with **
                                      const newText = desc.substring(0, start) + `**${selectedText}**` + desc.substring(end);
                                      const newExp = [...resumeData.experience];
                                      const newDesc = [...exp.description];
                                      newDesc[descIdx] = newText;
                                      newExp[idx] = { ...exp, description: newDesc };
                                      const newData = { ...resumeData, experience: newExp };
                                      setResumeData(newData);
                                      if (onResumeDataChange) onResumeDataChange(newData);
                                      
                                      // Restore selection after update
                                      setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start, end + 4); // +4 for the **...**
                                      }, 0);
                                    } else {
                                      // No selection, insert ** at cursor
                                      const newText = desc.substring(0, start) + '****' + desc.substring(end);
                                      const newExp = [...resumeData.experience];
                                      const newDesc = [...exp.description];
                                      newDesc[descIdx] = newText;
                                      newExp[idx] = { ...exp, description: newDesc };
                                      const newData = { ...resumeData, experience: newExp };
                                      setResumeData(newData);
                                      if (onResumeDataChange) onResumeDataChange(newData);
                                      
                                      // Place cursor between the **
                                      setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start + 2, start + 2);
                                      }, 0);
                                    }
                                  }}
                                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1 text-gray-700"
                                  title="Make selected text bold"
                                >
                                  <strong>B</strong> Bold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Remove all ** markers from the text
                                    const newText = desc.replace(/\*\*/g, '');
                                    const newExp = [...resumeData.experience];
                                    const newDesc = [...exp.description];
                                    newDesc[descIdx] = newText;
                                    newExp[idx] = { ...exp, description: newDesc };
                                    const newData = { ...resumeData, experience: newExp };
                                    setResumeData(newData);
                                    if (onResumeDataChange) onResumeDataChange(newData);
                                  }}
                                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                                  title="Remove all bold formatting"
                                >
                                  Clear Bold
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const newExp = [...resumeData.experience];
                              const newDesc = [...exp.description, ''];
                              newExp[idx] = { ...exp, description: newDesc };
                              const newData = { ...resumeData, experience: newExp };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600"
                          >
                            + Add Bullet Point
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newExp = [...resumeData.experience, {
                        id: Date.now(),
                        title: '',
                        company: '',
                        location: '',
                        startDate: '',
                        endDate: '',
                        current: false,
                        description: ['']
                      }];
                      const newData = { ...resumeData, experience: newExp };
                      setResumeData(newData);
                      if (onResumeDataChange) onResumeDataChange(newData);
                    }}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600 font-medium"
                  >
                    + Add Experience
                  </button>
                </div>
              )}

              {editingSection === 'education' && (
                <div className="space-y-6">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section Title</label>
                    <input
                      type="text"
                      value={resumeData.sectionTitles?.education || ''}
                      onChange={(e) => {
                        const newData = {
                          ...resumeData,
                          sectionTitles: {
                            ...resumeData.sectionTitles,
                            education: e.target.value || undefined
                          }
                        };
                        setResumeData(newData);
                        if (onResumeDataChange) onResumeDataChange(newData);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Education & Credentials"
                    />
                  </div>
                  {resumeData.education.map((edu, idx) => (
                    <div key={edu.id || idx} className="rounded-lg p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-gray-900">Education {idx + 1}</h4>
                        <button
                          onClick={() => {
                            const newEdu = resumeData.education.filter((_, i) => i !== idx);
                            const newData = { ...resumeData, education: newEdu };
                            setResumeData(newData);
                            if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newEdu = [...resumeData.education];
                              newEdu[idx] = { ...edu, degree: e.target.value };
                              const newData = { ...resumeData, education: newEdu };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newEdu = [...resumeData.education];
                              newEdu[idx] = { ...edu, institution: e.target.value };
                              const newData = { ...resumeData, education: newEdu };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
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
                              const newEdu = [...resumeData.education];
                              newEdu[idx] = { ...edu, location: e.target.value };
                              const newData = { ...resumeData, education: newEdu };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                          <input
                            type="text"
                            value={edu.year ? (() => {
                              // Handle date range (e.g., "2011-06 - 2015-06")
                              if (edu.year.includes(' - ')) {
                                const [startDate, endDate] = edu.year.split(' - ');
                                const startParts = startDate.trim().split('-');
                                const endParts = endDate.trim().split('-');
                                if (startParts.length === 2 && endParts.length === 2) {
                                  return `${startParts[1]}/${startParts[0]} - ${endParts[1]}/${endParts[0]}`;
                                }
                                return edu.year;
                              }
                              // Convert YYYY-MM to MM/YYYY
                              if (edu.year.includes('-') && !edu.year.includes(' - ')) {
                                const parts = edu.year.split('-');
                                if (parts.length === 2) {
                                  return `${parts[1]}/${parts[0]}`;
                                }
                              } else if (edu.year.match(/^\d{4}$/)) {
                                // If it's just a year (YYYY), convert to 01/YYYY
                                return `01/${edu.year}`;
                              }
                              return edu.year;
                            })() : ''}
                            onChange={(e) => {
                              // Convert MM/YYYY - MM/YYYY to YYYY-MM - YYYY-MM
                              const value = e.target.value;
                              let formattedValue = value;
                              
                              // Handle date range (e.g., "06/2011 - 06/2015")
                              if (value.includes(' - ')) {
                                const [startDate, endDate] = value.split(' - ');
                                const startMatch = startDate.trim().match(/^(\d{1,2})\/(\d{4})$/);
                                const endMatch = endDate.trim().match(/^(\d{1,2})\/(\d{4})$/);
                                if (startMatch && endMatch) {
                                  const startMonth = startMatch[1].padStart(2, '0');
                                  const startYear = startMatch[2];
                                  const endMonth = endMatch[1].padStart(2, '0');
                                  const endYear = endMatch[2];
                                  formattedValue = `${startYear}/${startMonth} - ${endYear}/${endMonth}`;
                                } else {
                                  // If format is not complete, store the raw input temporarily
                                  formattedValue = value;
                                }
                              } else {
                                // Handle single date MM/YYYY
                                const mmYyyyMatch = value.match(/^(\d{1,2})\/(\d{4})$/);
                                if (mmYyyyMatch) {
                                  const month = mmYyyyMatch[1].padStart(2, '0');
                                  const year = mmYyyyMatch[2];
                                  formattedValue = `${year}/${month}`;
                                } else if (value.match(/^\d{4}$/)) {
                                  // If it's just a year, store as YYYY-01
                                  formattedValue = `${value}-01`;
                                } else if (value === '') {
                                  formattedValue = '';
                                } else {
                                  // If format is not complete, store the raw input temporarily
                                  formattedValue = value;
                                }
                              }
                              
                              const newEdu = [...resumeData.education];
                              newEdu[idx] = { ...edu, year: formattedValue };
                              const newData = { ...resumeData, education: newEdu };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            onBlur={(e) => {
                              // On blur, ensure we convert any valid format
                              const value = e.target.value;
                              
                              // Handle date range
                              if (value.includes(' - ')) {
                                const [startDate, endDate] = value.split(' - ');
                                const startMatch = startDate.trim().match(/^(\d{1,2})\/(\d{4})$/);
                                const endMatch = endDate.trim().match(/^(\d{1,2})\/(\d{4})$/);
                                if (startMatch && endMatch) {
                                  const startMonth = startMatch[1].padStart(2, '0');
                                  const startYear = startMatch[2];
                                  const endMonth = endMatch[1].padStart(2, '0');
                                  const endYear = endMatch[2];
                                  const formattedValue = `${startYear}-${startMonth} - ${endYear}-${endMonth}`;
                                  const newEdu = [...resumeData.education];
                                  newEdu[idx] = { ...edu, year: formattedValue };
                                  const newData = { ...resumeData, education: newEdu };
                                  setResumeData(newData);
                                  if (onResumeDataChange) onResumeDataChange(newData);
                                }
                              } else {
                                // Handle single date
                                const mmYyyyMatch = value.match(/^(\d{1,2})\/(\d{4})$/);
                                if (mmYyyyMatch) {
                                  const month = mmYyyyMatch[1].padStart(2, '0');
                                  const year = mmYyyyMatch[2];
                                  const formattedValue = `${year}-${month}`;
                                  const newEdu = [...resumeData.education];
                                  newEdu[idx] = { ...edu, year: formattedValue };
                                  const newData = { ...resumeData, education: newEdu };
                                  setResumeData(newData);
                                  if (onResumeDataChange) onResumeDataChange(newData);
                                } else if (value.match(/^\d{4}$/)) {
                                  // If it's just a year, store as YYYY-01
                                  const newEdu = [...resumeData.education];
                                  newEdu[idx] = { ...edu, year: value };
                                  const newData = { ...resumeData, education: newEdu };
                                  setResumeData(newData);
                                  if (onResumeDataChange) onResumeDataChange(newData);
                                }
                              }
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="MM/YYYY - MM/YYYY or MM/YYYY or YYYY"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">GPA (Optional)</label>
                          <input
                            type="text"
                            value={edu.gpa || ''}
                            onChange={(e) => {
                              const newEdu = [...resumeData.education];
                              newEdu[idx] = { ...edu, gpa: e.target.value };
                              const newData = { ...resumeData, education: newEdu };
                              setResumeData(newData);
                              if (onResumeDataChange) onResumeDataChange(newData);
                            }}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newEdu = [...resumeData.education, {
                        id: Date.now(),
                        degree: '',
                        institution: '',
                        location: '',
                        year: '',
                        gpa: ''
                      }];
                      const newData = { ...resumeData, education: newEdu };
                      setResumeData(newData);
                      if (onResumeDataChange) onResumeDataChange(newData);
                    }}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600 font-medium"
                  >
                    + Add Education
                  </button>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-4">
                <button
                  onClick={() => setEditingSection(null)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeEditor;
