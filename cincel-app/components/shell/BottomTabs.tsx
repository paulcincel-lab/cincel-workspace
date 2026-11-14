"use client";

import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/shadcn/sheet";
import { useNavBadges, withNavBadges } from "@/lib/shell/nav-badges";
import { badgeLabel } from "@/lib/ui/mobile-nav";
import type { NavItem, NavItemKey } from "@/lib/ui/nav";
import { cn } from "@/lib/utils";

import { useMobileShell } from "./use-mobile-shell";

/**
 * Mobile tabs under 768 px (redesign FE §3.1, §4.1; frames `Movil*`):
 * Inicio, Tareas, Mi espacio, Proyectos and "Más", a bottom `Sheet` with the
 * remaining nav items. Items come from the nav model, so an entry whose
 * `IMPLEMENTED` flag is false never reaches this component. The badges come
 * from `useQuery(qk.shell.badges())`, the same entry the Sidebar reads.
 */
export type BottomTabsProps = {
  activeKey: NavItemKey | null;
  /** First 4 items. */
  items: NavItem[];
  more: NavItem[];
};

const TAB_CLASS =
  "relative flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-[10px] px-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

const ACTIVE_CLASS = "bg-sidebar-primary font-semibold text-sidebar-primary-foreground";

const IDLE_CLASS = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

const TAB_BADGE_CLASS = "absolute top-1 left-[calc(50%+6px)] h-4 min-w-4 px-1 font-mono text-[10px]";

function BadgeCount({ count, className }: { count: number | undefined; className?: string }) {
  if (!count || count <= 0) return null;
  return (
    <Badge aria-hidden="true" data-slot="bottom-tabs-badge" className={className}>
      {badgeLabel(count)}
    </Badge>
  );
}

function srBadge(count: number | undefined): string | null {
  return count && count > 0 ? `, ${count} pendientes` : null;
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const extra = srBadge(item.badge);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={extra ? `${item.label}${extra}` : undefined}
      data-active={active ? "" : undefined}
      className={cn(TAB_CLASS, active ? ACTIVE_CLASS : IDLE_CLASS)}
    >
      <Icon aria-hidden="true" className="size-[22px]" strokeWidth={1.9} />
      <span className="max-w-full truncate">{item.label}</span>
      {extra ? <span className="sr-only">{extra}</span> : null}
      <BadgeCount count={item.badge} className={TAB_BADGE_CLASS} />
    </Link>
  );
}

export function BottomTabs({ activeKey, items: navItems, more: navMore }: BottomTabsProps) {
  const mobile = useMobileShell();
  const [moreOpen, setMoreOpen] = useState(false);
  const badges = useNavBadges([...navItems, ...navMore]);
  const items = withNavBadges(navItems, badges);
  const more = withNavBadges(navMore, badges);

  if (!mobile || (items.length === 0 && more.length === 0)) return null;

  const moreActive = activeKey !== null && more.some((item) => item.key === activeKey);
  const moreBadge = more.reduce((sum, item) => sum + (item.badge && item.badge > 0 ? item.badge : 0), 0);
  const moreExtra = srBadge(moreBadge);

  return (
    <nav
      aria-label="Navegación principal"
      data-slot="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      <ul className="flex h-[76px] items-start gap-1 px-2 pt-1.5 pb-[18px]">
        {items.map((item) => (
          <li key={item.key} className="flex min-w-0 flex-1">
            <TabLink item={item} active={item.key === activeKey} />
          </li>
        ))}
        {more.length > 0 ? (
          <li className="flex min-w-0 flex-1">
            <Sheet open={moreOpen} onOpenChange={(open) => setMoreOpen(open)}>
              <SheetTrigger
                aria-label={moreExtra ? `Más${moreExtra}` : undefined}
                data-active={moreActive ? "" : undefined}
                className={cn(TAB_CLASS, moreActive ? ACTIVE_CLASS : IDLE_CLASS)}
              >
                <Ellipsis aria-hidden="true" className="size-[22px]" strokeWidth={2.6} />
                <span>Más</span>
                {moreExtra ? <span className="sr-only">{moreExtra}</span> : null}
                <BadgeCount count={moreBadge} className={TAB_BADGE_CLASS} />
              </SheetTrigger>
              <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Más</SheetTitle>
                  <SheetDescription className="sr-only">Otras secciones de Cincel.</SheetDescription>
                </SheetHeader>
                <nav aria-label="Más secciones" className="px-4">
                  <ul className="flex flex-col gap-1">
                    {more.map((item) => {
                      const Icon = item.icon;
                      const active = item.key === activeKey;
                      const extra = srBadge(item.badge);
                      return (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            aria-label={extra ? `${item.label}${extra}` : undefined}
                            data-active={active ? "" : undefined}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                              active ? ACTIVE_CLASS : "text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                          >
                            <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {extra ? <span className="sr-only">{extra}</span> : null}
                            <BadgeCount count={item.badge} className="font-mono" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
                <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <SheetClose render={<Button type="button" variant="outline" className="h-11 w-full" />}>
                    Cerrar
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
