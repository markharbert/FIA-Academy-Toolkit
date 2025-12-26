import OpenAI from "openai";
import { storage } from "./storage";
import type { 
  Topic, InsertTopic, TopicRun, 
  TopicSearchInput, ScriptGenerationInput, ScriptJson,
  TopicIntent, DemandSignals, TrendDirection
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const topicCache = new Map<string, { topics: InsertTopic[]; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getYouTubeAutocomplete(query: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&callback=json`
    );
    const text = await response.text();
    const jsonStr = text.replace(/^[^(]+\(/, '').replace(/\)$/, '');
    const data = JSON.parse(jsonStr);
    if (Array.isArray(data) && data[1]) {
      return data[1].map((item: any) => (Array.isArray(item) ? item[0] : item)).slice(0, 15);
    }
    return [];
  } catch (err) {
    console.error("[TopicPulse] Autocomplete error:", err);
    return [];
  }
}

function generateKeywordVariations(seed: string): string[] {
  const variations: string[] = [seed];
  const prefixes = ["best", "top", "how to", "what is", "why"];
  const suffixes = ["review", "vs", "tutorial", "for beginners", "guide", "tips", "2025"];
  
  for (const prefix of prefixes) {
    variations.push(`${prefix} ${seed}`);
  }
  for (const suffix of suffixes) {
    variations.push(`${seed} ${suffix}`);
  }
  
  return variations.slice(0, 20);
}

function classifyIntent(query: string): TopicIntent {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("review") || lowerQuery.includes("worth it")) {
    return "review";
  }
  if (lowerQuery.includes("vs") || lowerQuery.includes("versus") || lowerQuery.includes("compared")) {
    return "comparison";
  }
  if (lowerQuery.includes("how to") || lowerQuery.includes("tutorial") || lowerQuery.includes("step by step")) {
    return "how-to";
  }
  if (lowerQuery.includes("fix") || lowerQuery.includes("problem") || lowerQuery.includes("issue") || lowerQuery.includes("not working")) {
    return "problem-fix";
  }
  if (lowerQuery.includes("beginner") || lowerQuery.includes("starter") || lowerQuery.includes("basics")) {
    return "beginner-guide";
  }
  if (lowerQuery.includes("top") || lowerQuery.includes("best") || lowerQuery.includes("list")) {
    return "top-list";
  }
  
  return "how-to";
}

function generateWhyText(query: string, signals: DemandSignals): string {
  const parts: string[] = [];
  
  if (signals.autocompletePresent) {
    parts.push("This topic appears in YouTube autocomplete, indicating active search demand.");
  }
  
  if (signals.freshnessScore > 60) {
    parts.push("Many recent videos on this topic suggest ongoing interest.");
  } else if (signals.freshnessScore < 30) {
    parts.push("Fewer recent videos could mean an opportunity to create fresh content.");
  }
  
  if (signals.competitionScore < 40) {
    parts.push("Lower competition from large channels makes this more accessible.");
  } else if (signals.competitionScore > 70) {
    parts.push("Competition is higher, but strong content can still break through.");
  }
  
  if (signals.trendDirection === "rising") {
    parts.push("Interest in this topic appears to be growing.");
  }
  
  if (parts.length === 0) {
    parts.push("This topic has potential based on keyword patterns and search behavior.");
  }
  
  return parts.join(" ");
}

function calculateOpportunityScore(signals: DemandSignals): number {
  let score = 50;
  
  if (signals.autocompletePresent) score += 15;
  
  if (signals.freshnessScore > 60) score += 10;
  else if (signals.freshnessScore < 30) score += 5;
  
  if (signals.competitionScore < 30) score += 20;
  else if (signals.competitionScore < 50) score += 10;
  else if (signals.competitionScore > 80) score -= 10;
  
  if (signals.trendDirection === "rising") score += 10;
  else if (signals.trendDirection === "falling") score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function createTopicTitle(query: string): string {
  return query
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function generateTopics(input: TopicSearchInput, runId: string): Promise<InsertTopic[]> {
  const cacheKey = `${input.seedQuery}:${input.region || "global"}`;
  const cached = topicCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.topics.map(t => ({ ...t, runId }));
  }
  
  const autocompleteSuggestions = await getYouTubeAutocomplete(input.seedQuery);
  const variations = generateKeywordVariations(input.seedQuery);
  
  const allQueries = Array.from(new Set([...autocompleteSuggestions, ...variations]));
  
  const topics: InsertTopic[] = [];
  
  for (const query of allQueries) {
    const intent = classifyIntent(query);
    
    if (input.videoType && intent !== input.videoType) {
      continue;
    }
    
    const signals: DemandSignals = {
      autocompletePresent: autocompleteSuggestions.includes(query),
      trendDirection: "unknown" as TrendDirection,
      freshnessScore: 50,
      competitionScore: 50,
    };
    
    const opportunityScore = calculateOpportunityScore(signals);
    const whyText = generateWhyText(query, signals);
    
    topics.push({
      runId,
      topicTitle: createTopicTitle(query),
      keywordQuery: query,
      intent,
      opportunityScore,
      demandSignalsJson: signals,
      whyText,
      suggestedAngles: null,
      suggestedHooks: null,
      suggestedTitles: null,
      suggestedThumbnailText: null,
      commonQuestions: null,
    });
  }
  
  topics.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
  const limitedTopics = topics.slice(0, 30);
  
  topicCache.set(cacheKey, { topics: limitedTopics, timestamp: Date.now() });
  
  return limitedTopics;
}

export async function enrichTopicDetails(topic: Topic): Promise<Partial<Topic>> {
  try {
    const prompt = `You are helping create YouTube video ideas for an affiliate marketer. 

Topic: "${topic.topicTitle}"
Keyword: "${topic.keywordQuery}"
Intent: ${topic.intent}

Generate content ideas for this topic. Respond in valid JSON only:
{
  "angles": ["angle 1", "angle 2", "angle 3", "angle 4", "angle 5"],
  "hooks": ["hook 1", "hook 2", "hook 3", "hook 4", "hook 5"],
  "titles": ["title 1", "title 2", "title 3", "title 4", "title 5", "title 6", "title 7", "title 8", "title 9", "title 10"],
  "thumbnailText": ["text 1", "text 2", "text 3", "text 4", "text 5"],
  "questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}

For hooks, write attention-grabbing opening lines (10-20 words each).
For angles, describe different perspectives to approach this topic.
For titles, write YouTube-optimized video titles.
For thumbnailText, write short 2-4 word phrases for thumbnails.
For questions, list common questions viewers have about this topic.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};

    const data = JSON.parse(content);
    
    return {
      suggestedAngles: data.angles || null,
      suggestedHooks: data.hooks || null,
      suggestedTitles: data.titles || null,
      suggestedThumbnailText: data.thumbnailText || null,
      commonQuestions: data.questions || null,
    };
  } catch (err) {
    console.error("[TopicPulse] Enrich error:", err);
    return {};
  }
}

export async function generateScript(input: ScriptGenerationInput, topic: Topic): Promise<ScriptJson> {
  const durationGuide = {
    "3-5": { hook: "10-15 seconds", setHook: "20-30 seconds", firstCTA: "10 seconds", content: "2-3 minutes", finalCTA: "20-30 seconds" },
    "6-10": { hook: "15-20 seconds", setHook: "30-45 seconds", firstCTA: "15 seconds", content: "4-7 minutes", finalCTA: "30-45 seconds" },
    "10-15": { hook: "20-30 seconds", setHook: "45-60 seconds", firstCTA: "15-20 seconds", content: "7-12 minutes", finalCTA: "45-60 seconds" },
  };
  
  const durations = durationGuide[input.videoLengthTarget];
  
  const prompt = `You are Mark Harbert, a YouTube marketing coach. Create a complete video script using the 5-part video formula.

TOPIC: ${topic.topicTitle}
KEYWORD: ${topic.keywordQuery}
INTENT: ${topic.intent}
AFFILIATE OFFER: ${input.affiliateOffer}
LINK LABEL: ${input.affiliateLinkLabel}
PRIMARY PROMISE: ${input.primaryPromise}
${input.personalAngle ? `PERSONAL ANGLE: ${input.personalAngle}` : ""}
TONE: ${input.tonePreference || "friendly"}
TARGET LENGTH: ${input.videoLengthTarget} minutes

Create a script with these exact sections and timing:
1. HOOK (${durations.hook}): Strong promise, curiosity line, who this is for
2. SET THE HOOK (${durations.setHook}): Agitate the problem, show what they'll learn, transition to content
3. FIRST CTA (${durations.firstCTA}): Quick subscribe/comment prompt, mention resource below (not salesy)
4. CONTENT (${durations.content}): Numbered sections with clear steps, 1-3 natural affiliate mentions framed as helpful
5. FINAL CTA (${durations.finalCTA}): Clear next step, mention the affiliate link, suggest related video

Respond in valid JSON:
{
  "fullScript": {
    "hook": { "text": "script text", "duration": "10-15 seconds", "onScreenText": ["text1", "text2"] },
    "setHook": { "text": "script text", "duration": "30 seconds", "onScreenText": ["text1"] },
    "firstCTA": { "text": "script text", "duration": "10 seconds" },
    "content": { 
      "text": "full content script",
      "sections": [
        { "title": "Section 1", "content": "content", "timestamp": "1:30", "brollIdeas": ["idea1"], "onScreenText": ["text1"] }
      ]
    },
    "finalCTA": { "text": "script text", "duration": "30 seconds", "nextVideoSuggestion": "suggested topic" }
  },
  "shortsScript": "30-45 second script for YouTube Short",
  "pinnedComment": "pinned comment draft",
  "description": {
    "summary": "2 line summary",
    "affiliateDisclosure": "affiliate disclosure line",
    "linkSection": "[LINK LABEL] link placeholder",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate script");
  }

  return JSON.parse(content) as ScriptJson;
}

export function getApiKeyStatus(): { youtube: boolean; openai: boolean; reddit: boolean } {
  return {
    youtube: !!YOUTUBE_API_KEY,
    openai: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    reddit: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
  };
}
