import type { TaskLinkKind } from "@/lib/types/core";

export const TASK_LINK_KIND_LABEL: Record<TaskLinkKind, string> = {
  interno: "Interno",
  cliente: "Cliente",
};

/**
 * Only http(s) links are accepted: the url ends up in an `href`, and
 * `javascript:` (or `data:`) must never get there. Returns the normalized
 * URL, or null when it isn't a valid web link.
 */
export function normalizeTaskLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
