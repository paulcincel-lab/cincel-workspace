"use client";

import Link from "next/link";

import { useStyle } from "@/components/shell/StyleProvider";
import { Badge } from "@/components/ui/shadcn/badge";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { personasTabHref, type PersonasTab } from "@/lib/personas/team";

export type { PersonasTab } from "@/lib/personas/team";

export type PersonasTabsProps = { active: PersonasTab; counts: Record<PersonasTab, number> };

const TABS: { key: PersonasTab; label: string }[] = [
  { key: "equipo", label: "Equipo" },
  { key: "clientes", label: "Clientes" },
  { key: "contratistas", label: "Contratistas" },
  { key: "proveedores", label: "Proveedores" },
];

/**
 * Personas tabs as links with counts (redesign FE §3.6, §4.7; §16: tabs that
 * navigate are links with `aria-current="page"`). The style is the saved
 * preference, so every tab renders with it; a `?estilo=` override is carried
 * in the hrefs so switching tabs keeps it too.
 */
export function PersonasTabs({ active, counts }: PersonasTabsProps) {
  const { style, isOverridden } = useStyle();
  const estilo = isOverridden ? style : null;
  return (
    <nav aria-label="Secciones de Personas" className="flex flex-wrap gap-1 border-b border-border pb-2">
      {TABS.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={personasTabHref(tab.key, estilo)}
            aria-current={current ? "page" : undefined}
            className={buttonVariants({ variant: current ? "secondary" : "ghost", size: "sm" })}
          >
            {tab.label}
            <Badge variant="outline">{counts[tab.key]}</Badge>
          </Link>
        );
      })}
    </nav>
  );
}
