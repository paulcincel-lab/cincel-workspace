// @vitest-environment node
/**
 * Flags check (redesign BE §16 Flags, review B20): every redesign actions file
 * has a sibling plain `<domain>-actions.flags.ts` whose `IMPLEMENTED` keys are
 * exactly its exported actions, and no `"use server"` file exports anything
 * but async functions.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ACTIONS_DIR = __dirname;

/** The 62 actions of BE §7 / FE §7, by actions file. */
const REDESIGN_ACTIONS: Record<string, readonly string[]> = {
  preferences: ["fetchMyPreferencesAction", "updateMyPreferencesAction"],
  "org-appearance": ["fetchOrgAppearanceAction", "saveOrgAppearanceAction", "resetOrgAppearanceAction"],
  "profile-photo": ["removeMyPhotoAction"],
  search: ["searchWorkspaceAction"],
  notifications: [
    "fetchNotificationsAction",
    "markNotificationsReadAction",
    "fetchNotificationPreferencesAction",
    "updateNotificationPreferencesAction",
  ],
  "my-space": [
    "fetchNotesAction",
    "createNoteAction",
    "updateNoteAction",
    "archiveNoteAction",
    "restoreNoteAction",
    "fetchChecklistsAction",
    "createChecklistAction",
    "addChecklistItemAction",
    "toggleChecklistItemAction",
    "reorderChecklistItemsAction",
    "archiveChecklistAction",
    "fetchRemindersAction",
    "parseReminderTextAction",
    "createReminderAction",
    "snoozeReminderAction",
    "cancelReminderAction",
  ],
  gmail: [
    "fetchGmailStatusAction",
    "fetchGmailThreadsAction",
    "fetchGmailThreadAction",
    "syncGmailAction",
    "linkGmailThreadToProjectAction",
    "createGmailDraftAction",
    "sendGmailDraftAction",
    "createTaskFromGmailThreadAction",
    "disconnectGmailAction",
  ],
  "time-tracking": [
    "fetchTimeTrackingSettingsAction",
    "saveTimeTrackingSettingsAction",
    "fetchMyTodayAction",
    "clockInAction",
    "pauseWorkAction",
    "resumeWorkAction",
    "clockOutAction",
    "fetchTeamHoursAction",
    "fetchMyWeekHoursAction",
  ],
  vacations: [
    "fetchMyVacationsAction",
    "requestVacationAction",
    "cancelVacationRequestAction",
    "fetchPendingVacationRequestsAction",
    "decideVacationAction",
    "fetchTeamAbsencesAction",
    "fetchVacationSettingsAction",
    "saveVacationSettingsAction",
  ],
  assistant: [
    "fetchAssistantThreadsAction",
    "fetchAssistantThreadAction",
    "deleteAssistantThreadAction",
    "importLegacyAssistantThreadAction",
    "fetchAssistantActionsAction",
  ],
  people: ["fetchPersonaDetailAction", "fetchPeopleOverviewAction"],
  dashboard: ["fetchInicioAction"],
  projects: ["fetchProjectsPortfolioAction"],
};

/** Existing actions files extended by the redesign: their flags list only the redesign actions. */
const EXTENDED = new Set(["dashboard", "projects"]);

type Module = Record<string, unknown>;

/** Implemented actions files import their whole server graph (DB, repositories, Google clients): slow cold. */
const IMPORT_TIMEOUT = { timeout: 120_000 };

async function load(file: string): Promise<Module> {
  return (await import(/* @vite-ignore */ join(ACTIONS_DIR, file))) as Module;
}

function exportedNames(mod: Module): string[] {
  return Object.keys(mod).filter((k) => k !== "default" && k !== "__esModule");
}

describe("redesign action flags", () => {
  it("lists the 62 actions of the contract", () => {
    expect(Object.values(REDESIGN_ACTIONS).flat()).toHaveLength(62);
  });

  for (const [domain, names] of Object.entries(REDESIGN_ACTIONS)) {
    it(`${domain}-actions.flags.ts matches ${domain}-actions.ts`, IMPORT_TIMEOUT, async () => {
      const actions = await load(`${domain}-actions.ts`);
      const flags = await load(`${domain}-actions.flags.ts`);
      const implemented = flags.IMPLEMENTED as Record<string, unknown>;
      expect(implemented, "IMPLEMENTED export").toBeTypeOf("object");
      expect(exportedNames(flags)).toEqual(["IMPLEMENTED"]);

      const keys = Object.keys(implemented).sort();
      expect(keys).toEqual([...names].sort());
      for (const key of keys) expect(typeof implemented[key], key).toBe("boolean");

      const exported = exportedNames(actions);
      for (const key of keys) expect(exported, `${key} is exported`).toContain(key);
      if (!EXTENDED.has(domain)) expect(exported.sort()).toEqual(keys);
    });
  }

  it("keeps flags modules free of \"use server\"", () => {
    for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith("-actions.flags.ts"))) {
      expect(readFileSync(join(ACTIONS_DIR, file), "utf8"), file).not.toMatch(/^\s*["']use server["']/);
    }
  });
});

describe("\"use server\" action files", () => {
  const files = readdirSync(ACTIONS_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && /^\s*["']use server["']/.test(readFileSync(join(ACTIONS_DIR, f), "utf8")),
  );

  it("finds the redesign actions files", () => {
    for (const domain of Object.keys(REDESIGN_ACTIONS)) expect(files).toContain(`${domain}-actions.ts`);
  });

  for (const file of files) {
    it(`${file} exports only async functions`, IMPORT_TIMEOUT, async () => {
      const mod = await load(file);
      for (const name of exportedNames(mod)) {
        const value = mod[name];
        expect(typeof value, `${file} › ${name}`).toBe("function");
        expect((value as { constructor: { name: string } }).constructor.name, `${file} › ${name}`).toBe("AsyncFunction");
      }
    });
  }
});
