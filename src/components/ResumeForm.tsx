import React, { useEffect, useState } from 'react';
import { 
  User, 
  FileUp, 
  Check, 
  Wand2,
  Loader2,
  X,
  Target,
  Clock,
  Trash2
} from 'lucide-react';
import { ResumeData, UploadedFiles } from '@/types/resume-builder-types';
import { supabase } from '@/lib/supabaseClient';

interface ParsedResume {
  id: string;
  fileName: string;
  parsedAt: string;
  resumeData: ResumeData;
}

interface ResumeFormProps {
  localResumeData: ResumeData;
  setLocalResumeData: React.Dispatch<React.SetStateAction<ResumeData>>;
  inputProfile: string;
  setInputProfile: (value: string) => void;
  skills: string;
  setSkills: (value: string) => void;
  newSkill: string;
  setNewSkill: (value: string) => void;
  addSkill: () => void;
  removeSkill: (skill: string) => void;
  inputJD: string;
  setInputJD: (value: string) => void;
  resumeType: string;
  setResumeType: (type: string) => void;
  selectedTemplate: string;
  setSelectedTemplate: (template: string) => void;
  resumeTemplates: any[];
  currentStep: number;
  setCurrentStep: (step: number) => void;
  useResumeUpload: boolean;
  setUseResumeUpload: (value: boolean) => void;
  useManualInput: boolean;
  setUseManualInput: (value: boolean) => void;
  uploadedFiles: UploadedFiles;
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFiles>>;
  extractedData: ResumeData | null;
  setExtractedData: (data: ResumeData | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (file: File | null, type: 'resume' | 'profile') => Promise<void>;
  isGenerating: boolean;
  isUploading: boolean;
  parsingProgress: number;
  parsingMessage: string;
  generateContent: (type: 'resume' | 'jd') => Promise<void>;
  debouncedUpdateATSScore: (data: ResumeData) => void;
  updateATSScore: (data: ResumeData) => void;
  tailorSummaryToJD?: () => Promise<void>;
  isTailoringSummary?: boolean;
  inputJDForTailoring?: string;
  authenticated: boolean;
  user?: any;
  onSaveParsedResume?: (fileName: string, resumeData: ResumeData) => void;
  selectedModel: 'FASTEST' | 'FAST' | 'BALANCED' | 'QUALITY';
  setSelectedModel: (model: 'FASTEST' | 'FAST' | 'BALANCED' | 'QUALITY') => void;
}

const ResumeForm: React.FC<ResumeFormProps> = ({
  localResumeData,
  setLocalResumeData,
  inputProfile,
  setInputProfile,
  skills,
  setSkills,
  newSkill,
  setNewSkill,
  addSkill,
  removeSkill,
  inputJD,
  setInputJD,
  resumeType,
  setResumeType,
  selectedTemplate,
  setSelectedTemplate,
  resumeTemplates,
  currentStep,
  setCurrentStep,
  useResumeUpload,
  setUseResumeUpload,
  useManualInput,
  setUseManualInput,
  uploadedFiles,
  setUploadedFiles,
  extractedData,
  setExtractedData,
  fileInputRef,
  handleFileUpload,
  isGenerating,
  isUploading,
  parsingProgress,
  parsingMessage,
  generateContent,
  debouncedUpdateATSScore,
  updateATSScore,
  tailorSummaryToJD,
  isTailoringSummary,
  inputJDForTailoring,
  authenticated,
  user,
  onSaveParsedResume,
  selectedModel,
  setSelectedModel
}) => {
  const [showJDModal, setShowJDModal] = useState(false);
  const [tempJD, setTempJD] = useState('');
  const [previouslyParsedResumes, setPreviouslyParsedResumes] = useState<ParsedResume[]>([]);

  // Load previously parsed resumes from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('previouslyParsedResumes');
        if (stored) {
          const parsed = JSON.parse(stored);
          setPreviouslyParsedResumes(parsed);
        }
      } catch (e) {
        console.error('Error loading previously parsed resumes:', e);
      }
    }
  }, []);

  // Save parsed resume to localStorage
  const saveParsedResume = (fileName: string, resumeData: ResumeData) => {
    if (typeof window === 'undefined') return;
    
    try {
      const newParsedResume: ParsedResume = {
        id: Date.now().toString(),
        fileName,
        parsedAt: new Date().toISOString(),
        resumeData: { ...resumeData }
      };
      
      const existing = localStorage.getItem('previouslyParsedResumes');
      let parsedResumes: ParsedResume[] = [];
      
      if (existing) {
        parsedResumes = JSON.parse(existing);
      }
      
      // Remove duplicate by fileName (keep the latest)
      parsedResumes = parsedResumes.filter(p => p.fileName !== fileName);
      
      // Add new one at the beginning
      parsedResumes.unshift(newParsedResume);
      
      // Keep only last 10
      if (parsedResumes.length > 10) {
        parsedResumes = parsedResumes.slice(0, 10);
      }
      
      localStorage.setItem('previouslyParsedResumes', JSON.stringify(parsedResumes));
      setPreviouslyParsedResumes(parsedResumes);
      
      // Also call the parent callback if provided
      if (onSaveParsedResume) {
        onSaveParsedResume(fileName, resumeData);
      }
    } catch (e) {
      console.error('Error saving parsed resume:', e);
    }
  };

  // Load a previously parsed resume
  const loadParsedResume = (parsedResume: ParsedResume) => {
    setLocalResumeData(parsedResume.resumeData);
    setExtractedData(parsedResume.resumeData);
    setUseResumeUpload(true);
    setUseManualInput(false);
    // Create a proper File object for display purposes
    const emptyBlob = new Blob([], { type: 'application/pdf' });
    const fakeFile = new File([emptyBlob], parsedResume.fileName, {
      type: 'application/pdf',
      lastModified: new Date(parsedResume.parsedAt).getTime()
    });
    setUploadedFiles(prev => ({
      ...prev,
      resume: fakeFile
    }));
  };

  // Delete a previously parsed resume
  const deleteParsedResume = (id: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const updated = previouslyParsedResumes.filter(p => p.id !== id);
      localStorage.setItem('previouslyParsedResumes', JSON.stringify(updated));
      setPreviouslyParsedResumes(updated);
    } catch (e) {
      console.error('Error deleting parsed resume:', e);
    }
  };

  const handleJDSubmit = () => {
    setInputJD(tempJD);
    setResumeType('jd-specific');
    setShowJDModal(false);
  };

  // Determine if generate button should be enabled
  const canGenerate = () => {
    if (!authenticated) return false;
    if (useManualInput) {
      return localResumeData.personalInfo.fullName.trim() !== '' || 
             localResumeData.personalInfo.summary.trim() !== '' ||
             (Array.isArray(localResumeData.skills) && localResumeData.skills.length > 0);
    } else if (useResumeUpload) {
      return uploadedFiles.resume !== null && extractedData !== null;
    }
    return false;
  };

  if (!authenticated) {
    return (
      <div className="relative">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-lg mb-4">
            <svg viewBox="0 0 24 24" className="w-7 h-7" aria-hidden>
              <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Z" opacity=".08"/>
              <path fill="currentColor" d="M8 12a4 4 0 1 1 4 4 4 4 0 0 1-4-4Z"/>
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 mb-2">Sign in to continue</h1>
          <p className="text-slate-600 max-w-xl mx-auto mb-8">Create an account to upload your resume, auto-save progress, and sync across devices.</p>

          <button
            onClick={() => (window.location.href = '/api/auth/login')}
            className="mx-auto inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303A12.002 12.002 0 0 1 12 24c0-6.627 5.373-12 12-12 3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.046 6.053 28.723 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.818A11.996 11.996 0 0 1 24 12c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.046 6.053 28.723 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c4.646 0 8.903-1.782 12.102-4.688l-5.59-4.727A11.94 11.94 0 0 1 24 36c-5.289 0-9.747-3.404-11.367-8.158l-6.49 5.005C9.418 39.556 16.117 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.027 12.027 0 0 1-4.092 5.785l.003-.002 5.59 4.727C35.971 39.205 44 34 44 24c0-1.341-.138-2.651-.389-3.917z"/></svg>
            <span className="font-semibold">Continue with Google</span>
          </button>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-700"><span className="font-semibold">Auto‑save</span> your resume and settings</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-700"><span className="font-semibold">One‑click</span> apply workflow</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-700"><span className="font-semibold">Secure</span> and private by design</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      {/* Input Method Selection */}
      <div className="mb-12">
        <label className="block text-lg font-medium text-gray-700 mb-6 text-center">
          Choose Input Method
        </label>
        <div className="grid grid-cols-2 gap-8 max-w-4xl mx-auto">
          <button
            onClick={() => {
              setUseManualInput(false);
              setUseResumeUpload(true);
              setResumeType('generic');
            }}
            className={`p-8 rounded-2xl border-2 transition-all ${
              useResumeUpload
                ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-lg'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
            }`}
          >
            <FileUp className="w-12 h-12 mx-auto mb-4" />
            <div className="font-bold text-xl mb-3">Resume Upload</div>
            <div className="text-gray-600">AI extracts information from your existing resume file</div>
          </button>
          <button
            onClick={() => {
              setUseManualInput(true);
              setUseResumeUpload(false);
              setResumeType('generic');
            }}
            className={`p-8 rounded-2xl border-2 transition-all ${
              useManualInput
                ? 'border-green-500 bg-green-50 text-green-700 shadow-lg'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
            }`}
          >
            <User className="w-12 h-12 mx-auto mb-4" />
            <div className="font-bold text-xl mb-3">Manual Input</div>
            <div className="text-gray-600">Fill in your details manually step by step</div>
          </button>
        </div>
      </div>

      {/* File Upload Section (conditional) */}
      {useResumeUpload && (
        <div className="mb-12">
          <div className="max-w-3xl mx-auto">
            {/* Model Selection */}
            <div className="mb-6 bg-white rounded-xl shadow-sm p-5 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Parsing Model Quality
              </label>
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => setSelectedModel('FASTEST')}
                  className={`px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                    selectedModel === 'FASTEST'
                      ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>⚡ Fastest</span>
                    <span className="text-xs opacity-80">~10s</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedModel('FAST')}
                  className={`px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                    selectedModel === 'FAST'
                      ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>🚀 Fast</span>
                    <span className="text-xs opacity-80">~20s</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedModel('BALANCED')}
                  className={`px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                    selectedModel === 'BALANCED'
                      ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>⚖️ Balanced</span>
                    <span className="text-xs opacity-80">~30s</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedModel('QUALITY')}
                  className={`px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                    selectedModel === 'QUALITY'
                      ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>✨ Quality</span>
                    <span className="text-xs opacity-80">~45s</span>
                  </div>
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                {selectedModel === 'FASTEST' && '⚡ Ultra-fast parsing'}
                {selectedModel === 'FAST' && '🚀 Fast and reliable parsing'}
                {selectedModel === 'BALANCED' && '⚖️ Great balance of speed and accuracy'}
                {selectedModel === 'QUALITY' && '✨ Best accuracy with bold text detection'}
              </p>
            </div>
            
            <div className="border-2 border-dashed border-teal-300 rounded-2xl p-12 text-center bg-teal-50">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'resume')}
                accept=".pdf,.doc,.docx"
                className="hidden"
              />
              <FileUp className="w-20 h-20 text-teal-400 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Upload Your Resume</h3>
              <p className="text-gray-600 mb-6 text-lg">AI will extract and parse your information automatically</p>
              
              {/* Progress Bar */}
              {isUploading && (
                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>{parsingMessage || 'Processing...'}</span>
                    <span>{parsingProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-600 to-teal-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${parsingProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-8 py-4 rounded-xl font-semibold text-lg bg-gradient-to-r from-blue-600 to-teal-600 text-white hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto"
                >
                  {isUploading && <Loader2 className="w-5 h-5 animate-spin" />}
                  {isUploading ? 'Parsing Resume...' : 'Choose File'}
                </button>
              </div>
              {uploadedFiles.resume && (
                <div className="mt-6 flex items-center justify-center gap-3 text-green-600">
                  <Check className="w-5 h-5" />
                  <span className="text-lg font-medium">{uploadedFiles.resume.name}</span>
                  <button
                    onClick={() => {
                      setUploadedFiles(prev => ({ ...prev, resume: null }));
                      setExtractedData(null);
                      setLocalResumeData({
                        personalInfo: { fullName: '', email: '', phone: '', location: '', linkedin: '', website: '', summary: '' },
                        experience: [{ id: 1, title: '', company: '', location: '', startDate: '', endDate: '', current: false, description: [] }],
                        education: [{ id: 1, degree: '', institution: '', location: '', year: '', gpa: '' }],
                        skills: [],
                        projects: [{ id: 1, name: '', description: '', technologies: [], link: '' }],
                        achievements: []
                      });
                    }}
                    className="ml-3 text-red-600 hover:text-red-800 text-sm underline"
                  >
                    Clear
                  </button>
                </div>
              )}
              <p className="text-sm text-gray-500 mt-4">Supports PDF, DOC, DOCX files</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Input Section (conditional) */}
      {useManualInput && (
        <div className="mb-12">
          <div className="max-w-3xl mx-auto">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-green-800 mb-4">Manual Input Mode</h3>
              <p className="text-green-700 mb-6 text-lg">Fill in your details manually. You can edit all fields in the resume editor after generation.</p>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    Your Profile & Experience Description
                  </label>
                  <textarea
                    value={inputProfile}
                    onChange={(e) => {
                      const newProfile = e.target.value;
                      setInputProfile(newProfile);
                      setLocalResumeData(prev => {
                        const newData = {
                          ...prev,
                          personalInfo: {
                            ...prev.personalInfo,
                            summary: newProfile
                          }
                        };
                        debouncedUpdateATSScore(newData);
                        return newData;
                      });
                    }}
                    className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                    placeholder="Describe your background, experience, and key achievements..."
                  />
                </div>

                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    Technical Skills & Competencies (comma separated)
                  </label>
                  <textarea
                    value={skills}
                    onChange={(e) => {
                      const newSkills = e.target.value;
                      setSkills(newSkills);
                      const skillArray = newSkills.split(',').map(skill => skill.trim()).filter(skill => skill);
                      setLocalResumeData(prev => {
                        const newData = { ...prev, skills: skillArray };
                        debouncedUpdateATSScore(newData);
                        return newData;
                      });
                    }}
                    className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                    placeholder="Project Management, Leadership, Communication, Data Analysis, Strategic Planning, etc."
                  />
                </div>

                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    Job Description (Optional - for JD-specific optimization)
                  </label>
                  <div className="flex gap-3">
                    <textarea
                      value={inputJD}
                      onChange={(e) => {
                        const newJD = e.target.value;
                        setInputJD(newJD);
                        if (newJD.trim()) {
                          setResumeType('jd-specific');
                        } else {
                          setResumeType('generic');
                        }
                      }}
                      className="flex-1 h-32 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                      placeholder="Paste job description here for AI-powered resume optimization..."
                    />
                    {inputJD.trim() && (
                      <button
                        onClick={() => {
                          setInputJD('');
                          setResumeType('generic');
                        }}
                        className="px-4 py-2 text-red-600 hover:text-red-800 transition-colors"
                        title="Clear job description"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  {inputJD.trim() && (
                    <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Resume will be optimized for this job description
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tailor Summary to JD Button - Only show when resume data exists and JD is added */}
      {(useResumeUpload || useManualInput) && inputJDForTailoring?.trim() && localResumeData.personalInfo.summary && tailorSummaryToJD && (
        <div className="max-w-3xl mx-auto mb-8">
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-purple-600" />
                <div>
                  <h3 className="text-lg font-semibold text-purple-800">Tailor Summary to Job Description</h3>
                  <p className="text-sm text-purple-600">Optimize your resume summary to match the job requirements</p>
                </div>
              </div>
              <button
                onClick={tailorSummaryToJD}
                disabled={isTailoringSummary}
                className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
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
                    <Wand2 className="w-4 h-4" />
                    Tailor Summary
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Simple debug - always show if JD prop exists */}
      {inputJDForTailoring && (
        <div className="max-w-3xl mx-auto mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-800 mb-2">Debug: JD Prop (Parent State)</h4>
          <div className="text-sm text-blue-700">
            <div>JD Prop Value: "{inputJDForTailoring}"</div>
            <div>JD Prop Length: {inputJDForTailoring?.length || 0}</div>
            <div>JD Prop Trimmed: "{inputJDForTailoring?.trim()}"</div>
            <div>Has Trimmed Content: {!!inputJDForTailoring?.trim()}</div>
          </div>
        </div>
      )}

      {/* Debug section - shows which conditions are failing */}
      {inputJDForTailoring?.trim() && (
        <div className="max-w-3xl mx-auto mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">Debug: Tailor Summary Conditions</h4>
          <div className="text-sm text-yellow-700 space-y-1">
            <div>✓ JD Content: {inputJDForTailoring?.trim() ? 'Present' : 'Missing'}</div>
            <div>{useResumeUpload || useManualInput ? '✓' : '✗'} Mode Active: {useResumeUpload ? 'Resume Upload' : useManualInput ? 'Manual Input' : 'None'}</div>
            <div>{localResumeData.personalInfo.summary ? '✓' : '✗'} Summary: {localResumeData.personalInfo.summary ? 'Present' : 'Missing'}</div>
            <div>{tailorSummaryToJD ? '✓' : '✗'} Function: {tailorSummaryToJD ? 'Available' : 'Missing'}</div>
            <div className="mt-2 font-medium">
              All Conditions Met: {(useResumeUpload || useManualInput) && inputJDForTailoring?.trim() && localResumeData.personalInfo.summary && tailorSummaryToJD ? 'YES' : 'NO'}
            </div>
          </div>
        </div>
      )}

      {/* Previously Parsed Resumes Section */}
      {previouslyParsedResumes.length > 0 && (
        <div className="max-w-3xl mx-auto mb-8">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-800">Previously Parsed Resumes</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Click on a resume below to load it without re-parsing</p>
            <div className="space-y-2">
              {previouslyParsedResumes.map((parsedResume) => (
                <div
                  key={parsedResume.id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-teal-400 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => loadParsedResume(parsedResume)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileUp className="w-5 h-5 text-teal-600" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 group-hover:text-teal-600 transition-colors">
                        {parsedResume.fileName}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Parsed {new Date(parsedResume.parsedAt).toLocaleDateString()} at {new Date(parsedResume.parsedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteParsedResume(parsedResume.id);
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Generate Resume Button */}
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => generateContent('resume')}
          disabled={isGenerating || !canGenerate()}
          className={`w-full py-6 rounded-2xl font-bold text-xl transition-all disabled:opacity-50 flex items-center justify-center gap-4 text-white hover:opacity-95 shadow-xl hover:shadow-2xl ${
            canGenerate() && !isGenerating
              ? 'bg-gradient-to-r from-blue-600 to-teal-600' 
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          <Wand2 className="w-7 h-7" />
          {isGenerating 
            ? 'Generating Resume...' 
            : 'Generate Resume'
          }
        </button>
        <p className="text-center text-gray-500 mt-4 text-lg">
          {canGenerate() 
            ? 'AI will create an optimized resume and redirect you to the editor'
            : useResumeUpload
              ? 'Please upload and parse your resume to continue'
              : 'Please fill in your details to continue'
          }
        </p>
      </div>

      {/* JD Input Modal */}
      {showJDModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <Target className="w-6 h-6 text-purple-600" />
                Add Job Description
              </h3>
              <button
                onClick={() => setShowJDModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-lg font-medium text-gray-700 mb-3">
                Paste the job description you want to optimize your resume for:
              </label>
              <textarea
                value={tempJD}
                onChange={(e) => setTempJD(e.target.value)}
                className="w-full h-64 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                placeholder="Paste the complete job description here..."
              />
            </div>

            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowJDModal(false)}
                className="px-6 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJDSubmit}
                className="px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-95 transition-opacity"
              >
                Optimize Resume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeForm;