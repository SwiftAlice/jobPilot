import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/gmail-api';

export async function GET(req: NextRequest) {
  try {
    const authUrl = getAuthUrl();
    return NextResponse.json({ success: true, authUrl });
  } catch (error) {
    console.error('Gmail auth error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate auth URL' }, { status: 500 });
  }
}
