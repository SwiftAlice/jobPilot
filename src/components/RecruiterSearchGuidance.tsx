'use client';

import React, { useState } from 'react';

interface SearchQuery {
  query: string;
  url: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface RecruiterSearchGuidanceProps {
  company: string;
  jobTitle: string;
  location?: string;
  domain?: string | null;
}

export default function RecruiterSearchGuidance({ 
  company, 
  jobTitle, 
  location, 
  domain 
}: RecruiterSearchGuidanceProps) {
  const [foundContacts, setFoundContacts] = useState<Array<{
    name: string;
    title: string;
    email?: string;
    linkedinUrl?: string;
  }>>([]);

  const generateSearchQueries = (): SearchQuery[] => {
    const queries: SearchQuery[] = [];
    const companyVariations = [company];
    
    // Add domain-based variations if available
    if (domain) {
      const domainRoot = domain.split('.')[0];
      if (domainRoot && domainRoot !== company.toLowerCase()) {
        companyVariations.push(domainRoot);
      }
    }

    // High priority queries
    for (const companyVar of companyVariations) {
      queries.push({
        query: `site:linkedin.com/in "${companyVar}" recruiter`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" recruiter`)}`,
        description: `Find recruiters at ${companyVar}`,
        priority: 'high'
      });

      queries.push({
        query: `site:linkedin.com/in "${companyVar}" "talent acquisition"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" "talent acquisition"`)}`,
        description: `Find talent acquisition professionals at ${companyVar}`,
        priority: 'high'
      });

      queries.push({
        query: `site:linkedin.com/in "${companyVar}" "hiring manager"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${companyVar}" "hiring manager"`)}`,
        description: `Find hiring managers at ${companyVar}`,
        priority: 'high'
      });
    }

    // Medium priority queries
    if (location) {
      queries.push({
        query: `site:linkedin.com/in "${company}" recruiter "${location}"`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" recruiter "${location}"`)}`,
        description: `Find recruiters at ${company} in ${location}`,
        priority: 'medium'
      });
    }

    queries.push({
      query: `site:linkedin.com/in "${company}" "HR manager"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" "HR manager"`)}`,
      description: `Find HR managers at ${company}`,
      priority: 'medium'
    });

    // Low priority queries
    queries.push({
      query: `site:linkedin.com/in "${company}" "people ops"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" "people ops"`)}`,
      description: `Find people operations at ${company}`,
      priority: 'low'
    });

    return queries;
  };

  const searchQueries = generateSearchQueries();

  const addFoundContact = () => {
    const name = prompt('Enter the person\'s name:');
    const title = prompt('Enter their title:');
    const linkedinUrl = prompt('Enter their LinkedIn URL (optional):');
    
    if (name && title) {
      setFoundContacts(prev => [...prev, {
        name,
        title,
        linkedinUrl: linkedinUrl || undefined
      }]);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Company Domain Info */}
      {domain && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Company Domain Found</h3>
          <p className="text-blue-800">
            <strong>{company}</strong> → <code className="bg-blue-100 px-2 py-1 rounded">{domain}</code>
          </p>
          <p className="text-sm text-blue-700 mt-2">
            This domain can be used with Hunter.io to find email addresses for contacts you discover.
          </p>
        </div>
      )}

      {/* Search Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">How to Find Recruiters & Hiring Managers</h3>
        <div className="space-y-3 text-sm text-gray-700">
          <p><strong>Step 1:</strong> Click on the search links below to find LinkedIn profiles</p>
          <p><strong>Step 2:</strong> Look for profiles with titles like "Recruiter", "Talent Acquisition", "Hiring Manager", etc.</p>
          <p><strong>Step 3:</strong> Add the contacts you find using the "Add Contact" button</p>
          <p><strong>Step 4:</strong> Use Hunter.io to find their email addresses (if you have a Hunter.io account)</p>
        </div>
      </div>

      {/* Search Queries */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">Optimized LinkedIn Search Queries</h3>
        
        {/* High Priority */}
        <div>
          <h4 className="font-medium text-red-700 mb-2">🔥 High Priority Searches</h4>
          <div className="space-y-2">
            {searchQueries.filter(q => q.priority === 'high').map((query, index) => (
              <div key={index} className={`border rounded-lg p-3 ${getPriorityColor(query.priority)}`}>
                <p className="font-medium">{query.description}</p>
                <p className="text-sm opacity-75 mb-2">Query: <code>{query.query}</code></p>
                <a 
                  href={query.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  🔍 Search on Google
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Medium Priority */}
        <div>
          <h4 className="font-medium text-yellow-700 mb-2">⚡ Medium Priority Searches</h4>
          <div className="space-y-2">
            {searchQueries.filter(q => q.priority === 'medium').map((query, index) => (
              <div key={index} className={`border rounded-lg p-3 ${getPriorityColor(query.priority)}`}>
                <p className="font-medium">{query.description}</p>
                <p className="text-sm opacity-75 mb-2">Query: <code>{query.query}</code></p>
                <a 
                  href={query.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  🔍 Search on Google
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Low Priority */}
        <div>
          <h4 className="font-medium text-green-700 mb-2">💡 Additional Searches</h4>
          <div className="space-y-2">
            {searchQueries.filter(q => q.priority === 'low').map((query, index) => (
              <div key={index} className={`border rounded-lg p-3 ${getPriorityColor(query.priority)}`}>
                <p className="font-medium">{query.description}</p>
                <p className="text-sm opacity-75 mb-2">Query: <code>{query.query}</code></p>
                <a 
                  href={query.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  🔍 Search on Google
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Contacts Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Found Contacts</h3>
          <button
            onClick={addFoundContact}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            + Add Contact
          </button>
        </div>

        {foundContacts.length === 0 ? (
          <p className="text-gray-500 text-sm">No contacts added yet. Use the search links above to find recruiters and add them here.</p>
        ) : (
          <div className="space-y-3">
            {foundContacts.map((contact, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{contact.name}</h4>
                    <p className="text-sm text-gray-600">{contact.title}</p>
                    {contact.linkedinUrl && (
                      <a 
                        href={contact.linkedinUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        LinkedIn Profile
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => setFoundContacts(prev => prev.filter((_, i) => i !== index))}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hunter.io Email Finding */}
      {domain && foundContacts.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-2">Find Email Addresses</h3>
          <p className="text-purple-800 text-sm mb-3">
            Use Hunter.io to find email addresses for the contacts above:
          </p>
          <div className="space-y-2">
            {foundContacts.map((contact, index) => (
              <div key={index} className="bg-white border border-purple-200 rounded p-2">
                <p className="text-sm">
                  <strong>{contact.name}</strong> at <code>{domain}</code>
                </p>
                <p className="text-xs text-gray-600">
                  Hunter.io URL: <code>https://api.hunter.io/v2/email-finder?domain={domain}&full_name={encodeURIComponent(contact.name)}</code>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
