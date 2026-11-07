/**
 * Nav item "Asistente" (/asistente) of the new shell (redesign FE §3.1, §21.1; Phase 7).
 * `resolve` returns the item, or null while it stays hidden: the full page
 * needs the server threads, so the item shows only once every `IMPLEMENTED`
 * flag of `assistant-actions.flags.ts` is true.
 */
import { SparklesIcon } from "lucide-react";

import { assistantThreadsReady } from "@/lib/assistant/threads-ready";
import type { NavItemSource } from "@/lib/ui/nav";

export const asistenteNavItem: NavItemSource = {
  key: "asistente",
  section: "items",
  order: 70,
  resolve: async () =>
    assistantThreadsReady() ? { key: "asistente", label: "Asistente", href: "/asistente", icon: SparklesIcon } : null,
};
