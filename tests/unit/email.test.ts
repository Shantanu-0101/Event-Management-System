import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailText, linkEmail, sendEmail, sendEmails, type Email } from "@/lib/email";
import { announcementEmail, confirmedEmail, eventDetails } from "@/lib/registration-emails";

const person = { id: "u1", name: "Asha <b>Patil</b>", email: "asha@test.local" };
const event = {
  title: "Robot Wars",
  slug: "robot-wars",
  startsAt: new Date("2026-11-20T04:30:00Z"),
  endsAt: new Date("2026-11-20T06:30:00Z"),
  venue: { name: "Main Hall", building: "Block A" },
};
const plain = (to: string): Email =>
  linkEmail({
    to,
    subject: "Hello",
    greeting: "Hi,",
    body: "Body",
    buttonText: "Open",
    url: "http://localhost:3000/x",
    footer: "Footer",
  });
const withQr = confirmedEmail(person, event, { id: "r1", ticketCode: "K7QM3XRT9PWAHC2D" });

type Call = { url: string; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function stubFetch(...statuses: number[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response("{}", { status: statuses.shift() ?? 200 });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registration emails", () => {
  it("shows the event's time in India and its venue", () => {
    expect(eventDetails(event)).toEqual([
      { label: "When", value: expect.stringContaining("10:00 am") },
      { label: "Where", value: "Main Hall, Block A" },
    ]);
  });

  it("links the bell and the button to the person's own ticket", () => {
    expect(withQr.notify).toEqual({ userId: "u1", link: "/my-events/r1/ticket" });
    expect(withQr.content.button?.url).toContain("/my-events/r1/ticket");
    expect(emailText(withQr)).toContain("K7QM-3XRT-9PWA-HC2D");
  });

  it("keeps account mail, like password resets, off the bell", () => {
    expect(plain("a@test.local").notify).toBeUndefined();
  });
});

describe("sendEmail", () => {
  it("attaches the QR as an inline image the HTML points at", async () => {
    const calls = stubFetch();
    await sendEmail(withQr);

    expect(calls).toHaveLength(1);
    const { url, body } = calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(body.html).toContain('src="cid:ticket-qr"');
    expect(body.attachments[0]).toMatchObject({
      filename: "ticket-qr.png",
      content_id: "ticket-qr",
      content_type: "image/png",
    });
    const png = Buffer.from(body.attachments[0].content, "base64");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("escapes what people typed", async () => {
    const calls = stubFetch();
    await sendEmail(announcementEmail(person, event, "Change", "<script>alert(1)</script>"));
    const { html } = calls[0]!.body;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Patil</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("tries again when Resend is busy", async () => {
    const calls = stubFetch(429, 503, 200);
    await sendEmail(plain("a@test.local"));
    expect(calls).toHaveLength(3);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("gives up after three tries, and logs it", async () => {
    const calls = stubFetch(500, 500, 500, 500);
    await sendEmail(plain("a@test.local"));
    expect(calls).toHaveLength(3);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("doesn't retry a refusal that would only fail again", async () => {
    const calls = stubFetch(422);
    await sendEmail(plain("a@test.local"));
    expect(calls).toHaveLength(1);
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("sendEmails", () => {
  it("sends QR emails one by one, because batches can't carry attachments", async () => {
    const calls = stubFetch();
    await sendEmails([plain("a@test.local"), withQr, plain("b@test.local")]);

    const single = calls.filter((c) => c.url.endsWith("/emails"));
    const batches = calls.filter((c) => c.url.endsWith("/emails/batch"));
    expect(single).toHaveLength(1);
    expect(single[0]!.body.attachments).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.body.map((e: { to: string[] }) => e.to[0])).toEqual([
      "a@test.local",
      "b@test.local",
    ]);
    expect(batches[0]!.body[0].attachments).toBeUndefined();
  });

  it("splits batches at Resend's limit of 100", async () => {
    const calls = stubFetch();
    await sendEmails(Array.from({ length: 205 }, (_, i) => plain(`s${i}@test.local`)));
    expect(calls.map((c) => c.body.length)).toEqual([100, 100, 5]);
  });

  it("never throws when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(sendEmails([plain("a@test.local")])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
