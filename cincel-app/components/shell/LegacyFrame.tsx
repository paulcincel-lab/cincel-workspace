"use client";

import type { ReactNode } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { useInNewShell } from "@/components/shell/shell-context";

/**
 * Flag-off branch of a restyled page (redesign FE §2.3): mounts the legacy
 * `Sidebar` + `Header` around the page, with the same frame the legacy pages
 * use. Inside the new `AppShell` it renders the page bare, so a page never
 * shows two sidebars. Deleted in Phase 9.
 */
export type LegacyFrameProps = { children: ReactNode };

export function LegacyFrame({ children }: LegacyFrameProps) {
  const inNewShell = useInNewShell();
  if (inNewShell) return <>{children}</>;

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="min-w-0 flex-1 overflow-y-auto p-10">
        <Header />
        {children}
      </section>
    </main>
  );
}
