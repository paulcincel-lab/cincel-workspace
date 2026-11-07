"use client";

import { useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { GroupTargetsTable } from "@/components/configuracion/monday-import/GroupTargetsTable";
import { currentGroupTarget, hasGroupTargets, pruneGroupTargets } from "@/lib/monday-import/group-targets";
import { placementLabel, templateItemPlacement } from "@/lib/monday-import/template-phases";
import { StatusMapTable, type CreatedStatus } from "@/components/configuracion/monday-import/StatusMapTable";
import { statusMapLabels } from "@/lib/monday-import/status-map";
import {
  COLUMN_TARGET_LABELS,
  CONTACT_TYPE_LABELS,
  SUBITEM_LABELS,
  decodeClient,
  encodeClient,
  findBoard,
  groupEquivalent,
  projectKeys,
  setColumnTarget,
  setRecordEntry,
  strategyDescription,
  subitemsSection,
  templateCandidateItems,
  updateBoard,
  type BoardDraft,
} from "@/lib/monday-import/wizard-steps";
import type { ColumnTarget, MappingInput } from "@/scripts/monday/mapping.schema";
import type {
  MondayBoardSource,
  MondayExportSource,
  MondayImportChoices,
  MondayStatusMap,
} from "@/lib/types/monday-import";

const NONE = "__none__";

const COLUMN_CHOICES: Choice[] = Object.entries(COLUMN_TARGET_LABELS).map(([value, label]) => ({ value, label }));

function Section({ id, title, description, children }: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" aria-labelledby={id}>
      <div className="space-y-1">
        <h3 id={id} className="text-sm font-medium text-foreground">
          {title}
        </h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Two-column table: monday on the left, its Cincel equivalent on the right. */
function EquivalenceTable({ monday, cincel, children }: { monday: string; cincel: string; children: ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/2">{monday}</TableHead>
          <TableHead className="w-1/2">{cincel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

/**
 * Whether the board needs "Tramo del tablero": only when no group targets a tramo or a fase (FE §4.6 item 2).
 * Boards whose groups aren't mapped one by one always take the board's tramo.
 */
export function boardTramoRequired(
  board: BoardDraft,
  source: MondayBoardSource,
  choices: MondayImportChoices,
): boolean {
  if (!hasGroupTargets(board)) return true;
  return !source.groups.some((group) => {
    const target = currentGroupTarget(board, group, choices);
    return (target.kind === "tramo" && Boolean(target.workflowId)) || target.kind === "phase";
  });
}

/** One board's full mapping; also the body of its card in the board gallery (#685). */
export function BoardEquivalences({
  board,
  source,
  choices,
  onBoardChange,
}: {
  board: BoardDraft;
  source: MondayBoardSource;
  choices: MondayImportChoices;
  onBoardChange: (update: (board: BoardDraft) => BoardDraft) => void;
}) {
  const isCrm = board.strategy === "crm_contacts";
  const subitemsCopy = subitemsSection(board.strategy, board.subitems);
  const relationColumns = source.columns.filter(
    (column) => board.columns[column.id] === "client" || column.type === "board_relation",
  );
  const clientChoices: Choice[] = [
    { value: "none", label: "Sin cliente" },
    ...choices.clients.map((client) => ({ value: `contact:${client.id}`, label: client.name })),
    ...relationColumns.map((column) => ({ value: `relation:${column.id}`, label: `Columna «${column.title}»` })),
    { value: "new", label: "Nuevo contacto" },
  ];
  const tramoChoices: Choice[] = [
    { value: NONE, label: "Sin tramo" },
    ...choices.workflows.map((workflow) => ({ value: workflow.id, label: workflow.name })),
  ];
  const tramoMissing = !board.workflowId && boardTramoRequired(board, source, choices);
  const templateChoices = (workflowId: string | null): Choice[] => [
    { value: NONE, label: "Sin plantilla" },
    ...choices.templates
      .filter((template) => template.workflowId === workflowId)
      .map((template) => ({ value: template.id, label: template.name })),
  ];
  const keys = projectKeys(board, source);
  const templateItems = templateCandidateItems(board, source);
  const schedule = board.schedule ?? { enabled: false, planta: { fixed: "General" } };
  const planta = schedule.planta ?? { fixed: "General" };
  const plantaMode = "columnId" in planta ? `column:${planta.columnId}` : "fixed";
  const plantaChoices: Choice[] = [
    { value: "fixed", label: "Texto fijo" },
    ...source.columns.map((column) => ({ value: `column:${column.id}`, label: `Columna «${column.title}»` })),
  ];

  function columnRows(columns: MondayBoardSource["columns"], subitem: boolean) {
    const targets = subitem ? (board.subitemColumns ?? {}) : board.columns;
    return columns.map((column) => (
      <TableRow key={`${subitem ? "sub" : "col"}-${column.id}`}>
        <TableCell className="align-top">
          <span className="text-foreground">{column.title}</span>
          <span className="block text-xs text-muted-foreground">{column.type}</span>
        </TableCell>
        <TableCell>
          <ChoiceSelect
            label={`Campo de Cincel para ${column.title}`}
            value={targets[column.id] ?? "ignore"}
            choices={COLUMN_CHOICES}
            onChange={(value) =>
              onBoardChange((current) => setColumnTarget(current, column.id, value as ColumnTarget, subitem))
            }
          />
        </TableCell>
      </TableRow>
    ));
  }

  if (board.strategy === "skip") {
    return (
      <Alert>
        <AlertDescription>Este tablero no se importa. Cámbialo en Tableros si quieres importarlo.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{strategyDescription(board.strategy)}</p>

      <Section id={`cols-${board.mondayBoardId}`} title="Columnas" description="Cada columna de monday y su campo en Cincel.">
        <EquivalenceTable monday="Columna de monday" cincel="Campo de Cincel">
          {columnRows(source.columns, false)}
        </EquivalenceTable>
      </Section>

      {isCrm ? (
        <Section id={`crm-${board.mondayBoardId}`} title="Contactos" description="Tipo de contacto y coincidencias en el Directorio.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de contacto</Label>
              <ChoiceSelect
                label="Tipo de contacto"
                value={board.contactType ?? "cliente"}
                choices={Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                onChange={(value) =>
                  onBoardChange((current) => ({
                    ...current,
                    contactType: value as keyof typeof CONTACT_TYPE_LABELS,
                    providerSubtype: value === "proveedor" ? current.providerSubtype : undefined,
                  }))
                }
              />
            </div>
            {board.contactType === "proveedor" ? (
              <div className="space-y-2">
                <Label>Tipo de proveedor</Label>
                <ChoiceSelect
                  label="Tipo de proveedor"
                  value={board.providerSubtype ?? null}
                  choices={choices.providerSubtypes.map((value) => ({ value, label: value }))}
                  onChange={(value) => onBoardChange((current) => ({ ...current, providerSubtype: value }))}
                />
              </div>
            ) : null}
          </div>
          {(board.contactType ?? "cliente") === "cliente" ? (
            <EquivalenceTable monday="Elemento de monday" cincel="Contacto del Directorio">
              {source.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <ChoiceSelect
                      label={`Contacto para ${item.name}`}
                      value={board.contactMatches?.[item.id] ?? NONE}
                      choices={[
                        { value: NONE, label: "Nuevo contacto" },
                        ...choices.clients.map((client) => ({ value: client.id, label: client.name })),
                      ]}
                      onChange={(value) =>
                        onBoardChange((current) => ({
                          ...current,
                          contactMatches: setRecordEntry(current.contactMatches, item.id, value === NONE ? "" : value),
                        }))
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </EquivalenceTable>
          ) : null}
        </Section>
      ) : (
        <>
          <Section id={`groups-${board.mondayBoardId}`} title="Grupos y tramo">
            <div className="space-y-2 sm:max-w-sm">
              <Label>Tramo del tablero</Label>
              <ChoiceSelect
                label="Tramo del tablero"
                value={board.workflowId ?? NONE}
                choices={tramoChoices}
                onChange={(value) =>
                  onBoardChange((current) =>
                    pruneGroupTargets({ ...current, workflowId: value === NONE ? null : value }, choices),
                  )
                }
              />
              <p className="text-sm text-muted-foreground">
                El tramo de los grupos y elementos que no resuelven uno.
              </p>
              {tramoMissing ? (
                <p role="alert" className="text-sm text-destructive">
                  Elige un tramo.
                </p>
              ) : null}
            </div>
            {hasGroupTargets(board) ? (
              <GroupTargetsTable
                board={board}
                source={source}
                choices={choices}
                clientChoices={clientChoices}
                onBoardChange={onBoardChange}
              />
            ) : (
              <EquivalenceTable monday="Grupo de monday" cincel="En Cincel">
                {source.groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="align-top">{group.title}</TableCell>
                    <TableCell className="space-y-2 whitespace-normal">
                      <span className="text-foreground">{groupEquivalent(board.strategy, group.title)}</span>
                      {board.strategy === "group_as_project" ? (
                        <ChoiceSelect
                          label={`Cliente de ${group.title}`}
                          value={board.groupClients?.[group.id] ? encodeClient(board.groupClients[group.id]) : "none"}
                          choices={clientChoices}
                          onChange={(value) =>
                            onBoardChange((current) => {
                              const groupClients = { ...(current.groupClients ?? {}) };
                              const client = decodeClient(value, group.title);
                              if (client) groupClients[group.id] = client;
                              else delete groupClients[group.id];
                              return { ...current, groupClients };
                            })
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </EquivalenceTable>
            )}
          </Section>

          <Section
            id={`client-${board.mondayBoardId}`}
            title="Cliente (opcional)"
            description="Sin cliente, cada proyecto se crea con la tarea de administración «Asignar cliente y origen»."
          >
            <ChoiceSelect
              label="Cliente"
              value={encodeClient(board.client)}
              choices={clientChoices}
              onChange={(value) => onBoardChange((current) => ({ ...current, client: decodeClient(value) }))}
            />
            {board.client?.kind === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`client-name-${board.mondayBoardId}`}>Nombre del contacto nuevo</Label>
                  <Input
                    id={`client-name-${board.mondayBoardId}`}
                    value={board.client.name}
                    placeholder="Nombre del cliente"
                    aria-invalid={board.client.name.trim() ? undefined : true}
                    onChange={(event) =>
                      onBoardChange((current) =>
                        current.client?.kind === "new"
                          ? { ...current, client: { ...current.client, name: event.target.value } }
                          : current,
                      )
                    }
                  />
                  {board.client.name.trim() ? null : (
                    <p className="text-sm text-destructive">Escribe el nombre del contacto.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <ChoiceSelect
                    label="Tipo de contacto nuevo"
                    value={board.client.contactKind ?? "empresa"}
                    choices={[
                      { value: "empresa", label: "Empresa" },
                      { value: "particular", label: "Particular" },
                    ]}
                    onChange={(value) =>
                      onBoardChange((current) =>
                        current.client?.kind === "new"
                          ? { ...current, client: { ...current.client, contactKind: value as "empresa" | "particular" } }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
            ) : null}
          </Section>

          <Section id={`subitems-${board.mondayBoardId}`} title="Subelementos" description={subitemsCopy.description}>
            <ChoiceSelect
              label={subitemsCopy.selectLabel}
              value={board.subitems ?? "checklist"}
              choices={Object.entries(SUBITEM_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(value) =>
                onBoardChange((current) => ({ ...current, subitems: value as NonNullable<BoardDraft["subitems"]> }))
              }
            />
            {source.subitemColumns.length > 0 && subitemsCopy.showColumns ? (
              <EquivalenceTable monday="Columna de subelementos" cincel="Campo de Cincel">
                {columnRows(source.subitemColumns, true)}
              </EquivalenceTable>
            ) : null}
          </Section>

          {keys.length > 0 ? (
            <Section
              id={`names-${board.mondayBoardId}`}
              title="Nombres y códigos de proyecto"
              description="Déjalos vacíos para usar el nombre de monday."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>En monday</TableHead>
                    <TableHead>Nombre en Cincel</TableHead>
                    <TableHead>Código</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>{key.mondayName}</TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Nombre en Cincel de ${key.mondayName}`}
                          placeholder={key.mondayName}
                          value={board.projectNames?.[key.id] ?? ""}
                          onChange={(event) =>
                            onBoardChange((current) => ({
                              ...current,
                              projectNames: setRecordEntry(current.projectNames, key.id, event.target.value),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Código de ${key.mondayName}`}
                          value={
                            key.id === board.mondayBoardId && board.strategy === "board_as_project"
                              ? (board.projectCode ?? "")
                              : (board.projectCodes?.[key.id] ?? "")
                          }
                          onChange={(event) =>
                            onBoardChange((current) =>
                              key.id === current.mondayBoardId && current.strategy === "board_as_project"
                                ? { ...current, projectCode: event.target.value || undefined }
                                : {
                                    ...current,
                                    projectCodes: setRecordEntry(current.projectCodes, key.id, event.target.value),
                                  },
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          ) : null}

          <Section id={`schedule-${board.mondayBoardId}`} title="Cronograma" description="Crea filas de cronograma con las fechas de la línea de tiempo.">
            <Label className="flex items-center gap-2">
              <Switch
                checked={schedule.enabled}
                onCheckedChange={(checked) =>
                  onBoardChange((current) => ({ ...current, schedule: { ...schedule, enabled: checked } }))
                }
              />
              Crear cronograma
            </Label>
            {schedule.enabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Planta</Label>
                  <ChoiceSelect
                    label="Planta"
                    value={plantaMode}
                    choices={plantaChoices}
                    onChange={(value) =>
                      onBoardChange((current) => ({
                        ...current,
                        schedule: {
                          ...schedule,
                          planta: value.startsWith("column:")
                            ? { columnId: value.slice("column:".length) }
                            : { fixed: "General" },
                        },
                      }))
                    }
                  />
                </div>
                {"fixed" in planta ? (
                  <div className="space-y-2">
                    <Label htmlFor={`planta-${board.mondayBoardId}`}>Nombre de la planta</Label>
                    <Input
                      id={`planta-${board.mondayBoardId}`}
                      value={planta.fixed}
                      aria-invalid={planta.fixed.trim() ? undefined : true}
                      onChange={(event) =>
                        onBoardChange((current) => ({
                          ...current,
                          schedule: { ...schedule, planta: { fixed: event.target.value } },
                        }))
                      }
                    />
                    {planta.fixed.trim() ? null : <p className="text-sm text-destructive">Escribe la planta.</p>}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section
            id={`templates-${board.mondayBoardId}`}
            title="Tareas de plantilla"
            description="Cada elemento con su tarea de plantilla del tramo y la fase que tendrá en Cincel."
          >
            {templateItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este tablero no tiene elementos.</p>
            ) : (
              <EquivalenceTable monday="Elemento de monday" cincel="Tarea de plantilla · Tramo · Fase">
                {templateItems.map((item) => {
                  const placement = templateItemPlacement(board, source, item, choices);
                  const hasTramo = !placement.admin && !placement.ignored && placement.workflowId;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="align-top">{item.name}</TableCell>
                      <TableCell className="space-y-2 whitespace-normal">
                        {hasTramo ? (
                          <ChoiceSelect
                            label={`Plantilla para ${item.name}`}
                            value={board.templateMatches?.[item.id] ?? NONE}
                            choices={templateChoices(placement.workflowId)}
                            onChange={(value) =>
                              onBoardChange((current) => ({
                                ...current,
                                templateMatches: setRecordEntry(
                                  current.templateMatches,
                                  item.id,
                                  value === NONE ? "" : value,
                                ),
                              }))
                            }
                          />
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className={hasTramo ? "text-foreground" : "text-muted-foreground"}>
                            {placementLabel(placement)}
                          </span>
                          {placement.review ? <Badge variant="outline">Sin fase · revisar</Badge> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </EquivalenceTable>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** Paso 3: one equivalence table per board, prefilled by init and editable. */
export function EquivalenciasStep({
  mapping,
  source,
  choices,
  onMappingChange,
  onStatusCreated,
  onStatusMapSaved,
  initialBoardId,
}: {
  mapping: MappingInput;
  source: MondayExportSource;
  choices: MondayImportChoices;
  onMappingChange: (mapping: MappingInput) => void;
  onStatusCreated: (status: CreatedStatus) => void;
  /** The firm-wide status map the server saved (FE §4.6 item 5). */
  onStatusMapSaved?: (statusMap: MondayStatusMap) => void;
  /** The board to open on, e.g. from "Corregir" in Vista previa. */
  initialBoardId?: string | null;
}) {
  const [boardId, setBoardId] = useState(initialBoardId ?? mapping.boards[0]?.mondayBoardId ?? "");
  const board = findBoard(mapping, boardId) ?? mapping.boards[0];
  const boardSource = source.boards.find((candidate) => candidate.id === board?.mondayBoardId);

  if (!board) {
    return (
      <Alert>
        <AlertDescription>No hay tableros para importar. Vuelve a Tableros.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        id="monday-status-map"
        title="Estatus de monday"
        description="Se guarda para todo el despacho y se usa en esta y en las próximas importaciones."
      >
        <StatusMapTable
          labels={statusMapLabels(mapping, source)}
          choices={choices}
          onStatusCreated={onStatusCreated}
          onSaved={onStatusMapSaved}
        />
      </Section>
      <div className="space-y-2">
        <Label>Tablero</Label>
        <ChoiceSelect
          label="Tablero"
          value={board.mondayBoardId}
          choices={mapping.boards.map((candidate) => ({ value: candidate.mondayBoardId, label: candidate.name }))}
          onChange={setBoardId}
        />
      </div>
      {boardSource ? (
        <BoardEquivalences
          key={board.mondayBoardId}
          board={board}
          source={boardSource}
          choices={choices}
          onBoardChange={(update) => onMappingChange(updateBoard(mapping, board.mondayBoardId, update))}
        />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>Este tablero no está en la exportación. Exporta otra vez en Tableros.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
