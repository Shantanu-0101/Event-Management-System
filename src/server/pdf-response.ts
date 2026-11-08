/** A PDF download. File names here are built from slugs, so they're safe in a header. */
export function pdfResponse({ filename, bytes }: { filename: string; bytes: Uint8Array }) {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
