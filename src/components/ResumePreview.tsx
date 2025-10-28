import React from 'react';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Globe,
  FileText,
  Target
} from 'lucide-react';
import { ResumeData, ATSScore, UploadedFiles } from '@/types/resume-builder-types';

interface ResumePreviewProps {
  resumeData: ResumeData;
  selectedTemplate: string;
  atsScore: ATSScore | null;
  keywordMatches: string[];
  resumeType: string;
  extractedData: ResumeData | null;
  uploadedFiles: UploadedFiles;
  previewRef: React.RefObject<HTMLDivElement | null>;
  inputJD?: string;
}

const ResumePreview: React.FC<ResumePreviewProps> = ({
  resumeData,
  selectedTemplate,
  atsScore,
  keywordMatches,
  resumeType,
  extractedData,
  uploadedFiles,
  previewRef,
  inputJD
}) => {
  console.log('=== RESUMEPREVIEW RENDER ===');
  console.log('ResumePreview - ATS Score:', atsScore);
  console.log('ResumePreview - ATS Score Value:', atsScore?.score);
  console.log('ResumePreview - Keyword Matches:', keywordMatches);
  console.log('ResumePreview - Resume Type:', resumeType);
  console.log('ResumePreview - Resume Skills:', resumeData.skills);
  console.log('ResumePreview - Input JD:', inputJD);
  console.log('ResumePreview - Timestamp:', new Date().toLocaleTimeString());
  console.log('=== RESUMEPREVIEW RENDER END ===');
  
  return (
    <div className={`bg-white p-8 shadow-lg max-w-4xl mx-auto resume-template-${selectedTemplate} print-optimized`} ref={previewRef} style={{
      minHeight: '297mm', // A4 height
      width: '210mm', // A4 width
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.4',
      color: '#333'
    }}>
      {/* Upload Status Indicator */}
      {extractedData && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <span className="text-green-800 font-medium">
              ✓ Resume data loaded from uploaded file
            </span>
            <span className="text-green-600 text-sm">
              ({uploadedFiles.resume?.name})
            </span>
          </div>
        </div>
      )}
      
      {/* ATS Score Badge removed from printable resume */}

      {/* Header - Template Specific */}
      {selectedTemplate === 'ats-modern' ? (
        <div className="bg-white">
          {/* Header Section */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
              <div><strong>Email:</strong> {resumeData.personalInfo.email || 'your.email@example.com'}</div>
              <div><strong>Phone:</strong> {resumeData.personalInfo.phone || '(555) 123-4567'}</div>
              <div><strong>Location:</strong> {resumeData.personalInfo.location || 'City, State'}</div>
              <div><strong>LinkedIn:</strong> {resumeData.personalInfo.linkedin || 'linkedin.com/in/yourprofile'}</div>
            </div>
          </div>

          {/* Professional Summary */}
          {resumeData.personalInfo.summary && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 border-b-2 border-blue-500 pb-1">PROFESSIONAL SUMMARY</h2>
              <p className="text-gray-700 leading-relaxed">{resumeData.personalInfo.summary}</p>
            </div>
          )}

          {/* Professional Experience */}
          {resumeData.experience && resumeData.experience.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b-2 border-blue-500 pb-1">PROFESSIONAL EXPERIENCE</h2>
              <div className="space-y-4">
                {resumeData.experience.map((exp, index) => (
                  <div key={index} className="border-l-2 border-gray-200 pl-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{exp.title}</h3>
                      <span className="text-sm text-gray-600 font-medium">
                        {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                      </span>
                    </div>
                    <div className="text-gray-700 mb-2">
                      <strong>{exp.company}</strong> | {exp.location}
                    </div>
                    <ul className="text-gray-700 space-y-1">
                      {exp.description.map((desc, descIndex) => (
                        <li key={descIndex} className="flex items-start">
                          <span className="text-blue-500 mr-2 mt-1">•</span>
                          <span>{desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {resumeData.skills && resumeData.skills.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 border-b-2 border-blue-500 pb-1">TECHNICAL SKILLS</h2>
              <div className="flex flex-wrap gap-2">
                {resumeData.skills.map((skill, index) => (
                  <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {resumeData.education && resumeData.education.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b-2 border-blue-500 pb-1">EDUCATION</h2>
              <div className="space-y-3">
                {resumeData.education.map((edu, index) => (
                  <div key={index} className="border-l-2 border-gray-200 pl-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{edu.degree}</h3>
                        <div className="text-gray-700">
                          <strong>{edu.institution}</strong> | {edu.location}
                        </div>
                        {edu.gpa && <div className="text-sm text-gray-600">GPA: {edu.gpa}</div>}
                      </div>
                      <span className="text-sm text-gray-600 font-medium">{edu.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {resumeData.projects && resumeData.projects.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b-2 border-blue-500 pb-1">PROJECTS</h2>
              <div className="space-y-4">
                {resumeData.projects.map((project, index) => (
                  <div key={index} className="border-l-2 border-gray-200 pl-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                      {project.link && (
                        <a href={project.link} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View Project →
                        </a>
                      )}
                    </div>
                    <p className="text-gray-700 mb-2">{project.description}</p>
                    {project.technologies && project.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {project.technologies.map((tech, techIndex) => (
                          <span key={techIndex} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {resumeData.achievements && resumeData.achievements.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 border-b-2 border-blue-500 pb-1">KEY ACHIEVEMENTS</h2>
              <ul className="space-y-2">
                {resumeData.achievements.map((achievement, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-1">•</span>
                    <span className="text-gray-700">{achievement}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : selectedTemplate === 'minimal' ? (
        <div className="border-b border-gray-300 pb-4 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
          <div className="text-sm text-gray-600 space-y-1">
            {resumeData.personalInfo.email && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📧</span><span className="icon-box"><Mail className="w-4 h-4" /></span> {resumeData.personalInfo.email}</div>}
            {resumeData.personalInfo.phone && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📞</span><span className="icon-box"><Phone className="w-4 h-4" /></span> {resumeData.personalInfo.phone}</div>}
            {resumeData.personalInfo.location && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📍</span><span className="icon-box"><MapPin className="w-4 h-4" /></span> {resumeData.personalInfo.location}</div>}
            {resumeData.personalInfo.linkedin && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">🔗</span><span className="icon-box"><Globe className="w-4 h-4" /></span> {resumeData.personalInfo.linkedin}</div>}
          </div>
        </div>
      ) : selectedTemplate === 'creative' ? (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-lg mb-6">
          <h1 className="text-3xl font-bold mb-2">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
          <div className="flex flex-wrap gap-4 text-purple-100">
            {resumeData.personalInfo.email && (
              <span className="inline-flex items-center gap-2 align-middle leading-none">
                <span className="export-text">📧</span><span className="icon-box"><Mail className="w-4 h-4" /></span> {resumeData.personalInfo.email}
              </span>
            )}
            {resumeData.personalInfo.phone && (
              <span className="inline-flex items-center gap-2 align-middle leading-none">
                <span className="export-text">📞</span><span className="icon-box"><Phone className="w-4 h-4" /></span> {resumeData.personalInfo.phone}
              </span>
            )}
            {resumeData.personalInfo.location && (
              <span className="inline-flex items-center gap-2 align-middle leading-none">
                <span className="export-text">📍</span><span className="icon-box"><MapPin className="w-4 h-4" /></span> {resumeData.personalInfo.location}
              </span>
            )}
            {resumeData.personalInfo.linkedin && (
              <span className="inline-flex items-center gap-2 align-middle leading-none">
                <span className="export-text">🔗</span><span className="icon-box"><Globe className="w-4 h-4" /></span> {resumeData.personalInfo.linkedin}
              </span>
            )}
          </div>
        </div>
      ) : selectedTemplate === 'executive' ? (
        <div className="border-l-4 border-indigo-600 pl-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
          <div className="text-sm text-gray-600 mb-2">Executive Professional</div>
          <div className="flex flex-wrap gap-4 text-sm">
            {resumeData.personalInfo.email && <span className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📧</span><span className="icon-box"><Mail className="w-4 h-4" /></span> {resumeData.personalInfo.email}</span>}
            {resumeData.personalInfo.phone && <span className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📞</span><span className="icon-box"><Phone className="w-4 h-4" /></span> {resumeData.personalInfo.phone}</span>}
            {resumeData.personalInfo.location && <span className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📍</span><span className="icon-box"><MapPin className="w-4 h-4" /></span> {resumeData.personalInfo.location}</span>}
            {resumeData.personalInfo.linkedin && <span className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">🔗</span><span className="icon-box"><Globe className="w-4 h-4" /></span> {resumeData.personalInfo.linkedin}</span>}
          </div>
        </div>
      ) : selectedTemplate === 'technical' ? (
        <div className="bg-teal-50 border border-teal-200 p-4 rounded-lg mb-6">
          <h1 className="text-2xl font-bold text-teal-800 mb-2">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
          <div className="grid grid-cols-2 gap-2 text-sm text-teal-700">
            {resumeData.personalInfo.email && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📧</span><span className="icon-box"><Mail className="w-4 h-4" /></span> {resumeData.personalInfo.email}</div>}
            {resumeData.personalInfo.phone && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📞</span><span className="icon-box"><Phone className="w-4 h-4" /></span> {resumeData.personalInfo.phone}</div>}
            {resumeData.personalInfo.location && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">📍</span><span className="icon-box"><MapPin className="w-4 h-4" /></span> {resumeData.personalInfo.location}</div>}
            {resumeData.personalInfo.linkedin && <div className="inline-flex items-center gap-2 align-middle leading-none"><span className="export-text">🔗</span><span className="icon-box"><Globe className="w-4 h-4" /></span> {resumeData.personalInfo.linkedin}</div>}
          </div>
        </div>
      ) : (
        // Default modern template
      <div className="border-b-2 border-teal-600 pb-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">{resumeData.personalInfo.fullName || 'Your Name'}</h1>
        <div className="flex flex-wrap gap-4 mt-2 text-gray-600">
          {resumeData.personalInfo.email && (
            <span className="inline-flex items-center gap-2 align-middle leading-none">
              <span className="export-text">📧</span><span className="icon-box"><Mail className="w-4 h-4" /></span> {resumeData.personalInfo.email}
            </span>
          )}
          {resumeData.personalInfo.phone && (
            <span className="inline-flex items-center gap-2 align-middle leading-none">
              <span className="export-text">📞</span><span className="icon-box"><Phone className="w-4 h-4" /></span> {resumeData.personalInfo.phone}
            </span>
          )}
          {resumeData.personalInfo.location && (
            <span className="inline-flex items-center gap-2 align-middle leading-none">
              <span className="export-text">📍</span><span className="icon-box"><MapPin className="w-4 h-4" /></span> {resumeData.personalInfo.location}
            </span>
          )}
          {resumeData.personalInfo.linkedin && (
            <span className="inline-flex items-center gap-2 align-middle leading-none">
              <span className="export-text">🔗</span><span className="icon-box"><Globe className="w-4 h-4" /></span> {resumeData.personalInfo.linkedin}
            </span>
          )}
        </div>
      </div>
      )}

      {/* Summary - Template Specific */}
      {resumeData.personalInfo.summary && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-2 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-teal-600'
          }`}>
            {selectedTemplate === 'executive' ? 'Executive Summary' : 'Professional Summary'}
          </h2>
          <p className={`leading-relaxed ${
            selectedTemplate === 'minimal' ? 'text-gray-800' : 'text-gray-700'
          }`}>
            {resumeData.personalInfo.summary}
          </p>
        </div>
      )}

      {/* Skills - Template Specific */}
      {Array.isArray(resumeData.skills) && resumeData.skills.length > 0 && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-3 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-teal-600'
          }`}>
            {selectedTemplate === 'technical' ? 'Technical Skills' : 
             selectedTemplate === 'executive' ? 'Core Competencies' : 
             'Core Competencies'}
          </h2>
          <div className={`grid gap-2 ${
            selectedTemplate === 'minimal' ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {resumeData.skills.map((skill, index) => (
              <span key={index} className={`px-3 py-2 rounded text-sm font-medium ${
                selectedTemplate === 'creative' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                selectedTemplate === 'executive' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                selectedTemplate === 'technical' ? 'bg-teal-50 text-teal-800 border border-teal-200' :
                selectedTemplate === 'minimal' ? 'bg-gray-100 text-gray-800 border border-gray-300' :
                'bg-gray-50 text-gray-800 border border-gray-200'
              }`}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Experience - Template Specific */}
      {Array.isArray(resumeData.experience) && resumeData.experience.some(exp => exp.title) && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-3 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-teal-600'
          }`}>
            {selectedTemplate === 'executive' ? 'Executive Experience' : 'Professional Experience'}
          </h2>
          {resumeData.experience.map(exp => exp.title && (
            <div key={exp.id} className={`mb-5 ${
              selectedTemplate === 'minimal' ? 'border-b border-gray-200 pb-4' : ''
            }`}>
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-semibold text-lg ${
                  selectedTemplate === 'minimal' ? 'text-gray-900' : 'text-gray-800'
                }`}>
                  {exp.title}
                </h3>
                <span className="text-gray-600 text-sm font-medium">
                  {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <p className={`mb-3 font-medium ${
                selectedTemplate === 'creative' ? 'text-purple-600' :
                selectedTemplate === 'executive' ? 'text-indigo-600' :
                selectedTemplate === 'technical' ? 'text-teal-600' :
                selectedTemplate === 'minimal' ? 'text-gray-700' :
                'text-blue-600'
              }`}>
                {exp.company} • {exp.location}
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-1 ml-2">
                {Array.isArray(exp.description) ? exp.description.map((desc, index) => (
                  <li key={index} className="leading-relaxed">{desc}</li>
                )) : (
                  <li className="leading-relaxed text-gray-500">No description available</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Education - Template Specific */}
      {Array.isArray(resumeData.education) && resumeData.education.some(edu => edu.degree) && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-3 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-teal-600'
          }`}>
            Education & Credentials
          </h2>
          {resumeData.education.map(edu => edu.degree && (
            <div key={edu.id} className="mb-2">
              <h3 className="font-semibold text-gray-800">{edu.degree}</h3>
              <p className="text-gray-700">{edu.institution} • {edu.location} • {edu.year}</p>
              {edu.gpa && <p className="text-gray-600">GPA: {edu.gpa}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Projects */}
      {Array.isArray(resumeData.projects) && resumeData.projects.some(proj => proj.name) && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-3 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-teal-600'
          }`}>
            Key Projects
          </h2>
          {resumeData.projects.map(proj => proj.name && (
            <div key={proj.id} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-800">{proj.name}</h3>
                {proj.link && (
                  <a href={proj.link} className={`text-sm hover:opacity-80 ${
                    selectedTemplate === 'creative' ? 'text-purple-600' :
                    selectedTemplate === 'executive' ? 'text-indigo-600' :
                    selectedTemplate === 'technical' ? 'text-teal-600' :
                    selectedTemplate === 'minimal' ? 'text-gray-600' :
                    'text-teal-600'
                  }`}>
                    <Globe className="w-4 h-4" />
                  </a>
                )}
              </div>
              <p className="text-gray-700 mb-2">{proj.description}</p>
              {Array.isArray(proj.technologies) && proj.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-sm text-gray-600">Technologies:</span>
                  {proj.technologies.map((tech, index) => (
                    <span key={index} className={`px-2 py-1 rounded text-xs ${
                      selectedTemplate === 'creative' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      selectedTemplate === 'executive' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                      selectedTemplate === 'technical' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                      selectedTemplate === 'minimal' ? 'bg-gray-100 text-gray-700 border border-gray-300' :
                      'bg-gray-50 text-gray-700 border border-gray-200'
                    }`}>
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Achievements */}
      {Array.isArray(resumeData.achievements) && resumeData.achievements.length > 0 && (
        <div className="mb-6">
          <h2 className={`text-xl font-semibold mb-3 ${
            selectedTemplate === 'creative' ? 'text-purple-600' :
            selectedTemplate === 'executive' ? 'text-indigo-600' :
            selectedTemplate === 'technical' ? 'text-teal-600' :
            selectedTemplate === 'minimal' ? 'text-gray-800' :
            'text-blue-600'
          }`}>
            Key Achievements
          </h2>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            {resumeData.achievements.map((achievement, index) => (
              <li key={index}>{achievement}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ResumePreview;
