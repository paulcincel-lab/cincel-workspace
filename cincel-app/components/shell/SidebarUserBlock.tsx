"use client";

import Link from "next/link";

import type { AppShellProps } from "./AppShell";
import { AvatarMenu } from "./AvatarMenu";

export type SidebarUserBlockProps = { session: AppShellProps["session"] };

/**
 * User block in the Sidebar footer (redesign FE §3.1): avatar (opens
 * `AvatarMenu`), name linking `/ajustes/perfil` and the access role.
 */
export function SidebarUserBlock({ session }: SidebarUserBlockProps) {
  return (
    <div className="flex items-center gap-2" data-slot="sidebar-user-block">
      <AvatarMenu session={session} />
      <div className="flex min-w-0 flex-col">
        <Link href="/ajustes/perfil" className="truncate text-sm font-medium text-sidebar-foreground hover:underline">
          {session.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{session.role}</span>
      </div>
    </div>
  );
}
