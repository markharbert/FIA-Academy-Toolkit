import type { Request, Response, RequestHandler } from "express";
import type { TopicSearchInput } from "@shared/schema";

type Credits = {
  remaining: number;
  resetsAt: Date | string;
};

type TopicPulseSearchStorage = {
  getVideoTrendsCredits(userId: string): Promise<Credits>;
  reserveVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; remaining: number }>;
  refundVideoTrendsCredits(userId: string, amount: number): Promise<void>;
  createTopicRun(input: Record<string, unknown>): Promise<{ id: string }>;
  createTopics(topics: unknown[]): Promise<unknown[]>;
  updateTopicRun(runId: string, input: Record<string, unknown>): Promise<unknown>;
};

type ParsedInput =
  | { success: true; data: TopicSearchInput }
  | { success: false; error: { errors: Array<{ message?: string }> } };

export type TopicPulseSearchDependencies = {
  storage: TopicPulseSearchStorage;
  parseInput(input: unknown): ParsedInput;
  generateTopics(
    input: TopicSearchInput,
    runId: string,
    userId: string,
  ): Promise<{ topics: unknown[]; creditsUsed: number }>;
  logSearch?: (input: {
    userId: string;
    runId: string;
    topicCount: number;
    creditsUsed: number;
    req: Request;
  }) => void;
};

function allowanceMessage(remaining: number, resetsAtValue: Date | string) {
  const resetsAt = new Date(resetsAtValue);
  const daysRemaining = Math.ceil((resetsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return {
    message: `You've used all your Topic Pulse searches for this month. Your searches will reset in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
    creditsRemaining: remaining,
    resetsAt: resetsAtValue,
  };
}

export function createTopicPulseSearchHandler(deps: TopicPulseSearchDependencies): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const parsed = deps.parseInput(req.body);
      if (parsed.success === false) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const userId = req.session.userId!;
      const credits = await deps.storage.getVideoTrendsCredits(userId);
      if (credits.remaining < 1) {
        return res.status(403).json(allowanceMessage(credits.remaining, credits.resetsAt));
      }

      // This atomic reservation, rather than the informational read above,
      // decides whether a concurrent request may consume the final search.
      const reservation = await deps.storage.reserveVideoTrendsCredits(userId, 1);
      if (!reservation.success) {
        return res.status(402).json(allowanceMessage(reservation.remaining, credits.resetsAt));
      }

      let completed = false;
      try {
        const startTime = Date.now();
        const run = await deps.storage.createTopicRun({
          userId,
          seedQuery: parsed.data.seedQuery,
          settingsJson: {
            affiliateProduct: parsed.data.affiliateProduct,
            audienceLevel: parsed.data.audienceLevel,
            tonePreference: parsed.data.tonePreference,
            videoType: parsed.data.videoType,
            region: parsed.data.region,
            recencyDays: parsed.data.recencyDays,
          },
          status: "processing",
        });

        const result = await deps.generateTopics(parsed.data, run.id, userId);
        const createdTopics = await deps.storage.createTopics(result.topics);
        const runtimeMs = Date.now() - startTime;
        await deps.storage.updateTopicRun(run.id, {
          status: "complete",
          runtimeMs,
          topicCount: createdTopics.length,
        });
        completed = true;

        console.log(`[TopicPulse] Used 1 monthly search for user ${userId}; keyword API credits used: ${result.creditsUsed}`);
        res.json({
          runId: run.id,
          topics: createdTopics,
          runtimeMs,
          creditsUsed: result.creditsUsed,
        });
        deps.logSearch?.({
          userId,
          runId: run.id,
          topicCount: createdTopics.length,
          creditsUsed: result.creditsUsed,
          req,
        });
      } catch (error) {
        if (!completed) {
          await deps.storage.refundVideoTrendsCredits(userId, 1).catch(refundError => {
            console.error(`[TopicPulse] Failed to refund search allowance for user ${userId}:`, refundError);
          });
          console.warn(`[TopicPulse] Refunded 1 monthly search for user ${userId} after error`);
        }
        throw error;
      }
    } catch (error) {
      console.error("[TopicPulse] Search error:", error);
      res.status(500).json({ message: "Failed to search topics" });
    }
  };
}