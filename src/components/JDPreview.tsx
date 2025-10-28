import React from 'react';
import { JDData } from '@/types/resume-builder-types';

interface JDPreviewProps {
  jdData: JDData;
}

const JDPreview: React.FC<JDPreviewProps> = ({ jdData }) => {
  return (
    <div className="bg-white p-8 shadow-lg max-w-4xl mx-auto">
      <div className="border-b-2 border-green-600 pb-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">{jdData.jobTitle || 'Job Title'}</h1>
        <p className="text-green-600 text-lg">{jdData.company}</p>
        <div className="flex gap-4 mt-2 text-gray-600">
          <span>{jdData.location}</span>
          <span>{jdData.employmentType}</span>
          <span>{jdData.experienceLevel}</span>
        </div>
      </div>

      {jdData.overview && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-green-600 mb-2">Job Overview</h2>
          <p className="text-gray-700 leading-relaxed">{jdData.overview}</p>
        </div>
      )}

      {Array.isArray(jdData.responsibilities) && jdData.responsibilities.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-green-600 mb-3">Key Responsibilities</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            {jdData.responsibilities.map((resp, index) => (
              <li key={index}>{resp}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(jdData.requirements) && jdData.requirements.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-green-600 mb-3">Requirements</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            {jdData.requirements.map((req, index) => (
              <li key={index}>{req}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(jdData.preferredSkills) && jdData.preferredSkills.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-green-600 mb-3">Preferred Skills</h2>
          <div className="flex flex-wrap gap-2">
            {jdData.preferredSkills.map((skill, index) => (
              <span key={index} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default JDPreview;
