# Backup y recuperación de datos — Cincel Workspace

## Estado actual (agosto 2026)

El proyecto aún no está conectado a un proyecto Supabase de producción real.
Mientras eso ocurra, el único respaldo disponible es la exportación manual
documentada en `docs/sprint-11-1/backup-checklist.md`. Ese procedimiento es
una red de seguridad operativa, **no** un plan de recuperación ante desastres.

Este documento describe los pasos exactos para activar una estrategia de
backup real una vez que el proyecto de Supabase de producción esté aprovisionado.

---

## Opción A — Point-in-Time Recovery (PITR) en Supabase (recomendada)

PITR permite restaurar la base de datos a cualquier segundo dentro de la ventana
de retención configurada. Es la opción más robusta y la que requiere menos
operación manual.

### Prerrequisitos

- Plan Supabase **Pro** o superior (PITR no está disponible en el plan Free).
- Acceso al dashboard del proyecto de producción como Owner o Admin.

### Activación (una sola vez, en el dashboard de Supabase)

1. Ingresar a [app.supabase.com](https://app.supabase.com) y seleccionar el
   proyecto de producción de Cincel.
2. Ir a **Project Settings → Database → Point in Time Recovery**.
3. Habilitar PITR y seleccionar la ventana de retención (mínimo recomendado:
   7 días; para producción real, 30 días).
4. Confirmar el cambio. Supabase empezará a escribir WAL (Write-Ahead Logs) de
   forma continua desde ese momento.

No se requiere ningún cambio de código en este repositorio.

### Restauración ante un incidente

1. En el dashboard, ir a **Project Settings → Database → Point in Time Recovery**.
2. Seleccionar la fecha y hora exactas a las que se quiere restaurar.
3. Iniciar la restauración. Supabase creará un nuevo proyecto (o restaurará
   in-place según la opción elegida).
4. Actualizar las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) si el proyecto resultante tiene
   una URL diferente.
5. Ejecutar el smoke test para verificar integridad:
   ```bash
   node scripts/smoke-test-supabase.mjs
   ```

---

## Opción B — `pg_dump` programado (alternativa sin PITR)

Si el plan de Supabase no incluye PITR, o si se requiere un backup offline
adicional, se puede programar un `pg_dump` periódico desde un servidor con
acceso a la base de datos.

### Requisitos

- Acceso a la connection string de producción (disponible en
  **Project Settings → Database → Connection string** en el dashboard de Supabase).
- Un servidor con `pg_dump` instalado (PostgreSQL client tools) y acceso a red
  al endpoint de Supabase.
- Almacenamiento seguro para los dumps (p. ej. bucket S3 privado, Google Cloud
  Storage con Object Versioning activado, o similar).

### Script de referencia

```bash
#!/usr/bin/env bash
# backup-pg.sh — ejecutar desde un servidor seguro con acceso a producción
set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
OUTPUT_FILE="cincel-backup-${TIMESTAMP}.dump"
S3_BUCKET="s3://cincel-backups-prod"   # ajustar al bucket real

pg_dump \
  --format=custom \
  --no-acl \
  --no-owner \
  "${CINCEL_DB_CONNECTION_STRING}" \
  --file="${OUTPUT_FILE}"

# Verificar checksum local antes de subir
sha256sum "${OUTPUT_FILE}" > "${OUTPUT_FILE}.sha256"

# Subir a almacenamiento seguro
aws s3 cp "${OUTPUT_FILE}"        "${S3_BUCKET}/${TIMESTAMP}/${OUTPUT_FILE}"
aws s3 cp "${OUTPUT_FILE}.sha256" "${S3_BUCKET}/${TIMESTAMP}/${OUTPUT_FILE}.sha256"

echo "Backup completado: ${OUTPUT_FILE}"
```

### Programación con cron (ejemplo: diario a las 03:00 UTC)

```cron
0 3 * * * /opt/scripts/backup-pg.sh >> /var/log/cincel-backup.log 2>&1
```

O bien, usar un servicio de cron administrado (GitHub Actions scheduled workflow,
Cloud Scheduler de GCP, AWS EventBridge) para no depender de infraestructura propia.

### Restauración desde un dump

```bash
pg_restore \
  --format=custom \
  --no-acl \
  --no-owner \
  --dbname="${CINCEL_DB_CONNECTION_STRING}" \
  cincel-backup-20260825T030000Z.dump
```

Después de restaurar, ejecutar el smoke test:

```bash
node scripts/smoke-test-supabase.mjs
```

---

## Retención recomendada

| Tipo de backup | Retención mínima |
|---|---|
| PITR (WAL continuo) | 30 días |
| `pg_dump` diario | 30 dumps (último mes) |
| `pg_dump` semanal | 12 dumps (últimos 3 meses) |
| Exportación manual (xlsx/csv) | Conservar indefinidamente como referencia histórica |

---

## Relación con el backup manual existente

`docs/sprint-11-1/backup-checklist.md` documenta una exportación manual por
módulo a xlsx/csv. Ese procedimiento sigue siendo válido como **red de seguridad
suplementaria** (útil durante migraciones o para revisión offline), pero no es
un sustituto del PITR ni del `pg_dump`:

- No captura datos en tiempo real.
- No permite restauración automatizada.
- No cubre tablas que no tienen exportación en la UI.

Una vez activado PITR o el `pg_dump` programado, la exportación manual pasa a
ser un complemento opcional, no el plan primario de recuperación.

---

## Pendiente de configuración real

Los pasos de las secciones A y B requieren acceso al proyecto de Supabase de
producción, que aún no existe en el momento de redactar este documento.
**Ningún paso de este runbook está configurado todavía.** El operador responsable
deberá ejecutarlos cuando el proyecto de producción esté aprovisionado.
