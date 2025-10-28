'use client';

import React from 'react';
import Link from 'next/link';
import { useResume } from '@/contexts/ResumeContext';
import { User, Briefcase, MapPin, Code, CheckCircle, ArrowRight } from 'lucide-react';

export default function IntegrationDemo() {
  const { resumeData } = useResume();

  if (!resumeData || Object.keys(resumeData).length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <div className="flex items-start">
          <Briefcase className="h-6 w-6 text-blue-600 mt-1 mr-3 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Resume-Job Search Integration
            </h3>
            <p className="text-blue-800 mb-4">
              Create your resume first to see how it automatically pre-fills the job search form!
            </p>
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors inline-flex items-center"
              >
                <User className="h-4 w-4 mr-2" />
                Create Resume
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const skills = resumeData.skills || [];
  const experience = resumeData.experience || [];
  const location = resumeData.personalInfo?.location || '';
  const jobTitles = experience.map(exp => exp.title).filter(Boolean);

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
      <div className="flex items-start">
        <CheckCircle className="h-6 w-6 text-green-600 mt-1 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-green-900 mb-2">
            Resume Data Detected! 🎉
          </h3>
          <p className="text-green-800 mb-4">
            Your resume data will automatically pre-fill the job search form below.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-md p-3">
              <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-2 text-gray-600" />
                Location
              </h4>
              <p className="text-gray-700">{location || 'Not specified'}</p>
            </div>
            
            <div className="bg-white rounded-md p-3">
              <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                <Briefcase className="h-4 w-4 mr-2 text-gray-600" />
                Job Titles
              </h4>
              <p className="text-gray-700">
                {jobTitles.length > 0 ? jobTitles.join(', ') : 'No experience added'}
              </p>
            </div>
            
            <div className="bg-white rounded-md p-3 md:col-span-2">
              <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                <Code className="h-4 w-4 mr-2 text-gray-600" />
                Skills
              </h4>
              <div className="flex flex-wrap gap-2">
                {skills.length > 0 ? (
                  skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">No skills added</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Link
              href="/jobs"
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors inline-flex items-center"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Try Job Search
            </Link>
            <Link
              href="/"
              className="text-green-600 hover:text-green-800 underline"
            >
              Edit Resume
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
