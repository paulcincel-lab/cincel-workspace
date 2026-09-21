/**
 * Data access layer, one module per aggregate. Each function takes an explicit
 * actor (staff id) where it writes history, and none of them touch the
 * request: session and capability checks live in `lib/actions`.
 */
export * as staffRepository from "./staff-repository";
export * as areasRepository from "./areas-repository";
export * as taskStatusesRepository from "./task-statuses-repository";
export * as contactsRepository from "./contacts-repository";
export * as workflowsRepository from "./workflows-repository";
export * as projectsRepository from "./projects-repository";
export * as tasksRepository from "./tasks-repository";
export * as resourcesRepository from "./resources-repository";
export * as historyRepository from "./history-repository";
export * as authRepository from "./auth-repository";
