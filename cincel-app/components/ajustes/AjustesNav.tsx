"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  PROJECT_FLOW_SETTINGS_PAGES,
  type AjustesAdminSegment,
  type AjustesVisibleSegments,
} from "@/lib/auth/ajustes-segments";
import { cn } from "@/lib/utils";

export type AjustesNavKey =
  | "perfil" | "apariencia" | "notificaciones" | "integraciones"
  | "general" | "tema" | "horario" | "tramos" | "puestos" | "estatus" | "permisos" | "monday" | "google" | "eliminados";

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
  { key: "eliminados", label: "Proyectos eliminados" },
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

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center rounded-[10px] px-2.5 py-[7px] text-[13.5px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-secondary font-medium text-secondary-foreground" : "text-sidebar-foreground hover:bg-muted",
        )}
      >
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

/** Group label of the nav (Geist Mono 11 px, tracking .08em, uppercase). */
const GROUP_LABEL_CLASS = "px-2.5 pb-1.5 font-mono text-[11px] font-medium tracking-[.08em] text-muted-foreground uppercase";

export const PERSONAL_GROUP_LABEL = "Personal";
export const ADMIN_GROUP_LABEL = "Despacho · Admin";

/**
 * The same sections as a `Select` "Sección" for narrow screens (390 px):
 * one `SelectGroup` per nav group; choosing one opens its page.
 */
function AjustesNavSelect({
  active,
  organization,
}: {
  active: AjustesNavKey;
  organization: ReadonlyArray<{ key: AjustesAdminSegment; label: string }>;
}) {
  const router = useRouter();
  const id = useId();
  const items = Object.fromEntries(
    [...PERSONAL_ITEMS, ...organization].map((item) => [item.key, item.label]),
  ) as Record<string, string>;
  return (
    <div data-slot="ajustes-nav-select" className="flex flex-col gap-1.5 md:hidden">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        Sección
      </label>
      <Select
        items={items}
        value={active}
        onValueChange={(value) => {
          if (typeof value === "string" && value !== active) router.push(`/ajustes/${value}`);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{PERSONAL_GROUP_LABEL}</SelectLabel>
            {PERSONAL_ITEMS.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
          {organization.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{ADMIN_GROUP_LABEL}</SelectLabel>
              {organization.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Ajustes sub-navigation (redesign FE §3.8, §4.8; canvas `Ajustes-*`): a
 * 220 px column with the group "Personal" for every staff member and the
 * group "Despacho · Admin", whose items are rendered only when the viewer has
 * the capability of their segment (absent from the DOM otherwise). Below
 * `md` the same items are a `Select` "Sección" above the content.
 */
export function AjustesNav({ active, isAdmin, segments }: AjustesNavProps) {
  const organization = ORGANIZATION_ITEMS.filter((item) => isSegmentVisible(item.key, isAdmin, segments));
  const id = useId();
  const personalId = `${id}-personal`;
  const organizationId = `${id}-organizacion`;

  return (
    <>
      <AjustesNavSelect active={active} organization={organization} />
      <nav aria-label="Secciones de ajustes" className="hidden md:flex w-[220px] flex-col gap-[18px]">
        <div className="flex flex-col gap-0.5">
          <h2 id={personalId} className={GROUP_LABEL_CLASS}>
            {PERSONAL_GROUP_LABEL}
          </h2>
          <ul aria-labelledby={personalId} className="flex flex-col gap-0.5">
            {PERSONAL_ITEMS.map((item) => (
              <NavItem key={item.key} href={`/ajustes/${item.key}`} label={item.label} active={active === item.key} />
            ))}
          </ul>
        </div>
        {organization.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <h2 id={organizationId} className={GROUP_LABEL_CLASS}>
              {ADMIN_GROUP_LABEL}
            </h2>
            <ul aria-labelledby={organizationId} className="flex flex-col gap-0.5">
              {organization.map((item) => (
                <NavItem key={item.key} href={`/ajustes/${item.key}`} label={item.label} active={active === item.key} />
              ))}
            </ul>
          </div>
        ) : null}
      </nav>
    </>
  );
}
