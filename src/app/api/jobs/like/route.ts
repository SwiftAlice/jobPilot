import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { job } = await req.json();
    
    if (!job || !job.id) {
      return NextResponse.json({ error: 'Invalid job data' }, { status: 400 });
    }
    
    console.log('[Jobs/Like] Received job data:', {
      id: job.id,
      title: job.title,
      posted_at: job.posted_at,
      has_description: !!job.description,
      description_length: job.description?.length || 0
    });
    
    // Save job info if not already in DB
    // Build job data object
    const jobData: any = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      job_url: job.job_url,
      source: job.source,
    };
    
    // Handle posted_at date - frontend sends it as posted_at
    if (job.posted_at) {
      try {
        const dateValue = new Date(job.posted_at);
        // Only set if it's a valid date
        if (!isNaN(dateValue.getTime())) {
          jobData.posted_at = dateValue.toISOString();
          console.log('[Jobs/Like] Setting posted_at:', jobData.posted_at);
        } else {
          console.warn('[Jobs/Like] Invalid date value:', job.posted_at);
        }
      } catch (e) {
        console.warn('[Jobs/Like] Error parsing date for posted_at:', job.posted_at, e);
      }
    } else {
      console.log('[Jobs/Like] No posted_at value provided');
    }
    
    // Handle description - always include if provided
    // Use upsert with onConflict to let Supabase handle updates automatically
    // Don't check existing description to avoid extra fetch calls that might fail
    if (job.description && typeof job.description === 'string' && job.description.trim()) {
      jobData.description = job.description.trim();
      console.log('[Jobs/Like] Setting description (length:', jobData.description.length, ')');
    } else {
      console.log('[Jobs/Like] No description provided or empty');
    }
    
    // Try to save job, but don't fail if it doesn't work (may already exist)
    let jobSaveSuccess = false;
    try {
      const { error: jobError } = await supabase.from('jobs').upsert(jobData, { onConflict: 'id' });
      if (jobError) {
        console.error('[Jobs/Like] Error saving job to jobs table:', jobError);
        // Check if it's a "doesn't exist" error or connection error
        if (jobError.message?.includes('fetch failed') || jobError.message?.includes('does not exist')) {
          console.warn('[Jobs/Like] Job table may not exist or connection failed, continuing anyway');
        } else {
          // For other errors, still try to save the user action
          console.warn('[Jobs/Like] Job save failed but continuing to save user action');
        }
      } else {
        jobSaveSuccess = true;
      }
    } catch (jobSaveErr: any) {
      console.error('[Jobs/Like] Exception saving job:', jobSaveErr?.message || jobSaveErr);
      // Continue anyway - try to save user action
    }
    
    // Get user id from session
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user) {
      console.error('[Jobs/Like] User not authenticated');
      // Return success anyway if job was saved, or partial success
      if (jobSaveSuccess) {
        return NextResponse.json({ success: true, warning: 'User not authenticated but job saved' });
      }
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    
    // Mark as liked for this user - this is the most important part
    // To ensure new likes appear at the top, we delete and re-insert instead of upsert
    // This gives us a fresh created_at timestamp
    try {
      const now = new Date().toISOString();
      
      // First, delete any existing like for this job by this user
      await supabase
        .from('user_job_actions')
        .delete()
        .eq('user_id', user.id)
        .eq('job_id', job.id)
        .eq('action', 'liked');
      
      // Then insert a new record with fresh timestamp
      const { error: likeError } = await supabase.from('user_job_actions').insert({
        user_id: user.id,
        job_id: job.id,
        action: 'liked',
        created_at: now,
      });
      
      if (likeError) {
        console.error('[Jobs/Like] Error saving to user_job_actions:', likeError);
        // If job was saved but action wasn't, return partial success
        if (jobSaveSuccess) {
          return NextResponse.json({ success: true, warning: 'Job saved but action failed' });
        }
        return NextResponse.json({ error: likeError.message }, { status: 500 });
      }
    } catch (actionErr: any) {
      console.error('[Jobs/Like] Exception saving user action:', actionErr?.message || actionErr);
      if (jobSaveSuccess) {
        return NextResponse.json({ success: true, warning: 'Job saved but action failed' });
      }
      return NextResponse.json({ error: 'Failed to save action' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Jobs/Like] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
