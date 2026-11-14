/**
 * Mapping of a GitHub issue to a solicitud status (Soporte S3, #1117). Pure and
 * client-safe: the cron job and its tests share it.
 */
import type { GithubIssueState } from "@/lib/github/client";
import type { TicketStatus } from "@/lib/types/soporte";

/** Public message of a solicitud closed as "not planned" on GitHub. */
export const DISCARDED_MESSAGE = "Se descartó en la revisión técnica.";

/** Label that marks an issue as being worked on. */
export const IN_PROGRESS_LABEL = "en progreso";

export type SyncedChange = { status: TicketStatus; message?: string };

const CLOSED: readonly TicketStatus[] = ["resuelto", "descartado"];

/**
 * The status a solicitud should have given its issue, or null for no change.
 * Never moves backwards: an open issue only lifts a ticket to `en_progreso`
 * (label or linked open PR), except when a closed ticket's issue was reopened.
 */
export function mapIssueToChange(
  current: TicketStatus,
  issue: Pick<GithubIssueState, "state" | "stateReason" | "labels" | "hasOpenPullRequest">
): SyncedChange | null {
  if (issue.state === "closed") {
    if (issue.stateReason === "not_planned") {
      return current === "descartado" ? null : { status: "descartado", message: DISCARDED_MESSAGE };
    }
    return current === "resuelto" ? null : { status: "resuelto" };
  }

  const inProgress =
    issue.hasOpenPullRequest || issue.labels.some((l) => l.trim().toLowerCase() === IN_PROGRESS_LABEL);
  if (CLOSED.includes(current)) {
    // The issue was reopened.
    return { status: inProgress ? "en_progreso" : "planeado" };
  }
  if (inProgress && current !== "en_progreso") return { status: "en_progreso" };
  return null;
}
