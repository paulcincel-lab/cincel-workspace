# Cincel Workspace — Deployment Guide

> The app is a **Next.js standalone server backed by Postgres via Drizzle ORM**.
> There is no Supabase, no PostgREST, no `NEXT_PUBLIC_CINCEL_DATA_SOURCE` — every
> environment reads and writes the same Postgres database. Authentication is
> scrypt password hashing + opaque cookie sessions (`core.auth_credentials`,
> `core.sessions`).

## Environment variables

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `lib/db/client.ts`, `drizzle-kit`, `scripts/seed.ts` | `postgres://user:pw@host:5432/dbname`. Server-side only, never `NEXT_PUBLIC_`. |
| `SEED_ADMIN_EMAIL` | Seed only | `scripts/seed.ts` | Institutional email of the bootstrap admin. Must match a `team_members` row (the roster seed creates it). Default `paul@cincel.mx`. |
| `SEED_ADMIN_PASSWORD` | Seed only | `scripts/seed.ts` | Password for that admin credential. **Set a strong value in production** — re-running the seed resets it. |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | Optional | `scripts/bootstrap-admin.mjs` | Set both and the migrate job creates or updates that staff member as `Administrador` with a password login on every deploy, so a fresh database needs no seed. The env password wins: change it and redeploy to reset it. Set one without the other and the migrate job fails. |
| `BOOTSTRAP_ADMIN_NAME` | Optional, default `Administrador` | `scripts/bootstrap-admin.mjs` | Display name of the bootstrap admin. Used when the row is created; an existing row is renamed only while its name is still its email, so a name changed in the app is kept. |
| `CINCEL_ADMIN_EMAILS` | Recommended | `lib/data/roles.ts` | Comma-separated emails that get the `Administrador` role automatically regardless of their `team_members.role`. Unset = no auto-escalation. |
| `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` / `GOOGLE_SA_SUBJECT` / `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Optional | `lib/google/*` | Service-account access for the Drive pickers. Leave unset to disable (manual URL entry still works, API routes return 503). `GOOGLE_DRIVE_ROOT_FOLDER_ID` is the picker's start folder; when unset it defaults to the root of `GOOGLE_SHARED_DRIVE_ID`. |
| `GOOGLE_SHARED_DRIVE_ID` | Optional | `npm run monday` (monday migration CLI), project folders (`lib/google/project-folders.ts`) | Company Shared Drive where project folders are created, both by the monday migration and when a project is created or its folders are re-created in the app. The service account must be a **Content manager** on it. Also the default start folder for the Drive picker when `GOOGLE_DRIVE_ROOT_FOLDER_ID` is unset. See `docs/google-drive.md`. |
| `MONDAY_IMPORT_DIR` | Image: `ENV` set to `/data/monday` | `lib/monday-import/runs.ts` (Configuración → Importar de monday) | Folder for the import wizard's runs (monday exports with client data and files). Unset = `<cwd>/exports/wizard`, which the image's `nextuser` can't create because `/app` belongs to root. The image makes `/data/monday` owned by `nextuser`; mount a persistent volume there (KCD: `kcd.yml` sets the default and the `/data/monday` volume; `docker-compose.prod.yml`: the `cincel_monday_data` volume). A folder the app can't write shows "La carpeta de importación no tiene permisos de escritura." and logs the path once. `MONDAY_TOKEN` is not needed: the wizard asks for the token and never stores it. |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Optional | `lib/assistant/provider.ts` | OpenAI-compatible `/v1` endpoint for `/asistente`. Unset = assistant disabled (route returns 503, UI shows a notice). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | Optional | `lib/email/index.ts` | Client portal mail (invitations, sign-in links, "archivo recibido"). Production: Gmail SMTP from one Workspace account (`smtp.gmail.com`, `465`, the account, its app password, see [Email](#email-client-portal)). `SMTP_PASSWORD` is a secret. Unset `SMTP_HOST` = messages are only logged. Local compose sends to Mailpit. |
| `APP_PORT` | Compose only | `docker-compose.yml` | Host port mapped to the container's 3000. Default 3000. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Compose only | `docker-compose.yml` `db` service | Default `cincel` / `cincel` / `cincel`. |
| `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` | Compose only | `docker-compose.yml` `mailpit` service | Host ports for the local Mailpit UI and SMTP. Default `8025` / `1025`. |

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored and is read by
both the `app` and `migrate` compose services (`env_file`).

### monday import folder

The import wizard writes one folder per run under `MONDAY_IMPORT_DIR`. The
image sets it to `/data/monday` (`ENV` in the `Dockerfile`), a folder created and
owned by `nextuser` before `USER`, so a new named volume mounted there starts writable.

- **KCD:** `kcd.yml` lists the `/data/monday` volume and defaults
  `MONDAY_IMPORT_DIR` to it; nothing to fill in.
- **docker-compose.prod.yml:** the `app` service mounts the `cincel_monday_data`
  named volume at `/data/monday`; nothing to fill in.
- **Other hosts:** mount a persistent volume at `/data/monday` so runs survive a
  redeploy. A bind mount must be writable by the container's `nextuser`.

## Email (client portal)

The client portal sends invitations and single-use sign-in links by email
(`lib/email/index.ts`, over SMTP). Without `SMTP_HOST` the app only logs each
message (sign-in tokens redacted) and nothing is delivered.

### Local: Mailpit

`docker compose up` starts a `mailpit` service and points the `app` container
at it (`SMTP_HOST=mailpit`, `SMTP_PORT=1025`, no user or password), whatever
`SMTP_*` holds in `.env`. Read every message at <http://localhost:8025>. A host
`npm run dev` reaches the same Mailpit with `SMTP_HOST=localhost` and
`SMTP_PORT=1025` in `.env` (run `docker compose up -d mailpit` first).

### Production: Gmail SMTP from one Workspace account

Dev and prod are configured from the KCD console (`kcd.yml`). Set:

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (implicit TLS) |
| `SMTP_USER` | The sending Workspace account, e.g. `portal@cincel.mx` |
| `SMTP_PASSWORD` | That account's app password (secret) |
| `MAIL_FROM` | `Cincel <portal@cincel.mx>`: the account itself or one of its verified "Send mail as" aliases, or Gmail rewrites it |

Gmail setup, once:

1. Create or choose the Workspace account that sends portal mail (e.g.
   `portal@cincel.mx`). It needs a license, since it signs in to send.
2. Turn on 2-Step Verification for that account (Google Account → Security).
   If the Workspace admin enforces it, the account can enroll; if the admin
   disabled it, they have to allow it for this account first.
3. Signed in as that account, create an app password (Google Account →
   Security → App passwords, or <https://myaccount.google.com/apppasswords>),
   name it e.g. "Cincel portal", and paste the 16 characters into
   `SMTP_PASSWORD` in the KCD console. Never put it in a file or commit it.
4. If the app-password option is missing, the account usually doesn't have
   2-Step Verification on, or is enrolled in Advanced Protection (which blocks
   app passwords; use another account).

Adding `SMTP_PASSWORD` to `kcd.yml` adds a secret without `generate`, so KCD
holds auto-deploy for that recipe change until someone reviews it on the
canvas and fills in the value. Gmail allows about 2,000 messages a day per
Workspace account.

## Database migrations — REQUIRED on every deploy

The app image does **not** run migrations at startup, and the standalone runtime
image does not even contain `drizzle-kit`. The schema must be applied to the
target database **before** (or as part of) each deploy, or every request fails
with `relation "core.*" does not exist` (Postgres error `42P01`).

Migrations live in `lib/db/migrations/*.sql` and are tracked in
`drizzle.__drizzle_migrations` — `npm run db:migrate` is idempotent and only
applies what is missing.

### docker-compose deploys — automatic

`docker-compose.yml` defines a one-shot **`migrate`** service that runs
`npm run db:migrate` (from the Dockerfile `build` stage, which still has
drizzle-kit). The `app` service `depends_on` it with
`condition: service_completed_successfully`, so:

```bash
docker compose up -d --build
```

can never start the server against an un-migrated database. To run migrations
alone:

```bash
docker compose run --rm migrate
```

### Managed / remote database — manual

For a database that is not part of the compose stack (managed Postgres, a
separate server), run migrations from a repo checkout or CI with `DATABASE_URL`
pointed at that database:

```bash
cd cincel-app
npm ci
DATABASE_URL='postgres://USER:PW@HOST:5432/DBNAME' npm run db:migrate
```

This is manual only — CI no longer runs migrations against a remote database
on its own (the `migrate-remote-db` job was removed; run the command above
from a checkout or a one-off CI step if you need it in a pipeline).

## First deploy — seed

On a brand-new database, after migrating, seed the team roster + bootstrap admin
+ a couple of demo clients/projects:

```bash
DATABASE_URL='...' \
  SEED_ADMIN_EMAIL=paul@cincel.mx SEED_ADMIN_PASSWORD='<strong-password>' \
  npm run db:seed
```

`scripts/seed.ts` is idempotent (upserts on `legacy_id`). It is safe to re-run,
but it **re-sets the admin password** to `SEED_ADMIN_PASSWORD` and re-upserts the
demo clients/projects — do not point it at a database that already holds real
business data under those legacy ids.

The seed loads only the roster and demo rows. Real projects / clients / tasks /
history are entered through the app; there is no bulk importer.

## CI

`.github/workflows/cincel-app-build.yml` runs on PRs and pushes to `main`:

| Job | What |
|---|---|
| `verify` | `npm run lint` + `npm run build` |
| `unit-tests` | `npm run test:unit` (vitest) |
| `e2e-tests` | Spins a throwaway Postgres service, runs `db:migrate` + `db:seed`, then Playwright (`npm run test:e2e`) |
| `docker-build` | `docker build` smoke |
| `docker-publish` | **push to `main` only**, once every other job passed, on the self-hosted runner — builds and pushes the runtime and migrate images to `secrets.REGISTRY_URL`, then cuts a GitHub release |

### Releases and versions

Each successful publish cuts a GitHub release tagged `cincel-app-vX.Y.Z`.
`.github/scripts/next-version.sh` computes the version from the Conventional
Commits that touched `cincel-app/` since the previous tag (baseline: the
`package.json` version, 0.1.0):

- breaking (`type!:` or `BREAKING CHANGE:`) → major, or minor while still 0.x
- `feat` → minor
- anything else → patch

The release notes list those commits. To go to 1.0.0, push the tag
`cincel-app-v1.0.0` by hand; later releases continue from it.

Both images are tagged with the version, the commit SHA and `latest`, so
`IMAGE_TAG=0.2.0` pins a deploy to a release. The version is also baked into
the build (`APP_VERSION` build arg → `NEXT_PUBLIC_APP_VERSION`) and shown in
the sidebar footer; local builds fall back to the text set in
Configuración → General.

CI does not migrate any real environment automatically; publishing the images
on push to `main` is the one exception, and it only builds/pushes images, it
never runs them against a database.

## Post-deploy smoke check

```bash
# login page renders + seeded admin can log in and reach a private route
CI=1 E2E_BASE_URL='https://your-host' E2E_ADMIN_PASSWORD='<admin-password>' npx playwright test tests/e2e/smoke.spec.ts
```

Or manually: open `/login`, sign in as the seeded admin, confirm you land on
`/dashboard` and the sidebar loads. `middleware.ts` redirects any
cookie-less request for a protected route to `/login`; full session validation
(expiry, member active, role) happens server-side in `getSession()`.

## Rollback

- **App**: redeploy the previous image tag (e.g. the previous release's `X.Y.Z`). The schema is forward-compatible
  within a release train, but a rollback across a migration that dropped/renamed
  a column will break — check `lib/db/migrations` between the two versions.
- **Migrations**: drizzle-kit has no down-migrations. To undo, write a new
  forward migration. Take a `pg_dump` before applying migrations on a database
  that holds real data (see `docs/backup-recovery.md`).

## Rebuild cutover (future, not yet executed)

**This section describes a future operation. No production data is moved by
anything in Rebuild Phase 9 — it only documents the mechanism.** The real
cutover (migrating existing production rows from the old schema into the new
one, populating `core.legacy_refs`) is a separate, explicit piece of work
that must be planned and requested on its own; do not run any of the steps
below against production until that plan exists and has been approved.

The app is pointed at whichever database `DATABASE_URL` names — switching
schemas is a `DATABASE_URL` swap, not a code deploy. See
`docs/rebuild-table-inventory.md` for the full old-table → new-table mapping
that a real migration script would use to populate `core.legacy_refs`.

**Pre-flight checks, before ever swapping `DATABASE_URL` in production:**
1. The target (new-schema) database has all migrations applied
   (`npm run db:migrate`) and, if this is a first deploy, is seeded
   (`npm run db:seed`).
2. A real data-migration script has run against the target database,
   populating `core.legacy_refs` with every row's old id → new id mapping,
   and every legacy table's data has been copied into its `core.*`
   replacement per `docs/rebuild-table-inventory.md`.
3. A `pg_dump` of the *old* production database has been taken and verified
   restorable (see `docs/backup-recovery.md`) — this is the rollback path.
4. The app has been smoke-tested against the target database in a
   non-production environment (see "Post-deploy smoke check" above).

**The swap:**
1. Update `DATABASE_URL` (in the deploy environment's secrets/env, e.g. the
   `.env`/`docker-compose.prod.yml` environment on the deploy host) to point
   at the new-schema database.
2. Redeploy/restart the app so it picks up the new `DATABASE_URL`.
3. Run the post-deploy smoke check above against production.

**Rollback:** swap `DATABASE_URL` back to the old database and
redeploy/restart. Since the old database was never modified during the
cutover (only read from, by the migration script), rolling back is just
pointing the app back at it — no restore needed unless the old database
itself was separately touched for an unrelated reason.
