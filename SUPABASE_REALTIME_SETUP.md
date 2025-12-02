# Supabase Realtime Setup Guide

## Overview
The job search UI now uses Supabase Realtime to automatically refresh when new jobs are added to the database. This provides instant updates without polling.

## Enable Realtime in Supabase

### Step 1: Enable Realtime for the `jobs` table

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Database** → **Replication**
4. Find the `jobs` table in the list
5. Toggle **Realtime** to **ON** for the `jobs` table
6. Click **Save**

### Step 2: Verify Realtime is enabled

You can verify Realtime is working by:
1. Opening the browser console
2. Looking for `[Realtime] Successfully subscribed to jobs table changes` message
3. When a new job is inserted, you should see `[Realtime] Job change detected` logs

### Step 3: (Optional) Configure Realtime Policies

If you have Row Level Security (RLS) enabled on the `jobs` table, you may need to configure policies:

```sql
-- Allow realtime subscriptions (if RLS is enabled)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows reading jobs for realtime
CREATE POLICY "Allow realtime reads" ON jobs
  FOR SELECT
  USING (true);
```

**Note**: If you're using the service role key (which bypasses RLS), you don't need to configure policies.

## How It Works

1. **Realtime Subscription**: The UI subscribes to all changes (INSERT, UPDATE, DELETE) on the `jobs` table
2. **Debounced Refresh**: When changes are detected, the UI waits 500ms (to batch multiple changes) then refreshes
3. **Fallback Polling**: The existing 8-second polling still runs as a fallback in case Realtime fails

## Troubleshooting

### Realtime not working?

1. **Check Supabase Dashboard**: Ensure Realtime is enabled for the `jobs` table
2. **Check Console Logs**: Look for `[Realtime]` messages in the browser console
3. **Check Network**: Ensure WebSocket connections are allowed (port 443)
4. **Check Authentication**: If using RLS, ensure proper policies are set

### Fallback to Polling

If Realtime fails, the UI will automatically fall back to polling every 8 seconds. You'll see `[Auto-refresh]` logs instead of `[Realtime]` logs.

## Benefits

- **Instant Updates**: UI refreshes immediately when jobs are added (no 8-second delay)
- **Efficient**: Only refreshes when actual changes occur (not every 8 seconds)
- **Reduced Load**: Less server load compared to constant polling
- **Better UX**: Users see new jobs as soon as they're available

