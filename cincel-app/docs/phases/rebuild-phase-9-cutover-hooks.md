# Rebuild Phase 9: Cutover Hooks

Milestone de GitHub: **Rebuild M9 — Cutover Hooks**

Fuente: plan de reconstrucción (Parte A, Fase 9). Solo deja los "ganchos" listos; el cutover en sí (migración de datos reales, mapeo de IDs) es un plan aparte, fuera de este alcance.

## Goal
Dejar vacía la tabla de referencia legado y el switch de entorno entre bases de datos, sin ejecutar el cutover todavía.

## Deliverables

### Backend
- [ ] Confirmar que `core.legacy_refs` existe y está vacía (ya está en el modelo desde Fase 1); documentar su forma (`entity`, `legacy_id`, `row_id`) para el plan de cutover
- [ ] Variable de entorno / flag para apuntar la app a la base vieja o a la nueva (`DATABASE_URL` ya cumple ese rol si ambas bases coexisten en algún punto; documentar cómo se usaría)

### Frontend
- [ ] Ninguno

### Infrastructure
- [ ] Documentar en `docs/deployment.md` cómo se apuntaría `DATABASE_URL` a la base nueva en producción el día del corte
- [ ] No borrar ni tocar la base de datos vieja de producción en esta fase -- solo preparar el mecanismo de switch

## Done Definition
- `core.legacy_refs` existe, vacía, con su forma documentada
- Existe un documento corto que explica cómo se cambiaría `DATABASE_URL` el día del cutover
- Ningún dato de producción se mueve en esta fase

## Parallel work
- Ninguno -- es la última fase y depende de que todo lo anterior esté cerrado

## Phase dependencies
- Requires: Rebuild Phases 3-8 completas

## Complexity
- Backend: XS
- Frontend: N/A
- Infra: XS

## Risks
- Esta fase NO ejecuta el cutover real; si alguien la confunde con "migrar los datos", puede intentar mover producción antes de tiempo. El plan de cutover en sí queda fuera de alcance y debe pedirse explícitamente cuando llegue el momento
