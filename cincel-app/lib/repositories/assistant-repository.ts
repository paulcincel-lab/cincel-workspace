/** Assistant threads, messages and the approval audit (redesign BE §3.10, §8.10). Owner-only. */
import { assistantThreads } from "@/lib/db/schema";
import { ownerScoped } from "@/lib/repositories/owner-scoped";

export type AssistantThreadRow = typeof assistantThreads.$inferSelect;

export const assistantThreadsRepository = ownerScoped(assistantThreads);
