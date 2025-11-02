'use client';

import React, { useState } from 'react';
import JobSearch from '@/components/JobSearch';
import RecruiterOutreachButton from '@/components/RecruiterOutreachButton';
import IntegrationDemo from '@/components/IntegrationDemo';
import { JobPosting } from '@/types/job-types';

export default function JobsPage() {
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [descriptionLoading, setDescriptionLoading] = useState(false);

  const handleJobSelect = async (job: JobPosting) => {
    setSelectedJob(job);
    
    // Check if description is missing or too short (likely from database)
    // Jobs from search results should have full descriptions, but saved jobs might not
    // Require at least 6 lines for a complete description
    const descriptionLines = job.description ? job.description.split('\n').filter(line => line.trim().length > 0).length : 0;
    const needsFetch = !job.description || descriptionLines < 6;
    const hasJobUrl = !!(job.url || (job as any).job_url);
    
    // Only fetch if description is missing/short AND we have a job URL
    // AND this looks like a saved job (has job_url field or missing typical search result fields)
    if (needsFetch && hasJobUrl && (!job.skills_required || job.skills_required.length === 0)) {
      setDescriptionLoading(true);
      try {
        const response = await fetch('/api/jobs/fetch-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            jobUrl: job.url || (job as any).job_url,
            source: job.source
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.description) {
            // Update the selected job with the fetched description
            setSelectedJob({
              ...job,
              description: data.description
            });
          }
        }
      } catch (error) {
        console.error('Error fetching description:', error);
      } finally {
        setDescriptionLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Decorative background orbs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-blue-500/20 blur-3xl" />
      <JobSearch onJobSelect={handleJobSelect} />

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-gray-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedJob.title}
                    </h2>
                    <div className="text-lg text-gray-600 mb-2">
                      {selectedJob.company}
                    </div>
                    <div className="text-gray-500">
                      {selectedJob.location}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Job Description</h3>
                    {descriptionLoading ? (
                      <div className="py-4 text-center text-gray-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm">Fetching full job description...</p>
                      </div>
                    ) : selectedJob.description ? (
                      (() => {
                        const desc = selectedJob.description;
                        // Check if description contains HTML tags
                        const isHtml = /<[a-z][\s\S]*>/i.test(desc);
                        
                        if (isHtml) {
                          return (
                            <div 
                              className="text-gray-700 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: desc }}
                              style={{
                                lineHeight: '1.6',
                              }}
                            />
                          );
                        } else {
                          // Plain text - format with line breaks
                          const formatted = desc
                            .split('\n')
                            .filter(line => line.trim())
                            .map((line, idx) => (
                              <p key={idx} className="mb-3">{line.trim()}</p>
                            ));
                          return (
                            <div className="text-gray-700" style={{ lineHeight: '1.6' }}>
                              {formatted}
                            </div>
                          );
                        }
                      })()
                    ) : (
                      <div className="text-gray-500 italic">
                        No description available for this job.
                      </div>
                    )}
                  </div>

                  {selectedJob.skills_required && Array.isArray(selectedJob.skills_required) && selectedJob.skills_required.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Required Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.skills_required.map((skill, index) => (
                          <span
                            key={index}
                            className={`px-3 py-1 rounded-full text-sm ${
                              selectedJob.skills_matched && Array.isArray(selectedJob.skills_matched) && selectedJob.skills_matched.includes(skill)
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedJob.skills_matched && Array.isArray(selectedJob.skills_matched) && selectedJob.skills_matched.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Matched Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.skills_matched.map((skill, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-800 border border-green-200"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedJob.salary && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Salary</h4>
                        <p className="text-gray-700">{selectedJob.salary}</p>
                      </div>
                    )}
                    
                    {selectedJob.experience_level && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Experience Level</h4>
                        <p className="text-gray-700">{selectedJob.experience_level}</p>
                      </div>
                    )}
                    
                    {selectedJob.employment_type && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Employment Type</h4>
                        <p className="text-gray-700">{selectedJob.employment_type}</p>
                      </div>
                    )}
                    
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Source</h4>
                      <p className="text-gray-700 capitalize">{selectedJob.source}</p>
                    </div>
                  </div>

                  {/* Match Score - Fixed at top */}
                  {selectedJob.match_score !== undefined && (
                    <div className="mb-4">
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                        Match Score: {(selectedJob.match_score * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}

                  {/* Buttons - Fixed height container */}
                  <div className="flex gap-3 items-start pt-6 border-t">
                    <div className="flex-1">
                      <RecruiterOutreachButton
                        jobTitle={selectedJob.title}
                        company={selectedJob.company}
                        location={selectedJob.location}
                      />
                    </div>
                    <div className="flex-shrink-0">
                      <a
                        href={selectedJob.url || (selectedJob as any).job_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-6 py-3 h-12 rounded-md text-white bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 transition-colors font-semibold"
                      >
                        Apply Now
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
