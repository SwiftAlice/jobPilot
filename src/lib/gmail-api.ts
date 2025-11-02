import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { API_CONFIG } from './config';

// Gmail API service for creating drafts with attachments
export class GmailAPIService {
  private auth: any;
  private gmail: any;

  constructor(auth: any) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  /**
   * Build raw MIME message with PDF attachment
   */
  private buildRawMime({ from, to, subject, text, pdfBase64, filename }: {
    from: string;
    to: string;
    subject: string;
    text: string;
    pdfBase64: string;
    filename: string;
  }): string {
    const boundary = "mixed_boundary_x";
    // pdfBase64 is already passed as a parameter, no need to convert

    const lines = [
      "MIME-Version: 1.0",
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      text,
      "",
      `--${boundary}`,
      "Content-Type: application/pdf",
      `Content-Disposition: attachment; filename="${filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      pdfBase64,
      "",
      `--${boundary}--`,
      ""
    ];

    // base64url encode
    return Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  /**
   * Create Gmail draft with PDF attachment
   */
  async createDraftWithPdf({
    from,
    to,
    subject,
    text,
    pdfBase64,
    filename
  }: {
    from: string;
    to: string;
    subject: string;
    text: string;
    pdfBase64: string;
    filename: string;
  }) {
    try {
      const raw = this.buildRawMime({ from, to, subject, text, pdfBase64, filename });

      const res = await this.gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });

      console.log("Gmail draft created with ID:", res.data.id);
      return res.data;
    } catch (error) {
      console.error("Error creating Gmail draft:", error);
      throw error;
    }
  }

  /**
   * Get Gmail draft URL - open draft in compose mode
   */
  getDraftUrl(draftId: string): string {
    // Use the correct Gmail URL format to open draft in compose mode
    return `https://mail.google.com/mail/u/0/#drafts/${draftId}`;
  }
}

/**
 * Create OAuth2 client for Gmail API
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    API_CONFIG.GOOGLE_CLIENT_ID,
    API_CONFIG.GOOGLE_CLIENT_SECRET,
    API_CONFIG.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate OAuth2 authorization URL
 * @param redirectUri - Optional redirect URI. If not provided, uses GOOGLE_REDIRECT_URI from config
 */
export function getAuthUrl(redirectUri?: string): string {
  // Use provided redirect URI or fall back to config
  const finalRedirectUri = redirectUri || API_CONFIG.GOOGLE_REDIRECT_URI;
  
  // Create OAuth client with the redirect URI
  const oauth2Client = new google.auth.OAuth2(
    API_CONFIG.GOOGLE_CLIENT_ID,
    API_CONFIG.GOOGLE_CLIENT_SECRET,
    finalRedirectUri
  );
  
  const scopes = [
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.readonly'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokens(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}
