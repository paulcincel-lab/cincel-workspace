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
| `CINCEL_ADMIN_EMAILS` | Recommended | `lib/data/roles.ts` | Comma-separated emails that get the `Administrador` role automatically regardless of their `team_members.role`. Unset = no auto-escalation. |
| `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` / `GOOGLE_SA_SUBJECT` / `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Optional | `lib/google/*` | Service-account access for the Drive pickers. Leave unset to disable (manual URL entry still works, API routes return 503). |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Optional | `lib/assistant/provider.ts` | OpenAI-compatible `/v1` endpoint for `/asistente`. Unset = assistant disabled (route returns 503, UI shows a notice). |
| `APP_PORT` | Compose only | `docker-compose.yml` | Host port mapped to the container's 3000. Default 3000. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Compose only | `docker-compose.yml` `db` service | Default `cincel` / `cincel` / `cincel`. |

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored and is read by
both the `app` and `migrate` compose services (`env_file`).

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

Or use the **`migrate-remote-db`** job in
`.github/workflows/cincel-app-build.yml`: Actions tab → *Run workflow*. It reads
a `PROD_DATABASE_URL` secret from the repo's `production` environment — set that
secret once in **Settings → Environments → production**.

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
| `migrate-remote-db` | **manual only** (`workflow_dispatch`) — applies migrations to `secrets.PROD_DATABASE_URL` |

CI does **not** deploy or migrate any real environment automatically.

## Post-deploy smoke check

```bash
# login page renders + seeded admin can log in and reach a private route
CI=1 E2E_BASE_URL='https://your-host' npx playwright test tests/e2e/smoke.spec.ts
```

Or manually: open `/login`, sign in as the seeded admin, confirm you land on
`/dashboard` and the sidebar loads. `middleware.ts` redirects any
cookie-less request for a protected route to `/login`; full session validation
(expiry, member active, role) happens server-side in `getSession()`.

## Rollback

- **App**: redeploy the previous image tag. The schema is forward-compatible
  within a release train, but a rollback across a migration that dropped/renamed
  a column will break — check `lib/db/migrations` between the two versions.
- **Migrations**: drizzle-kit has no down-migrations. To undo, write a new
  forward migration. Take a `pg_dump` before applying migrations on a database
  that holds real data (see `docs/backup-recovery.md`).
