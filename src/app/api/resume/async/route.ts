import { NextRequest } from 'next/server';
import { LLM_MODELS, MODEL_CONFIGS } from '@/lib/llm-config';

// Helper function to clean AI response
function cleanAIResponse(response: string): string {
  // Remove markdown code blocks
  let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // If the response starts with text before JSON, extract just the JSON part
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  return cleaned;
}

// Helper function to validate and fix JSON
function validateAndFixJSON(jsonString: string): string {
  try {
    // First try to parse as-is
    JSON.parse(jsonString);
    return jsonString;
  } catch (error) {
    console.log('JSON validation failed, attempting to fix...');
    
    // Try to fix common JSON issues
    let fixed = jsonString;
    
    // Fix trailing commas in arrays and objects
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing quotes around keys
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix unescaped quotes in strings (more comprehensive)
    fixed = fixed.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');
    
    // Fix common string escaping issues
    fixed = fixed.replace(/([^\\])"([^",}\]]*)"([^",}\]]*)"([^",}\]]*)"([^",}\]]*)/g, '$1\\"$2\\"$3\\"$4\\"$5');
    
    // Try to complete incomplete arrays/objects
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    // Add missing closing braces
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed += '}';
    }
    
    // Add missing closing brackets
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed += ']';
    }
    
    // Try parsing again
    try {
      JSON.parse(fixed);
      console.log('JSON fixed successfully');
      return fixed;
    } catch (secondError) {
      console.error('Could not fix JSON:', secondError);
      throw new Error(`Invalid JSON response from AI: ${secondError instanceof Error ? secondError.message : 'Unknown error'}`);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get model from query params (default to QUALITY)
    const { searchParams } = new URL(request.url);
    const modelKey = searchParams.get('model') || 'QUALITY';
    const selectedModel = LLM_MODELS[modelKey as keyof typeof LLM_MODELS] || LLM_MODELS.QUALITY;
    const modelConfig = MODEL_CONFIGS[selectedModel.name as keyof typeof MODEL_CONFIGS];
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendChunk = (data: unknown) => {
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        const sendError = (error: string) => {
          const errorChunk = `data: ${JSON.stringify({ type: 'error', message: error })}\n\n`;
          controller.enqueue(encoder.encode(errorChunk));
          controller.close();
        };

        const sendComplete = () => {
          const completeChunk = `data: ${JSON.stringify({ type: 'complete' })}\n\n`;
          controller.enqueue(encoder.encode(completeChunk));
          controller.close();
        };

        // Start async parsing
        parseResumeAsync(file, selectedModel, modelConfig, sendChunk, sendError, sendComplete);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Async resume parsing error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

async function parseResumeAsync(
  file: File,
  selectedModel: { name: string; description: string; speed: string; quality: string; cost: string; estimatedTime: string },
  modelConfig: { maxTokens: number; temperature: number; timeout: number; pollingInterval: number },
  sendChunk: (data: unknown) => void, 
  sendError: (error: string) => void, 
  sendComplete: () => void
) {
  try {
    // Send initial progress
    sendChunk({ 
      type: 'progress', 
      stage: 'uploading', 
      message: 'Uploading file...',
      progress: 10 
    });

    // Upload file to OpenAI
    const uploadStart = Date.now();
    const openai = await import('openai');
    const client = new openai.default({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2
    });

    // Check file size
    if (file.size > 2 * 1024 * 1024) {
      sendError('File too large for fast processing. Please use a smaller file (< 2MB).');
      return;
    }

    const optimizedFile = new File([file], file.name, { type: file.type });
    
    const uploadedFile = await Promise.race([
      client.files.create({
        file: optimizedFile,
        purpose: "assistants"
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File upload timeout')), 30000) // 30 second upload timeout
      )
    ]);

    const uploadTime = Date.now() - uploadStart;
    sendChunk({ 
      type: 'progress', 
      stage: 'uploaded', 
      message: `File uploaded successfully in ${uploadTime}ms`,
      progress: 30 
    });

    // Create assistant
    sendChunk({ 
      type: 'progress', 
      stage: 'creating_assistant', 
      message: 'Creating AI assistant...',
      progress: 40 
    });

    const prompt = `You are a resume data extraction assistant. Extract ALL information from the uploaded resume file and return it as VALID JSON.

⚠️ CRITICAL: Pay close attention to text formatting in the PDF. Look for BOLD or emphasized text (darker, thicker letters) and wrap it with **double asterisks**.

RESPONSE FORMAT - Return ONLY this JSON structure with actual data from the resume:
{
  "personalInfo": {
    "fullName": "extracted full name from resume",
    "email": "extracted email", 
    "phone": "extracted phone",
    "location": "extracted location",
    "linkedin": "extracted linkedin URL",
    "website": "extracted website URL",
    "summary": "extracted professional summary text"
  },
  "experience": [
    {
      "id": 1,
      "title": "actual job title",
      "company": "actual company name",
      "location": "actual job location",
      "startDate": "YYYY-MM format",
      "endDate": "YYYY-MM format",
      "current": false,
      "description": ["actual bullet point 1", "actual bullet point 2"]
    }
  ],
  "education": [{"id": 1, "degree": "actual degree", "institution": "actual institution", "location": "actual location", "year": "actual year", "gpa": "actual gpa"}],
  "skills": ["actual skill 1", "actual skill 2"],
  "projects": [{"id": 1, "name": "actual project name", "description": "actual description", "technologies": ["actual tech"], "link": "actual link"}]
}

CRITICAL INSTRUCTIONS:
1. For the "summary" field, you MUST copy the EXACT text from the resume's summary/professional summary section. Do NOT:
   - Paraphrase or rewrite
   - Improve or enhance the language
   - Add or remove any words
   - Change any metrics or numbers
   - Modify the structure or format
   Copy the summary word-for-word exactly as it appears in the resume. If no summary exists, use "".

2. For the "experience" array, you MUST extract ALL work experiences listed in the resume. Do NOT:
   - Skip any positions
   - Combine multiple positions into one
   - Miss any internships, part-time jobs, or contract work
   - Exclude volunteer work if it's listed as experience
   Include every single work experience entry found in the resume.

3. For each experience entry, preserve ALL bullet points in the description array. Do NOT:
   - Summarize or condense bullet points
   - Skip any achievements or responsibilities
   - Combine multiple bullet points into one
   - Remove any metrics, numbers, or specific details

4. CRITICAL - BOLD TEXT DETECTION: Look carefully at the visual appearance of text in the PDF. Bold text appears darker and thicker than regular text.
   
   EXAMPLES of what to look for and how to format:
   - If you see text that looks DARKER/BOLDER like "Revenue Growth:" followed by normal text "Led initiatives..."
     Extract as: "**Revenue Growth:** Led initiatives..."
   
   - If you see a category name in BOLD like "Strategic Planning:" followed by description
     Extract as: "**Strategic Planning:** description here"
   
   - If the ENTIRE first part is bold like "Product Strategy & Growth:" followed by details
     Extract as: "**Product Strategy & Growth:** details here"
   
   REMEMBER: 
   - Look at font weight/thickness, not just capital letters
   - Bold text will appear visually heavier/darker in the PDF
   - Wrap ANY bold text with **asterisks** before and after
   - If unsure, check if text stands out visually from the rest`;

    const assistant = await client.beta.assistants.create({
      name: "Resume Parser",
      model: selectedModel.name, // Using user-selected model
      tools: [{ type: "file_search" }],
      instructions: "Extract resume data as VALID JSON only. Ensure proper JSON formatting with no trailing commas, proper quotes, and complete brackets. CRITICAL: Extract ALL work experiences from the resume - do not skip any positions, internships, or contract work. For each experience, preserve ALL bullet points and achievements exactly as written. For the summary field, copy the EXACT text from the resume without any changes, paraphrasing, or improvements. Preserve all metrics, numbers, achievements, and original wording. Do not summarize or rewrite any content. IMPORTANT: Detect and preserve bold text formatting by wrapping bold text with **double asterisks** (e.g., **Bold Text:** regular text). Only mark text that is actually bold in the original document."
    });

    sendChunk({ 
      type: 'progress', 
      stage: 'processing', 
      message: 'Analyzing your resume...',
      progress: 50 
    });

    // Create thread and run
    const thread = await client.beta.threads.create({
      messages: [
        {
          role: "user",
          content: prompt,
          attachments: [
            {
              file_id: uploadedFile.id,
              tools: [{ type: "file_search" }]
            }
          ]
        }
      ]
    });

    const run = await client.beta.threads.runs.create(
      thread.id,
      {
        assistant_id: assistant.id
      }
    );

    // Poll for completion with progress updates (using model config from top)
    let runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = Math.floor(modelConfig.timeout / modelConfig.pollingInterval);
    const startTime = Date.now();
    
    while ((runStatus.status === 'in_progress' || runStatus.status === 'queued') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, modelConfig.pollingInterval));
      runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
      
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const progress = 50 + Math.min(40, (attempts / maxAttempts) * 40);
      sendChunk({ 
        type: 'progress', 
        stage: 'processing', 
        message: `Processing... ${elapsedSeconds}s`,
        progress: Math.round(progress)
      });
    }
    
    if (attempts >= maxAttempts) {
      sendError('Processing timeout - taking too long');
      return;
    }

    if (runStatus.status === 'completed') {
      sendChunk({ 
        type: 'progress', 
        stage: 'parsing', 
        message: 'Parsing AI response...',
        progress: 90 
      });

      const messages = await client.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0];
      
      if (lastMessage?.content?.[0]?.type === 'text') {
        const response = lastMessage.content[0].text.value;
        
        // Clean and parse the response
        const cleanedResponse = cleanAIResponse(response);
        const validatedJSON = validateAndFixJSON(cleanedResponse);
        const parsedData = JSON.parse(validatedJSON);
        
        // Send parsed data in chunks
        sendChunk({ 
          type: 'data', 
          section: 'personalInfo', 
          data: parsedData.personalInfo 
        });
        
        if (parsedData.experience?.length > 0) {
          sendChunk({ 
            type: 'data', 
            section: 'experience', 
            data: parsedData.experience 
          });
        }
        
        if (parsedData.education?.length > 0) {
          sendChunk({ 
            type: 'data', 
            section: 'education', 
            data: parsedData.education 
          });
        }
        
        if (parsedData.skills?.length > 0) {
          sendChunk({ 
            type: 'data', 
            section: 'skills', 
            data: parsedData.skills 
          });
        }
        
        if (parsedData.projects?.length > 0) {
          sendChunk({ 
            type: 'data', 
            section: 'projects', 
            data: parsedData.projects 
          });
        }

        sendChunk({ 
          type: 'progress', 
          stage: 'complete', 
          message: 'Resume parsing completed successfully!',
          progress: 100 
        });

        // Cleanup
        Promise.all([
          client.files.del(uploadedFile.id).catch(console.warn),
          client.beta.assistants.del(assistant.id).catch(console.warn)
        ]);

        sendComplete();
      } else {
        sendError('No response received from AI');
      }
    } else {
      sendError(`Processing failed with status: ${runStatus.status}`);
    }

  } catch (error) {
    console.error('Async parsing error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND')) {
        sendError('Network connectivity issue. Please check your internet connection and try again.');
      } else if (error.message.includes('timeout')) {
        sendError('Request timed out. Please try again with a smaller file or check your connection.');
      } else if (error.message.includes('model_not_found') || error.message.includes('does not exist')) {
        sendError('Model configuration error. Please contact support.');
      } else if (error.message.includes('Invalid JSON')) {
        sendError('Failed to parse resume data. Please try with a different file format.');
      } else {
        sendError(`Parsing failed: ${error.message}`);
      }
    } else {
      sendError('Unknown error occurred during parsing.');
    }
  }
}
