"use client";

import { create, type Mutate, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { useStyle } from "@/components/shell/StyleProvider";
import { registerPersistedStore } from "@/components/shell/UiStoresHydrator";
import { registerUiStoreReset } from "@/lib/query/reset-client-state";
import type { PresentationStyle } from "@/lib/types/redesign";
import { PRESENTATION_STYLES } from "@/lib/ui/style-override";

/**
 * Dashboard store factory (zustand.md §2.5, decision D1): the UI state of
 * the Inicio, Proyectos and Personas dashboards (selected KPI, 4/8/12-week
 * range, collapsed widgets, chart/table per presentation style, series
 * toggles). Pure UI state:
 *
 * - Never holds server data, never the current presentation style (that is
 *   `useStyle()`, passed in by `useWidgetView`), and never causes a server
 *   call. The range is a client window over the fixed 12 weeks a loader
 *   returns; a control that changes what the server returns belongs in the
 *   URL and the query key, never here.
 * - Module singletons (`create()`): request-independent defaults only, never
 *   written on the server (zustand.md §3 SSR rule 1).
 * - Persisted under `cincel.ui.dashboard.<id>.v1` with `skipHydration`: the
 *   first client render uses the defaults (equal to the server HTML) and
 *   `<UiStoresHydrator/>` rehydrates each instance after mount. `selectedKpi`
 *   is session only (survives navigation, not a reload).
 * - Each instance resets on an identity change (logout) and between tests
 *   through `registerUiStoreReset`.
 *
 * Instances live in their own files, e.g.
 * `useInicioDashboard = createDashboardStore<InicioWidget, InicioKpiKey>("inicio")`.
 */

export type WidgetView = "chart" | "table";
export type DashboardRange = "4w" | "8w" | "12w";
export const DASHBOARD_RANGE_WEEKS: Record<DashboardRange, number> = { "4w": 4, "8w": 8, "12w": 12 };
/** Loaders return a fixed 12-week window for every weekly series; the client slices it. */
export const DASHBOARD_LOADED_WEEKS = 12;

export type DashboardId = "inicio" | "proyectos" | "personas";

/** Version of the persisted value; anything else migrates to the defaults. */
export const DASHBOARD_STORE_VERSION = 1;

/**
 * The `localStorage` key of a dashboard instance. A new `keyVersion` drops
 * whatever an older shape stored (e.g. Proyectos `v2` after its per-widget
 * views went away).
 */
export function dashboardStorageKey(id: DashboardId, keyVersion = 1): string {
  return `cincel.ui.dashboard.${id}.v${keyVersion}`;
}

export type DashboardUiState<W extends string, K extends string, F extends string = never> = {
  /** Session only (not persisted). */
  selectedKpi: K | null;
  /** Client window over the loaded data, default "8w". */
  range: DashboardRange;
  collapsed: Partial<Record<W, boolean>>;
  /** Per-style overrides: what the user picked while in that style. */
  views: Partial<Record<PresentationStyle, Partial<Record<W, WidgetView>>>>;
  hiddenSeries: Partial<Record<W, string[]>>;
  /**
   * Client-side table filters of an Analítico page, one value per key of
   * `defaults.filters` (null = all). Persisted like `range`; empty for an
   * instance without filter keys.
   */
  filters: Record<F, string | null>;
  selectKpi(key: K | null): void;
  /** The same key again → null. */
  toggleKpi(key: K): void;
  setRange(range: DashboardRange): void;
  toggleCollapsed(widget: W): void;
  setCollapsed(widget: W, collapsed: boolean): void;
  setWidgetView(style: PresentationStyle, widget: W, view: WidgetView): void;
  /**
   * Hides or shows one series of a widget. Never hides the last visible
   * series: `available` (else the instance's `series` for that widget) lists
   * the widget's series; a toggle that would hide all of them is ignored.
   */
  toggleSeries(widget: W, series: string, available?: readonly string[]): void;
  /** Sets one filter (ignored for a key the instance does not declare). */
  setFilter(key: F, value: string | null): void;
  /** Every filter back to null. */
  clearFilters(): void;
  reset(): void;
};

/** The persisted part (`partialize`): these four keys, plus `filters` when the instance declares filter keys. */
export type DashboardPersisted<W extends string, F extends string = never> = Pick<
  DashboardUiState<W, string>,
  "range" | "collapsed" | "views" | "hiddenSeries"
> & { filters?: Record<F, string | null> };

export type DashboardData<W extends string, K extends string> = Pick<
  DashboardUiState<W, K>,
  "selectedKpi" | "range" | "collapsed" | "views" | "hiddenSeries"
>;

export type DashboardStoreDefaults<W extends string, K extends string, F extends string = never> = Partial<
  Pick<DashboardUiState<W, K>, "range" | "collapsed">
> & {
  /** Filter keys (`filters`); stored keys of other names are dropped on rehydrate. */
  filters?: readonly F[];
  /** The dashboard's widget ids; stored keys of other widgets are dropped on rehydrate. */
  widgets?: readonly W[];
  /** Each widget's series keys, for the last-visible-series guard of `toggleSeries`. */
  series?: Partial<Record<W, readonly string[]>>;
  /** The `.v<n>` of the storage key (`dashboardStorageKey`); default 1. */
  storageKeyVersion?: number;
};

export type DashboardStore<W extends string, K extends string, F extends string = never> = UseBoundStore<
  Mutate<StoreApi<DashboardUiState<W, K, F>>, [["zustand/persist", DashboardPersisted<W, F>]]>
>;

/** The defaults of an instance created without `defaults`. */
export const DASHBOARD_INITIAL: DashboardData<never, never> = {
  selectedKpi: null,
  range: "8w",
  collapsed: {},
  views: {},
  hiddenSeries: {},
};

const WIDGET_VIEWS: readonly WidgetView[] = ["chart", "table"];
const NO_SERIES: readonly string[] = Object.freeze([]);

export function isDashboardRange(value: unknown): value is DashboardRange {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DASHBOARD_RANGE_WEEKS, value);
}

function isWidgetView(value: unknown): value is WidgetView {
  return typeof value === "string" && (WIDGET_VIEWS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The last 4/8/12 items of a loaded weekly series (oldest → newest); never more than loaded. */
export function sliceToRange<T>(weeks: readonly T[], range: DashboardRange): T[] {
  const count = DASHBOARD_RANGE_WEEKS[range] ?? DASHBOARD_RANGE_WEEKS[DASHBOARD_INITIAL.range];
  return weeks.slice(Math.max(0, weeks.length - count));
}

// ── Selectors (one primitive per widget, zustand.md §3) ─────────────────────

/** `store(selectCollapsed("weeklyPace"))`: false unless the user collapsed it. */
export function selectCollapsed<W extends string>(widget: W) {
  return (s: Pick<DashboardUiState<W, string>, "collapsed">): boolean => s.collapsed[widget] ?? false;
}

/** The user's override for `widget` in `style`, else the widget's per-style fallback. */
export function selectWidgetView<W extends string>(
  style: PresentationStyle,
  widget: W,
  fallback: Record<PresentationStyle, WidgetView>,
) {
  return (s: Pick<DashboardUiState<W, string>, "views">): WidgetView => s.views[style]?.[widget] ?? fallback[style];
}

/** The hidden series of a widget (a stable empty array when none). */
export function selectHiddenSeries<W extends string>(widget: W) {
  return (s: Pick<DashboardUiState<W, string>, "hiddenSeries">): readonly string[] =>
    s.hiddenSeries[widget] ?? NO_SERIES;
}

/** True when `series` of `widget` is hidden. */
export function selectSeriesHidden<W extends string>(widget: W, series: string) {
  return (s: Pick<DashboardUiState<W, string>, "hiddenSeries">): boolean =>
    s.hiddenSeries[widget]?.includes(series) ?? false;
}

/** Style-dependent view, without putting the style in the store. */
export function useWidgetView<W extends string, K extends string, F extends string = never>(
  store: DashboardStore<W, K, F>,
  widget: W,
  fallback: Record<PresentationStyle, WidgetView>,
): WidgetView {
  const { style } = useStyle();
  return store(selectWidgetView(style, widget, fallback));
}

// ── Storage ─────────────────────────────────────────────────────────────────

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * `localStorage` behind guards: no storage (server, private mode) or a
 * throwing call reads as nothing and writes nowhere; an unreadable value is
 * dropped, so a rehydrate always finishes (with the defaults).
 */
const dashboardLocalStorage: StateStorage = {
  getItem(name) {
    const storage = browserStorage();
    try {
      const raw = storage?.getItem(name) ?? null;
      if (raw !== null) JSON.parse(raw);
      return raw;
    } catch {
      try {
        storage?.removeItem(name);
      } catch {
        // Nothing to clean up.
      }
      return null;
    }
  },
  setItem(name, value) {
    try {
      browserStorage()?.setItem(name, value);
    } catch {
      // Private mode or quota: the state lives in memory only.
    }
  },
  removeItem(name) {
    try {
      browserStorage()?.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

// ── Factory ─────────────────────────────────────────────────────────────────

export function createDashboardStore<W extends string, K extends string, F extends string = never>(
  id: DashboardId,
  defaults: DashboardStoreDefaults<W, K, F> = {},
): DashboardStore<W, K, F> {
  const defaultRange: DashboardRange = isDashboardRange(defaults.range) ? defaults.range : DASHBOARD_INITIAL.range;
  const widgetIds = defaults.widgets ? new Set<string>(defaults.widgets) : null;
  const knownSeries: Partial<Record<string, readonly string[]>> = defaults.series ?? {};

  const isWidget = (key: string): key is W => (widgetIds ? widgetIds.has(key) : true);
  const filterKeys: readonly F[] = defaults.filters ?? [];
  const isFilterKey = (key: string): key is F => (filterKeys as readonly string[]).includes(key);
  const emptyFilters = (): Record<F, string | null> =>
    Object.fromEntries(filterKeys.map((key) => [key, null])) as Record<F, string | null>;

  const initialData = (): DashboardData<W, K> => ({
    selectedKpi: null,
    range: defaultRange,
    collapsed: { ...defaults.collapsed },
    views: {},
    hiddenSeries: {},
  });

  const persistedDefaults = (): DashboardPersisted<W, F> => {
    const { range, collapsed, views, hiddenSeries } = initialData();
    return filterKeys.length > 0
      ? { range, collapsed, views, hiddenSeries, filters: emptyFilters() }
      : { range, collapsed, views, hiddenSeries };
  };

  /** Keeps only current widget ids, known styles, views and ranges. */
  const sanitize = (value: unknown): DashboardPersisted<W, F> => {
    const fallback = persistedDefaults();
    if (!isRecord(value)) return fallback;

    const collapsed: Partial<Record<W, boolean>> = {};
    if (isRecord(value.collapsed)) {
      for (const [key, flag] of Object.entries(value.collapsed)) {
        if (isWidget(key) && typeof flag === "boolean") collapsed[key] = flag;
      }
    }

    const views: DashboardPersisted<W, F>["views"] = {};
    if (isRecord(value.views)) {
      for (const style of PRESENTATION_STYLES) {
        const picks = value.views[style];
        if (!isRecord(picks)) continue;
        const kept: Partial<Record<W, WidgetView>> = {};
        for (const [key, view] of Object.entries(picks)) {
          if (isWidget(key) && isWidgetView(view)) kept[key] = view;
        }
        if (Object.keys(kept).length > 0) views[style] = kept;
      }
    }

    const hiddenSeries: Partial<Record<W, string[]>> = {};
    if (isRecord(value.hiddenSeries)) {
      for (const [key, list] of Object.entries(value.hiddenSeries)) {
        if (!isWidget(key) || !Array.isArray(list)) continue;
        const names = [...new Set(list.filter((name): name is string => typeof name === "string"))];
        const available = knownSeries[key];
        // A stored value that hides every series is dropped (last-visible guard).
        if (available && available.length > 0 && available.every((name) => names.includes(name))) continue;
        if (names.length > 0) hiddenSeries[key] = names;
      }
    }

    const sanitized: DashboardPersisted<W, F> = {
      range: isDashboardRange(value.range) ? value.range : fallback.range,
      collapsed: isRecord(value.collapsed) ? collapsed : fallback.collapsed,
      views,
      hiddenSeries,
    };
    if (filterKeys.length > 0) {
      const filters = emptyFilters();
      if (isRecord(value.filters)) {
        for (const [key, picked] of Object.entries(value.filters)) {
          if (isFilterKey(key) && typeof picked === "string" && picked !== "") filters[key] = picked;
        }
      }
      sanitized.filters = filters;
    }
    return sanitized;
  };

  const store: DashboardStore<W, K, F> = create<DashboardUiState<W, K, F>>()(
    persist(
      (set) => ({
        ...initialData(),
        filters: emptyFilters(),
        selectKpi: (key) => set({ selectedKpi: key }),
        toggleKpi: (key) => set((s) => ({ selectedKpi: s.selectedKpi === key ? null : key })),
        setRange: (range) => {
          if (isDashboardRange(range)) set({ range });
        },
        toggleCollapsed: (widget) =>
          set((s) => ({ collapsed: { ...s.collapsed, [widget]: !(s.collapsed[widget] ?? false) } })),
        setCollapsed: (widget, collapsed) => set((s) => ({ collapsed: { ...s.collapsed, [widget]: collapsed } })),
        setWidgetView: (style, widget, view) =>
          set((s) => ({ views: { ...s.views, [style]: { ...s.views[style], [widget]: view } } })),
        toggleSeries: (widget, series, available = knownSeries[widget]) =>
          set((s) => {
            const hidden = s.hiddenSeries[widget] ?? [];
            if (hidden.includes(series)) {
              const next = hidden.filter((name) => name !== series);
              const rest = { ...s.hiddenSeries };
              if (next.length > 0) rest[widget] = next;
              else delete rest[widget];
              return { hiddenSeries: rest };
            }
            const next = [...hidden, series];
            if (available && available.length > 0 && available.every((name) => next.includes(name))) return s;
            return { hiddenSeries: { ...s.hiddenSeries, [widget]: next } };
          }),
        setFilter: (key, value) => {
          if (isFilterKey(key)) set((s) => ({ filters: { ...s.filters, [key]: value || null } }));
        },
        clearFilters: () => set({ filters: emptyFilters() }),
        reset: () => set({ ...initialData(), filters: emptyFilters() }),
      }),
      {
        name: dashboardStorageKey(id, defaults.storageKeyVersion),
        version: DASHBOARD_STORE_VERSION,
        storage: createJSONStorage<DashboardPersisted<W, F>>(() => dashboardLocalStorage),
        skipHydration: true,
        partialize: ({ range, collapsed, views, hiddenSeries, filters }) =>
          filterKeys.length > 0
            ? { range, collapsed, views, hiddenSeries, filters }
            : { range, collapsed, views, hiddenSeries },
        // Version 0 or unknown: the defaults.
        migrate: () => persistedDefaults(),
        merge: (persisted, current) => (persisted == null ? current : { ...current, ...sanitize(persisted) }),
      },
    ),
  );

  registerUiStoreReset(() => store.getState().reset());
  registerPersistedStore(store);
  return store;
}
