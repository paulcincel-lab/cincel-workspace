"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAppearance } from "@/components/shell/AppearanceProvider";
import { Badge } from "@/components/ui/shadcn/badge";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import type { OrgAppearance, TextSize, UserPreferences } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

import {
  AparienciaContext,
  TEXT_SIZE_DEBOUNCE_MS,
  type AparienciaContextValue,
  type AparienciaSectionKey,
} from "./apariencia-context";
import {
  AparienciaDensidadSection,
  AparienciaEstiloSection,
  AparienciaModoSection,
  AparienciaTamanoTextoSection,
  AparienciaTemaSection,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
} from "./AparienciaSections";

export type AparienciaClientProps = {
  preferences: UserPreferences;
  org: OrgAppearance;
  isAdmin: boolean;
  /**
   * The visible sections from `settingsSectionsFor("apariencia", user)`;
   * defaults to all six in order.
   */
  children?: ReactNode;
};

/** Snap a slider value to the allowed text sizes (13–16, step 0.5). */
export function toTextSize(value: number): TextSize {
  const clamped = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, value));
  return (Math.round(clamped / TEXT_SIZE_STEP) * TEXT_SIZE_STEP) as TextSize;
}

function DefaultSections() {
  return (
    <>
      <AparienciaTemaSection />
      <AparienciaEstiloSection />
      <AparienciaModoSection />
      <AparienciaDensidadSection />
      <AparienciaTamanoTextoSection />
    </>
  );
}

const PREVIEW_ROWS = [
  { task: "Planos arquitectónicos", status: "En proceso" },
  { task: "Cotización de cancelería", status: "Pendiente" },
  { task: "Visita de obra", status: "Completado" },
];

/** Live "Vista previa": the current tokens with the chosen density and text size. */
function AparienciaPreview({ density, textSize }: { density: UserPreferences["density"]; textSize: number }) {
  const compact = density === "compacta";
  return (
    <section aria-labelledby="apariencia-vista-previa" className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
      <h2 id="apariencia-vista-previa" className="text-sm font-semibold text-foreground">
        Vista previa
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex">
          <div aria-hidden="true" className="flex w-10 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-2">
            <span className="size-6 rounded-md bg-sidebar-primary" />
            <span className="h-1.5 rounded-full bg-sidebar-accent" />
            <span className="h-1.5 rounded-full bg-sidebar-accent" />
          </div>
          <div data-testid="apariencia-preview-body" className="min-w-0 flex-1 p-3" style={{ fontSize: `${textSize}px` }}>
            <div className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", compact ? "p-3" : "p-4")}>
              <p className="text-base font-semibold">Casa Lomas</p>
              <p className="text-muted-foreground">Diseño · 12 tareas abiertas</p>
              <ul className="mt-2 divide-y divide-border">
                {PREVIEW_ROWS.map((row) => (
                  <li key={row.task} className={cn("flex items-center justify-between gap-2", compact ? "py-1.5" : "py-2.5")}>
                    <span className="truncate">{row.task}</span>
                    <Badge variant="outline">{row.status}</Badge>
                  </li>
                ))}
              </ul>
              <span aria-hidden="true" className="mt-3 inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground">
                Nueva tarea
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, style, mode, density, text
 * size and preview through `useAppearance`. Each
 * change is applied optimistically and rolled back on failure; the text size
 * slider saves after `TEXT_SIZE_DEBOUNCE_MS`.
 */
export function AparienciaClient({ preferences: initial, org, isAdmin, children }: AparienciaClientProps) {
  const { setPreference } = useAppearance();

  const [preferences, setPreferences] = useState<UserPreferences>(initial);
  const preferencesRef = useRef<UserPreferences>(initial);
  const [textSize, setTextSize] = useState<number>(initial.textSize);
  const [lockedByServer, setLockedByServer] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<AparienciaSectionKey, string>>>({});

  const apply = useCallback((next: UserPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
  }, []);

  const change = useCallback(
    async (section: AparienciaSectionKey, patch: Partial<UserPreferences>) => {
      const previous = preferencesRef.current;
      apply({ ...previous, ...patch });
      setErrors((current) => ({ ...current, [section]: undefined }));
      try {
        await setPreference(patch);
      } catch (err) {
        // Roll back only the fields of this patch; later changes stay.
        const rolledBack: UserPreferences = { ...preferencesRef.current };
        for (const key of Object.keys(patch) as (keyof UserPreferences)[]) {
          (rolledBack as Record<keyof UserPreferences, unknown>)[key] = previous[key];
        }
        apply(rolledBack);
        if ("textSize" in patch) setTextSize(rolledBack.textSize);

        const code = actionErrorCode(err);
        if (code === "OVERRIDE_DISABLED") {
          // The Tema and Estilo cards lock and show the organization copy.
          setLockedByServer(true);
          return;
        }
        setErrors((current) => ({ ...current, [section]: actionErrorText(err) }));
      }
    },
    [apply, setPreference],
  );

  const changeRef = useRef(change);
  useEffect(() => {
    changeRef.current = change;
  }, [change]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSizeRef = useRef<TextSize | null>(null);

  const flushTextSize = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const size = pendingSizeRef.current;
    pendingSizeRef.current = null;
    if (size !== null && size !== preferencesRef.current.textSize) {
      void changeRef.current("tamano-texto", { textSize: size });
    }
  }, []);

  const changeTextSize = useCallback(
    (value: number) => {
      const size = toTextSize(value);
      setTextSize(size);
      pendingSizeRef.current = size;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushTextSize, TEXT_SIZE_DEBOUNCE_MS);
    },
    [flushTextSize],
  );

  // Leaving the page saves a slider change that is still waiting.
  useEffect(() => flushTextSize, [flushTextSize]);

  const value = useMemo<AparienciaContextValue>(
    () => ({
      preferences,
      org,
      isAdmin,
      overridesAllowed: org.allowUserOverride && !lockedByServer,
      textSize,
      errors,
      change,
      changeTextSize,
    }),
    [preferences, org, isAdmin, lockedByServer, textSize, errors, change, changeTextSize],
  );

  return (
    <AparienciaContext.Provider value={value}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">{children ?? <DefaultSections />}</div>
        <AparienciaPreview density={preferences.density} textSize={textSize} />
      </div>
    </AparienciaContext.Provider>
  );
}
