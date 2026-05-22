import sgMail from "@sendgrid/mail";

const DEFAULT_FROM_EMAIL = "notifications@fearlesspromo.com";
const DEFAULT_FROM_NAME  = "Fearless Marketing Lab";

let _fromEmail = DEFAULT_FROM_EMAIL;
let _fromName  = DEFAULT_FROM_NAME;
let initialized = false;

/** Called at startup and whenever an admin saves new sender settings. */
export function configureEmailSender(fromName: string, fromEmail: string): void {
  _fromName  = fromName  || DEFAULT_FROM_NAME;
  _fromEmail = fromEmail || DEFAULT_FROM_EMAIL;
}

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
      from: { email: _fromEmail, name: _fromName },
      subject,
      html,
      text,
    });
    console.log(`[sendgrid] sent "${subject}" to ${to} (from: ${_fromName} <${_fromEmail}>)`);
  } catch (err: any) {
    console.error("[sendgrid] send error:", err?.response?.body ?? err?.message ?? err);
  }
}
