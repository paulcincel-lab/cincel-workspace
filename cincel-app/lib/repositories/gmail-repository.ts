/** Gmail sync state and thread cache (redesign BE §3.7, §8.6). Owner-only. */
import { gmailAccounts, gmailThreads } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export type GmailAccountRow = typeof gmailAccounts.$inferSelect;
export type GmailThreadRow = typeof gmailThreads.$inferSelect;

export const gmailThreadsRepository = ownerScoped(gmailThreads);

export async function findGmailAccount(db: OwnerDb, staffId: string): Promise<GmailAccountRow | null> {
  return notImplemented("findGmailAccount", db, staffId);
}
