import { NextRequest, NextResponse } from 'next/server';
import { GmailAPIService, createOAuth2Client } from '@/lib/gmail-api';
import { generatePDFBuffer, generatePDFFromDomBuffer } from '@/lib/pdf-utils';

export async function POST(req: NextRequest) {
  try {
    console.log('Gmail draft API called');
    const body = await req.json();
    const { to, subject, text, resumeData, tokens, selectedTemplate, jdText, pdfBase64 } = body;

    if (!to || !subject || !text || !resumeData || !tokens) {
      console.log('Missing required fields:', { to: !!to, subject: !!subject, text: !!text, resumeData: !!resumeData, tokens: !!tokens });
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: to, subject, text, resumeData, tokens' 
      }, { status: 400 });
    }

    console.log('All required fields present, proceeding with draft creation');

    // Set up OAuth2 client with tokens
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Create Gmail API service
    const gmailService = new GmailAPIService(oauth2Client);

    // If a client-provided PDF was sent (generated from DOM), use it directly
    if (pdfBase64 && typeof pdfBase64 === 'string') {
      console.log('Using client-provided DOM PDF for draft');
      const draft = await gmailService.createDraftWithPdf({
        from: resumeData.personalInfo?.email || 'noreply@example.com',
        to,
        subject,
        text,
        pdfBase64,
        filename: `${resumeData.personalInfo?.fullName || 'Resume'}_Resume.pdf`
      });

      const messageId = draft.message?.id;
      const draftUrl = gmailService.getDraftUrl(draft.id);
      return NextResponse.json({ success: true, draftId: draft.id, messageId, draftUrl, message: 'Gmail draft created with provided PDF' });
    }

    // Otherwise, generate resume PDF buffer using shared utility and selected template
    // Enrich resume with JD keywords server-side to guarantee parity with preview
    const enrichedResume = (() => {
      try {
        if (!jdText || typeof jdText !== 'string') return resumeData;
        const jsKeywords = [
          'JavaScript','TypeScript','React','Next.js','Node.js','Express','Redux','Jest','Cypress','HTML','CSS','Tailwind','REST','GraphQL','Webpack','Vite','Babel','ES6','CI/CD'
        ];
        const hay = jdText.toLowerCase();
        const existing = new Set(((resumeData?.skills as string[]) || []).map(s => (s||'').toLowerCase()));
        const additions = jsKeywords.filter(k => hay.includes(k.toLowerCase()) && !existing.has(k.toLowerCase()));
        const mergedSkills = Array.from(new Set([...(resumeData?.skills || []), ...additions]));
        return { ...resumeData, skills: mergedSkills };
      } catch {
        return resumeData;
      }
    })();

    console.log('Generating PDF via DOM-based approach to match preview exactly...');
    // Use DOM-based PDF generation to match the preview exactly
    const pdfBuffer = await generatePDFFromDomBuffer(enrichedResume, selectedTemplate || 'minimal');
    console.log('PDF generated successfully, size:', (pdfBuffer as ArrayBuffer).byteLength);
    
    // Create draft with attachment
    console.log('Creating Gmail draft...');
    const draft = await gmailService.createDraftWithPdf({
      from: enrichedResume.personalInfo?.email || 'noreply@example.com',
      to,
      subject,
      text,
      pdfBase64: Buffer.from(pdfBuffer as ArrayBuffer).toString('base64'),
      filename: `${enrichedResume.personalInfo?.fullName || 'Resume'}_Resume.pdf`
    });

    console.log('Draft created with ID:', draft.id);
    console.log('Full draft response:', JSON.stringify(draft, null, 2));

    // Get message ID from the draft response
    const messageId = draft.message?.id;
    console.log('Message ID from draft:', messageId);

    // Get draft URL
    const draftUrl = gmailService.getDraftUrl(draft.id);
    console.log('Draft URL:', draftUrl);

    return NextResponse.json({ 
      success: true, 
      draftId: draft.id,
      messageId: messageId,
      draftUrl,
      message: 'Gmail draft created with resume attachment' 
    });

  } catch (error) {
    console.error('Gmail draft creation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create Gmail draft' 
    }, { status: 500 });
  }
}
