/**
 * The board cards of the full-screen importer (#685): one card per monday board with its status chip («listo»,
 * «⚠ n», «mapear»), its live counts and the selection helpers. Pure and client-safe: the gallery, the footer bar
 * and the tests share it.
 */
import { ownProjectGroups } from "@/lib/monday-import/group-targets";
import { unmappedTaskAreaValues } from "@/lib/monday-import/task-areas";
import { isDefaultedStatus, lacksClient, validateMapping, type BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { BoardStrategy, MappingInput } from "@/scripts/monday/mapping.schema";
import type {
  MondayBoardSource,
  MondayConnection,
  MondayExportSource,
  MondayPreview,
  MondayPreviewBoard,
} from "@/lib/types/monday-import";

/** «listo»: mapped and reviewed; «⚠ n»: n problems to fix; «mapear»: not reviewed (or not exported) yet. */
export type BoardChip = { kind: "listo" } | { kind: "problemas"; count: number } | { kind: "mapear" };

/** What the board would create; `tareas` is null when only the Vista previa knows (subitems aren't in the source). */
export interface BoardCounts {
  proyectos: number;
  tareas: number | null;
  contactos: number;
  avisos: number;
}

export interface BoardCard {
  id: string;
  name: string;
  workspaceId: string | null;
  workspaceName: string | null;
  itemCount: number | null;
  groupCount: number | null;
  /** monday people on the board (people columns of its items), for the avatars. */
  people: { id: string; name: string }[];
  /** In the export, so its mapping can be opened. */
  exported: boolean;
  strategy: BoardStrategy | null;
  chip: BoardChip;
  /** Spanish, one line per problem. */
  problems: string[];
  counts: BoardCounts;
  /** Counts estimated from the export; false once a Vista previa computed them. */
  estimated: boolean;
}

/** "Sin espacio" for boards outside any workspace, "Espacio 12" when monday doesn't give its name. */
export function workspaceLabel(id: string | null, name: string | null): string {
  return name ?? (id ? `Espacio ${id}` : "Sin espacio");
}

/** Up to two initials of a person's name, for the avatar fallback. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [...(words[0] ?? "?").slice(0, 2)];
  return letters.join("").toUpperCase();
}

/** The problems of one board's mapping: schema errors, no client, labels and área values without an equivalent. */
export function boardProblems(
  mapping: MappingInput,
  boardId: string,
  source: MondayBoardSource | undefined,
  preview: MondayPreview | null = null,
): string[] {
  const index = mapping.boards.findIndex((board) => board.mondayBoardId === boardId);
  const board = mapping.boards[index];
  if (!board) return [];
  if (!source) return ["No está en la exportación. Exporta otra vez."];
  if (board.strategy === "skip") return [];
  const prefix = `boards.${index}`;
  const problems = validateMapping(mapping)
    .filter((issue) => issue === prefix || issue.startsWith(`${prefix}.`) || issue.startsWith(`${prefix}:`))
    .map((issue) => issue.slice(prefix.length).replace(/^[.:]\s*/, ""));
  if (lacksClient(board, source)) problems.push("Sin cliente.");
  const defaulted = Object.values(board.statusMaps ?? {}).reduce(
    (sum, labels) => sum + Object.values(labels).filter((target) => isDefaultedStatus(target)).length,
    0,
  );
  if (defaulted > 0)
    problems.push(defaulted === 1 ? "1 estatus sin equivalente." : `${defaulted} estatus sin equivalente.`);
  const areas = unmappedTaskAreaValues(board, source).length;
  if (areas > 0)
    problems.push(areas === 1 ? "1 valor de área sin equivalente." : `${areas} valores de área sin equivalente.`);
  for (const issue of preview?.issues ?? []) {
    if (issue.blocking && issue.boardId === boardId && !problems.includes(issue.message)) problems.push(issue.message);
  }
  return problems;
}

/** Problems first, then reviewed boards are «listo»; boards not exported or not opened yet are «mapear». */
export function boardChip(problems: readonly string[], exported: boolean, reviewed: boolean): BoardChip {
  if (!exported) return { kind: "mapear" };
  if (problems.length > 0) return { kind: "problemas", count: problems.length };
  return reviewed ? { kind: "listo" } : { kind: "mapear" };
}

/** Accessible text of a chip. */
export function chipLabel(chip: BoardChip): string {
  if (chip.kind === "listo") return "listo";
  if (chip.kind === "mapear") return "mapear";
  return `⚠ ${chip.count}`;
}

function newClients(board: BoardDraft): number {
  const groupClients = Object.values(board.groupClients ?? {}).filter((client) => client?.kind === "new").length;
  return (board.client?.kind === "new" ? 1 : 0) + groupClients;
}

/** What the board creates, estimated from the export by its strategy (the Vista previa gives the exact numbers). */
export function estimateBoardCounts(board: BoardDraft, source: MondayBoardSource): Omit<BoardCounts, "avisos"> {
  const ignored = new Set(
    Object.entries(board.groupTargets ?? {})
      .filter(([, target]) => target?.kind === "ignore")
      .map(([groupId]) => groupId),
  );
  const items = source.items.filter((item) => !item.groupId || !ignored.has(item.groupId));
  switch (board.strategy) {
    case "board_as_project": {
      const proyectos = 1 + ownProjectGroups(board, source).length;
      return { proyectos, tareas: items.length, contactos: newClients(board) };
    }
    case "group_as_project": {
      const groups = source.groups.filter((group) => !ignored.has(group.id)).length;
      return { proyectos: groups, tareas: items.length, contactos: newClients(board) };
    }
    case "item_as_project":
      return { proyectos: items.length, tareas: null, contactos: newClients(board) };
    case "crm_contacts":
      return { proyectos: 0, tareas: 0, contactos: source.items.length };
    case "skip":
      return { proyectos: 0, tareas: 0, contactos: 0 };
  }
}

function previewCounts(board: MondayPreviewBoard, preview: MondayPreview, problems: number): BoardCounts {
  const warnings = preview.issues.filter((issue) => issue.boardId === board.boardId && !issue.blocking).length;
  return {
    proyectos: board.counts.proyectos,
    tareas: board.counts.tareas + board.counts.subtareas,
    contactos: board.counts.contactos,
    avisos: problems + warnings,
  };
}

/**
 * One card per board: the monday boards of the connection (to pick before the export) plus any board of the draft
 * the connection doesn't list (a resumed run without connecting again).
 */
export function buildBoardCards({
  connection,
  mapping,
  source,
  preview,
  reviewed,
}: {
  connection: MondayConnection | null;
  mapping: MappingInput | null;
  source: MondayExportSource | null;
  preview: MondayPreview | null;
  reviewed: ReadonlySet<string>;
}): BoardCard[] {
  const base: Pick<BoardCard, "id" | "name" | "workspaceId" | "workspaceName" | "itemCount">[] = [
    ...(connection?.boards ?? []).map((board) => ({
      id: board.id,
      name: board.name,
      workspaceId: board.workspaceId,
      workspaceName: board.workspaceName,
      itemCount: board.itemsCount,
    })),
  ];
  const listed = new Set(base.map((board) => board.id));
  for (const board of mapping?.boards ?? []) {
    if (listed.has(board.mondayBoardId)) continue;
    base.push({ id: board.mondayBoardId, name: board.name, workspaceId: null, workspaceName: null, itemCount: null });
  }
  const users = new Map((source?.users ?? []).map((user) => [user.id, user]));
  return base.map((summary) => {
    const draft = mapping?.boards.find((board) => board.mondayBoardId === summary.id);
    const boardSource = source?.boards.find((board) => board.id === summary.id);
    const exported = Boolean(draft && boardSource);
    const problems = mapping && draft ? boardProblems(mapping, summary.id, boardSource, preview) : [];
    const previewBoard = preview?.boards.find((board) => board.boardId === summary.id);
    let counts: BoardCounts = { proyectos: 0, tareas: null, contactos: 0, avisos: problems.length };
    if (preview && previewBoard) counts = previewCounts(previewBoard, preview, problems.length);
    else if (draft && boardSource) counts = { ...estimateBoardCounts(draft, boardSource), avisos: problems.length };
    const people = (boardSource?.userIds ?? []).flatMap((id) => {
      const user = users.get(id);
      return user ? [{ id: user.id, name: user.name }] : [];
    });
    return {
      ...summary,
      name: draft?.name ?? summary.name,
      itemCount: boardSource?.itemCount ?? summary.itemCount,
      groupCount: boardSource ? boardSource.groups.length : null,
      people,
      exported,
      strategy: draft?.strategy ?? null,
      chip: boardChip(problems, exported, reviewed.has(summary.id)),
      problems,
      counts,
      estimated: !(preview && previewBoard),
    };
  });
}

/** Cards matching the search (name or workspace, accents and case ignored) and the workspace filter ("" = all). */
export function filterBoardCards(cards: readonly BoardCard[], query: string, workspaceId: string): BoardCard[] {
  const key = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const wanted = key(query);
  return cards.filter((card) => {
    if (workspaceId && (card.workspaceId ?? "") !== workspaceId) return false;
    if (!wanted) return true;
    const workspace = key(workspaceLabel(card.workspaceId, card.workspaceName));
    return key(card.name).includes(wanted) || workspace.includes(wanted);
  });
}

/** The workspaces the cards belong to, for the filter. */
export function cardWorkspaces(cards: readonly BoardCard[]): { id: string; name: string }[] {
  const out = new Map<string, string>();
  for (const card of cards) {
    if (card.workspaceId && !out.has(card.workspaceId))
      out.set(card.workspaceId, workspaceLabel(card.workspaceId, card.workspaceName));
  }
  return [...out].map(([id, name]) => ({ id, name }));
}

export function toggleBoard(selected: readonly string[], boardId: string, checked: boolean): string[] {
  const next = selected.filter((id) => id !== boardId);
  return checked ? [...next, boardId] : next;
}

/** "Seleccionar todos" adds the visible cards to the selection; "Ninguno" removes them (hidden picks stay). */
export function selectBoards(selected: readonly string[], visible: readonly BoardCard[], checked: boolean): string[] {
  const ids = new Set(visible.map((card) => card.id));
  const kept = selected.filter((id) => !ids.has(id));
  return checked ? [...kept, ...visible.map((card) => card.id)] : kept;
}

/** Footer totals of the selected cards; `tareas` is null when some selected board can't estimate them. */
export function selectionTotals(cards: readonly BoardCard[], selected: readonly string[]): BoardCounts & { n: number } {
  const picked = new Set(selected);
  const chosen = cards.filter((card) => picked.has(card.id));
  return chosen.reduce<BoardCounts & { n: number }>(
    (sum, card) => ({
      n: sum.n + 1,
      proyectos: sum.proyectos + card.counts.proyectos,
      tareas: sum.tareas === null || card.counts.tareas === null ? null : sum.tareas + card.counts.tareas,
      contactos: sum.contactos + card.counts.contactos,
      avisos: sum.avisos + card.counts.avisos,
    }),
    { n: 0, proyectos: 0, tareas: 0, contactos: 0, avisos: 0 },
  );
}

/** Whether the picked boards differ from the exported ones, so "Importar n tableros" exports (again) first. */
export function needsExport(exported: boolean, exportedIds: readonly string[], selected: readonly string[]): boolean {
  if (!exported) return true;
  const done = new Set(exportedIds);
  return selected.length !== done.size || selected.some((id) => !done.has(id));
}
