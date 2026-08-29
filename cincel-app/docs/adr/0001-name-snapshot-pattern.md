# 0001 — Name-snapshot vs. foreign-key references

- **Status:** Proposed (2026-08-29)
- **Context source:** [core-schema review](https://claude.ai/code/artifact/1a7db737-71a3-4723-95cc-1d452a44258c), issue #116

## Context

Several `core` tables carry both a nullable foreign-key id **and** a
denormalized name string for the same reference:

| Table | FK column (nullable) | Snapshot column | FK populated on write? |
|---|---|---|---|
| `activities` | `project_id` | `project_name_snapshot` | **no** |
| `activities` | `manager_member_id` | `manager_name_snapshot` | **no** |
| `activity_support_members` | `team_member_id` | `support_name_snapshot` | **no** |
| `activity_history` | `author_member_id` | `author_name_snapshot` | **no** |
| `project_members` | `team_member_id` | `member_name_snapshot` | **yes** (resolved by name) |

Every read path matches on the snapshot string, usually with `ilike`
(`lib/assistant/tools.ts`, the dashboard aggregates, `list_projects`,
`team_workload_summary`). The FK columns exist in the schema and in the Drizzle
`relations()` graph but are dead in practice.

This is a carry-over from the localStorage era, where a "task" was a flat JSON
object with a `manager` string and no notion of referential identity. The
Postgres migration reproduced the columns faithfully but the write path was
never updated to resolve and store the ids.

### Why it matters

- **Renames don't propagate.** Change a team member's name in `equipo` and their
  existing tasks still show the old name; `team_workload_summary` splits their
  load across both spellings.
- **Joins are string joins.** `ilike '%name%'` against `manager_name_snapshot`
  cannot use a normal index (mitigated only by the `pg_trgm` work in #109) and
  is prone to partial-match collisions ("Ana" matches "Ana María" and "Susana").
- **The schema lies.** A reader sees `project_id uuid references projects(id)`
  and reasonably assumes it's the join key. It isn't.
- **Half-migrated is the worst state.** `project_members` resolves the id;
  nothing else does. Contributors can't tell which pattern to follow.

## Options

### (a) Commit to snapshots

Treat the name string as the intended reference and remove the pretence of FKs.

- Drop `activities.project_id`, `activities.manager_member_id`,
  `activity_support_members.team_member_id`, `activity_history.author_member_id`
  and their `relations()` entries.
- Keep `project_members.team_member_id` **only** if we also decide members are
  truly linked (see below) — otherwise drop it too for consistency.
- Document in `AGENTS.md` that names are the reference and renames are a
  deliberate, rare, manual operation.
- Add a "rename propagation" helper: on a team-member or project rename, run an
  `UPDATE … SET manager_name_snapshot = $new WHERE manager_name_snapshot = $old`
  across the affected tables, inside one transaction.
- Keep the `pg_trgm` indexes (#109) as the read-path answer.

**Pros:** small, honest, matches how the app already works. No backfill risk.
**Cons:** renames stay a special operation; `ilike` fuzzy matching stays;
reporting on "tasks with no valid manager" needs a name-existence check, not a
NULL check.

### (b) Reconnect the FKs

Make the id the reference; keep snapshots for display and audit only.

- On every write, resolve the name to a `team_members` / `projects` row and
  store the id. Unresolvable names → id stays NULL, snapshot still written.
- Backfill: one migration joining each snapshot to `team_members.name` /
  `projects.name`, logging the misses for manual fix.
- Migrate reads: `team_workload_summary`, `list_projects`, the dashboard, the
  assistant tools all move to id joins. Snapshots become presentational.
- Add `on delete set null` (or `restrict`) to make the intent explicit.

**Pros:** renames just work; real indexes; "orphaned" reporting is a NULL check;
the schema tells the truth.
**Cons:** larger change touching ~8 read sites and 4 write sites; the backfill
will have misses (typos, freelancers not in the roster) that need triage;
`activity_history.author` is genuinely a snapshot (the author's name *at the
time*) and should **not** be reconnected — it stays snapshot-only.

## Decision

**Recommend (a) — commit to snapshots** for `activities.manager`,
`activity_support_members`, and `activity_history.author`, and **(b) — reconnect**
for `activities.project_id` only.

Rationale:

- **Project** is a strong, low-cardinality, rarely-renamed entity that
  everything hangs off. A real `activities.project_id` FK is worth the backfill
  — and `list_projects` / the risk rollups get correct joins instead of
  `projectNameSnapshot` string-matching.
- **Manager / support / author** are people, and people data here is messy
  (freelancers, "Servicio Social", historical names). The snapshot is often the
  *only* correct value. Forcing a FK creates more NULL-handling than it removes.
  Keep the snapshot, drop the dead `*_member_id` columns, add the rename helper.

### Consequences

1. New migration: drop `activities.manager_member_id`,
   `activity_support_members.team_member_id`,
   `activity_history.author_member_id`; drop the matching `relations()` and the
   `idx_activities_manager_member_id` index.
2. New migration: backfill `activities.project_id` from `projects.name`; add
   `references(() => projects.id, { onDelete: "set null" })` (already declared —
   just populate it) and switch `list_projects` + risk rollups to join on it.
   Keep `project_name_snapshot` for display and for tasks whose project name
   doesn't resolve.
3. `project_members.team_member_id` stays and keeps being resolved (it already
   is); its uniqueness gap is handled separately (#108).
4. Add `renameTeamMemberEverywhere(oldName, newName)` /
   `renameProjectEverywhere(...)` helpers called from the equipo / project-edit
   actions, updating every snapshot column in one transaction.
5. `AGENTS.md`: document the split — "projects are linked by id; people are
   linked by name snapshot; renaming a person runs the propagation helper."

### Follow-up issues

- BE: drop the three dead `*_member_id` columns + relations + index
- BE: backfill + adopt `activities.project_id`; migrate the 4 read sites
- BE: `renameTeamMemberEverywhere` / `renameProjectEverywhere` helpers
