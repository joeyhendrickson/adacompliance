# Fix OAuth "Access Blocked" Error

## The Problem

You're seeing this error:
```
Access blocked: ADAcompliance has not completed the Google verification process
Error 403: access_denied
```

This happens because your OAuth app is in **"Testing"** mode, which only allows approved test users.

## Solution: Add Yourself as a Test User

### Step 1: Go to OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **ADAcompliance**
3. Navigate to: **APIs & Services** → **OAuth consent screen**

### Step 2: Add Test Users

1. Scroll down to the **"Test users"** section
2. Click **"+ ADD USERS"**
3. Enter your email address: `joeyhendrickson@gmail.com`
4. Click **"ADD"**
5. You can add multiple test users if needed

### Step 3: Try Again

1. Go back to your application
2. Click "Get Authorization URL" again
3. You should now be able to authorize the application

## Alternative: Publish Your App (For Production)

If you want anyone to be able to use your app (not just test users), you need to publish it:

1. Go to **OAuth consent screen**
2. Click **"PUBLISH APP"** at the top
3. Confirm the publishing
4. **Note**: Publishing requires verification if you're requesting sensitive scopes, which can take time

## For Development: Testing Mode is Fine

For development and testing purposes, keeping the app in "Testing" mode and adding yourself as a test user is the recommended approach. You only need to publish if you want to make it available to the public.

## Quick Steps Summary

1. Google Cloud Console → Your Project
2. APIs & Services → OAuth consent screen
3. Scroll to "Test users" section
4. Click "+ ADD USERS"
5. Add: `joeyhendrickson@gmail.com`
6. Save
7. Try authorization again





