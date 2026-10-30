/**
 * `npm run monday -- plan --export exports/<client>`
 * (docs/specs/monday-migration/backend.md §6, §11, §12 #2).
 *
 * The dry run. Reads the export folder, its mapping.json and the Cincel DB;
 * translates (scripts/monday/translate.ts) and runs every constraint check
 * `apply` would hit, so a clean plan never fails mid-transaction. Writes only
 * `exports/<client>/plan.md` and prints a summary; exits 1 while any
 * blocking issue is left.
 *
 *   Blocking  MAPPING_INVALID, CLIENT_UNRESOLVED, CONTACT_NAME_TAKEN,
 *             PROJECT_NAME_TAKEN, PROJECT_CODE_TAKEN, STATUS_UNMAPPED,
 *             TEMPLATE_COLLISION, TEMPLATE_INVALID, PROVIDER_SUBTYPE_MISSING,
 *             SCHEDULE_EXISTS, DRIVE_NOT_CONFIGURED (only with files on).
 *   Warnings  PERSON_UNMATCHED, RELATION_MISSING, DATES_MISSING, FILE_MISSING.
 *
 * Rows already in `core.import_refs` (files: already in `core.import_files`)
 * are skipped: `apply` doesn't create them again, so they are counted apart
 * and left out of the checks.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";

import {
  areas,
  areaWorkflows,
  contacts,
  importFiles,
  importRefs,
  projects,
  projectSchedules,
  providerSubtype,
  staff,
  tasks,
  taskStatuses,
  workflows,
  workflowTaskTemplates,
} from "../../lib/db/schema";
import type { DriveAdmin } from "../../lib/google/drive-admin";
import {
  findImportRefs,
  type ImportDb,
  type ImportEntity,
} from "../../lib/import/refs";
import { createMondayDb, type MondayDbHandle } from "./db";
import type { FileIndex, UpdateLine } from "./export";
import { DONE_FILE, FILES_DIR, FILES_INDEX } from "./export";
import {
  MAPPING_FILE,
  readExport,
  readJson,
  readNdjson,
  type ContactType,
} from "./init";
import { Mapping, type BoardMapping } from "./mapping.schema";
import { openServiceAccountDrive } from "./rollback";
import type { CliIo, CommandHandler } from "./run";
import {
  translate,
  type CincelLookups,
  type ExportData,
  type PlannedImportFile,
  type PlannedProject,
  type RowRef,
  type TranslateResult,
} from "./translate";

export const PLAN_FILE = "plan.md";

/**
 * `created_by_id` / fallback author while planning. `plan` takes no `--by`;
 * the importer only matters to `apply`, never to a check or a count.
 */
export const PLAN_IMPORTER_ID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const BLOCKING_CODES = [
  "MAPPING_INVALID",
  "CLIENT_UNRESOLVED",
  "CONTACT_NAME_TAKEN",
  "PROJECT_NAME_TAKEN",
  "PROJECT_CODE_TAKEN",
  "STATUS_UNMAPPED",
  "TEMPLATE_COLLISION",
  "TEMPLATE_INVALID",
  "PROVIDER_SUBTYPE_MISSING",
  "SCHEDULE_EXISTS",
  "DRIVE_NOT_CONFIGURED",
] as const;

export const WARNING_CODES = [
  "PERSON_UNMATCHED",
  "RELATION_MISSING",
  "DATES_MISSING",
  "FILE_MISSING",
] as const;

export type PlanIssueCode =
  (typeof BLOCKING_CODES)[number] | (typeof WARNING_CODES)[number];

export interface PlanIssue {
  code: PlanIssueCode;
  blocking: boolean;
  boardId?: string;
  itemId?: string;
  message: string;
}

const BLOCKING = new Set<PlanIssueCode>(BLOCKING_CODES);

function makeIssue(
  code: PlanIssueCode,
  message: string,
  boardId?: string,
  itemId?: string,
): PlanIssue {
  const out: PlanIssue = { code, blocking: BLOCKING.has(code), message };
  if (boardId) out.boardId = boardId;
  if (itemId) out.itemId = itemId;
  return out;
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

/** Rows `apply` creates for one board (BE §6), plus the ones it skips. */
export interface BoardCounts {
  boardId: string;
  name: string;
  strategy: BoardMapping["strategy"];
  contacts: number;
  projects: number;
  tasks: number;
  childTasks: number;
  checklistItems: number;
  dependencies: number;
  comments: number;
  cronogramaRows: number;
  files: number;
  /** Planned rows left out because `import_refs` / `import_files` has them already. */
  skipped: number;
}

export type CountKey = Exclude<
  keyof BoardCounts,
  "boardId" | "name" | "strategy"
>;

export interface PlanTotals extends Record<CountKey, number> {
  contactPeople: number;
  providerProfiles: number;
  taskSupport: number;
  projectSchedules: number;
}

/** What `apply` writes: the translation and what of it exists already. */
export interface PlanTranslation {
  mapping: Mapping;
  result: TranslateResult;
  /** entity → externalId → row id of the planned rows `import_refs` has already. */
  imported: Map<ImportEntity, Map<string, string>>;
  /** The files to upload: not in `import_files` yet and on disk. */
  files: PlannedImportFile[];
}

export interface Plan {
  issues: PlanIssue[];
  boards: BoardCounts[];
  totals: PlanTotals;
  /** Absent when the mapping is invalid (nothing was translated). */
  translation?: PlanTranslation;
}

function emptyTotals(): PlanTotals {
  return {
    contacts: 0,
    projects: 0,
    tasks: 0,
    childTasks: 0,
    checklistItems: 0,
    dependencies: 0,
    comments: 0,
    cronogramaRows: 0,
    files: 0,
    skipped: 0,
    contactPeople: 0,
    providerProfiles: 0,
    taskSupport: 0,
    projectSchedules: 0,
  };
}

// ---------------------------------------------------------------------------
// Cincel lookups
// ---------------------------------------------------------------------------

/** What `plan` asks the Cincel DB. Tests pass a fake. */
export interface PlanLookups {
  /** Custom statuses, templates and staff for translate. */
  translateLookups(): Promise<CincelLookups>;
  /** externalId → row id of the monday import refs of `entity` among `externalIds`. */
  importedRefs(
    entity: ImportEntity,
    externalIds: string[],
  ): Promise<Map<string, string>>;
  /** Asset ids that already have an `import_files` row. */
  importedAssets(assetIds: string[]): Promise<Set<string>>;
  /** id → type of the live contacts among `ids`. */
  contactTypes(ids: string[]): Promise<Map<string, ContactType>>;
  /** lower(name) of live contacts of `type` among `lowerNames`. */
  contactNamesTaken(
    type: ContactType,
    lowerNames: string[],
  ): Promise<Set<string>>;
  /** `${clientId}|${lower(name)}` of live projects among the pairs. */
  projectNamesTaken(
    pairs: { clientId: string; lowerName: string }[],
  ): Promise<Set<string>>;
  /** Codes used by live projects among `codes`. */
  projectCodesTaken(codes: string[]): Promise<Set<string>>;
  /** Live workflow ids among `ids`. */
  workflowIds(ids: string[]): Promise<Set<string>>;
  /** Live area id → its live workflow ids, for the areas among `ids`. */
  areaWorkflowIds(ids: string[]): Promise<Map<string, string[]>>;
  /** `${projectId}|${templateId}` of live tasks among the pairs. */
  projectTemplatesTaken(
    pairs: { projectId: string; templateId: string }[],
  ): Promise<Set<string>>;
  /** Projects among `projectIds` with a `project_schedules` row this import didn't create. */
  foreignSchedules(projectIds: string[]): Promise<Set<string>>;
}

const pairKey = (a: string, b: string) => `${a}|${b}`;

/** `PlanLookups` over the Cincel DB. */
export function createPlanDbLookups(db: ImportDb): PlanLookups {
  return {
    async translateLookups() {
      const [statusRows, templateRows, staffRows] = await Promise.all([
        db
          .select({
            id: taskStatuses.id,
            name: taskStatuses.name,
            closes: taskStatuses.closes,
          })
          .from(taskStatuses)
          .where(isNull(taskStatuses.deletedAt)),
        db
          .select({
            id: workflowTaskTemplates.id,
            workflowId: workflowTaskTemplates.workflowId,
          })
          .from(workflowTaskTemplates),
        db
          .select({ id: staff.id, name: staff.name })
          .from(staff)
          .where(isNull(staff.deletedAt)),
      ]);
      return {
        customStatuses: Object.fromEntries(
          statusRows.map((r) => [r.id, { name: r.name, closes: r.closes }]),
        ),
        templates: Object.fromEntries(
          templateRows.map((r) => [r.id, { workflowId: r.workflowId }]),
        ),
        staff: Object.fromEntries(
          staffRows.map((r) => [r.id, { name: r.name }]),
        ),
      };
    },
    async importedRefs(entity, externalIds) {
      if (externalIds.length === 0) return new Map();
      const found = await findImportRefs(db, "monday", entity, externalIds);
      return new Map([...found].map(([id, ref]) => [id, ref.rowId]));
    },
    async importedAssets(assetIds) {
      if (assetIds.length === 0) return new Set();
      const found = await db
        .selectDistinct({ assetId: importFiles.assetId })
        .from(importFiles)
        .where(inArray(importFiles.assetId, [...new Set(assetIds)]));
      return new Set(found.map((r) => r.assetId));
    },
    async contactTypes(ids) {
      if (ids.length === 0) return new Map();
      const found = await db
        .select({ id: contacts.id, type: contacts.type })
        .from(contacts)
        .where(
          and(
            inArray(contacts.id, [...new Set(ids)]),
            isNull(contacts.deletedAt),
          ),
        );
      return new Map(found.map((r) => [r.id, r.type]));
    },
    async contactNamesTaken(type, lowerNames) {
      if (lowerNames.length === 0) return new Set();
      const lower = sql<string>`lower(${contacts.name})`;
      const found = await db
        .selectDistinct({ name: lower })
        .from(contacts)
        .where(
          and(
            eq(contacts.type, type),
            isNull(contacts.deletedAt),
            inArray(lower, [...new Set(lowerNames)]),
          ),
        );
      return new Set(found.map((r) => r.name));
    },
    async projectNamesTaken(pairs) {
      if (pairs.length === 0) return new Set();
      const lower = sql<string>`lower(${projects.name})`;
      const found = await db
        .select({ clientId: projects.clientId, name: lower })
        .from(projects)
        .where(
          and(
            isNull(projects.deletedAt),
            inArray(projects.clientId, [
              ...new Set(pairs.map((p) => p.clientId)),
            ]),
            inArray(lower, [...new Set(pairs.map((p) => p.lowerName))]),
          ),
        );
      return new Set(found.map((r) => pairKey(r.clientId, r.name)));
    },
    async projectCodesTaken(codes) {
      if (codes.length === 0) return new Set();
      const found = await db
        .selectDistinct({ code: projects.code })
        .from(projects)
        .where(
          and(
            isNull(projects.deletedAt),
            inArray(projects.code, [...new Set(codes)]),
          ),
        );
      return new Set(
        found.map((r) => r.code).filter((c): c is string => c != null),
      );
    },
    async workflowIds(ids) {
      if (ids.length === 0) return new Set();
      const found = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(
          and(
            inArray(workflows.id, [...new Set(ids)]),
            isNull(workflows.deletedAt),
          ),
        );
      return new Set(found.map((r) => r.id));
    },
    async areaWorkflowIds(ids) {
      if (ids.length === 0) return new Map();
      const unique = [...new Set(ids)];
      const live = await db
        .select({ id: areas.id })
        .from(areas)
        .where(and(inArray(areas.id, unique), isNull(areas.deletedAt)));
      const out = new Map<string, string[]>(live.map((r) => [r.id, []]));
      if (out.size === 0) return out;
      const links = await db
        .select({
          areaId: areaWorkflows.areaId,
          workflowId: areaWorkflows.workflowId,
        })
        .from(areaWorkflows)
        .innerJoin(workflows, eq(workflows.id, areaWorkflows.workflowId))
        .where(
          and(
            inArray(areaWorkflows.areaId, [...out.keys()]),
            isNull(workflows.deletedAt),
          ),
        );
      for (const l of links) out.get(l.areaId)?.push(l.workflowId);
      return out;
    },
    async projectTemplatesTaken(pairs) {
      if (pairs.length === 0) return new Set();
      const found = await db
        .select({ projectId: tasks.projectId, templateId: tasks.templateId })
        .from(tasks)
        .where(
          and(
            isNull(tasks.deletedAt),
            inArray(tasks.projectId, [
              ...new Set(pairs.map((p) => p.projectId)),
            ]),
            inArray(tasks.templateId, [
              ...new Set(pairs.map((p) => p.templateId)),
            ]),
          ),
        );
      return new Set(
        found.map((r) => pairKey(r.projectId, r.templateId ?? "")),
      );
    },
    async foreignSchedules(projectIds) {
      if (projectIds.length === 0) return new Set();
      const found = await db
        .select({ projectId: projectSchedules.projectId })
        .from(projectSchedules)
        .where(
          and(
            inArray(projectSchedules.projectId, [...new Set(projectIds)]),
            notExists(
              db
                .select({ one: sql`1` })
                .from(importRefs)
                .where(
                  and(
                    eq(importRefs.source, "monday"),
                    eq(importRefs.entity, "project_schedule"),
                    eq(importRefs.rowId, projectSchedules.id),
                  ),
                ),
            ),
          ),
        );
      return new Set(found.map((r) => r.projectId));
    },
  };
}

// ---------------------------------------------------------------------------
// Export folder
// ---------------------------------------------------------------------------

export interface PlanExport {
  data: ExportData;
  /** Board ids whose `.done` marker is missing (export incomplete). */
  incomplete: string[];
}

/** Reads what translate needs from an export folder: users, boards, updates and files/index.json. */
export async function readPlanExport(dir: string): Promise<PlanExport> {
  const base = await readExport(dir);
  const boards = [];
  for (const b of base.boards) {
    const updates = await readNdjson<UpdateLine>(
      join(dir, "boards", b.board.id, "updates.ndjson"),
    );
    boards.push({ board: b.board, items: b.items, updates });
  }
  const files = await readJson<FileIndex>(join(dir, FILES_DIR, FILES_INDEX));
  const data: ExportData = {
    users: base.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? "",
      ...(u.status != null ? { status: u.status } : {}),
      ...(u.kind != null ? { kind: u.kind } : {}),
    })),
    boards,
  };
  if (files) data.files = files;
  return {
    data,
    incomplete: base.boards.filter((b) => !b.done).map((b) => b.board.id),
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface BuildPlanOptions {
  /** Whether an export-relative path exists on disk (FILE_MISSING). Default: every file exists. */
  fileExists?: (localPath: string) => boolean;
  /** Returns why Drive isn't usable, or null. Called only when `options.includeFiles` is on. */
  checkDrive?: () => Promise<string | null>;
  /** `created_by_id` and fallback comment author; `apply` passes the `--by` staff. Default: PLAN_IMPORTER_ID. */
  importedById?: string;
}

const PROJECT_STRATEGIES = new Set<BoardMapping["strategy"]>([
  "board_as_project",
  "group_as_project",
  "item_as_project",
]);

/** MAPPING_INVALID for each Zod issue, with its path and the board it is under. */
function zodIssues(
  raw: unknown,
  error: { issues: { path: PropertyKey[]; message: string }[] },
) {
  const boards = (raw as { boards?: unknown })?.boards;
  return error.issues.map((i) => {
    const path = i.path.map(String).join(".");
    let boardId: string | undefined;
    if (
      i.path[0] === "boards" &&
      Array.isArray(boards) &&
      typeof i.path[1] === "number"
    ) {
      const id = (boards[i.path[1]] as { mondayBoardId?: unknown } | undefined)
        ?.mondayBoardId;
      if (typeof id === "string") boardId = id;
    }
    return makeIssue(
      "MAPPING_INVALID",
      `${path || "(root)"}: ${i.message}`,
      boardId,
    );
  });
}

/**
 * Plans an import: validates the mapping, translates, runs every check and
 * counts the rows per board. `rawMapping` is the parsed mapping.json, before
 * Zod; an invalid one gives only MAPPING_INVALID issues and no counts.
 */
export async function buildPlan(
  data: ExportData,
  rawMapping: unknown,
  lookups: PlanLookups,
  options: BuildPlanOptions = {},
): Promise<Plan> {
  const parsed = Mapping.safeParse(rawMapping);
  if (!parsed.success) {
    return {
      issues: zodIssues(rawMapping, parsed.error),
      boards: [],
      totals: emptyTotals(),
    };
  }
  const mapping = parsed.data;
  const issues: PlanIssue[] = [];
  const add = (
    code: PlanIssueCode,
    message: string,
    boardId?: string,
    itemId?: string,
  ) => issues.push(makeIssue(code, message, boardId, itemId));

  const active = mapping.boards.filter((b) => b.strategy !== "skip");
  const translateLookups = await lookups.translateLookups();

  // --- references in the mapping (FKs apply would hit) ----------------------
  const clientIds = active
    .filter((b) => PROJECT_STRATEGIES.has(b.strategy))
    .flatMap((b) => [b.client, ...Object.values(b.groupClients ?? {})])
    .flatMap((c) => (c?.kind === "contact" ? [c.contactId] : []));
  const matchIds = active
    .filter((b) => b.strategy === "crm_contacts")
    .flatMap((b) => Object.values(b.contactMatches));
  const [contactTypes, liveWorkflows, areaWorkflowMap] = await Promise.all([
    lookups.contactTypes([...clientIds, ...matchIds]),
    lookups.workflowIds(
      active.flatMap((b) => (b.workflowId ? [b.workflowId] : [])),
    ),
    lookups.areaWorkflowIds(
      active.flatMap((b) => (b.areaId ? [b.areaId] : [])),
    ),
  ]);
  const providerSubtypes = new Set<string>(providerSubtype.enumValues);

  for (const bm of active) {
    const boardId = bm.mondayBoardId;
    if (PROJECT_STRATEGIES.has(bm.strategy)) {
      const refs = [
        ["client", bm.client] as const,
        ...Object.entries(bm.groupClients ?? {}).map(
          ([g, c]) => [`groupClients.${g}`, c] as const,
        ),
      ];
      for (const [where, ref] of refs) {
        if (ref?.kind !== "contact") continue;
        const type = contactTypes.get(ref.contactId);
        if (type !== "cliente") {
          add(
            "CLIENT_UNRESOLVED",
            `${where}: contact ${ref.contactId} ${type ? `is a ${type}, not a cliente` : "does not exist"}`,
            boardId,
          );
        }
      }
    }
    if (bm.strategy === "crm_contacts") {
      const type = bm.contactType ?? "cliente";
      for (const [itemId, contactId] of Object.entries(bm.contactMatches)) {
        const found = contactTypes.get(contactId);
        if (found !== type) {
          add(
            "MAPPING_INVALID",
            `contactMatches.${itemId}: contact ${contactId} ${found ? `is a ${found}, not a ${type}` : "does not exist"}`,
            boardId,
            itemId,
          );
        }
      }
      if (
        type === "proveedor" &&
        !(bm.providerSubtype && providerSubtypes.has(bm.providerSubtype))
      ) {
        add(
          "PROVIDER_SUBTYPE_MISSING",
          bm.providerSubtype
            ? `providerSubtype "${bm.providerSubtype}" is not one of ${[...providerSubtypes].join(", ")}`
            : `proveedor contacts need a providerSubtype (${[...providerSubtypes].join(", ")})`,
          boardId,
        );
      }
    }
    if (bm.workflowId && !liveWorkflows.has(bm.workflowId)) {
      add(
        "MAPPING_INVALID",
        `workflowId: workflow ${bm.workflowId} does not exist`,
        boardId,
      );
    }
    if (bm.areaId && !areaWorkflowMap.has(bm.areaId)) {
      add(
        "MAPPING_INVALID",
        `areaId: area ${bm.areaId} does not exist`,
        boardId,
      );
    }
    if (PROJECT_STRATEGIES.has(bm.strategy)) {
      const areaFlows = bm.areaId ? areaWorkflowMap.get(bm.areaId) : undefined;
      for (const [itemId, templateId] of Object.entries(bm.templateMatches)) {
        const template = translateLookups.templates[templateId];
        if (!template) continue; // translate reports it for the item
        if (!bm.areaId) {
          add(
            "TEMPLATE_INVALID",
            `Template ${templateId} can't be checked: the board has no areaId`,
            boardId,
            itemId,
          );
        } else if (areaFlows && !areaFlows.includes(template.workflowId)) {
          add(
            "TEMPLATE_INVALID",
            `Template ${templateId} is not in a workflow of area ${bm.areaId}`,
            boardId,
            itemId,
          );
        }
      }
    }
  }

  // --- translate ----------------------------------------------------------
  const result = translate(data, mapping, translateLookups, {
    importedById: options.importedById ?? PLAN_IMPORTER_ID,
  });
  for (const i of result.issues) add(i.code, i.message, i.boardId, i.itemId);

  // --- already imported ---------------------------------------------------
  const imported = await importedSets(result, lookups);
  const isNew = (entity: ImportEntity, externalId: string) =>
    !imported.refs.get(entity)?.has(externalId);
  /** The Cincel id a row ref points at, when it exists already (null: created by this apply). */
  const rowIdOf = (ref: RowRef): string | null =>
    ref.kind === "existing"
      ? ref.id
      : (imported.refs.get(ref.entity)?.get(ref.externalId) ?? null);
  const refKey = (ref: RowRef) =>
    ref.kind === "existing"
      ? ref.id
      : (rowIdOf(ref) ?? `planned:${ref.entity}:${ref.externalId}`);

  const newContacts = result.contacts.filter((c) =>
    isNew("contact", c.externalId),
  );
  const newProjects = result.projects.filter((p) =>
    isNew("project", p.externalId),
  );
  const newTasks = result.tasks.filter((t) => isNew("task", t.externalId));
  const newSchedules = result.projectSchedules.filter((s) =>
    isNew("project_schedule", s.externalId),
  );

  const projectBoard = new Map(
    result.projects.map((p) => [p.externalId, p.source.boardId]),
  );
  const contactBoard = new Map<string, string>();
  for (const c of result.contacts)
    if (c.source) contactBoard.set(c.externalId, c.source.boardId);
  for (const p of result.projects) {
    if (p.client?.kind === "planned" && !contactBoard.has(p.client.externalId))
      contactBoard.set(p.client.externalId, p.source.boardId);
  }

  // --- CONTACT_NAME_TAKEN ---------------------------------------------------
  const contactGroups = groupBy(newContacts, (c) =>
    pairKey(c.type, c.name.toLowerCase()),
  );
  const takenContactNames = new Map<ContactType, Set<string>>();
  for (const type of ["cliente", "socio", "proveedor"] as const) {
    const names = newContacts
      .filter((c) => c.type === type)
      .map((c) => c.name.toLowerCase());
    if (names.length > 0)
      takenContactNames.set(type, await lookups.contactNamesTaken(type, names));
  }
  for (const group of contactGroups.values()) {
    const c = group[0];
    const boardId = contactBoard.get(c.externalId);
    const itemId = c.source ? c.externalId : undefined;
    if (takenContactNames.get(c.type)?.has(c.name.toLowerCase())) {
      add(
        "CONTACT_NAME_TAKEN",
        `A ${c.type} named "${c.name}" exists already; reuse it with contactMatches or rename it in monday`,
        boardId,
        itemId,
      );
    }
    if (group.length > 1) {
      add(
        "CONTACT_NAME_TAKEN",
        `${group.length} new ${c.type} contacts are named "${c.name}" (${group.map((g) => g.externalId).join(", ")})`,
        boardId,
        itemId,
      );
    }
  }

  // --- PROJECT_NAME_TAKEN / PROJECT_CODE_TAKEN -----------------------------
  const projectItem = (p: PlannedProject) =>
    p.externalId !== p.source.boardId && !p.externalId.includes(":")
      ? p.externalId
      : undefined;
  const withClient = newProjects.filter((p) => p.client != null);
  const knownClientPairs = withClient.flatMap((p) => {
    const clientId = rowIdOf(p.client!);
    return clientId ? [{ clientId, lowerName: p.name.toLowerCase() }] : [];
  });
  const takenNames = await lookups.projectNamesTaken(knownClientPairs);
  for (const group of groupBy(withClient, (p) =>
    pairKey(refKey(p.client!), p.name.toLowerCase()),
  ).values()) {
    const p = group[0];
    const clientId = rowIdOf(p.client!);
    if (clientId && takenNames.has(pairKey(clientId, p.name.toLowerCase()))) {
      add(
        "PROJECT_NAME_TAKEN",
        `The client already has a project named "${p.name}"; set another name in projectNames`,
        p.source.boardId,
        projectItem(p),
      );
    }
    if (group.length > 1) {
      add(
        "PROJECT_NAME_TAKEN",
        `${group.length} new projects of one client are named "${p.name}" (${group.map((g) => g.externalId).join(", ")}); set projectNames`,
        p.source.boardId,
        projectItem(p),
      );
    }
  }
  const coded = newProjects.filter((p) => p.code != null);
  const takenCodes = await lookups.projectCodesTaken(coded.map((p) => p.code!));
  for (const group of groupBy(coded, (p) => p.code!).values()) {
    const p = group[0];
    if (takenCodes.has(p.code!)) {
      add(
        "PROJECT_CODE_TAKEN",
        `Project code "${p.code}" is used by an existing project; change projectCode / projectCodes`,
        p.source.boardId,
        projectItem(p),
      );
    }
    if (group.length > 1) {
      add(
        "PROJECT_CODE_TAKEN",
        `Project code "${p.code}" repeats in ${group.length} new projects (${group.map((g) => g.externalId).join(", ")})`,
        p.source.boardId,
        projectItem(p),
      );
    }
  }

  // --- TEMPLATE_COLLISION -------------------------------------------------
  const templated = newTasks.filter((t) => t.templateId != null);
  for (const group of groupBy(templated, (t) =>
    pairKey(t.project.externalId, t.templateId!),
  ).values()) {
    if (group.length < 2) continue;
    for (const t of group.slice(1)) {
      add(
        "TEMPLATE_COLLISION",
        `"${t.title}" and "${group[0].title}" (${group[0].externalId}) match template ${t.templateId} in one project`,
        t.source.boardId,
        t.externalId,
      );
    }
  }
  const inExisting = templated.flatMap((t) => {
    const projectId = rowIdOf(t.project);
    return projectId ? [{ task: t, projectId, templateId: t.templateId! }] : [];
  });
  const takenTemplates = await lookups.projectTemplatesTaken(
    inExisting.map(({ projectId, templateId }) => ({ projectId, templateId })),
  );
  for (const { task, projectId, templateId } of inExisting) {
    if (takenTemplates.has(pairKey(projectId, templateId))) {
      add(
        "TEMPLATE_COLLISION",
        `"${task.title}" matches template ${templateId}, already applied in its project`,
        task.source.boardId,
        task.externalId,
      );
    }
  }

  // --- SCHEDULE_EXISTS ----------------------------------------------------
  const scheduledExisting = newSchedules.flatMap((s) => {
    const projectId = rowIdOf(s.project);
    return projectId ? [{ schedule: s, projectId }] : [];
  });
  const foreign = await lookups.foreignSchedules(
    scheduledExisting.map((s) => s.projectId),
  );
  for (const { schedule, projectId } of scheduledExisting) {
    if (foreign.has(projectId)) {
      const boardId = projectBoard.get(schedule.externalId);
      add(
        "SCHEDULE_EXISTS",
        `Project ${projectId} already has a cronograma not created by this import; turn schedule off for it`,
        boardId,
      );
    }
  }

  // --- FILE_MISSING (in the index, not on disk) ----------------------------
  const exists = options.fileExists ?? (() => true);
  const newFiles = result.files.filter((f) => !imported.assets.has(f.assetId));
  const uploadable = newFiles.filter((f) => {
    if (exists(f.localPath)) return true;
    add(
      "FILE_MISSING",
      `File ${f.assetId} ("${f.fileName}") is in files/index.json but ${f.localPath} is not on disk`,
      f.source.boardId,
      f.task?.kind === "planned" ? f.task.externalId : undefined,
    );
    return false;
  });

  // --- DRIVE_NOT_CONFIGURED -----------------------------------------------
  if (mapping.options.includeFiles && options.checkDrive) {
    const problem = await options.checkDrive();
    if (problem) add("DRIVE_NOT_CONFIGURED", problem);
  }

  // --- counts -------------------------------------------------------------
  const boards = new Map<string, BoardCounts>();
  for (const bm of mapping.boards) {
    boards.set(bm.mondayBoardId, {
      boardId: bm.mondayBoardId,
      name: bm.name,
      strategy: bm.strategy,
      contacts: 0,
      projects: 0,
      tasks: 0,
      childTasks: 0,
      checklistItems: 0,
      dependencies: 0,
      comments: 0,
      cronogramaRows: 0,
      files: 0,
      skipped: 0,
    });
  }
  const totals = emptyTotals();
  const taskBoard = new Map(
    result.tasks.map((t) => [t.externalId, t.source.boardId]),
  );
  const bump = (boardId: string | undefined, key: CountKey) => {
    totals[key] += 1;
    const b = boardId ? boards.get(boardId) : undefined;
    if (b) b[key] += 1;
  };
  const count = <T extends { externalId: string }>(
    rows: readonly T[],
    entity: ImportEntity,
    boardOf: (row: T) => string | undefined,
    key: CountKey | ((row: T) => CountKey),
  ) => {
    for (const row of rows) {
      if (!isNew(entity, row.externalId)) bump(boardOf(row), "skipped");
      else bump(boardOf(row), typeof key === "function" ? key(row) : key);
    }
  };
  const countOther = <T extends { externalId: string }>(
    rows: readonly T[],
    entity: ImportEntity,
    boardOf: (row: T) => string | undefined,
    key: Exclude<keyof PlanTotals, CountKey>,
  ) => {
    for (const row of rows) {
      if (!isNew(entity, row.externalId)) bump(boardOf(row), "skipped");
      else totals[key] += 1;
    }
  };
  count(
    result.contacts,
    "contact",
    (c) => contactBoard.get(c.externalId),
    "contacts",
  );
  count(result.projects, "project", (p) => p.source.boardId, "projects");
  count(
    result.tasks,
    "task",
    (t) => t.source.boardId,
    (t) => (t.parentTask ? "childTasks" : "tasks"),
  );
  count(
    result.checklistItems,
    "checklist_item",
    (c) => c.source.boardId,
    "checklistItems",
  );
  count(
    result.taskDependencies,
    "task_dependency",
    (d) =>
      d.task.kind === "planned" ? taskBoard.get(d.task.externalId) : undefined,
    "dependencies",
  );
  count(
    result.historyEvents,
    "history_event",
    (h) => h.source.boardId,
    "comments",
  );
  count(
    result.scheduleTasks,
    "schedule_task",
    (s) =>
      projectBoard.get(
        s.project.kind === "planned" ? s.project.externalId : "",
      ),
    "cronogramaRows",
  );
  for (const f of result.files) {
    if (imported.assets.has(f.assetId)) bump(f.source.boardId, "skipped");
  }
  for (const f of uploadable) bump(f.source.boardId, "files");
  countOther(
    result.contactPeople,
    "contact_person",
    () => undefined,
    "contactPeople",
  );
  countOther(
    result.providerProfiles,
    "provider_profile",
    (p) => contactBoard.get(p.externalId),
    "providerProfiles",
  );
  countOther(
    result.taskSupport,
    "task_support",
    (s) =>
      s.task.kind === "planned" ? taskBoard.get(s.task.externalId) : undefined,
    "taskSupport",
  );
  countOther(
    result.projectSchedules,
    "project_schedule",
    (s) => projectBoard.get(s.externalId),
    "projectSchedules",
  );

  return {
    issues,
    boards: [...boards.values()],
    totals,
    translation: {
      mapping,
      result,
      imported: imported.refs,
      files: uploadable,
    },
  };
}

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** The planned rows `import_refs` (and `import_files`, for files) has already. */
async function importedSets(
  result: TranslateResult,
  lookups: PlanLookups,
): Promise<{
  refs: Map<ImportEntity, Map<string, string>>;
  assets: Set<string>;
}> {
  const byEntity: [ImportEntity, { externalId: string }[]][] = [
    ["contact", result.contacts],
    ["contact_person", result.contactPeople],
    ["provider_profile", result.providerProfiles],
    ["project", result.projects],
    ["project_schedule", result.projectSchedules],
    ["task", result.tasks],
    ["checklist_item", result.checklistItems],
    ["task_support", result.taskSupport],
    ["task_dependency", result.taskDependencies],
    ["history_event", result.historyEvents],
    ["schedule_task", result.scheduleTasks],
  ];
  const refs = new Map<ImportEntity, Map<string, string>>();
  for (const [entity, rows] of byEntity) {
    refs.set(
      entity,
      await lookups.importedRefs(
        entity,
        rows.map((r) => r.externalId),
      ),
    );
  }
  const assets = await lookups.importedAssets(
    result.files.map((f) => f.assetId),
  );
  return { refs, assets };
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

/**
 * Why the service account can't upload to the Shared Drive, or null: no
 * credentials, no `GOOGLE_SHARED_DRIVE_ID`, or listing the drive fails.
 */
export async function checkDriveConfigured(
  openDrive: () => DriveAdmin,
  env: Env = process.env,
): Promise<string | null> {
  let drive: DriveAdmin;
  try {
    drive = openDrive();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const sharedDriveId = env.GOOGLE_SHARED_DRIVE_ID?.trim();
  if (!sharedDriveId) return "GOOGLE_SHARED_DRIVE_ID is not set";
  try {
    await drive.list({
      parentId: sharedDriveId,
      driveId: sharedDriveId,
      pageSize: 1,
    });
  } catch (err) {
    return `The service account can't list the Shared Drive ${sharedDriveId}: ${err instanceof Error ? err.message : String(err)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const COLUMNS: [CountKey, string][] = [
  ["contacts", "Contacts"],
  ["projects", "Projects"],
  ["tasks", "Tasks"],
  ["childTasks", "Child tasks"],
  ["checklistItems", "Checklist items"],
  ["dependencies", "Dependencies"],
  ["comments", "Comments"],
  ["cronogramaRows", "Cronograma rows"],
  ["files", "Files"],
  ["skipped", "Already imported"],
];

const cell = (text: string) =>
  text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function issueTable(issues: readonly PlanIssue[]): string[] {
  return [
    "| Code | Board | Item | Message |",
    "|---|---|---|---|",
    ...issues.map(
      (i) =>
        `| ${i.code} | ${i.boardId ?? "-"} | ${i.itemId ?? "-"} | ${cell(i.message)} |`,
    ),
  ];
}

/** The plan.md report. */
export function formatPlanMarkdown(
  plan: Plan,
  exportDir: string,
  generatedAt: Date,
): string {
  const blocking = plan.issues.filter((i) => i.blocking);
  const warnings = plan.issues.filter((i) => !i.blocking);
  const lines = [
    "# monday import plan",
    "",
    `Export: \`${exportDir}\` · generated ${generatedAt.toISOString()}`,
    "",
    blocking.length === 0
      ? `**Clean:** no blocking issues, apply can run (${warnings.length} warning${warnings.length === 1 ? "" : "s"}).`
      : `**${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}**, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}. Edit mapping.json and run plan again.`,
    "",
    "## Rows to create",
    "",
    `| Board | Name | Strategy | ${COLUMNS.map(([, label]) => label).join(" | ")} |`,
    `|---|---|---|${COLUMNS.map(() => "---:").join("|")}|`,
    ...plan.boards.map(
      (b) =>
        `| ${b.boardId} | ${cell(b.name)} | ${b.strategy} | ${COLUMNS.map(([k]) => b[k]).join(" | ")} |`,
    ),
    `| **Total** | | | ${COLUMNS.map(([k]) => `**${plan.totals[k]}**`).join(" | ")} |`,
    "",
    `Also: ${plan.totals.contactPeople} contact people, ${plan.totals.providerProfiles} provider profiles, ${plan.totals.taskSupport} task support rows, ${plan.totals.projectSchedules} cronogramas.`,
    "",
    "## Blocking issues",
    "",
    ...(blocking.length === 0 ? ["None."] : issueTable(blocking)),
    "",
    "## Warnings",
    "",
    ...(warnings.length === 0 ? ["None."] : issueTable(warnings)),
    "",
  ];
  return lines.join("\n");
}

/** The console summary. */
export function formatPlanSummary(plan: Plan): string {
  const t = plan.totals;
  const blocking = plan.issues.filter((i) => i.blocking);
  const warnings = plan.issues.length - blocking.length;
  const byCode = new Map<string, number>();
  for (const i of plan.issues)
    byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
  return [
    `${t.contacts} contacts, ${t.projects} projects, ${t.tasks} tasks, ${t.childTasks} child tasks, ${t.checklistItems} checklist items, ${t.dependencies} dependencies, ${t.comments} comments, ${t.cronogramaRows} cronograma rows, ${t.files} files; ${t.skipped} already imported.`,
    `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}${byCode.size ? `: ${[...byCode].map(([c, n]) => `${c} ${n}`).join(", ")}` : ""}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface PlanArgs {
  exportDir: string;
}

/** Parses `--export <dir>`; returns an error message when invalid. */
export function parsePlanArgs(args: string[]): PlanArgs | string {
  let exportDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--export") exportDir = args[++i];
    else if (arg.startsWith("--export="))
      exportDir = arg.slice("--export=".length);
    else return `unknown option "${arg}"`;
  }
  if (!exportDir) return "--export exports/<client> is required";
  return { exportDir };
}

/** Reads mapping.json: the parsed JSON, or a MAPPING_INVALID issue. */
async function readMapping(
  path: string,
): Promise<{ raw: unknown } | { issue: PlanIssue }> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return {
        issue: makeIssue(
          "MAPPING_INVALID",
          `${path} not found; run init first`,
        ),
      };
    throw err;
  }
  try {
    return { raw: JSON.parse(text) as unknown };
  } catch (err) {
    return {
      issue: makeIssue(
        "MAPPING_INVALID",
        `${MAPPING_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ),
    };
  }
}

/** Reads `<exportDir>/mapping.json`: the parsed JSON, or a MAPPING_INVALID issue. */
export function readMappingFile(
  exportDir: string,
): Promise<{ raw: unknown } | { issue: PlanIssue }> {
  return readMapping(join(exportDir, MAPPING_FILE));
}

export interface PlanDeps {
  openDb: () => MondayDbHandle;
  /** The lookups over the opened database; `createPlanDbLookups` by default. */
  lookups?: (db: MondayDbHandle["db"]) => PlanLookups;
  /** The Drive client for the DRIVE_NOT_CONFIGURED check; the env service account by default. */
  openDrive?: () => DriveAdmin;
  env?: Env;
  now?: () => Date;
}

/** Builds the `plan` handler; tests pass their own database and Drive. */
export function createPlanCommand(
  deps: PlanDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  return async (args: string[], io: CliIo) => {
    const parsed = parsePlanArgs(args);
    if (typeof parsed === "string") {
      io.stderr(
        `monday plan: ${parsed}.\nUsage: plan --export exports/<client>\n`,
      );
      return 1;
    }
    const dir = resolve(parsed.exportDir);
    const { data, incomplete } = await readPlanExport(dir);
    for (const id of incomplete) {
      io.stderr(
        `monday plan: board ${id} has no ${DONE_FILE}; its export is incomplete.\n`,
      );
    }

    const mapping = await readMapping(join(dir, MAPPING_FILE));
    let plan: Plan;
    if ("issue" in mapping) {
      plan = { issues: [mapping.issue], boards: [], totals: emptyTotals() };
    } else {
      const handle = deps.openDb();
      try {
        plan = await buildPlan(
          data,
          mapping.raw,
          (deps.lookups ?? createPlanDbLookups)(handle.db),
          {
            fileExists: (localPath) => existsSync(join(dir, localPath)),
            checkDrive: () =>
              checkDriveConfigured(
                deps.openDrive ?? openServiceAccountDrive,
                deps.env,
              ),
          },
        );
      } finally {
        await handle.close();
      }
    }

    const target = join(dir, PLAN_FILE);
    await writeFile(
      target,
      formatPlanMarkdown(plan, dir, (deps.now ?? (() => new Date()))()),
    );
    io.stdout(`${formatPlanSummary(plan)}\nWrote ${target}.\n`);
    const blocking = plan.issues.filter((i) => i.blocking);
    if (blocking.length === 0) return 0;
    io.stderr(
      blocking
        .map(
          (i) =>
            `${i.code}${i.boardId ? ` board ${i.boardId}` : ""}${i.itemId ? ` item ${i.itemId}` : ""}: ${i.message}\n`,
        )
        .join(""),
    );
    return 1;
  };
}

export const planCommand: CommandHandler = createPlanCommand();
