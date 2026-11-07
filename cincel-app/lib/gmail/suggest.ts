/**
 * Gmail → project suggestion (redesign BE §8.6): a normalized project name
 * (≥ 4 chars) as a whole word in the subject, or in the snippet when ≥ 8
 * chars; ties → most recently updated project. Never auto-links. Pure.
 */
import { notImplemented } from "@/lib/stubs";

export function suggestProjectId(
  thread: { subject: string; snippet: string },
  projects: { id: string; name: string; updatedAt: string }[],
): string | null {
  return notImplemented("suggestProjectId", thread, projects);
}
