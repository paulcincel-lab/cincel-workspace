import type { ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/shadcn/sidebar";
import type { TodayStatus } from "@/lib/types/redesign";
import type { NavItem, NavItemKey, NavModel, NavSession } from "@/lib/ui/nav";
import { NAV_ICONS, NAV_LABELS } from "@/lib/ui/nav-client";

export const ADMIN_SESSION: NavSession = {
  staffId: "00000000-0000-4000-8000-000000000001",
  name: "Alejandro Riofrio",
  role: "Administrador",
  isAdmin: true,
  photoUrl: null,
};

export const STAFF_SESSION: NavSession = {
  staffId: "00000000-0000-4000-8000-000000000002",
  name: "Paula Lara",
  role: "Diseñadora",
  isAdmin: false,
  photoUrl: null,
};

const HREFS: Record<NavItemKey, string> = {
  inicio: "/inicio",
  "mi-espacio": "/mi-espacio",
  tareas: "/tareas",
  proyectos: "/proyectos",
  personas: "/personas",
  biblioteca: "/biblioteca",
  asistente: "/asistente",
  ajustes: "/ajustes",
};

export function navItem(key: NavItemKey, badge?: number): NavItem {
  const item: NavItem = { key, label: NAV_LABELS[key], href: HREFS[key], icon: NAV_ICONS[key] };
  return badge === undefined ? item : { ...item, badge };
}

/** Every item of frame `Sidebar`, with the badges of the frame. */
export const FULL_NAV: NavModel = {
  items: [
    navItem("inicio"),
    navItem("tareas", 31),
    navItem("proyectos"),
    navItem("personas"),
    navItem("mi-espacio", 5),
    navItem("biblioteca"),
    navItem("asistente"),
  ],
  tramos: [
    { key: "presale", name: "Presale", colorVar: "var(--chart-1)", href: "/tareas?tramo=presale" },
    { key: "diseno", name: "Diseño", colorVar: "var(--chart-2)", href: "/tareas?tramo=diseno" },
    { key: "construccion", name: "Construcción", colorVar: "var(--chart-3)", href: "/tareas?tramo=construccion" },
  ],
  footer: [navItem("ajustes")],
};

export const EMPTY_NAV: NavModel = { items: [], tramos: [], footer: [] };

export const TODAY_ON: TodayStatus = {
  state: "on",
  startedAt: "2026-11-06T15:02:00.000Z",
  workedSeconds: 18_728,
  required: false,
  promptAtLogin: true,
  enabled: true,
  requiredFrom: "2027-01-04",
  hoursPerDay: 8,
};

export function WithSidebarProvider({ children }: { children: ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}
