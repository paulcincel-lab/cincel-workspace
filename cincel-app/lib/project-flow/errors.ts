/**
 * Error codes of the project flow actions (FE §9, BE §7). Actions throw
 * `Error("CODE")` or `Error("CODE: detail")`; the UI maps the code to Spanish
 * copy. The monday actions keep `{ ok: false, error: CODE }` instead.
 */
export const FLOW_ERROR = {
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  EMPTY: "EMPTY",
  NAME_TAKEN: "NAME_TAKEN",
  PHASE_MISMATCH: "PHASE_MISMATCH",
  SPACE_MISMATCH: "SPACE_MISMATCH",
  ADMIN_TASK: "ADMIN_TASK",
  NO_PHASES: "NO_PHASES",
  NOT_STARTED: "NOT_STARTED",
  TOUCHED: "TOUCHED",
  IN_USE: "IN_USE",
  INVALID: "INVALID",
  ASSIGNEE_NOT_ADMIN: "ASSIGNEE_NOT_ADMIN",
} as const;
export type FlowErrorCode = (typeof FLOW_ERROR)[keyof typeof FLOW_ERROR];

/** `updateTaskAction` changing a task's existing etapa without being admin (#1022). */
export const TASK_ETAPA_CHANGE_FORBIDDEN = "FORBIDDEN: task etapa change";

/** `{ ok: false, error }` codes of the new monday actions (FE §7.8). */
export const MONDAY_FLOW_ERROR = {
  STATUS_NOT_FOUND: "STATUS_NOT_FOUND",
  NOT_IMPORTED: "NOT_IMPORTED",
  EXPORT_MISSING: "EXPORT_MISSING",
} as const;
export type MondayFlowErrorCode = (typeof MONDAY_FLOW_ERROR)[keyof typeof MONDAY_FLOW_ERROR];

/** New monday plan issue codes (BE §10.4); added to `PlanIssueCode` when the importer switches (Phase 4). */
export const FLOW_PLAN_WARNING_CODES = ["PHASE_UNRESOLVED", "CLIENT_MISSING", "ADMIN_ASSIGNEE_CLEARED"] as const;
export const FLOW_PLAN_BLOCKING_CODES = ["ETAPA_MISSING", "PROJECT_NAME_TAKEN"] as const;
export type FlowPlanIssueCode =
  | (typeof FLOW_PLAN_WARNING_CODES)[number]
  | (typeof FLOW_PLAN_BLOCKING_CODES)[number];

const ALL_CODES = new Set<string>([...Object.values(FLOW_ERROR), ...Object.values(MONDAY_FLOW_ERROR)]);

/** `Error("CODE")` or `Error("CODE: detail")`. */
export function flowError(code: FlowErrorCode, detail?: string): Error {
  return new Error(detail ? `${code}: ${detail}` : code);
}

/** The code at the start of an action error's message, or null when it isn't one of ours. */
export function flowErrorCode(err: unknown): FlowErrorCode | MondayFlowErrorCode | null {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const code = message.split(":")[0].trim();
  return ALL_CODES.has(code) ? (code as FlowErrorCode | MondayFlowErrorCode) : null;
}
