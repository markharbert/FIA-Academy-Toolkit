import { getAllCfEnrollments } from "./clickfunnels";
import { storage, type CfReconciliationChanges } from "./storage";

export type CfReconciliationResult = {
  run: Awaited<ReturnType<typeof storage.createCfReconciliationRun>>;
  summary: Awaited<ReturnType<typeof storage.getCfEnrolledUsers>>;
  changes: CfReconciliationChanges;
};

let reconciliationInFlight = false;

// Both the admin button and the scheduled job call this exact safe path. It
// always fetches every page before opening the transaction that changes access.
export async function runCfMembershipReconciliation(): Promise<CfReconciliationResult> {
  if (reconciliationInFlight) {
    throw new Error("A ClickFunnels reconciliation is already running.");
  }
  reconciliationInFlight = true;
  const run = await storage.createCfReconciliationRun({ status: "running" });
  let membershipChangesApplied = false;

  try {
    const enrollments = await getAllCfEnrollments();
    const activeFetched = enrollments.filter((enrollment) => enrollment.active).length;
    const changes = await storage.applyCfReconciliation(enrollments);
    membershipChangesApplied = true;
    const completedRun = await storage.updateCfReconciliationRun(run.id, {
      status: "completed",
      totalFetched: enrollments.length,
      activeFetched,
      inactiveFetched: enrollments.length - activeFetched,
      accountsCreated: changes.accountsCreated,
      accountsReactivated: changes.accountsReactivated,
      accountsRevoked: changes.accountsRevoked,
      unchanged: changes.unchanged,
      completedAt: new Date(),
      error: null,
    });
    if (!completedRun) throw new Error("Could not record the completed ClickFunnels reconciliation.");
    return { run: completedRun, changes, summary: await storage.getCfEnrolledUsers() };
  } catch (error: any) {
    const message = String(error?.message || "ClickFunnels reconciliation failed").slice(0, 1000);
    await storage.updateCfReconciliationRun(run.id, {
      status: membershipChangesApplied ? "completed" : "failed",
      completedAt: new Date(),
      error: message,
    }).catch((updateError) => console.error("[CF Reconciliation] Failed to record run error:", updateError));
    throw error;
  } finally {
    reconciliationInFlight = false;
  }
}

function easternClock(): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), minute: Number(value("minute")) };
}

let scheduledDate: string | null = null;

export function startCfMembershipReconciliationScheduler(): void {
  if (!process.env.CF_API_TOKEN || !process.env.CF_WORKSPACE_DOMAIN || !process.env.CF_COURSE_ID) {
    console.log("[CF Reconciliation] Scheduler not started: ClickFunnels API configuration is incomplete.");
    return;
  }

  const tick = async () => {
    const clock = easternClock();
    // Run once each day shortly after 3:15 AM New York time. The interval makes
    // this predictable without assuming the server process started at midnight.
    if (clock.hour !== 3 || clock.minute < 15 || clock.minute > 29 || scheduledDate === clock.date) return;
    scheduledDate = clock.date;
    try {
      const result = await runCfMembershipReconciliation();
      console.log(`[CF Reconciliation] Scheduled run completed: ${result.run.totalFetched} records scanned.`);
    } catch (error: any) {
      // Leave the date marked: a visible failed run is safer than repeatedly
      // hammering ClickFunnels if it is unavailable.
      console.error("[CF Reconciliation] Scheduled run failed:", error?.message || error);
    }
  };

  void tick();
  setInterval(() => void tick(), 5 * 60 * 1000).unref();
  console.log("[CF Reconciliation] Daily scheduler started for 3:15 AM America/New_York.");
}