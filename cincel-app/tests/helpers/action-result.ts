import { unwrapActionResult } from "@/lib/actions/action-result";
import type { ActionResult } from "@/lib/types/schedule";
import { isGoogleManagedRefusal } from "@/lib/types/workspace-access";

/**
 * The user-facing mutations of the shared action files that return
 * `ActionResult` (Query Migration 1b). Their business tests keep asserting
 * the thrown codes through `unwrapActions`; `tests/unit/actions/*-results`
 * assert the result shape itself.
 */
export const ACTION_RESULT_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  "tasks-actions": [
    "createUserTaskAction",
    "createSubtaskAction",
    "updateTaskAction",
    "setTaskStatusAction",
    "assignTaskAction",
    "deleteTaskAction",
    "addChecklistItemAction",
    "updateChecklistItemAction",
    "removeChecklistItemAction",
    "reorderChecklistAction",
    "addTaskCommentAction",
    "addTaskAttachmentAction",
    "setTaskCustomStatusAction",
    "addTaskDependencyAction",
    "removeTaskDependencyAction",
  ],
  "projects-actions": [
    "createProjectAction",
    "updateProjectAction",
    "setProjectMembersAction",
    "setProjectContactsAction",
    "addProjectLinkAction",
    "removeProjectLinkAction",
    "addProjectCommentAction",
    "setProjectCurrentTramoAction",
    "createProjectSpaceAction",
    "renameProjectSpaceAction",
    "reorderProjectSpacesAction",
    "deleteProjectSpaceAction",
  ],
  "staff-actions": [
    "createStaffAction",
    "updateStaffAction",
    "upsertStaffProfileAction",
    "setStaffCredentialAction",
    "setStaffPositionsAction",
  ],
  "time-tracking-actions": [
    "saveTimeTrackingSettingsAction",
    "clockInAction",
    "pauseWorkAction",
    "resumeWorkAction",
    "clockOutAction",
  ],
  "my-space-actions": [
    "createNoteAction",
    "updateNoteAction",
    "archiveNoteAction",
    "restoreNoteAction",
    "createChecklistAction",
    "addChecklistItemAction",
    "toggleChecklistItemAction",
    "createReminderAction",
  ],
  "notifications-actions": ["markNotificationsReadAction", "updateNotificationPreferencesAction"],
  "gmail-actions": [
    "markGmailThreadReadAction",
    "linkGmailThreadToProjectAction",
    "createGmailDraftAction",
    "sendGmailDraftAction",
    "createTaskFromGmailThreadAction",
    "syncGmailAction",
    "disconnectGmailAction",
  ],
  "profile-photo-actions": ["removeMyPhotoAction"],
  "task-statuses-actions": [
    "createTaskStatusAction",
    "updateTaskStatusAction",
    "deleteTaskStatusAction",
    "reorderTaskStatusesAction",
  ],
  "positions-actions": [
    "createPositionAction",
    "updatePositionAction",
    "deletePositionAction",
    "setPositionPhasesAction",
    "reorderPositionsAction",
  ],
  "workflows-actions": [
    "createTemplateAction",
    "updateTemplateAction",
    "deactivateTemplateAction",
    "reorderTemplatesAction",
    "createWorkflowPhaseAction",
    "updateWorkflowPhaseAction",
    "reorderWorkflowPhasesAction",
    "setWorkflowAutoStartAction",
    "reorderWorkflowsAction",
  ],
  "preferences-actions": ["updateMyPreferencesAction"],
  "tramo-start-actions": ["startTramoAction", "undoStartTramoAction"],
  "vacations-actions": [
    "requestVacationAction",
    "cancelVacationRequestAction",
    "decideVacationAction",
    "saveVacationSettingsAction",
  ],
  "resources-actions": ["createResourceLinkAction", "updateResourceLinkAction", "deleteResourceLinkAction"],
};

const CONVERTED = new Set(Object.values(ACTION_RESULT_MUTATIONS).flat());

type Unwrapped<F> = F extends (...args: infer A) => Promise<infer R>
  ? [R] extends [ActionResult<infer T>]
    ? (...args: A) => Promise<T>
    : F
  : F;

export type UnwrappedActions<M> = { [K in keyof M]: Unwrapped<M[K]> };

/**
 * The module with each `ActionResult` mutation unwrapped: it resolves to the
 * data and rejects with `new Error(error)`, as the action threw before. A
 * Google-managed refusal resolves unchanged, as it did before.
 */
export function unwrapActions<M extends object>(mod: M): UnwrappedActions<M> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(mod)) {
    out[name] =
      typeof value === "function" && CONVERTED.has(name)
        ? async (...args: unknown[]) => {
            const result = (await value(...args)) as ActionResult<unknown>;
            return isGoogleManagedRefusal(result) ? result : unwrapActionResult(result);
          }
        : value;
  }
  return out as UnwrappedActions<M>;
}
