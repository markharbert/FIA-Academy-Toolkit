// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL = (process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com").replace(/\/$/, "");

// ─── Shared HTML wrapper ──────────────────────────────────────────────────────

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#06092a 0%,#0c1a4d 60%,#132660 100%);padding:28px 32px;border-radius:12px 12px 0 0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="56" valign="middle" style="padding-right:16px;">
                <img src="${BASE_URL}/lion-logo.png" width="48" height="48" alt="Lion" style="display:block;border-radius:6px;" />
              </td>
              <td valign="middle">
                <p style="margin:0;color:#7ab5d9;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">Fearless Influencer Academy Toolkit</p>
                <p style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;line-height:1.3;">${title}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="background:#fff;padding:28px 32px;">
          ${body}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#fff;padding:0 32px 24px;border-radius:0 0 12px 12px;border-top:1px solid #f1f5f9;">
          <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">
            You're receiving this because you have notifications enabled in your Academy Toolkit account.<br/>
            <a href="${BASE_URL}/account" style="color:#3f92cc;text-decoration:none;">Manage notification preferences</a>
          </p>
          <p style="margin:10px 0 0;font-size:11px;color:#cbd5e1;line-height:1.6;">
            Uplevel Marketing LLC &mdash; PO Box 734, Tipp City OH 45371
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function btn(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#da0010;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">${label}</a>`;
}

function stat(label: string, value: string | number, color = "#3f92cc"): string {
  return `<div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;min-width:100px;">
    <p style="margin:0;font-size:28px;font-weight:800;color:${color};">${value}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${label}</p>
  </div>`;
}

// ─── Individual Templates ─────────────────────────────────────────────────────

export function taskDueReminderEmail(params: {
  firstName: string | null;
  tasks: Array<{ title: string; projectName: string; dueDate: string }>;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const count = params.tasks.length;
  const subject = count === 1
    ? `Reminder: "${params.tasks[0].title}" is due soon`
    : `${count} tasks are due soon`;

  const rows = params.tasks.map(t =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${t.title}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">${t.projectName} · Due ${t.dueDate}</p>
      </td>
    </tr>`
  ).join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">You have ${count} task${count > 1 ? "s" : ""} coming up soon:</p>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${btn("View my projects", `${BASE_URL}/projects`)}`;

  const text = `Hey ${name},\n\nYou have ${count} task(s) due soon:\n${params.tasks.map(t => `- ${t.title} (${t.projectName}) - Due ${t.dueDate}`).join("\n")}\n\nView at ${BASE_URL}/projects`;

  return { subject, html: wrap(subject, body), text };
}

export function overdueAlertEmail(params: {
  firstName: string | null;
  tasks: Array<{ title: string; projectName: string; daysOverdue: number }>;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const count = params.tasks.length;
  const subject = `${count} overdue task${count > 1 ? "s" : ""} need your attention`;

  const rows = params.tasks.map(t =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${t.title}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#ef4444;">${t.projectName} · ${t.daysOverdue}d overdue</p>
    </td></tr>`
  ).join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">These tasks are past their due date:</p>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${btn("Go to my projects", `${BASE_URL}/projects`)}`;

  const text = `Hey ${name},\n\nOverdue tasks:\n${params.tasks.map(t => `- ${t.title} (${t.projectName}) — ${t.daysOverdue}d overdue`).join("\n")}\n\n${BASE_URL}/projects`;

  return { subject, html: wrap(subject, body), text };
}

export function projectDueReminderEmail(params: {
  firstName: string | null;
  projectName: string;
  daysLeft: number;
  dueDate: string;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `Project "${params.projectName}" is due in ${params.daysLeft} day${params.daysLeft !== 1 ? "s" : ""}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">
      Your project <strong>${params.projectName}</strong> is due on <strong>${params.dueDate}</strong> — that's ${params.daysLeft} day${params.daysLeft !== 1 ? "s" : ""} away.
    </p>
    ${btn("View project", `${BASE_URL}/projects`)}`;
  const text = `Hey ${name},\n\nYour project "${params.projectName}" is due on ${params.dueDate} (${params.daysLeft} day(s) away).\n\n${BASE_URL}/projects`;
  return { subject, html: wrap(subject, body), text };
}

export function weeklyProjectDigestEmail(params: {
  firstName: string | null;
  openTasks: number;
  doneTasks: number;
  overdueCount: number;
  projects: Array<{ name: string; openTasks: number }>;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "Your weekly project digest";
  const statsRow = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;">
    ${stat("Open tasks", params.openTasks)}
    ${stat("Completed", params.doneTasks, "#16a34a")}
    ${stat("Overdue", params.overdueCount, params.overdueCount > 0 ? "#dc2626" : "#64748b")}
  </div>`;
  const projectList = params.projects.length > 0
    ? `<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Active projects</p>` +
      params.projects.map(p =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:14px;color:#1e293b;">${p.name}</span>
          <span style="font-size:12px;color:#64748b;">${p.openTasks} open</span>
        </div>`
      ).join("") : "";

  const body = `
    <p style="margin:0 0 4px;font-size:15px;color:#334155;">Hey ${name}, here's your project summary for the week:</p>
    ${statsRow}${projectList}
    ${btn("View all projects", `${BASE_URL}/projects`)}`;
  const text = `Hey ${name},\n\nWeekly project digest:\nOpen: ${params.openTasks} | Done: ${params.doneTasks} | Overdue: ${params.overdueCount}\n\n${BASE_URL}/projects`;
  return { subject, html: wrap(subject, body), text };
}

export function dmoStreakAtRiskEmail(params: {
  firstName: string | null;
  streakCount: number;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `🔥 Don't break your ${params.streakCount}-day streak!`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      You're on a <strong>${params.streakCount}-day DMO streak</strong> and haven't logged your activities today yet.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">Log in before midnight to keep your streak alive!</p>
    ${btn("Log my DMO", `${BASE_URL}/dmo-tracker`)}`;
  const text = `Hey ${name},\n\nYou have a ${params.streakCount}-day streak and haven't logged today yet. Keep it going!\n\n${BASE_URL}/dmo-tracker`;
  return { subject, html: wrap("Keep Your Streak Alive!", body), text };
}

export function dmoMilestoneEmail(params: {
  firstName: string | null;
  streakCount: number;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `🎉 ${params.streakCount}-day streak milestone!`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <div style="text-align:center;padding:24px 0;">
      <p style="margin:0;font-size:64px;">🔥</p>
      <p style="margin:8px 0 0;font-size:36px;font-weight:800;color:#3f92cc;">${params.streakCount} days</p>
      <p style="margin:4px 0 0;font-size:15px;color:#64748b;">DMO streak milestone</p>
    </div>
    <p style="margin:16px 0 20px;font-size:15px;color:#334155;text-align:center;">
      You've been showing up consistently for <strong>${params.streakCount} days straight</strong>. That discipline is what separates the pros. Keep going!
    </p>
    ${btn("View my DMO", `${BASE_URL}/dmo-tracker`)}`;
  const text = `Hey ${name},\n\nCongratulations on your ${params.streakCount}-day DMO streak! Keep it up!\n\n${BASE_URL}/dmo-tracker`;
  return { subject, html: wrap(`${params.streakCount}-Day Streak Milestone!`, body), text };
}

export function dmoStreakBrokenEmail(params: {
  firstName: string | null;
  streakCount: number;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `Your ${params.streakCount}-day streak ended — start fresh today`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Your <strong>${params.streakCount}-day DMO streak</strong> ended. That happens — the key is to start a new one today.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">Every pro has missed a day. What matters is getting back up.</p>
    ${btn("Start a new streak", `${BASE_URL}/dmo-tracker`)}`;
  const text = `Hey ${name},\n\nYour ${params.streakCount}-day streak ended. Start fresh today!\n\n${BASE_URL}/dmo-tracker`;
  return { subject, html: wrap("Start Fresh Today", body), text };
}

export function weeklyDmoSummaryEmail(params: {
  firstName: string | null;
  points: number;
  currentStreak: number;
  activitiesLogged: number;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "Your weekly DMO summary";
  const statsRow = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;">
    ${stat("Points", params.points, "#3f92cc")}
    ${stat("Day streak", params.currentStreak, "#f59e0b")}
    ${stat("Days logged", params.activitiesLogged, "#0ea5e9")}
  </div>`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name}, here's your DMO performance this week:</p>
    ${statsRow}
    ${btn("View full DMO tracker", `${BASE_URL}/dmo-tracker`)}`;
  const text = `Hey ${name},\n\nWeekly DMO summary:\nPoints: ${params.points} | Streak: ${params.currentStreak} days | Days logged: ${params.activitiesLogged}\n\n${BASE_URL}/dmo-tracker`;
  return { subject, html: wrap("Weekly DMO Summary", body), text };
}

export function videoScoringCompleteEmail(params: {
  firstName: string | null;
  videoTitle: string;
  score: number | null;
  sessionId: string;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `Your video "${params.videoTitle}" has been scored`;
  const scoreDisplay = params.score !== null
    ? `<div style="text-align:center;padding:20px 0;">
        <p style="margin:0;font-size:56px;font-weight:800;color:#3f92cc;">${params.score}<span style="font-size:24px;color:#94a3b8;">/100</span></p>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Video Formula Score</p>
      </div>`
    : `<p style="margin:16px 0;font-size:15px;color:#334155;">Your transcript has been processed and feedback is ready.</p>`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 8px;font-size:15px;color:#334155;">Your video <strong>"${params.videoTitle}"</strong> has been analyzed.</p>
    ${scoreDisplay}
    ${btn("View my results", `${BASE_URL}/video-score-upload/${params.sessionId}`)}`;
  const text = `Hey ${name},\n\nYour video "${params.videoTitle}" has been scored${params.score !== null ? ` — ${params.score}/100` : ""}.\n\nView results: ${BASE_URL}/video-score-upload/${params.sessionId}`;
  return { subject, html: wrap("Your Video Results Are Ready", body), text };
}

export function videoPracticeReminderEmail(params: {
  firstName: string | null;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "This week's video practice is waiting for you";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      You haven't uploaded a practice video this week yet. Consistency is the key to improvement — even a quick 60-second take counts.
    </p>
    ${btn("Upload a video", `${BASE_URL}/video-score-upload`)}`;
  const text = `Hey ${name},\n\nYou haven't uploaded a practice video this week yet. Keep the habit going!\n\n${BASE_URL}/video-score-upload`;
  return { subject, html: wrap("Time for Your Weekly Video Practice", body), text };
}

export function reputationDropAlertEmail(params: {
  firstName: string | null;
  domain: string;
  score: string;
  previousScore: string;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `⚠️ Sender reputation drop detected for ${params.domain}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Your sender reputation for <strong>${params.domain}</strong> has dropped from <strong>${params.previousScore}</strong> to <strong style="color:#dc2626;">${params.score}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">
      A dropping reputation can hurt your inbox placement. Review your recent campaign activity and authentication setup.
    </p>
    ${btn("Check sender reputation", `${BASE_URL}/email-tools/sender-reputation`)}`;
  const text = `Hey ${name},\n\nSender reputation drop for ${params.domain}: ${params.previousScore} → ${params.score}.\n\n${BASE_URL}/email-tools/sender-reputation`;
  return { subject, html: wrap("Sender Reputation Drop Detected", body), text };
}

export function weeklyInboxReportEmail(params: {
  firstName: string | null;
  inboxRate: number;
  spamRate: number;
  emailsAnalyzed: number;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "Your weekly inbox placement report";
  const statsRow = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;">
    ${stat("Inbox rate", `${params.inboxRate}%`, params.inboxRate >= 90 ? "#16a34a" : params.inboxRate >= 70 ? "#f59e0b" : "#dc2626")}
    ${stat("Spam rate", `${params.spamRate}%`, params.spamRate <= 5 ? "#16a34a" : "#dc2626")}
    ${stat("Analyzed", params.emailsAnalyzed)}
  </div>`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name}, here's your inbox placement performance for the week:</p>
    ${statsRow}
    ${btn("View inbox analyzer", `${BASE_URL}/email-tools/inbox-analyzer`)}`;
  const text = `Hey ${name},\n\nWeekly inbox report:\nInbox: ${params.inboxRate}% | Spam: ${params.spamRate}% | Analyzed: ${params.emailsAnalyzed}\n\n${BASE_URL}/email-tools/inbox-analyzer`;
  return { subject, html: wrap("Weekly Inbox Placement Report", body), text };
}

export function welcomeEmail(params: {
  firstName: string | null;
  email: string;
}): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "Welcome to Academy Toolkit!";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name}, welcome!</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Your Academy Toolkit account is active and ready to go. Here's what you can do right now:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#334155;line-height:2;">
      <li><strong>Upload a video</strong> — get AI scoring and feedback on your 5-part formula</li>
      <li><strong>Start a project</strong> — organize your campaigns, content, and tasks</li>
      <li><strong>Track your DMO</strong> — build daily habits and watch your streak grow</li>
      <li><strong>Analyze your inbox</strong> — monitor deliverability and competitor emails</li>
    </ul>
    ${btn("Go to your dashboard", `${BASE_URL}/dashboard`)}`;
  const text = `Hey ${name}, welcome to Academy Toolkit!\n\nYour account is active. Get started at ${BASE_URL}/dashboard`;
  return { subject, html: wrap("Welcome to Academy Toolkit!", body), text };
}
