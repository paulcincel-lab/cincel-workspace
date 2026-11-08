"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";

import { NewTaskDialogHost } from "@/components/tareas/NewTaskDialogHost";
import { SidebarInset, SidebarProvider } from "@/components/ui/shadcn/sidebar";
import type { SidebarSlotNodes } from "@/lib/shell/sidebar-slots";
import { pageContentClass } from "@/lib/shell/page-padding";
import { isSearchVisible } from "@/lib/shell/visibility";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import type { TodayStatus } from "@/lib/types/redesign";
import { BOTTOM_TABS_CONTENT_CLASS } from "@/lib/ui/mobile-nav";
import type { NavItem, NavItemKey, NavModel } from "@/lib/ui/nav";
import { activeNavKey, withNavIcons, type ClientNavModel } from "@/lib/ui/nav-client";

import type { AppShellProps } from "./AppShell";
import { BottomTabs } from "./BottomTabs";
import { CommandPalette } from "./CommandPalette";
import { MobileTopBar } from "./MobileTopBar";
import { OfflineBanner } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import { UiStoresHydrator } from "./UiStoresHydrator";

/** Client part of `AppShell`: active item and the mobile/desktop chrome; the palette opens through `useShellUi`. */
export type AppShellClientProps = {
  children: ReactNode;
  nav: ClientNavModel;
  session: AppShellProps["session"];
  today: TodayStatus | null;
  hideAssistant?: boolean;
  slots?: SidebarSlotNodes;
};

/** Mobile tabs, in order (FE §3.1); everything else goes under "Más". */
const BOTTOM_TAB_KEYS: readonly NavItemKey[] = ["inicio", "tareas", "mi-espacio", "proyectos"];

/** Splits the nav model into the four mobile tabs and the "Más" sheet. */
export function bottomTabsOf(nav: NavModel): { items: NavItem[]; more: NavItem[] } {
  const all = [...nav.items, ...nav.footer];
  const items = BOTTOM_TAB_KEYS.flatMap((key) => all.filter((item) => item.key === key));
  const more = all.filter((item) => !BOTTOM_TAB_KEYS.includes(item.key));
  return { items, more };
}

const SIDEBAR_STYLE = { "--sidebar-width": "248px" } as CSSProperties;

export function AppShellClient({ children, nav: clientNav, session, today, slots }: AppShellClientProps) {
  const pathname = usePathname();
  const nav = useMemo(() => withNavIcons(clientNav), [clientNav]);
  const activeKey = activeNavKey(pathname, nav);
  const tabs = useMemo(() => bottomTabsOf(nav), [nav]);
  const showSearch = isSearchVisible();
  const closeSearch = useShellUi((s) => s.closeSearch);

  // A navigation closes the palette (a result click already does).
  useEffect(() => {
    closeSearch();
  }, [pathname, closeSearch]);

  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <Sidebar
        nav={nav}
        activeKey={activeKey}
        session={session}
        today={today}
        slots={slots}
      />
      <SidebarInset id="contenido" className="min-w-0">
        <MobileTopBar session={session} today={today} />
        <div className={`flex flex-1 flex-col ${BOTTOM_TABS_CONTENT_CLASS}`}>
          <div data-slot="page-content" className={pageContentClass(pathname)}>
            <OfflineBanner />
            {children}
          </div>
        </div>
      </SidebarInset>
      <BottomTabs activeKey={activeKey} items={tabs.items} more={tabs.more} />
      {showSearch ? <CommandPalette /> : null}
      <NewTaskDialogHost />
      <UiStoresHydrator />
    </SidebarProvider>
  );
}
