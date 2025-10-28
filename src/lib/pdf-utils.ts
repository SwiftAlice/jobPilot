import { ResumeData, ResumeTemplate } from '@/types/resume-builder-types';

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
export const generatePDFFromDom = async (element: HTMLElement, filename?: string) => {
  try {
    const jsPDF = (await import('jspdf')).default;
    const html2canvas = (await import('html2canvas')).default;

    // Mark body as exporting to allow CSS tweaks for PDF alignment
    document.body.classList.add('pdf-exporting');

    // Ensure web fonts are loaded to avoid blank glyphs
    if (typeof (document as any).fonts?.ready === 'object') {
      try { await (document as any).fonts.ready; } catch (_) {}
    }

    // Give the browser a moment to apply export styles
    await new Promise(resolve => setTimeout(resolve, 30));

    // Render DOM to canvas at higher scale for sharper text
    const canvas = await html2canvas(element, {
      // Lower scale to reduce memory/CPU load and avoid tab freezes
      scale: Math.min(2, (window.devicePixelRatio || 2)),
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      foreignObjectRendering: false
    });

    // Create A4 portrait PDF (210mm x 297mm)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Compute image dimensions to fit width while preserving aspect ratio
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 5; // tiny margin to avoid clipping and extra page
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight - margin * 2 + 0.5) { // tolerance to avoid phantom page
      // Use JPEG data URL for maximum compatibility across jsPDF variants
      const jpegData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(jpegData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      // For multi-page content, slice vertically
      let remainingHeight = imgHeight;
      let position = margin;
      let pageCanvas = document.createElement('canvas');
      const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      const pxPerMm = canvas.width / imgWidth; // pixels per mm at computed scaling
      const pageHeightPx = (pageHeight - margin * 2) * pxPerMm;
      let sY = 0;
      // Increase overlap to avoid text cropping at page boundaries
      const overlapPx = Math.max(6, Math.round(pxPerMm * 2));

      while (remainingHeight > 0) {
        const isLast = sY + pageHeightPx >= canvas.height;
        const sliceHeight = Math.min(pageHeightPx, canvas.height - sY);
        const drawHeight = isLast ? sliceHeight : sliceHeight + overlapPx;
        pageCanvas.width = canvas.width;
        pageCanvas.height = drawHeight;
        if (pageCtx) {
          pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(canvas, 0, sY, canvas.width, drawHeight, 0, 0, canvas.width, drawHeight);
        }
        if (position > margin) pdf.addPage('a4', 'portrait');
        const heightMm = Math.max(0.5, (drawHeight / pxPerMm));
        // Always use JPEG slices to avoid PNG signature/scale issues across versions
        const sliceJpeg = pageCanvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(sliceJpeg, 'JPEG', margin, margin, imgWidth, heightMm);
        sY += isLast ? sliceHeight : (sliceHeight - overlapPx);
        remainingHeight = Math.max(0, (canvas.height - sY) / pxPerMm);
        position = pageHeight; // ensure next iteration adds a new page
        // Yield to the browser to keep UI responsive
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const outName = filename || `Resume_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
    // If caller passes sentinel filename, return buffer instead of downloading
    if (outName === '__BUFFER_ONLY__') {
      return pdf.output('arraybuffer');
    }
    pdf.save(outName);
    return outName as unknown as string;
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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 5;
    const imgWidth = pageWidth - margin * 2;

    const canvas = await html2canvas(element, {
      scale: Math.min(2, (window.devicePixelRatio || 2)),
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      foreignObjectRendering: false
    });

    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    if (imgHeight <= pageHeight - margin * 2 + 0.5) {
      const jpegData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(jpegData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      const pxPerMm = canvas.width / imgWidth;
      const pageHeightPx = (pageHeight - margin * 2) * pxPerMm;
      // Higher overlap for offscreen sandbox capture to prevent cropping
      const overlapPx = 14;
      let sY = 0;
      let isFirst = true;

      while (sY < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx + overlapPx, canvas.height - sY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(canvas, 0, sY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        }
        if (!isFirst) pdf.addPage('a4', 'portrait');
        const heightMm = Math.max(0.5, sliceHeight / pxPerMm);
        const sliceJpeg = pageCanvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(sliceJpeg, 'JPEG', margin, margin, imgWidth, heightMm);
        isFirst = false;
        sY += (sliceHeight - overlapPx);
        // eslint-disable-next-line no-await-in-loop
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
