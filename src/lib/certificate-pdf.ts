import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";
import type { CertificateType } from "@/generated/prisma/enums";
import { formatTicketCode } from "@/lib/check-in";

// Draws certificates as a PDF, one page each, over the admin's template or the
// built-in design. Everything is placed as a share of the page, so a template of any
// size works, as long as it leaves its middle and bottom right corner clear.

export type CertificateData = {
  type: CertificateType;
  name: string;
  eventTitle: string;
  subEvent: string | null;
  /** The event's dates, ready to print. */
  dates: string;
  /** "1st" for a merit certificate, otherwise null. */
  place: string | null;
  verifyCode: string;
  verifyUrl: string;
};

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.35, 0.35, 0.4);

const startsWith = (bytes: Uint8Array, ...signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

const isPdf = (bytes: Uint8Array) => startsWith(bytes, 0x25, 0x50, 0x44, 0x46);
const isPng = (bytes: Uint8Array) => startsWith(bytes, 0x89, 0x50, 0x4e, 0x47);
const isJpeg = (bytes: Uint8Array) => startsWith(bytes, 0xff, 0xd8, 0xff);

/** Throws when a template can't be drawn on: not a PNG, JPG or PDF, or a locked or broken PDF. */
export async function assertUsableTemplate(bytes: Uint8Array) {
  const doc = await PDFDocument.create();
  if (isPdf(bytes)) {
    const template = await PDFDocument.load(bytes);
    if (template.getPageCount() === 0) throw new Error("The PDF has no pages.");
  } else if (isPng(bytes)) {
    await doc.embedPng(bytes);
  } else if (isJpeg(bytes)) {
    await doc.embedJpg(bytes);
  } else {
    throw new Error("Not a PNG, JPG or PDF.");
  }
}

/**
 * The built-in fonts only have Western letters, and pdf-lib throws on anything else.
 * Accents that can be dropped are dropped; other scripts print as "?", so a page
 * always comes out. The bundled fonts can't join Indian scripts properly either.
 */
function printable(font: PDFFont, text: string) {
  const supported = new Set(font.getCharacterSet());
  const inFont = (c: string) => supported.has(c.codePointAt(0)!);
  return [...text]
    .map((c) => {
      if (inFont(c)) return c;
      const plain = c.normalize("NFKD").replace(/\p{M}/gu, "");
      return plain && [...plain].every(inFont) ? plain : "?";
    })
    .join("");
}

type Fonts = { regular: PDFFont; bold: PDFFont };

/** The largest size up to `max` at which the text fits the width. */
function fittedSize(font: PDFFont, text: string, max: number, width: number) {
  return Math.min(max, (max * width) / Math.max(1, font.widthOfTextAtSize(text, max)));
}

/** Splits text into at most two lines, as evenly as the words allow. */
function twoLines(text: string): string[] {
  const words = text.split(/\s+/);
  let first = "";
  for (const word of words) {
    if (first && (first + " " + word).length > text.length / 2) break;
    first = first ? `${first} ${word}` : word;
  }
  const second = text.slice(first.length).trim();
  return second ? [first, second] : [first];
}

function centred(
  page: PDFPage,
  font: PDFFont,
  rawText: string,
  y: number,
  size: number,
  color = INK,
  maxWidth = page.getWidth() * 0.76,
) {
  const text = printable(font, rawText);
  const fitted = fittedSize(font, text, size, maxWidth);
  page.drawText(text, {
    x: (page.getWidth() - font.widthOfTextAtSize(text, fitted)) / 2,
    y,
    size: fitted,
    font,
    color,
  });
}

function drawBuiltInDesign(page: PDFPage, fonts: Fonts) {
  const [w, h] = [page.getWidth(), page.getHeight()];
  const frame = { borderColor: INK, opacity: 0, borderOpacity: 1 };
  page.drawRectangle({ x: 24, y: 24, width: w - 48, height: h - 48, borderWidth: 2, ...frame });
  page.drawRectangle({ x: 32, y: 32, width: w - 64, height: h - 64, borderWidth: 0.5, ...frame });
  centred(page, fonts.bold, "CSMSS Events", h * 0.86, 15, MUTED);
}

async function drawCertificate(page: PDFPage, fonts: Fonts, data: CertificateData) {
  const [w, h] = [page.getWidth(), page.getHeight()];
  // Sizes follow the page, so an A5 template looks the same as an A4 one.
  const scale = w / A4_LANDSCAPE[0];
  const line = (font: PDFFont, text: string, at: number, size: number, color = INK) =>
    centred(page, font, text, h * at, size * scale, color);

  const merit = data.type === "MERIT";
  line(fonts.bold, merit ? "Certificate of Merit" : "Certificate of Participation", 0.74, 32);
  line(fonts.regular, "This is to certify that", 0.65, 14, MUTED);
  line(fonts.bold, data.name, 0.55, 34);
  line(fonts.regular, merit ? `won ${data.place} place in` : "took part in", 0.48, 14, MUTED);

  // A short title stays on one line; only one too wide for it is split.
  const titleFits =
    fonts.bold.widthOfTextAtSize(printable(fonts.bold, data.eventTitle), 22 * scale) <= w * 0.76;
  const title = titleFits ? [data.eventTitle] : twoLines(data.eventTitle);
  const lastLine = title.length === 2 ? 0.36 : 0.4;
  title.forEach((text, i) => line(fonts.bold, text, 0.4 - i * 0.04, title.length === 2 ? 18 : 22));
  if (data.subEvent) line(fonts.regular, data.subEvent, lastLine - 0.045, 13, MUTED);
  line(fonts.regular, data.dates, lastLine - (data.subEvent ? 0.09 : 0.05), 13, MUTED);

  const qr = await page.doc.embedPng(
    await QRCode.toBuffer(data.verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 240 }),
  );
  const qrSize = h * 0.14;
  const qrX = w - qrSize - w * 0.07;
  const qrY = h * 0.125;
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const code = printable(fonts.regular, formatTicketCode(data.verifyCode));
  const codeSize = fittedSize(fonts.regular, code, 8 * scale, qrSize * 1.3);
  page.drawText(code, {
    x: qrX + (qrSize - fonts.regular.widthOfTextAtSize(code, codeSize)) / 2,
    y: qrY - codeSize - 3,
    size: codeSize,
    font: fonts.regular,
    color: MUTED,
  });
}

/** Everything drawn underneath: a fresh copy of the template's first page, per certificate. */
async function pageMaker(doc: PDFDocument, template: Uint8Array | null) {
  if (template && isPdf(template)) {
    const source = await PDFDocument.load(template);
    return async () => {
      const [copied] = await doc.copyPages(source, [0]);
      return { page: doc.addPage(copied), plain: false };
    };
  }

  // One image in the file, however many pages show it.
  let image: PDFImage | null = null;
  if (template)
    image = isPng(template) ? await doc.embedPng(template) : await doc.embedJpg(template);
  return async () => {
    const page = doc.addPage(A4_LANDSCAPE);
    if (image)
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    return { page, plain: !image };
  };
}

export async function renderCertificates(
  certificates: CertificateData[],
  template: Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Certificate");
  doc.setProducer("CSMSS Events");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const nextPage = await pageMaker(doc, template);

  for (const data of certificates) {
    const { page, plain } = await nextPage();
    if (plain) drawBuiltInDesign(page, fonts);
    await drawCertificate(page, fonts, data);
  }
  return doc.save();
}
