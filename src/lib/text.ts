/** Plain-text helpers shared by the server (previews, activity) and tests. */

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|\/blockquote|\/pre)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(html: string, max = 160): string {
  const text = htmlToText(html);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function wordCount(html: string): number {
  const text = htmlToText(html);
  return text ? text.split(" ").length : 0;
}
