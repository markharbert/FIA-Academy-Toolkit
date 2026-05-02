import type {
  CompetitorSeedAddress,
  CapturedCompetitorEmail,
  FunnelAnalysis,
  FunnelClassification,
  FunnelConfidence,
  FunnelEmail,
  FunnelSeedTimeline,
  WelcomeSeriesStep,
} from "@shared/schema";

const MIN_EMAILS_FOR_DETECTION = 3;
const CROSS_SEED_MATCH_WINDOW_MS = 15 * 60 * 1000; // ±15 min for "same" arrival
const WELCOME_TRIGGER_MAX_OFFSET_MS = 30 * 60 * 1000; // <=30 min from signup → likely welcome trigger
const SHORT_GAP_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7-day max gap inside welcome series
const GAP_BREAK_MULTIPLIER = 3; // gap > 3× early-median ends the welcome series
const OFF_HOURS_START = 22;
const OFF_HOURS_END = 6;

/**
 * Normalize a subject for cross-seed matching.
 * Strips greetings/personalization, emoji, punctuation, multiple spaces, lowercases.
 */
function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    // Strip leading "hey {name}", "hi {name},", etc.
    .replace(/^(hey|hi|hello|dear)\s+[a-z]+[,:]?\s*/i, "")
    // Strip emoji and most non-word punctuation
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function isOffHours(d: Date): boolean {
  const h = d.getHours();
  return h >= OFF_HOURS_START || h < OFF_HOURS_END;
}

interface RawEmail {
  id: string;
  seedAddressId: string | null;
  subject: string;
  fromName: string | null;
  receivedAt: Date;
  offsetMs: number | null;
}

/**
 * Stage 1: Cross-seed alignment classification.
 * Groups emails by normalized subject. For groups spanning ≥2 seeds:
 *  - If their offsets-from-signup cluster within CROSS_SEED_MATCH_WINDOW_MS → AUTOMATED (high)
 *  - If their wall-clock receivedAt cluster within CROSS_SEED_MATCH_WINDOW_MS → BROADCAST (high)
 */
function classifyByCrossSeed(emails: RawEmail[]): Map<string, { c: FunnelClassification; conf: FunnelConfidence }> {
  const result = new Map<string, { c: FunnelClassification; conf: FunnelConfidence }>();
  if (emails.length < 2) return result;

  // Group by normalized subject
  const groups = new Map<string, RawEmail[]>();
  for (const e of emails) {
    const key = normalizeSubject(e.subject);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  for (const group of groups.values()) {
    // Need members from ≥2 distinct seeds with known offsets
    const withOffset = group.filter((e) => e.seedAddressId && e.offsetMs != null);
    const distinctSeeds = new Set(withOffset.map((e) => e.seedAddressId));
    if (distinctSeeds.size < 2) continue;

    const offsets = withOffset.map((e) => e.offsetMs!);
    const wallClocks = withOffset.map((e) => e.receivedAt.getTime());
    const offsetSpread = Math.max(...offsets) - Math.min(...offsets);
    const wallSpread = Math.max(...wallClocks) - Math.min(...wallClocks);

    let classification: FunnelClassification | null = null;
    if (offsetSpread <= CROSS_SEED_MATCH_WINDOW_MS && offsetSpread < wallSpread) {
      classification = "automated";
    } else if (wallSpread <= CROSS_SEED_MATCH_WINDOW_MS && wallSpread < offsetSpread) {
      classification = "broadcast";
    } else if (offsetSpread <= CROSS_SEED_MATCH_WINDOW_MS) {
      // Both within window (e.g. seeds signed up close together) — prefer automated
      // since identical offset is the stronger automation signal.
      classification = "automated";
    } else if (wallSpread <= CROSS_SEED_MATCH_WINDOW_MS) {
      classification = "broadcast";
    }

    if (classification) {
      for (const e of withOffset) {
        result.set(e.id, { c: classification, conf: "high" });
      }
    }
  }
  return result;
}

/**
 * Stage 2: Single-seed (or fallback) classification using timing heuristics.
 * Walks each seed's chronological email list and assigns:
 *  - First email with offset < WELCOME_TRIGGER_MAX_OFFSET_MS → AUTOMATED (medium)
 *  - Subsequent emails inside SHORT_GAP_MAX_MS with steady gaps → AUTOMATED (low)
 *  - When a gap exceeds GAP_BREAK_MULTIPLIER × the median early gap → from there on, BROADCAST (low)
 *  - Off-hours adds a slight automated weight
 */
function classifyBySingleSeed(
  emailsBySeed: Map<string, RawEmail[]>,
  alreadyClassified: Map<string, { c: FunnelClassification; conf: FunnelConfidence }>,
): void {
  for (const seedEmails of emailsBySeed.values()) {
    if (seedEmails.length === 0) continue;
    const sorted = [...seedEmails].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    // Compute gaps between consecutive emails for this seed
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].receivedAt.getTime() - sorted[i - 1].receivedAt.getTime());
    }
    // Median of the first N=min(5, gaps.length) gaps to characterize "early cadence"
    const earlyGaps = gaps.slice(0, Math.min(5, gaps.length));
    const earlyMedian = median(earlyGaps);

    let inAutoEra = true;
    let prev: RawEmail | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      // Skip if cross-seed already classified with high confidence
      if (alreadyClassified.has(e.id)) {
        // Track era based on cross-seed verdict
        const v = alreadyClassified.get(e.id)!;
        if (v.c === "broadcast") inAutoEra = false;
        prev = e;
        continue;
      }

      // First-email rule
      if (i === 0) {
        if (e.offsetMs != null && e.offsetMs <= WELCOME_TRIGGER_MAX_OFFSET_MS) {
          alreadyClassified.set(e.id, { c: "automated", conf: "medium" });
          prev = e;
          continue;
        }
        // First email but no quick trigger — could be either; mark unknown for now
        alreadyClassified.set(e.id, { c: "unknown", conf: "low" });
        prev = e;
        continue;
      }

      const gap = prev ? e.receivedAt.getTime() - prev.receivedAt.getTime() : Infinity;

      // Era break: spec says break when gap > 3× early-median OR gap > 7d.
      // Use OR semantics so whichever threshold is smaller trips first.
      if (
        inAutoEra &&
        ((earlyMedian > 0 && gap > earlyMedian * GAP_BREAK_MULTIPLIER) ||
          gap > SHORT_GAP_MAX_MS)
      ) {
        inAutoEra = false;
      }

      if (inAutoEra && gap <= SHORT_GAP_MAX_MS) {
        // Bump to medium if off-hours adds weight
        const conf: FunnelConfidence = isOffHours(e.receivedAt) ? "medium" : "low";
        alreadyClassified.set(e.id, { c: "automated", conf });
      } else {
        alreadyClassified.set(e.id, { c: "broadcast", conf: "low" });
        inAutoEra = false;
      }
      prev = e;
    }
  }
}

/**
 * Build the welcome-series steps from the per-seed timelines.
 * Strategy: take the seed with the longest run of consecutive automated emails
 * starting at index 0, then dedupe steps by normalized subject (median offset).
 */
function buildWelcomeSeries(
  timelines: FunnelSeedTimeline[],
): { steps: WelcomeSeriesStep[]; totalDurationMs: number; medianGapMs: number } {
  // Take the seed with the longest leading automated run
  let best: FunnelEmail[] = [];
  for (const t of timelines) {
    const run: FunnelEmail[] = [];
    for (const e of t.emails) {
      if (e.classification === "automated") {
        run.push(e);
      } else {
        break;
      }
    }
    if (run.length > best.length) best = run;
  }

  if (best.length === 0) {
    return { steps: [], totalDurationMs: 0, medianGapMs: 0 };
  }

  // Dedupe the leading auto-run by normalized subject, keeping the FIRST occurrence
  // (preserves chronological step order). Repeated subjects in one seed otherwise
  // inflate the step count.
  const seenInBest = new Set<string>();
  const dedupedBest: FunnelEmail[] = [];
  for (const e of best) {
    const key = normalizeSubject(e.subject);
    if (seenInBest.has(key)) continue;
    seenInBest.add(key);
    dedupedBest.push(e);
  }

  // Collect offsets per step subject; seed with the deduped best, then enrich with
  // matching automated emails from other seeds.
  const stepsBySubject = new Map<string, { offsets: number[]; rep: FunnelEmail }>();
  for (const e of dedupedBest) {
    const key = normalizeSubject(e.subject);
    stepsBySubject.set(key, { offsets: e.offsetMs != null ? [e.offsetMs] : [], rep: e });
  }
  for (const t of timelines) {
    for (const e of t.emails) {
      if (e.classification !== "automated" || e.offsetMs == null) continue;
      const key = normalizeSubject(e.subject);
      const bucket = stepsBySubject.get(key);
      if (bucket && !bucket.offsets.includes(e.offsetMs)) {
        bucket.offsets.push(e.offsetMs);
      }
    }
  }

  const steps: WelcomeSeriesStep[] = dedupedBest.map((e, idx) => {
    const key = normalizeSubject(e.subject);
    const offsets = stepsBySubject.get(key)?.offsets || (e.offsetMs != null ? [e.offsetMs] : []);
    return {
      emailId: e.id,
      step: idx + 1,
      subject: e.subject,
      fromName: e.fromName,
      offsetMs: offsets.length ? median(offsets) : (e.offsetMs ?? 0),
      receivedAt: e.receivedAt,
    };
  });

  const totalDurationMs = steps.length > 1 ? steps[steps.length - 1].offsetMs - steps[0].offsetMs : 0;
  const gaps: number[] = [];
  for (let i = 1; i < steps.length; i++) {
    gaps.push(steps[i].offsetMs - steps[i - 1].offsetMs);
  }
  return { steps, totalDurationMs, medianGapMs: median(gaps) };
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const days = Math.round(hr / 24);
  if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
  if (hr >= 1) return `${hr} ${hr === 1 ? "hour" : "hours"}`;
  if (min >= 1) return `${min} ${min === 1 ? "minute" : "minutes"}`;
  return `${sec}s`;
}

/**
 * Main entry: pure function. Pass seeds + emails, get back a FunnelAnalysis.
 */
export function analyzeFunnel(
  seeds: (CompetitorSeedAddress & { address: string })[],
  emails: CapturedCompetitorEmail[],
): FunnelAnalysis {
  const seedById = new Map(seeds.map((s) => [s.id, s]));

  // Build raw emails with computed offset from their seed's createdAt
  const raw: RawEmail[] = emails.map((e) => {
    const seed = e.seedAddressId ? seedById.get(e.seedAddressId) : undefined;
    const offsetMs = seed
      ? new Date(e.receivedAt).getTime() - new Date(seed.createdAt).getTime()
      : null;
    return {
      id: e.id,
      seedAddressId: e.seedAddressId,
      subject: e.subject,
      fromName: e.fromName,
      receivedAt: new Date(e.receivedAt),
      // Treat negative offsets (email arrived before seed signup — clock skew or seed re-creation)
      // as unknown so they don't trigger the quick-trigger automated rule and stay consistent
      // with the UI which hides negative-offset dots.
      offsetMs: offsetMs != null && offsetMs >= 0 ? offsetMs : null,
    };
  });

  // Empty / not-enough-data short-circuits
  if (raw.length === 0) {
    return {
      seedCount: seeds.length,
      emailCount: 0,
      hasEnoughData: false,
      welcomeSeries: { detected: false, confidence: "low", steps: [], totalDurationMs: 0, medianGapMs: 0 },
      automatedCount: 0,
      broadcastCount: 0,
      unknownCount: 0,
      timelines: [],
      verdict: "No emails captured yet. Subscribe with a seed address to start collecting.",
      hint: seeds.length === 0 ? "Add a seed address to begin." : null,
    };
  }

  // Stage 1 + 2 classification
  const verdicts = classifyByCrossSeed(raw);
  const bySeed = new Map<string, RawEmail[]>();
  for (const e of raw) {
    if (!e.seedAddressId) continue;
    if (!bySeed.has(e.seedAddressId)) bySeed.set(e.seedAddressId, []);
    bySeed.get(e.seedAddressId)!.push(e);
  }
  classifyBySingleSeed(bySeed, verdicts);

  // Build per-seed timelines
  const timelines: FunnelSeedTimeline[] = [];
  for (const seed of seeds) {
    const seedEmails = bySeed.get(seed.id) || [];
    seedEmails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const out: FunnelEmail[] = seedEmails.map((e) => {
      const v = verdicts.get(e.id) || { c: "unknown" as FunnelClassification, conf: "low" as FunnelConfidence };
      return {
        id: e.id,
        seedAddressId: e.seedAddressId,
        subject: e.subject,
        fromName: e.fromName,
        receivedAt: e.receivedAt,
        offsetMs: e.offsetMs,
        classification: v.c,
        confidence: v.conf,
      };
    });
    timelines.push({
      seedAddressId: seed.id,
      seedLabel: seed.label,
      seedAddress: seed.address,
      signupAt: new Date(seed.createdAt),
      emails: out,
    });
  }

  // Counts
  let automatedCount = 0;
  let broadcastCount = 0;
  let unknownCount = 0;
  for (const t of timelines) {
    for (const e of t.emails) {
      if (e.classification === "automated") automatedCount++;
      else if (e.classification === "broadcast") broadcastCount++;
      else unknownCount++;
    }
  }
  // Orphan emails (seed deleted) counted as unknown
  unknownCount += raw.filter((e) => !e.seedAddressId).length;

  const hasEnoughData = raw.length >= MIN_EMAILS_FOR_DETECTION;

  // Welcome series detection (only if we have enough data)
  const welcome = hasEnoughData
    ? buildWelcomeSeries(timelines)
    : { steps: [], totalDurationMs: 0, medianGapMs: 0 };

  // Confidence: high if 2+ seeds AND multiple high-confidence cross-seed matches; else medium; else low
  const highConfMatches = Array.from(verdicts.values()).filter((v) => v.conf === "high").length;
  let welcomeConfidence: FunnelConfidence = "low";
  if (welcome.steps.length >= 2 && seeds.length >= 2 && highConfMatches >= 2) welcomeConfidence = "high";
  else if (welcome.steps.length >= 2) welcomeConfidence = "medium";

  // Verdict text
  let verdict: string;
  let hint: string | null = null;
  if (!hasEnoughData) {
    verdict = `Need more emails to detect a funnel — typically ${MIN_EMAILS_FOR_DETECTION}+ across at least one week.`;
    hint = seeds.length < 2 ? "Adding a second seed address dramatically improves detection accuracy." : null;
  } else if (welcome.steps.length >= 2) {
    verdict = `Detected a ${welcome.steps.length}-email welcome series over ${formatDuration(welcome.totalDurationMs)}.`;
    if (seeds.length === 1) {
      hint = "Add a second seed address to confirm with high confidence.";
    } else if (welcomeConfidence === "high") {
      hint = "Verified across multiple seeds — high confidence.";
    }
  } else if (welcome.steps.length === 1) {
    verdict = `Detected a single welcome email at +${formatDuration(welcome.steps[0].offsetMs)} after signup.`;
    hint = seeds.length === 1
      ? "More emails or a second seed will reveal the rest of any sequence."
      : null;
  } else if (broadcastCount > 0) {
    verdict = "Appears to be broadcast-only — no automated welcome sequence detected.";
    hint = seeds.length === 1
      ? "If you suspect a welcome series, add a second seed and resubscribe."
      : null;
  } else {
    verdict = "Not enough signal yet to classify this competitor's send pattern.";
    hint = seeds.length < 2 ? "Add a second seed address to improve detection." : null;
  }

  return {
    seedCount: seeds.length,
    emailCount: raw.length,
    hasEnoughData,
    welcomeSeries: {
      detected: welcome.steps.length >= 2,
      confidence: welcomeConfidence,
      steps: welcome.steps,
      totalDurationMs: welcome.totalDurationMs,
      medianGapMs: welcome.medianGapMs,
    },
    automatedCount,
    broadcastCount,
    unknownCount,
    timelines,
    verdict,
    hint,
  };
}
