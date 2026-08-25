# Fase 4 — Documentación y Operaciones

Milestone de GitHub: **Alpha M4 — Documentación y Operaciones**

Fuente: `docs/review-2026-08-11/01-arquitectura.md`, `03-modelo-de-datos.md`.

---

### [DOCS] Actualizar AGENTS.md para documentar los módulos sensibles de lib/
- Labels: docs, alpha-m4, low-effort
- Severidad: Bajo
- Archivos: `AGENTS.md`
- Descripción: `AGENTS.md` describe solo `lib/data`, `lib/templates` y `lib/types`, pero hoy existen además `lib/repositories/`, `lib/auth/`, `lib/calendar/`, `lib/settings/`, `lib/supabase/` y `lib/utils/` — precisamente los módulos más sensibles del proyecto (auth, acceso a datos). Que `AGENTS.md` no los mencione aumenta el riesgo de que futuros cambios (humanos o de agentes de IA) los pasen por alto o dupliquen su lógica.
- Criterios de aceptación: la sección "Arquitectura" de `AGENTS.md` se actualiza para reflejar todos los subdirectorios actuales de `lib/` con una descripción breve de cada uno.
- Referencias: `01-arquitectura.md`.

---

### [DOCS] Actualizar ERD y diccionario de datos con resource_links
- Labels: docs, alpha-m4, database, low-effort
- Severidad: Medio
- Archivos: `docs/sprint-11-1/erd.md`, `docs/sprint-11-1/data-dictionary.md`
- Descripción: Ninguno de los dos documentos menciona la tabla `resource_links`, agregada en la migración de Sprint 11.2 (`202607270005_resources_table.sql`) — ambos documentos datan de Sprint 11.1 y el esquema real ya avanzó una migración más allá de lo que describen.
- Criterios de aceptación: ERD y diccionario de datos actualizados para incluir `resource_links` con sus columnas, relaciones y la excepción de PK (ver issue relacionado en Fase 3). Se recomienda regenerar/actualizar estos documentos como parte del checklist de cierre de cada sub-sprint que agregue tablas, no solo al final de un sprint mayor.
- Referencias: `03-modelo-de-datos.md` hallazgo #2.

---

### [DATA] Configurar backup automatizado real de la base de datos
- Labels: database, alpha-m4, infra, operations
- Severidad: Medio
- Archivos: `docs/sprint-11-1/backup-checklist.md`
- Descripción: El procedimiento de backup actual es manual: exportar cada módulo a xlsx/csv, guardar en `backups/`, y registrar un checksum SHA256 — todo ejecutado a mano. El propio documento aclara que estos archivos no se importan automáticamente a PostgreSQL; no hay evidencia de `pg_dump` programado ni point-in-time recovery de Supabase configurado.
- Criterios de aceptación: una vez que `NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase` sea el modo real de producción (Fase 0), se configura point-in-time recovery de Supabase o `pg_dump` programado; el checklist manual de exportación queda como respaldo adicional, no como único plan de recuperación ante desastres.
- Depende de: `[SEC] Confirmar y fijar NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase en producción` (Fase 0).
- Referencias: `03-modelo-de-datos.md` hallazgo #7.
