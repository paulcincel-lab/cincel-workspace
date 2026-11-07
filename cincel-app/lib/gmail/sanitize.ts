/**
 * Email HTML sanitizer (redesign BE §8.6) with `sanitize-html`: allowlisted
 * tags / attributes, no scripts, remote images turned into links. The client
 * renders the result in `<iframe sandbox srcdoc>`.
 */
import { notImplemented } from "@/lib/stubs";

export function sanitizeEmailHtml(html: string): string {
  return notImplemented("sanitizeEmailHtml", html);
}
