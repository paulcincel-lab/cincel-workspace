/**
 * HTML → plain text for monday updates and notes
 * (docs/specs/monday-migration/backend.md §2).
 *
 * Two passes:
 *   1. `sanitize-html` keeps only the allowlist `p, br, b, i, ul, ol, li, a`
 *      (links keep `href` with http, https or mailto). Every other tag is
 *      removed; its text is kept, except for script, style and similar tags,
 *      whose content is dropped.
 *   2. The sanitized markup is turned into text: paragraphs are separated by
 *      a blank line, `br` is a line break, list items become "- item" or
 *      "1. item", bold and italic keep only their text, and links are kept as
 *      "text (url)".
 *
 * No `server-only`: the CLI runs it under tsx.
 */
import sanitizeHtml from "sanitize-html";

export const ALLOWED_TAGS = ["p", "br", "b", "i", "ul", "ol", "li", "a"];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (match, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1] === "x" || name[1] === "X"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITIES[name.toLowerCase()] ?? match;
    },
  );
}

/** Collapses HTML whitespace (spaces, tabs, newlines, nbsp) to single spaces. */
function collapse(text: string): string {
  return text.replace(/[ \t\r\n\f\u00a0]+/g, " ");
}

interface ListState {
  ordered: boolean;
  index: number;
}

interface LinkState {
  href: string | null;
  start: number;
}

const TOKEN = /<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi;

function markupToText(markup: string): string {
  let out = "";
  const lists: ListState[] = [];
  const links: LinkState[] = [];

  const newline = () => {
    out = out.replace(/ +$/, "");
    if (out !== "" && !out.endsWith("\n")) out += "\n";
  };
  const blankLine = () => {
    newline();
    if (out !== "" && !out.endsWith("\n\n")) out += "\n";
  };

  for (const match of markup.matchAll(TOKEN)) {
    const [, closing, rawTag, attrs, text] = match;
    if (text !== undefined) {
      let chunk = collapse(decodeEntities(text));
      if (out === "" || out.endsWith("\n") || out.endsWith(" ")) {
        chunk = chunk.replace(/^ /, "");
      }
      out += chunk;
      continue;
    }
    const tag = rawTag.toLowerCase();
    const isClosing = closing === "/";
    switch (tag) {
      case "p":
        if (lists.length === 0) blankLine();
        else newline();
        break;
      case "br":
        out = out.replace(/ +$/, "") + "\n";
        break;
      case "ul":
      case "ol":
        if (isClosing) lists.pop();
        else lists.push({ ordered: tag === "ol", index: 0 });
        if (lists.length === 0) blankLine();
        else newline();
        break;
      case "li": {
        newline();
        if (isClosing) break;
        const list = lists[lists.length - 1];
        const depth = Math.max(lists.length - 1, 0);
        let marker = "- ";
        if (list?.ordered) {
          list.index += 1;
          marker = `${list.index}. `;
        }
        out += "  ".repeat(depth) + marker;
        break;
      }
      case "a": {
        if (!isClosing) {
          const href = /href="([^"]*)"/i.exec(attrs)?.[1];
          links.push({
            href: href ? decodeEntities(href) : null,
            start: out.length,
          });
          break;
        }
        const link = links.pop();
        if (!link?.href) break;
        const label = out.slice(link.start).trim();
        const url = link.href.replace(/^mailto:/i, "");
        if (label === "") {
          out = out.slice(0, link.start) + url;
        } else if (label !== link.href && label !== url) {
          out = out.replace(/ +$/, "") + ` (${link.href})`;
        }
        break;
      }
      default:
        // b, i: only their text is kept.
        break;
    }
  }

  return out
    .split("\n")
    .map((line) => line.replace(/ +$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Returns monday HTML as safe plain text. Empty, null or whitespace-only
 * input gives "".
 */
export function sanitizeMondayHtml(html: string | null | undefined): string {
  if (!html || html.trim() === "") return "";
  return markupToText(sanitizeHtml(html, SANITIZE_OPTIONS));
}
