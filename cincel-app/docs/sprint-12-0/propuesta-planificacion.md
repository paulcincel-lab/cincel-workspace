# Propuesta de planificación Sprint 12

Periodo propuesto: siguiente iteración inmediata post cierre Sprint 11
Objetivo general: consolidar calidad, cerrar deuda técnica y avanzar hardening de operación sobre Supabase sin romper flujos productivos.

## Objetivos
1. Cerrar deuda técnica heredada del Sprint 11.
2. Mejorar robustez E2E y evidencias QA por flujo crítico.
3. Consolidar operación segura de datos en Supabase (observabilidad + controles).

## Backlog propuesto (priorizado)

### P1 - Calidad y deuda técnica
- Resolver DT-12-001 (next/no-img-element) en configuración general.
- Establecer criterio de lint "cero warnings críticos" para rutas core.
- Actualizar evidencia de lint/build post-fix.

### P1 - QA/E2E de flujos críticos
- Mantener y extender auditoría modular E2E existente.
- Añadir aserciones de regresión en CRUD de Clientes y Proyectos.
- Estandarizar reporte JSON + checklist de aprobación por módulo.

### P2 - Operación Supabase
- Revisar cobertura de health checks (autenticado + diagnóstico rápido).
- Verificar consistencia de snapshots locales vs fuente de verdad en escenarios de error de red.
- Documentar runbook corto para fallas comunes de conexión/políticas.

### P2 - Documentación y trazabilidad
- Consolidar changelog incremental por sprint.
- Mantener matriz de pendientes y estatus de evidencias QA.

## Entregables esperados
- Lint y build en verde tras cierre de deuda técnica.
- Reporte E2E actualizado con módulos críticos aprobados.
- Documento operativo breve para incidencias Supabase.
- Evidencia de cierre Sprint 12 en docs/sprint-12-0/.

## Criterios de salida Sprint 12
- Warnings heredados de Sprint 11 resueltos.
- Pruebas E2E críticas estables en al menos 2 ejecuciones consecutivas.
- Sin regresiones funcionales en Dashboard, Clientes, Proyectos, Configuración y Permisos.
