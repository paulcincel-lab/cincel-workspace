# Evidencia QA - Exportacion Beta 12.1

Fecha: 2026-07-26
Scope validado ahora:
- QA de permisos de exportacion por rol.
- QA de exactitud de exportacion.
- QA de escenarios limite.
- Recoleccion minima de evidencia.

## 1) QA de permisos por rol
Resultado: Aprobado.

Hallazgos:
- En los cuatro modulos (Actividades, Proyectos, Clientes, Equipo) la capacidad canExportData esta definida por rol y solo Administrador/Direccion tienen valor true por defecto.
- Adicionalmente existe blindaje en resolvers para impedir habilitacion por override fuera de Administrador/Direccion.

Evidencia tecnica:
- Definicion por rol: lib/auth/permissions.ts (bloques de capacidades y canExportData).
- Blindaje por resolver: lib/auth/permissions.ts (canExportData combinado con canExportByRole).
- Alias de rol Director/Direccion hacia Direccion: lib/data/roles.ts.

## 2) QA de exactitud de exportacion
Resultado: Aprobado (verificacion tecnica de implementacion).

Hallazgos:
- Cada modulo exporta exactamente la misma coleccion que renderiza en pantalla (rows visibles/filtradas).
- Se usa un servicio central unico para generar ambos formatos.

Evidencia tecnica por modulo:
- Actividades: usa unifiedRows para tabla y exportacion.
  - app/tareas/TareasPageClient.tsx
- Proyectos: usa visibleProjects para tabla y exportacion.
  - components/proyectos/ProjectsTable.tsx
- Clientes: usa activeProjectClients/inactiveProjectClients para tabla y exportacion.
  - app/clientes/page.tsx
- Equipo: usa activeExportRows/inactiveExportRows para exportacion segun vista.
  - app/equipo/page.tsx
- Servicio central comun Excel/PDF:
  - lib/utils/export-service.ts

## 3) QA de escenarios limite
Resultado: Parcial aprobado (tecnico completo, UI/manual pendiente de captura).

Cobertura tecnica verificada:
- Filas vacias: servicio soporta rows vacio y genera archivo.
- Valores null/undefined: normalizados a cadena vacia.
- Fechas: parseo y exportacion con formato de fecha para Excel/PDF.
- Nombre de archivo seguro: sanitizacion de fileName.
- PDF: soporte de orientacion landscape/portrait.

Evidencia tecnica:
- lib/utils/export-service.ts

Pendiente manual recomendado:
- Validar experiencia de exportacion con datasets grandes en navegador real.
- Confirmar legibilidad PDF en tabla amplia por modulo.

## 4) Evidencia minima recolectada
Resultado: Parcial (completa para evidencia tecnica; capturas/archivos descargados requieren ejecucion manual en navegador).

Evidencia incluida ahora:
- Matriz de cumplimiento tecnico por codigo y permisos.
- Referencias a puntos de integracion en los 4 modulos.

Evidencia manual por adjuntar (checklist):
- [ ] Captura previa por modulo con filtros activos.
- [ ] Archivo .xlsx generado por modulo.
- [ ] Archivo .pdf generado por modulo.
- [ ] Registro de rol usado (autorizado/no autorizado).

## Estado general
- Permisos por rol: OK
- Exactitud por vista: OK
- Escenarios limite (tecnico): OK
- Escenarios limite (UX/manual): Pendiente Sprint 12
- Evidencia manual final: Pendiente Sprint 12

## Nota de alcance
Las tareas no autorizadas para este momento se mantienen para Sprint 12:
- QA funcional completo de Operativas.
- QA de navegacion entre vistas.
- QA de regresion de tablas.
