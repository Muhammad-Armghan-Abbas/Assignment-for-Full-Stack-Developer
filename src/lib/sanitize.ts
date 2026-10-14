import sanitizeHtml from "sanitize-html";

/**
 * Documents are stored as HTML. The editor only produces a small set of tags,
 * so anything outside that set (scripts, iframes, inline handlers, styles) is
 * stripped on the server before it is persisted — whether it came from the
 * editor, an API client, or an imported file.
 */
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr", "a",
    ],
    allowedAttributes: { a: ["href", "target", "rel"], ol: ["start"] },
    allowedSchemes: ["http", "https", "mailto"],
    // Heading levels 4-6 (common in .md/.docx imports) are folded into h3.
    transformTags: { h4: "h3", h5: "h3", h6: "h3", b: "strong", i: "em" },
  });
}
