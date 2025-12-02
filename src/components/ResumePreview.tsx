import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText,
  Target,
  Mail,
  Link as LinkIcon,
  Linkedin,
  Instagram,
  Building2,
  Calendar,
  BookOpen
} from 'lucide-react';
import { ResumeData, ATSScore, UploadedFiles } from '@/types/resume-builder-types';

const MM_TO_PX = 3.779527559;
const PAGE_CONFIG = {
  widthMm: 210,
  heightMm: 297,
  topMarginMm: 5,
  bottomMarginMm: 16,
  sideMarginMm: 5,
};
const PAGE_CONTENT_WIDTH_MM = PAGE_CONFIG.widthMm - PAGE_CONFIG.sideMarginMm * 2;
const PAGE_CONTENT_HEIGHT_MM =
  PAGE_CONFIG.heightMm - PAGE_CONFIG.topMarginMm - PAGE_CONFIG.bottomMarginMm;
const PAGE_CONTENT_HEIGHT_PX = PAGE_CONTENT_HEIGHT_MM * MM_TO_PX;
const PAGE_BOTTOM_MARGIN_PX = PAGE_CONFIG.bottomMarginMm * MM_TO_PX;

const parseSkillDivision = (skill: string) => {
  if (!skill) return { heading: '', details: '' };
  const delimiters = [':', ' - ', ' — ', '–', '-'];
  for (const delimiter of delimiters) {
    if (skill.includes(delimiter)) {
      const [heading, ...rest] = skill.split(delimiter);
      return {
        heading: heading.trim(),
        details: rest.join(delimiter).trim(),
      };
    }
  }
  return { heading: '', details: skill.trim() };
};

// Helper to convert SVG icon to image data URL
const iconToDataUrl = async (IconComponent: React.ComponentType<any>, size: number, color: string): Promise<string> => {
  // Create a temporary div to render the icon off-screen
  // Using -9999px to hide it while we extract the SVG (this is a common technique)
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '-9999px';
  tempDiv.style.width = `${size}px`;
  tempDiv.style.height = `${size}px`;
  document.body.appendChild(tempDiv);
  
  // Render the icon using React
  const ReactDOM = require('react-dom/client');
  const root = ReactDOM.createRoot(tempDiv);
  root.render(React.createElement(IconComponent, { size, color, style: { color } }));
  
  // Wait for render and extract SVG
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      const svg = tempDiv.querySelector('svg') as SVGElement;
      if (svg) {
        // Clone and prepare SVG
        const svgClone = svg.cloneNode(true) as SVGElement;
        svgClone.setAttribute('width', String(size));
        svgClone.setAttribute('height', String(size));
        svgClone.setAttribute('viewBox', '0 0 24 24'); // Force viewBox to remove any padding
        svgClone.style.margin = '0';
        svgClone.style.padding = '0';
        svgClone.style.display = 'block';
        
        // Apply color to paths
        const paths = svgClone.querySelectorAll('path');
        paths.forEach((path) => {
          const pathEl = path as SVGPathElement;
          const fill = pathEl.getAttribute('fill');
          const stroke = pathEl.getAttribute('stroke');
          const strokeWidth = pathEl.getAttribute('stroke-width');
          
          if (strokeWidth && (stroke === 'currentColor' || stroke === 'none' || !stroke)) {
            pathEl.setAttribute('stroke', color);
            if (!fill || fill === 'currentColor') {
              pathEl.setAttribute('fill', 'none');
            }
          } else if (fill === 'currentColor' || fill === 'none' || !fill) {
            pathEl.setAttribute('fill', color);
          }
        });
        
        const svgString = new XMLSerializer().serializeToString(svgClone);
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
        document.body.removeChild(tempDiv);
        resolve(dataUrl);
      } else {
        document.body.removeChild(tempDiv);
        resolve('');
      }
    }, 50);
  });
};

// Component to render text with bold formatting (markdown-style **bold**)
const FormattedText: React.FC<{ text: string | undefined | null; className?: string; style?: React.CSSProperties }> = ({ text, className, style }) => {
  // Handle undefined, null, or empty text
  if (!text) {
    return <span className={className} style={style}></span>;
  }
  
  // Parse text and split by **bold** markers
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return (
    <span className={className} style={style}>
      {parts.map((part, index) => {
        // Check if this part is bold (wrapped in **)
        if (part.startsWith('**') && part.endsWith('**')) {
          // Remove the ** markers and render as bold
          const boldText = part.slice(2, -2);
          return <strong key={index}>{boldText}</strong>;
        }
        // Regular text
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};

// Simple text-based icon component - no SVG, just Unicode symbols
const IconImage: React.FC<{ 
  icon: React.ComponentType<any>; 
  size: number; 
  color: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ icon: IconComponent, size, color, className, style }) => {
  // Map icon types to Unicode symbols
  const iconName = IconComponent.name || '';
  let symbol = '•';
  
  if (iconName.includes('Mail')) {
    symbol = '✉';
  } else if (iconName.includes('Phone') || iconName.includes('Instagram')) {
    symbol = '📱';
  } else if (iconName.includes('Linkedin')) {
    symbol = 'in';
  } else if (iconName.includes('Link')) {
    symbol = '🔗';
  } else if (iconName.includes('Building')) {
    symbol = '🏢';
  } else if (iconName.includes('Calendar')) {
    symbol = '📅';
  }
  
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: `${size}px`,
        color: color,
        lineHeight: 1,
        verticalAlign: 'middle',
        margin: 0,
        padding: 0,
        ...style
      }}
      className={className}
    >
      {symbol}
    </span>
  );
};

type ContactItem = { label: string; href?: string; isPortfolio?: boolean };

const getWebsiteHref = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const extractExperienceBadge = (text?: string | null): string | null => {
  if (!text) return null;
  const match = text.match(/(\d{1,2}\+?)\s*(?:years|yrs?|yoe)/i);
  if (match) {
    return `${match[1]} YOE`;
  }
  return null;
};

// Helper function to format date from YYYY-MM to MM/YYYY
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const month = parts[1];
    return `${month}/${year}`;
  }
  return dateString;
};

// Common helper function to format dates for all sections (handles single dates, date ranges, and just years)
const formatDateDisplay = (dateString: string): string => {
  if (!dateString) return '';
  
  // Check if it's a date range (e.g., "2011-06 - 2015-06" or "06/2011 - 06/2015")
  if (dateString.includes(' - ')) {
    const [startDate, endDate] = dateString.split(' - ');
    // If already in MM/YYYY format, return as-is
    if (startDate.includes('/') && endDate.includes('/')) {
      return `${startDate.trim()} - ${endDate.trim()}`;
    }
    // Otherwise convert from YYYY-MM to MM/YYYY
    const formattedStart = formatDate(startDate.trim());
    const formattedEnd = formatDate(endDate.trim());
    return `${formattedStart} - ${formattedEnd}`;
  }
  
  // If already in MM/YYYY format, return as-is
  if (dateString.includes('/') && dateString.match(/^\d{1,2}\/\d{4}$/)) {
    return dateString;
  }
  
  // Handle single date YYYY-MM
  if (dateString.includes('-') && dateString.match(/^\d{4}-\d{2}$/)) {
    return formatDate(dateString);
  }
  
  // Handle just year (YYYY)
  if (dateString.match(/^\d{4}$/)) {
    return `01/${dateString}`;
  }
  
  return dateString;
};

interface ResumePreviewProps {
  resumeData: ResumeData;
  selectedTemplate: string;
  atsScore: ATSScore | null;
  keywordMatches: string[];
  resumeType: string;
  extractedData: ResumeData | null;
  uploadedFiles: UploadedFiles;
  previewRef: React.RefObject<HTMLDivElement | null>;
  inputJD?: string;
  editable?: boolean;
  onResumeDataChange?: (newResumeData: ResumeData) => void;
  onSectionClick?: (section: string, index?: number) => void;
  onProfileUpload?: (file: File) => void;
}

const ResumePreview: React.FC<ResumePreviewProps> = ({
  resumeData,
  selectedTemplate,
  atsScore,
  keywordMatches,
  resumeType,
  extractedData,
  uploadedFiles,
  previewRef,
  inputJD,
  editable = false,
  onResumeDataChange,
  onSectionClick,
  onProfileUpload
}) => {
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    if (uploadedFiles.profile) {
      objectUrl = URL.createObjectURL(uploadedFiles.profile);
      setProfileImageSrc(objectUrl);
    } else if (resumeData.personalInfo.profileImageDataUrl) {
      setProfileImageSrc(resumeData.personalInfo.profileImageDataUrl);
    } else {
      setProfileImageSrc(null);
    }
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [uploadedFiles.profile, resumeData.personalInfo.profileImageDataUrl]);
  // Debug: Log editable and onSectionClick (only when JD is present)
  if (inputJD && inputJD.trim()) {
    console.log('ResumePreview - editable:', editable);
    console.log('ResumePreview - onSectionClick:', !!onSectionClick);
  console.log('=== RESUMEPREVIEW RENDER ===');
  console.log('ResumePreview - ATS Score:', atsScore);
  console.log('ResumePreview - ATS Score Value:', atsScore?.score);
  console.log('ResumePreview - Keyword Matches:', keywordMatches);
  console.log('ResumePreview - Resume Type:', resumeType);
  console.log('ResumePreview - Resume Skills:', resumeData.skills);
  console.log('ResumePreview - Input JD:', inputJD);
  console.log('ResumePreview - Timestamp:', new Date().toLocaleTimeString());
  console.log('=== RESUMEPREVIEW RENDER END ===');
  }
  
  // Content ref for measuring total height
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(1);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [totalContentHeightPx, setTotalContentHeightPx] = useState(0);
  
  useEffect(() => {
    const calculatePages = () => {
      if (!contentRef.current) return;
      
      const permissibleHeightPx = PAGE_CONTENT_HEIGHT_PX;
        const containerRect = contentRef.current.getBoundingClientRect();
      const breakableElements = Array.from(
        contentRef.current.querySelectorAll('[data-avoid-break]')
      ) as HTMLElement[];
      
      const breakPositions: number[] = [0];
      let currentPageStart = 0;
      let currentPageEnd = currentPageStart + permissibleHeightPx;
      const minAdvancePx = 4; // avoid duplicate/zero-height pages
      
      const measuredElements = breakableElements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const elementTop =
            rect.top - containerRect.top + contentRef.current!.scrollTop;
          const elementBottom = elementTop + rect.height;
          return { top: elementTop, bottom: elementBottom, height: rect.height };
        })
        .sort((a, b) => a.top - b.top);
      
      measuredElements.forEach(({ top, bottom, height }) => {
        const elementTooTall = height >= permissibleHeightPx - minAdvancePx;
        if (elementTooTall) {
          return;
        }
        
        if (bottom > currentPageEnd) {
          const lastBreak = breakPositions[breakPositions.length - 1];
          const safeBreak = Math.max(top, lastBreak + minAdvancePx);
          if (safeBreak - lastBreak >= minAdvancePx) {
            breakPositions.push(safeBreak);
            currentPageStart = safeBreak;
            currentPageEnd = currentPageStart + permissibleHeightPx;
            }
          }
        });
        
        const contentHeight = contentRef.current.scrollHeight;
      while (
        breakPositions[breakPositions.length - 1] + permissibleHeightPx <
        contentHeight - minAdvancePx
      ) {
        const nextStart =
          breakPositions[breakPositions.length - 1] + permissibleHeightPx;
        breakPositions.push(nextStart);
      }
      
      setTotalContentHeightPx(contentHeight);
      setNumPages(breakPositions.length);
      setPageBreaks(breakPositions);
        
      console.log(`✓ Page calc: height=${contentHeight}px, permissible=${permissibleHeightPx}px, pages=${breakPositions.length}`);
    };
    
    const timer = setTimeout(calculatePages, 100);
    return () => clearTimeout(timer);
  }, [resumeData, selectedTemplate]);
  
  // Handler for contentEditable changes
  const handleContentChange = (field: string, value: string, index?: number) => {
    if (!editable || !onResumeDataChange) return;
    
    const newResumeData = { ...resumeData };
    
    if (field.startsWith('personalInfo.')) {
      const personalField = field.replace('personalInfo.', '');
      newResumeData.personalInfo = {
        ...newResumeData.personalInfo,
        [personalField]: value
      };
    } else if (field.startsWith('experience.')) {
      const expField = field.replace('experience.', '');
      const expIndex = index ?? 0;
      newResumeData.experience = newResumeData.experience.map((exp, i) => 
        i === expIndex ? { ...exp, [expField]: value } : exp
      );
    } else if (field.startsWith('experience.description.')) {
      const descIndex = parseInt(field.split('.')[2]);
      const expIndex = index ?? 0;
      newResumeData.experience = newResumeData.experience.map((exp, i) => 
        i === expIndex ? {
          ...exp,
          description: exp.description.map((desc, j) => j === descIndex ? value : desc)
        } : exp
      );
    } else if (field.startsWith('education.')) {
      const eduField = field.replace('education.', '');
      const eduIndex = index ?? 0;
      newResumeData.education = newResumeData.education.map((edu, i) => 
        i === eduIndex ? { ...edu, [eduField]: value } : edu
      );
    } else if (field.startsWith('projects.')) {
      const projField = field.replace('projects.', '');
      const projIndex = index ?? 0;
      newResumeData.projects = newResumeData.projects.map((proj, i) => 
        i === projIndex ? { ...proj, [projField]: value } : proj
      );
    } else if (field === 'skills') {
      // Skills are comma-separated, so we need to parse them
      const skillsArray = value.split('•').map(s => s.trim()).filter(s => s.length > 0);
      newResumeData.skills = skillsArray;
    }
    
    onResumeDataChange(newResumeData);
  };
  
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .editable-border {
          ${editable ? 'border-bottom: 1px dashed #cbd5e1;' : 'border-bottom: none;'}
        }
        .editable-border:focus {
          ${editable ? 'border-bottom: 1px dashed #0ea5e9;' : 'border-bottom: none;'}
        }
        /* Hide borders when PDF is being generated */
        body.pdf-exporting .editable-border,
        body.pdf-exporting .editable-border:focus,
        body.pdf-exporting [class*="editable-border"] {
          border: none !important;
          border-bottom: none !important;
          outline: none !important;
        }
        @media print {
          .editable-border,
          .editable-border:focus,
          [class*="editable-border"] {
            border: none !important;
            border-bottom: none !important;
            outline: none !important;
          }
        }
        @page {
          margin: 0;
        }
        /* Prevent page breaks inside content blocks */
        @media print {
          .print-optimized > div,
          .print-optimized section,
          .print-optimized .mb-4,
          .print-optimized .mb-6,
          .print-optimized .mb-2 {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-optimized li,
          .print-optimized .bullet-item,
          .print-optimized p {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-optimized h1,
          .print-optimized h2,
          .print-optimized h3 {
            page-break-after: avoid;
            break-after: avoid;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Prevent breaking experience entries */
          .print-optimized [class*="mb-1.5"] {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
        body.pdf-exporting .print-optimized > div,
        body.pdf-exporting .print-optimized section,
        body.pdf-exporting .print-optimized .mb-4,
        body.pdf-exporting .print-optimized .mb-6 {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        body.pdf-exporting .print-optimized li,
        body.pdf-exporting .print-optimized .bullet-item {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        body.pdf-exporting .print-optimized h1,
        body.pdf-exporting .print-optimized h2,
        body.pdf-exporting .print-optimized h3 {
          page-break-after: avoid;
          break-after: avoid;
        }
        .bullet-item {
          display: flex;
          align-items: flex-start;
          list-style: none;
        }
        .bullet-item .bullet {
          flex-shrink: 0;
          margin-top: 0.15em;
          line-height: 1.4;
        }
        .bullet-item .bullet-text {
          flex: 1;
          min-width: 0;
          word-wrap: break-word;
        }
        /* Page break indicators */
        .page-break-indicator {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: repeating-linear-gradient(
            to right,
            #ef4444 0px,
            #ef4444 10px,
            transparent 10px,
            transparent 20px
          );
          pointer-events: none;
          z-index: 10;
        }
        .page-break-indicator::before {
          content: 'Page ' attr(data-page);
          position: absolute;
          left: 50%;
          top: -18px;
          transform: translateX(-50%);
          background: #ef4444;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
        }
        /* Hide page break indicators when printing or generating PDF */
        body.pdf-exporting .page-break-indicator {
          display: none !important;
        }
        @media print {
          .page-break-indicator {
            display: none !important;
          }
        }
        /* Page containers for vertical stacking */
        .resume-pages-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          align-items: center;
          padding: 0;
          width: 100%;
          max-width: 210mm;
        }
        .resume-page {
          width: 210mm;
          height: auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          position: relative;
          overflow: hidden; /* Keep hidden for page-by-page view */
          page-break-after: always;
          margin: 0 auto;
        }
        .resume-page-content {
          width: 210mm; /* Full A4 width */
          padding: 0; /* No padding - padding is on inner content */
          position: relative;
          overflow: hidden; /* Keep hidden for clipping */
          box-sizing: border-box;
        }
        /* Hidden content source for measurement */
        .resume-content-source {
          position: absolute;
          visibility: hidden;
          padding: 0;
          width: ${PAGE_CONTENT_WIDTH_MM}mm;
          box-sizing: border-box;
          top: 0;
          left: 0;
          flex-row: center;
          justify-content: center;
          align-items: center;
        }
        /* Make hidden content visible during PDF generation */
        body.pdf-exporting .resume-content-source {
          visibility: visible !important;
          position: static !important;
        }
        /* Hide visible pages during PDF generation */
        body.pdf-exporting .resume-pages-container {
          display: none !important;
        }
      `}} />
      <div className="w-full">
        {/* Hidden content for measuring total height and PDF generation */}
        <div 
          ref={(el) => {
            contentRef.current = el;
            if (previewRef && el) {
              (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }
          }}
          className={`resume-content-source resume-template-${selectedTemplate} print-optimized`}
          style={{
            fontFamily: 'Arial, Helvetica, sans-serif',
            lineHeight: '1.3',
            color: '#1a1a1a',
            fontSize: '10pt',
          }}
        >
          <ResumeContent 
            resumeData={resumeData}
            selectedTemplate={selectedTemplate}
            editable={editable}
            handleContentChange={handleContentChange}
            onResumeDataChange={onResumeDataChange}
            extractedData={extractedData}
            uploadedFiles={uploadedFiles}
            onSectionClick={onSectionClick}
            onProfileUpload={onProfileUpload}
            profileImageSrc={profileImageSrc}
          />
        </div>
        
        {/* Visible pages stacked vertically */}
        <div className="resume-pages-container">
          {Array.from({ length: numPages }).map((_, pageIndex) => {
            const mmToPx = 3.779527559;
            const availableHeightMm = 287; // 297mm - 5mm*2 (content height per page)
            const bottomMarginMm = 5; // Fixed 16mm bottom margin (MUST MATCH calculatePages)
            const permissibleHeightPx = availableHeightMm  * mmToPx; // ~1024px (MUST MATCH calculatePages)
            const topMarginPx = 5 * mmToPx; // 5mm top margin in pixels
            
            // Calculate where this page's content starts
            const computedStart =
              pageBreaks.length > pageIndex
                ? pageBreaks[pageIndex]
                : pageIndex * permissibleHeightPx;
            const nextBreak =
              pageBreaks.length > pageIndex + 1
                ? pageBreaks[pageIndex + 1]
                : Math.min(
                    computedStart + permissibleHeightPx,
                    totalContentHeightPx
                  );
            const pageStart = Math.max(0, computedStart);
            const visibleHeight = Math.max(
              Math.min(nextBreak - pageStart, permissibleHeightPx),
              0
            );
            const contentHeightPx = visibleHeight;
            const remainingSpacePx = Math.max(
              0,
              permissibleHeightPx - contentHeightPx
            );
            const dynamicBottomMarginPx = Math.min(
              PAGE_BOTTOM_MARGIN_PX,
              remainingSpacePx
            );
            const totalPageHeightPx =
              topMarginPx + contentHeightPx + dynamicBottomMarginPx;
            const totalPageHeightMm = totalPageHeightPx / MM_TO_PX;
            const contentHeightMm = contentHeightPx / MM_TO_PX;
            
            // Only skip if there's truly no content (pageStart is beyond total content)
            // But allow pages with even small amounts of content to render
            if (pageStart >= totalContentHeightPx || visibleHeight <= 0) {
              console.log(
                `Skipping page ${pageIndex}: pageStart=${pageStart}, totalHeight=${totalContentHeightPx}, visibleHeight=${visibleHeight}`
              );
              return null;
            }
            
            console.log(
              `Rendering page ${pageIndex}: pageStart=${pageStart}, nextBreak=${nextBreak}, visibleHeight=${visibleHeight}, totalHeight=${totalContentHeightPx}`
            );
            
            // Calculate offset: shift content up by the height of previous pages
            // Each page shows a unique slice of content with no overlap
            // The offset should be exactly the negative of where this page's content starts
            let offsetY = 0;
            if (pageBreaks.length > pageIndex) {
              // Use calculated page break position - this is where content for this page starts
              offsetY = -pageBreaks[pageIndex];
            } else {
              // Fallback: calculate based on page index
              offsetY = -pageIndex * permissibleHeightPx;
            }
            
            // Ensure offset is not positive (content should always be shifted up or at 0)
            if (offsetY > 0) {
              offsetY = 0;
            }
            
            // Calculate the actual content height that should be visible on this page
            // Debug: Log offset calculation
            console.log(
              `Page ${pageIndex}: offsetY=${offsetY}, pageStart=${pageStart}, nextBreak=${nextBreak}, visibleHeight=${visibleHeight}, totalHeight=${totalContentHeightPx}`
            );
            
            return (
              <div
                key={pageIndex}
                className="resume-page"
                data-page-height={totalPageHeightMm}
              >
                <div
                  className="resume-page-content"
                  style={{
                    overflow: 'hidden',
                    position: 'relative',
                    height: `${totalPageHeightMm}mm`,
                    width: '210mm', /* Full A4 width */
                  }}
                >
                  {/* Content container with proper clipping */}
                  <div 
                    style={{
                      position: 'absolute',
                      top: `${topMarginPx}px`, // 5mm top margin
                      left: '5mm', // 5mm left margin
                      width: '200mm', // Content width (210mm - 5mm*2)
                      height: `${contentHeightPx}px`,
                      overflow: 'hidden', // Clip content that exceeds page height
                    }}
                  >
                    <div 
                      className={`resume-template-${selectedTemplate} print-optimized`}
                      style={{
                        position: 'absolute',
                        top: `${offsetY}px`, // Offset to show the correct slice of content
                        left: '0',
                        width: '200mm', // Content width
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        lineHeight: '1.3',
                        color: '#1a1a1a',
                        fontSize: '10pt',
                        boxSizing: 'border-box',
                        margin: 0,
                        // Prevent text selection
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      }}
                    >
                      <ResumeContent 
                        resumeData={resumeData}
                        selectedTemplate={selectedTemplate}
                        editable={editable}
                        handleContentChange={handleContentChange}
                        onResumeDataChange={onResumeDataChange}
                        extractedData={extractedData}
                        uploadedFiles={uploadedFiles}
                        onSectionClick={onSectionClick}
                        onProfileUpload={onProfileUpload}
                        profileImageSrc={profileImageSrc}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// Extract resume content into a separate component
const ResumeContent: React.FC<{
  resumeData: ResumeData;
  selectedTemplate: string;
  editable: boolean;
  handleContentChange: (field: string, value: string, index?: number) => void;
  onResumeDataChange?: (newResumeData: ResumeData) => void;
  extractedData?: any;
  uploadedFiles: UploadedFiles;
  onSectionClick?: (section: string, index?: number) => void;
  onProfileUpload?: (file: File) => void;
  profileImageSrc: string | null;
}> = ({ resumeData, selectedTemplate, editable, handleContentChange, onResumeDataChange, extractedData, uploadedFiles, onSectionClick, onProfileUpload, profileImageSrc }) => {
  const websiteHref = getWebsiteHref(resumeData.personalInfo.website);
  const experienceBadge = extractExperienceBadge(resumeData.personalInfo.summary);
  const contactItems: ContactItem[] = [
    resumeData.personalInfo.email ? { label: resumeData.personalInfo.email, href: `mailto:${resumeData.personalInfo.email}` } : null,
    resumeData.personalInfo.phone ? { label: resumeData.personalInfo.phone, href: `tel:${resumeData.personalInfo.phone}` } : null,
    resumeData.personalInfo.linkedin ? { label: resumeData.personalInfo.linkedin, href: resumeData.personalInfo.linkedin } : null,
    websiteHref ? { label: 'Portfolio', href: websiteHref, isPortfolio: true } : null
  ].filter(Boolean) as ContactItem[];
  return (
    <>
      {/* Upload Status Indicator */}
      {extractedData && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <span className="text-green-800 font-medium">
              ✓ Resume data loaded from uploaded file
            </span>
            <span className="text-green-600 text-sm">
              ({uploadedFiles.resume?.name})
            </span>
          </div>
        </div>
      )}
      
      {/* ATS Score Badge removed from printable resume */}

      {/* Header - Template Specific */}
      {selectedTemplate === 'template-01' ? (
        // Template 1: Exact match to image - Modern design with profile picture, dark blue and light pink accents
        <div className="bg-white" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {/* Header with Profile Picture */}
          <div className="flex items-center gap-4 mb-5" style={{ alignItems: 'center' }}>
            {/* Profile Picture */}
            <div className="flex-shrink-0" style={{ paddingBottom: '5px' }}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                id="profile-picture-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onProfileUpload) {
                    // Validate file type
                    if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg') {
                      onProfileUpload(file);
                    } else {
                      alert('Please upload a PNG or JPEG image');
                    }
                  }
                  // Reset input
                  e.target.value = '';
                }}
              />
              {profileImageSrc ? (
                <img 
                  src={profileImageSrc} 
                  alt="Profile" 
                  className={`w-24 h-24 rounded-full object-cover ${editable && onProfileUpload ? 'cursor-pointer hover:opacity-80' : ''}`}
                  style={{ border: 'none', transition: 'opacity 0.2s ease' }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering parent onClick
                    if (editable && onProfileUpload) {
                      document.getElementById('profile-picture-upload')?.click();
                    }
                  }}
                />
              ) : (
                <div 
                  className={`w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center ${editable && onProfileUpload ? 'cursor-pointer hover:bg-gray-300' : ''}`}
                  style={{ 
                    transition: 'background-color 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering parent onClick
                    if (editable && onProfileUpload) {
                      document.getElementById('profile-picture-upload')?.click();
                    }
                  }}
                >
                  <span 
                    className="text-gray-400" 
                    style={{ 
                      fontSize: '28px', 
                      fontWeight: 'bold',
                      lineHeight: 1,
                      display: 'block',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      margin: 0,
                      padding: 0,
                      textAlign: 'center',
                      width: '100%',
                      height: 'auto'
                    }}
                  >
                    {(resumeData.personalInfo.fullName || 'Your Name').charAt(0).toUpperCase()}
              </span>
            </div>
              )}
            </div>
            
            {/* Name and Contact Info */}
            <div 
              className={`flex-1 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (editable && onSectionClick) {
                  onSectionClick('personalInfo');
                }
              }}
              style={{
                ...(editable && onSectionClick ? { 
                  transition: 'background-color 0.2s ease',
                  padding: '8px',
                  borderRadius: '4px',
                  margin: '-8px'
                } : {})
              }}
              onMouseEnter={(e) => {
                if (editable && onSectionClick) {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (editable && onSectionClick) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a8a', lineHeight: '1.2', margin: 0, marginBottom: '6px' }}>
                {resumeData.personalInfo.fullName || 'Your Name'}
              </h1>
              <div style={{ fontSize: '10px', color: '#ff9269', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', margin: 0, marginBottom: '6px' }}>
                {resumeData.personalInfo.title || resumeData.personalInfo.summary?.split('.')[0] || 'Professional'}
              </div>
              <div className="flex flex-wrap gap-3 items-center" style={{ fontSize: '10px', color: '#374151', margin: 0 }}>
                {resumeData.personalInfo.email && (
            <div className="flex items-center gap-1">
                    <IconImage icon={Mail} size={12} color="#6b7280" />
                    <span>{resumeData.personalInfo.email}</span>
            </div>
                )}
                {websiteHref && (
                  <div className="flex items-center gap-1">
                    <IconImage icon={LinkIcon} size={12} color="#6b7280" />
                    <a
                      data-portfolio-link="true"
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#374151',
                        textDecoration: 'none',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      Portfolio
                    </a>
          </div>
                )}
                {resumeData.personalInfo.linkedin && (
                  <div className="flex items-center gap-1">
                    <IconImage icon={Linkedin} size={12} color="#6b7280" />
                    <span>{resumeData.personalInfo.linkedin}</span>
              </div>
                )}
                {resumeData.personalInfo.phone && (
            <div className="flex items-center gap-1">
                    <IconImage icon={Instagram} size={12} color="#6b7280" />
                    <span>{resumeData.personalInfo.phone}</span>
            </div>
          )}
              </div>
            </div>
          </div>

          {/* Introduction Section - Gray Box */}
          {resumeData.personalInfo.summary && (
            <div 
              onClick={() => {
                if (editable && onSectionClick) {
                  onSectionClick('summary');
                }
              }}
              className={`${editable && onSectionClick ? 'cursor-pointer' : ''}`}
              style={{ 
                backgroundColor: '#f3f4f6', 
                padding: '8px 12px',
                marginTop: '12px',
                marginBottom: '12px', 
                borderRadius: '4px',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (editable && onSectionClick) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                if (editable && onSectionClick) {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }
              }}
            >
              <FormattedText 
                text={resumeData.personalInfo.summary}
                style={{ fontSize: '11px', color: '#374151', lineHeight: '1.5', display: 'block' }}
              />
        </div>
      )}

          {/* Skills Section */}
          {resumeData.skills && resumeData.skills.length > 0 && (
            <div className="mb-4">
              <h2 
                onClick={() => {
                  if (editable && onSectionClick) {
                    onSectionClick('skills');
                  }
                }}
                className={`mb-2 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  color: '#ff9269', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  transition: 'opacity 0.2s ease, text-decoration 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.textDecoration = 'underline';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.textDecoration = 'none';
                  }
                }}
              >
                {(resumeData.sectionTitles?.skills || 'SKILLS').toUpperCase()}
              </h2>
              <div 
                className={`mb-3 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (editable && onSectionClick) {
                    onSectionClick('skills');
                  }
                }}
                style={editable && onSectionClick ? { 
                  transition: 'background-color 0.2s ease',
                  padding: '8px',
                  borderRadius: '4px',
                  margin: '-8px'
                } : {}}
                onMouseEnter={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <p style={{ fontSize: '12px', color: '#374151', lineHeight: '1.5' }}>
                  {resumeData.skills.join(' • ')}
                </p>
          </div>
        </div>
          )}

          {/* Experience Section */}
          {resumeData.experience && resumeData.experience.length > 0 && (
            <div className="mb-5">
              <h2 
                onClick={() => {
                  if (editable && onSectionClick) {
                    onSectionClick('experience');
                  }
                }}
                className={`mb-3 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  color: '#ff9269', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  transition: 'opacity 0.2s ease, text-decoration 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.textDecoration = 'underline';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.textDecoration = 'none';
                  }
                }}
              >
                {(resumeData.sectionTitles?.experience || 'EXPERIENCE').toUpperCase()}
              </h2>
              <div 
                onClick={() => editable && onSectionClick && onSectionClick('experience')}
                className={`transition-all duration-200 ${editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}`}
                style={editable && onSectionClick ? { transition: 'background-color 0.2s ease' } : {}}
              >
                {resumeData.experience.map((exp, index) => {
                  // Format date as "Mar. 2021" style
                  const formatDateForTemplate1 = (dateString: string): string => {
                    if (!dateString) return '';
                    const parts = dateString.split('-');
                    if (parts.length === 2) {
                      const year = parts[0];
                      const month = parseInt(parts[1]);
                      const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
                      return `${monthNames[month - 1]} ${year}`;
                    }
                    return dateString;
                  };
                  
                  const startDateFormatted = formatDateForTemplate1(exp.startDate);
                  const endDateFormatted = exp.endDate ? formatDateForTemplate1(exp.endDate) : '';
                  const dateRange = exp.current 
                    ? `${startDateFormatted} - Currently`
                    : endDateFormatted
                      ? `${startDateFormatted} - ${endDateFormatted}`
                      : startDateFormatted;
                  
                  return (
                    <div 
                      key={index} 
                      className={`${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                      data-avoid-break
                      onClick={() => {
                        if (editable && onSectionClick) {
                          onSectionClick('experience', index);
                        }
                      }}
                      style={{
                        marginBottom: index < resumeData.experience.length - 1 ? '4px' : '0',
                        ...(editable && onSectionClick ? { 
                          transition: 'all 0.2s ease',
                          padding: '0px',
                          borderRadius: '4px'
                        } : {})
                      }}
                      onMouseEnter={(e) => {
                        if (editable && onSectionClick) {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (editable && onSectionClick) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e3a8a', lineHeight: '1.3', margin: 0 }}>
                          {exp.title}
                        </h3>
                        <div className="flex items-center gap-2" style={{ fontSize: '10px', color: '#6b7280' }}>
                          <IconImage icon={Building2} size={12} color="#9ca3af" />
                          <span>{exp.company}</span>
                          <IconImage icon={Calendar} size={12} color="#9ca3af" style={{ marginLeft: '8px' }} />
                          <span>{dateRange}</span>
                        </div>
                      </div>
                      {exp.description && exp.description.length > 0 && (
                        <ul className="mb-2" style={{ paddingLeft: '0', listStyle: 'none' }}>
                          {exp.description.map((desc, descIndex) => (
                            <li key={descIndex} className="mb-1" data-avoid-break style={{ fontSize: '11px', color: '#374151', lineHeight: '1.5', display: 'flex', gap: '6px' }}>
                              <span style={{ color: '#374151', marginRight: '4px' }}>•</span>
                              <FormattedText text={desc} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
        </div>
      )}

          {/* Education Section */}
          {resumeData.education && resumeData.education.length > 0 && (
            <div className="mb-4">
              <h2 
                onClick={() => {
                  if (editable && onSectionClick) {
                    onSectionClick('education');
                  }
                }}
                className={`mb-2 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  color: '#ff9269', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  transition: 'opacity 0.2s ease, text-decoration 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.textDecoration = 'underline';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.textDecoration = 'none';
                  }
                }}
              >
                {(resumeData.sectionTitles?.education || 'EDUCATION').toUpperCase()}
              </h2>
              <div 
                className={`mb-3 ${editable && onSectionClick ? 'cursor-pointer' : ''}`}
                data-avoid-break
                onClick={() => {
                  if (editable && onSectionClick) {
                    onSectionClick('education');
                  }
                }}
                style={editable && onSectionClick ? { 
                  transition: 'background-color 0.2s ease',
                  padding: '8px',
                  borderRadius: '4px',
                  margin: '-8px'
                } : {}}
                onMouseEnter={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editable && onSectionClick) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
              <p style={{ fontSize: '10px', color: '#374151', lineHeight: '1.5' }}>
                {(() => {
                  // Format year as "2022" or "2014 - 2018"
                  const formatYearForTemplate1 = (yearString: string): string => {
                    if (!yearString) return '';
                    if (yearString.includes(' - ')) {
                      const [start, end] = yearString.split(' - ');
                      return `${start.split('-')[0]} - ${end.split('-')[0]}`;
                    }
                    return yearString.split('-')[0];
                  };
                  
                  // Create education entries with dot separation
                  const eduEntries = resumeData.education.map((edu) => {
                    const yearFormatted = formatYearForTemplate1(edu.year || '');
                    return `${edu.degree}${edu.institution ? `, ${edu.institution}` : ''}${yearFormatted ? `, ${yearFormatted}` : ''}`;
                  });
                  
                  // Split into 1-2 lines
                  const midPoint = Math.ceil(eduEntries.length / 2);
                  const firstLine = eduEntries.slice(0, midPoint).join(' • ');
                  const secondLine = eduEntries.slice(midPoint).join(' • ');
                  
                  return (
                    <>
                      {firstLine}
                      {secondLine && (
                        <>
                          <br />
                          {secondLine}
                        </>
                      )}
                    </>
                  );
                })()}
              </p>
              </div>
          </div>
          )}
        </div>
      ) : selectedTemplate === 'minimal' ? (
        <div className="bg-white">
          <div className="flex flex-wrap items-start justify-between border-b border-gray-900 pb-4 mb-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 leading-tight mb-1">
                {resumeData.personalInfo.fullName || 'Your Name'}
              </h1>
            </div>
            {(experienceBadge || resumeData.personalInfo.location) && (
              <div className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                {experienceBadge || resumeData.personalInfo.location}
              </div>
            )}
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-sm font-semibold mb-5"
            style={{ color: '#0f6ab7' }}
          >
            {contactItems.length === 0 && (
              <span className="text-gray-500 font-normal">Add contact information</span>
            )}
            {contactItems.map((item, idx) => (
              <React.Fragment key={`${item.label}-${idx}`}>
                {idx > 0 && <span className="text-gray-300">|</span>}
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-portfolio-link={item.isPortfolio ? 'true' : undefined}
                    style={{ color: '#0f6ab7' }}
                    className="hover:underline"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span>{item.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : selectedTemplate === 'skyline' ? (
        <div className="bg-white" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#000000' }}>
          {/* Header - Left Aligned */}
          <div className="mb-6" style={{ marginBottom: '10px', textAlign: 'left' }}>
            <h1 className="font-bold text-black mb-2" style={{ fontSize: '28px', letterSpacing: '0.5px', marginBottom: '4px', lineHeight: '1.1' }}>
              {(resumeData.personalInfo.fullName || 'Your Name').toUpperCase()}
            </h1>
            {resumeData.personalInfo.title && (
              <p className="font-normal mb-3" style={{ fontSize: '14px', marginBottom: '4px', lineHeight: '1.3', color: '#999999' }}>
                {resumeData.personalInfo.title}
              </p>
            )}
            <div className="text-black font-normal" style={{ fontSize: '12px', lineHeight: '1.3' }}>
              {contactItems.length === 0 ? (
                <span style={{ color: '#666666' }}>Add contact information</span>
              ) : (
                contactItems.map((item, idx) => (
                  <React.Fragment key={`${item.label}-${idx}`}>
                    {idx > 0 && <span style={{ margin: '0 4px' }}> </span>}
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-portfolio-link={item.isPortfolio ? 'true' : undefined}
                        style={{ color: '#000000', textDecoration: 'none' }}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </React.Fragment>
                ))
              )}
              {resumeData.personalInfo.location && contactItems.length > 0 && (
                <>
                  <span style={{ margin: '0 4px' }}> </span>
                  <span>{resumeData.personalInfo.location}</span>
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          {resumeData.personalInfo.summary && (
            <div style={{ marginBottom: '8px' }}>
              <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: '14px', marginBottom: '2px', letterSpacing: '0.5px', color: '#808080' }}>
                Summary
              </h2>
              <FormattedText
                text={resumeData.personalInfo.summary}
                className="text-black leading-relaxed block"
                style={{ fontSize: '12px', lineHeight: '1.4', color: '#000000' }}
              />
            </div>
          )}

          {/* Skills */}
          {resumeData.skills && resumeData.skills.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: '14px', marginBottom: '2px', letterSpacing: '0.5px', color: '#808080' }}>
                Skills
              </h2>
              <p className="text-black leading-relaxed" style={{ fontSize: '12px', lineHeight: '1.4', color: '#000000' }}>
                {resumeData.skills.join(', ')}
              </p>
            </div>
          )}

          {/* Experience */}
          {resumeData.experience && resumeData.experience.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: '14px', marginBottom: '4px', letterSpacing: '0.5px', color: '#808080' }}>
                Experience
              </h2>
              {resumeData.experience.map((exp, index) => {
                const start = formatDateDisplay(exp.startDate);
                const end = exp.current ? 'Present' : formatDateDisplay(exp.endDate || '');
                const dateRange = start ? `${start}${end ? ` - ${end}` : ''}` : '';
                return (
                  <div key={index} style={{ marginBottom: '6px' }} data-avoid-break>
                    <div className="flex justify-between items-start" style={{ marginBottom: '1px' }}>
                      <div style={{ flex: '1' }}>
                        <h3 className="font-bold text-black" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000000', marginBottom: '0px' }}>
                          {exp.title || 'Job Title'}
                        </h3>
                        <p
                          className="font-medium"
                          style={{
                            fontSize: '14px',
                            color: '#007AFF',
                            lineHeight: '1.3',
                            fontWeight: 500,
                            marginTop: '0px',
                            fontFamily: '"SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {exp.company || 'Company'}
                        </p>
                      </div>
                      <div className="text-right text-black font-normal" style={{ fontSize: '12px', color: '#000000', lineHeight: '1.3', textAlign: 'right', marginLeft: '16px' }}>
                        {dateRange && <div style={{ marginBottom: '0px' }}>{dateRange}</div>}
                        {exp.location && <div>{exp.location}</div>}
                      </div>
                    </div>
                    {exp.description && exp.description.length > 0 && (
                      <ul
                        className="text-black space-y-1 list-disc"
                        style={{
                          fontSize: '12px',
                          color: '#000000',
                          paddingLeft: '0px',
                          marginLeft: '0px',
                          marginTop: '2px',
                          marginBottom: '0px',
                          lineHeight: '1.4',
                          listStyleType: 'none',
                          listStylePosition: 'outside',
                        }}
                      >
                        {exp.description.map((desc, descIdx) => (
                          <li
                            key={descIdx}
                            data-avoid-break
                            style={{
                              marginBottom: '0px',
                              lineHeight: '1.4',
                              color: '#000000',
                              listStyleType: 'none',
                              listStylePosition: 'outside',
                              display: 'flex',
                              alignItems: 'flex-start',
                              columnGap: '6px',
                              paddingLeft: '0px',
                              marginLeft: '0px',
                            }}
                          >
                            <span
                              aria-hidden="true"
                              data-pdf-bullet="true"
                              style={{
                                display: 'inline-block',
                                minWidth: '8px',
                                fontSize: '14px',
                                lineHeight: '1',
                                color: '#000000',
                                marginTop: '0.2em',
                                textAlign: 'center',
                              }}
                            >
                              •
                            </span>
                            <span
                              data-pdf-bullet-text="true"
                              style={{ display: 'inline', margin: 0, padding: 0, color: '#000000', lineHeight: '1.4', flex: 1 }}
                            >
                              <FormattedText text={desc} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Education */}
          {resumeData.education && resumeData.education.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: '14px', marginBottom: '4px', letterSpacing: '0.5px', color: '#808080' }}>
                Education
              </h2>
              {resumeData.education.map((edu, idx) => (
                <div key={idx} className="flex justify-between items-start" style={{ marginBottom: '4px' }} data-avoid-break>
                  <div style={{ flex: '1' }}>
                    <h3 className="font-bold text-black" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000000', marginBottom: '0px' }}>
                      {edu.degree || 'Degree'}
                    </h3>
                    <p className="text-black font-normal" style={{ fontSize: '12px', color: '#000000', lineHeight: '1.3', marginTop: '0px' }}>
                      {edu.institution || 'Institution'}
                    </p>
                  </div>
                  <div className="text-right text-black font-normal" style={{ fontSize: '12px', color: '#000000', lineHeight: '1.3', textAlign: 'right', marginLeft: '16px' }}>
                    {edu.year && <div style={{ marginBottom: '0px' }}>{formatDateDisplay(edu.year)}</div>}
                    {edu.location && <div>{edu.location}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {resumeData.projects && resumeData.projects.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: '14px', marginBottom: '4px', letterSpacing: '0.5px', color: '#808080' }}>
                Projects
              </h2>
              {resumeData.projects.map((proj, idx) => (
                <div key={idx} style={{ marginBottom: '6px' }} data-avoid-break>
                  <div className="flex flex-wrap items-center justify-between" style={{ marginBottom: '1px' }}>
                    <h3 className="font-semibold text-black" style={{ fontSize: '14px', fontWeight: '600', color: '#000000' }}>
                      {proj.name || 'Project'}
                    </h3>
                    {proj.link && (
                      <a href={proj.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#000000', textDecoration: 'none' }}>
                        {proj.link}
                      </a>
                    )}
                  </div>
                  <FormattedText text={proj.description} className="text-black leading-snug mb-1 block" style={{ fontSize: '12px', color: '#000000', lineHeight: '1.4', marginBottom: '2px' }} />
                  {proj.technologies && proj.technologies.length > 0 && (
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#666666' }}>
                      Tech: {proj.technologies.join(', ')}
                    </div>
                  )}
                </div>
              ))}
          </div>
          )}
        </div>
      ) : selectedTemplate === 'template-02' ? (
        // Template 2: Professional ATS-optimized layout
        <div className="bg-white">
          {/* Header Section */}
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('personalInfo')}
            className={`border-b-2 border-gray-800 pb-3 mb-4 ${editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}`}
          >
            <h1 
              contentEditable={false}
              className="text-2xl font-bold text-gray-900 mb-2 tracking-tight"
            >
              {resumeData.personalInfo.fullName || 'Your Name'}
            </h1>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            {resumeData.personalInfo.email && (
                <div>{resumeData.personalInfo.email}</div>
            )}
            {resumeData.personalInfo.phone && (
                <div>{resumeData.personalInfo.phone}</div>
            )}
            {resumeData.personalInfo.location && (
                <div>{resumeData.personalInfo.location}</div>
            )}
            {resumeData.personalInfo.linkedin && (
                <div>{resumeData.personalInfo.linkedin}</div>
            )}
          </div>
        </div>
          </div>
      ) : selectedTemplate === 'template-04' ? (
        // Template 3: Contemporary design with structured sections
        <div className="bg-white">
          {/* Header Section */}
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('personalInfo')}
            className={`border-b-2 border-teal-700 pb-3 mb-4 ${editable && onSectionClick ? 'cursor-pointer hover:bg-teal-50 p-2 rounded -m-2' : ''}`}
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {resumeData.personalInfo.fullName || 'Your Name'}
            </h1>
            <div className="flex flex-wrap gap-4 text-xs text-gray-700 items-center">
          {resumeData.personalInfo.email && (
                <span>{resumeData.personalInfo.email}</span>
          )}
          {resumeData.personalInfo.phone && (
                <span>{resumeData.personalInfo.phone}</span>
          )}
          {resumeData.personalInfo.location && (
                <span>{resumeData.personalInfo.location}</span>
          )}
          {resumeData.personalInfo.linkedin && (
                <span>{resumeData.personalInfo.linkedin}</span>
          )}
        </div>
      </div>
        </div>
      ) : null}

      {/* Summary - Template Specific (skip for template-01 and skyline as they have their own) */}
      {selectedTemplate !== 'template-01' && selectedTemplate !== 'skyline' && resumeData.personalInfo.summary && (
        <div className="mb-4">
          <h2 
            onClick={() => editable && onSectionClick && onSectionClick('summary')}
            className={`text-sm font-bold mb-2 ${
            selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
            selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
            'text-gray-900 border-b border-gray-900'
            } pb-1 uppercase tracking-wide ${editable && onSectionClick ? 'cursor-pointer hover:opacity-80' : ''}`}
          >
            {resumeData.sectionTitles?.summary || 'Professional Summary'}
          </h2>
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('summary')}
            className={`text-sm leading-snug text-gray-700 ${editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}`}
          >
            <FormattedText 
              text={resumeData.personalInfo.summary}
            />
          </div>
        </div>
      )}

      {/* Skills - Template Specific - Compact 2-line format (skip for template-01 and skyline as they have their own) */}
      {selectedTemplate !== 'template-01' && selectedTemplate !== 'skyline' && Array.isArray(resumeData.skills) && resumeData.skills.length > 0 && (
        <div className="mb-4">
          <h2 
            onClick={() => editable && onSectionClick && onSectionClick('skills')}
            className={`text-sm font-bold mb-2 ${
            selectedTemplate === 'template-01' ? 'text-pink-500 border-b border-pink-500' :
            selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
            selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
            'text-gray-900 border-b border-gray-900'
            } pb-1 uppercase tracking-wide ${editable && onSectionClick ? 'cursor-pointer hover:opacity-80' : ''}`}
          >
            {resumeData.sectionTitles?.skills || 'Core Competencies'}
          </h2>
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('skills')}
            contentEditable={false}
            className={`text-gray-700 leading-tight ${editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}`}
            style={{ fontSize: '12px' }}
          >
            {resumeData.skills.join(' • ')}
          </div>
        </div>
      )}

      {/* Experience - Template Specific (skip for template-01 and skyline as they have their own) */}
      {selectedTemplate !== 'template-01' && selectedTemplate !== 'skyline' && Array.isArray(resumeData.experience) && resumeData.experience.some(exp => exp.title) && (
        <div className="mb-2">
          <h2 
            onClick={() => editable && onSectionClick && onSectionClick('experience')}
            className={`text-sm font-bold mb-1.5 ${
            selectedTemplate === 'template-01' ? 'text-pink-500 border-b border-pink-500' :
            selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
            selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
            'text-gray-900 border-b border-gray-900'
            } pb-1 uppercase tracking-wide ${editable && onSectionClick ? 'cursor-pointer hover:opacity-80' : ''}`}
          >
            {resumeData.sectionTitles?.experience || 'Professional Experience'}
          </h2>
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('experience')}
            className={editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}
          >
          {resumeData.experience.map((exp, expIndex) => exp.title && (
            <div key={exp.id} className="mb-1.5" data-avoid-break>
              <div className="flex justify-between items-start mb-1">
                <h3 
                  contentEditable={false}
                  className="font-semibold text-base text-gray-800"
                >
                  {exp.title}
                </h3>
                <span 
                  contentEditable={false}
                  className="text-gray-600 text-xs font-medium"
                >
                  {exp.current 
                    ? `${formatDateDisplay(exp.startDate)} - Present`
                    : exp.endDate && exp.endDate.trim()
                      ? `${formatDateDisplay(exp.startDate)} - ${formatDateDisplay(exp.endDate)}`
                      : formatDateDisplay(exp.startDate)
                  }
                </span>
              </div>
              <p                 className={`mb-1 text-sm font-medium text-gray-700`}>
                <span
                  contentEditable={false}
                >
                  {exp.company}
                </span>
                {' • '}
                <span
                  contentEditable={false}
                >
                  {exp.location}
                </span>
              </p>
              <ul className="text-gray-700 text-sm space-y-0.25">
                {Array.isArray(exp.description) ? exp.description.map((desc, index) => (
                  <li key={index} className="bullet-item" data-avoid-break>
                    <span className="bullet text-gray-500 mr-1.5 text-xs">•</span>
                    <FormattedText
                      text={desc}
                      className="bullet-text leading-snug"
                    />
                  </li>
                )) : (
                  <li className="bullet-item leading-snug text-gray-500" data-avoid-break>
                    <span className="bullet text-gray-500 mr-1.5 text-xs">•</span>
                    <span className="bullet-text">No description available</span>
                  </li>
                )}
              </ul>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Education - Template Specific (skip for template-01 and skyline as they have their own) */}
      {selectedTemplate !== 'template-01' && selectedTemplate !== 'skyline' && Array.isArray(resumeData.education) && resumeData.education.some(edu => edu.degree) && (
        <div className="mb-4">
          <h2 
            onClick={() => editable && onSectionClick && onSectionClick('education')}
            className={`text-sm font-bold mb-2 ${
            selectedTemplate === 'template-01' ? 'text-pink-500 border-b border-pink-500' :
            selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
            selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
            'text-gray-900 border-b border-gray-900'
            } pb-1 uppercase tracking-wide ${editable && onSectionClick ? 'cursor-pointer hover:opacity-80' : ''}`}
          >
            {resumeData.sectionTitles?.education || 'Education'}
          </h2>
          <div 
            onClick={() => editable && onSectionClick && onSectionClick('education')}
            className={editable && onSectionClick ? 'cursor-pointer hover:bg-gray-50 p-2 rounded -m-2' : ''}
          >
          {resumeData.education.map(edu => edu.degree && (
            <div key={edu.id} className="mb-2" data-avoid-break>
                <h3 className="font-semibold text-sm text-gray-800">{edu.degree}</h3>
                <p className="text-xs text-gray-700">
                  {edu.institution} • {edu.location} • {formatDateDisplay(edu.year || '')}
                </p>
                {edu.gpa && <p className="text-xs text-gray-600">GPA: {edu.gpa}</p>}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Projects (skip for skyline as it has its own) */}
      {selectedTemplate !== 'skyline' && Array.isArray(resumeData.projects) && resumeData.projects.some(proj => proj.name) && (
        <div className="mb-2">
           <h2 className={`text-sm font-bold mb-2 ${
             selectedTemplate === 'template-01' ? 'text-pink-500 border-b border-pink-500' :
             selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
             selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
             'text-gray-900 border-b border-gray-900'
           } pb-1 uppercase tracking-wide`}>
            Key Projects
          </h2>
          {resumeData.projects.map(proj => proj.name && (
            <div key={proj.id} className="mb-1.5" data-avoid-break>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm text-gray-800">{proj.name}</h3>
                {proj.link && (
                   <a href={proj.link} className={`text-xs text-gray-700 hover:text-gray-900 underline`}>
                    {proj.link}
                  </a>
                )}
              </div>
              <FormattedText text={proj.description} className="text-sm text-gray-700 mb-1 leading-snug" style={{ display: 'block' }} />
              {Array.isArray(proj.technologies) && proj.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-600">Technologies:</span>
                  {proj.technologies.map((tech, index) => (
                     <span key={index} className={`px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-300`}>
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Achievements (skip for skyline as it doesn't have this section) */}
      {selectedTemplate !== 'skyline' && Array.isArray(resumeData.achievements) && resumeData.achievements.length > 0 && (
        <div className="mb-2">
          <h2 className={`text-sm font-bold mb-2 ${
            selectedTemplate === 'template-01' ? 'text-pink-500 border-b border-pink-500' :
            selectedTemplate === 'template-02' ? 'text-gray-900 border-b border-gray-900' :
            selectedTemplate === 'template-04' ? 'text-teal-700 border-b border-teal-700' :
            'text-gray-900 border-b border-gray-900'
          } pb-1 uppercase tracking-wide`}>
            Key Achievements
          </h2>
          <ul className="text-sm text-gray-700 space-y-0.25">
            {resumeData.achievements.map((achievement, index) => (
              <li key={index} className="bullet-item" data-avoid-break>
                <span className="bullet text-gray-500 mr-1.5 text-xs">•</span>
                <FormattedText text={achievement} className="bullet-text leading-snug" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

export default ResumePreview;
