# Table Inventory: pre-rebuild → greenfield model

Reference for the Phase 9 cutover (`core.legacy_refs`, `docs/deployment.md`'s
cutover section). Maps every table in the old (pre-rebuild) `core` schema to
its replacement in the greenfield model introduced by Rebuild Phase 1
(`lib/db/schema/`).

| Old table | New table(s) | Notes |
|---|---|---|
| `clients` | `contacts` (`type = 'cliente'`) | Clients, socios and proveedores are now one typed table. |
| `client_contacts` | `contact_people` | Renamed; same concept (people at a contact). |
| `client_history` | `history_events` (`entity = 'contact'`) | Folded into the single audit log. |
| `contractors` | `contacts` (`type = 'proveedor'`, `provider_profiles.subtype = 'contratista'`) | |
| `contractor_categories` | `contact_tags` (`kind = 'categoria'`) | |
| `collaborator_providers` | `contacts` (`type = 'proveedor'`, `provider_profiles.subtype = 'colaborador'`) | `provider_profiles.staff_id` optionally links to a real `staff` row for freelance collaborators who also execute tasks. |
| `collaborator_categories` | `contact_tags` (`kind = 'categoria'`) | |
| `collaborator_skills` | `contact_tags` (`kind = 'habilidad'`) | |
| `stores` | `contacts` (`type = 'proveedor'`, `provider_profiles.subtype = 'tienda'`) | |
| `store_categories` | `contact_tags` (`kind = 'categoria'`) | |
| `team_members` | `staff` | Auth/login moved to `auth_credentials` (1:1 with `staff`), department moved to `area_members` (many-to-many with `areas`). |
| `activities` | `tasks` | `description` → `title`. Workflow-originated activities now carry `workflow_id`/`template_id`; freeform ones are `kind = 'usuario'`. |
| `activity_support_members` | `task_support` | |
| `activity_history` | `history_events` (`entity = 'task'`) | |
| `activity_checklist_items` | `task_checklist_items` | |
| `projects` | `projects` | Same name, new shape: `client_id` (FK into typed `contacts`) is now `NOT NULL`, `current_workflow_id` replaces a freeform stage field. |
| `project_drive_links` | `project_links` | Renamed; `kind` replaces purpose-specific columns. |
| `project_members` | `project_members` | Same name/shape, FK now points at `staff`. |
| (none) | `project_contacts` | New: partners/providers on a project (was implicit before). |
| `resource_links` | `resource_links` | Same name; `owner_id`/`personal_for_id` now FK `staff` instead of `team_members`. |
| `auth_credentials` | `auth_credentials` | Same name, now FKs `staff` instead of `team_members`. |
| `sessions` | `sessions` | Same name, now FKs `staff`. |
| (none) | `workflows`, `workflow_task_templates`, `area_workflows` | New: the 4 fixed workflows (Presale/Diseño/Construcción/Decoración) and their task templates, replacing hardcoded department logic in the app layer. |
| (none) | `areas`, `area_members` | New: internal departments as real rows instead of a freeform `team_members.area` string. |
| (none) | `client_stats` | New: a view deriving per-client project counts/amounts, replacing stored counters. |
| (none) | `legacy_refs` | New: empty until the real data cutover (see below). |

## `core.legacy_refs`

Added in Phase 1 as the mapping table the eventual data cutover will
populate: `(entity, legacy_id) → row_id`, letting a migration script resolve
"the old numeric id 42 in `activities`" to "the new uuid in `tasks`". See the
schema comment on `legacyRefs` in `lib/db/schema/shared.ts` for the exact
column documentation. It is empty on every environment today -- this phase
only prepares the mechanism, it does not run the cutover.

## Cutover mechanism

See the "Rebuild cutover" section in `docs/deployment.md` for how
`DATABASE_URL` would be pointed at the new database on the day of the actual
cutover, and the rollback procedure.
