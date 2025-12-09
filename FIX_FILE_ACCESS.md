# Fix "User has not granted read access" Error

## The Problem

You're seeing errors like:
```
The user has not granted the app 857695109858 read access to the file [FILE_ID]
```

This happens when the OAuth app doesn't have permission to access files in your Google Drive folder.

## Solution: Re-authorize with Correct Permissions

The files in your folder may be:
1. **Owned by someone else** (shared with you)
2. **Require explicit permission** from the file owner
3. **Need broader OAuth scopes**

### Step 1: Re-authorize the Application

You need to re-authorize the application to get a new refresh token with the correct permissions:

1. **Go to your app**: `http://localhost:3001` (or your port)
2. **Click "Google Drive Setup" tab**
3. **Click "Get Authorization URL"** again
4. **Authorize the application** - Make sure to:
   - Sign in with the Google account that **owns or has access** to the files
   - **Check all the permission boxes** when prompted
   - Grant access to "See and download all your Google Drive files"

### Step 2: Update Your Refresh Token

1. After authorizing, you'll get a new `refresh_token` in the callback
2. **Update your `.env.local` file** with the new refresh token:
   ```env
   GOOGLE_REFRESH_TOKEN=new_refresh_token_here
   ```
3. **Restart your server**

### Step 3: Verify File Ownership/Access

Make sure:
- The Google account you're using **owns the files** OR
- The files are **shared with that account** with "Viewer" or "Editor" permissions
- The folder itself is accessible to that account

### Step 4: Check File Sharing Settings

If files are owned by someone else:
1. The file owner needs to share the files with your Google account
2. Or you need to use the Google account that owns the files

## Alternative: Use Service Account (Advanced)

For production, consider using a Google Service Account instead of OAuth, which can access files more reliably.

## Quick Fix Checklist

- [ ] Re-authorize the application (get new refresh token)
- [ ] Update `.env.local` with new refresh token
- [ ] Restart server
- [ ] Verify you're using the Google account that has access to the files
- [ ] Check that files are shared properly in Google Drive

## Why This Happens

Google Drive OAuth has different permission levels:
- `drive.readonly` - Can read files the user has opened or owns
- `drive` - Can read all files the user can access (broader)

The current setup uses `drive.readonly`, which should work for files you own or have explicitly opened. If files are shared but not "opened" with the app, you may need to ensure proper sharing permissions.





