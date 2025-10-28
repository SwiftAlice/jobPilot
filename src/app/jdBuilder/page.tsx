import React from 'react';
import Link from 'next/link';
import JDBuilder from '../jdBuilder';

export default function JDBuilderPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header (themed, consistent across app) */}
      <header className="sticky top-0 z-50">
        <div className="container-page py-4">
          <div className="flex items-center justify-between h-16 rounded-xl bg-white/60 backdrop-blur-xl px-4 md:px-6">
            <Link href="/" className="flex items-center space-x-3">
              <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 p-1 flex items-center justify-center">
                <img src="/logo.svg" alt="JobPilot AI" width={1044} height={1044} />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="heading text-lg md:text-xl font-extrabold text-gray-900">
                  JobPilot <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-600">AI</span>
                </span>
                <span className="text-[10px] md:text-xs text-gray-500">Build · Tailor · Apply — on autopilot</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link href="/#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="/#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How it Works</Link>
              <Link href="/jobs" className="text-gray-600 hover:text-gray-900 transition-colors">Find Jobs</Link>
              <Link href="/jdBuilder" className="text-gray-600 hover:text-gray-900 transition-colors">Resume Builder</Link>
            </nav>

            <div className="flex items-center">
              <Link href="/jobs" className="px-5 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-blue-600 to-teal-600 shadow hover:shadow-md hover:translate-y-[-1px] active:translate-y-[0px] transition-all">
                Start Job Search
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* Explicit spacer below sticky header */}
      <div className="h-12 md:h-16" />

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
