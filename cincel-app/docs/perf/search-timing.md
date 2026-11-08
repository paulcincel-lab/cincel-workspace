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

## The index to add when p95 is over target

The spec does not set a numeric p95 target for search; the palette debounces
200 ms (FE §3.12). Whoever reads the table below decides whether p95 is too
high. If it is, add trigram indexes on the folded expressions the queries use,
starting with the slow types. They go in the Drizzle schema (so a migration is
generated), e.g. for tasks in `lib/db/schema/tasks.ts`:

```ts
index("idx_tasks_title_folded_trgm").using(
  "gin",
  sql`translate(lower(coalesce(${t.title}, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops`
),
```

The expression must match `fold()` in `lib/search/search.ts` character for
character, including the two translate strings, or Postgres won't use it.
Re-run step 4 afterwards and post both tables.

## Results

| Date | Dataset (tasks / projects / staff) | Table |
|---|---|---|
| _pending_ | _pending_ | _paste the `measure-search.ts` output here and on issue #912_ |
