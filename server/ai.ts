import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ScoreResult, GoalType } from "@shared/schema";
import fs from "fs";
import path from "path";

// Gemini client for transcription (supports audio input)
const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
  },
});

// OpenAI client for scoring
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL!,
});

const MAX_INLINE_SIZE = 15 * 1024 * 1024; // 15MB threshold for inline vs File API

export async function transcribeAudio(audioPath: string): Promise<string> {
  const absolutePath = path.resolve(audioPath);
  const audioBuffer = fs.readFileSync(absolutePath);
  const fileSizeMB = audioBuffer.length / 1024 / 1024;
  
  const ext = path.extname(audioPath).toLowerCase();
  const mimeType = ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/mpeg";
  
  console.log(`[AI] Transcribing audio: ${path.basename(audioPath)} (${fileSizeMB.toFixed(2)}MB)`);
  
  let response;
  
  if (audioBuffer.length > MAX_INLINE_SIZE) {
    console.log(`[AI] Using File API for large file upload...`);
    
    const uploadResult = await gemini.files.upload({
      file: absolutePath,
      config: {
        mimeType,
      },
    });
    
    let file = uploadResult;
    
    if ('file' in uploadResult && uploadResult.file) {
      file = uploadResult.file as typeof uploadResult;
    }
    
    console.log(`[AI] File uploaded: ${file.name}, state: ${file.state}`);
    
    let attempts = 0;
    const maxAttempts = 30;
    while (file.state === "PROCESSING" && attempts < maxAttempts) {
      console.log(`[AI] File still processing, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      const fileStatus = await gemini.files.get({ name: file.name! });
      if ('file' in fileStatus && fileStatus.file) {
        file = fileStatus.file as typeof file;
      } else {
        file = fileStatus as typeof file;
      }
      attempts++;
    }
    
    if (file.state !== "ACTIVE") {
      throw new Error(`File upload failed or timed out. State: ${file.state}`);
    }
    
    console.log(`[AI] File ready: ${file.uri}`);
    
    const fileName = file.name!;
    
    try {
      response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: file.uri!,
                  mimeType: file.mimeType || mimeType,
                },
              },
              {
                text: "Please transcribe all the spoken words in this audio accurately. Only output the transcript text, nothing else. If there is no speech, return an empty string.",
              },
            ],
          },
        ],
      });
    } finally {
      try {
        await gemini.files.delete({ name: fileName });
        console.log(`[AI] Cleaned up uploaded file: ${fileName}`);
      } catch (cleanupErr) {
        console.warn(`[AI] Failed to clean up uploaded file:`, cleanupErr);
      }
    }
  } else {
    console.log(`[AI] Using inline upload for small file...`);
    const base64Audio = audioBuffer.toString("base64");
    
    response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: "Please transcribe all the spoken words in this audio accurately. Only output the transcript text, nothing else. If there is no speech, return an empty string.",
            },
          ],
        },
      ],
    });
  }

  const text = response.text || "";
  return text.trim();
}

const scoringSystemPrompt = `You are an expert video marketing coach. Analyze the transcript of a practice video based on the 5-part video creation formula.

THE 5-PART VIDEO CREATION FORMULA:

1. HOOK (Score 0-20)
   - Goal: Grab attention in the first 1-3 seconds
   - Good examples: Sharp question, audience callout, bold promise
   - Scoring: 0-5 = missing, 6-10 = weak, 11-15 = solid, 16-20 = strong

2. SET THE HOOK (Score 0-20)
   - Goal: Create curiosity, make viewer want to keep watching
   - Good examples: Tease what's coming, mention common mistake, set up story
   - Scoring: 0-5 = missing, 6-10 = weak, 11-15 = solid, 16-20 = strong

3. FIRST CALL TO ACTION (Score 0-20)
   - Goal: Early micro-action
   - Good examples: "Comment the word...", "Follow for more...", "Stick with me..."
   - Scoring: 0-5 = missing, 6-10 = weak, 11-15 = solid, 16-20 = strong

4. CONTENT (Score 0-20)
   - Goal: Deliver value clearly
   - Good examples: 1-3 key points, clear steps, simple explanation
   - Scoring: 0-5 = missing, 6-10 = weak, 11-15 = solid, 16-20 = strong

5. FINAL CALL TO ACTION (Score 0-20)
   - Goal: Clear next step at the end
   - Good examples: "Click the link...", "Download the guide...", "Send me a message..."
   - Scoring: 0-5 = missing, 6-10 = weak, 11-15 = solid, 16-20 = strong

DELIVERY METRICS TO ANALYZE:
- Words per minute (calculate from word count and duration)
- Filler words (um, uh, like, you know, so, basically, literally, right, okay)
- Clarity notes (based on sentence structure and vocabulary)

IMPORTANT RULES:
- Be specific and grounded in what is actually present in the transcript
- If something is missing, say it's missing
- Provide actionable, specific suggestions
- totalScore MUST equal the sum of all 5 part scores (max 100)
- Each part score is 0-20`;

export async function scoreTranscript(
  transcript: string,
  goalType: GoalType,
  durationSeconds: number
): Promise<ScoreResult> {
  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerMinute = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0;

  const goalContext: Record<GoalType, string> = {
    sales: "The video goal is SALES - focus on persuasion, urgency, and clear purchase CTAs.",
    lead: "The video goal is LEAD CAPTURE - focus on value proposition and getting contact info.",
    education: "The video goal is EDUCATION - focus on teaching clearly and providing actionable takeaways.",
    recruit: "The video goal is RECRUITMENT/INVITE - focus on opportunity, community, and easy next steps.",
  };

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { role: "system", content: scoringSystemPrompt },
      {
        role: "user",
        content: `Analyze this video transcript and provide scoring feedback.

VIDEO CONTEXT:
- Goal: ${goalContext[goalType]}
- Duration: ${durationSeconds} seconds
- Word count: ${wordCount}
- Estimated WPM: ${wordsPerMinute}

TRANSCRIPT:
"""
${transcript || "(empty or no speech detected)"}
"""

Respond with a JSON object matching this exact structure:
{
  "totalScore": <number 0-100, must equal sum of all partScores>,
  "partScores": {
    "hook": <number 0-20>,
    "setHook": <number 0-20>,
    "firstCTA": <number 0-20>,
    "content": <number 0-20>,
    "finalCTA": <number 0-20>
  },
  "summary": {
    "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
    "topImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]
  },
  "parts": {
    "hook": {
      "whatWorked": ["<specific thing that worked>"],
      "whatMissing": ["<specific thing missing>"],
      "suggestions": ["<specific suggestion>", "<another suggestion>"],
      "exampleLines": ["<example line they could say>"]
    },
    "setHook": { ... same structure ... },
    "firstCTA": { ... same structure ... },
    "content": { ... same structure ... },
    "finalCTA": { ... same structure ... }
  },
  "delivery": {
    "wordsPerMinute": ${wordsPerMinute},
    "fillerWords": {
      "count": <number>,
      "examples": ["<filler word found>"]
    },
    "clarityNotes": ["<note about clarity>"]
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(content) as ScoreResult;
  
  // Ensure totalScore equals sum of part scores
  const calculatedTotal = 
    result.partScores.hook + 
    result.partScores.setHook + 
    result.partScores.firstCTA + 
    result.partScores.content + 
    result.partScores.finalCTA;
  
  result.totalScore = Math.min(calculatedTotal, 100);
  
  return result;
}
