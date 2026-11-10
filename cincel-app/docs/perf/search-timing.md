# Workspace search timing (⌘K)

Search behind the command palette: `searchWorkspaceAction` → `lib/search/search.ts`
(BE §8.9). This page holds how to measure it and the results table. The
numbers must come from a production-sized copy of the database, never from the
live database and never from the shared dev database while people use it.

## What the code does (code reading)

- One query per type, in parallel: proyecto (`projects.name`, `code`), tarea
  (`tasks.title`), persona (`staff.name`, `last_name`, full name, `email`;
  `contacts.name` with `clients.canViewClients`), archivo
  (`drive_files.file_name` through visible `project_links`), nota (the
  caller's `notes.title`, `body`).
- Every field is compared folded:
  `translate(lower(coalesce(col, '')), 'áà…', 'aa…') LIKE '%q%'` (plus `=`,
  prefix and word-start cases), and ranked with `similarity()` on the same
  folded expression.
- The trigram indexes in the schema are on the **raw** columns
  (`idx_projects_name_trgm`, `idx_tasks_title_trgm`, `idx_staff_name_trgm`,
  `idx_contacts_name_trgm`). Postgres only uses an index for an expression when
  the index is on that same expression, so the folded `LIKE` predicates are
  expected to scan the tables. With a few thousand rows per table that is still
  fast; with tens of thousands of tasks it is the first thing to grow.
- `projects.code`, `staff.last_name`, `staff.email`, `drive_files.file_name`,
  `notes.title` and `notes.body` have no trigram index at all.

## How to measure

Run on a machine that is not the live host, against a throwaway Postgres that
holds a copy of the largest real dataset.

```bash
# 1. Throwaway Postgres on a free port (5440 here; not 5432/5433, which other
#    local databases use).
docker run -d --name cincel-search-perf -p 5440:5432 \
  -e POSTGRES_PASSWORD=perf -e POSTGRES_DB=cincel postgres:16

# 2. Load the copy: a pg_dump of the largest dataset (see docs/backup-recovery.md,
#    "Opción B"), restored into the throwaway database.
pg_restore --no-owner --no-privileges \
  -d postgres://postgres:perf@127.0.0.1:5440/cincel /path/to/cincel.dump

#    Without a dump: migrate an empty database, run scripts/seed.ts, then
#    scripts/perf/seed-search-volume.ts (synthetic, production-sized).

# 3. Bring the copy to the current schema.
cd cincel-app
DATABASE_URL=postgres://postgres:perf@127.0.0.1:5440/cincel npm run db:migrate

# 4. Measure (read only). Prints a Markdown table: viewer, query, results, p50, p95, max.
DATABASE_URL=postgres://postgres:perf@127.0.0.1:5440/cincel \
  SEARCH_RUNS=50 SEARCH_QUERIES="casa,diseño,obra,plano,ana,revisar" \
  npx tsx --conditions=react-server scripts/measure-search.ts

# 5. Row counts, to read the numbers against.
psql postgres://postgres:perf@127.0.0.1:5440/cincel -c "
  select 'projects', count(*) from core.projects union all
  select 'tasks', count(*) from core.tasks union all
  select 'staff', count(*) from core.staff union all
  select 'contacts', count(*) from core.contacts union all
  select 'drive_files', count(*) from core.drive_files union all
  select 'notes', count(*) from core.notes;"

# 6. Tear down.
docker rm -f cincel-search-perf
```

If a query is slow, check its plan on the same copy, e.g. for tasks:

```sql
explain (analyze, buffers)
select id from core.tasks
where deleted_at is null and archived = false
  and translate(lower(coalesce(title, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') like '%plano%'
limit 20;
```

A `Seq Scan on tasks` with a high actual time is the case the index below fixes.

## Target and indexes

The spec does not set a numeric p95 target for search; the palette debounces
200 ms (FE §3.12), so 200 ms p95 is the working target.

The first measurement (below) was far over it, so the schema now has GIN
trigram indexes on the folded expressions the queries use:
`idx_tasks_title_folded_trgm`, `idx_projects_name_folded_trgm`,
`idx_projects_code_folded_trgm`, `idx_contacts_name_folded_trgm` and
`idx_drive_files_file_name_folded_trgm`. They are built with `foldedTrgm()`
and the queries fold with `foldedText()` (both in `lib/db/schema/_schema.ts`),
so the expression is the same character for character and the translate
strings are literals, not bind parameters. For a one-word query (letters and
digits only) the `WHERE` is the plain `folded LIKE '%q%'` the indexes serve;
it matches exactly the rows the full match weight would. Other queries keep
the full match weight as the predicate. Staff and notes have no folded index:
staff is small and notes are read per owner through `idx_notes_staff_live`.

## Results

Synthetic production-sized copy (`scripts/perf/seed-search-volume.ts` on top
of `scripts/seed.ts`): 40,000 tasks, 500 projects, 47 staff, 1,500 contacts,
20,000 drive files, 24,000 project links, 8,000 notes. That is several times
the largest real dataset, and its small vocabulary makes common words match
far more rows than real data (`plano` matches 6,308 tasks and 4,309 files), so
the broad queries are an upper bound. Postgres 17 in Docker on a 4-CPU Linux
machine with a load average of about 40 during both runs, so absolute numbers
are inflated; compare before and after. 50 runs per query, limit 20.

**2026-11-10, before (no folded indexes)**

| Viewer | Query | Results | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|
| Administrador | casa | 20 | 1037.1 | 1303.6 | 1679.3 |
| Administrador | diseño | 20 | 1119.1 | 1423.6 | 1494.3 |
| Administrador | obra | 20 | 1156.2 | 1603.6 | 1803.9 |
| Administrador | plano | 20 | 1168.3 | 1481.3 | 1694.8 |
| Administrador | ana | 20 | 1014.1 | 1339.9 | 1440.0 |
| Administrador | revisar | 20 | 1088.3 | 1490.4 | 1632.7 |
| Colaborador | casa | 20 | 1018.2 | 1604.6 | 1640.3 |
| Colaborador | diseño | 20 | 1045.3 | 1266.1 | 1340.1 |
| Colaborador | obra | 20 | 1073.8 | 1337.0 | 1424.2 |
| Colaborador | plano | 20 | 1141.6 | 1441.1 | 1487.0 |
| Colaborador | ana | 20 | 940.4 | 1254.6 | 1605.0 |
| Colaborador | revisar | 20 | 1009.6 | 1262.1 | 1396.4 |

**2026-11-10, after (folded indexes)**

| Viewer | Query | Results | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|
| Administrador | casa | 20 | 66.2 | 113.9 | 126.2 |
| Administrador | diseño | 20 | 312.6 | 399.1 | 425.5 |
| Administrador | obra | 20 | 308.0 | 399.5 | 442.6 |
| Administrador | plano | 20 | 388.8 | 513.9 | 530.2 |
| Administrador | ana | 20 | 58.3 | 91.8 | 104.3 |
| Administrador | revisar | 20 | 144.0 | 244.2 | 263.2 |
| Colaborador | casa | 20 | 44.6 | 77.1 | 104.0 |
| Colaborador | diseño | 20 | 311.2 | 403.7 | 449.0 |
| Colaborador | obra | 20 | 320.0 | 398.8 | 512.0 |
| Colaborador | plano | 20 | 403.7 | 485.1 | 619.3 |
| Colaborador | ana | 20 | 51.3 | 87.6 | 123.0 |
| Colaborador | revisar | 20 | 128.9 | 212.0 | 270.7 |

The single tasks query for `plano` went from 528 ms (sequential scan) to
89 ms (bitmap scan on `idx_tasks_title_folded_trgm`). What is left on the
broad queries is ranking the thousands of matching rows, not finding them.
Re-run step 4 on an idle machine against a copy of the real data once the
migration with these indexes is applied.
