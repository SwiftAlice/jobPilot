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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Builder
            </button>
            <div className="text-sm text-gray-600">
              ATS Score: {atsScore?.score || 'N/A'}% | Keywords: {keywordMatches.length}
            </div>
            
            {/* Tailor Summary to JD Button */}
            {inputJD?.trim() && resumeData.personalInfo.summary && tailorSummaryToJD && (
              <button
                onClick={tailorSummaryToJD}
                disabled={isTailoringSummary}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  isTailoringSummary
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
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
          
          {/* Resume Type Options */}
          <div className="flex items-center gap-4">
            {/* Resume Type Selection */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Type:</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setResumeType('generic')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    resumeType === 'generic'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Zap className="w-4 h-4 inline mr-1" />
                  Generic
                </button>
                <button
                  onClick={() => setShowJDModal(true)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    resumeType === 'jd-specific'
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Target className="w-4 h-4 inline mr-1" />
                  JD-Specific
                </button>
              </div>
            </div>
          </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={onSave}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Save Resume
                    </button>
                    <button
                      onClick={onGeneratePDF}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                  </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Side - Form Fields */}
        <div className="w-[500px] bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Template Selection */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume Template</h3>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              >
                {resumeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.icon} {template.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-2">
                {resumeTemplates.find(t => t.id === selectedTemplate)?.description}
              </p>
            </div>

            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={resumeData.personalInfo.fullName}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, fullName: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={resumeData.personalInfo.email}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, email: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={resumeData.personalInfo.phone}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, phone: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={resumeData.personalInfo.location}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, location: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
                  <input
                    type="text"
                    value={resumeData.personalInfo.linkedin}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, linkedin: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={resumeData.personalInfo.website}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, website: e.target.value }
                    }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Professional Summary</label>
                  <textarea
                    value={resumeData.personalInfo.summary}
                    onChange={(e) => setResumeData(prev => ({
                      ...prev,
                      personalInfo: { ...prev.personalInfo, summary: e.target.value }
                    }))}
                    rows={4}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Skills */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
                <button
                  onClick={addSkill}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {resumeData.skills?.map((skill, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex-1 bg-gray-100 px-3 py-2 rounded-lg text-sm">{skill}</span>
                    <button
                      onClick={() => removeSkill(skill)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Experience</h3>
                <button
                  onClick={addExperience}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="space-y-4">
                {resumeData.experience.map((exp) => (
                  <div key={exp.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Experience {exp.id}</h4>
                      <button
                        onClick={() => removeExperience(exp.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                        <input
                          type="text"
                          value={exp.title}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            experience: prev.experience.map(ex => 
                              ex.id === exp.id ? { ...ex, title: e.target.value } : ex
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            experience: prev.experience.map(ex => 
                              ex.id === exp.id ? { ...ex, company: e.target.value } : ex
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input
                            type="month"
                            value={exp.startDate}
                            onChange={(e) => setResumeData(prev => ({
                              ...prev,
                              experience: prev.experience.map(ex => 
                                ex.id === exp.id ? { ...ex, startDate: e.target.value } : ex
                              )
                            }))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <input
                            type="month"
                            value={exp.endDate}
                            onChange={(e) => setResumeData(prev => ({
                              ...prev,
                              experience: prev.experience.map(ex => 
                                ex.id === exp.id ? { ...ex, endDate: e.target.value } : ex
                              )
                            }))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={Array.isArray(exp.description) ? exp.description.join('\n') : ''}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            experience: prev.experience.map(ex => 
                              ex.id === exp.id ? { 
                                ...ex, 
                                description: e.target.value.split('\n').filter(line => line.trim()) 
                              } : ex
                            )
                          }))}
                          rows={3}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Education */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Education</h3>
                <button
                  onClick={addEducation}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="space-y-4">
                {resumeData.education.map((edu) => (
                  <div key={edu.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Education {edu.id}</h4>
                      <button
                        onClick={() => removeEducation(edu.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Degree</label>
                        <input
                          type="text"
                          value={edu.degree}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            education: prev.education.map(ed => 
                              ed.id === edu.id ? { ...ed, degree: e.target.value } : ed
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                        <input
                          type="text"
                          value={edu.institution}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            education: prev.education.map(ed => 
                              ed.id === edu.id ? { ...ed, institution: e.target.value } : ed
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                          <input
                            type="text"
                            value={edu.year}
                            onChange={(e) => setResumeData(prev => ({
                              ...prev,
                              education: prev.education.map(ed => 
                                ed.id === edu.id ? { ...ed, year: e.target.value } : ed
                              )
                            }))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">GPA</label>
                          <input
                            type="text"
                            value={edu.gpa || ''}
                            onChange={(e) => setResumeData(prev => ({
                              ...prev,
                              education: prev.education.map(ed => 
                                ed.id === edu.id ? { ...ed, gpa: e.target.value } : ed
                              )
                            }))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Projects</h3>
                <button
                  onClick={addProject}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="space-y-4">
                {resumeData.projects.map((proj) => (
                  <div key={proj.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Project {proj.id}</h4>
                      <button
                        onClick={() => removeProject(proj.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                        <input
                          type="text"
                          value={proj.name}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            projects: prev.projects.map(p => 
                              p.id === proj.id ? { ...p, name: e.target.value } : p
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={proj.description}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            projects: prev.projects.map(p => 
                              p.id === proj.id ? { ...p, description: e.target.value } : p
                            )
                          }))}
                          rows={3}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                        <input
                          type="text"
                          value={proj.link}
                          onChange={(e) => setResumeData(prev => ({
                            ...prev,
                            projects: prev.projects.map(p => 
                              p.id === proj.id ? { ...p, link: e.target.value } : p
                            )
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Resume Preview */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto">
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
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
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
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
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
    </div>
  );
};

export default ResumeEditor;
