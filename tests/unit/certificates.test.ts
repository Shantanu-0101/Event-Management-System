import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  assertUsableTemplate,
  renderCertificates,
  type CertificateData,
} from "@/lib/certificate-pdf";
import { afterEventProblem, certificatesDue, placeOf, resultsProblem } from "@/lib/certificates";
import { normalizeTicketCode, TICKET_ALPHABET } from "@/lib/check-in";
import { newVerifyCode } from "@/lib/tickets";

const NOW = new Date("2026-11-20T12:00:00Z");
const schedule = {
  status: "PUBLISHED" as const,
  regOpensAt: new Date("2026-11-01T00:00:00Z"),
  regClosesAt: new Date("2026-11-10T00:00:00Z"),
  startsAt: new Date("2026-11-19T00:00:00Z"),
  endsAt: new Date("2026-11-20T00:00:00Z"),
};

describe("afterEventProblem", () => {
  it("is open once the dates say the event is over, even if the saved status lags", () => {
    expect(afterEventProblem(schedule, NOW)).toBeNull();
  });
  it("stays closed while the event is on", () => {
    expect(afterEventProblem(schedule, new Date("2026-11-19T12:00:00Z"))).toMatch(/ended/);
  });
  it("never opens for a cancelled event", () => {
    expect(afterEventProblem({ ...schedule, status: "CANCELLED" }, NOW)).toMatch(/cancelled/);
  });
});

describe("resultsProblem", () => {
  it("accepts full, partial and empty results", () => {
    expect(resultsProblem(["a", "b", "c"])).toBeNull();
    expect(resultsProblem(["a", null, null])).toBeNull();
    expect(resultsProblem([null, null, null])).toBeNull();
  });
  it("refuses one winner in two places", () => {
    expect(resultsProblem(["a", "a", null])).toMatch(/two places/);
  });
  it("refuses a gap above a filled place", () => {
    expect(resultsProblem([null, "b", null])).toMatch(/1st/);
    expect(resultsProblem(["a", null, "c"])).toMatch(/2nd/);
  });
});

describe("certificatesDue", () => {
  it("gives attendees participation, and winners merit as well", () => {
    const due = certificatesDue(
      [
        { id: "r1", teamId: null },
        { id: "r2", teamId: null },
      ],
      [{ position: 1, registrationId: "r2", teamId: null }],
    );
    expect(due).toEqual([
      { registrationId: "r1", type: "PARTICIPATION" },
      { registrationId: "r2", type: "PARTICIPATION" },
      { registrationId: "r2", type: "MERIT" },
    ]);
  });

  it("gives every attending member of a winning team merit", () => {
    const attendees = [
      { id: "r1", teamId: "t1" },
      { id: "r2", teamId: "t1" },
      { id: "r3", teamId: "t2" },
    ];
    const results = [{ position: 2, registrationId: null, teamId: "t1" }];
    const merit = certificatesDue(attendees, results).filter((c) => c.type === "MERIT");
    expect(merit.map((c) => c.registrationId)).toEqual(["r1", "r2"]);
    expect(placeOf(attendees[0]!, results)).toBe(2);
    expect(placeOf(attendees[2]!, results)).toBeNull();
  });

  it("doesn't mistake a solo attendee for a team with no id", () => {
    expect(
      placeOf({ id: "r1", teamId: null }, [{ position: 1, registrationId: "r9", teamId: null }]),
    ).toBeNull();
  });
});

describe("newVerifyCode", () => {
  it("is 12 easy-to-read characters that survive being typed back", () => {
    const code = newVerifyCode();
    expect(code).toHaveLength(12);
    expect([...code].every((c) => TICKET_ALPHABET.includes(c))).toBe(true);
    expect(normalizeTicketCode(code.toLowerCase().replace(/(.{4})/g, "$1-"))).toBe(code);
  });
});

const data: CertificateData = {
  type: "MERIT",
  name: "Asha Patil",
  eventTitle: "Robot Wars",
  subEvent: "Finals",
  dates: "Fri, 20 Nov 2026",
  place: "1st",
  verifyCode: "ABCD1234EFGH",
  verifyUrl: "http://localhost:3000/certificates/verify?code=ABCD1234EFGH",
};

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("renderCertificates", () => {
  it("draws one page per certificate on the built-in design", async () => {
    expect(
      await pagesOf(await renderCertificates([data, { ...data, type: "PARTICIPATION" }], null)),
    ).toBe(2);
  });

  it("survives names and titles the fonts can't print", async () => {
    const bytes = await renderCertificates(
      [
        { ...data, name: "आशा पाटील", eventTitle: "ಕಾರ್ಯಕ್ರಮ 🎉" },
        { ...data, name: "Zoë Şahin Nguyễn" },
      ],
      null,
    );
    expect(await pagesOf(bytes)).toBe(2);
  });

  it("fits very long names and titles", async () => {
    const long = "Exceptionally Long Name ".repeat(8).trim();
    expect(
      await pagesOf(await renderCertificates([{ ...data, name: long, eventTitle: long }], null)),
    ).toBe(1);
  });

  it("draws over an image template", async () => {
    expect(await pagesOf(await renderCertificates([data, data], PNG))).toBe(2);
  });

  it("draws over the first page of a PDF template, at its size", async () => {
    const template = await PDFDocument.create();
    template.addPage([500, 300]);
    template.addPage([500, 300]);
    const bytes = await renderCertificates([data, data, data], await template.save());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(2).getSize()).toEqual({ width: 500, height: 300 });
  });
});

describe("assertUsableTemplate", () => {
  it("accepts images and PDFs", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await expect(assertUsableTemplate(PNG)).resolves.toBeUndefined();
    await expect(assertUsableTemplate(await pdf.save())).resolves.toBeUndefined();
  });
  it("refuses anything else", async () => {
    await expect(assertUsableTemplate(new TextEncoder().encode("not a file"))).rejects.toThrow();
    await expect(assertUsableTemplate(new TextEncoder().encode("%PDF-broken"))).rejects.toThrow();
  });
});
