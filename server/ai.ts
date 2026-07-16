import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ScoreResult, GoalType } from "@shared/schema";
import fs from "fs";
import path from "path";

// Gemini client for transcription — uses the user's own API key (GEMINI_API_KEY)
// so it is not subject to Replit's managed-key quota limits.
const gemini = new GoogleGenAI({
  apiKey: (process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY)!,
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
        model: "gemini-flash-latest",
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
                text: "Please transcribe all the spoken words in this audio accurately. Format the transcript with paragraph breaks when the speaker changes topics, pauses, or transitions to a new thought. Each paragraph should be separated by a blank line. Only output the transcript text, nothing else. If there is no speech, return an empty string.",
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
      model: "gemini-flash-latest",
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
              text: "Please transcribe all the spoken words in this audio accurately. Format the transcript with paragraph breaks when the speaker changes topics, pauses, or transitions to a new thought. Each paragraph should be separated by a blank line. Only output the transcript text, nothing else. If there is no speech, return an empty string.",
            },
          ],
        },
      ],
    });
  }

  const text = response.text || "";
  return text.trim();
}

// Whisper-based transcription — used for teleprompter recordings.
// OpenAI Whisper is already billed through the existing OpenAI account,
// avoiding Gemini quota limits. Max file size: 25MB (ample for short takes).
export async function transcribeAudioWhisper(audioPath: string): Promise<string> {
  const absolutePath = path.resolve(audioPath);
  const fileSizeMB = fs.statSync(absolutePath).size / 1024 / 1024;
  console.log(`[AI] Whisper transcribing: ${path.basename(audioPath)} (${fileSizeMB.toFixed(2)}MB)`);

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: fs.createReadStream(absolutePath),
    response_format: "text",
  });

  return (typeof transcription === "string" ? transcription : (transcription as any).text ?? "").trim();
}

const scoringSystemPrompt = `You are a no-nonsense video marketing coach. Your feedback is direct, specific, and short. No flattery, no filler phrases like "great foundation" or "you're off to a good start." Say exactly what worked, what didn't, and what to fix — like a coach who respects the person enough to be straight with them. Analyze the transcript of a practice video based on the 5-part video creation formula.

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
    "topImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
    "overallSummary": "<2-3 sentences max. Be direct and specific: call out the 1-2 things they must fix before their next take. No compliments, no fluff — just the real coaching. Address them as 'you'.>",
    "actionChecklist": ["<Short action item 1 - start with a verb>", "<Short action item 2>", "<Short action item 3>", "<Short action item 4 if needed>", "<Short action item 5 if needed>"]
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

export async function generateTitle(transcript: string): Promise<string> {
  console.log(`[AI] Generating title from transcript (${transcript.length} chars)`);
  
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { 
        role: "system", 
        content: "You generate short session titles for recorded practice videos." 
      },
      {
        role: "user",
        content: `Create a clear title (6 to 12 words, max 80 characters) that describes the topic of the transcript below. Output only the title text. No quotes. No emojis.

Transcript:
${transcript.slice(0, 2000)}`,
      },
    ],
    max_completion_tokens: 100,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No title generated");
  }

  let title = content.trim();
  title = title.replace(/^["']|["']$/g, "");
  
  if (title.length > 80) {
    title = title.slice(0, 77) + "...";
  }

  return title;
}

// ─── DMO Summary Generation ───────────────────────────────────────────────────

interface DmoEntryForSummary {
  date: string;
  totalPoints: number;
  activitiesCompleted: string[];
  notes: string | null;
}

export async function generateDmoSummary(
  entries: DmoEntryForSummary[],
  periodType: "weekly" | "monthly",
  periodLabel: string
): Promise<{ summary: string; tips: string[]; moodScore: number; performanceScore: number }> {
  const entryLines = entries.map(e => {
    const parts: string[] = [
      `Date: ${e.date}`,
      `Score: ${e.totalPoints}/25 pts`,
      `Activities: ${e.activitiesCompleted.join(", ") || "none"}`,
    ];
    if (e.notes?.trim()) parts.push(`Notes: "${e.notes.trim()}"`);
    return parts.join(" | ");
  }).join("\n");

  const avgScore = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + e.totalPoints, 0) / entries.length)
    : 0;

  const prompt = `You are a warm, encouraging life coach reviewing a member's Daily Method of Operation (DMO) journal for their ${periodType} summary (${periodLabel}).

The member tracked 5 daily activities: Vision & Meditation, Personal Development, Expand Skills, Execution, and Connect with People. Each is worth up to 5 pts, for 25 pts max per day.

Here are their entries:
${entryLines}

Average daily score: ${avgScore}/25 pts over ${entries.length} days logged.

Write a ${periodType} summary in JSON with these exact keys:
{
  "summary": "A warm, personal 3-4 sentence narrative. Acknowledge their effort honestly. Mention emotional patterns from their notes if present. Celebrate wins. Be specific, not generic.",
  "tips": ["Specific actionable tip 1", "Specific actionable tip 2", "Specific actionable tip 3"],
  "moodScore": <float 1-10 based on tone of notes and consistency>,
  "performanceScore": <float 1-10 based on average points and days logged>
}

Be conversational and human. Reference specific things they wrote in their notes if they shared any. Keep tips concrete and doable, not vague platitudes.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No summary generated");

  const parsed = JSON.parse(content) as { summary: string; tips: string[]; moodScore: number; performanceScore: number };
  return {
    summary: parsed.summary || "",
    tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 5) : [],
    moodScore: Math.min(10, Math.max(1, Number(parsed.moodScore) || 5)),
    performanceScore: Math.min(10, Math.max(1, Number(parsed.performanceScore) || 5)),
  };
}

export async function generateBulletPoints(scriptContent: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are a video script assistant. Extract these three things from the script and return them as JSON:
- "hook": REWRITE the opening as one punchy sentence that jumps straight into the problem, question, or bold claim — NO names, NO greetings, NO "Hey", NO "Hi", NO "I'm", NO "it's [Name]". Start with the core tension or benefit. Example: if script opens with "Hey I'm Jane and today I'll show you why your emails go to spam", the hook should be "Your emails are going to spam — and here's exactly why."
- "bullets": Array of 3 to 5 short talking points a presenter can ad-lib from (each 5-10 words, no names)
- "cta": The call to action at the end (one sentence, no label, no name)

Return only valid JSON matching: { "hook": "...", "bullets": ["...", "..."], "cta": "..." }`,
      },
      {
        role: "user",
        content: `Extract hook, bullets, and CTA from this script:\n\n${scriptContent.trim().slice(0, 20000)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 600,
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "{}";
  const parsed = JSON.parse(raw) as { hook?: string; bullets?: string[]; cta?: string };

  // Strip any greeting/name intro the AI included despite instructions.
  // Handles: "Hey, it's Mark Harbert, and …" / "Hi, I'm Jane Smith, and …" / "Hello! It's Bob, …"
  let hook = parsed.hook?.trim() || "";
  hook = hook.replace(/^(hey|hi|hello)[,!.]?\s+(it'?s?|i'?m)\s+[\w]+(?:\s+[\w]+)?\s*[,!.]\s*(?:and\s+)?/i, "").trim();
  // Capitalize first character after stripping
  if (hook) hook = hook.charAt(0).toUpperCase() + hook.slice(1);

  const bullets = (parsed.bullets || []).slice(0, 5).map((b: string) => b.trim()).filter(Boolean);
  const cta = parsed.cta?.trim() || "";

  // Assemble with blank lines between sections
  const parts: string[] = [];
  if (hook) parts.push(hook);
  const bulletLines = bullets.slice(0, 5).map((b) => b.startsWith("•") ? b : `• ${b}`);
  if (bulletLines.length) parts.push(bulletLines.join("\n"));
  if (cta) parts.push(cta);

  return parts.join("\n\n");
}
