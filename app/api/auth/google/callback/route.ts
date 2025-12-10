import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code not provided' },
        { status: 400 }
      );
    }

    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: 'No refresh token received. Make sure to revoke previous access and re-authorize with consent prompt.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Authorization successful. Please save the refresh_token to your environment variables.',
      refresh_token: tokens.refresh_token,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      { error: 'Failed to process authorization', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
