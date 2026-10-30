/**
 * Shared fixtures for the `apply` tests (BE §11): the nested translate
 * fixture written out as an export folder, its mapping, a fake Shared Drive
 * and a captured CLI io.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FOLDER_MIME_TYPE,
  type DriveAdmin,
  type DriveFile,
  type ListOptions,
  type UploadInput,
} from "@/lib/google/drive-admin";
import nestedFixture from "@/scripts/monday/__fixtures__/translate-nested-export.json";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { CliIo } from "@/scripts/monday/run";
import type { ExportData } from "@/scripts/monday/translate";

/** One call that reached the fake Drive. */
export type DriveCall =
  | { op: "list" | "listAll"; parentId?: string; q?: string }
  | { op: "createFolder"; name: string; parentId: string }
  | { op: "uploadResumable"; name: string; parentId: string };

/**
 * In-memory Shared Drive: folders and files by id with their parent. Records
 * every call and can be interrupted:
 * - `failUpload(n)`: the n-th upload reaches Drive, then that call throws;
 *   later calls work.
 * - `killAfterUpload(n)`: the n-th upload reaches Drive, then the process
 *   "dies": that call and every later call throw without touching Drive.
 */
export function fakeDrive() {
  const files = new Map<string, DriveFile>();
  const log: DriveCall[] = [];
  let next = 1;
  const calls = { uploads: 0 };
  let failUploadNo: number | null = null;
  let killAfterUploadNo: number | null = null;
  let dead = false;
  const alive = () => {
    if (dead) throw new Error("proceso terminado");
  };

  const list = async (options: ListOptions = {}) => {
    const q = options.q ?? "";
    const name = /name = '((?:[^'\\]|\\.)*)'/
      .exec(q)?.[1]
      ?.replace(/\\(.)/g, "$1");
    const folderOnly = q.includes(`mimeType = '${FOLDER_MIME_TYPE}'`);
    const filesOnly = q.includes(`mimeType != '${FOLDER_MIME_TYPE}'`);
    return {
      files: [...files.values()].filter(
        (f) =>
          (!options.parentId || f.parents?.includes(options.parentId)) &&
          (!name || f.name === name) &&
          (!folderOnly || f.mimeType === FOLDER_MIME_TYPE) &&
          (!filesOnly || f.mimeType !== FOLDER_MIME_TYPE) &&
          !f.trashed,
      ),
    };
  };
  const drive = {
    async createFolder(name: string, parentId: string) {
      alive();
      log.push({ op: "createFolder", name, parentId });
      const file: DriveFile = {
        id: `folder-${next++}`,
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      };
      files.set(file.id, file);
      return file;
    },
    async list(options: ListOptions = {}) {
      alive();
      log.push({ op: "list", parentId: options.parentId, q: options.q });
      return list(options);
    },
    async listAll(options: ListOptions = {}) {
      alive();
      log.push({ op: "listAll", parentId: options.parentId, q: options.q });
      return (await list(options)).files;
    },
    async uploadResumable(input: UploadInput) {
      alive();
      calls.uploads += 1;
      log.push({
        op: "uploadResumable",
        name: input.name,
        parentId: input.parentId,
      });
      const id = `file-${next++}`;
      const file: DriveFile = {
        id,
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
        size: String(input.size),
        webViewLink: `https://drive.example/${id}`,
      };
      files.set(id, file);
      // The upload reached Drive, then the run died before recording it.
      if (calls.uploads === killAfterUploadNo) {
        dead = true;
        throw new Error("proceso terminado");
      }
      if (calls.uploads === failUploadNo) throw new Error("conexión perdida");
      return file;
    },
  };
  return {
    drive: drive as unknown as DriveAdmin,
    files,
    calls,
    log,
    /** Calls that change Drive (folders and uploads). */
    writes: () => log.filter((c) => c.op !== "list" && c.op !== "listAll"),
    failUpload: (n: number | null) => {
      failUploadNo = n;
    },
    killAfterUpload: (n: number) => {
      killAfterUploadNo = n;
    },
    /** A new process: Drive keeps its files, calls work again. */
    restart: () => {
      dead = false;
      killAfterUploadNo = null;
      failUploadNo = null;
    },
    childrenOf: (parentId: string) =>
      [...files.values()].filter((f) => f.parents?.includes(parentId)),
  };
}

export function io() {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { cli, out: () => out.join(""), err: () => err.join("") };
}

/**
 * The mapping of translate-nested-export.json (checklist, child tasks,
 * item_as_project, crm), with `staffId` as monday user 11 and `clientId` as
 * the client of every project board.
 */
export function nestedMapping(staffId: string, clientId: string): MappingInput {
  const STATUS = {
    "0": { status: "pendiente" },
    "1": { status: "completado" },
    "2": { status: "en_proceso" },
  } as const;
  const SUB = {
    "0": { status: "pendiente" },
    "1": { status: "completado" },
  } as const;
  const client = { kind: "contact", contactId: clientId } as const;
  return {
    version: 1,
    boards: [
      {
        mondayBoardId: "901",
        name: "Casa Nido",
        strategy: "board_as_project",
        client,
        columns: {
          name: "title",
          status: "status",
          people: "people",
          timeline: "timeline",
          costo: "import_data",
          planta: "ignore",
        },
        subitemColumns: { name: "title", sstatus: "status" },
        statusMaps: { status: STATUS, sstatus: SUB },
        subitems: "checklist",
        schedule: { enabled: true, planta: { columnId: "planta" } },
      },
      {
        mondayBoardId: "902",
        name: "Casa Faro",
        strategy: "board_as_project",
        client,
        columns: { name: "title", status: "status" },
        subitemColumns: { name: "title", sstatus: "status" },
        statusMaps: { status: STATUS, sstatus: SUB },
        subitems: "child_tasks",
      },
      {
        mondayBoardId: "903",
        name: "Obras",
        strategy: "item_as_project",
        client,
        columns: { name: "title", presupuesto: "import_data" },
        subitemColumns: { name: "title" },
        statusMaps: {},
      },
      {
        mondayBoardId: "904",
        name: "Clientes",
        strategy: "crm_contacts",
        contactType: "cliente",
        columns: { name: "title", rfc: "import_data" },
        statusMaps: {},
      },
    ],
    people: {
      "11": { action: "staff", staffId },
      "14": { action: "ignore" },
    },
    options: { includeUpdates: true, includeFiles: true },
  };
}

/**
 * Writes translate-nested-export.json out as an export folder (BE §4.1) of
 * monday account `accountId`, with `mapping` as its mapping.json. Returns the
 * new temp folder; the caller removes it.
 */
export function writeExportFolder(
  accountId: string,
  mapping: MappingInput,
): string {
  const dir = mkdtempSync(join(tmpdir(), "monday-apply-"));
  const data = structuredClone(nestedFixture) as unknown as ExportData;
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      account: { id: accountId, slug: "acme", name: "Acme" },
      exported_at: "2026-10-20T12:00:00.000Z",
      api_version: "2026-07",
      token_user: { id: "1", name: "Ana", email: "ana@acme.mx" },
      boards: data.boards.map((b) => ({ id: b.board.id })),
      call_count: 1,
      errors: [],
    }),
  );
  writeFileSync(join(dir, "users.json"), JSON.stringify(data.users));
  for (const b of data.boards) {
    const bd = join(dir, "boards", b.board.id);
    mkdirSync(bd, { recursive: true });
    writeFileSync(join(bd, "board.json"), JSON.stringify(b.board));
    writeFileSync(
      join(bd, "items.ndjson"),
      b.items.map((i) => JSON.stringify(i)).join("\n"),
    );
    writeFileSync(
      join(bd, "updates.ndjson"),
      (b.updates ?? []).map((u) => JSON.stringify(u)).join("\n"),
    );
    writeFileSync(join(bd, ".done"), "");
  }
  for (const entry of Object.values(data.files ?? {})) {
    mkdirSync(join(dir, entry.path, ".."), { recursive: true });
    writeFileSync(join(dir, entry.path), "x");
  }
  writeFileSync(join(dir, "files", "index.json"), JSON.stringify(data.files));
  writeFileSync(join(dir, "mapping.json"), JSON.stringify(mapping));
  return dir;
}
