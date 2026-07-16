import OpenAI from "openai";
import { storage } from "./storage";
import type { 
  Topic, InsertTopic, TopicRun, 
  TopicSearchInput, ScriptGenerationInput, ScriptJson,
  TopicIntent, DemandSignals, TrendDirection, TrendDataPoint
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SYSTEM_KEYWORDS_EVERYWHERE_API_KEY = process.env.KEYWORDS_EVERYWHERE_API_KEY;
const topicCache = new Map<string, { topics: InsertTopic[]; timestamp: number }>();
const keywordDataCache = new Map<string, { data: KeywordData; timestamp: number }>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getEffectiveKeywordsEverywhereApiKey(userId?: string): Promise<string | null> {
  if (userId) {
    const userKey = await storage.getDecryptedUserApiKey(userId, "keywords_everywhere");
    if (userKey) return userKey;
  }
  return SYSTEM_KEYWORDS_EVERYWHERE_API_KEY || null;
}

interface KeywordData {
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  trend: TrendDataPoint[] | null;
}

interface KeywordsEverywhereResult {
  keyword: string;
  vol: number;
  cpc?: { value: number; currency: string };
  competition?: number;
  trend?: Array<{ month: string; year: number; value: number }>;
}

interface KeywordDataResult {
  data: Map<string, KeywordData>;
  creditsUsed: number;
}

async function getKeywordData(keywords: string[], userId?: string, creditBudget?: number): Promise<KeywordDataResult> {
  const results = new Map<string, KeywordData>();
  const defaultData: KeywordData = { volume: null, cpc: null, competition: null, trend: null };
  
  const apiKey = await getEffectiveKeywordsEverywhereApiKey(userId);
  if (!apiKey || keywords.length === 0) {
    keywords.forEach(kw => results.set(kw.toLowerCase(), defaultData));
    return { data: results, creditsUsed: 0 };
  }
  
  const uncachedKeywords: string[] = [];
  for (const kw of keywords) {
    const cached = keywordDataCache.get(kw.toLowerCase());
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      results.set(kw.toLowerCase(), cached.data);
    } else {
      uncachedKeywords.push(kw);
    }
  }
  
  if (uncachedKeywords.length === 0) {
    return { data: results, creditsUsed: 0 };
  }

  // Enforce the credit budget: cap paid lookups to what the user can afford.
  // Keywords beyond the budget fall back to default (no volume/cpc data).
  if (creditBudget !== undefined && creditBudget < uncachedKeywords.length) {
    const budgetedKeywords = uncachedKeywords.slice(0, creditBudget);
    const skippedKeywords = uncachedKeywords.slice(creditBudget);
    skippedKeywords.forEach(kw => results.set(kw.toLowerCase(), defaultData));
    if (budgetedKeywords.length === 0) {
      return { data: results, creditsUsed: 0 };
    }
    console.log(`[KeywordsEverywhere] Credit budget (${creditBudget}) caps uncached lookups from ${uncachedKeywords.length} to ${budgetedKeywords.length}`);
    uncachedKeywords.length = 0;
    uncachedKeywords.push(...budgetedKeywords);
  }
  
  try {
    const BATCH_SIZE = 100;
    for (let i = 0; i < uncachedKeywords.length; i += BATCH_SIZE) {
      const batch = uncachedKeywords.slice(i, i + BATCH_SIZE);
      
      const formData = new URLSearchParams();
      formData.append("dataSource", "gkp");
      formData.append("country", "us");
      formData.append("currency", "USD");
      batch.forEach(kw => formData.append("kw[]", kw));
      
      const response = await fetch("https://api.keywordseverywhere.com/v1/get_keyword_data", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
        body: formData,
      });
      
      if (!response.ok) {
        console.error("[KeywordsEverywhere] API error:", response.status, await response.text());
        batch.forEach(kw => results.set(kw.toLowerCase(), defaultData));
        continue;
      }
      
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        for (const item of data.data as KeywordsEverywhereResult[]) {
          const keywordData: KeywordData = {
            volume: item.vol || 0,
            cpc: item.cpc?.value ?? null,
            competition: item.competition ?? null,
            trend: item.trend || null,
          };
          results.set(item.keyword.toLowerCase(), keywordData);
          keywordDataCache.set(item.keyword.toLowerCase(), { data: keywordData, timestamp: Date.now() });
        }
      }
      
      for (const kw of batch) {
        if (!results.has(kw.toLowerCase())) {
          const emptyData: KeywordData = { volume: 0, cpc: null, competition: null, trend: null };
          results.set(kw.toLowerCase(), emptyData);
          keywordDataCache.set(kw.toLowerCase(), { data: emptyData, timestamp: Date.now() });
        }
      }
      
      console.log(`[KeywordsEverywhere] Fetched batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data.data?.length || 0} keywords with full data`);
    }
  } catch (err) {
    console.error("[KeywordsEverywhere] Error fetching keyword data:", err);
    uncachedKeywords.forEach(kw => {
      if (!results.has(kw.toLowerCase())) {
        results.set(kw.toLowerCase(), defaultData);
      }
    });
  }
  
  console.log(`[KeywordsEverywhere] Total KE credits used: ${uncachedKeywords.length} (${keywords.length - uncachedKeywords.length} cached)`);
  return { data: results, creditsUsed: uncachedKeywords.length };
}

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

type DataSource = "gkp" | "youtube" | "pinterest" | "tiktok";

const platformDataCache = new Map<string, { data: KeywordData; timestamp: number }>();

async function getPlatformKeywordData(
  keyword: string, 
  dataSource: DataSource, 
  userId?: string
): Promise<KeywordData> {
  const defaultData: KeywordData = { volume: null, cpc: null, competition: null, trend: null };
  
  const apiKey = await getEffectiveKeywordsEverywhereApiKey(userId);
  if (!apiKey) {
    return defaultData;
  }
  
  const cacheKey = `${dataSource}:${keyword.toLowerCase()}`;
  const cached = platformDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[KeywordsEverywhere] Using CACHED ${dataSource.toUpperCase()} data for "${keyword}"`);
    return cached.data;
  }
  
  console.log(`[KeywordsEverywhere] Making FRESH API call for ${dataSource.toUpperCase()} "${keyword}"`)
  
  try {
    const formData = new URLSearchParams();
    formData.append("dataSource", dataSource);
    formData.append("country", "us");
    formData.append("currency", "USD");
    formData.append("kw[]", keyword);
    
    const response = await fetch("https://api.keywordseverywhere.com/v1/get_keyword_data", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      body: formData,
    });
    
    if (!response.ok) {
      console.error(`[KeywordsEverywhere] ${dataSource} API error:`, response.status, await response.text());
      return defaultData;
    }
    
    const data = await response.json();
    
    // Log raw API response for debugging
    console.log(`[KeywordsEverywhere] RAW ${dataSource.toUpperCase()} response for "${keyword}":`, JSON.stringify(data.data?.[0] || null));
    
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0] as KeywordsEverywhereResult;
      const keywordData: KeywordData = {
        volume: item.vol || 0,
        cpc: item.cpc?.value ?? null,
        competition: item.competition ?? null,
        trend: item.trend || null,
      };
      platformDataCache.set(cacheKey, { data: keywordData, timestamp: Date.now() });
      console.log(`[KeywordsEverywhere] Fetched ${dataSource.toUpperCase()} data for "${keyword}": vol=${keywordData.volume}, cpc=${keywordData.cpc}, competition=${keywordData.competition}`);
      return keywordData;
    }
    
    console.log(`[KeywordsEverywhere] No data returned for ${dataSource.toUpperCase()} "${keyword}"`);
    return defaultData;
  } catch (err) {
    console.error(`[KeywordsEverywhere] Error fetching ${dataSource} data:`, err);
    return defaultData;
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

function classifyIntents(query: string): TopicIntent[] {
  const q = query.toLowerCase();
  const intents: TopicIntent[] = [];

  // Review — requires whole-word "review" to avoid false matches
  if (/\breview\b/.test(q) || /\brating\b/.test(q) || /\bratings\b/.test(q) || q.includes("worth it") || q.includes("honest opinion")) {
    intents.push("review");
  }

  // Comparison — whole-word "vs", "compare", "versus", "difference between"
  if (/\bvs\b/.test(q) || /\bversus\b/.test(q) || /\bcompare\b/.test(q) || q.includes("compared to") || q.includes("difference between") || q.includes("which is better")) {
    intents.push("comparison");
  }

  // How-to — instructional content
  if (q.includes("how to") || q.includes("tutorial") || q.includes("step by step") || /\bguide\b/.test(q) || /\btips\b/.test(q) || q.includes("ways to") || q.includes("learn ") || q.includes("how do")) {
    intents.push("how-to");
  }

  // Problem-fix — whole-word "fix" to avoid "prefix"/"suffix"
  if (/\bfix\b/.test(q) || /\bproblem\b/.test(q) || /\bissue\b/.test(q) || q.includes("not working") || q.includes("error") || q.includes("help with") || q.includes("troubleshoot")) {
    intents.push("problem-fix");
  }

  // Beginner guide
  if (/\bbeginner\b/.test(q) || /\bstarter\b/.test(q) || /\bbasics\b/.test(q) || q.includes("for beginners") || q.includes("get started") || q.includes("introduction to")) {
    intents.push("beginner-guide");
  }

  // Top list — whole-word "top", "best", "list" to avoid "laptop", "stop", "playlist"
  if (/\bbest\b/.test(q) || /\btop\b/.test(q) || /\blist\b/.test(q) || q.includes("most popular") || q.includes("top rated") || q.includes("ranked")) {
    intents.push("top-list");
  }

  // Buyer intent
  if (/\bbuy\b/.test(q) || /\bprice\b/.test(q) || /\bcost\b/.test(q) || /\bcheap\b/.test(q) || /\bdeal\b/.test(q) || /\border\b/.test(q) || q.includes("where to get") || q.includes("purchase") || q.includes("discount") || q.includes("how much")) {
    intents.push("buyer");
  }

  return intents.length > 0 ? intents : ["how-to"];
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

function calculateOpportunityScore(
  signals: DemandSignals, 
  keywordData: KeywordData
): number {
  let score = 0;
  
  // Volume component (0-30 points) - higher volume = higher score
  // No data = 0 points (not a default)
  const volume = keywordData.volume;
  if (volume !== null && volume > 0) {
    if (volume >= 10000) score += 30;
    else if (volume >= 5000) score += 25;
    else if (volume >= 1000) score += 20;
    else if (volume >= 500) score += 15;
    else if (volume >= 100) score += 10;
    else score += 5;
  }
  // else: no data = 0 points
  
  // Competition component (0-30 points) - lower competition = higher score
  // No data = 0 points
  const competition = keywordData.competition;
  if (competition !== null) {
    if (competition <= 0.2) score += 30;
    else if (competition <= 0.4) score += 24;
    else if (competition <= 0.5) score += 18;
    else if (competition <= 0.7) score += 12;
    else if (competition <= 0.9) score += 6;
    else score += 3;
  }
  // else: no data = 0 points
  
  // CPC component (0-20 points) - higher CPC = more commercial value = higher score
  // No data = 0 points
  const cpc = keywordData.cpc;
  if (cpc !== null && cpc > 0) {
    if (cpc >= 5) score += 20;
    else if (cpc >= 2) score += 16;
    else if (cpc >= 1) score += 12;
    else if (cpc >= 0.5) score += 8;
    else score += 4;
  }
  // else: no data = 0 points
  
  // Trend component (0-10 points) - rising trend = higher score
  // No data = 0 points
  const trend = keywordData.trend;
  if (trend && trend.length >= 6) {
    const recentMonths = trend.slice(-3);
    const olderMonths = trend.slice(-6, -3);
    const recentAvg = recentMonths.reduce((sum, t) => sum + t.value, 0) / recentMonths.length;
    const olderAvg = olderMonths.reduce((sum, t) => sum + t.value, 0) / olderMonths.length;
    
    if (olderAvg > 0) {
      const growthRate = (recentAvg - olderAvg) / olderAvg;
      if (growthRate > 0.2) score += 10;      // Strong rising
      else if (growthRate > 0.05) score += 7; // Rising
      else if (growthRate >= -0.05) score += 4; // Stable
      else score += 1;                         // Declining
    }
  }
  // else: no data = 0 points
  
  // Autocomplete presence (0-10 points) - appearing in YouTube autocomplete = active demand
  if (signals.autocompletePresent) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

function getTrendDirection(trend: TrendDataPoint[] | null): TrendDirection {
  if (!trend || trend.length < 6) return "unknown";
  
  const recentMonths = trend.slice(-3);
  const olderMonths = trend.slice(-6, -3);
  const recentAvg = recentMonths.reduce((sum, t) => sum + t.value, 0) / recentMonths.length;
  const olderAvg = olderMonths.reduce((sum, t) => sum + t.value, 0) / olderMonths.length;
  
  if (olderAvg === 0) return "unknown";
  
  const growthRate = (recentAvg - olderAvg) / olderAvg;
  if (growthRate > 0.1) return "rising";
  if (growthRate < -0.1) return "falling";
  return "steady";
}

function createTopicTitle(query: string): string {
  return query
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface GenerateTopicsResult {
  topics: InsertTopic[];
  creditsUsed: number;
}

export async function generateTopics(input: TopicSearchInput, runId: string, userId?: string, creditBudget?: number): Promise<GenerateTopicsResult> {
  const cacheKey = `${input.seedQuery}:${input.region || "global"}`;
  const cached = topicCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { topics: cached.topics.map(t => ({ ...t, runId })), creditsUsed: 0 };
  }
  
  const autocompleteSuggestions = await getYouTubeAutocomplete(input.seedQuery);
  const variations = generateKeywordVariations(input.seedQuery);
  
  const allQueries = Array.from(new Set([...autocompleteSuggestions, ...variations]));
  
  const keywordResult = await getKeywordData(allQueries, userId, creditBudget);
  const keywordDataMap = keywordResult.data;
  const creditsUsed = keywordResult.creditsUsed;
  
  const topics: InsertTopic[] = [];
  
  for (const query of allQueries) {
    const intents = classifyIntents(query);
    
    if (input.videoType && !intents.includes(input.videoType as TopicIntent)) {
      continue;
    }
    
    const kwData = keywordDataMap.get(query.toLowerCase()) || { 
      volume: null, cpc: null, competition: null, trend: null 
    };
    
    const trendDirection = getTrendDirection(kwData.trend);
    const competitionScore = kwData.competition !== null ? Math.round(kwData.competition * 100) : 50;
    
    const signals: DemandSignals = {
      autocompletePresent: autocompleteSuggestions.includes(query),
      trendDirection,
      freshnessScore: 50,
      competitionScore,
    };
    
    const opportunityScore = calculateOpportunityScore(signals, kwData);
    const whyText = generateWhyText(query, signals);
    
    topics.push({
      runId,
      topicTitle: createTopicTitle(query),
      keywordQuery: query,
      intents,
      opportunityScore,
      monthlySearchVolume: kwData.volume,
      cpc: kwData.cpc,
      competition: kwData.competition,
      trendData: kwData.trend,
      demandSignalsJson: signals,
      whyText,
      suggestedAngles: null,
      suggestedHooks: null,
      suggestedTitles: null,
      commonQuestions: null,
    });
  }
  
  topics.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
  const limitedTopics = topics.slice(0, 30);
  
  topicCache.set(cacheKey, { topics: limitedTopics, timestamp: Date.now() });
  
  return { topics: limitedTopics, creditsUsed };
}

export async function enrichTopicDetails(topic: Topic): Promise<Partial<Topic>> {
  try {
    const prompt = `You are helping create YouTube video ideas for an affiliate marketer. 

Topic: "${topic.topicTitle}"
Keyword: "${topic.keywordQuery}"
Intents: ${topic.intents?.join(", ") || "general"}

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
      commonQuestions: data.questions || null,
    };
  } catch (err) {
    console.error("[TopicPulse] Enrich error:", err);
    return {};
  }
}

export async function generateScript(input: ScriptGenerationInput, topic: Topic, intentAnalysis?: string | null): Promise<ScriptJson> {
  const durationGuide = {
    "3-5": { hook: "10-15 seconds", setHook: "20-30 seconds", firstCTA: "10 seconds", content: "2-3 minutes", finalCTA: "20-30 seconds" },
    "6-10": { hook: "15-20 seconds", setHook: "30-45 seconds", firstCTA: "15 seconds", content: "4-7 minutes", finalCTA: "30-45 seconds" },
    "10-15": { hook: "20-30 seconds", setHook: "45-60 seconds", firstCTA: "15-20 seconds", content: "7-12 minutes", finalCTA: "45-60 seconds" },
  };
  
  const durations = durationGuide[input.videoLengthTarget];
  
  const affiliateOffer = input.affiliateOffer || "your recommended resource";
  const affiliateLinkLabel = input.affiliateLinkLabel || "link in description";
  const primaryPromise = input.primaryPromise || `helping viewers understand ${topic.topicTitle}`;
  
  const prompt = `You are Mark Harbert, a YouTube marketing coach. Create a complete video script using the 5-part video formula.

TOPIC: ${topic.topicTitle}
KEYWORD: ${topic.keywordQuery}
INTENTS: ${topic.intents?.join(", ") || "general"}
AFFILIATE OFFER: ${affiliateOffer}
LINK LABEL: ${affiliateLinkLabel}
PRIMARY PROMISE: ${primaryPromise}
${input.personalAngle ? `PERSONAL ANGLE: ${input.personalAngle}` : ""}
TONE: ${input.tonePreference || "friendly"}
TARGET LENGTH: ${input.videoLengthTarget} minutes
${intentAnalysis ? `\nSEARCHER INTENT ANALYSIS (use this to deeply understand WHY people search this keyword and what they truly want — let it shape your hook, the pain you agitate, and every promise you make):\n${intentAnalysis}` : ""}

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

function formatForTeleprompter(text: string): string {
  // Collect all sentences from the raw text (collapse any existing line structure)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sentences: string[] = [];
  for (const line of lines) {
    // Split each line into individual sentences on sentence-ending punctuation
    const parts = line.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const s = part.trim();
      if (s) sentences.push(s);
    }
  }
  // Group into paragraphs of 1-2 sentences separated by blank lines
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(' ');
    if (chunk.trim()) paragraphs.push(chunk.trim());
  }
  return paragraphs.join('\n\n');
}

export async function generateFullScript(
  fullScript: NonNullable<import("../shared/schema").ScriptJson["fullScript"]>,
  inputsJson: { videoLengthTarget?: string; tonePreference?: string; affiliateOffer?: string },
  topicTitle: string
): Promise<string> {
  const durationGuide: Record<string, string> = {
    "3-5":   "approximately 3-5 minutes when read aloud at a natural pace",
    "6-10":  "approximately 6-10 minutes when read aloud at a natural pace",
    "10-15": "approximately 10-15 minutes when read aloud at a natural pace",
  };
  const targetLength = durationGuide[inputsJson.videoLengthTarget ?? "6-10"] ?? durationGuide["6-10"];

  const outlineParts: string[] = [];
  if (fullScript.hook.text)     outlineParts.push(`HOOK:\n${fullScript.hook.text}`);
  if (fullScript.setHook.text)  outlineParts.push(`SET THE HOOK:\n${fullScript.setHook.text}`);
  if (fullScript.firstCTA.text) outlineParts.push(`FIRST CALL TO ACTION:\n${fullScript.firstCTA.text}`);
  if (fullScript.content.text)  outlineParts.push(`CONTENT INTRO:\n${fullScript.content.text}`);
  (fullScript.content.sections ?? []).forEach(s => {
    if (s.content) outlineParts.push(`CONTENT SECTION "${s.title}":\n${s.content}`);
  });
  if (fullScript.finalCTA.text) outlineParts.push(`FINAL CALL TO ACTION:\n${fullScript.finalCTA.text}`);

  const prompt = `You are a professional scriptwriter. Expand the following video script outline into a complete, polished, word-for-word teleprompter script.

TOPIC: ${topicTitle}
TARGET LENGTH: ${targetLength}
TONE: ${inputsJson.tonePreference ?? "friendly and conversational"}
${inputsJson.affiliateOffer ? `AFFILIATE OFFER TO MENTION: ${inputsJson.affiliateOffer}` : ""}

OUTLINE (expand each section into natural spoken language — do not skip any section):
${outlineParts.join("\n\n")}

RULES:
- Output ONLY the spoken script — no section headers, labels, or stage directions
- Write naturally flowing spoken sentences with smooth transitions between sections
- Follow the 5-part order: Hook → Set the Hook → First CTA → Content → Final CTA
- Use conversational language that sounds natural when read aloud
- Expand the outline ideas into full, engaging sentences — not bullet points
- Match the target length by elaborating appropriately on each section
- CRITICAL FORMATTING: This is for a teleprompter. Put a blank line between every 1-2 sentences. Never write more than 2 sentences in a row without a blank line. Short, easy-to-read paragraphs only.

Return only the final script text. No headers, no labels, no JSON. Blank line between every 1-2 sentences.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Failed to generate full script");
  return formatForTeleprompter(content);
}

export async function generateHookVariations(
  topic: Topic,
  currentHook: string,
  intentAnalysis?: string | null
): Promise<string> {
  const prompt = `You are a viral YouTube hook expert who studies the most successful hooks across millions of videos. Your job is to write ONE powerful new hook for a video about this topic.

TOPIC: ${topic.topicTitle}
KEYWORD: ${topic.keywordQuery}
INTENTS: ${topic.intents?.join(", ") || "general"}
${intentAnalysis ? `\nSEARCHER INTENT ANALYSIS (this is critical — read it carefully before writing anything. Use it to understand the exact emotional state, hidden fear, core desire, and urgency driving someone to search this keyword. Every word of your hook should speak directly to what this analysis reveals):\n${intentAnalysis}` : ""}

CURRENT HOOK (for reference — do NOT reuse this, write something genuinely different):
${currentHook}

Use one of these proven viral hook templates as your foundation:
1. BOLD PROMISE: "In the next [X] minutes, you'll discover exactly how to [specific result]..."
2. CURIOSITY GAP: "Most [audience] have no idea this exists — but it's the reason [result]..."
3. PATTERN INTERRUPT: "Stop doing [common practice]. It's costing you [loss]. Here's what actually works..."
4. PAIN AGITATION: "If you're struggling with [pain point], you're probably making one of these mistakes..."
5. RELATABLE STORY: "I used to [struggle they relate to] — until I discovered [counterintuitive solution]..."
6. SPECIFIC PROOF: "This single [strategy] is how I [specific measurable result] without [common objection]..."
7. WARNING/SECRET: "Before you [do thing they plan to do], watch this. There's something [topic] gurus won't tell you..."
8. IF-THEN: "If you want [desired outcome] but keep hitting [barrier], this changes everything..."

Rules for a great hook:
- Open with a punchy sentence under 15 words — make them feel it immediately
- Address the viewer's specific pain or desire in the first 5 seconds
- Create a strong reason to keep watching (curiosity, promise, or fear of missing out)
- Be specific with numbers, timeframes, or outcomes — vague hooks don't work
- Sound like a real person talking, not a marketer
- Keep it to 2-4 sentences (15-25 seconds when spoken)

Respond with ONLY the hook text — no labels, no JSON, no explanation.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.85,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Failed to generate hook");
  return content;
}

export async function generateIntentAnalysis(topic: Topic): Promise<string> {
  const prompt = `You are a YouTube growth strategist helping creators understand their audience. Analyze the search intent behind this keyword and provide deep psychological insights.

KEYWORD: "${topic.keywordQuery}"
TOPIC TITLE: "${topic.topicTitle}"
CLASSIFIED INTENTS: ${topic.intents?.join(", ") || "unknown"}
${topic.monthlySearchVolume ? `MONTHLY SEARCHES: ${topic.monthlySearchVolume.toLocaleString()}` : ""}

Provide a brief but highly insightful analysis (2-4 sentences) that reveals:
1. The specific pain point, desire, or curiosity driving someone to search this
2. Where they likely are in their decision/learning journey
3. What outcome they're hoping to achieve
4. Any emotional undertones or urgency signals

Be specific and vivid - avoid generic statements. Write as if explaining to a content creator why this search matters and what the searcher truly wants.

Respond with ONLY the analysis text, no JSON or formatting.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate intent analysis");
  }

  return content.trim();
}

export function getApiKeyStatus(): { youtube: boolean; openai: boolean; reddit: boolean; keywordsEverywhere: boolean } {
  return {
    youtube: !!YOUTUBE_API_KEY,
    openai: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    reddit: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
    keywordsEverywhere: !!SYSTEM_KEYWORDS_EVERYWHERE_API_KEY,
  };
}

export async function getKeywordsEverywhereCredits(userId?: string): Promise<{ credits: number | null; error?: string }> {
  const apiKey = await getEffectiveKeywordsEverywhereApiKey(userId);
  if (!apiKey) {
    return { credits: null, error: "API key not configured" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("dataSource", "gkp");
    formData.append("country", "us");
    formData.append("currency", "USD");
    formData.append("kw[]", "test");
    
    const response = await fetch("https://api.keywordseverywhere.com/v1/get_keyword_data", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[KeywordsEverywhere] Credits API error:", response.status, text);
      return { credits: null, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return { credits: data.credits ?? null };
  } catch (err) {
    console.error("[KeywordsEverywhere] Credits fetch error:", err);
    return { credits: null, error: "Failed to fetch credits" };
  }
}

interface PlatformData {
  google: KeywordData;
}

export async function fetchPlatformDataForTopic(
  topicId: string, 
  _userId?: string
): Promise<{ topic: Topic; platformData: PlatformData } | null> {
  const topic = await storage.getTopic(topicId);
  if (!topic) {
    return null;
  }
  
  const googleData: KeywordData = {
    volume: topic.monthlySearchVolume ?? null,
    cpc: topic.cpc ?? null,
    competition: topic.competition ?? null,
    trend: topic.trendData ?? null,
  };
  
  return {
    topic,
    platformData: {
      google: googleData,
    }
  };
}
