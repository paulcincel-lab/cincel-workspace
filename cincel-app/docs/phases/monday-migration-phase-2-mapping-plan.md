# monday Migration Phase 2: Mapping, Translate + Plan

## Goal
From an export, `init` drafts a valid `mapping.json` and `plan` produces a complete dry-run `plan.md` with every blocking issue, so a clean plan is guaranteed to apply.

## Deliverables

### Backend
- [ ] `scripts/monday/mapping.schema.ts`: Zod 4 `Mapping` exactly as BE §5.4 (`ColumnTarget`, `ClientRef`, `StatusTarget`, `BoardMapping`, `people`, `options`)
- [ ] `scripts/monday/init.ts` (no monday calls): people by lower(email) → staff, guests → contact; board strategy detection (§5.1); column targets by type; status maps **by label id** with the default regexes and custom-status name match; client via relation column or `pg_trgm` ≥ 0.8; `contactMatches` for existing contacts; area/workflow by workspace name; template matches ≥ 0.85; cronograma enabled for `board_as_project` with timeline (BE §5.3)
- [ ] `scripts/monday/sanitize.ts`: HTML → text with `sanitize-html` allowlist `p, br, b, i, ul, ol, li, a`; links kept as "text (url)" (BE §2)
- [ ] `scripts/monday/translate.ts` (pure): (export, mapping, Cincel lookups) → planned rows for every row of BE §5.2: titles/names with `projectNames` overrides; group → `phase` + `seccion` with dense-rank `seccion_order`; integer `sort_order`; status via label id, custom status sets `status = underlyingStatus()`; priority; people → manager + `task_support`, guests → `contact_people`; timeline/date/notes; dependencies (finish-to-start); subitems as checklist (depth-first, "Padre › Hijo") or child tasks (flattened to one level, `path` in data); updates → `history_events` oldest first with `monday · {name}:` fallback and `[{subitem}]` prefix; files → planned `import_files`; `kind` workflow vs usuario; provider profiles; `import_refs.data` (`source`, `columns` keyed by title with `#<columnId>` on duplicates, `subitems`, `start`, `milestone`); project progress/dates/status (BE §5.2, §7, §0.4); cronograma rows (BE §6.1)
- [ ] `scripts/monday/plan.ts`: all issue codes of BE §6 (blocking: `MAPPING_INVALID`, `CLIENT_UNRESOLVED`, `CONTACT_NAME_TAKEN`, `PROJECT_NAME_TAKEN`, `PROJECT_CODE_TAKEN`, `STATUS_UNMAPPED`, `TEMPLATE_COLLISION`, `TEMPLATE_INVALID`, `PROVIDER_SUBTYPE_MISSING`, `SCHEDULE_EXISTS`, `DRIVE_NOT_CONFIGURED`; warnings: `PERSON_UNMATCHED`, `RELATION_MISSING`, `DATES_MISSING`, `FILE_MISSING`); per-board counts incl. rows skipped via existing `import_refs`; writes only `exports/<client>/plan.md` + console summary
- [ ] Wire `init` and `plan` into `cli.ts`
- [ ] Vitest with fixture exports: Zod mapping; `init` heuristics; every §5.2 row (reordered labels → same result, custom status derivation, dense rank, both subitem modes, timeline → dates + cronograma, dependencies, guests, files → links, duplicate column titles); every plan issue code incl. the three uniqueness checks; HTML sanitizing (BE §11)

### Frontend
- [ ] None

### Infrastructure
- [ ] `sanitize-html` dependency added

## Done Definition
- `init` on a fixture export writes a mapping that passes Zod; on the test account's real export it drafts sensible strategies, people and status maps (BE §12 #2)
- `plan` lists every blocking issue with board and item ids; editing `mapping.json` and re-running clears them (BE §12 #2)
- Reordering status labels between two fixture exports yields identical planned rows (BE §12 #6)
- Plan counts per board match the hand-counted fixture totals

## Parallel work
- `mapping.schema.ts` + `sanitize.ts` first (tiny); then `init.ts` ∥ `translate.ts`; `plan.ts` after `translate.ts`
- Runs in parallel with monday Migration Phase 4 (app features)

## Phase dependencies
- Requires: monday Migration Phase 1 (export format + fixtures, `scripts/monday/db.ts`, schema incl. `import_refs`, `drive-admin.ts` for the `DRIVE_NOT_CONFIGURED` check)

## Complexity
- Backend: L
- Frontend: S
- Infra: S

## Risks
- `translate.ts` is the largest piece; keep it pure and fixture-tested so `apply` stays a thin writer
- Plan must mirror every DB constraint `apply` hits; any constraint missed here becomes a mid-transaction failure in Phase 3
- `init` thresholds (trigram 0.8 / 0.85) may need tuning on the first real export
