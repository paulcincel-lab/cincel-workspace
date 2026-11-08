# Route budgets and measurement

Issue 922. The staff app has to feel instant on the dev deployment. This page lists the budgets, what the code does to meet them, and how an operator measures them before and after a deploy.

## Budgets

| What | Budget | Where |
| --- | --- | --- |
| Sidebar navigation between main pages (warm) | under 500 ms | Inicio, Tareas, Proyectos, Personas, Mi espacio, Ajustes |
| TTFB of `/inicio` | under 300 ms | cold load, signed in |
| LCP of `/inicio` | under 1.5 s | cold load, signed in, 1440 × 900 |
| First-load JS per route | reported, and the largest routes go down | every main page |

`scripts/perf/measure-routes.mjs` checks the first three and exits 1 when one is missed.

## What the code does

**One session lookup per render.** The staff layout, the nav items, the page and every action it awaits each called `getSession()`, and each call read the `sessions` row joined to `staff` again. On `/inicio` that was about 12 identical lookups per request: the layout, the appearance cookie, the Tareas, Proyectos, Personas and Biblioteca nav items, `fetchMyTodayAction`, the page, the first-login check and `fetchInicioAction`. `lib/auth/session.ts` now wraps the token lookup and the access checks in React `cache()`, so a render does the lookup once. Route handlers and Server Action requests have no render cache and still read the row on every call. The Google re-check, when it keeps access, reads the row again past the cache so a new role applies straight away.

**An index for Inicio's status feeds.** `listStatusEvents` (Inicio KPIs) and `listTaskTrendSource` (the weekly pace) read every `cambio` of the `status` field since a date, across all rows of an entity. The only index that fit was `(entity, entity_id, event_at)`, and it can't serve a range on `event_at` without `entity_id`, so both queries scanned every task change. Migration `0030_history_change_feed_index` adds the partial index `idx_history_events_change_feed` on `(entity, field, event_at) WHERE kind = 'cambio'`. The migration runs automatically on deploy.

**Charts load on demand.** recharts is the largest client library of the widget set. `DistributionWidget` (the donut) and `LineSeriesWidget` (the weekly pace) now import their chart through `components/widgets/charts/lazy.tsx`, so recharts is its own chunk instead of part of the first-load JS of Inicio, Tareas (calendar), Proyectos (files) and the widget pages. The server still renders the chart's box, the donut's `role="img"` label is there at once, and the placeholder keeps the chart's size so nothing moves. `tests/guards/charts-lazy.guard.test.ts` fails if a new static import of recharts or the shadcn chart wrapper appears outside the chart modules.

**The assistant loads on demand.** The assistant sheet (chat transport, markdown, charts, tool summaries) loads the first time it opens, and starts loading when the button is hovered or focused (`AssistantLauncher`, shared with issue 916).

**Prefetch on intent.** Main sidebar links use `unstable_dynamicOnHover`. In production, `Link` prefetches a page's static shell and its `loading.tsx` while the link is on screen. Hovering a main page also fetches its full payload, so the click usually renders with no wait on the server.

**Warm revisits.** `next.config.ts` sets `experimental.staleTimes.dynamic` to 30 s. Going back to a page seen in the last 30 s reuses its payload. Server Actions that call `revalidatePath` and `router.refresh()` still drop it right away, so your own edits show at once. A teammate's change can take up to 30 s to show on a page you revisit, the same as any page left open.

**Skeletons on every route.** `app/(staff)/loading.tsx` renders `RouteLoading`, which picks the skeleton for the page being opened (`lib/ui/route-states.ts`). Mi espacio, Vacaciones and both Ajustes groups have their own. A click shows the skeleton at once while the server renders.

## How to measure

You can't run these from CI. They need the dev deployment and a signed-in session. Never point them at a production database.

### First-load JS from the build

```bash
cd cincel-app
npm ci
npx next build             # the route list and the chunks in .next/
npm run analyze            # next experimental-analyze: module graph and chunk sizes per route
```

Write down the first-load JS of `/inicio`, `/tareas`, `/proyectos`, `/personas`, `/mi-espacio` and `/ajustes` before and after. `measure-routes.mjs` below also reports the JS each page downloads on its first load in a real browser (transfer and decoded size). That number counts what the user actually waits for, so use it for the issue.

### Live timings

1. Sign in to the dev deployment as an administrator (the widest data scope, so the slowest Inicio).
2. In devtools, Application → Cookies, copy the value of `cincel_session`.
3. From `cincel-app/`, with Playwright's Chromium installed (`npx playwright install chromium`):

   ```bash
   PERF_BASE_URL=https://<dev deployment> \
   PERF_SESSION=<cookie value> \
   PERF_RUNS=5 PERF_JSON=perf-after.json \
   npm run perf:routes
   ```

   For each route it prints the median TTFB, LCP, first-load JS (KB transferred and decoded), the number of JS files, and the warm sidebar transition into it from the previous route. The transition is measured after a hover, the way people use the sidebar.
4. Run it once on the build before this change (`PERF_JSON=perf-before.json`) and once after. Post both tables on issue 922.

The script only opens pages and clicks sidebar links. It never writes data. The session cookie gives full access to that account: don't paste it into the issue, and sign out afterwards to end the session.
