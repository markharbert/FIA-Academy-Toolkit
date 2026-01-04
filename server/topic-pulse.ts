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

async function getKeywordData(keywords: string[], userId?: string): Promise<KeywordDataResult> {
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
  const lowerQuery = query.toLowerCase();
  const intents: TopicIntent[] = [];
  
  if (lowerQuery.includes("review") || lowerQuery.includes("worth it")) {
    intents.push("review");
  }
  if (lowerQuery.includes("vs") || lowerQuery.includes("versus") || lowerQuery.includes("compared")) {
    intents.push("comparison");
  }
  if (lowerQuery.includes("how to") || lowerQuery.includes("tutorial") || lowerQuery.includes("step by step")) {
    intents.push("how-to");
  }
  if (lowerQuery.includes("fix") || lowerQuery.includes("problem") || lowerQuery.includes("issue") || lowerQuery.includes("not working")) {
    intents.push("problem-fix");
  }
  if (lowerQuery.includes("beginner") || lowerQuery.includes("starter") || lowerQuery.includes("basics")) {
    intents.push("beginner-guide");
  }
  if (lowerQuery.includes("top") || lowerQuery.includes("best") || lowerQuery.includes("list")) {
    intents.push("top-list");
  }
  if (lowerQuery.includes("buy") || lowerQuery.includes("price") || lowerQuery.includes("cost") || lowerQuery.includes("where to get") || lowerQuery.includes("purchase") || lowerQuery.includes("cheap") || lowerQuery.includes("discount") || lowerQuery.includes("deal")) {
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

export async function generateTopics(input: TopicSearchInput, runId: string, userId?: string): Promise<GenerateTopicsResult> {
  const cacheKey = `${input.seedQuery}:${input.region || "global"}`;
  const cached = topicCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { topics: cached.topics.map(t => ({ ...t, runId })), creditsUsed: 0 };
  }
  
  const autocompleteSuggestions = await getYouTubeAutocomplete(input.seedQuery);
  const variations = generateKeywordVariations(input.seedQuery);
  
  const allQueries = Array.from(new Set([...autocompleteSuggestions, ...variations]));
  
  const keywordResult = await getKeywordData(allQueries, userId);
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
      suggestedThumbnailText: null,
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
  youtube: KeywordData;
  pinterest: KeywordData;
  tiktok: KeywordData;
}

export async function fetchPlatformDataForTopic(
  topicId: string, 
  userId?: string
): Promise<{ topic: Topic; platformData: PlatformData } | null> {
  const topic = await storage.getTopic(topicId);
  if (!topic) {
    return null;
  }
  
  const keyword = topic.keywordQuery;
  
  const [youtubeData, pinterestData, tiktokData] = await Promise.all([
    getPlatformKeywordData(keyword, "youtube", userId),
    getPlatformKeywordData(keyword, "pinterest", userId),
    getPlatformKeywordData(keyword, "tiktok", userId),
  ]);
  
  const googleData: KeywordData = {
    volume: topic.monthlySearchVolume ?? null,
    cpc: topic.cpc ?? null,
    competition: topic.competition ?? null,
    trend: topic.trendData ?? null,
  };
  
  await storage.updateTopicPlatformData(topicId, {
    pinterestVolume: pinterestData.volume,
    pinterestCpc: pinterestData.cpc,
    pinterestCompetition: pinterestData.competition,
    pinterestTrendData: pinterestData.trend,
    youtubeVolume: youtubeData.volume,
    youtubeCpc: youtubeData.cpc,
    youtubeCompetition: youtubeData.competition,
    youtubeTrendData: youtubeData.trend,
    tiktokVolume: tiktokData.volume,
    tiktokCpc: tiktokData.cpc,
    tiktokCompetition: tiktokData.competition,
    tiktokTrendData: tiktokData.trend,
  });
  
  const updatedTopic = await storage.getTopic(topicId);
  
  return {
    topic: updatedTopic!,
    platformData: {
      google: googleData,
      youtube: youtubeData,
      pinterest: pinterestData,
      tiktok: tiktokData,
    }
  };
}
