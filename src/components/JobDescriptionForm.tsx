import React from 'react';
import { 
  Briefcase, 
  Eye, 
  Download, 
  Wand2
} from 'lucide-react';
import { JDData } from '@/types/resume-builder-types';
import JDPreview from './JDPreview';

interface JobDescriptionFormProps {
  jdData: JDData;
  setJdData: (data: JDData) => void;
  inputProfile: string;
  setInputProfile: (value: string) => void;
  isGenerating: boolean;
  generateContent: (type: 'resume' | 'jd') => Promise<void>;
  previewMode: boolean;
  setPreviewMode: (value: boolean) => void;
  generatePDF: () => void;
}

const JobDescriptionForm: React.FC<JobDescriptionFormProps> = ({
  jdData,
  setJdData,
  inputProfile,
  setInputProfile,
  isGenerating,
  generateContent,
  previewMode,
  setPreviewMode,
  generatePDF
}) => {
  return (
    <div className="flex flex-col gap-8">
      {/* JD Input Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-green-600 mb-6">Create Job Description</h2>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Profile & Requirements
          </label>
          <textarea
            value={inputProfile}
            onChange={(e) => setInputProfile(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Describe the company, role requirements, and ideal candidate profile..."
          />
        </div>

        <button
          onClick={() => generateContent('jd')}
          disabled={isGenerating}
          className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Wand2 className="w-5 h-5" />
          {isGenerating ? 'Generating...' : 'Generate Job Description'}
        </button>

        {/* JD Form Fields */}
        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input
              type="text"
              value={jdData.jobTitle}
              onChange={(e) => setJdData(prev => ({ ...prev, jobTitle: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Senior Software Engineer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              type="text"
              value={jdData.company}
              onChange={(e) => setJdData(prev => ({ ...prev, company: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="TechCorp Solutions"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={jdData.location}
                onChange={(e) => setJdData(prev => ({ ...prev, location: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="San Francisco, CA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={jdData.employmentType}
                onChange={(e) => setJdData(prev => ({ ...prev, employmentType: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* JD Preview Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-green-600">Job Description Preview</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              {previewMode ? 'Hide' : 'Show'} Preview
            </button>
            <button
              onClick={generatePDF}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
        
        {previewMode && <JDPreview jdData={jdData} />}
      </div>
    </div>
  );
};

export default JobDescriptionForm;
