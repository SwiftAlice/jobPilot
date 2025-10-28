import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client } from '@/lib/gmail-api';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new NextResponse(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Authentication</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #d32f2f; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>❌ Gmail Authentication Failed</h2>
            <p>Error: ${error}</p>
          </div>
          <div class="spinner"></div>
          <p>Closing this window and refreshing the main page...</p>
          <script>
            // Close this tab and refresh the parent window
            if (window.opener) {
              window.opener.location.reload();
              window.close();
            } else {
              // If no opener, redirect to jobs page
              window.location.href = 'http://localhost:3000/jobs?gmail_auth=error';
            }
          </script>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (!code) {
      console.error('No authorization code received');
      return new NextResponse(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Authentication</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #d32f2f; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ No Authorization Code</h2>
            <p>No authorization code was received from Google.</p>
          </div>
          <div class="spinner"></div>
          <p>Closing this window and refreshing the main page...</p>
          <script>
            // Close this tab and refresh the parent window
            if (window.opener) {
              window.opener.location.reload();
              window.close();
            } else {
              // If no opener, redirect to jobs page
              window.location.href = 'http://localhost:3000/jobs?gmail_auth=no_code';
            }
          </script>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Exchange code for tokens
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in localStorage via client-side redirect
    const tokensJson = JSON.stringify(tokens);
    const encodedTokens = encodeURIComponent(tokensJson);
    
    // Return HTML page that closes tab and refreshes parent
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Authentication</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #2e7d32; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="success">
          <h2>✅ Gmail Authentication Successful!</h2>
          <p>You have successfully connected your Gmail account.</p>
        </div>
        <div class="spinner"></div>
        <p>Closing this window and refreshing the main page...</p>
        <script>
          // Store tokens in localStorage and refresh parent window
          try {
            localStorage.setItem('gmailTokens', '${tokensJson.replace(/'/g, "\\'")}');
            localStorage.setItem('gmailAuthenticated', 'true');
          } catch (e) {
            console.error('Failed to store tokens:', e);
          }
          
          // Close this tab and refresh the parent window
          if (window.opener) {
            window.opener.location.reload();
            window.close();
          } else {
            // If no opener, redirect to jobs page with success
            window.location.href = 'http://localhost:3000/jobs?gmail_auth=success&tokens=${encodedTokens}';
          }
        </script>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('Gmail callback error:', error);
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Authentication</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #d32f2f; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Gmail Authentication Error</h2>
          <p>An error occurred during authentication: ${error}</p>
        </div>
        <div class="spinner"></div>
        <p>Closing this window and refreshing the main page...</p>
        <script>
          // Close this tab and refresh the parent window
          if (window.opener) {
            window.opener.location.reload();
            window.close();
          } else {
            // If no opener, redirect to jobs page
            window.location.href = 'http://localhost:3000/jobs?gmail_auth=error';
          }
        </script>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}