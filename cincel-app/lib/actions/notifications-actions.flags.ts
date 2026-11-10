/** Which actions of `notifications-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchNotificationsAction: true,
  fetchNotificationsSummaryAction: true,
  markNotificationsReadAction: true,
  fetchNotificationPreferencesAction: true,
  updateNotificationPreferencesAction: true,
} as const;
