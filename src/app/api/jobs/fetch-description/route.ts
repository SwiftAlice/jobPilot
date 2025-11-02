import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { jobId, jobUrl, source } = await req.json();
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }
    
    // Get job from database
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Check if description already exists and is substantial (at least 6 lines)
    if (job.description) {
      const descriptionLines = job.description.split('\n').filter((line: string) => line.trim().length > 0).length;
      if (descriptionLines >= 6) {
        return NextResponse.json({ 
          success: true, 
          description: job.description,
          cached: true 
        });
      }
    }
    
    // Try to fetch description from Flask backend if URL is available
    const urlToUse = jobUrl || job.job_url || job.url;
    const sourceToUse = source || job.source;
    
    if (!urlToUse) {
      return NextResponse.json({ 
        error: 'Job URL not available for fetching description' 
      }, { status: 400 });
    }
    
    try {
      // Try to fetch description directly from the job URL
      // This works for some sources but not JS-rendered pages like LinkedIn
      const response = await fetch(urlToUse, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (response.ok) {
        const html = await response.text();
        // Try to extract job description HTML - look for common job description containers
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
          let bodyHtml = bodyMatch[1];
          
          // Try to find job description in common containers
          const descSelectors = [
            /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*id="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<article[^>]*>([\s\S]*?)<\/article>/i,
            /<section[^>]*class="[^"]*job[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
            /<div[^>]*class="[^"]*job[^"]*details[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          ];
          
          let descriptionHtml = '';
          for (const selector of descSelectors) {
            const match = bodyHtml.match(selector);
            if (match && match[1]) {
              descriptionHtml = match[1];
              break;
            }
          }
          
          // If no specific container found, try to extract main content
          if (!descriptionHtml) {
            // Look for main content areas
            const mainMatch = bodyHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch) {
              descriptionHtml = mainMatch[1];
            } else {
              // Fallback: take a substantial chunk of body
              descriptionHtml = bodyHtml.substring(0, 10000);
            }
          }
          
          if (descriptionHtml) {
            // Clean HTML: remove scripts, styles, but preserve structure
            let cleanHtml = descriptionHtml
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
              // Remove common unwanted tags but keep structure
              .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
              .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
              .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
              // Clean up extra whitespace but preserve line breaks
              .replace(/\s+/g, ' ')
              .replace(/<\s+/g, '<')
              .replace(/\s+>/g, '>')
              // Limit size
              .substring(0, 50000)
              .trim();
            
            if (cleanHtml.length > 200) {
              // Update jobs table with fetched HTML description
              const { error: updateError } = await supabase
                .from('jobs')
                .update({ description: cleanHtml })
                .eq('id', jobId);
              
              if (updateError) {
                console.error('[Jobs/FetchDescription] Error updating description:', updateError);
              }
              
              return NextResponse.json({ 
                success: true, 
                description: cleanHtml,
                fetched: true,
                isHtml: true
              });
            }
          }
        }
      }
    } catch (fetchError: any) {
      console.error('[Jobs/FetchDescription] Error fetching description:', fetchError.message);
      // For JS-rendered pages or blocked requests, we can't fetch directly
      // In the future, we could add a Flask endpoint that uses Selenium
      if (fetchError.name === 'TimeoutError') {
        return NextResponse.json({ 
          error: 'Request timed out. The job URL may require JavaScript rendering.' 
        }, { status: 408 });
      }
    }
    
    return NextResponse.json({ 
      error: 'Could not fetch description. The job URL may not be accessible or the source may not support description fetching.' 
    }, { status: 404 });
    
  } catch (err) {
    console.error('[Jobs/FetchDescription] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

