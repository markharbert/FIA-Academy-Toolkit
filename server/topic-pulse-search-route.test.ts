import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { topicSearchInputSchema, type TopicSearchInput } from "@shared/schema";
import { createTopicPulseSearchHandler } from "./topic-pulse-search-route";
import { buildTopicCacheKey } from "./topic-pulse";

type SearchResult = { topics: unknown[]; creditsUsed: number };

function createHarness(options: {
  allowance?: number;
  generate?: (input: TopicSearchInput) => Promise<SearchResult>;
  failAt?: "createTopics" | "updateRun";
} = {}) {
  let remaining = options.allowance ?? 10;
  let used = 0;
  let refunds = 0;
  let runNumber = 0;
  const storage = {
    async getVideoTrendsCredits() {
      return { remaining, resetsAt: new Date(Date.now() + 86_400_000) };
    },
    async reserveVideoTrendsCredits(_userId: string, amount: number) {
      if (remaining < amount) return { success: false, remaining };
      remaining -= amount;
      used += amount;
      return { success: true, remaining };
    },
    async refundVideoTrendsCredits(_userId: string, amount: number) {
      remaining += amount;
      used -= amount;
      refunds += amount;
    },
    async createTopicRun() {
      runNumber += 1;
      return { id: `run-${runNumber}` };
    },
    async createTopics(topics: unknown[]) {
      if (options.failAt === "createTopics") throw new Error("database write failed");
      return topics;
    },
    async updateTopicRun() {
      if (options.failAt === "updateRun") throw new Error("run update failed");
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: "member-1" };
    next();
  });
  app.post("/api/topic-pulse/search", createTopicPulseSearchHandler({
    storage,
    parseInput: input => topicSearchInputSchema.safeParse(input),
    generateTopics: async input => options.generate?.(input) ?? {
      topics: [{ runId: "run", keywordQuery: input.seedQuery }],
      creditsUsed: 0,
    },
  }));

  const server = createServer(app);
  return {
    server,
    state: () => ({ remaining, used, refunds }),
  };
}

async function post(server: ReturnType<typeof createServer>, body: object) {
  if (!server.listening) {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  }
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/topic-pulse/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function close(server: ReturnType<typeof createServer>) {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test("cached and uncached successful searches each consume exactly one allowance unit", async () => {
  for (const creditsUsed of [0, 17]) {
    const harness = createHarness({ generate: async input => ({
      topics: [{ keywordQuery: input.seedQuery }],
      creditsUsed,
    }) });
    try {
      const result = await post(harness.server, { seedQuery: `search ${creditsUsed}` });
      assert.equal(result.status, 200);
      assert.equal(result.body.creditsUsed, creditsUsed);
      assert.deepEqual(harness.state(), { remaining: 9, used: 1, refunds: 0 });
    } finally {
      await close(harness.server);
    }
  }
});

test("failed searches refund the reserved allowance, including persistence failures", async () => {
  for (const scenario of [
    { generate: async () => { throw new Error("provider failed"); } },
    { generate: async () => ({ topics: [{}], creditsUsed: 4 }), failAt: "createTopics" as const },
    { generate: async () => ({ topics: [{}], creditsUsed: 4 }), failAt: "updateRun" as const },
  ]) {
    const harness = createHarness(scenario);
    try {
      const result = await post(harness.server, { seedQuery: "failed search" });
      assert.equal(result.status, 500);
      assert.deepEqual(harness.state(), { remaining: 10, used: 0, refunds: 1 });
    } finally {
      await close(harness.server);
    }
  }
});

test("concurrent searches cannot consume more than the remaining allowance", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const harness = createHarness({
    allowance: 1,
    generate: async () => {
      await gate;
      return { topics: [{}], creditsUsed: 0 };
    },
  });
  try {
    const first = post(harness.server, { seedQuery: "first search" });
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = post(harness.server, { seedQuery: "second search" });
    release();
    const results = await Promise.all([first, second]);
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 402 || result.status === 403).length, 1);
    assert.deepEqual(harness.state(), { remaining: 0, used: 1, refunds: 0 });
  } finally {
    release();
    await close(harness.server);
  }
});

test("video-type variants receive separately generated filtered results", async () => {
  const calls: Array<string | undefined> = [];
  const cache = new Map<string, SearchResult>();
  const harness = createHarness({
    generate: async input => {
      const key = buildTopicCacheKey(input);
      calls.push(input.videoType);
      const cached = cache.get(key);
      if (cached) return cached;
      const result = { topics: [{ videoType: input.videoType }], creditsUsed: 3 };
      cache.set(key, result);
      return result;
    },
  });
  try {
    const tutorial = await post(harness.server, { seedQuery: "email marketing", videoType: "how-to" });
    const review = await post(harness.server, { seedQuery: "email marketing", videoType: "review" });
    assert.equal(tutorial.status, 200);
    assert.equal(review.status, 200);
    assert.equal(tutorial.body.topics[0].videoType, "how-to");
    assert.equal(review.body.topics[0].videoType, "review");
    assert.deepEqual(calls, ["how-to", "review"]);
    assert.equal(harness.state().used, 2);
    assert.notEqual(
      buildTopicCacheKey({ seedQuery: "email marketing", videoType: "how-to" }),
      buildTopicCacheKey({ seedQuery: "email marketing", videoType: "review" }),
    );
  } finally {
    await close(harness.server);
  }
});
