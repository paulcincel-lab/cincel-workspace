# Changelog Sprint 11

Fecha de cierre: 2026-07-28
Estado: Cerrado

## Resumen ejecutivo
Sprint enfocado en estabilizar la integración con Supabase, endurecer seguridad de acceso, validar funcionalidad por módulos y cerrar regressions críticas (Clientes CRUD), sin introducir nuevas funcionalidades de negocio.

## Cambios técnicos principales
- Se consolidó capa de repositorios para desacoplar UI de la persistencia:
  - Proyectos, Clientes, Equipo, Actividades, Proveedores, Recursos.
- Se agregó cliente Supabase con guardas de seguridad para bearer de desarrollo solo en entorno local/no producción.
- Se corrigieron relaciones PostgREST para embeds usando FK reales.
- Se incorporaron scripts operativos:
  - health check autenticado.
  - auditoría E2E integral por módulos.
  - E2E de login + CRUD de Clientes.
- Se añadieron migraciones y estructura base en supabase/ para soporte de esquema core y RLS.

## Cambios funcionales validados
- Clientes:
  - Corrección de eliminación persistente en Supabase.
  - Actualización inmediata de estado local/UI tras delete.
  - Rollback de estado optimista si falla persistencia.
- Módulos ERP validados en smoke E2E:
  - Dashboard, Clientes, Proyectos, Recursos, Equipo, Actividades, Calendario, Configuración y Permisos.
- CRUD de Clientes validado de punta a punta (crear, editar, eliminar).

## Seguridad y operación
- Se eliminó dependencia de variable pública NEXT_PUBLIC_SUPABASE_AUTH_BEARER.
- Se mantuvo política de acceso autenticado para health check y pruebas automatizadas.
- Health Check autenticado validado en verde.

## Evidencia
- Reporte auditoría E2E final:
  - docs/sprint-11-1/e2e-modules-report.json
- Checklist y artefactos de soporte:
  - docs/sprint-11-1/backup-checklist.md
  - docs/sprint-11-1/data-dictionary.md
  - docs/sprint-11-1/erd.md
  - docs/sprint-11-1/integrity-rules.md

## Riesgos/pendientes trasladados a Sprint 12
- Warning no bloqueante de lint next/no-img-element en:
  - components/configuracion/GeneralSettingsWorkspace.tsx
  - Motivo: vista previa de logos cargados por archivo.
  - Acción: reemplazar img por next/image con configuración segura y mantener compatibilidad con data URL.
