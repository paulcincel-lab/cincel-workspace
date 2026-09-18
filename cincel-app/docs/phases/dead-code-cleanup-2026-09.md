# Dead Code Cleanup (September 2026)

Milestone de GitHub: **Code Cleanup — Dead Code Audit**

Fuente: auditoría de código muerto sobre `main` (post rebuild greenfield, todas las fases 1-9 ya mergeadas). Cada hallazgo fue verificado trazando la cadena real de imports con grep en `app/`, `components/`, `lib/`, `scripts/`, `tests/` — no son sospechas, son archivos con cero importadores reales confirmados.

## Goal
Eliminar el código sobrante que quedó tras el rebuild (mocks viejos, componentes de un prototipo pre-rebuild, duplicados) y resolver tres casos que requieren una decisión humana antes de borrar o mantener.

## Deliverables

### Confirmado muerto — seguro de borrar

- [ ] Borrar mocks obsoletos en `lib/data/`: `colaboradores.ts`, `contractors.ts`, `dashboard.ts`, `projects.ts`, `resources.ts`, `tasks.ts`, `tiendas.ts` — cero importadores reales, superados por `lib/repositories/*` + `lib/db`
- [ ] Borrar los tipos que solo esos mocks usaban: `lib/types/colaborador.ts`, `lib/types/contractor.ts`, `lib/types/tienda.ts` (cadena muerta completa junto con lo anterior)
- [ ] Borrar duplicados/leftovers en `lib/templates/`: el archivo sin extensión `lib/templates/construction` (stub de 39 bytes), `lib/templates/design.ts` (duplicado byte-a-byte del anterior), `lib/templates/phase-options.ts` — ninguno tiene importadores. **No tocar** `lib/templates/{presale,diseno,operativas,decoracion}.ts`, esos SÍ están vivos vía `lib/actividades/departamento.ts`
- [ ] Borrar `components/tasks/ProjectTasks.tsx` (archivo vacío, 0 bytes) y `components/tasks/TaskRow.tsx` (cero importadores reales — el único hit en grep es una colisión de nombre con un tipo Drizzle no relacionado en `tasks-repository.ts`)
- [ ] Borrar `components/proyectos/ProjectActivity.tsx`, `components/proyectos/ProjectModules.tsx` y `components/proyectos/ProjectModuleCard.tsx` — prototipo pre-rebuild con datos mock hardcodeados en español, cero importadores
- [ ] Borrar `components/proveedores/PillDropdown.tsx` — cero importadores (sus hermanos `EditableCell.tsx`/`StarRating.tsx` en el mismo directorio SÍ están vivos, no tocar esos)
- [ ] Borrar `components/ui/AppBadge.tsx` y `components/ui/GroupSection.tsx` — cero importadores en todo el repo

### Necesita decisión humana antes de borrar

- [ ] **`components/v2/status/StatusBadge.tsx` + `lib/types/status-visuals.ts`**: el único consumidor de `status-visuals.ts` es `StatusBadge.tsx`, y `StatusBadge.tsx` no tiene importadores reales (solo aparece mencionado en un comentario de documentación, no en un import). Confirmar que ningún flujo pendiente los necesita antes de borrar ambos juntos.
- [ ] **`tests/unit/task-rules.test.ts`**: prueba reglas de negocio ("toda tarea tiene commitmentDate/reviewDate", "el historial es append-only") contra los arrays mock muertos `lib/data/{presale,diseno,operativas}.ts`, no contra el repositorio/esquema real. Decidir: (a) borrar este test junto con los mocks de los que depende, o (b) reescribir sus aserciones contra `lib/repositories/tasks-repository.ts` / el esquema real si esas reglas todavía deben quedar cubiertas por CI. Verificar primero si esas dos reglas ya están cubiertas en otro lado (constraint de base de datos, test de repositorio) antes de decidir.
- [ ] **`lib/repositories/index.ts`** (barrel que re-exporta todos los repositorios): cero importadores directos — cada acción en `lib/actions/*.ts` importa su repositorio directamente, no a través de este barrel. Decidir: mantenerlo por si un consumidor externo lo necesita a futuro, o eliminarlo por no tener propósito actual.
- [ ] **`lib/actions/child-diff.ts`** (`diffChildRows`, evita el patrón borrar-todo-y-reinsertar en filas hijas): cero llamadores en producción, solo su propio test lo ejercita. No es un duplicado de lógica existente — parece un helper escrito por adelantado para un punto de uso que aún no se conectó. Decidir: conectarlo a donde se necesite (p. ej. actualizaciones de filas hijas en `projects-actions.ts` / `workflows-actions.ts`), o borrarlo junto con su test si ya no aplica.

## Done Definition
- Cada archivo de la lista "confirmado muerto" borrado, sin importadores rotos (`npx tsc --noEmit` limpio, `npm run build` verde)
- Cada ítem de "necesita decisión" resuelto explícitamente (borrado o conectado), no dejado pendiente sin registro
- `npm run test:unit` verde después de cada cambio

## Parallel work
- Los borrados "confirmado muerto" son independientes entre sí y pueden hacerse en paralelo
- Los tres ítems de "necesita decisión" son independientes entre sí

## Phase dependencies
- Ninguna — el rebuild (fases 1-9) ya está completo y mergeado a `main`

## Complexity
- Todos los ítems: XS (borrado directo o decisión acotada, sin lógica nueva)

## Risks
- Bajo riesgo: todos los hallazgos "confirmado muerto" fueron verificados por cadena de imports completa, no solo un salto; aun así, correr `npx tsc --noEmit` y la suite de tests después de cada borrado antes de dar el issue por cerrado
