import { sendEmail } from "./email-sendgrid";
import * as emailTemplates from "./email-templates";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  isFirstTime = false
): Promise<boolean> {
  const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}${isFirstTime ? "&welcome=1" : ""}`;

  const heading = isFirstTime ? "Set Up Your Password" : "Reset Your Password";
  const intro = isFirstTime
    ? "Welcome to the Academy Toolkit! To get started, you need to set a password for your account."
    : "We received a request to reset the password for your Academy Toolkit account.";
  const body = isFirstTime
    ? "Click the button below to choose your password and activate your account:"
    : "Click the button below to choose a new password:";
  const buttonText = isFirstTime ? "Set My Password" : "Reset Password";
  const footer = isFirstTime
    ? "This link expires in 60 minutes."
    : "This link expires in 60 minutes. If you didn't request a password reset, you can safely ignore this email.";
  const subject = isFirstTime
    ? "Set up your Academy Toolkit password"
    : "Reset your Academy Toolkit password";
  const textIntro = isFirstTime
    ? "Welcome to the Academy Toolkit! Click the link below to set your password:"
    : "We received a request to reset your password. Click the link below to set a new password:";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#06092a 0%,#0f1550 100%);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ACADEMY TOOLKIT</span>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;">
            <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;">${heading}</h2>
            <p style="margin:0 0 16px;font-size:15px;color:#334155;">${intro}</p>
            <p style="margin:0 0 20px;font-size:15px;color:#334155;">${body}</p>
            <p style="text-align:center;margin:0 0 24px;">
              <a href="${resetLink}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;padding:12px 24px;background:#da0010;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
                ${buttonText}
              </a>
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:13px;color:#3f92cc;word-break:break-all;">${resetLink}</p>
            <p style="margin:0 0 0;font-size:13px;color:#94a3b8;"><strong>${footer}</strong></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">Academy Toolkit &mdash; Fearless Marketing Lab</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${heading}\n\n${textIntro}\n${resetLink}\n\n${footer}`;

  try {
    await sendEmail({
      to: email,
      subject,
      html,
      text,
    });
    console.log(`[Email] Password ${isFirstTime ? "setup" : "reset"} email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send password reset email:", error);
    return false;
  }
}

export async function sendWorkspaceInviteEmail(params: {
  to: string;
  ownerName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const { to, ownerName, inviteUrl } = params;
  const rendered = emailTemplates.workspaceInviteEmail({ ownerName, inviteUrl });

  try {
    await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    console.log(`[Email] Workspace invite sent to ${to}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send workspace invite email:", error);
    return false;
  }
}

export async function sendWelcomeEmail(params: {
  email: string;
  firstName: string | null;
  setupLink: string;
  resources?: import("./email-templates").EmailResourceLink[];
}): Promise<boolean> {
  const rendered = emailTemplates.welcomeEmail(
    { firstName: params.firstName, email: params.email, setupLink: params.setupLink },
    params.resources ?? []
  );
  try {
    await sendEmail({ to: params.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
    console.log(`[Email] Welcome email sent to ${params.email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send welcome email:", error);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return !!process.env.SENDGRID_API_TOKEN;
}
