import React from 'react';

type TemplateOption = {
  id: string;
  name: string;
  description?: string;
};

interface ResumeTemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: { selectedTemplate: string; jdText: string; atsScore?: { score: number; matchedKeywords?: string[] } }) => void;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { id: 'ats-modern', name: 'ATS Modern' },
  { id: 'modern', name: 'Modern Professional' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'creative', name: 'Creative' },
  { id: 'classic', name: 'Classic' }
];

export default function ResumeTemplatePickerModal({ isOpen, onClose, onConfirm }: ResumeTemplatePickerModalProps) {
  const [selectedTemplate, setSelectedTemplate] = React.useState<string>('ats-modern');
  const [jdText, setJdText] = React.useState<string>('');
  const [atsLoading, setAtsLoading] = React.useState<boolean>(false);
  const [atsError, setAtsError] = React.useState<string | null>(null);
  const [atsScore, setAtsScore] = React.useState<{ score: number; matchedKeywords?: string[] } | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    try {
      const storedTemplate = typeof window !== 'undefined' ? window.localStorage.getItem('selectedTemplate') : null;
      if (storedTemplate) setSelectedTemplate(storedTemplate);
      const storedResume = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
      const storedJD = typeof window !== 'undefined' ? (window.localStorage.getItem('inputJD') || window.localStorage.getItem('jdText')) : null;
      if (storedJD) setJdText(storedJD);
      // Kick off ATS calculation if data exists
      if (storedResume) {
        void calculateATS(JSON.parse(storedResume), storedJD || '');
      }
    } catch (_) {
      // ignore
    }
  }, [isOpen]);

  const calculateATS = async (resumeData: any, jd: string) => {
    try {
      setAtsLoading(true);
      setAtsError(null);
      const res = await fetch('/api/ats/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData, jdText: jd })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to calculate ATS score');
      }
      setAtsScore({ score: data.data?.score || 0, matchedKeywords: data.data?.matchedKeywords || [] });
    } catch (e) {
      setAtsError(e instanceof Error ? e.message : 'ATS scoring failed');
      setAtsScore(null);
    } finally {
      setAtsLoading(false);
    }
  };

  // Debounce ATS calls on JD edits
  React.useEffect(() => {
    if (!isOpen) return;
    const handle = setTimeout(() => {
      try {
        const storedResume = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
        if (storedResume) void calculateATS(JSON.parse(storedResume), jdText || '');
      } catch (_) {
        // ignore
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [jdText, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold">Choose Resume Template & Review ATS Fit</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="text-sm font-medium mb-2">Templates</div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {TEMPLATE_OPTIONS.map(t => (
                <label key={t.id} className={`flex items-start gap-2 rounded border p-2 cursor-pointer ${selectedTemplate === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" name="template" value={t.id} checked={selectedTemplate === t.id} onChange={() => setSelectedTemplate(t.id)} className="mt-1" />
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm font-medium mb-2">Job Description</div>
            <textarea
              value={jdText}
              onChange={e => setJdText(e.target.value)}
              className="w-full h-40 resize-vertical rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste or edit the job description here"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm">
                {atsLoading && <span className="text-gray-600">Calculating ATS score…</span>}
                {!atsLoading && atsError && <span className="text-red-600">{atsError}</span>}
                {!atsLoading && !atsError && atsScore && (
                  <span className={`font-medium ${atsScore.score >= 80 ? 'text-green-600' : atsScore.score >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                    ATS Score: {Math.round(atsScore.score)}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  try {
                    const storedResume = typeof window !== 'undefined' ? window.localStorage.getItem('resumeData') : null;
                    if (storedResume) void calculateATS(JSON.parse(storedResume), jdText || '');
                  } catch (_) {}
                }}
                className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
          <button
            onClick={() => onConfirm({ selectedTemplate, jdText, atsScore: atsScore || undefined })}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Use This Template
          </button>
        </div>
      </div>
    </div>
  );
}


