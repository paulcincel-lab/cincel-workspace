# Staff SSO Phase 4: Legacy Cleanup Release

## Goal
After passwords are off in production, the delegation Drive client, the "connect any Google account" flow and legacy plaintext token rows are gone.

## Deliverables

### Backend
- [ ] Delete `lib/google/client.ts` (delegation) and the delegation branch of `app/api/google/drive/*` (BE §A.8 step 5)
- [ ] Delete `app/api/google/oauth/*` and `lib/google/oauth.ts` usages of the old connect flow
- [ ] Migration deleting `google_oauth_accounts` rows with `google_sub` null (BE §A.3, §A.8 step 5)
- [ ] `/api/google/drive/status` always reports `mode: "staff_token"`

### Frontend
- [ ] Remove the old "Conectar cuenta de Google" UI and account switcher code paths from the picker and Calendario

### Infrastructure
- [ ] Remove delegation-only env/docs from `.env.example`, `docs/google-drive.md`, `kcd.yml`
- [ ] Confirm the client removed the domain-wide delegation grant; close issue #134 as no longer needed (BE §0.2 decision 6, §A.9 item 8)

## Done Definition
- No code references `lib/google/client.ts` or `app/api/google/oauth/*`; build, lint and tests pass
- No `google_oauth_accounts` rows with `google_sub` null remain after the migration
- Picker, Archivos and Calendar sync work in production with staff tokens only

## Parallel work
- Single small release; BE and FE removals can be split into two PRs in parallel

## Phase dependencies
- Requires: Staff SSO Phases 2 and 3 merged **and** cutover step 3 (`AUTH_PASSWORD_ENABLED=false`) run in production
- Can run alongside Client Portal phases (no shared files)

## Complexity
- Backend: S
- Frontend: S
- Infra: S

## Risks
- Destructive migration; only ship once production has run on staff tokens
