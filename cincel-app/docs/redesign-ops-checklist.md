# Redesign ops checklist (issue #913)

Operator steps the redesign code needs on the deploy host and in Google Cloud.
The code is merged; nothing here changes the repo. Background:
[deployment.md](deployment.md) (env table, "Cron tick") and
[google-workspace-admin-checklist.md](google-workspace-admin-checklist.md)
(§1, §2, §10).

Cincel is dev-only for now: the deploy host is **standalone02**, compose
folder `~/apps/cincel-workspace/cincel-app`, stack `docker-compose.prod.yml`
with secrets in `.env.production`. On a KCD deploy, `kcd.yml` generates both
`SESSION_SECRET` and `CRON_SECRET` (`generate: hex32`); skip step 1 and read
`CRON_SECRET` from the KCD console for step 3.

## 1. SESSION_SECRET

Signs the 10-minute send confirmation of Gmail drafts
(`lib/gmail/confirm-token.ts`). Unset = saving a draft fails.

```bash
cd ~/apps/cincel-workspace/cincel-app
grep -q '^SESSION_SECRET=.\+' .env.production \
  || echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.production
chmod 600 .env.production
set -a; . ./.env; set +a        # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d app
scripts/ops/redesign-ops-check.sh env
```

- [ ] `env` step shows `OK SESSION_SECRET in .env.production (64 chars)` and
      `OK SESSION_SECRET set in the running app container`.

Rotating it invalidates drafts saved in the last 10 minutes (they must be
saved again before sending). Nothing else depends on it.

## 2. Gmail API and scopes

In Google Cloud Console, on the project that owns the **Cincel Staff** OAuth
client (`GOOGLE_OAUTH_CLIENT_ID`):

1. **APIs y servicios → Biblioteca → Gmail API → Habilitar.** It must show
   **Habilitada**.
2. **APIs y servicios → Pantalla de consentimiento OAuth → Acceso a los datos →
   Agregar o quitar permisos**: add
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`

   and save. Keep the audience **Interno** (`gmail.readonly` is restricted;
   an External app would need Google verification). Copy any "restricted" /
   "sensitive" notice the console shows onto the issue.
3. In Cincel, signed in as staff: **Ajustes › Integraciones → Gmail →
   Conectar**, accept the Gmail consent (`?grant=gmail`).
4. Open **Mi espacio › Bandeja**: within a minute or two (the `gmail-sync` cron
   job, step 3, syncs up to `GMAIL_SYNC_MAX_PER_TICK` accounts per tick) the
   latest threads appear. "Sincronizar" forces one sync (once every 30 s).

- [ ] Gmail API enabled, both scopes on the consent screen.
- [ ] One account connected; the Bandeja shows mail.

If the sync fails, `docker compose -f docker-compose.prod.yml logs app | grep gmail.sync_failed`
shows the reason (`RATE_LIMITED` → lower `GMAIL_SYNC_MAX_PER_TICK`; an auth
error → the scope or the API is missing).

## 3. CRON_SECRET and the host cron

```bash
cd ~/apps/cincel-workspace/cincel-app
grep -q '^CRON_SECRET=.\+' .env.production \
  || echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env.production
set -a; . ./.env; set +a
docker compose -f docker-compose.prod.yml up -d app
docker network ls | grep _default      # e.g. cincel-app_default
```

Then `crontab -e` as a user that can run `docker`, with the value from
`.env.production` and the network from above:

```cron
CRON_SECRET=<the value from .env.production>
* * * * * docker run --rm --network cincel-app_default curlimages/curl:8.10.1 -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/tick >/dev/null 2>>/var/log/cincel-cron.log
```

(`/var/log/cincel-cron.log` must be writable by that user, or point it at a
file in its home.)

Check:

```bash
scripts/ops/redesign-ops-check.sh all
```

- `env`: both secrets set in `.env.production` and in the running `app`.
- `cron`: the per-minute `/api/cron/tick` line and `CRON_SECRET=` are in the
  crontab.
- `tick`: one manual tick. Expect `HTTP 200` and a body like
  `{"ran":[{"job":"reminders-fire",...},{"job":"notifications-deliver",...},...],"skipped":[{"job":"daily-digest","reason":"window_done"},...]}`.
  `204` means the minute's cron tick held the lease: run `tick` again.

`notifications-deliver` runs on every tick. `daily-digest` runs once a day,
on the first tick at or after 07:30 in the org's time zone; on other ticks it
is listed under `skipped` with `not_due` (before 07:30) or `window_done`
(already ran today). To confirm it ran, after 07:30:

```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U cincel -d cincel -c "select job, window_key, status, finished_at from core.cron_runs where job = 'daily-digest' order by started_at desc limit 3"
```

Expect today's `daily-digest:<YYYY-MM-DD>` row with `status = done`.

- [ ] Crontab line installed; `tick` returns `HTTP 200` listing
      `notifications-deliver` and `daily-digest`.
- [ ] `core.cron_runs` has a `done` row for today's `daily-digest` window.
- [ ] Output of `scripts/ops/redesign-ops-check.sh all` (it never prints a
      secret) posted on the issue.
