import { storage } from "./storage";
import { sendEmail } from "./email-sendgrid";
import {
  taskDueReminderEmail,
  overdueAlertEmail,
  projectDueReminderEmail,
  weeklyProjectDigestEmail,
  dmoStreakAtRiskEmail,
  weeklyDmoSummaryEmail,
} from "./email-templates";
import type { NotificationPreferences } from "@shared/schema";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ZonedClock = {
  hour: number;
  dayOfWeek: number;
  dateString: string;
};

export function zonedClock(now: Date, tz: string): ZonedClock {
  return {
    hour: Number(formatInTimeZone(now, tz, "H")),
    dayOfWeek: Number(formatInTimeZone(now, tz, "i")) % 7,
    dateString: formatInTimeZone(now, tz, "yyyy-MM-dd"),
  };
}

export function startOfTodayInTz(tz: string, now = new Date()): Date {
  return fromZonedTime(`${zonedClock(now, tz).dateString}T00:00:00`, tz);
}

function startOfDaysAgoInTz(tz: string, daysAgo: number, now = new Date()): Date {
  const today = zonedClock(now, tz).dateString;
  const calendarDate = new Date(`${today}T12:00:00Z`);
  calendarDate.setUTCDate(calendarDate.getUTCDate() - daysAgo);
  return fromZonedTime(`${calendarDate.toISOString().slice(0, 10)}T00:00:00`, tz);
}

// ── Tick ─────────────────────────────────────────────────────────────────────

async function tick() {
  try {
    const [users, resources] = await Promise.all([
      storage.getAllUsersForNotifications(),
      storage.getActiveEmailResources(),
    ]);

    await Promise.allSettled(users.map(async (user) => {
      if (!user.email) return;

      const prefs = await storage.getNotificationPrefs(user.id);
      if (!prefs.allEnabled) return;
      const p: NotificationPreferences = prefs.preferences;

      const tz = user.timezone || "America/New_York";
      const now = new Date();
      const { hour: currentHour, dayOfWeek: currentDow, dateString: todayStr } = zonedClock(now, tz);
      const todayStartedAt = startOfTodayInTz(tz, now);

      // ── Task due reminders ────────────────────────────────────────────────
      if (p.taskDueReminders?.enabled) {
        const leadMs = (p.taskDueReminders.leadTimeDays ?? 1) * 86_400_000;
        const windowEnd = Date.now() + leadMs + 86_400_000;
        const windowStart = Date.now();

        const allTasks = await storage.getAllOpenTasksForUser(user.id);
        const dueSoon = allTasks.filter(t => {
          if (!t.dueDate || t.status === "done" || t.parentTaskId) return false;
          const d = new Date(t.dueDate).getTime();
          return d >= windowStart && d <= windowEnd;
        });

        if (dueSoon.length > 0) {
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "task_due_reminder", "batch", todayStartedAt);
          if (!alreadySent) {
            const tpl = taskDueReminderEmail({
              firstName: user.firstName,
              tasks: dueSoon.map(t => ({
                title: t.title,
                projectName: t.projectName,
                dueDate: t.dueDate
                  ? new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "",
              })),
            }, resources);
            await sendEmail({ to: user.email, ...tpl });
            await storage.logNotification(user.id, "task_due_reminder", "batch");
          }
        }
      }

      // ── Overdue alerts ────────────────────────────────────────────────────
      if (p.overdueAlerts?.enabled) {
        const allTasks = await storage.getAllOpenTasksForUser(user.id);
        const overdue = allTasks.filter(t => {
          if (!t.dueDate || t.status === "done" || t.parentTaskId) return false;
          return new Date(t.dueDate) < new Date();
        });
        if (overdue.length > 0) {
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "overdue_alert", "batch", todayStartedAt);
          if (!alreadySent) {
            const tpl = overdueAlertEmail({
              firstName: user.firstName,
              tasks: overdue.map(t => ({
                title: t.title,
                projectName: t.projectName,
                daysOverdue: Math.round((Date.now() - new Date(t.dueDate!).getTime()) / 86_400_000),
              })),
            }, resources);
            await sendEmail({ to: user.email, ...tpl });
            await storage.logNotification(user.id, "overdue_alert", "batch");
          }
        }
      }

      // ── Project due date reminders ────────────────────────────────────────
      if (p.projectDueReminders?.enabled) {
        const projects = await storage.getProjectsForUser(user.id);
        for (const project of projects) {
          if (!project.dueDate || project.status !== "active") continue;
          const daysLeft = Math.ceil((new Date(project.dueDate).getTime() - Date.now()) / 86_400_000);
          if (daysLeft !== 3 && daysLeft !== 1) continue;
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "project_due_reminder", `${project.id}:${daysLeft}`, todayStartedAt);
          if (!alreadySent) {
            const tpl = projectDueReminderEmail({
              firstName: user.firstName,
              projectName: project.name,
              daysLeft,
              dueDate: new Date(project.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
            }, resources);
            await sendEmail({ to: user.email, ...tpl });
            await storage.logNotification(user.id, "project_due_reminder", `${project.id}:${daysLeft}`);
          }
        }
      }

      // ── Weekly project digest ─────────────────────────────────────────────
      if (p.weeklyProjectDigest?.enabled) {
        const { dayOfWeek = 1, hour = 8 } = p.weeklyProjectDigest;
        if (currentDow === dayOfWeek && currentHour >= hour) {
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "weekly_project_digest", todayStr, todayStartedAt);
          if (!alreadySent) {
            const projects = await storage.getProjectsForUser(user.id);
            const allTasks = await storage.getAllOpenTasksForUser(user.id);
            const openTasks = allTasks.filter(t => t.status !== "done" && !t.parentTaskId).length;
            const doneTasks = await storage.countCompletedTopLevelTasksSince(
              user.id,
              startOfDaysAgoInTz(tz, 6, now),
            );
            const overdueCount = allTasks.filter(t => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date() && !t.parentTaskId).length;
            const tpl = weeklyProjectDigestEmail({
              firstName: user.firstName,
              openTasks,
              doneTasks,
              overdueCount,
              projects: projects.filter(pr => pr.status === "active").map(pr => ({
                name: pr.name,
                openTasks: allTasks.filter(t => t.projectId === pr.id && t.status !== "done" && !t.parentTaskId).length,
              })),
            }, resources);
            await sendEmail({ to: user.email, ...tpl });
            await storage.logNotification(user.id, "weekly_project_digest", todayStr);
          }
        }
      }

      // ── DMO streak at risk ────────────────────────────────────────────────
      if (p.dmoStreakAtRisk?.enabled) {
        const atRiskHour = p.dmoStreakAtRisk.hour ?? 19;
        if (currentHour >= atRiskHour) {
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "dmo_streak_at_risk", todayStr, todayStartedAt);
          if (!alreadySent) {
            const dmoResult = await storage.getDmoStreak(user.id);
            const todayEntry = await storage.getDmoEntry(user.id, todayStr);
            if (!todayEntry && dmoResult.current > 0) {
              const tpl = dmoStreakAtRiskEmail({ firstName: user.firstName, streakCount: dmoResult.current }, resources);
              await sendEmail({ to: user.email, ...tpl });
              await storage.logNotification(user.id, "dmo_streak_at_risk", todayStr);
            }
          }
        }
      }

      // ── Weekly DMO summary ────────────────────────────────────────────────
      if (p.weeklyDmoSummary?.enabled) {
        const { dayOfWeek = 0, hour = 18 } = p.weeklyDmoSummary;
        if (currentDow === dayOfWeek && currentHour >= hour) {
          const alreadySent = await storage.hasNotificationBeenSent(user.id, "weekly_dmo_summary", todayStr, todayStartedAt);
          if (!alreadySent) {
            const dmoResult = await storage.getDmoStreak(user.id);
            const weekEntries = await storage.getDmoEntriesForWeek(user.id, tz);
            const totalPoints = weekEntries.reduce((sum, e) => sum + (e.totalPoints ?? 0), 0);
            const tpl = weeklyDmoSummaryEmail({
              firstName: user.firstName,
              points: totalPoints,
              currentStreak: dmoResult.current,
              activitiesLogged: weekEntries.length,
            }, resources);
            await sendEmail({ to: user.email, ...tpl });
            await storage.logNotification(user.id, "weekly_dmo_summary", todayStr);
          }
        }
      }

    }));
  } catch (err) {
    console.error("[notificationScheduler] tick error:", err);
  }
}

// ── Log Retention ────────────────────────────────────────────────────────────

async function purgeOldActionLogs() {
  try {
    const deleted = await storage.deleteOldUserActionLogs(180);
    if (deleted > 0) {
      console.log(`[notificationScheduler] Purged ${deleted} action log entries older than 180 days`);
    }
  } catch (err) {
    console.error("[notificationScheduler] Action log purge error:", err);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

export function startNotificationScheduler() {
  console.log("[notificationScheduler] starting (runs every hour)");
  setTimeout(() => {
    tick();
    purgeOldActionLogs();
    setInterval(tick, 60 * 60 * 1000);
    setInterval(purgeOldActionLogs, 24 * 60 * 60 * 1000);
  }, 60_000);
}
