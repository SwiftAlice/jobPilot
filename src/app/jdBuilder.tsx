"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useResume } from '@/contexts/ResumeContext';
import { 
  Download, 
  FileText, 
  User, 
  Briefcase, 
  Eye,
  FileUp,
  Check,
  Zap,
  Target,
  Wand2,
  Plus,
  Trash2
} from 'lucide-react';
import ResumePreview from '@/components/ResumePreview';
import JobDescriptionForm from '@/components/JobDescriptionForm';
import ResumeForm from '@/components/ResumeForm';
import ResumeEditor from '@/components/ResumeEditor';
import { ResumeData, JDData, ATSScore, UploadedFiles, ResumeTemplate } from '@/types/resume-builder-types';
import { debounce, calculateATSScore, extractKeywords } from '@/lib/resume-utils';
import { generatePDF, generatePDFFromDom } from '@/lib/pdf-utils';


const ResumeJDBuilder = () => {
  const { resumeData, setResumeData, updateResumeData } = useResume();
  const [activeTab, setActiveTab] = useState('resume');
  const [localResumeData, setLocalResumeData] = useState<ResumeData>(resumeData || {
    personalInfo: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      website: '',
      summary: ''
    },
    experience: [
      {
        id: 1,
        title: '',
        company: '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        description: []
      }
    ],
    education: [
      {
        id: 1,
        degree: '',
        institution: '',
        location: '',
        year: '',
        gpa: ''
      }
    ],
    skills: [],
    projects: [
      {
        id: 1,
        name: '',
        description: '',
        technologies: [],
        link: ''
      }
    ],
    achievements: []
  });

  const [jdData, setJdData] = useState<JDData>({
    jobTitle: '',
    company: '',
    department: '',
    location: '',
    employmentType: 'Full-time',
    experienceLevel: 'Mid-level',
    salary: '',
    overview: '',
    responsibilities: [],
    requirements: [],
    preferredSkills: [],
    benefits: [],
    companyInfo: ''
  });

  const [inputJD, setInputJD] = useState('');

  const [inputProfile, setInputProfile] = useState('');
  const [skills, setSkills] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsingMessage, setParsingMessage] = useState('');
  const [isTailoringSummary, setIsTailoringSummary] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showResumeEditor, setShowResumeEditor] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFiles>({
    resume: null,
    profile: null
  });
  const [resumeType, setResumeType] = useState('generic');
  const [extractedData, setExtractedData] = useState<ResumeData | null>(null);
  const [atsScore, setAtsScore] = useState<ATSScore | null>(null);
  const [keywordMatches, setKeywordMatches] = useState<string[]>([]);
  
  // Toggle switches for manual input vs resume upload
  const [useResumeUpload, setUseResumeUpload] = useState(true);
  const [useManualInput, setUseManualInput] = useState(false);
  
  // Progressive widget disclosure state
  const [currentStep, setCurrentStep] = useState(0); // 0=Input Type, 1=Manual Input (if selected), 2=Resume Type, 3=Template, 4=Personal Info, 5=Education, 6=Preview
  
  // Template selection (persisted)
  const [selectedTemplate, setSelectedTemplate] = useState('modern');

  // Load selectedTemplate from localStorage on mount
  React.useEffect(() => {
    try {
      const storedTemplate = typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null;
      if (storedTemplate) {
        setSelectedTemplate(storedTemplate);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // Persist selectedTemplate when it changes
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && selectedTemplate) {
        window.localStorage.setItem('selectedTemplate', selectedTemplate);
      }
    } catch (_) {
      // ignore
    }
  }, [selectedTemplate]);

  // Use ref to track if update is coming from internal state change
  const isInternalUpdate = useRef(false);

  // Sync local state with context only when context changes from external source
  React.useEffect(() => {
    if (resumeData && !isInternalUpdate.current) {
      setLocalResumeData(resumeData);
    }
    isInternalUpdate.current = false;
  }, [resumeData]);

  // Update context when local state changes (but avoid circular updates)
  React.useEffect(() => {
    if (localResumeData && Object.keys(localResumeData).length > 0) {
      isInternalUpdate.current = true;
      setResumeData(localResumeData);
    }
  }, [localResumeData, setResumeData]);

  // Available resume templates
  const resumeTemplates: ResumeTemplate[] = [
    {
      id: 'ats-modern',
      name: 'ATS Modern',
      description: 'Clean, modern design optimized for ATS parsing with proper section headers and formatting',
      category: 'ats',
      atsOptimized: true,
      colorScheme: 'blue',
      icon: '📋'
    },
    {
      id: 'modern',
      name: 'Modern Professional',
      description: 'Clean, contemporary design with strong ATS optimization',
      category: 'modern',
      atsOptimized: true,
      colorScheme: 'blue',
      icon: '🎯'
    },
    {
      id: 'classic',
      name: 'Classic Corporate',
      description: 'Traditional format preferred by conservative industries',
      category: 'classic',
      atsOptimized: true,
      colorScheme: 'gray',
      icon: '💼'
    },
    {
      id: 'creative',
      name: 'Creative Professional',
      description: 'Bold design for creative and tech roles',
      category: 'creative',
      atsOptimized: true,
      colorScheme: 'purple',
      icon: '🎨'
    },
    {
      id: 'minimal',
      name: 'Minimal Clean',
      description: 'Ultra-clean design with maximum ATS compatibility',
      category: 'minimal',
      atsOptimized: true,
      colorScheme: 'green',
      icon: '✨'
    },
    {
      id: 'executive',
      name: 'Executive Summary',
      description: 'High-level format for senior positions',
      category: 'classic',
      atsOptimized: true,
      colorScheme: 'indigo',
      icon: '👔'
    },
    {
      id: 'technical',
      name: 'Technical Specialist',
      description: 'Optimized for technical and engineering roles',
      category: 'modern',
      atsOptimized: true,
      colorScheme: 'teal',
      icon: '⚙️'
    }
  ];

  // Debounced ATS score update to avoid too many API calls
  const debouncedUpdateATSScore = useCallback(
    debounce(async (newResumeData: ResumeData) => {
      await updateATSScore(newResumeData);
    }, 1000), // 1 second delay
    [inputJD] // Include inputJD as dependency
  );

  // Update ATS score when JD changes
  const updateATSScoreForJD = async (jdText: string) => {
    if (localResumeData && Object.keys(localResumeData.personalInfo).some(key => localResumeData.personalInfo[key as keyof typeof localResumeData.personalInfo])) {
      await updateATSScore(localResumeData);
    }
  };

  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Async file upload handler with streaming
  const handleFileUpload = async (file: File | null, type: 'resume' | 'profile') => {
    if (!file) return;
    
    setIsUploading(true);
    setUploadedFiles(prev => ({ ...prev, [type]: file }));
    
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Call the async streaming API with cache busting
      const response = await fetch(`/api/resume/async?t=${Date.now()}`, {
        method: 'POST',
        body: formData,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to start async parsing');
      }

      // Handle Server-Sent Events
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';
      const parsedData: ResumeData = {
        personalInfo: {
          fullName: '',
          email: '',
          phone: '',
          location: '',
          linkedin: '',
          website: '',
          summary: ''
        },
        experience: [],
        education: [],
        skills: [],
        projects: [],
        achievements: []
      };

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                console.log(`Progress: ${data.progress}% - ${data.message}`);
                setParsingProgress(data.progress);
                setParsingMessage(data.message);
              } else if (data.type === 'data') {
                // Update the resume data as chunks arrive
                if (data.section === 'personalInfo') {
                  parsedData.personalInfo = { ...parsedData.personalInfo, ...data.data };
                } else if (data.section === 'experience') {
                  parsedData.experience = data.data;
                } else if (data.section === 'education') {
                  parsedData.education = data.data;
                } else if (data.section === 'skills') {
                  parsedData.skills = data.data;
                } else if (data.section === 'projects') {
                  parsedData.projects = data.data;
                }
                
                // Update the UI with the new data
                setExtractedData({ ...parsedData });
                setLocalResumeData({ ...parsedData });
                debouncedUpdateATSScore(parsedData);
              } else if (data.type === 'complete') {
                console.log('Parsing completed successfully!');
                setExtractedData(parsedData);
                setLocalResumeData(parsedData);
                debouncedUpdateATSScore(parsedData);
                setUseResumeUpload(true);
                setUseManualInput(false);
                alert('Resume parsed successfully! The extracted information has been loaded. You can now edit any fields if needed.');
                break;
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('File upload error:', error);
      alert(`Failed to parse resume: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Function to tailor summary to JD
  const tailorSummaryToJD = async () => {
    if (!inputJD.trim() || !localResumeData.personalInfo.summary) {
      alert('Please add both a Job Description and ensure your resume has a summary.');
      return;
    }

    setIsTailoringSummary(true);
    console.log('🎯 Starting tailor summary process...');
    console.log('📝 Current summary:', localResumeData.personalInfo.summary);
    console.log('📋 Job description:', inputJD);
    try {
      console.log('🚀 Making API call to /api/resume/tailor-summary...');
      const response = await fetch('/api/resume/tailor-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSummary: localResumeData.personalInfo.summary,
          jobDescription: inputJD,
          resumeData: localResumeData
        }),
      });

      console.log('📡 API response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('✅ API response:', result);
        if (result.success && result.tailoredSummary) {
          setLocalResumeData(prev => ({
            ...prev,
            personalInfo: {
              ...prev.personalInfo,
              summary: result.tailoredSummary
            }
          }));
          console.log('🎉 Summary updated successfully!');
          
          if (result.fallback) {
            alert(`⚠️ ${result.message}`);
          } else {
            alert('Summary tailored to match the job description!');
          }
        } else {
          console.error('❌ API returned success=false:', result);
          throw new Error(result.error || 'Failed to tailor summary');
        }
      } else {
        console.error('❌ API request failed with status:', response.status);
        throw new Error('Failed to tailor summary');
      }
    } catch (error) {
      console.error('💥 Error tailoring summary:', error);
      alert(`Failed to tailor summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTailoringSummary(false);
    }
  };

  // Helper function to update ATS score when resume data changes
  const updateATSScore = async (newResumeData: ResumeData, jdText?: string) => {
    const jdToUse = jdText || inputJD.trim() || '';
    try {
      // Call the backend API to get ATS score from Python server
      const response = await fetch('/api/ats/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeData: newResumeData,
          jdText: jdToUse
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('ATS score updated from server:', result.data);
          setAtsScore(result.data);
          setKeywordMatches(result.data.matchedKeywords || []);
        } else {
          // ATS scoring failed, fallback to local calculation
          fallbackATSScore(newResumeData, jdToUse);
        }
      } else {
        // ATS API error, fallback to local calculation
        fallbackATSScore(newResumeData, jdToUse);
      }
    } catch (error) {
      // Error updating ATS score, fallback to local calculation
      fallbackATSScore(newResumeData, jdToUse);
    }
  };

  // Fallback ATS score calculation (local)
  const fallbackATSScore = (newResumeData: ResumeData, jdText?: string) => {
    const jdToUse = jdText || inputJD.trim() || '';
    console.log('Fallback ATS calculation - JD text:', jdToUse);
    console.log('Fallback ATS calculation - Resume data skills:', newResumeData.skills);
    const newAtsScore = calculateATSScore(newResumeData, jdToUse);
    console.log('Using fallback ATS score:', newAtsScore);
    setAtsScore(newAtsScore);
    setKeywordMatches(newAtsScore.matchedKeywords || []);
    console.log('ATS score state updated to:', newAtsScore.score);
  };


  // Simulate AI content generation
  const generateContent = async (type: 'resume' | 'jd') => {
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (type === 'resume') {
      const isJDSpecific = inputJD.trim().length > 0;
      const baseResume = extractedData || localResumeData;
      
      let generatedResume: ResumeData;
      
      if (isJDSpecific) {
        // JD-specific resume with keyword optimization
        const jdKeywords = extractKeywords(inputJD);
        generatedResume = {
          ...baseResume,
          personalInfo: {
            ...baseResume.personalInfo,
            summary: `Results-driven software engineer with ${jdKeywords.includes('React') ? 'extensive React.js expertise' : 'full-stack development experience'} and proven track record in ${jdKeywords.includes('AWS') ? 'cloud architecture' : 'scalable application development'}. Experienced in ${jdKeywords.slice(0, 4).join(', ')} with strong focus on ${jdKeywords.includes('Agile') ? 'agile methodologies' : 'collaborative development'} and ${jdKeywords.includes('Leadership') ? 'team leadership' : 'technical excellence'}. Demonstrated expertise in modern development practices, database design, API development, and DevOps methodologies. Strong analytical skills with proven track record of optimizing application performance and implementing best practices for code quality and maintainability.`
          },
          experience: baseResume.experience.map(exp => ({
            ...exp,
            description: exp.description.map(desc => {
              // Enhance descriptions with JD keywords
              if (jdKeywords.includes('React') && desc.includes('web')) {
                return desc.replace('web applications', 'React-based web applications');
              }
              if (jdKeywords.includes('AWS') && desc.includes('performance')) {
                return desc + ' using AWS cloud infrastructure';
              }
              return desc;
            })
          })),
          skills: [...new Set([...baseResume.skills, ...jdKeywords.slice(0, 10)
          ])],
        };
        
        // Calculate ATS score
        const atsResult = calculateATSScore(generatedResume, inputJD);
        setAtsScore(atsResult);
        setKeywordMatches(atsResult.matchedKeywords || []);
        
      } else {
        // Generic ATS-optimized resume
        generatedResume = {
          ...baseResume,
          personalInfo: {
            ...baseResume.personalInfo,
            summary: baseResume.personalInfo.summary || 'Professional summary will be generated based on your experience and skills.'
          },
          skills: [
            ...baseResume.skills
          ].slice(0, 30),
        };
        
        // Calculate ATS score for the generated resume
        const atsResult = calculateATSScore(generatedResume, '');
        setAtsScore(atsResult);
      }
      
      setLocalResumeData(generatedResume);
      setResumeType(isJDSpecific ? 'jd-specific' : 'generic');
      
      // Redirect to resume editor after generation
      setShowResumeEditor(true);
      
    } else if (type === 'jd') {
      // JD generation logic
      const generatedJD: JDData = {
        ...jdData,
        jobTitle: 'Senior Software Engineer',
        company: 'TechCorp Solutions',
        overview: 'We are seeking a talented Senior Software Engineer to join our dynamic development team. The ideal candidate will have strong technical skills and experience in building scalable web applications.',
        responsibilities: [
          'Design and develop scalable web applications using modern technologies',
          'Collaborate with product managers and designers to implement new features',
          'Mentor junior developers and conduct code reviews',
          'Participate in architectural decisions and technical planning',
          'Ensure code quality through testing and best practices'
        ],
        requirements: [
          "Bachelor's degree in Computer Science or related field",
          '5+ years of experience in software development',
          'Proficiency in React, Node.js, and modern JavaScript',
          'Experience with databases (SQL and NoSQL)',
          'Strong problem-solving and communication skills'
        ],
        preferredSkills: ['AWS', 'Docker', 'TypeScript', 'GraphQL', 'Microservices']
      };
      setJdData(generatedJD);
    }
    setIsGenerating(false);
  };

  const addSkill = () => {
    if (newSkill.trim() && Array.isArray(localResumeData.skills) && !localResumeData.skills.includes(newSkill.trim())) {
      setLocalResumeData(prev => {
        const newData = {
          ...prev,
          skills: [...(Array.isArray(prev.skills) ? prev.skills : []), newSkill.trim()]
        };
        
        // Update ATS score when skills change (debounced)
        debouncedUpdateATSScore(newData);
        
        return newData;
      });
      setNewSkill('');
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setLocalResumeData(prev => {
      const newData = {
        ...prev,
        skills: Array.isArray(prev.skills) ? prev.skills.filter(skill => skill !== skillToRemove) : []
      };
      
      // Update ATS score when skills change (debounced)
      debouncedUpdateATSScore(newData);
      
      return newData;
    });
  };


  const handleGeneratePDF = async () => {
    try {
      // Show loading state
      const originalText = document.querySelector('[data-pdf-button]')?.textContent;
      const pdfButton = document.querySelector('[data-pdf-button]') as HTMLButtonElement;
      if (pdfButton) {
        pdfButton.textContent = 'Generating PDF...';
        pdfButton.disabled = true;
      }

      // Prefer DOM-based export to match on-screen preview exactly
      const previewEl = document.querySelector('.print-optimized') as HTMLElement | null;
      let filename: string;
      if (previewEl) {
        const result = await generatePDFFromDom(previewEl, `${localResumeData.personalInfo.fullName || 'Resume'}_Preview.pdf`);
        filename = typeof result === 'string' ? result : 'Resume_Preview.pdf';
      } else {
        // Fallback to programmatic generator if DOM element not found
        filename = await generatePDF(localResumeData, selectedTemplate);
      }

      // Reset button state
      if (pdfButton) {
        pdfButton.textContent = originalText || 'PDF';
        pdfButton.disabled = false;
      }

      alert(`PDF generated successfully: ${filename}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const generateDOCX = () => {
    alert('DOCX generation would be implemented with docx.js library. This creates a downloadable Word document.');
  };

  // Get current template
  const currentTemplate = resumeTemplates.find(t => t.id === selectedTemplate) || resumeTemplates[0];

  const [authState, setAuthState] = useState({ authenticated: false, user: null });
  useEffect(() => {
    const getSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        setAuthState(data);
      } catch {
        setAuthState({ authenticated: false, user: null });
      }
    };
    getSession();
  }, []);


  // Show resume editor if enabled
  if (showResumeEditor) {
  return (
      <ResumeEditor
        resumeData={localResumeData}
        setResumeData={setLocalResumeData}
        atsScore={atsScore}
        setAtsScore={setAtsScore}
        keywordMatches={keywordMatches}
        setKeywordMatches={setKeywordMatches}
        resumeType={resumeType}
        setResumeType={setResumeType}
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        resumeTemplates={resumeTemplates}
        uploadedFiles={uploadedFiles}
        onBack={() => setShowResumeEditor(false)}
        onGeneratePDF={handleGeneratePDF}
        onSave={() => {
          // Save logic here - could save to localStorage or send to API
          console.log('Saving resume data:', localResumeData);
          alert('Resume saved successfully!');
        }}
        updateATSScore={updateATSScore}
        inputJD={inputJD}
        tailorSummaryToJD={tailorSummaryToJD}
        isTailoringSummary={isTailoringSummary}
        setInputJD={setInputJD}
        onResumeDataChange={(newResumeData) => {
          console.log('ResumeEditor data changed, updating parent state');
          setLocalResumeData(newResumeData);
        }}
        onATSScoreUpdate={(score, keywords) => {
          console.log('ResumeEditor ATS score updated, syncing with parent');
          console.log('Parent received ATS score:', score.score);
          console.log('Parent received keywords:', keywords);
          setAtsScore(score);
          setKeywordMatches(keywords);
          console.log('Parent ATS score state updated to:', score.score);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 bg-white">

        <ResumeForm
          localResumeData={localResumeData}
          setLocalResumeData={setLocalResumeData}
          inputProfile={inputProfile}
          setInputProfile={setInputProfile}
          skills={skills}
          setSkills={setSkills}
          newSkill={newSkill}
          setNewSkill={setNewSkill}
          addSkill={addSkill}
          removeSkill={removeSkill}
          inputJD={inputJD}
          setInputJD={setInputJD}
          resumeType={resumeType}
          setResumeType={setResumeType}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          resumeTemplates={resumeTemplates}
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          useResumeUpload={useResumeUpload}
          setUseResumeUpload={setUseResumeUpload}
          useManualInput={useManualInput}
          setUseManualInput={setUseManualInput}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          extractedData={extractedData}
          setExtractedData={setExtractedData}
          fileInputRef={fileInputRef}
          handleFileUpload={handleFileUpload}
          isGenerating={isGenerating}
          isUploading={isUploading}
          parsingProgress={parsingProgress}
          parsingMessage={parsingMessage}
          generateContent={generateContent}
          debouncedUpdateATSScore={debouncedUpdateATSScore}
          updateATSScore={updateATSScore}
          tailorSummaryToJD={tailorSummaryToJD}
          isTailoringSummary={isTailoringSummary}
          inputJDForTailoring={inputJD}
          authenticated={authState.authenticated}
          user={authState.user}
        />
      </div>
    </div>
  );
};

export default ResumeJDBuilder;