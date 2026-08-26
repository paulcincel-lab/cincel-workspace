# Backup checklist Sprint 11.1

## Objetivo
Respaldar datos actuales por medio del flujo de exportacion existente en la app Beta.

Estos archivos son solo respaldo. NO se importan automaticamente a PostgreSQL en 11.1.

## Modulos a exportar
- Clientes
- Proyectos
- Presale
- Diseno
- Construccion
- Equipo Cincel

## Procedimiento
1. Ingresar con rol con permisos de exportacion.
2. Ir a cada modulo y ejecutar exportacion en formato acordado (xlsx/csv).
3. Guardar archivos en backups/sprint-11-1/raw.
4. Renombrar con fecha ISO:
   - clientes-YYYY-MM-DD.xlsx
   - proyectos-YYYY-MM-DD.xlsx
   - presale-YYYY-MM-DD.xlsx
   - diseno-YYYY-MM-DD.xlsx
   - construccion-YYYY-MM-DD.xlsx
   - equipo-cincel-YYYY-MM-DD.xlsx
5. Registrar checksum SHA256 en backups/sprint-11-1/manifest.md.

## Nota
Este respaldo es control operativo previo a la migración técnica de 11.2 y 11.3.

**Este procedimiento es una red de seguridad suplementaria, no el plan primario de recuperación ante desastres.**
No captura datos en tiempo real, no permite restauración automatizada y no cubre tablas sin exportación en la UI.

Una vez que el proyecto de Supabase de producción esté aprovisionado, se debe activar Point-in-Time Recovery (PITR)
o un `pg_dump` programado como estrategia principal de backup. Ver `docs/backup-recovery.md` para el runbook completo.
