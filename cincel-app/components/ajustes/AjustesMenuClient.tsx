"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search, Timer, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";

import { AdminPageHeading } from "@/components/ajustes/AdminFields";
import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button } from "@/components/ui/shadcn/button";
import { Switch } from "@/components/ui/shadcn/switch";
import { setNavVisibilityAction } from "@/lib/actions/app-settings-actions";
import { mutationErrorText, runAction } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import {
  etapaVisibilityKey,
  NAV_ETAPAS_KEY,
  NAV_ITEM_KEYS,
  NAV_JORNADA_KEY,
  NAV_LOCKED_KEY,
  NAV_PROYECTOS_SUBMENU_KEY,
  NAV_SEARCH_KEY,
  NAV_TAREAS_SUBMENU_KEY,
  sanitizeHiddenKeys,
} from "@/lib/shell/nav-visibility";
import { NAV_ICONS, NAV_LABELS } from "@/lib/ui/nav-client";
import { cn } from "@/lib/utils";

export type AjustesMenuClientProps = {
  /** The hidden keys saved today. */
  initialHidden: readonly string[];
  /** The etapas that exist now (`listEtapas`), in order. */
  etapas: ReadonlyArray<{ key: string; name: string }>;
};

type Row = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Nested under the row above (submenu or etapa). */
  level: 0 | 1;
  locked?: boolean;
};

/** The elements in the same order as the sidebar. */
function buildRows(etapas: AjustesMenuClientProps["etapas"]): Row[] {
  const rows: Row[] = [
    { key: NAV_SEARCH_KEY, label: "Buscar", icon: Search, level: 0 },
    { key: NAV_JORNADA_KEY, label: "Jornada", icon: Timer, level: 0 },
  ];
  for (const key of NAV_ITEM_KEYS) {
    if (key === NAV_LOCKED_KEY) continue;
    rows.push({ key, label: NAV_LABELS[key], icon: NAV_ICONS[key], level: 0 });
    if (key === "tareas") rows.push({ key: NAV_TAREAS_SUBMENU_KEY, label: "Tareas por proyecto", level: 1 });
    if (key === "proyectos") rows.push({ key: NAV_PROYECTOS_SUBMENU_KEY, label: "Lista de proyectos", level: 1 });
  }
  rows.push({ key: NAV_ETAPAS_KEY, label: "Etapas", level: 0 });
  for (const etapa of etapas) rows.push({ key: etapaVisibilityKey(etapa.key), label: etapa.name, level: 1 });
  rows.push({
    key: NAV_LOCKED_KEY,
    label: NAV_LABELS[NAV_LOCKED_KEY],
    icon: NAV_ICONS[NAV_LOCKED_KEY],
    level: 0,
    locked: true,
  });
  return rows;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let diff = 0;
  for (const key of a) if (!b.has(key)) diff += 1;
  for (const key of b) if (!a.has(key)) diff += 1;
  return diff;
}

export const LOCKED_NOTE = "Ajustes no se puede ocultar: así siempre podrás volver a esta página.";

/**
 * Ajustes › Menú: one switch "Visible en el menú" per element of the main
 * menu, in sidebar order, with the submenus nested under Tareas and Proyectos
 * and each etapa under Etapas. Saving applies to everyone in the organization.
 */
export function AjustesMenuClient({ initialHidden, etapas }: AjustesMenuClientProps) {
  const qc = useQueryClient();
  const headingId = useId();
  const rows = buildRows(etapas);
  const etapaKeys = new Set(etapas.map((etapa) => etapa.key));
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(sanitizeHiddenKeys([...initialHidden], etapaKeys)));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyCount = sameSet(hidden, saved);

  function setVisible(key: string, visible: boolean) {
    setHidden((current) => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await runAction(setNavVisibilityAction, [...hidden]);
      const next = new Set(result.hidden);
      setSaved(next);
      setHidden(next);
      await qc.invalidateQueries({ queryKey: qk.shell.all() });
    } catch (err) {
      setError(mutationErrorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeading
        title="Menú"
        description="Elige qué elementos del menú principal ve todo el despacho. Ocultar un elemento no bloquea su página: el acceso sigue en Permisos."
      />
      <SettingsSection level={3} title="Elementos del menú" description="Se aplica a todas las personas y dispositivos.">
        <ul aria-label="Elementos del menú" className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const Icon = row.icon;
            const visible = row.locked ? true : !hidden.has(row.key);
            const switchId = `${headingId}-${row.key.replace(/[^a-z0-9-]/gi, "_")}`;
            const noteId = `${switchId}-note`;
            return (
              <li
                key={row.key}
                data-key={row.key}
                className={cn("flex items-center justify-between gap-3 py-2.5", row.level === 1 && "pl-8")}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-foreground">
                    {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} /> : null}
                    <span className="truncate">{row.label}</span>
                  </span>
                  {row.locked ? (
                    <span id={noteId} className="pl-[26px] text-xs text-muted-foreground">
                      {LOCKED_NOTE}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Visible en el menú</span>
                  <Switch
                    id={switchId}
                    checked={visible}
                    disabled={row.locked}
                    aria-label={`Mostrar ${row.label} en el menú`}
                    aria-describedby={row.locked ? noteId : undefined}
                    onCheckedChange={(checked) => setVisible(row.key, checked === true)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="pt-3">
          <Button type="button" variant="outline" disabled={hidden.size === 0 || saving} onClick={() => setHidden(new Set())}>
            Mostrar todo
          </Button>
        </div>
      </SettingsSection>
      <SettingsSaveBar
        dirtyCount={dirtyCount}
        saving={saving}
        error={error}
        onDiscard={() => setHidden(saved)}
        onSave={() => void save()}
      />
    </div>
  );
}
