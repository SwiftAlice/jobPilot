import { ResumeData, ResumeTemplate } from '@/types/resume-builder-types';

const MM_TO_PX = 3.779527559;
const PAGE_CONFIG = {
  widthMm: 210,
  heightMm: 297,
  topMarginMm: 5,
  bottomMarginMm: 16,
};

const normalizeUrl = (raw?: string | null): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const getPortfolioLinkRect = (pageElement: HTMLElement) => {
  const anchor = pageElement.querySelector('[data-portfolio-link="true"]') as HTMLAnchorElement | null;
  if (!anchor) return null;

  const url = normalizeUrl(anchor.getAttribute('href') || anchor.textContent || '');
  if (!url) return null;

  const anchorRect = anchor.getBoundingClientRect();
  const pageRect = pageElement.getBoundingClientRect();

  if (!anchorRect.width || !anchorRect.height) return null;

  const xMm = (anchorRect.left - pageRect.left) / MM_TO_PX;
  const yMm = (anchorRect.top - pageRect.top) / MM_TO_PX;
  const widthMm = anchorRect.width / MM_TO_PX;
  const heightMm = anchorRect.height / MM_TO_PX;

  return { url, xMm, yMm, widthMm, heightMm };
};

// Get template colors for PDF generation
export const getTemplateColors = (selectedTemplate: string) => {
  switch (selectedTemplate) {
    case 'creative':
      return { primary: '#7c3aed', secondary: '#a855f7', text: '#1f2937' };
    case 'executive':
      return { primary: '#4f46e5', secondary: '#6366f1', text: '#1f2937' };
    case 'technical':
      return { primary: '#0d9488', secondary: '#14b8a6', text: '#1f2937' };
    case 'minimal':
      return { primary: '#374151', secondary: '#6b7280', text: '#111827' };
    case 'classic':
      return { primary: '#6b7280', secondary: '#9ca3af', text: '#1f2937' };
    default:
      return { primary: '#2563eb', secondary: '#3b82f6', text: '#1f2937' };
  }
};

// Generate PDF from resume data
export const generatePDF = async (resumeData: ResumeData, selectedTemplate: string) => {
  try {
    // Import jsPDF dynamically
    const jsPDF = (await import('jspdf')).default;

    // Create PDF directly with jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const colors = getTemplateColors(selectedTemplate);
    let yPosition = 20;

    // Helper function to add text with wrapping
    const addText = (text: string, x: number, y: number, options: any = {}) => {
      const maxWidth = 170; // A4 width minus margins
      const lines = pdf.splitTextToSize(text, maxWidth);
      if (Array.isArray(lines)) {
        lines.forEach((line, index) => {
          pdf.text(line, x, y + (index * (options.fontSize || 12) * 0.35));
        });
      } else {
        pdf.text(lines, x, y);
      }
      return y + ((Array.isArray(lines) ? lines.length : 1) * (options.fontSize || 12) * 0.35) + 2;
    };

    // Helper function to add section header
    const addSectionHeader = (text: string, y: number) => {
      pdf.setFontSize(16);
      pdf.setTextColor(colors.primary);
      pdf.setFont('helvetica', 'bold');
      pdf.text(text, 20, y);
      const newY = y + 6;
      pdf.setDrawColor(colors.primary);
      pdf.line(20, newY, 190, newY);
      return newY + 5;
    };

    // Header with name
    pdf.setFontSize(24);
    pdf.setTextColor(colors.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.text(resumeData.personalInfo.fullName || 'Your Name', 20, yPosition);
    yPosition += 10;

    // Contact information
    pdf.setFontSize(12);
    pdf.setTextColor(colors.text);
    pdf.setFont('helvetica', 'normal');
    if (resumeData.personalInfo.email) {
      pdf.text(resumeData.personalInfo.email, 20, yPosition);
      yPosition += 5;
    }
    if (resumeData.personalInfo.phone) {
      pdf.text(resumeData.personalInfo.phone, 20, yPosition);
      yPosition += 5;
    }
    if (resumeData.personalInfo.location) {
      pdf.text(resumeData.personalInfo.location, 20, yPosition);
      yPosition += 5;
    }
    yPosition += 5;

    // Professional Summary
    if (resumeData.personalInfo.summary) {
      yPosition = addSectionHeader('Professional Summary', yPosition);
      pdf.setFontSize(12);
      pdf.setTextColor(colors.text);
      pdf.setFont('helvetica', 'normal');
      const summaryLines = pdf.splitTextToSize(resumeData.personalInfo.summary, 170);
      if (Array.isArray(summaryLines)) {
        summaryLines.forEach((line, index) => {
          pdf.text(line, 20, yPosition + (index * 4));
        });
        yPosition += summaryLines.length * 4;
      } else {
        pdf.text(summaryLines, 20, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }

    // Skills
    if (resumeData.skills && resumeData.skills.length > 0) {
      yPosition = addSectionHeader('Skills', yPosition);
      pdf.setFontSize(12);
      pdf.setTextColor(colors.text);
      pdf.setFont('helvetica', 'normal');
      const skillsText = resumeData.skills.join(' • ');
      const skillsLines = pdf.splitTextToSize(skillsText, 170);
      if (Array.isArray(skillsLines)) {
        skillsLines.forEach((line, index) => {
          pdf.text(line, 20, yPosition + (index * 4));
        });
        yPosition += skillsLines.length * 4;
      } else {
        pdf.text(skillsLines, 20, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }

    // Experience
    if (resumeData.experience && resumeData.experience.length > 0) {
      yPosition = addSectionHeader('Experience', yPosition);
      resumeData.experience.forEach(exp => {
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(exp.title || 'Job Title', 20, yPosition);
        yPosition += 6;
        
        pdf.setFontSize(12);
        pdf.setTextColor(colors.secondary);
        pdf.setFont('helvetica', 'italic');
        pdf.text(exp.company || 'Company', 20, yPosition);
        yPosition += 5;
        
        pdf.setFontSize(10);
        pdf.setTextColor('#6b7280');
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${exp.startDate || 'Start Date'} - ${exp.endDate || 'End Date'}`, 20, yPosition);
        yPosition += 5;
        
        if (exp.description) {
          pdf.setFontSize(11);
          pdf.setTextColor(colors.text);
          pdf.setFont('helvetica', 'normal');
          const descriptionText = Array.isArray(exp.description) ? exp.description.join(' ') : exp.description;
          const descLines = pdf.splitTextToSize(descriptionText, 170);
          if (Array.isArray(descLines)) {
            descLines.forEach((line, index) => {
              pdf.text(line, 20, yPosition + (index * 4));
            });
            yPosition += descLines.length * 4;
          } else {
            pdf.text(descLines, 20, yPosition);
            yPosition += 5;
          }
        }
        yPosition += 5;
      });
    }

    // Education
    if (resumeData.education && resumeData.education.length > 0) {
      yPosition = addSectionHeader('Education', yPosition);
      resumeData.education.forEach(edu => {
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(edu.degree || 'Degree', 20, yPosition);
        yPosition += 6;
        
        pdf.setFontSize(12);
        pdf.setTextColor(colors.secondary);
        pdf.setFont('helvetica', 'italic');
        pdf.text(edu.institution || 'Institution', 20, yPosition);
        yPosition += 5;
        
        pdf.setFontSize(10);
        pdf.setTextColor('#6b7280');
        pdf.setFont('helvetica', 'normal');
        pdf.text(edu.year || 'Year', 20, yPosition);
        yPosition += 5;
      });
    }

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `Resume_${timestamp}.pdf`;

    pdf.save(filename);
    return filename;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

// Generate PDF as ArrayBuffer (for email attachments)
export const generatePDFBuffer = async (resumeData: ResumeData, selectedTemplate: string) => {
  try {
    const jsPDF = (await import('jspdf')).default;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const colors = getTemplateColors(selectedTemplate);
    let yPosition = 20;

    const addWrappedText = (text: string, x: number, y: number, maxWidth = 170, lineHeight = 4) => {
      const lines = pdf.splitTextToSize(text, maxWidth);
      if (Array.isArray(lines)) {
        lines.forEach((line, index) => {
          pdf.text(line, x, y + (index * lineHeight));
        });
        return y + (lines.length * lineHeight);
      }
      pdf.text(lines, x, y);
      return y + lineHeight;
    };

    const addHeader = () => {
      if (selectedTemplate === 'ats-modern') {
        // ATS Modern header with structured layout
        pdf.setFontSize(24);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', 20, yPosition);
        yPosition += 12;

        pdf.setFontSize(11);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        
        // Two-column contact info
        const contactInfo = [
          `Email: ${resumeData.personalInfo.email || 'your.email@example.com'}`,
          `Phone: ${resumeData.personalInfo.phone || '(555) 123-4567'}`,
          `Location: ${resumeData.personalInfo.location || 'City, State'}`,
          `LinkedIn: ${resumeData.personalInfo.linkedin || 'linkedin.com/in/yourprofile'}`
        ];
        
        contactInfo.forEach((info, index) => {
          const x = index % 2 === 0 ? 20 : 110;
          const y = yPosition + (Math.floor(index / 2) * 6);
          pdf.text(info, x, y);
        });
        yPosition += 12;
      } else if (selectedTemplate === 'ats-modern') {
        // ATS Compact centered header
        pdf.setFontSize(20);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        const nameWidth = pdf.getTextWidth(resumeData.personalInfo.fullName || 'Your Name');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', (210 - nameWidth) / 2, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        
        const contactLine = [
          resumeData.personalInfo.email || 'your.email@example.com',
          resumeData.personalInfo.phone || '(555) 123-4567',
          resumeData.personalInfo.location || 'City, State',
          resumeData.personalInfo.linkedin || 'linkedin.com/in/yourprofile'
        ].join(' • ');
        
        const contactWidth = pdf.getTextWidth(contactLine);
        pdf.text(contactLine, (210 - contactWidth) / 2, yPosition);
        yPosition += 10;
      } else {
        // Default header for other templates
        pdf.setFontSize(24);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', 20, yPosition);
        yPosition += 10;

        pdf.setFontSize(12);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        if (resumeData.personalInfo.email) { pdf.text(resumeData.personalInfo.email, 20, yPosition); yPosition += 5; }
        if (resumeData.personalInfo.phone) { pdf.text(resumeData.personalInfo.phone, 20, yPosition); yPosition += 5; }
        if (resumeData.personalInfo.location) { pdf.text(resumeData.personalInfo.location, 20, yPosition); yPosition += 5; }
        yPosition += 5;
      }
    };

    const addSectionHeader = (label: string) => {
      if (selectedTemplate === 'ats-modern' || selectedTemplate === 'ats-modern') {
        // ATS-friendly section headers
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label.toUpperCase(), 20, yPosition);
        
        // Add underline for ATS templates
        const textWidth = pdf.getTextWidth(label.toUpperCase());
        pdf.setDrawColor(colors.primary);
        pdf.line(20, yPosition + 1, 20 + textWidth, yPosition + 1);
        yPosition += 8;
      } else {
        // Default section headers
        pdf.setFontSize(16);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label, 20, yPosition);
        const underlineY = yPosition + 6;
        pdf.setDrawColor(colors.primary);
        pdf.line(20, underlineY, 190, underlineY);
        yPosition = underlineY + 5;
      }
    };

    const ensurePageSpace = (needed: number) => {
      if (yPosition + needed > 285) { // bottom margin on A4
        pdf.addPage();
        yPosition = 20;
      }
    };

    // Header
    addHeader();

    // Summary
    if (resumeData.personalInfo.summary) {
      addSectionHeader('Professional Summary');
      pdf.setFontSize(12);
      pdf.setTextColor(colors.text);
      pdf.setFont('helvetica', 'normal');
      yPosition = addWrappedText(resumeData.personalInfo.summary, 20, yPosition, 170, 4) + 5;
    }

    // Skills
    if (Array.isArray(resumeData.skills) && resumeData.skills.length > 0) {
      addSectionHeader('Skills');
      pdf.setFontSize(12);
      pdf.setTextColor(colors.text);
      pdf.setFont('helvetica', 'normal');
      const skillsText = resumeData.skills.join(' • ');
      yPosition = addWrappedText(skillsText, 20, yPosition, 170, 4) + 5;
    }

    // Experience
    if (Array.isArray(resumeData.experience) && resumeData.experience.length > 0) {
      addSectionHeader('Experience');
      resumeData.experience.forEach(exp => {
        ensurePageSpace(25);
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(exp.title || 'Job Title', 20, yPosition);
        yPosition += 6;

        pdf.setFontSize(12);
        pdf.setTextColor(colors.secondary);
        pdf.setFont('helvetica', 'italic');
        pdf.text(exp.company || 'Company', 20, yPosition);
        yPosition += 5;

        pdf.setFontSize(10);
        pdf.setTextColor('#6b7280');
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${exp.startDate || 'Start Date'} - ${exp.endDate || (exp.current ? 'Present' : 'End Date')}`, 20, yPosition);
        yPosition += 5;

        if (exp.description) {
          pdf.setFontSize(11);
          pdf.setTextColor(colors.text);
          pdf.setFont('helvetica', 'normal');
          const bulletItems = Array.isArray(exp.description) ? exp.description : [exp.description];
          bulletItems.forEach(item => {
            ensurePageSpace(8);
            const wrapped = pdf.splitTextToSize(item, 165);
            // bullet dot
            pdf.text('•', 20, yPosition);
            if (Array.isArray(wrapped)) {
              pdf.text(wrapped, 25, yPosition);
              yPosition += wrapped.length * 4;
            } else {
              pdf.text(wrapped, 25, yPosition);
              yPosition += 4;
            }
          });
        }
        yPosition += 5;
      });
    }

    // Education
    if (Array.isArray(resumeData.education) && resumeData.education.length > 0) {
      addSectionHeader('Education');
      resumeData.education.forEach(edu => {
        ensurePageSpace(20);
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(edu.degree || 'Degree', 20, yPosition);
        yPosition += 6;

        pdf.setFontSize(12);
        pdf.setTextColor(colors.secondary);
        pdf.setFont('helvetica', 'italic');
        pdf.text(edu.institution || 'Institution', 20, yPosition);
        yPosition += 5;

        pdf.setFontSize(10);
        pdf.setTextColor('#6b7280');
        pdf.setFont('helvetica', 'normal');
        pdf.text(edu.year || 'Year', 20, yPosition);
        yPosition += 5;
      });
    }

    // Return as ArrayBuffer
    return pdf.output('arraybuffer');
  } catch (error) {
    console.error('Error generating PDF buffer:', error);
    throw error;
  }
};

// Generate a PDF from a rendered DOM node so it matches on-screen preview
// Using html2pdf.js for better SVG/icon handling
export const generatePDFFromDom = async (element: HTMLElement, filename?: string) => {
  try {
    const html2pdf = (await import('html2pdf.js')).default;

    // Ensure web fonts are loaded
    if (typeof (document as any).fonts?.ready === 'object') {
      try { await (document as any).fonts.ready; } catch (_) {}
    }

    // Find the resume element - try to find .resume-pages-container first
    let pagesContainer = document.querySelector('.resume-pages-container') as HTMLElement | null;
    
    // Also try searching within the element or its parent
    if (!pagesContainer) {
      pagesContainer = element.querySelector('.resume-pages-container') as HTMLElement | null;
    }
    if (!pagesContainer && element.parentElement) {
      pagesContainer = element.parentElement.querySelector('.resume-pages-container') as HTMLElement | null;
    }
    if (!pagesContainer && element.closest) {
      const parent = element.closest('[class*="resume"]') as HTMLElement | null;
      if (parent) {
        pagesContainer = parent.querySelector('.resume-pages-container') as HTMLElement | null;
      }
    }
    
    if (!pagesContainer) {
      throw new Error('Resume pages container not found');
    }
    
    // Get all pages and filter only those with content
    const allPages = pagesContainer.querySelectorAll('.resume-page');
    const pagesWithContent: HTMLElement[] = [];
    
    allPages.forEach((page) => {
      const pageEl = page as HTMLElement;
      const pageContent = pageEl.querySelector('.resume-page-content') as HTMLElement;
      const innerContent = pageEl.querySelector('[class*="resume-template"]') as HTMLElement;
      
      // Make page visible temporarily to check content
      const originalDisplay = pageEl.style.display;
      const originalVisibility = pageEl.style.visibility;
      pageEl.style.display = 'block';
      pageEl.style.visibility = 'visible';
      
      // Check if page has meaningful content (at least 100px height to avoid false positives)
      let hasContent = false;
      if (innerContent) {
        const contentHeight = innerContent.scrollHeight || innerContent.offsetHeight;
        // Check if there's actual text content, not just empty divs
        const textContent = innerContent.textContent?.trim() || '';
        hasContent = contentHeight > 100 && textContent.length > 50;
      } else if (pageContent) {
        const contentHeight = pageContent.scrollHeight || pageContent.offsetHeight;
        const textContent = pageContent.textContent?.trim() || '';
        hasContent = contentHeight > 100 && textContent.length > 50;
      }
      
      // Restore original styles
      pageEl.style.display = originalDisplay;
      pageEl.style.visibility = originalVisibility;
      
      if (hasContent) {
        pagesWithContent.push(pageEl);
      }
    });
    
    if (pagesWithContent.length === 0) {
      throw new Error('No pages with content found');
    }
    
    console.log(`Found ${pagesWithContent.length} page(s) with content`);
    
    // If only one page, capture it directly
    if (pagesWithContent.length === 1) {
      const pageElement = pagesWithContent[0];
      const measuredHeightPx = Math.max(
        pageElement.getBoundingClientRect().height,
        pageElement.scrollHeight,
        pageElement.offsetHeight
      );
      const pageHeightPx = Math.round(measuredHeightPx || PAGE_CONFIG.heightMm * MM_TO_PX);
      const pageHeightMm = pageHeightPx / MM_TO_PX;
      
      // Ensure page is visible and has correct dimensions (match preview exactly)
      const originalDisplay = pageElement.style.display;
      const originalVisibility = pageElement.style.visibility;
      const originalOpacity = pageElement.style.opacity;
      const originalBackground = pageElement.style.backgroundColor;
      const originalPadding = pageElement.style.padding;
      
      pageElement.style.display = 'block';
      pageElement.style.visibility = 'visible';
      pageElement.style.opacity = '1';
      pageElement.style.width = '210mm';
      pageElement.style.height = `${pageHeightMm}mm`;
      const computedPageBg = window.getComputedStyle(pageElement).backgroundColor || '#ffffff';
      const computedPagePadding = window.getComputedStyle(pageElement).padding || '0';
      pageElement.style.backgroundColor = computedPageBg;
      pageElement.style.padding = computedPagePadding;
      
      // Ensure page content has correct dimensions (matches preview exactly)
      const pageContent = pageElement.querySelector('.resume-page-content') as HTMLElement;
      const originalContentWidth = pageContent?.style.width || '';
      const originalContentHeight = pageContent?.style.height || '';
      const originalContentPadding = pageContent?.style.padding || '';
      const originalContentBoxSizing = pageContent?.style.boxSizing || '';
      const originalContentBackground = pageContent?.style.backgroundColor || '';
      const computedContentBg = pageContent ? (window.getComputedStyle(pageContent).backgroundColor || computedPageBg) : computedPageBg;
      const computedContentPadding = pageContent ? window.getComputedStyle(pageContent).padding : '';
      if (pageContent) {
        pageContent.style.width = '210mm';
        pageContent.style.height = `${pageHeightMm}mm`;
        pageContent.style.padding = computedContentPadding;
        pageContent.style.boxSizing = 'border-box';
        pageContent.style.backgroundColor = computedContentBg;
      }
      
      // DO NOT modify inner content styles - the preview already positions everything correctly
      // Any modifications here will cause layout shifts
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Use html2canvas + jsPDF directly instead of html2pdf.js to avoid extra blank pages
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const normalizedPageHeightMm = PAGE_CONFIG.heightMm;
      const pdf = new jsPDF({
        unit: 'mm',
        format: [PAGE_CONFIG.widthMm, normalizedPageHeightMm],
        orientation: 'portrait',
      });
      
      const portfolioLinkRect = getPortfolioLinkRect(pageElement);

      const exportId = `pdf-page-${Date.now()}`;
      pageElement.setAttribute('data-export-id', exportId);
      // Use a lower export scale when generating a buffer-only PDF (for email attachments)
      // to keep file size smaller while maintaining reasonable quality.
      const isBufferOnlyExport = filename === '__BUFFER_ONLY__';
      const baseScale = (window.devicePixelRatio || 1) * (isBufferOnlyExport ? 1.5 : 2.5);
      const exportScale = isBufferOnlyExport
        ? Math.min(2.5, Math.max(1.5, baseScale))
        : Math.min(4, Math.max(2.5, baseScale));
      const canvas = await html2canvas(pageElement, {
        scale: exportScale,
        backgroundColor: computedPageBg || '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        foreignObjectRendering: false,
        removeContainer: false,
        width: Math.round(PAGE_CONFIG.widthMm * MM_TO_PX), // 210mm in pixels
        height: Math.round(pageHeightPx), // match dynamic height exactly
        onclone: (clonedDoc) => {
          const clonedPageElement = clonedDoc.querySelector(`[data-export-id="${exportId}"]`) as HTMLElement;
          if (clonedPageElement) {
            clonedPageElement.style.width = '210mm';
            clonedPageElement.style.maxWidth = '210mm';
            clonedPageElement.style.minWidth = '210mm';
            clonedPageElement.style.boxSizing = 'border-box';
            clonedPageElement.style.backgroundColor = computedPageBg;
            clonedPageElement.style.padding = computedPagePadding;
          }
          const clonedPageContent = clonedPageElement?.querySelector('.resume-page-content') as HTMLElement;
          if (clonedPageContent) {
            clonedPageContent.style.width = '210mm';
            clonedPageContent.style.maxWidth = '210mm';
            clonedPageContent.style.minWidth = '210mm';
            clonedPageContent.style.boxSizing = 'border-box';
            clonedPageContent.style.backgroundColor = computedContentBg;
            if (computedContentPadding) {
              clonedPageContent.style.padding = computedContentPadding;
            }
          }
          // Ensure profile picture "N" is centered using absolute positioning
          const profilePics = clonedDoc.querySelectorAll('[class*="w-24"][class*="rounded-full"]');
          profilePics.forEach((pic) => {
            const picEl = pic as HTMLElement;
            picEl.style.display = 'flex';
            picEl.style.alignItems = 'center';
            picEl.style.justifyContent = 'center';
            picEl.style.position = 'relative';
            const span = picEl.querySelector('span');
            if (span) {
              const spanEl = span as HTMLElement;
              spanEl.style.display = 'block';
              spanEl.style.position = 'absolute';
              spanEl.style.margin = '0';
              spanEl.style.padding = '0';
              spanEl.style.textAlign = 'center';
              spanEl.style.width = '100%';
              spanEl.style.height = '50%';
            }
          });
          
          // Ensure profile picture is center-aligned with name/title/contact section
          const headerContainers = clonedDoc.querySelectorAll('[class*="flex"][class*="gap-4"]');
          headerContainers.forEach((container) => {
            const containerEl = container as HTMLElement;
            if (containerEl.querySelector('[class*="w-24"][class*="rounded-full"]')) {
              containerEl.style.display = 'flex';
              containerEl.style.alignItems = 'center';
              containerEl.style.setProperty('align-items', 'center', 'important');
              
              // Ensure profile picture container is also aligned and remove any padding that affects alignment
              const profilePicContainer = containerEl.querySelector('[class*="flex-shrink-0"]');
              if (profilePicContainer) {
                const picEl = profilePicContainer as HTMLElement;
                picEl.style.alignSelf = 'center';
                picEl.style.setProperty('align-self', 'center', 'important');
                picEl.style.paddingBottom = '0';
                picEl.style.setProperty('padding-bottom', '0', 'important');
              }
            }
          });
          
          // Preserve bullet point styles and alignment for skyline template
          const allLists = clonedDoc.querySelectorAll('ul.list-disc');
          allLists.forEach((list) => {
            const listEl = list as HTMLElement;
            listEl.style.display = 'block';
            listEl.style.listStyleType = 'none';
            listEl.style.listStylePosition = 'outside';
            listEl.style.paddingLeft = '0px';
            listEl.style.marginTop = '1px';
            listEl.style.marginBottom = '0px';
            listEl.style.color = '#000000';
            listEl.style.marginLeft = '0px';
            listEl.style.marginRight = '0px';
            listEl.style.setProperty('list-style-type', 'none', 'important');
            listEl.style.setProperty('padding-left', '0px', 'important');
            const listItems = listEl.querySelectorAll('li');
            listItems.forEach((li) => {
              const liEl = li as HTMLElement;
              liEl.style.display = 'flex';
              liEl.style.alignItems = 'flex-start';
              liEl.style.listStyleType = 'none';
              liEl.style.listStylePosition = 'outside';
              liEl.style.marginBottom = '0px';
              liEl.style.lineHeight = '1.4';
              liEl.style.color = '#000000';
              liEl.style.paddingLeft = '0px';
              liEl.style.marginLeft = '0px';
              liEl.style.textAlign = 'left';
              liEl.style.position = 'relative';
              liEl.style.columnGap = '6px';
              liEl.style.setProperty('list-style-type', 'none', 'important');
              liEl.style.setProperty('padding-left', '0px', 'important');
              liEl.style.width = '100%';

              // Inject a manual bullet so html2canvas renders a perfectly aligned dot
              let bulletSpan = liEl.querySelector('[data-pdf-bullet]');
              if (!bulletSpan) {
                bulletSpan = clonedDoc.createElement('span');
                bulletSpan.setAttribute('data-pdf-bullet', 'true');
                bulletSpan.textContent = '•';
                const bulletEl = bulletSpan as HTMLElement;
                bulletEl.style.display = 'inline-block';
                bulletEl.style.minWidth = '8px';
                bulletEl.style.marginTop = '0.2em';
                bulletEl.style.lineHeight = '1';
                bulletEl.style.fontSize = '14px';
                bulletEl.style.color = '#000000';
                bulletEl.style.textAlign = 'center';
                liEl.insertBefore(bulletSpan, liEl.firstChild);
              }

              // Wrap remaining text in a span to keep it aligned beside the bullet
              let textWrapper = liEl.querySelector('[data-pdf-bullet-text]');
              if (!textWrapper) {
                textWrapper = clonedDoc.createElement('span');
                textWrapper.setAttribute('data-pdf-bullet-text', 'true');
                const textWrapperEl = textWrapper as HTMLElement;
                textWrapperEl.style.display = 'inline-flex';
                textWrapperEl.style.flexDirection = 'column';
                textWrapperEl.style.flex = '1';
                textWrapperEl.style.margin = '0';
                textWrapperEl.style.padding = '0';
                textWrapperEl.style.color = '#000000';
                textWrapperEl.style.lineHeight = '1.4';
                // Move existing child nodes (except the bullet) into the wrapper
                while (liEl.childNodes.length > 1) {
                  textWrapper.appendChild(liEl.childNodes[1]);
                }
                liEl.appendChild(textWrapper);
              }
            });
          });
          
          // Explicitly preserve blue color for company names (check inline styles)
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const elStyle = (el as HTMLElement).style;
            const styleAttr = (el as HTMLElement).getAttribute('style') || '';
            // If element has #007AFF in its inline style, preserve it
            if (styleAttr.includes('#007AFF') || styleAttr.includes('007AFF')) {
              elStyle.color = '#007AFF';
              elStyle.setProperty('color', '#007AFF', 'important');
              elStyle.fontFamily = '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif';
              elStyle.setProperty('font-family', '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif', 'important');
              elStyle.fontWeight = '500';
              elStyle.setProperty('font-weight', '500', 'important');
              elStyle.letterSpacing = '0.01em';
              elStyle.setProperty('letter-spacing', '0.01em', 'important');
              }
          });
          
          // Preserve all colors explicitly (especially for skyline template)
          const allTextElements = clonedDoc.querySelectorAll('*');
          allTextElements.forEach((el) => {
            const elStyle = (el as HTMLElement).style;
            const computedStyle = window.getComputedStyle(el as HTMLElement);
            const inlineColor = elStyle.color;
            const computedColor = computedStyle.color;
            
            // Preserve company name blue color (#007AFF) - check multiple formats
            if (inlineColor === '#007AFF' || inlineColor === 'rgb(26, 138, 179)' || 
                computedColor === 'rgb(26, 138, 179)' || computedColor === '#007AFF' ||
                inlineColor.includes('007AFF') || computedColor.includes('26, 138, 179')) {
              elStyle.color = '#007AFF';
              elStyle.setProperty('color', '#007AFF', 'important');
              elStyle.fontFamily = '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif';
              elStyle.setProperty('font-family', '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif', 'important');
              elStyle.fontWeight = '500';
              elStyle.setProperty('font-weight', '500', 'important');
              elStyle.letterSpacing = '0.01em';
              elStyle.setProperty('letter-spacing', '0.01em', 'important');
            }
            // Preserve gray colors for titles
            else if (computedColor === 'rgb(128, 128, 128)' || computedColor === 'rgb(153, 153, 153)' ||
                     computedColor === '#808080' || computedColor === '#999999') {
              elStyle.color = computedColor;
              elStyle.setProperty('color', computedColor, 'important');
            }
            // Preserve other non-black text colors
            else if (computedColor && computedColor !== 'rgb(0, 0, 0)' && computedColor !== 'rgba(0, 0, 0, 0)' && 
                     computedColor !== '#000000' && computedColor !== 'black') {
              elStyle.color = computedColor;
            }
          });
        }
      });
      
      const expectedCanvasWidth = Math.round(PAGE_CONFIG.widthMm * MM_TO_PX * 2);
      const expectedCanvasHeight = Math.round(pageHeightPx * 2);
      let finalCanvas = canvas;
      if (canvas.width !== expectedCanvasWidth || canvas.height !== expectedCanvasHeight) {
        console.log(`Canvas size mismatch (single page): got ${canvas.width}x${canvas.height}, expected ${expectedCanvasWidth}x${expectedCanvasHeight}`);
        const correctedCanvas = document.createElement('canvas');
        correctedCanvas.width = expectedCanvasWidth;
        correctedCanvas.height = expectedCanvasHeight;
        const ctx = correctedCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, correctedCanvas.width, correctedCanvas.height);
          ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, expectedCanvasWidth, expectedCanvasHeight);
        }
        finalCanvas = correctedCanvas;
      }
      
      // Use JPEG with medium-high quality to significantly reduce attachment size,
      // especially for Gmail drafts, while staying visually close to the preview.
      const imageData = finalCanvas.toDataURL('image/jpeg', isBufferOnlyExport ? 0.82 : 0.9);
      // Place image at (0, 0) with exact 210mm width and the page's true height
      const imageWidthMm = PAGE_CONFIG.widthMm;
      const imageHeightMm = pageHeightMm;
      pdf.addImage(imageData, 'PNG', 0, 0, imageWidthMm, imageHeightMm);

      if (portfolioLinkRect) {
        pdf.link(
          portfolioLinkRect.xMm,
          portfolioLinkRect.yMm,
          portfolioLinkRect.widthMm,
          portfolioLinkRect.heightMm,
          { url: portfolioLinkRect.url }
        );
      }

      pageElement.removeAttribute('data-export-id');
      
      const outName = filename || `Resume_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
      // Either save to disk or return an ArrayBuffer, depending on caller
      let result: string | ArrayBuffer;
      if (filename === '__BUFFER_ONLY__') {
        result = pdf.output('arraybuffer');
      } else {
      pdf.save(outName);
        result = outName;
      }
      
      // Restore styles
      pageElement.style.display = originalDisplay;
      pageElement.style.visibility = originalVisibility;
      pageElement.style.opacity = originalOpacity;
      pageElement.style.backgroundColor = originalBackground;
      pageElement.style.padding = originalPadding;
      pageElement.style.padding = originalPadding;
      const pageContentToRestoreSingle = pageElement.querySelector('.resume-page-content') as HTMLElement;
      if (pageContentToRestoreSingle) {
        pageContentToRestoreSingle.style.width = originalContentWidth;
        pageContentToRestoreSingle.style.height = originalContentHeight;
        pageContentToRestoreSingle.style.padding = originalContentPadding;
        pageContentToRestoreSingle.style.boxSizing = originalContentBoxSizing;
        pageContentToRestoreSingle.style.backgroundColor = originalContentBackground;
      }
      
      return result;
    }
    
    // Multiple pages - capture each separately and combine
    const jsPDF = (await import('jspdf')).default;
    const html2canvas = (await import('html2canvas')).default;
    
    const pdf = new jsPDF({
      unit: 'mm',
      format: [PAGE_CONFIG.widthMm, PAGE_CONFIG.heightMm],
      orientation: 'portrait',
    });
    
    const isBufferOnlyExport = filename === '__BUFFER_ONLY__';

    for (let i = 0; i < pagesWithContent.length; i++) {
      const pageElement = pagesWithContent[i];
      const measuredHeightPx = Math.max(
        pageElement.getBoundingClientRect().height,
        pageElement.scrollHeight,
        pageElement.offsetHeight
      );
      const pageHeightPx = Math.round(measuredHeightPx || PAGE_CONFIG.heightMm * MM_TO_PX);
      const pageHeightMm = pageHeightPx / MM_TO_PX;
      
      // Ensure page is visible and has correct dimensions (match preview exactly)
      const originalDisplay = pageElement.style.display;
      const originalVisibility = pageElement.style.visibility;
      const originalOpacity = pageElement.style.opacity;
      const originalPageWidth = pageElement.style.width;
      const originalPageHeight = pageElement.style.height;
      const originalPageBoxSizing = pageElement.style.boxSizing;
      const originalBackground = pageElement.style.backgroundColor;
      const originalPadding = pageElement.style.padding;
      
      pageElement.style.display = 'block';
      pageElement.style.visibility = 'visible';
      pageElement.style.opacity = '1';
      pageElement.style.width = '210mm';
      pageElement.style.height = `${pageHeightMm}mm`;
      pageElement.style.boxSizing = 'border-box';
      pageElement.style.maxWidth = '210mm';
      pageElement.style.minWidth = '210mm';
      const computedPageBg = window.getComputedStyle(pageElement).backgroundColor || '#ffffff';
      const computedPagePadding = window.getComputedStyle(pageElement).padding || '0';
      pageElement.style.backgroundColor = computedPageBg;
      pageElement.style.padding = computedPagePadding;
      
      const pageContent = pageElement.querySelector('.resume-page-content') as HTMLElement;
      let originalContentWidth = '';
      let originalContentHeight = '';
      let originalContentPadding = '';
      let originalContentBoxSizing = '';
      let originalContentBackground = '';
      const computedContentBg = pageContent ? (window.getComputedStyle(pageContent).backgroundColor || computedPageBg) : computedPageBg;
      const computedContentPadding = pageContent ? window.getComputedStyle(pageContent).padding || '0' : '0';
      
      if (pageContent) {
        originalContentWidth = pageContent.style.width;
        originalContentHeight = pageContent.style.height;
        originalContentPadding = pageContent.style.padding;
        originalContentBoxSizing = pageContent.style.boxSizing;
        originalContentBackground = pageContent.style.backgroundColor || '';
        
        pageContent.style.width = '210mm';
        pageContent.style.height = `${pageHeightMm}mm`;
        pageContent.style.padding = computedContentPadding;
        pageContent.style.boxSizing = 'border-box';
        pageContent.style.maxWidth = '210mm';
        pageContent.style.minWidth = '210mm';
        pageContent.style.backgroundColor = computedContentBg;
      }
      
      // DO NOT modify inner content styles - the preview already positions everything correctly
      // Any modifications here will cause layout shifts
      
      if (i > 0) {
        pdf.addPage([PAGE_CONFIG.widthMm, PAGE_CONFIG.heightMm], 'portrait');
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const portfolioLinkRect = getPortfolioLinkRect(pageElement);

      const exportId = `pdf-page-${i}-${Date.now()}`;
      pageElement.setAttribute('data-export-id', exportId);
      // Lower export scale for buffer-only mode (email attachments) to reduce size.
      const baseScalePerPage = (window.devicePixelRatio || 1) * (isBufferOnlyExport ? 1.5 : 2.5);
      const exportScalePerPage = isBufferOnlyExport
        ? Math.min(2.5, Math.max(1.5, baseScalePerPage))
        : Math.min(4, Math.max(2.5, baseScalePerPage));
      const canvas = await html2canvas(pageElement, {
        scale: exportScalePerPage,
        backgroundColor: computedPageBg || '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        foreignObjectRendering: false,
        removeContainer: false,
        width: Math.round(210 * MM_TO_PX), // 210mm in pixels
        height: Math.round(pageHeightPx), // match dynamic height exactly
        onclone: (clonedDoc) => {
          // Ensure consistent width across all pages
          const clonedPageElement = clonedDoc.querySelector(`[data-export-id="${exportId}"]`) as HTMLElement;
          if (clonedPageElement) {
            clonedPageElement.style.width = '210mm';
            clonedPageElement.style.maxWidth = '210mm';
            clonedPageElement.style.minWidth = '210mm';
            clonedPageElement.style.boxSizing = 'border-box';
            clonedPageElement.style.backgroundColor = computedPageBg;
            clonedPageElement.style.padding = computedPagePadding;
          }
          const clonedPageContent = clonedPageElement?.querySelector('.resume-page-content') as HTMLElement;
          if (clonedPageContent) {
            clonedPageContent.style.width = '210mm';
            clonedPageContent.style.maxWidth = '210mm';
            clonedPageContent.style.minWidth = '210mm';
            clonedPageContent.style.boxSizing = 'border-box';
            clonedPageContent.style.backgroundColor = computedContentBg;
            clonedPageContent.style.padding = computedContentPadding;
          }
          
          // Ensure profile picture "N" is centered using absolute positioning
          const profilePics = clonedDoc.querySelectorAll('[class*="w-24"][class*="rounded-full"]');
          profilePics.forEach((pic) => {
            const picEl = pic as HTMLElement;
            picEl.style.display = 'flex';
            picEl.style.alignItems = 'center';
            picEl.style.justifyContent = 'center';
            picEl.style.position = 'relative';
            const span = picEl.querySelector('span');
            if (span) {
              const spanEl = span as HTMLElement;
              spanEl.style.display = 'block';
              spanEl.style.position = 'absolute';
              spanEl.style.margin = '0';
              spanEl.style.padding = '0';
              spanEl.style.textAlign = 'center';
              spanEl.style.width = '100%';
              spanEl.style.height = '50%';
            }
          });
          
          // Ensure profile picture is center-aligned with name/title/contact section
          const headerContainers = clonedDoc.querySelectorAll('[class*="flex"][class*="gap-4"]');
          headerContainers.forEach((container) => {
            const containerEl = container as HTMLElement;
            if (containerEl.querySelector('[class*="w-24"][class*="rounded-full"]')) {
              containerEl.style.display = 'flex';
              containerEl.style.alignItems = 'center';
              containerEl.style.setProperty('align-items', 'center', 'important');
              
              // Ensure profile picture container is also aligned and remove any padding that affects alignment
              const profilePicContainer = containerEl.querySelector('[class*="flex-shrink-0"]');
              if (profilePicContainer) {
                const picEl = profilePicContainer as HTMLElement;
                picEl.style.alignSelf = 'center';
                picEl.style.setProperty('align-self', 'center', 'important');
                picEl.style.paddingBottom = '0';
                picEl.style.setProperty('padding-bottom', '0', 'important');
              }
            }
          });
          
          // Preserve bullet point styles and alignment for skyline template
          const allLists = clonedDoc.querySelectorAll('ul.list-disc');
          allLists.forEach((list) => {
            const listEl = list as HTMLElement;
            listEl.style.display = 'block';
            listEl.style.listStyleType = 'none';
            listEl.style.listStylePosition = 'outside';
            listEl.style.paddingLeft = '0px';
            listEl.style.marginTop = '1px';
            listEl.style.marginBottom = '0px';
            listEl.style.color = '#000000';
            listEl.style.marginLeft = '0px';
            listEl.style.marginRight = '0px';
            listEl.style.setProperty('list-style-type', 'none', 'important');
            listEl.style.setProperty('padding-left', '0px', 'important');
            const listItems = listEl.querySelectorAll('li');
            listItems.forEach((li) => {
              const liEl = li as HTMLElement;
              liEl.style.display = 'flex';
              liEl.style.alignItems = 'flex-start';
              liEl.style.listStyleType = 'none';
              liEl.style.listStylePosition = 'outside';
              liEl.style.marginBottom = '0px';
              liEl.style.lineHeight = '1.4';
              liEl.style.color = '#000000';
              liEl.style.paddingLeft = '0px';
              liEl.style.marginLeft = '0px';
              liEl.style.textAlign = 'left';
              liEl.style.position = 'relative';
              liEl.style.columnGap = '6px';
              liEl.style.setProperty('list-style-type', 'none', 'important');
              liEl.style.setProperty('padding-left', '0px', 'important');
              liEl.style.width = '100%';

              // Inject a manual bullet so html2canvas renders a perfectly aligned dot
              let bulletSpan = liEl.querySelector('[data-pdf-bullet]');
              if (!bulletSpan) {
                bulletSpan = clonedDoc.createElement('span');
                bulletSpan.setAttribute('data-pdf-bullet', 'true');
                bulletSpan.textContent = '•';
                const bulletEl = bulletSpan as HTMLElement;
                bulletEl.style.display = 'inline-block';
                bulletEl.style.minWidth = '8px';
                bulletEl.style.marginTop = '0.2em';
                bulletEl.style.lineHeight = '1';
                bulletEl.style.fontSize = '14px';
                bulletEl.style.color = '#000000';
                bulletEl.style.textAlign = 'center';
                liEl.insertBefore(bulletSpan, liEl.firstChild);
              }

              // Wrap remaining text in a span to keep it aligned beside the bullet
              let textWrapper = liEl.querySelector('[data-pdf-bullet-text]');
              if (!textWrapper) {
                textWrapper = clonedDoc.createElement('span');
                textWrapper.setAttribute('data-pdf-bullet-text', 'true');
                const textWrapperEl = textWrapper as HTMLElement;
                textWrapperEl.style.display = 'inline-flex';
                textWrapperEl.style.flexDirection = 'column';
                textWrapperEl.style.flex = '1';
                textWrapperEl.style.margin = '0';
                textWrapperEl.style.padding = '0';
                textWrapperEl.style.color = '#000000';
                textWrapperEl.style.lineHeight = '1.4';
                // Move existing child nodes (except the bullet) into the wrapper
                while (liEl.childNodes.length > 1) {
                  textWrapper.appendChild(liEl.childNodes[1]);
                }
                liEl.appendChild(textWrapper);
              }
            });
          });
          
          // Explicitly preserve blue color for company names (check inline styles)
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const elStyle = (el as HTMLElement).style;
            const styleAttr = (el as HTMLElement).getAttribute('style') || '';
            // If element has #007AFF in its inline style, preserve it
            if (styleAttr.includes('#007AFF') || styleAttr.includes('007AFF')) {
              elStyle.color = '#007AFF';
              elStyle.setProperty('color', '#007AFF', 'important');
              elStyle.fontFamily = '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif';
              elStyle.setProperty('font-family', '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif', 'important');
              elStyle.fontWeight = '500';
              elStyle.setProperty('font-weight', '500', 'important');
              elStyle.letterSpacing = '0.01em';
              elStyle.setProperty('letter-spacing', '0.01em', 'important');
              }
          });
          
          // Preserve all colors explicitly (especially for skyline template)
          const allTextElements = clonedDoc.querySelectorAll('*');
          allTextElements.forEach((el) => {
            const elStyle = (el as HTMLElement).style;
            const computedStyle = window.getComputedStyle(el as HTMLElement);
            const inlineColor = elStyle.color;
            const computedColor = computedStyle.color;
            
            // Preserve company name blue color (#007AFF) - check multiple formats
            if (inlineColor === '#007AFF' || inlineColor === 'rgb(26, 138, 179)' || 
                computedColor === 'rgb(26, 138, 179)' || computedColor === '#007AFF' ||
                inlineColor.includes('007AFF') || computedColor.includes('26, 138, 179')) {
              elStyle.color = '#007AFF';
              elStyle.setProperty('color', '#007AFF', 'important');
              elStyle.fontFamily = '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif';
              elStyle.setProperty('font-family', '"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif', 'important');
              elStyle.fontWeight = '500';
              elStyle.setProperty('font-weight', '500', 'important');
              elStyle.letterSpacing = '0.01em';
              elStyle.setProperty('letter-spacing', '0.01em', 'important');
            }
            // Preserve gray colors for titles
            else if (computedColor === 'rgb(128, 128, 128)' || computedColor === 'rgb(153, 153, 153)' ||
                     computedColor === '#808080' || computedColor === '#999999') {
              elStyle.color = computedColor;
              elStyle.setProperty('color', computedColor, 'important');
            }
            // Preserve other non-black text colors
            else if (computedColor && computedColor !== 'rgb(0, 0, 0)' && computedColor !== 'rgba(0, 0, 0, 0)' && 
                     computedColor !== '#000000' && computedColor !== 'black') {
              elStyle.color = computedColor;
            }
          });
        }
      });
      
      // Ensure canvas width is exactly 210mm (794px at 2x scale)
      const expectedCanvasWidth = Math.round(PAGE_CONFIG.widthMm * MM_TO_PX * 2); // 2x scale
      const expectedCanvasHeight = Math.round(pageHeightPx * 2); // 2x scale
      
      let finalCanvas = canvas;
      
      // If canvas dimensions don't match expected, create a new canvas with exact dimensions
      if (canvas.width !== expectedCanvasWidth || canvas.height !== expectedCanvasHeight) {
        console.log(`Canvas size mismatch for page ${i + 1}: got ${canvas.width}x${canvas.height}, expected ${expectedCanvasWidth}x${expectedCanvasHeight}`);
        const correctedCanvas = document.createElement('canvas');
        correctedCanvas.width = expectedCanvasWidth;
        correctedCanvas.height = expectedCanvasHeight;
        const ctx = correctedCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, correctedCanvas.width, correctedCanvas.height);
          // Draw the original canvas, scaling to fit exactly
          ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, expectedCanvasWidth, expectedCanvasHeight);
        }
        finalCanvas = correctedCanvas;
      }
      
      const imageData = finalCanvas.toDataURL('image/jpeg', isBufferOnlyExport ? 0.82 : 0.9);
      // Maintain aspect ratio derived from canvas to prevent vertical compression
      const imageWidthMm = PAGE_CONFIG.widthMm;
      const imageHeightMm = (finalCanvas.height / finalCanvas.width) * imageWidthMm;
      pdf.addImage(imageData, 'PNG', 0, 0, imageWidthMm, imageHeightMm);

      if (portfolioLinkRect) {
        pdf.link(
          portfolioLinkRect.xMm,
          portfolioLinkRect.yMm,
          portfolioLinkRect.widthMm,
          portfolioLinkRect.heightMm,
          { url: portfolioLinkRect.url }
        );
      }
      
      // Restore styles
      pageElement.style.display = originalDisplay;
      pageElement.style.visibility = originalVisibility;
      pageElement.style.opacity = originalOpacity;
      pageElement.style.backgroundColor = originalBackground;
      pageElement.style.width = originalPageWidth;
      pageElement.style.height = originalPageHeight;
      pageElement.style.boxSizing = originalPageBoxSizing || '';
      pageElement.style.maxWidth = '';
      pageElement.style.minWidth = '';
      
      pageElement.removeAttribute('data-export-id');

      const pageContentToRestore = pageElement.querySelector('.resume-page-content') as HTMLElement;
      if (pageContentToRestore) {
        pageContentToRestore.style.width = originalContentWidth;
        pageContentToRestore.style.height = originalContentHeight;
        pageContentToRestore.style.padding = originalContentPadding;
        pageContentToRestore.style.boxSizing = originalContentBoxSizing || '';
        pageContentToRestore.style.backgroundColor = originalContentBackground;
        pageContentToRestore.style.maxWidth = '';
        pageContentToRestore.style.minWidth = '';
      }
    }
    
    const outName = filename || `Resume_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
    if (filename === '__BUFFER_ONLY__') {
      return pdf.output('arraybuffer');
    }
    pdf.save(outName);
    
    return outName;
  } catch (error) {
    console.error('Error generating PDF from DOM:', error);
    throw error;
  } finally {
    document.body.classList.remove('pdf-exporting');
  }
};

export const generatePDFFromDomAsArrayBuffer = async (element: HTMLElement): Promise<ArrayBuffer> => {
  const jsPDF = (await import('jspdf')).default;
  const html2canvas = (await import('html2canvas')).default;

  document.body.classList.add('pdf-exporting');
  try {
    // Wait for fonts
    if (document && (document as any).fonts && (document as any).fonts.ready) {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }

    // Validate element before rendering
    if (!element || !element.offsetWidth || !element.offsetHeight) {
      throw new Error('Invalid element: element has no dimensions');
    }

    const exportScale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2));
    const canvas = await html2canvas(element, {
      // Match download quality to preview fidelity
      scale: exportScale,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false, // Disable logging for production
      foreignObjectRendering: false, // Disable - can cause blank pages
      removeContainer: false,
      // Ensure exact rendering match
      width: element.offsetWidth,
      height: element.offsetHeight,
      // Better quality options
      imageTimeout: 15000,
      onclone: (clonedDoc) => {
        // Ensure fonts and styling match preview exactly
        const clonedElement = clonedDoc.querySelector('[class*="print-optimized"]') || clonedDoc.body;
        if (clonedElement) {
          const htmlElement = clonedElement as HTMLElement;
          htmlElement.style.visibility = 'visible';
          htmlElement.style.opacity = '1';
        }
      }
    });

    // Validate canvas was created successfully
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error(`Canvas rendering failed: canvas dimensions are ${canvas?.width}x${canvas?.height}`);
    }

    console.log(`Canvas rendered: ${canvas.width}x${canvas.height}px`);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 5;
    
    // Match preview container dimensions exactly
    // Preview container: 210mm width with 5mm padding on each side = 200mm content width
    const previewContentWidth = 200; // 210mm - 5mm*2 (preview padding)
    const imgWidth = previewContentWidth; // Match preview content width exactly
    const availableHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // Center the content horizontally: (210mm - 200mm) / 2 = 5mm from left
    const horizontalOffset = (pageWidth - imgWidth) / 2;
    
    // Validate dimensions
    if (imgWidth <= 0 || imgHeight <= 0) {
      throw new Error(`Invalid image dimensions: ${imgWidth}x${imgHeight}mm`);
    }
    
    // Use JPEG with compression to reduce file size while maintaining good quality
    const imageData = canvas.toDataURL('image/png');
    
    // Validate image data
    if (!imageData || imageData === 'data:,') {
      throw new Error('Failed to generate image data from canvas');
    }
    
    // If content fits on one page, add it directly
    if (imgHeight <= availableHeight + 0.5) {
      console.log(`Adding single-page PDF: ${imgWidth}x${imgHeight}mm`);
      pdf.addImage(imageData, 'PNG', horizontalOffset, margin, imgWidth, imgHeight);
    } else {
      // Multi-page content - slice vertically without compression
      console.log(`Content exceeds one page (${imgHeight.toFixed(1)}mm > ${availableHeight}mm), creating multi-page PDF`);
      const pxPerMm = canvas.width / imgWidth;
      const pageHeightPx = availableHeight * pxPerMm;
      let sY = 0;
      const overlapPx = Math.max(20, Math.round(pxPerMm * 2)); // Small overlap to prevent text cropping
      
      while (sY < canvas.height) {
        const isLast = sY + pageHeightPx >= canvas.height;
        const sliceHeight = Math.min(pageHeightPx + (isLast ? 0 : overlapPx), canvas.height - sY);
        
        // Create a canvas for this page slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(canvas, 0, sY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        }
        
        if (sY > 0) pdf.addPage('a4', 'portrait');
        
        // Calculate height in mm for this slice
        const sliceHeightMm = (sliceHeight / pxPerMm);
        const sliceImageData = pageCanvas.toDataURL('image/png');
        
        pdf.addImage(sliceImageData, 'PNG', horizontalOffset, margin, imgWidth, sliceHeightMm);
        
        sY += isLast ? sliceHeight : (pageHeightPx);
        
        // Yield to browser
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return pdf.output('arraybuffer');
  } finally {
    document.body.classList.remove('pdf-exporting');
  }
};

// Server-side DOM-to-PDF buffer generation (for Gmail attachments)
export const generatePDFFromDomBuffer = async (resumeData: ResumeData, selectedTemplate: string): Promise<ArrayBuffer> => {
  try {
    // This is a server-side function, so we need to use a different approach
    // We'll use the programmatic PDF generation but with the same styling as DOM
    const jsPDF = (await import('jspdf')).default;
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const colors = getTemplateColors(selectedTemplate);
    let yPosition = 20;

    const addWrappedText = (text: string, x: number, y: number, maxWidth = 170, lineHeight = 4) => {
      const lines = pdf.splitTextToSize(text, maxWidth);
      if (Array.isArray(lines)) {
        lines.forEach((line, index) => {
          pdf.text(line, x, y + (index * lineHeight));
        });
        return y + (lines.length * lineHeight);
      }
      pdf.text(lines, x, y);
      return y + lineHeight;
    };

    const addHeader = () => {
      if (selectedTemplate === 'ats-modern') {
        // ATS Modern header with structured layout
        pdf.setFontSize(24);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', 20, yPosition);
        yPosition += 12;

        pdf.setFontSize(11);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        
        // Two-column contact info
        const contactInfo = [
          `Email: ${resumeData.personalInfo.email || 'your.email@example.com'}`,
          `Phone: ${resumeData.personalInfo.phone || '(555) 123-4567'}`,
          `Location: ${resumeData.personalInfo.location || 'City, State'}`,
          `LinkedIn: ${resumeData.personalInfo.linkedin || 'linkedin.com/in/yourprofile'}`
        ];
        
        contactInfo.forEach((info, index) => {
          const x = index % 2 === 0 ? 20 : 110;
          const y = yPosition + (Math.floor(index / 2) * 6);
          pdf.text(info, x, y);
        });
        yPosition += 12;
      } else if (selectedTemplate === 'ats-modern') {
        // ATS Compact centered header
        pdf.setFontSize(20);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        const nameWidth = pdf.getTextWidth(resumeData.personalInfo.fullName || 'Your Name');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', (210 - nameWidth) / 2, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        
        const contactLine = [
          resumeData.personalInfo.email || 'your.email@example.com',
          resumeData.personalInfo.phone || '(555) 123-4567',
          resumeData.personalInfo.location || 'City, State',
          resumeData.personalInfo.linkedin || 'linkedin.com/in/yourprofile'
        ].join(' • ');
        
        const contactWidth = pdf.getTextWidth(contactLine);
        pdf.text(contactLine, (210 - contactWidth) / 2, yPosition);
        yPosition += 10;
      } else {
        // Default header for other templates
        pdf.setFontSize(24);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(resumeData.personalInfo.fullName || 'Your Name', 20, yPosition);
        yPosition += 10;

        pdf.setFontSize(12);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        if (resumeData.personalInfo.email) { pdf.text(resumeData.personalInfo.email, 20, yPosition); yPosition += 5; }
        if (resumeData.personalInfo.phone) { pdf.text(resumeData.personalInfo.phone, 20, yPosition); yPosition += 5; }
        if (resumeData.personalInfo.location) { pdf.text(resumeData.personalInfo.location, 20, yPosition); yPosition += 5; }
        yPosition += 5;
      }
    };

    const addSectionHeader = (label: string) => {
      if (selectedTemplate === 'ats-modern' || selectedTemplate === 'ats-modern') {
        // ATS-friendly section headers
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label.toUpperCase(), 20, yPosition);
        
        // Add underline for ATS templates
        const textWidth = pdf.getTextWidth(label.toUpperCase());
        pdf.setDrawColor(colors.primary);
        pdf.line(20, yPosition + 1, 20 + textWidth, yPosition + 1);
        yPosition += 8;
      } else {
        // Default section headers
        pdf.setFontSize(16);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label, 20, yPosition);
        const underlineY = yPosition + 6;
        pdf.setDrawColor(colors.primary);
        pdf.line(20, underlineY, 190, underlineY);
        yPosition = underlineY + 5;
      }
    };

    const ensurePageSpace = (needed: number) => {
      if (yPosition + needed > 285) { // bottom margin on A4
        pdf.addPage();
        yPosition = 20;
      }
    };

    // Add header
    addHeader();

    // Professional Summary
    if (resumeData.personalInfo.summary) {
      ensurePageSpace(15);
      addSectionHeader('Professional Summary');
      yPosition = addWrappedText(resumeData.personalInfo.summary, 20, yPosition);
      yPosition += 5;
    }

    // Professional Experience
    if (resumeData.experience && resumeData.experience.length > 0) {
      ensurePageSpace(20);
      addSectionHeader('Professional Experience');
      
      resumeData.experience.forEach((exp) => {
        ensurePageSpace(15);
        
        // Job title and dates
        pdf.setFontSize(14);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(exp.title, 20, yPosition);
        
        const dateText = `${exp.startDate} - ${exp.current ? 'Present' : exp.endDate}`;
        const dateWidth = pdf.getTextWidth(dateText);
        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        pdf.text(dateText, 190 - dateWidth, yPosition);
        yPosition += 6;
        
        // Company and location
        pdf.setFontSize(12);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${exp.company} | ${exp.location}`, 20, yPosition);
        yPosition += 8;
        
        // Description bullets
        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        exp.description.forEach((desc) => {
          ensurePageSpace(8);
          yPosition = addWrappedText(`• ${desc}`, 25, yPosition, 165);
          yPosition += 2;
        });
        yPosition += 5;
      });
    }

    // Skills
    if (resumeData.skills && resumeData.skills.length > 0) {
      ensurePageSpace(15);
      addSectionHeader('Technical Skills');
      
      const skillsText = resumeData.skills.join(' • ');
      yPosition = addWrappedText(skillsText, 20, yPosition);
      yPosition += 8;
    }

    // Education
    if (resumeData.education && resumeData.education.length > 0) {
      ensurePageSpace(15);
      addSectionHeader('Education');
      
      resumeData.education.forEach((edu) => {
        ensurePageSpace(12);
        
        pdf.setFontSize(12);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(edu.degree, 20, yPosition);
        
        const yearWidth = pdf.getTextWidth(edu.year);
        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        pdf.text(edu.year, 190 - yearWidth, yPosition);
        yPosition += 5;
        
        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${edu.institution} | ${edu.location}`, 20, yPosition);
        yPosition += 6;
        
        if (edu.gpa) {
          pdf.setFontSize(10);
          pdf.setTextColor(colors.text);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`GPA: ${edu.gpa}`, 20, yPosition);
          yPosition += 5;
        }
        yPosition += 3;
      });
    }

    // Projects
    if (resumeData.projects && resumeData.projects.length > 0) {
      ensurePageSpace(15);
      addSectionHeader('Projects');
      
      resumeData.projects.forEach((project) => {
        ensurePageSpace(12);
        
        pdf.setFontSize(12);
        pdf.setTextColor(colors.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(project.name, 20, yPosition);
        yPosition += 6;
        
        pdf.setFontSize(10);
        pdf.setTextColor(colors.text);
        pdf.setFont('helvetica', 'normal');
        yPosition = addWrappedText(project.description, 20, yPosition, 170);
        yPosition += 3;
        
        if (project.technologies && project.technologies.length > 0) {
          const techText = `Technologies: ${project.technologies.join(', ')}`;
          yPosition = addWrappedText(techText, 20, yPosition, 170);
          yPosition += 3;
        }
        yPosition += 3;
      });
    }

    // Achievements
    if (resumeData.achievements && resumeData.achievements.length > 0) {
      ensurePageSpace(15);
      addSectionHeader('Key Achievements');
      
      resumeData.achievements.forEach((achievement) => {
        ensurePageSpace(8);
        yPosition = addWrappedText(`• ${achievement}`, 25, yPosition, 165);
        yPosition += 2;
      });
    }

    return pdf.output('arraybuffer');
  } catch (error) {
    console.error('Error generating PDF buffer:', error);
    throw error;
  }
};


