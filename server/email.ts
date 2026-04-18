import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@videocreatorstoolkit.com";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://videocreatorstoolkit.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[Email] SMTP credentials not configured. Email sending disabled.");
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string
): Promise<boolean> {
  const transport = getTransporter();
  
  if (!transport) {
    console.log(`[Email] Would send password reset to ${email} (SMTP not configured)`);
    console.log(`[Email] Reset link: ${APP_BASE_URL}/reset-password?token=${resetToken}`);
    return true;
  }

  const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #06092a; margin-bottom: 10px;">Academy Toolkit</h1>
      </div>
      
      <h2 style="color: #06092a;">Reset Your Password</h2>
      
      <p>We received a request to reset your password for your Academy Toolkit account.</p>
      
      <p>Click the button below to set a new password:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="background-color: #da0010; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #3f92cc; word-break: break-all;">${resetLink}</a>
      </p>
      
      <p style="color: #666; font-size: 14px;">
        <strong>This link will expire in 60 minutes.</strong>
      </p>
      
      <p style="color: #666; font-size: 14px;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      
      <p style="color: #999; font-size: 12px; text-align: center;">
        Academy Toolkit - Create Videos That Convert
      </p>
    </body>
    </html>
  `;

  const textContent = `
Reset Your Academy Toolkit Password

We received a request to reset your password for your Academy Toolkit account.

Click the link below to set a new password:
${resetLink}

This link will expire in 60 minutes.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
Academy Toolkit - Create Videos That Convert
  `;

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "Reset your Academy Toolkit password",
      text: textContent,
      html: htmlContent,
    });
    
    console.log(`[Email] Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send password reset email:", error);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}
