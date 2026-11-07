/**
 * Reading a stored mapping that may still be version 1 (project flow BE §10
 * intro): the wizard's draft (`lib/monday-import`), an uploaded file and the
 * CLI's `mapping.json` (`plan`, `apply`) all go through `upgradeStoredMapping`
 * before they are parsed, so a v1 file is converted, never rejected.
 *
 * The v1 per-board status labels the saved firm-wide map doesn't have yet are
 * added to it with `saveUpgradedStatusLabels`: translate reads the saved map,
 * so this is where they live after the upgrade.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { appSettings, taskStatuses, workflowPhases } from "../../lib/db/schema";
import type { ImportDb } from "../../lib/import/refs";
import { parseStoredStatusMap } from "../../lib/monday-import/status-map";
import { MONDAY_STATUS_MAP_SETTING } from "../../lib/project-flow/catalog";
import {
  upgradeMappingV1,
  type MappingUpgradeExport,
  type MappingUpgradeLookups,
  type MappingUpgradeNote,
  type MappingUpgradeResult,
  type MondayStatusMap,
} from "./mapping.schema";

/** Whether `raw` is a mapping that says it is version 1. */
export function isMappingV1(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as { version?: unknown }).version === 1;
}

/** The saved firm-wide status map; empty when unset or unreadable. */
async function readSavedMap(db: ImportDb): Promise<MondayStatusMap> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MONDAY_STATUS_MAP_SETTING))
    .limit(1);
  return parseStoredStatusMap(row?.value ?? null);
}

/** `MappingUpgradeLookups` over the Cincel DB: every fase (an inactive one still holds tasks) and the saved firm-wide status map. */
export async function upgradeDbLookups(db: ImportDb): Promise<MappingUpgradeLookups> {
  const [phaseRows, statusMap] = await Promise.all([
    db
      .select({ id: workflowPhases.id, workflowId: workflowPhases.workflowId, name: workflowPhases.name })
      .from(workflowPhases),
    readSavedMap(db),
  ]);
  return {
    phases: Object.fromEntries(phaseRows.map((p) => [p.id, { workflowId: p.workflowId, name: p.name }])),
    statusMap,
  };
}

export interface StoredMappingUpgrade extends MappingUpgradeResult {
  /** The labels the upgrade added to the saved map (keyed `statusLabelKey`). */
  added: MondayStatusMap;
}

/**
 * Upgrades `raw` when it is a v1 mapping; null for anything else (a v2 mapping, or something that isn't a
 * mapping), which the caller parses as it is. A v1 file that doesn't parse as v1 is also left to the caller, so
 * its parse errors are reported the usual way.
 */
export async function upgradeStoredMapping(
  raw: unknown,
  load: { lookups: () => Promise<MappingUpgradeLookups>; exportData: () => Promise<MappingUpgradeExport> },
): Promise<StoredMappingUpgrade | null> {
  if (!isMappingV1(raw)) return null;
  const [lookups, exportData] = await Promise.all([load.lookups(), load.exportData()]);
  let result: MappingUpgradeResult;
  try {
    result = upgradeMappingV1(raw, lookups, exportData);
  } catch {
    return null;
  }
  const added: MondayStatusMap = {};
  for (const [key, entry] of Object.entries(result.statusMap)) if (!(key in lookups.statusMap)) added[key] = entry;
  return { ...result, added };
}

/**
 * Adds the upgraded v1 labels to the saved firm-wide map: only keys it doesn't have yet (saved entries always
 * win), and only entries whose custom status still exists. Returns the keys written.
 */
export async function saveUpgradedStatusLabels(db: ImportDb, added: MondayStatusMap): Promise<string[]> {
  const ids = [
    ...new Set(Object.values(added).flatMap((e) => ("customStatusId" in e.target ? [e.target.customStatusId] : []))),
  ];
  const live = new Set(
    ids.length === 0
      ? []
      : (
          await db
            .select({ id: taskStatuses.id })
            .from(taskStatuses)
            .where(and(inArray(taskStatuses.id, ids), isNull(taskStatuses.deletedAt)))
        ).map((r) => r.id),
  );
  const saved = await readSavedMap(db);
  const next: MondayStatusMap = { ...saved };
  const written: string[] = [];
  for (const [key, entry] of Object.entries(added)) {
    if (key in saved) continue;
    if ("customStatusId" in entry.target && !live.has(entry.target.customStatusId)) continue;
    next[key] = entry;
    written.push(key);
  }
  if (written.length === 0) return [];
  const value = JSON.stringify(next);
  await db
    .insert(appSettings)
    .values({ key: MONDAY_STATUS_MAP_SETTING, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return written;
}

/** One line of CLI output per upgrade note. */
export function formatUpgradeNote(note: MappingUpgradeNote): string {
  switch (note.kind) {
    case "status_label_unknown":
      return `board ${note.boardId}: status label ${note.labelId} of column ${note.columnId} is not in the export; skipped`;
    case "status_label_conflict":
      return `board ${note.boardId}: status label "${note.key}" (column ${note.columnId}) is mapped differently by an earlier board; the first one is kept`;
    case "group_target_dropped":
      return `board ${note.boardId}: group ${note.groupId} (${note.from}) has no version 2 equivalent; it gets the default`;
  }
}
