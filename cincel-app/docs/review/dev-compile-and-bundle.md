# Dev compile time and route bundles (issue #916)

Reported on a fresh `next dev --webpack` run: `/tareas` 42 s, `/mi-espacio` 62 s,
`/ajustes` 22 s, `/ajustes/apariencia` 2.1 min, `/ajustes/tema` 46 s for the first
compile of each route.

## Findings (code reading)

| # | Cause | Where | Effect |
|---|-------|-------|--------|
| 1 | `--webpack` forced on `npm run dev` | `package.json` | Next 16 dev defaults to Turbopack; `next build` already builds with Turbopack, so the codebase supports it. Webpack dev compiles the whole route graph (async chunks included) on first request. |
| 2 | The assistant sheet in every staff page's first load | `components/shell/AppShell.tsx` → `AssistantLauncher` → `AssistantSheet` | `AssistantSheet` pulls `ai`, `@ai-sdk/react`, `react-markdown`, `remark-gfm`, `recharts` (chart message), the widget library and the tool summaries into the shell, so every staff route compiled and shipped them even when the assistant is never opened. |
| 3 | Settings registry barrel | `lib/shell/settings-sections/index.ts`, imported by every Ajustes page | Each Ajustes page imported every page's section components (Perfil, Notificaciones, Integraciones with the Monday import wizard, Horario, General, Apariencia), so `/ajustes/apariencia` carried the whole Ajustes client tree. |
| — | Icon and chart packages | `lucide-react`, `recharts` | Already covered by Next's default `optimizePackageImports`; no change needed. |
| — | `@base-ui/react` | `components/ui/shadcn/*` | Already imported by subpath (`@base-ui/react/dialog`, …). |
| — | Assistant tool registry (`lib/assistant/tools`) | `app/api/asistente/chat/route.ts`, `lib/assistant/chat-tools.ts` | Server only; not in any page graph. |

## Changes

1. `npm run dev` runs `next dev` (Turbopack). `npm run dev:webpack` keeps the old
   bundler for comparison; `npm run analyze` runs `next experimental-analyze`
   (Turbopack bundle analyzer).
2. `AssistantLauncher` loads `AssistantSheet` with `React.lazy` the first time the
   assistant opens (button, ⌘J / Ctrl+J or `openAssistant()`), and starts the
   download on hover or focus of the floating button. Once opened the sheet
   stays mounted, so its state, close animation and focus return are unchanged.
3. Each Ajustes page imports its own list from
   `lib/shell/settings-sections/<page>` and filters it with
   `visibleSettingsSections` (`lib/shell/settings-sections/visible.ts`).
   `SETTINGS_SECTIONS` / `settingsSectionsFor` stay in the index as the union of
   the per-page lists. `tests/guards/settings-sections-split.guard.test.ts`
   keeps pages off the index.

No behavior change: same sections, same order, same visibility rules, same
assistant entry points.

## Measuring (operator)

`next build` in Next 16 no longer prints the per-route "First Load JS" table, so
use the Turbopack analyzer and dev timings. Run in a checkout of the branch
before the change (`main`) and after, on the same machine, with a local
database (never the deployed site or a remote DB):

```bash
cd cincel-app
rm -rf .next
# 1. First-load JS per route (opens the analyzer UI; note the client JS of
#    /inicio, /tareas, /mi-espacio, /ajustes, /ajustes/apariencia, /ajustes/tema).
npm run analyze
# 2. Dev first compile per route (fresh .next each time).
rm -rf .next && PORT=3200 npm run dev
#    then sign in and open each route once; read "Compiled /<route> in Ns" from the log.
#    For the before numbers run the same on main with `npm run dev` (webpack there).
```

Record the before/after numbers for each route in the PR. Acceptance: first dev
compile of any route under 15 s; the shell routes' client JS reduced by the
assistant sheet chunk; the Ajustes pages reduced by the other pages' sections.
