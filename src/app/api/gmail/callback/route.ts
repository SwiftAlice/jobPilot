import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client } from '@/lib/gmail-api';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(new URL('/jobs?gmail_auth=error', req.url));
    }

    if (!code) {
      console.error('No authorization code received');
      return NextResponse.redirect(new URL('/jobs?gmail_auth=no_code', req.url));
    }

    // Exchange code for tokens
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in localStorage via client-side redirect
    const tokensJson = JSON.stringify(tokens);
    const encodedTokens = encodeURIComponent(tokensJson);
    
    // Redirect to jobs page with tokens in URL (will be handled by client-side JS)
    return NextResponse.redirect(new URL(`/jobs?gmail_auth=success&tokens=${encodedTokens}`, req.url));
    
  } catch (error) {
    console.error('Gmail callback error:', error);
    return NextResponse.redirect(new URL('/jobs?gmail_auth=error', req.url));
  }
}