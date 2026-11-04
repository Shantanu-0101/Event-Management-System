import sanitizeHtml from "sanitize-html";

// Event descriptions are stored as HTML from the editor and shown as HTML, so
// they are cleaned on the server before saving. A browser's request can contain
// anything, whatever the editor's buttons allow; this keeps scripts out.

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

export function cleanRichText(html: string) {
  return sanitizeHtml(html, ALLOWED).trim();
}

/** Plain words, for search-engine summaries and calendar files. */
export function richTextToPlain(html: string) {
  const spaced = html.replace(/<\/(p|h2|h3|li|blockquote)>|<br\s*\/?>/g, "$&\n");
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
