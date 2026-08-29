# 0002 — Audit-log representation

- **Status:** Proposed (2026-08-29)
- **Context source:** [core-schema review](https://claude.ai/code/artifact/1a7db737-71a3-4723-95cc-1d452a44258c), issue #117
- **Related:** [0001](0001-name-snapshot-pattern.md)

## Context

Three unrelated representations of "what happened to this record" coexist:

| Where | Shape | Purpose |
|---|---|---|
| `core.client_history` | `field`, `before_value`, `after_value`, `author_name`, `event_at` | structured field-level change log |
| `core.activity_history` | `comment`, `author_name_snapshot`, `event_date` | free-text chronological bitácora |
| `resource_links.history` (jsonb array) | untyped `Record<string, unknown>[]` | catch-all, shape set by whatever wrote it |

`AGENTS.md` makes audit trails a hard product rule — *"Nunca eliminar
historial. Las notas funcionan como una bitácora cronológica."* — but the
implementation is inconsistent, and one of the three (jsonb) can't be queried,
constrained, or migrated safely.

There are genuinely **two different needs** here and they shouldn't collapse
into one table:

1. **Field change** — "coordinator went from Ana to Beto on the 12th". Rendered
   as a diff. Machine-readable. This is `client_history`.
2. **Note / bitácora** — "Cliente pidió ampliar la cocina". Free prose, authored
   deliberately by a person, ordered chronologically. This is
   `activity_history`.

## Decision

**Keep both shapes, standardize their columns, and eliminate the jsonb one.**

### Canonical "field change" table — `core.entity_change_log`

Replaces `client_history`, and becomes available to any entity.

```
id              uuid pk
entity_type     text        -- 'client' | 'project' | 'activity' | 'team_member' | 'resource_link'
entity_id       uuid        -- the core row's uuid pk
field           text
before_value    text        -- '' when the field was empty
after_value     text
author_name     text        -- snapshot (see ADR 0001 — people are snapshots)
author_member_id uuid null references team_members(id)  -- best-effort, not required
occurred_at     timestamptz not null default now()
+ timestamps (no deleted_at — history is append-only, never deleted)
```

Indexes: `(entity_type, entity_id, occurred_at)`.

### Canonical "note" table — `core.entity_note`

Generalizes `activity_history` (which is really a note log, not a change log —
its column is `comment`, not before/after).

```
id              uuid pk
entity_type     text
entity_id       uuid
body            text not null
author_name     text
author_member_id uuid null references team_members(id)
occurred_at     timestamptz not null default now()
+ timestamps (no deleted_at)
```

Indexes: `(entity_type, entity_id, occurred_at)`.

### `resource_links.history`

Migrate each jsonb entry into `entity_note` (`entity_type = 'resource_link'`,
best-effort field mapping), then drop the jsonb column.

## Why not one unified table

A single `audit_log` with a nullable `field`/`before`/`after` **and** a nullable
`body` invites half-populated rows and ambiguous rendering. The two tables are
cheap and each has an unambiguous shape and unambiguous UI.

## Why `deleted_at` is omitted

These tables are the one place in the schema where append-only is a **product
requirement**, not a convention. No soft-delete column, no `DELETE` grant in the
app's queries. Correcting a mistaken entry means appending a correction, not
editing.

## Consequences / migration path

1. Create `entity_change_log` and `entity_note`.
2. Copy `client_history` → `entity_change_log` (`entity_type = 'client'`,
   `entity_id` = the client uuid; `event_at` → `occurred_at`).
3. Copy `activity_history` → `entity_note` (`comment` → `body`;
   `event_date::timestamptz` → `occurred_at`; keep `legacy_id` mapping only if
   the UI still needs stable ids — see `toTask` in `activities-actions.ts`).
4. Copy `resource_links.history` rows → `entity_note`.
5. Repoint the writers: `clients-actions` (change log), `activities-actions`
   `upsertActivity` history block (notes — and per **#113** this becomes
   append-only, not delete-and-reinsert), `resources-actions`.
6. Repoint the readers: the client detail history panel, the task drawer
   bitácora, the resource card.
7. Drop `client_history`, `activity_history`, `resource_links.history` once
   nothing reads them (separate cleanup migration, one release later).

Keep the old tables through one release as a rollback path.

### Follow-up issues

- BE: create `entity_change_log` + `entity_note` tables
- BE: migrate + repoint clients change-log
- BE: migrate + repoint activity bitácora (coordinate with #113 — append-only)
- BE: migrate + repoint `resource_links.history`, drop the jsonb column
- BE: drop the three legacy tables (one release later)
