import type {
  CompetitorTracker,
  CapturedCompetitorEmail,
  InsightsResponse,
  LeaderboardEntry,
  AnomalyEvent,
  TrackerAnalytics,
  FunnelAnalysis,
  CompareTrackerSummary,
} from "@shared/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const SPIKE_MULTIPLIER = 2;
const SPIKE_MIN_BASELINE_AVG = 1; // need at least 1 email/week historical avg to claim a spike
const GAP_THRESHOLD_DAYS = 7;
const GAP_PRIOR_AVG_MAX_DAYS = 4; // only flag a gap if prior cadence was tighter than this
const ESP_CHANGE_RECENT_N = 5;
const ESP_CHANGE_PRIOR_N = 20;
const AUTH_RECENT_N = 10;
const AUTH_PRIOR_N = 20;
const AUTH_RECENT_FAIL_THRESHOLD = 0.3; // 30% recent failures
const AUTH_PRIOR_FAIL_MAX = 0.1; // baseline must be cleaner than 10%

interface TrackerEmails {
  tracker: CompetitorTracker;
  emails: CapturedCompetitorEmail[]; // sorted desc by receivedAt
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function authFailed(e: CapturedCompetitorEmail): boolean {
  const isFail = (v: string | null) =>
    v != null && v !== "pass" && v !== "neutral" && v !== "none" && v !== "" && v !== null;
  return isFail(e.spfResult) || isFail(e.dkimResult) || isFail(e.dmarcResult);
}

/**
 * Determine the most common non-null ESP in a list, returning {esp, count}.
 */
function dominantEsp(emails: CapturedCompetitorEmail[]): { esp: string | null; count: number } {
  const tally = new Map<string, number>();
  for (const e of emails) {
    if (!e.detectedEsp) continue;
    tally.set(e.detectedEsp, (tally.get(e.detectedEsp) || 0) + 1);
  }
  let best: { esp: string | null; count: number } = { esp: null, count: 0 };
  for (const [esp, count] of tally) {
    if (count > best.count) best = { esp, count };
  }
  return best;
}

function detectAnomaliesForTracker(t: TrackerEmails, now: number): AnomalyEvent[] {
  const out: AnomalyEvent[] = [];
  const { tracker, emails } = t;
  if (emails.length === 0) return out;

  // ── Spike: this week (last 7d) > SPIKE_MULTIPLIER × avg of prior 4 weeks ──
  const last7 = emails.filter((e) => now - new Date(e.receivedAt).getTime() < WEEK_MS).length;
  const priorBuckets: number[] = [0, 0, 0, 0];
  for (const e of emails) {
    const ageMs = now - new Date(e.receivedAt).getTime();
    if (ageMs < WEEK_MS) continue;
    const weekIdx = Math.floor(ageMs / WEEK_MS) - 1; // 0=8-14d ago, 3=29-35d ago
    if (weekIdx >= 0 && weekIdx < priorBuckets.length) priorBuckets[weekIdx]++;
  }
  const priorAvg = priorBuckets.reduce((a, b) => a + b, 0) / priorBuckets.length;
  if (priorAvg >= SPIKE_MIN_BASELINE_AVG && last7 >= Math.ceil(priorAvg * SPIKE_MULTIPLIER + 0.5)) {
    out.push({
      id: `${tracker.id}-spike`,
      trackerId: tracker.id,
      trackerName: tracker.name,
      type: "spike",
      severity: "warn",
      message: `Sent ${last7} email${last7 === 1 ? "" : "s"} this week — ${Math.round((last7 / Math.max(priorAvg, 0.01)) * 10) / 10}× the prior 4-week average of ${Math.round(priorAvg * 10) / 10}.`,
      occurredAt: new Date(now),
    });
  }

  // ── Gap: latest email older than threshold AND prior cadence was tight ──
  const newest = emails[0];
  const newestMs = new Date(newest.receivedAt).getTime();
  const sinceLastDays = (now - newestMs) / DAY_MS;
  if (sinceLastDays > GAP_THRESHOLD_DAYS && emails.length >= 5) {
    // Use the gaps among the most recent 10 (excluding the current silent gap)
    const window = emails.slice(0, 10);
    const gaps: number[] = [];
    for (let i = 1; i < window.length; i++) {
      gaps.push(
        (new Date(window[i - 1].receivedAt).getTime() - new Date(window[i].receivedAt).getTime()) /
          DAY_MS,
      );
    }
    const avgGapDays = gaps.reduce((a, b) => a + b, 0) / Math.max(gaps.length, 1);
    if (avgGapDays > 0 && avgGapDays < GAP_PRIOR_AVG_MAX_DAYS) {
      out.push({
        id: `${tracker.id}-gap`,
        trackerId: tracker.id,
        trackerName: tracker.name,
        type: "gap",
        severity: "info",
        message: `No email in ${Math.floor(sinceLastDays)} days — they were sending every ~${Math.round(avgGapDays * 10) / 10} days before.`,
        occurredAt: new Date(newestMs),
      });
    }
  }

  // ── ESP change: dominant ESP in most recent 5 differs from prior 20 ──
  if (emails.length >= ESP_CHANGE_RECENT_N + ESP_CHANGE_PRIOR_N) {
    const recent = emails.slice(0, ESP_CHANGE_RECENT_N);
    const prior = emails.slice(ESP_CHANGE_RECENT_N, ESP_CHANGE_RECENT_N + ESP_CHANGE_PRIOR_N);
    const recentTop = dominantEsp(recent);
    const priorTop = dominantEsp(prior);
    if (
      recentTop.esp &&
      priorTop.esp &&
      recentTop.esp !== priorTop.esp &&
      recentTop.count >= 3 // at least 3/5 use the new ESP
    ) {
      out.push({
        id: `${tracker.id}-esp`,
        trackerId: tracker.id,
        trackerName: tracker.name,
        type: "esp_change",
        severity: "alert",
        message: `Switched email platforms — last ${ESP_CHANGE_RECENT_N} sends from ${recentTop.esp} (was ${priorTop.esp}).`,
        occurredAt: new Date(newestMs),
      });
    }
  }

  // ── Auth regression: recent fail rate > threshold AND prior was clean ──
  if (emails.length >= AUTH_RECENT_N + AUTH_PRIOR_N) {
    const recent = emails.slice(0, AUTH_RECENT_N);
    const prior = emails.slice(AUTH_RECENT_N, AUTH_RECENT_N + AUTH_PRIOR_N);
    const recentFails = recent.filter(authFailed).length;
    const priorFails = prior.filter(authFailed).length;
    const recentRate = recentFails / recent.length;
    const priorRate = priorFails / prior.length;
    if (recentRate >= AUTH_RECENT_FAIL_THRESHOLD && priorRate <= AUTH_PRIOR_FAIL_MAX) {
      out.push({
        id: `${tracker.id}-auth`,
        trackerId: tracker.id,
        trackerName: tracker.name,
        type: "auth_regression",
        severity: "alert",
        message: `Authentication failures rising — ${Math.round(recentRate * 100)}% of last ${AUTH_RECENT_N} emails failed SPF/DKIM/DMARC (was ${Math.round(priorRate * 100)}% before).`,
        occurredAt: new Date(newestMs),
      });
    }
  }

  return out;
}

/**
 * Pure function: compute cross-tracker insights from raw tracker + email data.
 * Caller is responsible for fetching ownership-scoped data.
 */
export function computeInsights(input: TrackerEmails[]): InsightsResponse {
  const now = Date.now();

  let totalEmails7d = 0;
  let totalEmails30d = 0;
  let activeTrackerCount = 0;

  const leaderboard: LeaderboardEntry[] = [];
  const allAnomalies: AnomalyEvent[] = [];

  for (const t of input) {
    let count7d = 0;
    let prior7d = 0;
    let count30d = 0;
    for (const e of t.emails) {
      const ageMs = now - new Date(e.receivedAt).getTime();
      if (ageMs < WEEK_MS) count7d++;
      else if (ageMs < 2 * WEEK_MS) prior7d++;
      if (ageMs < 30 * DAY_MS) count30d++;
    }
    totalEmails7d += count7d;
    totalEmails30d += count30d;
    if (count7d > 0) activeTrackerCount++;
    leaderboard.push({
      trackerId: t.tracker.id,
      trackerName: t.tracker.name,
      count7d,
      prior7d,
      pctChange: pctChange(count7d, prior7d),
    });
    allAnomalies.push(...detectAnomaliesForTracker(t, now));
  }

  // Sort leaderboard by count7d desc; tie-break by prior7d desc, then name
  leaderboard.sort((a, b) =>
    b.count7d - a.count7d || b.prior7d - a.prior7d || a.trackerName.localeCompare(b.trackerName),
  );
  const topLeaderboard = leaderboard.filter((l) => l.count7d > 0).slice(0, 5);

  // Sort anomalies: most severe first, then most recent
  const sevRank: Record<string, number> = { alert: 0, warn: 1, info: 2 };
  allAnomalies.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] ||
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return {
    generatedAt: new Date(now),
    totalTrackers: input.length,
    totalEmails7d,
    totalEmails30d,
    activeTrackerCount,
    leaderboard: topLeaderboard,
    anomalies: allAnomalies,
  };
}

/**
 * Build a single CompareTrackerSummary from a tracker + its email list +
 * pre-computed analytics + funnel. Pure / synchronous.
 */
export function summarizeForCompare(args: {
  tracker: CompetitorTracker;
  emails: CapturedCompetitorEmail[];
  analytics: TrackerAnalytics;
  funnel: FunnelAnalysis;
}): CompareTrackerSummary {
  const { tracker, emails, analytics, funnel } = args;
  const now = Date.now();
  let emails7d = 0;
  let emails30d = 0;
  let priorWeek = 0;
  for (const e of emails) {
    const ageMs = now - new Date(e.receivedAt).getTime();
    if (ageMs < WEEK_MS) emails7d++;
    else if (ageMs < 2 * WEEK_MS) priorWeek++;
    if (ageMs < 30 * DAY_MS) emails30d++;
  }
  return {
    id: tracker.id,
    name: tracker.name,
    website: tracker.website ?? null,
    screenshotPath: tracker.screenshotPath ?? null,
    emailCount: analytics.totalEmails,
    emails7d,
    emails30d,
    weekOverWeekPct: pctChange(emails7d, priorWeek),
    avgEmailsPerWeek: analytics.averageEmailsPerWeek,
    primaryEsp: analytics.esp.primary,
    espConfidencePct: analytics.esp.confidencePct,
    busiestDayOfWeek: analytics.busiestDayOfWeek,
    busiestHour: analytics.busiestHour,
    avgSubjectLength: analytics.subject.avgLength,
    pctEmoji: analytics.subject.pctEmoji,
    spfPassPct: analytics.authentication.spfPassPct,
    dkimPassPct: analytics.authentication.dkimPassPct,
    dmarcPassPct: analytics.authentication.dmarcPassPct,
    welcomeSeriesDetected: funnel.welcomeSeries.detected,
    welcomeSeriesSteps: funnel.welcomeSeries.steps.length,
    welcomeSeriesDurationMs: funnel.welcomeSeries.totalDurationMs,
    lastReceivedAt: analytics.lastReceivedAt,
  };
}
