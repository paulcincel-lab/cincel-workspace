"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/shadcn/sidebar";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { useNavBadges, withNavBadges } from "@/lib/shell/nav-badges";
import { useNavPrefetch, type NavPrefetchHandlers } from "@/lib/shell/nav-prefetch";
import type { SidebarSlotNodes } from "@/lib/shell/sidebar-slots";
import { isSearchVisible, isTimeClockVisible } from "@/lib/shell/visibility";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import type { TodayStatus } from "@/lib/types/redesign";
import type { NavItem, NavItemKey, NavModel } from "@/lib/ui/nav";

import type { AppShellProps } from "./AppShell";
import { AvatarMenu } from "./AvatarMenu";
import { SidebarProjectsEntry } from "./SidebarProjects";

/**
 * Sidebar of the new shell (redesign FE §3.1, §4.1; frame `Sidebar`): logo,
 * search button, time clock slot (Jornada card), the nav items with their
 * count badges (mono, primary tint), the "Etapas" list, Ajustes and
 * the user block (avatar menu with the photo or initials, name and role).
 * Built on the shadcn `sidebar` primitives; the active item uses the
 * `sidebar-primary` tokens.
 *
 * The badges come from `useQuery(qk.shell.badges())` (hidden at 0); the
 * search button opens the palette through `useShellUi`; hovering or focusing
 * Inicio, Tareas or Mi espacio prefetches that page's data (debounced).
 */
export type SidebarProps = {
  nav: NavModel;
  activeKey: NavItemKey | null;
  session: AppShellProps["session"];
  today: TodayStatus | null;
  /** Registry slots (`lib/shell/sidebar-slots/*`). */
  slots?: SidebarSlotNodes;
};

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function NavEntry({
  item,
  active,
  badge,
  prefetch,
}: {
  item: NavItem;
  active: boolean;
  badge?: ReactNode;
  prefetch?: NavPrefetchHandlers;
}) {
  const Icon = item.icon;
  const count = item.badge;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="h-9"
        isActive={active}
        // Main pages are prefetched in full, so the click renders without waiting on the server.
        render={<Link href={item.href} prefetch aria-current={active ? "page" : undefined} {...prefetch} />}
      >
        <Icon aria-hidden="true" strokeWidth={1.8} />
        <span>{item.label}</span>
        {badge === undefined && count ? <span className="sr-only">{`, ${count} pendientes`}</span> : null}
      </SidebarMenuButton>
      {badge !== undefined ? (
        <SidebarMenuBadge>{badge}</SidebarMenuBadge>
      ) : count ? (
        <SidebarMenuBadge aria-hidden="true">
          <Badge variant="count">{badgeText(count)}</Badge>
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

export function Sidebar({ nav, activeKey, session, today, slots = {} }: SidebarProps) {
  const generalSettings = useGeneralSettings();
  const openSearch = useShellUi((s) => s.openSearch);
  const badges = useNavBadges([...nav.items, ...nav.footer]);
  const prefetchFor = useNavPrefetch();
  const items = withNavBadges(nav.items, badges);
  const footer = withNavBadges(nav.footer, badges);
  const systemName = generalSettings.system.systemName.trim() || "Cincel Workspace";
  const showSearch = isSearchVisible();
  const showClock = isTimeClockVisible(today) && slots["time-clock"] !== undefined;
  const profileHref = footer.some((item) => item.key === "ajustes") ? "/ajustes/perfil" : null;

  return (
    <SidebarPrimitive collapsible="none" className="sticky top-0 hidden h-svh border-r border-sidebar-border md:flex">
      <SidebarHeader className="gap-4 px-3.5 pt-5">
        <div className="flex items-center gap-2.5 px-1.5">
          <span
            aria-hidden="true"
            className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
          >
            C
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold tracking-[0.14em]">CINCEL</span>
            <span className="truncate text-xs text-sidebar-foreground/80">{systemName}</span>
          </span>
        </div>
        {showSearch ? (
          <Button type="button" variant="outline" className="h-9 w-full justify-start gap-2" onClick={openSearch}>
            <Search aria-hidden="true" />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="font-mono text-[11px]">⌘K</kbd>
          </Button>
        ) : null}
        {showClock ? <div data-slot="sidebar-time-clock">{slots["time-clock"]}</div> : null}
      </SidebarHeader>

      <SidebarContent className="px-1.5">
        <nav aria-label="Principal">
          {items.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) =>
                    item.key === "proyectos" ? (
                      <SidebarProjectsEntry
                        key={item.key}
                        item={item}
                        active={item.key === activeKey}
                        prefetch={prefetchFor(item.key)}
                      />
                    ) : (
                    <NavEntry
                      key={item.key}
                      item={item}
                      active={item.key === activeKey}
                      badge={item.key === "mi-espacio" ? slots["bandeja-badge"] : undefined}
                      prefetch={prefetchFor(item.key)}
                    />
                    ),
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}

          {nav.etapas.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupLabel id="sidebar-etapas" className="h-auto px-2.5 pb-1 text-muted-foreground">
                Etapas
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu aria-labelledby="sidebar-etapas">
                  {nav.etapas.map((etapa) => (
                    <SidebarMenuItem key={etapa.key}>
                      <SidebarMenuButton className="h-8 gap-2.5 text-[13.5px]" render={<Link href={etapa.href} />}>
                        <span
                          aria-hidden="true"
                          className="size-[9px] shrink-0 rounded-[3px]"
                          style={{ background: etapa.colorVar }}
                        />
                        <span>{etapa.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border px-3.5 pt-3 pb-5">
        {footer.length > 0 ? (
          <nav aria-label="Ajustes">
            <SidebarMenu className="gap-0.5">
              {footer.map((item) => (
                <NavEntry key={item.key} item={item} active={item.key === activeKey} />
              ))}
            </SidebarMenu>
          </nav>
        ) : null}
        <div className="flex items-center gap-2.5 px-2.5 py-2" data-slot="sidebar-user">
          <AvatarMenu session={session} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            {profileHref ? (
              <Link href={profileHref} className="truncate text-[13px] font-medium hover:underline">
                {session.name}
              </Link>
            ) : (
              <span className="truncate text-[13px] font-medium">{session.name}</span>
            )}
            {session.role ? <span className="truncate text-xs text-muted-foreground">{session.role}</span> : null}
          </span>
        </div>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
