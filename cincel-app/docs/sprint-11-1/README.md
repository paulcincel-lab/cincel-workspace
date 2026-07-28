# Sprint 11.1 - Preparacion migracion a Supabase

## Objetivo
Preparar la infraestructura para migrar Cincel de localStorage a PostgreSQL con Supabase.

Este sprint NO conecta la aplicacion a Supabase y NO migra datos.

## Alcance implementado
- Fase 0: congelamiento, criterios de exito y rollback, y respaldo manual definido.
- Fase 1: ERD, diccionario de datos y reglas de integridad.
- Fase 2: estructura Supabase preparada (config, variables y RLS inicial).
- Fase 3: migraciones SQL versionadas e idempotentes.

## Fuera de alcance (intencional)
- No se migra ningun dato a PostgreSQL.
- No se cambia la fuente de datos (sigue localStorage).
- No se modifica UI.
- No se modifican permisos funcionales de la app.
- No se implementa audit_logs.

## Congelamiento del modelo durante 11.1
- No agregar nuevos campos funcionales a Proyectos, Actividades, Clientes, Equipo, Proveedores.
- No introducir nuevas entidades de negocio.
- Cualquier cambio de modelo se reprograma para 11.2+.

## Criterios de exito
1. Existe esquema PostgreSQL equivalente al modelo actual.
2. Existen migraciones idempotentes y versionadas en supabase/migrations.
3. Existe definicion de variables de entorno por ambiente.
4. Existen politicas RLS iniciales.
5. La app sigue funcionando igual con localStorage.

## Criterios de rollback
- Si alguna migracion genera conflicto de esquema:
  1. No enlazar ambiente productivo.
  2. Revertir a migracion estable previa.
  3. Reaplicar en un proyecto Supabase de desarrollo limpio.
- Si se detecta divergencia de modelo:
  1. Actualizar diccionario/ERD.
  2. Regenerar migracion incremental.

## Respaldo de datos actual (manual, no automatico)
Ver guia: docs/sprint-11-1/backup-checklist.md

## Artefactos
- ERD: docs/sprint-11-1/erd.md
- Diccionario: docs/sprint-11-1/data-dictionary.md
- Integridad: docs/sprint-11-1/integrity-rules.md
- Supabase setup: supabase/README.md
- Variables: supabase/env.example
- Migraciones: supabase/migrations
