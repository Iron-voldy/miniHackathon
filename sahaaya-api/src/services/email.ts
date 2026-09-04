import nodemailer, { Transporter } from "nodemailer";
import { env } from "../lib/env";
import { withTimeout } from "../lib/withTimeout";

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/**
 * Emails a caregiver that their linked communicator sent a request. Best-effort
 * only: never blocks or fails the request it's notifying about (invariant #9's
 * degrade-don't-fail pattern applies here too) - the dashboard/SSE push is the
 * primary delivery path, this is a secondary channel.
 */
export async function sendCaregiverRequestEmail(params: {
  to: string;
  communicatorName: string;
  phraseText: string;
}): Promise<boolean> {
  if (!env.SMTP_HOST || !env.EMAIL_FROM) {
    return false;
  }

  return withTimeout(
    async () => {
      await getTransporter().sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: `Sahaaya: ${params.communicatorName} needs something`,
        text: `${params.communicatorName} just selected: "${params.phraseText}"\n\nOpen the Sahaaya caregiver dashboard to respond.`,
        html: `<p><strong>${escapeHtml(params.communicatorName)}</strong> just selected:</p><p style="font-size:1.2rem">"${escapeHtml(params.phraseText)}"</p><p>Open the Sahaaya caregiver dashboard to respond.</p>`,
      });
      return true;
    },
    env.EMAIL_TIMEOUT_MS,
    () => false
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
