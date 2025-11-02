import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/gmail-api';

export async function GET(req: NextRequest) {
  try {
    // Get the origin from the request to build the correct redirect URI
    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/auth/google/callback`;
    
    console.log('[Gmail Auth] Request origin:', origin);
    console.log('[Gmail Auth] Redirect URI:', redirectUri);
    
    // Pass the dynamic redirect URI to getAuthUrl
    const authUrl = getAuthUrl(redirectUri);
    return NextResponse.json({ success: true, authUrl });
  } catch (error) {
    console.error('Gmail auth error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate auth URL' }, { status: 500 });
  }
}
