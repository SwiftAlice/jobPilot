import React from 'react';
import Link from 'next/link';
import JDBuilder from '../jdBuilder';

export default function JDBuilderPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Removed duplicated header and explicit spacer; only global Navigation from layout.tsx will render */}
      <div className="w-full flex justify-center">
        <div className="w-[85vw] max-w-[1400px] px-4 md:px-0 mt-6 md:mt-10 py-8">
          <div className="card p-4 md:p-6">
            <div className="text-center mb-6">
              <h1 className="heading text-3xl md:text-4xl font-extrabold text-gray-900">AI-Powered Resume & JD Builder</h1>
              <p className="text-sm md:text-base text-gray-600 mt-2">Create professional resumes and job descriptions with AI assistance</p>
            </div>
            <JDBuilder />
          </div>
        </div>
      </div>
    </div>
  );
}
