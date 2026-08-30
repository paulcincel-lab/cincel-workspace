# Phase 6: Google Drive per-user impersonation

## Goal
Replace the single-identity Google Drive service account with domain-wide delegation so each user sees only the Drive files shared with their own Workspace email.

## Deliverables

### Backend
- [ ] Refactor `lib/google/client.ts`: replace `getDriveClient()` with `getDriveClientFor(userEmail)` — JWT per user, short-TTL cache
- [ ] Remove `GOOGLE_SA_SUBJECT` from `.env.example`, compose files, and `client.ts`
- [ ] Thread `session.user.email` through API routes (`list`, `file/[id]`, `status`) into drive-repository calls
- [ ] Graceful degradation: impersonation failure returns empty list / 503-style, never falls back to another identity
- [ ] Confirm `use-drive-enabled.ts` / `DrivePickerDialog` do not assume a single global Drive state

### Frontend
- [ ] (Confirm-only) Verify picker button visibility remains a static "is Drive configured" check — no code change expected

### Infrastructure
- [ ] GCP: confirm project + Drive API enabled, verify existing service account
- [ ] Workspace Admin Console: authorize SA client ID for `drive.readonly` scope via domain-wide delegation
- [ ] Audit `team_members.institutional_email` against real Workspace emails; document mismatches
- [ ] Document rollback kill switch (revoke delegation in Admin Console)

### Tests
- [ ] Unit: `getDriveClientFor` returns distinct cached clients per email; returns `null` when SA creds absent
- [ ] Unit: API routes pass session email through (mock `getSession`, assert repository receives it)
- [ ] e2e: extend `google-drive-api.spec.ts` — unauth 401 and unconfigured 503 still pass

### Docs
- [ ] Add `docs/google-drive.md`: delegation model, Workspace admin steps, institutional-email-matching requirement, kill switch

## Done Definition
- Every Drive API request impersonates the logged-in user's institutional email, not a fixed subject
- `GOOGLE_SA_SUBJECT` env var is fully removed from codebase
- A user whose institutional email has no Drive permissions sees an empty picker (not an error)
- Impersonation failure for a specific user does not expose another user's files
- Domain-wide delegation can be revoked in Workspace Admin Console as an instant kill switch
- All existing `google-drive-api.spec.ts` tests pass; new unit tests for per-user client creation pass

## Parallel work
- INFRA: Workspace admin delegation setup can run alongside BE: client.ts refactor + route changes
- BE: unit tests can be written in parallel with the client.ts refactor (test-first)

## Phase dependencies
- Requires: Phase 4 (Google Drive Integration) — the existing Drive routes, client, and picker code

## Complexity
- Backend: M
- Frontend: S (confirm-only, no change expected)
- Infra: M (Workspace admin config + email audit)

## Risks
- Institutional email mismatches between `team_members` table and actual Workspace accounts will silently fail impersonation — audit before rollout
- Domain-wide delegation propagation can take up to 24 hours in some Workspace tenants
- If any user lacks a Google Workspace license, impersonation for that user will fail — graceful degradation handles this but it may surprise users
