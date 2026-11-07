"use client";

import Link from "next/link";
import { useId } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import {
  PROJECT_FLOW_SETTINGS_PAGES,
  type AjustesAdminSegment,
  type AjustesVisibleSegments,
} from "@/lib/auth/ajustes-segments";
import { cn } from "@/lib/utils";

export type AjustesNavKey =
  | "perfil" | "apariencia" | "notificaciones" | "integraciones"
  | "general" | "tema" | "horario" | "tramos" | "puestos" | "estatus" | "permisos" | "monday" | "google";

export type AjustesNavProps = {
  active: AjustesNavKey;
  isAdmin: boolean;
  /**
   * Per-segment visibility from `resolveAjustesSegments` (the same rules as the
   * segment guards). When given it decides every Organización item; without
   * it `isAdmin` shows all of them (Tramos / Puestos still only when Project
   * Flow's pages exist).
   */
  segments?: AjustesVisibleSegments;
};

type PersonalKey = Exclude<AjustesNavKey, AjustesAdminSegment>;

const PERSONAL_ITEMS: ReadonlyArray<{ key: PersonalKey; label: string }> = [
  { key: "perfil", label: "Perfil" },
  { key: "apariencia", label: "Apariencia" },
  { key: "notificaciones", label: "Notificaciones" },
  { key: "integraciones", label: "Gmail, calendario y Cutto" },
];

const ORGANIZATION_ITEMS: ReadonlyArray<{ key: AjustesAdminSegment; label: string }> = [
  { key: "general", label: "General" },
  { key: "tema", label: "Tema y estilo" },
  { key: "horario", label: "Control de horario" },
  { key: "tramos", label: "Tramos y fases" },
  { key: "puestos", label: "Puestos" },
  { key: "estatus", label: "Estatus" },
  { key: "permisos", label: "Permisos" },
  { key: "monday", label: "Importar de monday" },
  { key: "google", label: "Google" },
];

const AJUSTES_NAV_KEYS: ReadonlySet<string> = new Set<string>([
  ...PERSONAL_ITEMS.map((item) => item.key),
  ...ORGANIZATION_ITEMS.map((item) => item.key),
]);

/** The `AjustesNav` key of an `/ajustes/<segment>/…` path (Apariencia for `/ajustes`). */
export function ajustesNavKeyFromPath(pathname: string | null | undefined): AjustesNavKey {
  const segment = (pathname ?? "").split("?")[0].split("/").filter(Boolean)[1];
  return segment && AJUSTES_NAV_KEYS.has(segment) ? (segment as AjustesNavKey) : "apariencia";
}

function isSegmentVisible(key: AjustesAdminSegment, isAdmin: boolean, segments?: AjustesVisibleSegments): boolean {
  if ((key === "tramos" || key === "puestos") && !PROJECT_FLOW_SETTINGS_PAGES[key]) return false;
  return segments ? segments[key] === true : isAdmin;
}

function NavItem({ href, label, active, admin }: { href: string; label: string; active: boolean; admin?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-lg px-2.5 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted",
        )}
      >
        <span className="truncate">{label}</span>
        {admin ? <Badge variant="outline">Admin</Badge> : null}
      </Link>
    </li>
  );
}

/**
 * Ajustes sub-navigation (redesign FE §3.8, §4.8): group "Personal" for every
 * staff member and group "Organización" whose items carry an "Admin" badge and
 * are rendered only when the viewer has the capability of their segment
 * (absent from the DOM otherwise).
 */
export function AjustesNav({ active, isAdmin, segments }: AjustesNavProps) {
  const organization = ORGANIZATION_ITEMS.filter((item) => isSegmentVisible(item.key, isAdmin, segments));
  const id = useId();
  const personalId = `${id}-personal`;
  const organizationId = `${id}-organizacion`;

  return (
    <nav aria-label="Secciones de ajustes" className="flex w-full flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 id={personalId} className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
          Personal
        </h2>
        <ul aria-labelledby={personalId} className="flex flex-col gap-0.5">
          {PERSONAL_ITEMS.map((item) => (
            <NavItem key={item.key} href={`/ajustes/${item.key}`} label={item.label} active={active === item.key} />
          ))}
        </ul>
      </div>
      {organization.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <h2 id={organizationId} className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
            Organización
          </h2>
          <ul aria-labelledby={organizationId} className="flex flex-col gap-0.5">
            {organization.map((item) => (
              <NavItem
                key={item.key}
                href={`/ajustes/${item.key}`}
                label={item.label}
                active={active === item.key}
                admin
              />
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
