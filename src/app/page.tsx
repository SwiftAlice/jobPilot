'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const [authUser, setAuthUser] = useState<{ email: string|null, name: string|null } | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        const user = data?.authenticated ? (data.user ?? null) : null;
        if (mounted) setAuthUser(user ? { email: user.email, name: user.name } : null);
      } catch {
        if (mounted) setAuthUser(null);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Main Hero Section, no header here anymore */}
      <section className="py-20 bg-white min-h-[calc(100vh-4rem)] flex items-center">
        <div className="container-page">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="heading text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
                Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-teal-500">AI Career Copilot</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl leading-relaxed">
                Craft a standout resume, tailor it to any JD with one click, and discover
                high-match roles — all in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/jdBuilder" className="px-6 md:px-8 py-3 md:py-4 text-base md:text-lg font-semibold text-white rounded-lg shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-indigo-600 to-teal-500">
                  Build my resume
                </Link>
                <Link href="/jobs" className="px-6 md:px-8 py-3 md:py-4 text-base md:text-lg font-semibold text-gray-800 bg-white border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-all">
                  Start Job Search
                </Link>
              </div>

              {/* Badges */}
              <div className="mt-8 flex flex-wrap gap-3">
                <div className="pill bg-white border border-gray-200 !rounded-full !py-2 !px-3 text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    98% users improved ATS score
                  </span>
                </div>
                <div className="pill bg-white border border-gray-200 !rounded-full !py-2 !px-3 text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-fuchsia-500"></span>
                    Auto-tailors to JD keywords
                  </span>
                </div>
                <div className="pill bg-white border border-gray-200 !rounded-full !py-2 !px-3 text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                    One-click Quick Apply
                  </span>
                </div>
              </div>
            </div>

            {/* Right column demo widgets */}
            <div className="hidden md:flex flex-col gap-6">
              {/* Profile summary card */}
              <div className="card p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="heading text-xl font-bold text-gray-900">Nancy Madan</h3>
                    <div className="text-sm text-gray-500 mt-1">iOS · React Native · AI Workflows</div>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">ATS 87</div>
                </div>

                <div className="grid md:grid-cols-3 gap-4 mt-6">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Experience</div>
                    <div className="text-sm text-gray-600 mt-2">7+ yrs · Lead</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Skills</div>
                    <div className="text-sm text-gray-600 mt-2">Swift, RN, GCP</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Impact</div>
                    <div className="text-sm text-gray-600 mt-2">+500k DAU</div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                    Tailored to: Sr iOS Engineer
                  </div>
                  <button className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">Improve</button>
                </div>
              </div>

              {/* Job match card */}
              <div className="card p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold">A</div>
                  <div>
                    <div className="font-semibold text-gray-900">Senior iOS Engineer</div>
                    <div className="text-sm text-gray-500">Acme · Bengaluru · Remote</div>
                  </div>
                  <div className="ml-auto">
                    <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">Match 92%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-4">
                  <span>₹45–55 LPA</span>
                  <span>·</span>
                  <span>Swift</span>
                  <span>·</span>
                  <span>MVVM</span>
                  <span>·</span>
                  <span>CI/CD</span>
                </div>

                <div className="mt-4 flex justify-end">
                  <button className="px-4 py-2 rounded-md bg-white border border-gray-200 text-gray-800 text-sm font-medium shadow-sm hover:shadow transition">Quick Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container-page">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything You Need to Succeed</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From resume building to job matching, we've got your entire career journey covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Smart Resume Builder</h3>
              <p className="text-gray-600">
                Create professional resumes tailored to specific job requirements with AI-powered suggestions.
              </p>
            </div>

            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Multi-Platform Job Search</h3>
              <p className="text-gray-600">
                Search across LinkedIn, Indeed, Naukri, and more job platforms with intelligent matching.
              </p>
            </div>

            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">AI-Powered Matching</h3>
              <p className="text-gray-600">
                Get accurate skill matching and compatibility scores to find your perfect role.
              </p>
            </div>

            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Direct Outreach</h3>
              <p className="text-gray-600">
                Connect with hiring managers via LinkedIn and email with pre-crafted messages.
              </p>
            </div>

            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">ATS Optimization</h3>
              <p className="text-gray-600">
                Ensure your resume passes Applicant Tracking Systems with smart keyword optimization.
              </p>
            </div>

            <div className="card p-8 text-center hover:shadow-lg transition-all hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Real-time Updates</h3>
              <p className="text-gray-600">
                Get instant notifications about new job matches and application status updates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="container-page">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get started in minutes and land your dream job in weeks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Build Your Profile</h3>
              <p className="text-gray-600">
                Create a professional resume with our AI-powered builder that optimizes for ATS systems.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Find Perfect Jobs</h3>
              <p className="text-gray-600">
                Our AI searches across multiple platforms and matches you with relevant opportunities.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Apply & Connect</h3>
              <p className="text-gray-600">
                Apply with confidence and connect directly with hiring managers to accelerate your success.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-teal-600">
        <div className="container-page">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-6">Ready to Land Your Dream Job?</h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who've accelerated their careers with JobPilot AI.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/jdBuilder" className="px-8 py-4 text-lg font-semibold text-blue-600 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all">
                Build Resume
              </Link>
              <Link href="/jobs" className="px-8 py-4 text-lg font-semibold text-white border-2 border-white rounded-lg hover:bg-white hover:text-blue-600 transition-all">
                Start Your Search
              </Link>
            </div>
          </div>
        </div>
      </section>

      
    </div>
  );
}
