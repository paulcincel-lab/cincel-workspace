/**
 * Cutto deep links (redesign BE §11.2, FE §4.9). Client-safe: no secrets and
 * no server imports, so any client component may use it.
 *
 * Cutto (cutto.cloudketer.dev) is a separate product; Cincel only links to it.
 * Links open in a new tab with `rel="noopener"` and the labels in
 * `CUTTO_LINK_LABELS`. Every helper returns `null` when it cannot build a
 * usable link (empty id or email, or a base URL that is not http(s)), so
 * callers hide the link instead of rendering a broken one.
 */

/** Used when `NEXT_PUBLIC_CUTTO_BASE_URL` is unset or blank (`.env.example`). */
export const DEFAULT_CUTTO_BASE_URL = "https://cutto.cloudketer.dev";

/** Spanish link labels (FE §4.9). */
export const CUTTO_LINK_LABELS = {
  open: "Abrir en Cutto",
  chat: "Abrir chat en Cutto",
} as const;

/** Anchor attributes for every Cutto link (new tab, no opener). */
export const CUTTO_LINK_TARGET = { target: "_blank", rel: "noopener" } as const;

/**
 * The Cutto base URL without a trailing slash, or `null` when the configured
 * value is not an absolute http(s) URL. Read on every call (the literal
 * `process.env.NEXT_PUBLIC_*` access is inlined into the client bundle).
 */
export function cuttoBaseUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_CUTTO_BASE_URL ?? "").trim();
  const value = raw === "" ? DEFAULT_CUTTO_BASE_URL : raw;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return value.replace(/\/+$/, "");
}

/** `<base><prefix><encoded part>`, or `null` when the part is blank or the base URL is unusable. */
function link(prefix: string, part: string | null | undefined): string | null {
  const trimmed = (part ?? "").trim();
  if (trimmed === "") return null;
  const base = cuttoBaseUrl();
  if (base === null) return null;
  return `${base}${prefix}${encodeURIComponent(trimmed)}`;
}

/** The project's Cutto channel. */
export function channelUrl(projectId: string | null | undefined): string | null {
  return link("/c/project-", projectId);
}

/** A Cutto meeting (only for events that carry a stored Cutto meeting id). */
export function meetingUrl(meetingId: string | null | undefined): string | null {
  return link("/m/", meetingId);
}

/** A direct chat with a person, by the email of the staff DTO the caller already loads. */
export function personChatUrl(email: string | null | undefined): string | null {
  return link("/dm/", email?.trim().toLowerCase());
}

export const cuttoLinks = { channelUrl, meetingUrl, personChatUrl } as const;
