import sanitizeHtml from "sanitize-html";

/**
 * Documents are stored as HTML. Everything that reaches the database — editor
 * saves, API calls, imported files, restored versions — passes this allow-list,
 * so the stored HTML only ever contains what the editor itself can produce.
 *
 * Notable rules:
 * - Images may only point at our own access-controlled asset endpoint, so a
 *   document can't embed tracking pixels or hot-link third-party content.
 * - Inline styles are limited to the handful the editor emits (colour,
 *   highlight, alignment, font size, table column widths), each value-checked.
 */

export const ASSET_URL_PREFIX = "/api/assets/";

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i, /^inherit$/];
const LENGTH = [/^\d{1,4}(\.\d+)?(px|pt|em|rem|%)$/];

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "span", "mark", "sub", "sup",
      "ul", "ol", "li", "label", "input", "div",
      "blockquote", "code", "pre", "hr", "a", "img",
      "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      ol: ["start", "type"],
      ul: ["data-type"],
      li: ["data-type", "data-checked"],
      input: ["type", "checked", "disabled"],
      mark: ["data-color", "style"],
      span: ["style"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      table: ["style"],
      col: ["style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      code: ["class"],
    },
    allowedClasses: { code: [/^language-[\w-]+$/] },
    allowedStyles: {
      "*": {
        color: COLOR,
        "background-color": COLOR,
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": LENGTH,
        width: LENGTH,
        "min-width": LENGTH,
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: [] }, // no absolute image URLs at all
    allowProtocolRelative: false,
    transformTags: {
      h4: "h3",
      h5: "h3",
      h6: "h3",
      b: "strong",
      i: "em",
      input: (tagName, attribs) =>
        attribs.type === "checkbox" ? { tagName, attribs } : { tagName: "span", attribs: {} },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !String(frame.attribs.src ?? "").startsWith(ASSET_URL_PREFIX),
  });
}
