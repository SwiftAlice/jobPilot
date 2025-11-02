import React from 'react';

interface JobsYouLikedProps {
  jobs: any[];
  onJobSelect?: (job: any) => void;
}

export default function JobsYouLiked({ jobs, onJobSelect }: JobsYouLikedProps) {
  if (!jobs.length) return null;
  return (
    <div className="shadow-lg bg-white rounded-xl px-8 py-6 min-w-[360px]">
      <h3 className="font-extrabold text-lg mb-2 inline-block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-600">Jobs You Liked</h3>
      <ul className="space-y-2">
        {jobs.map(job => (
          <li key={job.id} className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors">
            <button
              onClick={() => onJobSelect && onJobSelect(job)}
              className="text-green-700 hover:underline font-medium text-left w-full"
            >
              {job.title}
            </button>
            <div className="text-sm text-gray-500">{job.company} &mdash; {job.location}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
