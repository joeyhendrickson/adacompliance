import { config } from 'dotenv';
import { resolve } from 'path';
import { getGoogleOAuthClient } from '../lib/google-drive';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

async function authorize(code: string) {
  try {
    const oauth2Client = getGoogleOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('\n✅ Authorization successful!\n');
    console.log('📋 Add this to your .env.local file:\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  IMPORTANT: Make sure to:');
    console.log('   1. Update .env.local with the refresh token above');
    console.log('   2. Restart your server if it\'s running');
    console.log('   3. Run "npm run vectorize" again\n');

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

const code = process.argv.find(arg => arg.startsWith('--code='))?.split('=')[1];

if (!code) {
  console.error('❌ Missing authorization code');
  console.error('Usage: npm run authorize --code=YOUR_CODE_HERE');
  process.exit(1);
}

authorize(code);





