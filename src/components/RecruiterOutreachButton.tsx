import React, { useEffect, useRef, useState } from 'react';
// import ResumeTemplatePickerModal from './ResumeTemplatePickerModal';
import ResumePreview from './ResumePreview';
import { generatePDFFromDom } from '@/lib/pdf-utils';
import RecruiterSearchGuidance from './RecruiterSearchGuidance';

interface RecruiterOutreachButtonProps {
  jobTitle: string;
  company: string;
  location?: string;
  candidateName?: string;
}

const RecruiterOutreachButton: React.FC<RecruiterOutreachButtonProps> = ({ jobTitle, company, location, candidateName }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ contact: any; templates: any; mailto: string }>>([]);
  const [derivedName, setDerivedName] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [gmailAuthenticated, setGmailAuthenticated] = useState(false);
  const [gmailTokens, setGmailTokens] = useState<any>(null);
  const [pendingGmailContext, setPendingGmailContext] = useState<null | { mailtoUrl: string; contact: any; templates: any }>(null);
  const [showPreviewOverlay, setShowPreviewOverlay] = useState(false);
  const [overlayTemplate, setOverlayTemplate] = useState<string>('ats-modern');
  const [overlayJD, setOverlayJD] = useState<string>('');
  const [overlayAts, setOverlayAts] = useState<{ score: number; matchedKeywords?: string[] } | null>(null);
  const [overlayResume, setOverlayResume] = useState<any | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (candidateName) return;
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        const fullName = parsed?.personalInfo?.fullName;
        if (typeof fullName === 'string' && fullName.trim()) {
          setDerivedName(fullName.trim());
        }
      }
    } catch (_) {
      // ignore parse errors
    }
  }, [candidateName]);

  // Check for stored tokens on component mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Load stored tokens from localStorage
    try {
      const storedTokens = localStorage.getItem('gmailTokens');
      if (storedTokens) {
        const tokens = JSON.parse(storedTokens);
        setGmailTokens(tokens);
        setGmailAuthenticated(true);
        console.log('Gmail tokens loaded from localStorage');
      }
    } catch (error) {
      console.error('Error loading stored Gmail tokens:', error);
    }
  }, []);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const effectiveName = candidateName || derivedName || 'Candidate';
      
      // Get resume data from localStorage
      let resumeData = null;
      try {
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
        if (stored) {
          resumeData = JSON.parse(stored);
        }
      } catch (e) {
        console.log('Could not parse resume data:', e);
      }
      
      // Resume PDF will be generated only when opening Gmail with attachment
      
      const resp = await fetch('/api/recruiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jobTitle, 
          company, 
          location, 
          candidateName: effectiveName,
          resumeData 
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch contacts');
      }
      setResults(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  // Enrich resume with JS-specific keywords from JD (simple heuristic merge)
  const enrichResumeWithJsKeywords = (resume: any, jd: string) => {
    const jsKeywords = [
      'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express', 'Redux', 'Jest', 'Cypress',
      'HTML', 'CSS', 'Tailwind', 'REST', 'GraphQL', 'Webpack', 'Vite', 'Babel', 'ES6', 'CI/CD'
    ];
    const present = new Set((resume.skills || []).map((s: string) => s.toLowerCase()));
    const toAdd: string[] = [];
    const hay = (jd || '').toLowerCase();
    jsKeywords.forEach(k => { if (hay.includes(k.toLowerCase()) && !present.has(k.toLowerCase())) toAdd.push(k); });
    const merged = { ...resume, skills: Array.from(new Set([...(resume.skills || []), ...toAdd])) };
    return merged;
  };

  const recalcOverlayATS = async (resume: any, jd: string) => {
    try {
      setOverlayBusy(true);
      const res = await fetch('/api/ats/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData: resume, jdText: jd || '' })
      });
      const data = await res.json();
      if (res.ok && data.success) setOverlayAts({ score: data.data?.score || 0, matchedKeywords: data.data?.matchedKeywords || [] });
      else setOverlayAts(null);
    } catch (_) {
      setOverlayAts(null);
    } finally {
      setOverlayBusy(false);
    }
  };

  const handleGmailAuth = async () => {
    try {
      const response = await fetch('/api/gmail/auth');
      const data = await response.json();
      
      if (data.success) {
        // Open Gmail OAuth in popup window
        const popup = window.open(
          data.authUrl, 
          'gmailAuth', 
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );
        
        // Listen for message from popup window
        const handleMessage = (event: MessageEvent) => {
          // Verify origin for security
          if (event.origin !== window.location.origin) return;
          
          if (event.data?.type === 'gmail-auth-success') {
            // Authentication successful - update state
            try {
              const tokensJson = decodeURIComponent(event.data.tokens);
              const tokens = JSON.parse(tokensJson);
              localStorage.setItem('gmailTokens', tokensJson);
              setGmailTokens(tokens);
              setGmailAuthenticated(true);
              // Stop monitoring popup
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              // Show success message
              alert('✅ Gmail authentication successful! You can now create drafts.');
            } catch (e) {
              console.error('Failed to parse tokens:', e);
              alert('⚠️ Authentication completed but failed to save tokens. Please try again.');
            }
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Monitor popup for completion (fallback if message doesn't arrive)
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            // Check if authentication was successful
            const tokens = localStorage.getItem('gmailTokens');
            if (tokens) {
              try {
                setGmailTokens(JSON.parse(tokens));
                setGmailAuthenticated(true);
                alert('✅ Gmail authentication successful! You can now create drafts.');
              } catch (e) {
                console.error('Failed to parse tokens:', e);
              }
            }
          }
        }, 1000);
        
        // Show success message
        alert('✅ Gmail authentication popup opened. Complete the OAuth flow in the popup window.');
      }
    } catch (e) {
      console.error('Gmail auth error:', e);
      alert('Failed to authenticate with Gmail');
    }
  };

  const handleLinkedInOpen = (contact: any, templates: any) => {
    try {
      // Get resume data for personalized message
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
      const resumeData = stored ? JSON.parse(stored) : null;
      
      // Create personalized LinkedIn message
      const personalizedMessage = templates.linkedinMessage;
      
      // Show the pre-drafted message and open LinkedIn
      alert(`💼 LinkedIn Message Ready!\n\n📝 Pre-drafted message:\n\n"${personalizedMessage}"\n\n\nClick OK to open LinkedIn profile and send this message.`);
      
      // Open LinkedIn profile
      const linkedinUrl = contact.linkedinUrl;
      window.open(linkedinUrl, '_blank');
      
    } catch (e) {
      console.error('Error opening LinkedIn:', e);
      // Fallback to regular LinkedIn opening
      window.open(contact.linkedinUrl, '_blank');
    }
  };

  const handleOpenGmailWithAttachment = async (mailtoUrl: string, contact: any, templates: any) => {
    // Open inline preview overlay using existing UI
    setPendingGmailContext({ mailtoUrl, contact, templates });
    try {
      const storedResume = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
      const storedTemplate = typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null;
      // Prefer JD from the recruiter result (job-specific)
      const resultJD = (templates && (templates.jobDescription || templates.jdText || templates.job?.description)) || '';
      const storedJD = resultJD || (typeof window !== 'undefined' ? (window.localStorage.getItem('inputJD') || window.localStorage.getItem('jdText')) : null);
      if (storedTemplate) setOverlayTemplate(storedTemplate);
      if (storedJD) setOverlayJD(storedJD as string);
      if (storedResume) {
        const parsed = JSON.parse(storedResume);
        const enriched = enrichResumeWithJsKeywords(parsed, (storedJD as string) || '');
        setOverlayResume(enriched);
        void recalcOverlayATS(enriched, (storedJD as string) || '');
      }
    } catch (_) {}
    setShowPreviewOverlay(true);
  };

  const proceedGmailWithTemplate = async () => {
    if (!pendingGmailContext) return;
    const { mailtoUrl, contact, templates } = pendingGmailContext;
    
    // Check if Gmail is authenticated
    if (!gmailTokens) {
      alert('❌ Gmail authentication required. Please authenticate with Gmail first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Get resume data from localStorage
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
      if (!stored) {
        alert('No resume data found. Please create a resume first.');
        setLoading(false);
        return;
      }

      const resumeData = overlayResume || JSON.parse(stored);
      const selectedTemplate = overlayTemplate || (typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null) || 'modern';
      try { if (typeof window !== 'undefined') window.localStorage.setItem('selectedTemplate', selectedTemplate); } catch (_) {}
      try { if (typeof window !== 'undefined') window.localStorage.setItem('inputJD', overlayJD || ''); } catch (_) {}

      // Generate DOM-based PDF to match jdBuilder exactly by cloning into an offscreen A4 sandbox
      let pdfBase64: string | null = null;
      try {
        console.log('Starting PDF generation with template:', overlayTemplate);
        await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
        
        // Prefer the actual ResumePreview ref if available; fallback to querySelector
        let source = previewRef.current as HTMLElement | null;
        if (!source) {
          // allow one more paint
          await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
          source = document.querySelector('.print-optimized') as HTMLElement | null;
        }
        console.log('Looking for .print-optimized element, found:', source);
        console.log('All .print-optimized elements:', document.querySelectorAll('.print-optimized'));
        if (source) {
          console.log('Found preview element, cloning to sandbox');
          // Create offscreen sandbox with exact A4 size to avoid modal/overlay styles affecting render
          const sandbox = document.createElement('div');
          sandbox.setAttribute('data-pdf-sandbox', 'true');
          sandbox.style.position = 'fixed';
          sandbox.style.left = '-10000px';
          sandbox.style.top = '0';
          sandbox.style.width = '210mm';
          sandbox.style.minHeight = '297mm';
          sandbox.style.background = '#ffffff';
          sandbox.style.zIndex = '-1';
          sandbox.style.padding = '0';
          sandbox.style.margin = '0';
          sandbox.style.boxShadow = 'none';
          
          const cloned = source.cloneNode(true) as HTMLElement;
          // Ensure cloned preview keeps print-optimized sizing and remove any transforms from overlay
          cloned.style.transform = 'none';
          cloned.style.boxShadow = 'none';
          cloned.style.background = '#ffffff';
          sandbox.appendChild(cloned);
          document.body.appendChild(sandbox);

          console.log('Generating PDF from sandbox');
          const arrayBufferOrName = await generatePDFFromDom(sandbox as unknown as HTMLElement, '__BUFFER_ONLY__' as any);
          if (arrayBufferOrName && (arrayBufferOrName as any).byteLength !== undefined) {
            const ab = arrayBufferOrName as unknown as ArrayBuffer;
            pdfBase64 = Buffer.from(new Uint8Array(ab)).toString('base64');
            console.log('PDF generated successfully, size:', ab.byteLength);
          }

          // Cleanup
          document.body.removeChild(sandbox);
        } else {
          console.log('No preview element found');
        }
      } catch (e) {
        console.error('PDF generation error:', e);
      }

      // Use Gmail API to create draft with resume attached
      const response = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.email,
          subject: templates.subject,
          text: templates.emailBody,
          resumeData,
          tokens: gmailTokens,
          selectedTemplate,
          jdText: overlayJD || '',
          pdfBase64
        })
      });

      const data = await response.json();
      if (data.success) {
        const messageId = data.messageId;
        if (messageId) {
          const composeUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
          window.open(composeUrl, '_blank');
        } else {
          window.open('https://mail.google.com/mail/u/0/#drafts', '_blank');
        }
      } else {
        throw new Error(data.error || 'Failed to create Gmail draft');
      }
    } catch (e) {
      console.error('Error opening Gmail with attachment:', e);
      setError(e instanceof Error ? e.message : 'Failed to create Gmail draft');
      window.open(mailtoUrl, '_blank');
    } finally {
      setLoading(false);
      setPendingGmailContext(null);
      setShowPreviewOverlay(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="h-12 flex items-center">
        <button
          onClick={handleClick}
          disabled={loading}
          className={`px-6 py-3 rounded-lg text-white font-semibold text-lg ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-lg hover:shadow-xl transition-all duration-200'}`}
        >
          {loading ? 'Finding recruiter contacts…' : 'Find Recruiter & Outreach'}
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {results.length > 0 && (
        <div className="border rounded-lg p-3 bg-white">
          <div className="font-semibold mb-2">Contacts</div>
          <div className="space-y-3">
            {results.map((r, idx) => {
              // Check if this is a domain not found result
              if (r.contact.source === 'domain-not-found') {
                return (
                  <div key={idx} className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                    <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Company Domain Not Found</h3>
                    <p className="text-yellow-800 text-sm mb-3">
                      We couldn't find a domain for <strong>{company}</strong>. This might be because:
                    </p>
                    <ul className="text-yellow-800 text-sm space-y-1 mb-3">
                      <li>• The company name is misspelled</li>
                      <li>• The company doesn't have a public website</li>
                      <li>• The company uses a different domain structure</li>
                    </ul>
                    <p className="text-yellow-800 text-sm">
                      Try searching manually: <code className="bg-yellow-100 px-2 py-1 rounded">site:linkedin.com/in "{company}" recruiter</code>
                    </p>
                  </div>
                );
              }
              
              // Regular contact display (no more sample contacts)
              return (
                <div key={idx} className="border rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm text-gray-800">
                      <span className="font-semibold">{r.contact.name}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {(r.contact.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {r.contact.title} @ {r.contact.company}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    Source: {r.contact.source}
                  </div>
                  <div className="text-xs text-blue-700 mb-3">
                    {r.contact.linkedinUrl && (
                      <a href={r.contact.linkedinUrl} target="_blank" rel="noreferrer" className="underline">LinkedIn</a>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {r.mailto ? (
                      <button 
                        onClick={() => gmailAuthenticated ? handleOpenGmailWithAttachment(r.mailto, r.contact, r.templates) : handleGmailAuth()}
                        className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                      >
                        {gmailAuthenticated ? 'Open Gmail' : 'Authenticate Gmail'}
                      </button>
                    ) : (
                      <div className="px-3 py-1 rounded bg-gray-400 text-white text-sm cursor-not-allowed" title="Email addresses not available from Hunter.io API">
                        Email Not Available
                      </div>
                    )}
                    {!gmailAuthenticated && (
                      <button 
                        onClick={handleGmailAuth}
                        className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        Connect Gmail
                      </button>
                    )}
                    {gmailAuthenticated && (
                      <div className="px-3 py-1 rounded bg-green-100 text-green-700 text-sm">
                        ✅ Gmail Connected
                      </div>
                    )}
                    {r.contact.linkedinUrl && (
                      <button 
                        onClick={() => handleLinkedInOpen(r.contact, r.templates)}
                        className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 relative"
                        title="LinkedIn Messaging API requires partner approval - currently shows profile with pre-drafted message"
                      >
                        LinkedIn
                      </button>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer text-gray-600 hover:text-gray-800">► Preview Messages</summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Subject</div>
                        <div className="text-sm font-medium bg-gray-50 p-2 rounded">{r.templates.subject}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Email Body</div>
                        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded text-gray-700">{r.templates.emailBody}</pre>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">LinkedIn Message</div>
                        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded text-gray-700">{r.templates.linkedinMessage}</pre>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showPreviewOverlay && overlayResume && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl rounded-md bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <select value={overlayTemplate} onChange={e => setOverlayTemplate(e.target.value)} className="border rounded px-2 py-1 text-sm">
                  <option value="ats-modern">ATS Modern</option>
                  <option value="modern">Modern Professional</option>
                  <option value="minimal">Minimal</option>
                  <option value="classic">Classic</option>
                  <option value="creative">Creative</option>
                </select>
                <div className="text-sm">
                  {overlayBusy ? 'Calculating ATS…' : overlayAts ? `ATS: ${Math.round(overlayAts.score)}` : 'ATS: —'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPreviewOverlay(false)} className="rounded px-3 py-1.5 text-sm hover:bg-gray-100">Cancel</button>
                <button onClick={proceedGmailWithTemplate} className="rounded bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700">Use & Draft</button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="border rounded p-3 overflow-auto">
                <div className="text-sm font-medium mb-2">Resume Preview</div>
                <div className="print-optimized">
                  <ResumePreview 
                    resumeData={overlayResume} 
                    selectedTemplate={overlayTemplate} 
                    atsScore={overlayAts ? { score: overlayAts.score, feedback: '', matchedKeywords: overlayAts.matchedKeywords || [] } : null}
                    keywordMatches={overlayAts?.matchedKeywords || []}
                    resumeType={"generated"}
                    extractedData={null}
                    uploadedFiles={{ resume: null, profile: null }}
                    previewRef={previewRef}
                    inputJD={overlayJD}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy modal disabled in favor of inline overlay */}

      {results.length === 0 && !loading && hasSearched && (
        <div className="border rounded-lg p-4 bg-gray-50 border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">🔍 No Recruiter Contacts Found</h3>
          <p className="text-gray-700 text-sm mb-3">
            We couldn't find any recruiter contacts for <strong>{company}</strong>. This could be because:
          </p>
          <ul className="text-gray-700 text-sm space-y-1 mb-3">
            <li>• The company doesn't have public recruiter information</li>
            <li>• The company uses different job titles for recruiters</li>
            <li>• The company's domain information isn't available</li>
            <li>• Email addresses may not be available in the Hunter.io API response</li>
          </ul>
          <p className="text-gray-700 text-sm">
            You can try searching manually on LinkedIn: <code className="bg-gray-100 px-2 py-1 rounded">site:linkedin.com/in "{company}" recruiter</code>
          </p>
        </div>
      )}
    </div>
  );
};

export default RecruiterOutreachButton;


