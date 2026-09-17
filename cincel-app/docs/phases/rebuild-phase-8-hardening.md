# Rebuild Phase 8: Hardening

Milestone de GitHub: **Rebuild M8 — Hardening**

Fuente: plan de reconstrucción (Parte A, Fase 8). Corre en paralelo a las Fases 5 y 6, no las bloquea.

## Goal
Fixture de volumen, rendimiento de tablero/calendario, CI, e inventario de tabla-vieja-a-tabla-nueva como documentación.

## Deliverables

### Backend
- [ ] Script de fixture de volumen (`scripts/seed-volume.ts` o similar): N proyectos, M tareas por proyecto, distribución realista de estatus/fechas, para probar rendimiento
- [ ] Revisar índices de `core.tasks` (`idx_tasks_hot`, por fecha) contra las consultas reales del tablero/calendario una vez que Fase 6 esté escrita; ajustar si hace falta un índice compuesto adicional

### Frontend
- [ ] Perfilar el tablero y el calendario con el fixture de volumen; paginar o virtualizar si el conteo de tareas lo justifica

### Infrastructure
- [ ] Actualizar `.github/workflows/cincel-app-build.yml` para que el job de e2e siga funcionando contra el esquema nuevo (ya usa `db:migrate` + `db:seed`, verificar que sigue siendo así tras las Fases 3-7)
- [ ] Documentar en `docs/adr/` o un nuevo `docs/rebuild-table-inventory.md` el mapeo tabla vieja → tabla nueva (p. ej. `activities` → `tasks`, `clients`/`providers` → `contacts`, `team_members` → `staff`) para referencia del cutover

## Done Definition
- El fixture de volumen corre de punta a punta (`db:setup` + fixture) en CI o localmente sin timeouts
- El tablero y el calendario cargan en un tiempo razonable con el volumen del fixture
- CI verde en `rebuild` con el pipeline completo (lint, build, unit, e2e)
- Existe un documento de inventario tabla-vieja-a-tabla-nueva

## Parallel work
- Corre en paralelo a Rebuild Phase 5 y Rebuild Phase 6 (usa lo que cada una vaya entregando)

## Phase dependencies
- Requires: Rebuild Phase 6 (tareas) para que el fixture de volumen tenga sentido; puede empezar antes con proyectos y contactos

## Complexity
- Backend: S
- Frontend: S
- Infra: S

## Risks
- El inventario de mapeo tabla-vieja-a-tabla-nueva es solo documentación en esta fase; el cutover real (mapeo de datos e IDs) es la Fase 9 y tiene su propio plan
