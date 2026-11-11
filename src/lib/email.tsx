import { render } from "@react-email/render";
import QRCode from "qrcode";
import { NoticeEmail, type NoticeContent } from "@/emails/notice-email";
import { formatTicketCode } from "@/lib/check-in";

// Sends email through Resend's HTTP API when RESEND_API_KEY is set. Without a key
// (local development) the email is printed to the server console instead, so links
// can be clicked from the terminal.
//
// An Email is plain data until it's sent. Services build them inside a transaction,
// and rendering the template and QR code then waits until the transaction is over.

export type Email = {
  to: string;
  subject: string;
  content: NoticeContent;
  /** A ticket code to show as a QR code inside the email. */
  ticketCode?: string;
  /** Also puts this message on the person's notification bell (see deliver()). */
  notify?: { userId: string; link: string };
};

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_LIMIT = 100;
const QR_CONTENT_ID = "ticket-qr";
const RETRY_DELAYS_MS = [500, 2000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (status: number) => status === 429 || status >= 500;

/**
 * Posts to Resend, trying again when it's busy or unreachable. Other refusals, such
 * as a bad address, would only fail again. Throws only when the last try can't connect.
 */
async function postToResend(url: string, apiKey: string, body: unknown, what: string) {
  for (let attempt = 0; ; attempt++) {
    const retryAfter = RETRY_DELAYS_MS[attempt];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      if (retryAfter === undefined || !shouldRetry(res.status)) {
        console.error(`Resend refused ${what}: ${res.status} ${await res.text()}`);
        return;
      }
    } catch (e) {
      if (retryAfter === undefined) throw e;
    }
    await wait(retryAfter);
  }
}

/** The email as plain text, for email apps that don't show HTML and for the dev console. */
export function emailText(email: Email) {
  const { greeting, paragraphs, details, button, footer } = email.content;
  return [
    greeting,
    ...paragraphs,
    details?.map(({ label, value }) => `${label}: ${value}`).join("\n"),
    email.ticketCode && `Ticket code: ${formatTicketCode(email.ticketCode)}`,
    button && `${button.text}: ${button.url}`,
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** What Resend needs for one email. */
async function toResendEmail(email: Email) {
  const qr = email.ticketCode
    ? { contentId: QR_CONTENT_ID, code: formatTicketCode(email.ticketCode) }
    : undefined;
  return {
    from: process.env.EMAIL_FROM ?? "CSMSS Events <onboarding@resend.dev>",
    to: [email.to],
    subject: email.subject,
    text: emailText(email),
    html: await render(<NoticeEmail content={email.content} qr={qr} />),
    // Email apps block QR codes inlined as data, so it goes as an attached image.
    attachments: email.ticketCode
      ? [
          {
            filename: "ticket-qr.png",
            content: (
              await QRCode.toBuffer(email.ticketCode, {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 440,
              })
            ).toString("base64"),
            content_id: QR_CONTENT_ID,
            content_type: "image/png",
          },
        ]
      : undefined,
  };
}

function printToConsole(email: Email) {
  console.info(
    `\n──── Email (not sent: no RESEND_API_KEY) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${emailText(email)}\n─────────────────────────────────────────────\n`,
  );
}

/** The demo accounts use a reserved domain that can't receive mail; bounces would hurt the sender. */
const canReceiveMail = (email: Email) => !email.to.toLowerCase().endsWith(".test");

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && !canReceiveMail(email)) return;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(`RESEND_API_KEY is not set; email "${email.subject}" was not sent.`);
    } else {
      printToConsole(email);
    }
    return;
  }
  await postToResend(RESEND_URL, apiKey, await toResendEmail(email), `"${email.subject}"`);
}

/**
 * Sends many emails, for example to everyone on a cancelled event. Resend's batch
 * endpoint keeps this within its request rate limit, but it can't carry attachments,
 * so emails with a QR code go one at a time. Never throws: the change that caused the
 * emails is already saved, so a mail problem is only logged.
 */
export async function sendEmails(emails: Email[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  try {
    const single = apiKey ? emails.filter((e) => e.ticketCode) : emails;
    for (const email of single) await sendEmail(email);
    if (!apiKey) return;

    const plain = emails.filter((e) => !e.ticketCode && canReceiveMail(e));
    for (let i = 0; i < plain.length; i += RESEND_BATCH_LIMIT) {
      const batch = plain.slice(i, i + RESEND_BATCH_LIMIT);
      const body = await Promise.all(batch.map(toResendEmail));
      await postToResend(`${RESEND_URL}/batch`, apiKey, body, "a batch");
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
    content: {
      heading: subject,
      greeting,
      paragraphs: [body],
      button: { text: buttonText, url },
      footer,
    },
  };
}
