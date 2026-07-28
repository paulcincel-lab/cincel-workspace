# Supabase setup - Sprint 11.1

## Estado
Preparado para migracion de infraestructura. La app aun NO se conecta a Supabase.

## Ambientes
- development
- staging
- production

## Pasos sugeridos (manual)
1. Crear tres proyectos Supabase (dev/staging/prod).
2. Capturar project ref de cada ambiente.
3. Configurar variables de entorno usando supabase/env.example.
4. Ejecutar migraciones SQL en cada ambiente en orden.

## Migraciones
Ubicacion: supabase/migrations

Orden:
1. 202607270001_init_extensions_and_enums.sql
2. 202607270002_core_tables.sql
3. 202607270003_indexes.sql
4. 202607270004_rls_initial.sql

## Nota de alcance
- No hay backfill de datos en 11.1.
- No hay cambios en UI ni permisos funcionales de la app.
- No se incluye audit_logs en este sprint.
