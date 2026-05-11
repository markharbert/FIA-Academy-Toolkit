// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL = (process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com").replace(/\/$/, "");

// ─── Resource link type ───────────────────────────────────────────────────────
export interface EmailResourceLink {
  description: string;
  url: string;
  anchorText: string;
}

// ─── Shared HTML wrapper ──────────────────────────────────────────────────────

function wrap(title: string, body: string, resources: EmailResourceLink[] = []): string {
  const resourcesBlock = resources.length > 0 ? `
      <!-- Recommended Resources -->
      <tr>
        <td style="background:#fff;padding:0 32px 24px;">
          <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:22px;">Recommended Resources</p>
          ${resources.map(r =>
            `<div style="margin-bottom:12px;font-size:14px;color:#334155;line-height:1.5;">${r.description} <a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color:#3f92cc;text-decoration:none;font-weight:500;white-space:nowrap;">${r.anchorText}</a></div>`
          ).join("")}
        </td>
      </tr>` : "";

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
      ${resourcesBlock}
      <!-- Footer -->
      <tr>
        <td style="background:#fff;padding:0 32px 24px;border-radius:0 0 12px 12px;border-top:1px solid #f1f5f9;">
          <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">
            You're receiving this because you have notifications enabled in your Academy Toolkit account.<br/>
            <a href="${BASE_URL}/account" target="_blank" rel="noopener noreferrer" style="color:#3f92cc;text-decoration:none;">Manage email notification preferences</a>
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
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#da0010;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">${label}</a>`;
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
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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

  return { subject, html: wrap(subject, body, resources), text };
}

export function overdueAlertEmail(params: {
  firstName: string | null;
  tasks: Array<{ title: string; projectName: string; daysOverdue: number }>;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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

  return { subject, html: wrap(subject, body, resources), text };
}

export function projectDueReminderEmail(params: {
  firstName: string | null;
  projectName: string;
  daysLeft: number;
  dueDate: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = `Project "${params.projectName}" is due in ${params.daysLeft} day${params.daysLeft !== 1 ? "s" : ""}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">
      Your project <strong>${params.projectName}</strong> is due on <strong>${params.dueDate}</strong> — that's ${params.daysLeft} day${params.daysLeft !== 1 ? "s" : ""} away.
    </p>
    ${btn("View project", `${BASE_URL}/projects`)}`;
  const text = `Hey ${name},\n\nYour project "${params.projectName}" is due on ${params.dueDate} (${params.daysLeft} day(s) away).\n\n${BASE_URL}/projects`;
  return { subject, html: wrap(subject, body, resources), text };
}

export function weeklyProjectDigestEmail(params: {
  firstName: string | null;
  openTasks: number;
  doneTasks: number;
  overdueCount: number;
  projects: Array<{ name: string; openTasks: number }>;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap(subject, body, resources), text };
}

export function dmoStreakAtRiskEmail(params: {
  firstName: string | null;
  streakCount: number;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Keep Your Streak Alive!", body, resources), text };
}

export function dmoMilestoneEmail(params: {
  firstName: string | null;
  streakCount: number;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap(`${params.streakCount}-Day Streak Milestone!`, body, resources), text };
}

export function dmoStreakBrokenEmail(params: {
  firstName: string | null;
  streakCount: number;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Start Fresh Today", body, resources), text };
}

export function weeklyDmoSummaryEmail(params: {
  firstName: string | null;
  points: number;
  currentStreak: number;
  activitiesLogged: number;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Weekly DMO Summary", body, resources), text };
}

export function videoScoringCompleteEmail(params: {
  firstName: string | null;
  videoTitle: string;
  score: number | null;
  sessionId: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Your Video Results Are Ready", body, resources), text };
}

export function videoPracticeReminderEmail(params: {
  firstName: string | null;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const subject = "This week's video practice is waiting for you";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      You haven't uploaded a practice video this week yet. Consistency is the key to improvement — even a quick 60-second take counts.
    </p>
    ${btn("Upload a video", `${BASE_URL}/video-score-upload`)}`;
  const text = `Hey ${name},\n\nYou haven't uploaded a practice video this week yet. Keep the habit going!\n\n${BASE_URL}/video-score-upload`;
  return { subject, html: wrap("Time for Your Weekly Video Practice", body, resources), text };
}

export function reputationDropAlertEmail(params: {
  firstName: string | null;
  domain: string;
  score: string;
  previousScore: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Sender Reputation Drop Detected", body, resources), text };
}

export function weeklyInboxReportEmail(params: {
  firstName: string | null;
  inboxRate: number;
  spamRate: number;
  emailsAnalyzed: number;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Weekly Inbox Placement Report", body, resources), text };
}

export function feedbackSubmittedEmail(params: {
  firstName: string | null;
  type: "feature" | "bug";
  title: string;
  postId: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const isFeature = params.type === "feature";
  const icon = isFeature ? "💡" : "🐛";
  const label = isFeature ? "Feature Request" : "Bug Report";
  const subject = isFeature ? "We received your feature request!" : "We received your bug report!";
  const blurb = isFeature
    ? "Thanks for sharing your idea! We review every feature request and will keep you posted as things progress."
    : "Thanks for letting us know. We review every bug report and will work on getting it fixed as soon as possible.";
  const postUrl = `${BASE_URL}/feedback?post=${params.postId}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">${blurb}</p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:0 0 20px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${icon}&nbsp; ${label} submitted</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">${params.title}</p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;">You can check the status on the Feedback page at any time.</p>
    ${btn("View my submission", postUrl)}`;
  const text = `Hey ${name},\n\n${blurb}\n\n${label}: ${params.title}\n\nView it at ${postUrl}`;
  return { subject, html: wrap(subject, body, resources), text };
}

export function newBugAdminAlertEmail(params: {
  submitterName: string;
  submitterEmail: string;
  title: string;
  description: string;
  postId: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const postUrl = `${BASE_URL}/feedback?post=${params.postId}`;
  const subject = `🐛 New bug report: ${params.title}`;
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">A new bug report has been submitted and needs your attention.</p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:0 0 20px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">🐛&nbsp; Bug Report</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b;">${params.title}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Submitted by <strong style="color:#334155;">${params.submitterName}</strong> &mdash; ${params.submitterEmail}</p>
    </div>
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Description</p>
    <p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.7;">${params.description}</p>
    ${btn("Review bug report", postUrl)}`;
  const text = `New bug report from ${params.submitterName} (${params.submitterEmail})\n\n${params.title}\n\n${params.description}\n\nReview at ${postUrl}`;
  return { subject, html: wrap("New Bug Report", body, resources), text };
}

export function feedbackStatusChangedEmail(params: {
  firstName: string | null;
  type: "feature" | "bug";
  postTitle: string;
  newStatus: string;
  postId: string;
  adminResponse?: string | null;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const isFeature = params.type === "feature";
  const label = isFeature ? "feature request" : "bug report";
  const labelTitle = isFeature ? "Feature Request" : "Bug Report";
  const icon = isFeature ? "💡" : "🐛";
  const statusLabels: Record<string, string> = {
    open: "Open",
    under_review: "Under Review",
    planned: "Planned",
    in_progress: "In Progress",
    completed: "Completed",
    resolved: "Resolved",
    closed: "Closed",
  };
  const humanStatus = statusLabels[params.newStatus] ?? params.newStatus;
  const subject = `Update on your ${label}: ${params.postTitle}`;
  const postUrl = `${BASE_URL}/feedback?post=${params.postId}`;

  const responseBlock = params.adminResponse
    ? `<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Official response from our team</p>
    <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin:0 0 20px;border:1px solid #e2e8f0;">
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${params.adminResponse}</p>
    </div>`
    : "";

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">There's a status update on your ${label}.</p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:0 0 20px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${icon}&nbsp; ${labelTitle}</p>
      <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1e293b;">${params.postTitle}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Status</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#0c1a4d;">${humanStatus}</p>
    </div>
    ${responseBlock}
    <p style="margin:0 0 4px;font-size:14px;color:#64748b;">You can track the progress of your ${label} on the Feedback page at any time.</p>
    ${btn("View my feedback", postUrl)}`;

  const text = `Hey ${name},\n\nThere's a status update on your ${label} "${params.postTitle}".\n\nNew status: ${humanStatus}${params.adminResponse ? "\n\nOfficial response: " + params.adminResponse : ""}\n\nView it at ${postUrl}`;
  return { subject, html: wrap("Feedback Status Update", body, resources), text };
}

export function feedbackCommentEmail(params: {
  firstName: string | null;
  type: "feature" | "bug";
  postTitle: string;
  commenterName: string;
  commentBody: string;
  isAdmin: boolean;
  postId: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const name = params.firstName || "there";
  const isFeature = params.type === "feature";
  const label = isFeature ? "feature request" : "bug report";
  const subject = params.isAdmin
    ? `💬 New comment on ${label}: ${params.postTitle}`
    : `${params.commenterName} commented on your ${label}`;
  const intro = params.isAdmin
    ? `A new comment was posted on a ${label} that needs your attention.`
    : `${params.commenterName} left a comment on your ${label}.`;
  const postUrl = `${BASE_URL}/feedback?post=${params.postId}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hey ${name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">${intro}</p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:0 0 16px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${isFeature ? "💡" : "🐛"}&nbsp; ${isFeature ? "Feature Request" : "Bug Report"}</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">${params.postTitle}</p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#64748b;">${params.commenterName} wrote:</p>
    <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin:0 0 24px;border:1px solid #e2e8f0;">
      <p style="margin:0;font-size:15px;color:#334155;line-height:1.7;">${params.commentBody}</p>
    </div>
    ${btn("View the discussion", postUrl)}`;
  const text = `Hey ${name},\n\n${intro}\n\n"${params.postTitle}"\n\n${params.commenterName}: ${params.commentBody}\n\nView at ${postUrl}`;
  return { subject, html: wrap(subject, body, resources), text };
}

export function workspaceInviteEmail(params: {
  ownerName: string;
  inviteUrl: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
  const subject = `${params.ownerName} invited you to their Academy Toolkit workspace`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi there,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">
      <strong>${params.ownerName}</strong> has invited you to join their <strong>Academy Toolkit</strong> workspace as a collaborator.
    </p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:0 0 24px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">&#128101;&nbsp; As a workspace collaborator you'll have access to</p>
      <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">&#128193;&nbsp; Full Project Manager</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b;">Tasks, boards, calendars, and project templates</p>
      </div>
      <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">&#9989;&nbsp; Create &amp; update tasks</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b;">Manage work on their behalf — scoped only to their projects</p>
      </div>
      <div style="padding:10px 0;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">&#128274;&nbsp; Your own private login</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b;">Nothing else in their account is visible to you</p>
      </div>
    </div>
    <p style="margin:0 0 6px;font-size:14px;color:#334155;">Click the button below to accept your invitation and set up your collaborator account.</p>
    ${btn("Accept Invitation", params.inviteUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
      This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.
    </p>`;
  const text = `${params.ownerName} invited you to collaborate on their Academy Toolkit workspace.\n\nAs a collaborator you'll have access to their full Project Manager — tasks, boards, and calendars — with your own separate login.\n\nAccept your invitation here:\n${params.inviteUrl}\n\nThis link expires in 7 days. If you weren't expecting this, just ignore it.`;
  return { subject, html: wrap("You've Been Invited to a Workspace", body, resources), text };
}

export function welcomeEmail(params: {
  firstName: string | null;
  email: string;
}, resources: EmailResourceLink[] = []): { subject: string; html: string; text: string } {
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
  return { subject, html: wrap("Welcome to Academy Toolkit!", body, resources), text };
}
