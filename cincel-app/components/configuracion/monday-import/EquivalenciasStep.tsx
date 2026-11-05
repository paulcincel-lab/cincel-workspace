"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { createTaskStatusAction } from "@/lib/actions/task-statuses-actions";
import {
  BASE_STATUS_LABELS,
  COLUMN_TARGET_LABELS,
  CONTACT_TYPE_LABELS,
  SUBITEM_LABELS,
  boardsWithoutClient,
  decodeClient,
  decodeStatusTarget,
  encodeClient,
  encodeStatusTarget,
  findBoard,
  groupEquivalent,
  isDefaultedStatus,
  lacksClient,
  projectKeys,
  setBoardArea,
  setBoardWorkflow,
  setColumnTarget,
  setRecordEntry,
  setStatusTarget,
  strategyDescription,
  subitemsSection,
  templateCandidateItems,
  updateBoard,
  workflowsForBoard,
  type BoardDraft,
} from "@/lib/monday-import/wizard-steps";
import type { ColumnTarget, MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

const NONE = "__none__";
const CREATE_STATUS = "__create__";

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

/** One status label row; "Crear estatus" opens an inline form that creates it in Configuración → Estatus. */
function StatusLabelRow({
  label,
  value,
  defaulted,
  statusChoices,
  onChange,
  onStatusCreated,
}: {
  label: { id: string; name: string; isDone: boolean };
  value: string;
  /** No equivalent was found and it defaulted to Pendiente: flagged until the admin picks one. */
  defaulted: boolean;
  statusChoices: Choice[];
  onChange: (value: string) => void;
  onStatusCreated: (status: { id: string; name: string; closes: boolean }) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(label.name);
  const [closes, setCloses] = useState(label.isDone);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const errorId = `status-create-error-${label.id}`;

  function create() {
    setError("");
    if (!name.trim()) {
      setError("Escribe el nombre del estatus.");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createTaskStatusAction({ name: name.trim(), closes });
        onStatusCreated({ id: created.id, name: created.name, closes: created.closes });
        onChange(`custom:${created.id}`);
        setCreating(false);
      } catch {
        setError("No se pudo crear el estatus. Revisa que el nombre no exista ya.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="align-top">
        <span className="text-foreground">{label.name}</span>
        {label.isDone ? (
          <Badge variant="outline" className="ml-2">
            Terminado en monday
          </Badge>
        ) : null}
        {defaulted ? (
          <Badge variant="secondary" className="ml-2">
            Sin equivalente, revisar
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="space-y-2">
        <ChoiceSelect
          label={`Estatus para ${label.name}`}
          value={value}
          choices={[...statusChoices, { value: CREATE_STATUS, label: "Crear estatus…" }]}
          onChange={(next) => (next === CREATE_STATUS ? setCreating(true) : onChange(next))}
        />
        {creating ? (
          <div className="space-y-2">
            <Input
              aria-label="Nombre del estatus nuevo"
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            <Label className="flex items-center gap-2">
              <Checkbox checked={closes} onCheckedChange={(checked) => setCloses(checked === true)} />
              Cierra la tarea
            </Label>
            <div className="flex gap-2">
              <Button size="sm" disabled={isPending} onClick={create}>
                {isPending ? "Creando…" : "Crear estatus"}
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
            {error ? (
              <Alert id={errorId} variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function BoardEquivalences({
  board,
  source,
  choices,
  onBoardChange,
  onStatusCreated,
}: {
  board: BoardDraft;
  source: MondayBoardSource;
  choices: MondayImportChoices;
  onBoardChange: (update: (board: BoardDraft) => BoardDraft) => void;
  onStatusCreated: (status: { id: string; name: string; closes: boolean }) => void;
}) {
  const isCrm = board.strategy === "crm_contacts";
  const subitemsCopy = subitemsSection(board.strategy, board.subitems);
  const statusChoices: Choice[] = [
    ...Object.entries(BASE_STATUS_LABELS).map(([value, label]) => ({ value: `status:${value}`, label })),
    ...choices.statuses.map((status) => ({ value: `custom:${status.id}`, label: `${status.name} (personalizado)` })),
  ];
  const columnTitle = new Map(
    [...source.columns, ...source.subitemColumns].map((column) => [column.id, column.title]),
  );
  const statusColumns = [
    ...Object.entries(board.columns).filter(([, target]) => target === "status").map(([id]) => id),
    ...Object.entries(board.subitemColumns ?? {})
      .filter(([id, target]) => target === "status" && board.columns[id] !== "status")
      .map(([id]) => id),
  ];
  const relationColumns = source.columns.filter(
    (column) => board.columns[column.id] === "client" || column.type === "board_relation",
  );
  const clientChoices: Choice[] = [
    { value: "none", label: "Sin cliente" },
    ...choices.clients.map((client) => ({ value: `contact:${client.id}`, label: client.name })),
    ...relationColumns.map((column) => ({ value: `relation:${column.id}`, label: `Columna «${column.title}»` })),
    { value: "new", label: "Nuevo contacto" },
  ];
  const areaChoices: Choice[] = [
    { value: NONE, label: "Sin departamento" },
    ...choices.areas.map((area) => ({ value: area.id, label: area.name })),
  ];
  const workflowChoices: Choice[] = [
    { value: NONE, label: "Sin workflow" },
    ...workflowsForBoard(board, choices).map((workflow) => ({ value: workflow.id, label: workflow.name })),
  ];
  const templateChoices: Choice[] = [
    { value: NONE, label: "Sin plantilla" },
    ...choices.templates
      .filter((template) => template.workflowId === board.workflowId)
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
              onBoardChange((current) => setColumnTarget(current, source, column.id, value as ColumnTarget, subitem))
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

      {statusColumns.length > 0 ? (
        <Section id={`status-${board.mondayBoardId}`} title="Estatus" description="Cada etiqueta de estatus de monday.">
          {statusColumns.map((columnId) => (
            <EquivalenceTable key={columnId} monday={`Etiqueta de «${columnTitle.get(columnId) ?? columnId}»`} cincel="Estatus de Cincel">
              {(source.statusLabels[columnId] ?? []).map((label) => (
                <StatusLabelRow
                  key={label.id}
                  label={label}
                  value={encodeStatusTarget(board.statusMaps[columnId]?.[label.id])}
                  defaulted={isDefaultedStatus(board.statusMaps[columnId]?.[label.id])}
                  statusChoices={statusChoices}
                  onStatusCreated={onStatusCreated}
                  onChange={(value) => {
                    const target = decodeStatusTarget(value);
                    if (target) onBoardChange((current) => setStatusTarget(current, columnId, label.id, target));
                  }}
                />
              ))}
            </EquivalenceTable>
          ))}
        </Section>
      ) : null}

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
          <Section id={`groups-${board.mondayBoardId}`} title="Grupos, departamento y workflow">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Departamento</Label>
                <ChoiceSelect
                  label="Departamento"
                  value={board.areaId ?? NONE}
                  choices={areaChoices}
                  onChange={(value) => onBoardChange((current) => setBoardArea(current, value === NONE ? null : value, choices))}
                />
              </div>
              <div className="space-y-2">
                <Label>Workflow</Label>
                <ChoiceSelect
                  label="Workflow"
                  value={board.workflowId ?? NONE}
                  choices={workflowChoices}
                  onChange={(value) =>
                    onBoardChange((current) => setBoardWorkflow(current, value === NONE ? null : value, choices))
                  }
                />
              </div>
            </div>
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
          </Section>

          <Section
            id={`client-${board.mondayBoardId}`}
            title="Cliente (obligatorio)"
            description="El cliente de los proyectos de este tablero. Sin cliente no se pueden importar."
          >
            <ChoiceSelect
              label="Cliente"
              value={encodeClient(board.client)}
              choices={clientChoices}
              onChange={(value) => onBoardChange((current) => ({ ...current, client: decodeClient(value) }))}
            />
            {lacksClient(board, source) ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {board.strategy === "group_as_project"
                    ? "Hay grupos sin cliente. Elige el cliente aquí o en cada grupo."
                    : "Este tablero no tiene cliente. Elige un contacto, una columna o Nuevo contacto."}
                </AlertDescription>
              </Alert>
            ) : null}
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
                            board.strategy === "board_as_project"
                              ? (board.projectCode ?? "")
                              : (board.projectCodes?.[key.id] ?? "")
                          }
                          onChange={(event) =>
                            onBoardChange((current) =>
                              current.strategy === "board_as_project"
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
            title="Plantillas del workflow"
            description="Los elementos que coinciden con una tarea de plantilla del workflow."
          >
            {!board.workflowId ? (
              <p className="text-sm text-muted-foreground">Elige un workflow para asignar plantillas.</p>
            ) : templateItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este tablero no tiene elementos.</p>
            ) : (
              <EquivalenceTable monday="Elemento de monday" cincel="Plantilla de tarea">
                {templateItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <ChoiceSelect
                        label={`Plantilla para ${item.name}`}
                        value={board.templateMatches?.[item.id] ?? NONE}
                        choices={templateChoices}
                        onChange={(value) =>
                          onBoardChange((current) => ({
                            ...current,
                            templateMatches: setRecordEntry(current.templateMatches, item.id, value === NONE ? "" : value),
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
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
  initialBoardId,
}: {
  mapping: MappingInput;
  source: MondayExportSource;
  choices: MondayImportChoices;
  onMappingChange: (mapping: MappingInput) => void;
  onStatusCreated: (status: { id: string; name: string; closes: boolean }) => void;
  /** The board to open on, e.g. from "Corregir" in Vista previa. */
  initialBoardId?: string | null;
}) {
  const [boardId, setBoardId] = useState(initialBoardId ?? mapping.boards[0]?.mondayBoardId ?? "");
  const board = findBoard(mapping, boardId) ?? mapping.boards[0];
  const boardSource = source.boards.find((candidate) => candidate.id === board?.mondayBoardId);
  const withoutClient = boardsWithoutClient(mapping, source);
  const missingNames = withoutClient.map((candidate) => candidate.name).join(", ");

  if (!board) {
    return (
      <Alert>
        <AlertDescription>No hay tableros para importar. Vuelve a Tableros.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Tablero</Label>
        <ChoiceSelect
          label="Tablero"
          value={board.mondayBoardId}
          choices={mapping.boards.map((candidate) => ({
            value: candidate.mondayBoardId,
            label: withoutClient.includes(candidate) ? `${candidate.name} (sin cliente)` : candidate.name,
          }))}
          onChange={setBoardId}
        />
      </div>
      {withoutClient.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Faltan clientes</AlertTitle>
          <AlertDescription>
            <p>Estos tableros crean proyectos sin cliente y no se podrán importar:</p>
            <ul className="flex flex-wrap gap-2 pt-1">
              {withoutClient.map((candidate) => (
                <li key={candidate.mondayBoardId}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={candidate.mondayBoardId === board.mondayBoardId}
                    onClick={() => setBoardId(candidate.mondayBoardId)}
                  >
                    {candidate.name}
                  </Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {boardSource ? (
        <BoardEquivalences
          key={board.mondayBoardId}
          board={board}
          source={boardSource}
          choices={choices}
          onStatusCreated={onStatusCreated}
          onBoardChange={(update) => onMappingChange(updateBoard(mapping, board.mondayBoardId, update))}
        />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>Este tablero no está en la exportación. Exporta otra vez en Tableros.</AlertDescription>
        </Alert>
      )}
      {withoutClient.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            Sin cliente: {missingNames}. Puedes seguir, pero la Vista previa no dejará importar hasta que elijas uno.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
