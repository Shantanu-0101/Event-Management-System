// Sends an email through Resend's HTTP API when RESEND_API_KEY is set.
// Without a key (local development) the email is printed to the server
// console instead, so links can be clicked from the terminal.
// Phase 5 replaces the plain HTML here with React Email templates.

export type Email = { to: string; subject: string; text: string; html: string };

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(`RESEND_API_KEY is not set; email "${email.subject}" was not sent.`);
      return;
    }
    console.info(
      `\n──── Email (not sent: no RESEND_API_KEY) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n─────────────────────────────────────────────\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Campus Events <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    console.error(`Resend refused "${email.subject}": ${res.status} ${await res.text()}`);
  }
}

const RESEND_BATCH_LIMIT = 100;

/**
 * Sends many emails, for example to everyone on a cancelled event. Resend's
 * batch endpoint keeps this within its request rate limit. Never throws: the
 * change that caused the emails is already saved, so a mail problem is only logged.
 */
export async function sendEmails(emails: Email[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  try {
    if (!apiKey) {
      for (const email of emails) await sendEmail(email);
      return;
    }
    for (let i = 0; i < emails.length; i += RESEND_BATCH_LIMIT) {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          emails.slice(i, i + RESEND_BATCH_LIMIT).map((email) => ({
            from: process.env.EMAIL_FROM ?? "Campus Events <onboarding@resend.dev>",
            to: [email.to],
            subject: email.subject,
            text: email.text,
            html: email.html,
          })),
        ),
      });
      if (!res.ok) console.error(`Resend refused a batch: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error("Could not send emails:", e);
  }
}

/** Absolute link into this app, e.g. appUrl("/verify-email?token=…"). */
export function appUrl(path: string) {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return new URL(path, base).toString();
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A short email with one button. */
export function linkEmail(opts: {
  to: string;
  subject: string;
  greeting: string;
  body: string;
  buttonText: string;
  url: string;
  footer: string;
}): Email {
  const { to, subject, greeting, body, buttonText, url, footer } = opts;
  return {
    to,
    subject,
    text: `${greeting}\n\n${body}\n\n${buttonText}: ${url}\n\n${footer}`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(buttonText)}</a></p><p style="color:#71717a;font-size:13px">${escapeHtml(footer)}</p>`,
  };
}
