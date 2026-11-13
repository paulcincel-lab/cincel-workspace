# Redesign launch runbook (issue #923)

Puts the new design live on the dev deployment
(`cincel-app.cloudketer.dev`) for every user. Cincel is dev-only for now: the
deploy host is **standalone02**, compose folder
`~/apps/cincel-workspace/cincel-app`, stack `docker-compose.prod.yml`, secrets
in `.env.production`. Background: [deployment.md](deployment.md) and
[redesign-ops-checklist.md](redesign-ops-checklist.md) (#913: `SESSION_SECRET`,
Gmail, cron), which should be done first or right after.

There is **no switch to turn on**. The old design was removed
([phase 9](phases/redesign-phase-9-cleanup.md)): from the first release that
contains that cleanup, the staff layout always renders the new shell, the
"Nuevo diseño" switch and the organization-wide "Nuevo diseño para todos"
option no longer exist, and the stored opt-in values
(`user_preferences.redesign_enabled`, `redesignDefault` /
`redesignAvailable` in the organization appearance settings) are ignored.
Issue step 2 is therefore skipped: deploying the release is the launch.

## 1. Deploy the latest release (v0.37.0 or newer)

Pick the newest `cincel-app-vX.Y.Z` release
(`gh release list -R paulcincel-lab/cincel-workspace | grep cincel-app`, or the
GitHub Releases page). It must be the one cut after the old-design removal
merged (v0.37.0 or newer). CI pushes `cincel-app:X.Y.Z` and
`cincel-app-migrate:X.Y.Z` for every release.

```bash
cd ~/apps/cincel-workspace/cincel-app
git pull                                   # compose file and scripts/ops
# In .env (not .env.production): IMAGE_TAG=X.Y.Z, the release version
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=X.Y.Z/' .env
set -a; . ./.env; set +a                   # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml pull app migrate
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps -a   # migrate: Exited (0); app: Up
```

`app` waits for `migrate` (`service_completed_successfully`), so the redesign
migration (`0026_redesign_contracts`) and every later one run before the new
server starts. If `migrate` exited non-zero:
`docker compose -f docker-compose.prod.yml logs migrate`.

On a KCD deploy instead: set the recipe's image tag to `X.Y.Z` in the KCD
console and deploy; the recipe's migrate job runs `node scripts/migrate.mjs`
first.

Check the deploy:

```bash
scripts/ops/redesign-launch-check.sh all
```

- `version`: `OK cincel-app vX.Y.Z (>= 0.37.0)`. It reads the image's X.Y.Z
  tag; with `IMAGE_TAG=latest` or a SHA it fails unless the version tag of the
  same image was pulled too.
- `migrate`: `OK N of N migrations applied` and the four `core.*` redesign
  tables exist.
- `http`: `/api/healthz` and `/login` answer `200`; `/inicio` and `/tareas`
  redirect a signed-out request to `/login`.

- [ ] `redesign-launch-check.sh all` exits 0; output posted on the issue.
- [ ] **Ajustes › General → Versión** shows `vX.Y.Z` in the browser.

## 2. Nothing to turn on

- [ ] Signed in as a non-admin who never opted in, the first load of
      `/inicio` shows the new shell (sidebar 248 px with Inicio, Mi espacio,
      Tareas, Proyectos, Personas, Biblioteca, Asistente; no banner offering
      the new design; no "Volver al diseño anterior").
- [ ] **Ajustes › Apariencia** has no "Nuevo diseño" switch and
      **Ajustes › Tema y estilo** has no "Nuevo diseño para todos".
- [ ] Old links still land on the new pages: `/dashboard` → `/inicio`,
      `/mis-tareas` → `/tareas?vista=lista&responsable=yo`, `/profile` →
      `/ajustes/perfil` (full table: [frontend.md](specs/redesign/frontend.md) §2.2).

## 3. Smoke test on the live site

In a fresh private window on `https://cincel-app.cloudketer.dev`, signed in as
staff (password or Google, whichever is enabled):

- [ ] **Log in**: `/login` → lands on **Inicio** with no error page.
- [ ] **Inicio**: greeting and date, KPI cards, Mis tareas de hoy, project
      portfolio, team load; no empty-state errors or spinners that never end.
- [ ] **Tareas**, all three views: **Lista**, **Tablero** (drag a card to
      another column and back) and **Calendario** (Mes / Semana / Día); the
      filters (Mías, etapa) change the list.
- [ ] **A project**: open one from **Proyectos**; its header and every
      section in the project's section nav load.
- [ ] **Personas**: the directory loads; open one person.
- [ ] **Mi espacio**: notes, checklists and reminders load; the Bandeja shows
      mail if Gmail is connected (#913 §2), otherwise its connect empty state.
- [ ] **Ajustes**: Perfil, Apariencia (switch Claro / Oscuro and back),
      Notificaciones, Integraciones; as admin also General, Tema y estilo,
      Horario.
- [ ] **The assistant**: **Asistente** opens; a simple question ("¿Qué tareas
      tengo hoy?") gets an answer. With `LLM_BASE_URL` unset it shows the
      "no disponible" notice instead, which also passes.
- [ ] Phone width (or browser device mode, 390 px): the sidebar collapses and
      pages keep the 16 px side padding with no horizontal scroll.
- [ ] `docker compose -f docker-compose.prod.yml logs --since 15m app | grep -i '"level":"error"\|Error:'`
      shows nothing from the smoke test.

## 4. Performance on the live site

Targets from #922 (warm, signed in, desktop):

| Measure | Target |
|---|---|
| Sidebar navigation between Inicio, Tareas, Proyectos, Personas, Mi espacio, Ajustes | under 500 ms |
| Inicio TTFB | under 300 ms |
| Inicio LCP | under 1.5 s |

How to measure: Chrome DevTools → **Performance** panel, record a reload of
`/inicio` (LCP and the document's TTFB are in the timings track; or the
**Network** tab, the document row → Timing → "Waiting for server response").
For navigation, record clicking each sidebar item after one warm-up pass and
read the time from the click to the new page's content.

- [ ] Each number recorded and posted on #922 and here, with the release
      version it was taken on; all three targets met.

## Rollback

Set `IMAGE_TAG` back to the previous release and
`docker compose -f docker-compose.prod.yml up -d`. Migrations are additive, so
the older image runs against the migrated database. Releases before the old
design was removed still honour the opt-in, so on such a version an admin
would turn on **Ajustes › Tema y estilo › Nuevo diseño para todos** and
publish.
