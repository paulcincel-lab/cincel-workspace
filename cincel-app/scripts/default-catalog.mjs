// The default fase catalog, task templates and puestos every install starts
// with (project flow BE §5). Shared by scripts/seed.ts and scripts/migrate.mjs;
// mirrored in migration 0024 (a drift guard test keeps the two equal). Plain
// .mjs with no app imports so the runtime image can run it next to migrate.mjs.

/**
 * @typedef {{ title: string; legacyTitle: string }} CatalogTemplate
 *   `legacyTitle` is the spelling of the old TS templates (lib/templates/*.ts),
 *   used only to link existing tasks to their template (0024 step 5e).
 * @typedef {{ key: string; name: string; templates: ReadonlyArray<CatalogTemplate> }} CatalogPhase
 * @typedef {{ workflowKey: string; phases: ReadonlyArray<CatalogPhase> }} CatalogTramo
 * @typedef {{ workflowKey: string; phaseKey: string }} PhaseRef
 * @typedef {{ name: string; phases: ReadonlyArray<PhaseRef> }} DefaultPosition
 */

/** @param {string} title @param {string} [legacyTitle] @returns {CatalogTemplate} */
const t = (title, legacyTitle = title) => Object.freeze({ title, legacyTitle });

/** @param {string} key @param {string} name @param {CatalogTemplate[]} templates @returns {CatalogPhase} */
const phase = (key, name, templates) => Object.freeze({ key, name, templates: Object.freeze(templates) });

/** Fases (§5.1) in `sort_order`, each with its templates (§5.2) in seed order. */
/** @type {ReadonlyArray<CatalogTramo>} */
export const DEFAULT_CATALOG = Object.freeze([
  Object.freeze({
    workflowKey: "presale",
    phases: Object.freeze([
      phase("inicial", "Inicial", [t('Presentación "Quiénes somos"', 'Presentación "Quienes somos"')]),
      phase("presentacion", "Presentación", [
        t("Reporte Estado Actual", "Resporte Estado Actual"),
        t("Imágenes de Referencia", "Imagenes de Referencia"),
        t("Plano preliminar"),
        t("Primeras Visualizaciones"),
        t("Rango de Precios"),
        t("Presupuesto Diseño"),
      ]),
      phase("con_cliente", "Con Cliente", [t("Presentar a cliente")]),
      phase("minutas", "Minutas", [t("Minuta")]),
      phase("cobro", "Cobro", [t("Cobrar Inicio de proyecto")]),
    ]),
  }),
  Object.freeze({
    workflowKey: "diseno",
    phases: Object.freeze([
      phase("anteproyecto", "Anteproyecto", [
        t("Levantamiento"),
        t("Concepto"),
        t("Plano de distribución", "Plano de distribicion"),
        t("Volumetría", "Volumetria"),
      ]),
      phase("proyecto_arquitectonico", "Proyecto Arquitectónico", [
        t("Planos Arquitectónicos", "Planos Arquitectonicos"),
        t("Fachadas y alzados"),
        t("Mood Board"),
        t("Renders"),
      ]),
      phase("ejecutivo", "Ejecutivo", [
        t("Fachadas y alzados"),
        t("Planos de Demolición Desmantelamiento", "Planos de Demolicion Desmantelamiento"),
        t("Planos de Albañilerías", "Planos de Albanilerias"),
        t("Planos Eléctricos", "Planos Electricos"),
        t("Planos Iluminación", "Planos Iluminacion"),
        t("Planos Hidráulicos", "Planos Hidraulicos"),
        t("Planos Sanitarios"),
        t("Planos Acabados"),
        t("Planos de Carpintería", "Planos de Carpinteria"),
        t("Plano de Mobiliario"),
        t("Plano de Cancelerías", "Plano de Cancelerias"),
        t("Planos de Herrerías", "Planos de Herrerias"),
        t("Memoria Descriptiva"),
        t("Detalles y Especificaciones Técnicas", "Detalles y Especificaciones Tecnicas"),
      ]),
      phase("proyecto_estructural", "Proyecto Estructural", [
        t("Memoria de Cálculo", "Memoria de Calculo"),
        t("Cálculos Simulaciones", "Calculos Simulaciones"),
      ]),
      phase("proyecto_sustentable", "Proyecto Sustentable", [
        t("Captación Agua Pluvial", "Captacion Agua Pluvial"),
        t("Tratamiento aguas"),
        t("Fotovoltaico"),
      ]),
      phase("paisajismo", "Paisajismo", [t("Paleta Vegetal")]),
      phase("minutas", "Minutas", [t("Minutas")]),
    ]),
  }),
  Object.freeze({
    workflowKey: "construccion",
    phases: Object.freeze([
      phase("residencia", "Residencia", [
        t("Bitácoras y Minutas", "Bitacoras y Minutas"),
        t("Reporte de Avance"),
        t("Revisión de planos", "Revision de planos"),
        t("Supervisión de trabajos", "Supervicion de trabajos"),
        t("Cumplimiento Seguridad"),
        t("Cumplimiento Orden y Limpieza"),
        t("Atención a calidad y detalles finos", "Atencion a calidad y detalles finos"),
        t("Garantías", "Garantias"),
        t("Manual de Mantenimiento"),
        t("Cierre de obra (Firma de actas)"),
      ]),
      phase("postventa", "Postventa", [t("Mantenimientos"), t("Garantías", "Garantias")]),
    ]),
  }),
]);

/** @param {string} workflowKey @param {string[]} phaseKeys @returns {ReadonlyArray<PhaseRef>} */
const refs = (workflowKey, phaseKeys) =>
  Object.freeze(phaseKeys.map((phaseKey) => Object.freeze({ workflowKey, phaseKey })));

/** Puestos (§5.3) with their candidate fases (suggestions only; editable after seeding). */
/** @type {ReadonlyArray<DefaultPosition>} */
export const DEFAULT_POSITIONS = Object.freeze([
  { name: "Arquitecto proyectista", phases: refs("diseno", ["anteproyecto", "proyecto_arquitectonico", "paisajismo"]) },
  { name: "Proyectista ejecutivo", phases: refs("diseno", ["ejecutivo", "proyecto_estructural", "proyecto_sustentable"]) },
  { name: "Dibujante", phases: refs("diseno", ["proyecto_arquitectonico", "ejecutivo"]) },
  { name: "Comercial", phases: refs("presale", ["inicial", "presentacion", "con_cliente", "minutas"]) },
  { name: "Residente de obra", phases: refs("construccion", ["residencia", "postventa"]) },
  { name: "Administración", phases: refs("presale", ["cobro"]) },
].map((p) => Object.freeze(p)));

/**
 * Statuses a fresh install gets (BE §4.2 step 7): Cancelado closes a task
 * without counting it as completed; En espera is open.
 * @type {ReadonlyArray<{ name: string; closes: boolean }>}
 */
export const DEFAULT_FLOW_STATUSES = Object.freeze([
  Object.freeze({ name: "Cancelado", closes: true }),
  Object.freeze({ name: "En espera", closes: false }),
]);

/**
 * @typedef {{ phases: number; templates: number; positions: number; positionPhases: number; statuses: number }} CatalogChanges
 */

/**
 * Seeds the default catalog on a fresh install (BE §5.4). Never updates or
 * deletes existing rows and never brings back a soft-deleted one; safe to repeat.
 *
 * - Fases and templates: only for a live default workflow with no
 *   `workflow_phases` rows at all.
 * - Puestos: only when `core.positions` has no rows at all (soft-deleted count).
 *   Puestos created here get their candidate fases.
 * - On a call that seeded fases, each live default puesto (by lower(name))
 *   with no `position_phases` rows gets its candidate fases (0024 step 14
 *   creates the puestos before any fase exists), and Cancelado / En espera are
 *   created when no status with that name exists, soft-deleted included.
 *
 * Returns how many rows of each kind were created.
 * @param {import("postgres").Sql | import("postgres").TransactionSql} sql
 * @param {{ catalog?: ReadonlyArray<CatalogTramo>; positions?: ReadonlyArray<DefaultPosition> }} [options]
 * @returns {Promise<CatalogChanges>}
 */
export async function ensureDefaultCatalog(sql, { catalog = DEFAULT_CATALOG, positions = DEFAULT_POSITIONS } = {}) {
  /** @type {CatalogChanges} */
  const changes = { phases: 0, templates: 0, positions: 0, positionPhases: 0, statuses: 0 };

  for (const tramo of catalog) {
    const [workflow] = await sql`
      select w.id,
        (select count(*)::int from core.workflow_phases p where p.workflow_id = w.id) as phase_count
      from core.workflows w
      where w.key = ${tramo.workflowKey} and w.deleted_at is null
      limit 1`;
    if (!workflow || workflow.phase_count > 0) continue;

    let templateOrder = 0;
    for (const [i, p] of tramo.phases.entries()) {
      const [row] = await sql`
        insert into core.workflow_phases (workflow_id, key, name, sort_order)
        values (${workflow.id}, ${p.key}, ${p.name}, ${i})
        on conflict do nothing
        returning id`;
      if (!row) {
        templateOrder += p.templates.length;
        continue;
      }
      changes.phases += 1;
      for (const template of p.templates) {
        const inserted = await sql`
          insert into core.workflow_task_templates (workflow_id, phase_id, title, default_priority, sort_order)
          values (${workflow.id}, ${row.id}, ${template.title}, 'media', ${templateOrder})
          on conflict do nothing
          returning id`;
        changes.templates += inserted.length;
        templateOrder += 1;
      }
    }
  }

  /** @type {Set<string>} lower(name) of the puestos created by this call */
  const createdPositions = new Set();
  const [{ count: positionCount }] = await sql`select count(*)::int as count from core.positions`;
  if (positionCount === 0) {
    for (const [i, p] of positions.entries()) {
      const rows = await sql`
        insert into core.positions (name, sort_order) values (${p.name}, ${i})
        on conflict do nothing
        returning id`;
      if (rows.length) createdPositions.add(p.name.toLowerCase());
      changes.positions += rows.length;
    }
  }

  const seededPhases = changes.phases > 0;
  if (seededPhases || createdPositions.size > 0) {
    for (const p of positions) {
      if (!seededPhases && !createdPositions.has(p.name.toLowerCase())) continue;
      const [position] = await sql`
        select pos.id from core.positions pos
        where lower(pos.name) = lower(${p.name}) and pos.deleted_at is null
          and not exists (select 1 from core.position_phases pp where pp.position_id = pos.id)
        limit 1`;
      if (!position) continue;
      for (const ref of p.phases) {
        const rows = await sql`
          insert into core.position_phases (position_id, phase_id)
          select ${position.id}, ph.id
          from core.workflow_phases ph
          join core.workflows w on w.id = ph.workflow_id
          where w.key = ${ref.workflowKey} and w.deleted_at is null and ph.key = ${ref.phaseKey}
          limit 1
          on conflict do nothing
          returning phase_id`;
        changes.positionPhases += rows.length;
      }
    }
  }

  if (seededPhases) {
    for (const status of DEFAULT_FLOW_STATUSES) {
      const rows = await sql`
        insert into core.task_statuses (name, closes, counts_as_completed, sort_order)
        select ${status.name}, ${status.closes}, false,
          coalesce((select max(sort_order) + 1 from core.task_statuses where deleted_at is null), 0)
        where not exists (select 1 from core.task_statuses where lower(name) = lower(${status.name}))
        on conflict do nothing
        returning id`;
      changes.statuses += rows.length;
    }
  }

  return changes;
}
