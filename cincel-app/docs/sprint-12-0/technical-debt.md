# Deuda técnica inicial Sprint 12

Fecha de registro: 2026-07-28
Origen: cierre Sprint 11

## DT-12-001: warning next/no-img-element en configuración general
Prioridad: Media
Impacto: Bajo (no bloquea build ni release)
Estado: Pendiente

Descripción:
- Existen 2 warnings de lint por uso de img en previsualización de logos cargados por archivo.
- Regla afectada: @next/next/no-img-element.

Ubicación:
- components/configuracion/GeneralSettingsWorkspace.tsx

Criterio de aceptación:
- Reemplazar img por next/image en ambas previsualizaciones.
- Mantener comportamiento de preview para PNG/JPG (incluyendo data URL).
- npm run lint sin warnings relacionados a no-img-element.

Notas:
- Esta deuda fue aprobada explícitamente para resolverse en Sprint 12.
