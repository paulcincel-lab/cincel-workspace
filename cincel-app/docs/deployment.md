# Cincel Workspace — Deployment Guide

## Environment Variables

### Required for Supabase / Production

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (production) | Project URL from Supabase Dashboard |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (production) | Publishable anon key (formerly `ANON_KEY`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alias | Legacy name, accepted for backward compatibility |
| `NEXT_PUBLIC_CINCEL_DATA_SOURCE` | Yes (production) | Must be `supabase` in production |
| `CINCEL_ADMIN_EMAILS` | Recommended | Comma-separated list of emails that receive automatic Administrador role (see below) |

### Per-environment values

| Environment | `NEXT_PUBLIC_CINCEL_DATA_SOURCE` | Notes |
|---|---|---|
| Local dev (no Supabase credentials) | *(unset — defaults to `localstorage`)* | All data is stored in browser localStorage; multi-user and cross-session persistence are not available |
| Local dev with Supabase | `supabase` | Requires real Supabase project credentials in `.env.local` |
| Staging | `supabase` | Must match a dedicated staging Supabase project |
| Production | `supabase` | **Required.** Setting this to `localstorage` in production means all business data lives only in each user's browser — no sharing, no backup, no collaboration |

### Data Source Fallback Behavior

`lib/supabase/data-source.ts` defaults to `"localstorage"` when the variable is unset.
This default is intentional for local development: contributors without Supabase
credentials can run `npm run dev` and use the full UI with seeded mock data.

The middleware (`middleware.ts`) is also a no-op when Supabase env vars are absent,
so the app remains fully usable in localstorage mode without Supabase credentials.

### Supabase env file for local dev

Copy `supabase/env.example` to `.env.local` and fill in the values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase
CINCEL_ADMIN_EMAILS=paul@cincel.mx,juanma@cincel.mx
```

## Admin Email List (`CINCEL_ADMIN_EMAILS`)

`CINCEL_ADMIN_EMAILS` is a comma-separated list of institutional email addresses that
receive the `Administrador` system role automatically, even if their `team_members` row
has a different role. This replaces the previous hardcoded `SYSTEM_ADMIN_MEMBER_EMAILS`
constant in `lib/data/roles.ts`.

When the variable is unset, the list is empty — no automatic admin escalation.

Example: `CINCEL_ADMIN_EMAILS=paul@cincel.mx,juanma@cincel.mx`

## What Needs a Real Supabase Project

The following features require a Supabase project with team members pre-registered
in `auth.users`:

- Real authentication (`supabase.auth.signInWithPassword`)
- Server-side session middleware
- RLS policies (migration `202608250001_rls_scoped_policies.sql`)
- PII endpoint (`/api/team/sensitive/[id]`)
- Cross-session data persistence

None of these can be fully verified in a sandbox without live Supabase credentials.
See `scripts/smoke-test-supabase.mjs` for the post-deploy verification script.

## Smoke Test

After deploying to a Supabase-connected environment, run:

```bash
# Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SMOKE_TEST_EMAIL, and SMOKE_TEST_PASSWORD to be set.
node scripts/smoke-test-supabase.mjs
```

This script:
1. Signs in as `SMOKE_TEST_EMAIL`
2. Creates a test record (writes to Supabase)
3. Signs out and signs back in as a second user
4. Verifies the record is visible to the second user (cross-session persistence)
5. Cleans up the test record

The `SMOKE_TEST_PASSWORD` used in this script is synthetic test data (`Temporal123` or
any value configured in the CI environment). It is never a real production credential —
real users authenticate through Supabase Auth, which enforces its own password policies.
