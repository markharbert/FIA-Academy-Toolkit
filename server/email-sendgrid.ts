import sgMail from "@sendgrid/mail";

const FROM_EMAIL = "notifications@fearlesspromo.com";
const FROM_NAME = "Fearless Marketing Lab";

let initialized = false;

function init() {
  if (initialized) return;
  const key = process.env.SENDGRID_API_TOKEN;
  if (!key) {
    console.warn("[sendgrid] SENDGRID_API_TOKEN not set — emails will not be sent");
    return;
  }
  sgMail.setApiKey(key);
  initialized = true;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  init();
  if (!initialized) return;
  try {
    await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html,
      text,
    });
    console.log(`[sendgrid] sent "${subject}" to ${to}`);
  } catch (err: any) {
    console.error("[sendgrid] send error:", err?.response?.body ?? err?.message ?? err);
  }
}
