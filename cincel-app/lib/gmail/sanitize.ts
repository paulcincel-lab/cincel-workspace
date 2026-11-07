/**
 * Email HTML sanitizer (redesign BE §8.6) with `sanitize-html`: allowlisted
 * tags / attributes, no scripts, remote images turned into links. The client
 * renders the result in `<iframe sandbox srcdoc>`.
 *
 * Allowlist (reviewed):
 * - tags: text formatting, lists, quotes, headings, tables, links, images;
 *   no `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`,
 *   `meta`, `link`, `base`, `svg` or `math` (dropped; `script`/`style`
 *   with their content);
 * - attributes: no `on*` handlers, no `id`/`class` (no hooks into the host
 *   page's CSS), only the layout attributes old email clients use;
 * - `style`: only colors, text and box properties with plain values; no
 *   `url()`, `expression()`, `position`, `z-index` or `behavior`;
 * - URLs: `http`, `https`, `mailto`, `tel` on links; images keep only
 *   `data:image/(png|jpeg|gif|webp)`; a remote image (`http(s)`) becomes a
 *   link to it so nothing is loaded (and no tracking pixel fires) on open;
 *   `cid:` and other sources are dropped, leaving their alt text;
 * - every link opens in a new tab with `rel="noopener noreferrer"`.
 */
import sanitizeHtml from "sanitize-html";

const TEXT_TAGS = [
  "a", "abbr", "b", "bdi", "bdo", "blockquote", "br", "center", "cite", "code", "dd", "del", "dfn", "div", "dl",
  "dt", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "ins", "kbd", "li", "mark", "ol", "p", "pre",
  "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "u", "ul", "var", "wbr",
];
const TABLE_TAGS = ["table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "td", "th"];

const LAYOUT_ATTRIBUTES = ["align", "valign", "width", "height", "bgcolor", "dir", "title", "style"];

/** Plain CSS values only: no functions other than rgb/rgba/hsl/hsla, no `url`, no `expression`. */
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/]+\))$/i;
const LENGTH = /^-?[\d.]+(px|em|rem|%|pt)?$/i;
const LENGTHS = /^(-?[\d.]+(px|em|rem|%|pt)?|auto)(\s+(-?[\d.]+(px|em|rem|%|pt)?|auto)){0,3}$/i;
const KEYWORD = /^[a-z-]+$/i;
const FONT_FAMILY = /^[a-z0-9\s,'"-]+$/i;
const BORDER = /^[a-z0-9#.%\s(),-]+$/i;

const ALLOWED_STYLES: Record<string, RegExp[]> = {
  color: [COLOR],
  "background-color": [COLOR],
  "font-family": [FONT_FAMILY],
  "font-size": [LENGTH, KEYWORD],
  "font-style": [KEYWORD],
  "font-weight": [/^(\d{3}|[a-z]+)$/i],
  "line-height": [LENGTH, /^normal$/i],
  "letter-spacing": [LENGTH, /^normal$/i],
  "text-align": [/^(left|right|center|justify|start|end)$/i],
  "text-decoration": [/^[a-z\s-]+$/i],
  "text-transform": [KEYWORD],
  "vertical-align": [KEYWORD, LENGTH],
  "white-space": [KEYWORD],
  width: [LENGTH, /^auto$/i],
  "max-width": [LENGTH],
  height: [LENGTH, /^auto$/i],
  margin: [LENGTHS],
  "margin-top": [LENGTH, /^auto$/i],
  "margin-right": [LENGTH, /^auto$/i],
  "margin-bottom": [LENGTH, /^auto$/i],
  "margin-left": [LENGTH, /^auto$/i],
  padding: [LENGTHS],
  "padding-top": [LENGTH],
  "padding-right": [LENGTH],
  "padding-bottom": [LENGTH],
  "padding-left": [LENGTH],
  border: [BORDER],
  "border-top": [BORDER],
  "border-right": [BORDER],
  "border-bottom": [BORDER],
  "border-left": [BORDER],
  "border-color": [BORDER],
  "border-collapse": [KEYWORD],
  "border-radius": [LENGTHS],
};

const INLINE_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const REMOTE = /^https?:\/\//i;

/** Text of the link that replaces a remote image. */
export const REMOTE_IMAGE_LINK_TEXT = "Imagen externa";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...TEXT_TAGS, ...TABLE_TAGS, "img"],
  disallowedTagsMode: "discard",
  // Dropped together with their content.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head", "template"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "title"],
    font: ["color", "face", "size"],
    table: [...LAYOUT_ATTRIBUTES, "border", "cellpadding", "cellspacing"],
    td: [...LAYOUT_ATTRIBUTES, "colspan", "rowspan"],
    th: [...LAYOUT_ATTRIBUTES, "colspan", "rowspan", "scope"],
    col: [...LAYOUT_ATTRIBUTES, "span"],
    colgroup: [...LAYOUT_ATTRIBUTES, "span"],
    ol: ["start", "type"],
    "*": LAYOUT_ATTRIBUTES,
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["data"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowProtocolRelative: false,
  allowedStyles: { "*": ALLOWED_STYLES },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
    }),
    img: (tagName, attribs): sanitizeHtml.Tag => {
      const src = (attribs.src ?? "").trim();
      if (REMOTE.test(src)) {
        return {
          tagName: "a",
          attribs: { href: src, target: "_blank", rel: "noopener noreferrer" },
          text: attribs.alt?.trim() || REMOTE_IMAGE_LINK_TEXT,
        };
      }
      if (INLINE_IMAGE.test(src)) return { tagName, attribs };
      // `cid:` (inline attachment) or anything else: keep only the alt text.
      return { tagName: "span", attribs: {}, text: attribs.alt?.trim() ?? "" };
    },
  },
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
