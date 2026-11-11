/** The `tasks` part of a Mi espacio page-data fixture with no task (#1051): an empty summary and no list. */
import { EMPTY_MY_TASKS_SUMMARY, MY_TASKS_ALL } from "@/lib/my-space/my-tasks-summary";
import type { MiEspacioTasksSeed } from "@/lib/types/mi-espacio";

export const NO_TASKS_SEED: MiEspacioTasksSeed = { input: MY_TASKS_ALL, summary: EMPTY_MY_TASKS_SUMMARY, lists: [] };

/** `getMyTasksPage` stand-in: an empty page. */
export const emptyTasksPage = async () => ({ rows: [], nextCursor: null, total: 0 });
