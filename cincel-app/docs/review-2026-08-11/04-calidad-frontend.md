# Revisión en profundidad — Calidad de frontend

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)
Alcance: patrones React/Next.js (split server/cliente, hooks/estado), accesibilidad, manejo de errores, performance, sistema de exportación, lint. La organización de carpetas y la duplicación de rutas se cubren en [01-arquitectura.md](./01-arquitectura.md).

## Resumen

El código de UI es sólido en los módulos más nuevos (`lib/settings/use-general-settings.ts`, `lib/calendar/calendar-service.ts`) y en el sistema de exportación, que efectivamente está centralizado y reutilizado tal como indica `AGENTS.md`. Los módulos más antiguos y grandes (`ProjectsTable.tsx`, `TareasPageClient.tsx`) concentran la mayoría de los problemas: exceso de estado local, autosave sin debounce, y accesibilidad débil en drawers/modales. No se pudo ejecutar `npm run lint` en el entorno de revisión (sin `node_modules`), por lo que el estado de lint se basa en la última corrida conocida (`docs/sprint-12-0/technical-debt.md`).

## Hallazgos

### 1. [ALTO] Componente-dios: `ProjectsTable.tsx` (1576 líneas)
- Archivo: `components/proyectos/ProjectsTable.tsx:343-359`
- Combina renderizado de tabla, filtrado, estado de modales, toma de notas, edición inline de celdas y sincronización con Supabase en un único componente cliente, con más de 15 `useState`.
- Difícil de testear y mantener; cualquier cambio pequeño arriesga romper una de las muchas responsabilidades mezcladas.
- **Recomendación**: dividir en subcomponentes (filtros, tabla, modal de creación, panel de notas) y extraer la lógica de datos/sincronización a un hook, siguiendo el patrón más limpio ya existente en `lib/settings/use-general-settings.ts`.

### 2. [ALTO] Autoguardado sin throttling del array completo + hidratación "stale-first"
- Archivo: `components/proyectos/ProjectsTable.tsx:345`, `:361-365`, `:377-390`
- El estado inicial carga desde `localStorage` (`loadPersistedProjects()`); luego un `useEffect` hidrata de forma asíncrona desde Supabase (`fetchProjects()`) y sobrescribe ese estado — por lo que la UI muestra brevemente datos locales obsoletos ("stale") antes de los reales.
- Por separado, cualquier cambio a `projectsData` (incluso proveniente de estado de UI local no relacionado, si está plegado en el mismo state) dispara un `useEffect` que hace `saveProjects()` del array completo a Supabase, sin debounce ni diffing.
- Riesgo de tormentas de escritura y condiciones de carrera de "last write wins" perdiendo cambios entre pestañas/usuarios concurrentes.
- **Recomendación**: guardados basados en diff/debounce, y no sembrar el estado desde `localStorage` cuando existe una fuente Supabase activa.

### 3. [MEDIO] Sin fetching real en Server Components pese a Next 16 / React 19
- Toda la lógica sustantiva vive en componentes `"use client"`; los archivos `page.tsx` son wrappers de servidor delgados que delegan de inmediato (confirmado en `app/proyectos/page.tsx`, `app/calendario/page.tsx`, `app/configuracion/permisos/page.tsx`, entre otros).
- Todo el fetching de datos ocurre en el cliente, después de la hidratación, renunciando a los beneficios de fetch/streaming del lado servidor.
- Es una decisión de arquitectura (coherente con el modelo dual localStorage/Supabase descrito en `03-modelo-de-datos.md`), no un bug — pero vale la pena marcarlo como deuda técnica si el tiempo de carga inicial (TTFB) importa para el producto.

### 4. [MEDIO] Brechas de accesibilidad en modales/drawers
- Archivos: `components/tareas/TaskDrawer.tsx`, `components/tareas/NewTaskModal.tsx`
- Cero coincidencias de `aria-`, `role=`, `onKeyDown`, `Escape` o `focus()` en ninguno de los dos archivos. Sin `role="dialog"`/`aria-modal`, sin cierre con Escape, sin trampa de foco ni retorno de foco al cerrar.
- Solo 14 de ~118 archivos de `app`/`components` usan algún atributo `aria-`.
- Esto es relevante porque `AGENTS.md` define los drawers como el patrón estándar de edición en toda la aplicación — un problema de accesibilidad aquí se replica en cada módulo que use el mismo patrón.
- **Recomendación**: agregar semántica de diálogo y manejo de teclado al patrón compartido de drawer/modal referenciado en `AGENTS.md`, para que todos los consumidores lo hereden automáticamente.

### 5. [BAJO] Uso de estado dummy para forzar re-render
- Archivo: `app/tareas/TareasPageClient.tsx:118` — `const [, setTasksVersion] = useState(0)` usado únicamente para forzar re-renders.
- Indica que en algún punto de este componente de 807 líneas hay estado derivado que no se está calculando de forma reactiva.
- **Recomendación**: reemplazar por estado derivado/memoizado correctamente (`useMemo`).

### 6. [BAJO] Sin UI de carga/error durante el fetch inicial
- Verificado en `TareasPageClient.tsx` y `ProjectsTable.tsx`: los fallos de fetch de Supabase pasan por `reportSupabaseError()` (silencioso, a nivel consola) sin spinner de carga visible ni banner de error mientras `fetchProjects()` (o equivalente) resuelve.
- El usuario ve datos obsoletos/mock sin ninguna indicación de que una sincronización está en curso o falló.

### 7. [MEDIO, ya conocido] Deuda de lint confirmada, sigue presente
- Archivo: `components/configuracion/GeneralSettingsWorkspace.tsx:333,414` — sigue usando `<img>` crudo en el preview de logo, pese a que el commit `e77b7d3` corrigió el caso equivalente en el header.
- Ya trackeado como DT-12-001 en `docs/sprint-12-0/technical-debt.md` (aprobado, diferido a Sprint 12) — confirmado sin resolver al HEAD `d7af1b3`. Ver también `01-arquitectura.md`, hallazgo #1.

### 8. [POSITIVO] El sistema de exportación está bien reutilizado
- `lib/utils/export-service.ts` + `components/ui/ExportMenu.tsx` se comparten entre 4 módulos (clientes, equipo, tareas, proyectos) en vez de reimplementarse por módulo — coincide con la filosofía de reutilización de `AGENTS.md`.
- Diseño limpio: tipado genérico (`ExportRequest<TRow>`), sanitización de nombre de archivo, carga perezosa (`dynamic import`) de `xlsx`/`jspdf` para no inflar el bundle inicial, sin concatenación insegura de datos del usuario.

### 9. [POSITIVO] Los módulos más nuevos muestran mejor encapsulamiento
- `lib/settings/use-general-settings.ts` y `lib/calendar/calendar-service.ts` encapsulan de forma limpia el estado y la lógica de refresh (cleanup correcto de event listeners, sin contadores dummy) — una mejora de calidad clara respecto a módulos más antiguos como `ProjectsTable`/`TareasPageClient`.

### 10. [BLOQUEADO] No se pudo ejecutar `npm run lint` en el entorno de revisión
- `node_modules` no está instalado en el entorno usado para esta auditoría (`eslint: not found`).
- El último estado autoritativo conocido son las 2 advertencias registradas en DT-12-001 (hallazgo #7 de este documento).
- **Recomendación**: el pipeline de CI (ver `05-testing-qa.md`, hallazgo #8) debería correr `npm ci && npm run lint` para tener una línea base de lint actualizada antes de futuras revisiones.

## Priorización sugerida
1. Hallazgo #2 (autoguardado sin debounce/diff) — riesgo de pérdida de datos en uso concurrente, más urgente que los problemas de tamaño de archivo.
2. Hallazgo #4 (accesibilidad de drawers/modales) — al ser un patrón compartido, arreglarlo una vez beneficia a todos los módulos.
3. Hallazgo #1 (`ProjectsTable.tsx`) — refactor solo recomendable una vez exista cobertura E2E real (ver `05-testing-qa.md`) que respalde el cambio sin regresiones.
