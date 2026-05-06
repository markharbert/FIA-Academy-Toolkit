// ─── Brand assets ─────────────────────────────────────────────────────────────

const LION_LOGO_B64 = "data:image/png;base64,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";

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
                <img src="${LION_LOGO_B64}" width="48" height="48" alt="Lion" style="display:block;border-radius:6px;" />
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
            <a href="https://fearlessmarketinglab.com/account" style="color:#3f92cc;text-decoration:none;">Manage notification preferences</a>
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
    ${btn("View my projects", "https://fearlessmarketinglab.com/projects")}`;

  const text = `Hey ${name},\n\nYou have ${count} task(s) due soon:\n${params.tasks.map(t => `- ${t.title} (${t.projectName}) - Due ${t.dueDate}`).join("\n")}\n\nView at https://fearlessmarketinglab.com/projects`;

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
    ${btn("Go to my projects", "https://fearlessmarketinglab.com/projects")}`;

  const text = `Hey ${name},\n\nOverdue tasks:\n${params.tasks.map(t => `- ${t.title} (${t.projectName}) — ${t.daysOverdue}d overdue`).join("\n")}\n\nhttps://fearlessmarketinglab.com/projects`;

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
    ${btn("View project", "https://fearlessmarketinglab.com/projects")}`;
  const text = `Hey ${name},\n\nYour project "${params.projectName}" is due on ${params.dueDate} (${params.daysLeft} day(s) away).\n\nhttps://fearlessmarketinglab.com/projects`;
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
    ${btn("View all projects", "https://fearlessmarketinglab.com/projects")}`;
  const text = `Hey ${name},\n\nWeekly project digest:\nOpen: ${params.openTasks} | Done: ${params.doneTasks} | Overdue: ${params.overdueCount}\n\nhttps://fearlessmarketinglab.com/projects`;
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
    ${btn("Log my DMO", "https://fearlessmarketinglab.com/dmo")}`;
  const text = `Hey ${name},\n\nYou have a ${params.streakCount}-day streak and haven't logged today yet. Keep it going!\n\nhttps://fearlessmarketinglab.com/dmo`;
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
    ${btn("View my DMO", "https://fearlessmarketinglab.com/dmo")}`;
  const text = `Hey ${name},\n\nCongratulations on your ${params.streakCount}-day DMO streak! Keep it up!\n\nhttps://fearlessmarketinglab.com/dmo`;
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
    ${btn("Start a new streak", "https://fearlessmarketinglab.com/dmo")}`;
  const text = `Hey ${name},\n\nYour ${params.streakCount}-day streak ended. Start fresh today!\n\nhttps://fearlessmarketinglab.com/dmo`;
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
    ${btn("View full DMO tracker", "https://fearlessmarketinglab.com/dmo")}`;
  const text = `Hey ${name},\n\nWeekly DMO summary:\nPoints: ${params.points} | Streak: ${params.currentStreak} days | Days logged: ${params.activitiesLogged}\n\nhttps://fearlessmarketinglab.com/dmo`;
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
    ${btn("View my results", `https://fearlessmarketinglab.com/sessions/${params.sessionId}`)}`;
  const text = `Hey ${name},\n\nYour video "${params.videoTitle}" has been scored${params.score !== null ? ` — ${params.score}/100` : ""}.\n\nView results: https://fearlessmarketinglab.com/sessions/${params.sessionId}`;
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
    ${btn("Upload a video", "https://fearlessmarketinglab.com/upload")}`;
  const text = `Hey ${name},\n\nYou haven't uploaded a practice video this week yet. Keep the habit going!\n\nhttps://fearlessmarketinglab.com/upload`;
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
    ${btn("Check sender reputation", "https://fearlessmarketinglab.com/email-tools/sender-reputation")}`;
  const text = `Hey ${name},\n\nSender reputation drop for ${params.domain}: ${params.previousScore} → ${params.score}.\n\nhttps://fearlessmarketinglab.com/email-tools/sender-reputation`;
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
    ${btn("View inbox analyzer", "https://fearlessmarketinglab.com/email-tools/inbox-analyzer")}`;
  const text = `Hey ${name},\n\nWeekly inbox report:\nInbox: ${params.inboxRate}% | Spam: ${params.spamRate}% | Analyzed: ${params.emailsAnalyzed}\n\nhttps://fearlessmarketinglab.com/email-tools/inbox-analyzer`;
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
    ${btn("Go to your dashboard", "https://fearlessmarketinglab.com/")}`;
  const text = `Hey ${name}, welcome to Academy Toolkit!\n\nYour account is active. Get started at https://fearlessmarketinglab.com/`;
  return { subject, html: wrap("Welcome to Academy Toolkit!", body), text };
}
