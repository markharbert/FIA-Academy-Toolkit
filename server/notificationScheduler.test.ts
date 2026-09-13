import assert from "node:assert/strict";
import test from "node:test";
import { startOfTodayInTz, tick, zonedClock } from "./notificationScheduler";
import { weekDateRangeInTz } from "./storage";

const user = {
  id: "member-1",
  email: "member@example.com",
  displayName: "Member",
  firstName: "Member",
  timezone: "America/New_York",
};

function schedulerHarness(preferences: Record<string, unknown>) {
  const sent: unknown[] = [];
  const logs: Array<{ type: string; refId: string | null; sentAt: Date }> = [];
  let currentNow = new Date();

  const storage = {
    getAllUsersForNotifications: async () => [user],
    getActiveEmailResources: async () => [],
    getNotificationPrefs: async () => ({ allEnabled: true, preferences }),
    getAllOpenTasksForUser: async () => [],
    getProjectsForUser: async () => [],
    countCompletedTopLevelTasksSince: async () => 0,
    getDmoStreak: async () => ({ current: 4, longest: 4 }),
    getDmoEntry: async () => undefined,
    getDmoEntriesForWeek: async () => [],
    hasNotificationBeenSent: async (_userId: string, type: string, refId: string, since: Date) =>
      logs.some(log => log.type === type && log.refId === refId && log.sentAt >= since),
    logNotification: async (_userId: string, type: string, refId: string | null) => {
      logs.push({ type, refId, sentAt: currentNow });
    },
  };

  return {
    sent,
    logs,
    run: async (now: Date) => {
      currentNow = now;
      await tick(now, {
        storage: storage as Parameters<typeof tick>[1]["storage"],
        sendEmail: (async message => { sent.push(message); }) as Parameters<typeof tick>[1]["sendEmail"],
      });
    },
  };
}

test("zoned clock and local-day boundary remain correct across spring-forward", () => {
  const before = new Date("2026-03-08T06:30:00Z");
  const after = new Date("2026-03-08T07:30:00Z");

  assert.deepEqual(zonedClock(before, user.timezone), { hour: 1, dayOfWeek: 0, dateString: "2026-03-08" });
  assert.deepEqual(zonedClock(after, user.timezone), { hour: 3, dayOfWeek: 0, dateString: "2026-03-08" });
  assert.equal(startOfTodayInTz(user.timezone, after).toISOString(), "2026-03-08T05:00:00.000Z");
});

test("zoned clock distinguishes both fall-back hours without changing the local day", () => {
  const firstOneThirty = new Date("2026-11-01T05:30:00Z");
  const secondOneThirty = new Date("2026-11-01T06:30:00Z");

  assert.deepEqual(zonedClock(firstOneThirty, user.timezone), { hour: 1, dayOfWeek: 0, dateString: "2026-11-01" });
  assert.deepEqual(zonedClock(secondOneThirty, user.timezone), { hour: 1, dayOfWeek: 0, dateString: "2026-11-01" });
  assert.equal(startOfTodayInTz(user.timezone, secondOneThirty).toISOString(), "2026-11-01T04:00:00.000Z");
});

test("explicit member timezone makes results independent of the server timezone", () => {
  const originalTz = process.env.TZ;
  const instant = new Date("2026-07-13T15:00:00Z");
  try {
    process.env.TZ = "Pacific/Honolulu";
    const honoluluServer = zonedClock(instant, user.timezone);
    process.env.TZ = "Asia/Tokyo";
    const tokyoServer = zonedClock(instant, user.timezone);
    assert.deepEqual(honoluluServer, tokyoServer);
    assert.deepEqual(tokyoServer, { hour: 11, dayOfWeek: 1, dateString: "2026-07-13" });
  } finally {
    process.env.TZ = originalTz;
  }
});

test("weekly date ranges use the member's calendar even in non-UTC server environments", () => {
  const originalTz = process.env.TZ;
  const instant = new Date("2026-07-13T03:30:00Z"); // Sunday 11:30pm in New York, Monday UTC
  try {
    process.env.TZ = "Pacific/Honolulu";
    const honoluluServer = weekDateRangeInTz(user.timezone, instant);
    process.env.TZ = "Asia/Tokyo";
    const tokyoServer = weekDateRangeInTz(user.timezone, instant);
    assert.deepEqual(honoluluServer, tokyoServer);
    assert.deepEqual(tokyoServer, { startKey: "2026-07-12", endKey: "2026-07-12" });
  } finally {
    process.env.TZ = originalTz;
  }
});

test("a daily notification catches up after its target hour and repeated ticks do not duplicate it", async () => {
  const harness = schedulerHarness({ dmoStreakAtRisk: { enabled: true, hour: 19 } });
  const afterTarget = new Date("2026-07-14T00:15:00Z"); // 8:15pm Monday in New York

  await harness.run(afterTarget);
  await harness.run(new Date("2026-07-14T01:15:00Z"));

  assert.equal(harness.sent.length, 1);
  assert.deepEqual(harness.logs.map(log => [log.type, log.refId]), [
    ["dmo_streak_at_risk", "2026-07-13"],
  ]);
});

test("weekly notifications catch up only on their configured local weekday", async () => {
  const harness = schedulerHarness({ weeklyProjectDigest: { enabled: true, dayOfWeek: 1, hour: 8 } });

  await harness.run(new Date("2026-07-12T16:00:00Z")); // Sunday noon in New York
  assert.equal(harness.sent.length, 0);

  await harness.run(new Date("2026-07-13T16:00:00Z")); // Monday noon, after target
  await harness.run(new Date("2026-07-13T17:00:00Z")); // repeated Monday tick

  assert.equal(harness.sent.length, 1);
  assert.deepEqual(harness.logs.map(log => [log.type, log.refId]), [
    ["weekly_project_digest", "2026-07-13"],
  ]);
});