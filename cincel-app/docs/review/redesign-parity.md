# Redesign parity pass (canvas vs. app)

Issue #921. Every frame of the redesign canvas ("Cincel UI Redesign", 117 frames, all three styles) compared with the code that renders it.

## How the pass was done

- **Source of truth:** the canvas frames as literal HTML (`*.dc.html`, inline styles), read for copy, spacing, type sizes, colours, badges and empty states. Where the canvas and the specs disagree, the specs win (`docs/specs/redesign/frontend.md`, `backend.md`); those rows are marked **spec**.
- **Copy check:** every text node of each frame was compared with the strings in `app/`, `components/` and `lib/`. Sample data (project, task, person and file names) was set aside, because it comes from the database: on a local DB, `npm run db:seed:demo` loads that sample data (below).
- **Layout check:** header, page padding, card and badge styles read from the frame's inline CSS against the component classes.
- **Not covered here:** screenshots of the running page at 1440 px and 390 px. That pass needs a local app with the demo seed loaded (steps at the end).

### Known canvas vs. spec differences (apply to many frames)

| Canvas | App (spec) | Why |
|---|---|---|
| "Áreas" / "por área" (Presale, Diseño, Construcción, **Decoración**) | "Tramos" / "por tramo" (Presale, Diseño, Construcción) | Decoración was retired as a tramo (migration 0010); FE §3.2, §3.3 use "tramo". |
| "Todas las áreas en un solo lugar. …" (Tareas) | "Todas los tramos en un solo lugar. …" | FE §3.3 copy. "Todas los" is a typo in both the spec and the code (should be "Todos los"); left for the Tareas owner (#919), who is editing those files. |
| Inicio "Mensajes · Cutto" tab, sidebar open-mic card, Cutto call | Links to Cutto only | Cutto is a separate app and is never embedded. |
| Role line "Administrador · Presale" | Access role only | FE §3.2: the header shows the access role; puesto is not the access role. |

### Status key

- **matches**: copy, layout and states match the frame (or the spec where it differs).
- **fixed**: fixed in this change.
- **#NNN**: covered by that issue of the "Redesign: polish and launch" milestone.
- **open**: a gap with no issue yet; it needs an issue filed.
- **out of scope**: the frame shows Cutto embedded.
- **reference**: not a screen (report, tokens, component sheet).

Shared across every staff page: page margins (`0 28px 40px` desktop, `16px` mobile) → **#915**; sidebar badges, avatar and Jornada card → **#918**; default light Azul Cincel → **#920**.

## Demo data

`npm run db:seed:demo` (`scripts/seed-demo.ts`), after `npm run db:seed`:

- 5 people from the canvas (Paul Langarica Soubic, Alejandro Riofrio, María González, Luis Ramírez, Sofía Castro). The roster's "Paul" and "Alejandro" are reused.
- The 6 projects (Local Espinopapa, Guadalajara 83, Madrid 22, Salim Ortopedia, Casa Lomas, Oficinas Roma) with client, tramo, progress, team and contractors, plus "Workspace" (paused, so "6 activos" stays as in the canvas).
- 30 open tasks across Pendiente, En proceso and Vencida (open with a past date), 6 completed, subtasks and support staff. Dates are relative to today.
- Today's reviews and reminders for Mi día and the calendar; the notes, checklists and reminders of Mi espacio go to the signed-in admin (`SEED_ADMIN_EMAIL`).
- 13 contractors and suppliers for Personas.
- It refuses to run when `NODE_ENV=production` or when `DATABASE_URL` points at a host other than `localhost`, `127.0.0.1`, `::1` or the compose `db` service (`scripts/seed-demo-guard.ts`, tested in `tests/unit/seed-demo-guard.test.ts`). It is idempotent.

## Checklist

### Reports, tokens and components

| Frame | Route / component | Status | Notes |
|---|---|---|---|
| Main (Informe UI/UX y hallazgos) | — | reference | Findings report. |
| Tokens | `lib/ui/themes.ts` | matches | Values come from BE §5 (single source); preset test covers them. |
| Estilos | `StyleContent`, widgets | reference | Style overview; per-screen rows below. |
| EstiloSwitch | `components/shell/EstiloSwitch` | matches | Visual / Esencial / Analítico segmented control. |
| Sidebar | `components/shell/Sidebar` | #918 | Count badges, avatar and Jornada card. The open-mic Cutto card is out of scope. "Áreas" section is "Tramos" (spec). |
| AjustesNav | `components/ajustes/AjustesNav` | matches (spec) | Spec adds "Tramos y fases", "Puestos", "Google"; "Áreas" and "Workflows" are Project Flow pages. |
| ProyectoHeader | `components/proyectos/ProjectTabs` | matches | Breadcrumb, tramo chip, meta line, Reporte, Nueva tarea, tab counts. |
| EstadosSistema | `components/patterns`, `EmptyState` | reference | Pattern sheet; empty states are checked per screen. |

### Inicio

| Frame | Route | Status | Notes |
|---|---|---|---|
| Dashboard (Inicio · Visual) | `/inicio` | #917 | KPI delta chip text, context line ("Construcción concentra 14 de 31", "Nada bloqueado hoy", "Próxima revisión sin agendar") and sparkline. Header 22 px/600, date line, donut, Ritmo semanal, Requiere atención, Mi día with "Sin revisiones en los próximos 7 días", Avance, Carga por persona match. "por área" is "por tramo" (spec). |
| InicioEsencial | `/inicio` (Esencial) | #917 | Same KPI copy; lists match. "Ver las 31 tareas" link text in Requiere atención: open. |
| InicioAnalitico | `/inicio` (Analítico) | matches (spec) | KPI table incl. "Completadas · semana"; "Tareas por tramo" (spec). |
| InicioCalido | `/inicio`, theme Cálido | matches | Theme tokens from BE §5. |
| InicioGrafito | `/inicio`, theme Grafito | matches | Theme tokens from BE §5. |
| InicioOscuro | `/inicio`, dark mode | matches | Dark tokens from BE §5. |
| InicioCutto | — | out of scope | Cutto embedded. |
| MovilInicio | `/inicio` at 390 px | #915 | Mobile gutter. "Revisiones 7 d" short label on mobile: open. |

### Tareas

| Frame | Route | Status | Notes |
|---|---|---|---|
| Tareas (Tablero) | `/tareas` | #919 | Status columns always shown, including empty "Completado", "Bloqueado" and custom statuses ("QA en revisión"). Copy "Todas los tramos…" (spec typo, see above). |
| TareasEsencial | `/tareas` (Esencial) | #919 | Same columns; "Ver las 24 tareas completadas" link: open. |
| TareasAnalitico | `/tareas` (Analítico) | #919 | Summary strip "Vencidas / abiertas" and table match FE §3.3. |
| TareasLista | `/tareas?vista=lista` | open | Toolbar "Agrupar por" (Estatus / Proyecto / Área / Responsable) and "Ordenar" (Fecha de entrega / Prioridad / Recientes), the "10 tareas abiertas · 4 vencidas" summary, "· vencida" suffix on overdue dates and the "Nada bloqueado." group empty line are not in the list view. |
| TareasListaEsencial | `/tareas?vista=lista` (Esencial) | open | Same toolbar and summary as TareasLista. |
| TareasListaAnalitico | `/tareas?vista=lista` (Analítico) | open | Same toolbar; "Por proyecto" and "Retraso prom." summary. |
| TareaDetalle | `/tareas?tarea=<id>` | open | Sheet with checklist and history match; the footer "Marcar como completada" button is missing (status changes through the status field only). |
| NuevaTarea | `NewTaskDialog` | open | "Usar plantilla del área" (template picker) is not in the dialog. |
| BuscarCmdK | `CommandPalette` | matches | Hints "Abre el formulario con el proyecto elegido" and "Cincel responde con avance, vencidas y presupuesto": open (minor copy). |
| MovilTareas | `/tareas` at 390 px | #915 | Mobile gutter. |

### Calendario

| Frame | Route | Status | Notes |
|---|---|---|---|
| Calendario (Mes) | `/tareas?vista=calendario` | matches | Header copy "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.", tramo legend, "+n más", day panel, "Entregas por semana", "Sincronizar con Google Calendar". Decoración legend item is gone (spec). |
| CalendarioEsencial | idem (Esencial) | matches | |
| CalendarioAnalitico | idem (Analítico) | matches | |
| CalendarioSemana | `cal=semana` | matches | |
| CalendarioSemanaEsencial | idem (Esencial) | matches | |
| CalendarioSemanaAnalitico | idem (Analítico) | matches | |
| CalendarioDia | `cal=dia` | matches | |
| EventoDetalle | event sheet | matches | |

### Proyectos and Proyecto

| Frame | Route | Status | Notes |
|---|---|---|---|
| Proyectos | `/proyectos` | matches (spec) | "{n} activos · avance, fase y entregas de cada obra.", "Proyectos por tramo" strip (canvas "por fase" with Decoración), cards with ring, "n abiertas · m vencidas", avatars, next delivery. Card place line "Local comercial · CDMX" needs `projectType` + city, which the demo seed fills. |
| ProyectosEsencial | `/proyectos` (Esencial) | matches (spec) | |
| ProyectosAnalitico | `/proyectos` (Analítico) | open | "Resumen por fase", "Real y plan a hoy" and "Tendencia 7 sem." column are not in the table. |
| NuevoProyecto | `NewProjectDialog` | matches | |
| Proyecto (Resumen) | `/proyectos/[id]` | open | Phase timeline ("may – jul", "32 de 39 tareas") reads the Cronograma; the "Ficha" summary block (Superficie, contract type, client contact role) needs fields the schema doesn't have. |
| ProyectoEsencial | idem (Esencial) | open | Same as Proyecto; "Ver los 48 archivos", "9 días después de lo pactado en contrato". |
| ProyectoAnalitico | idem (Analítico) | open | "Indicadores del proyecto", "Presupuesto por concepto" (needs budget lines). |
| ProyectoTareas | `/proyectos/[id]/tareas` | open | Canvas groups by "partida" ("Agrupar: partida", "+ Agregar tarea a {partida}"); the app groups by fase. |
| ProyectoTareasEsencial | idem (Esencial) | open | Same grouping. |
| ProyectoTareasAnalitico | idem (Analítico) | open | Same grouping. |
| ProyectoCronograma | `/proyectos/[id]/cronograma` | matches | Gantt from the project schedule (load Madrid 22 with `npm run db:seed:madrid22`). "Plan original" baseline toggle and "Trimestre" zoom: open. |
| ProyectoCronogramaEsencial | idem (Esencial) | matches | |
| ProyectoCronogramaAnalitico | idem (Analítico) | matches | |
| ProyectoReporte | `/proyectos/[id]/cronograma/reporte` | matches | |
| ProyectoArchivos | `/proyectos/[id]/archivos` | open | "Espacio usado", search, drop zone and the file detail panel (versions, "Compartido con", "Gestionar acceso"); the app lists Drive links. |
| ProyectoArchivosEsencial | idem (Esencial) | open | Same. |
| ProyectoArchivosAnalitico | idem (Analítico) | open | Same. |
| ProyectoClientes | `/proyectos/[id]/clientes` | open | Contact cards with portal state ("Reenviar acceso", "Revocar acceso", "Invitar al portal"), client portal activity feed and "Qué puede ver el cliente" permissions panel. |
| ProyectoFicha | `/proyectos/[id]/ficha` | open | Section descriptions and fields (Colonia, Código postal, Superficie del terreno / construida, Uso de suelo, Modalidad de contrato, Anticipo, Moneda, monday group) need schema fields that don't exist. |
| MovilProyecto | `/proyectos/[id]` at 390 px | #915 | Mobile gutter. |

### Personas

| Frame | Route | Status | Notes |
|---|---|---|---|
| Personas (Equipo) | `/personas` | matches (spec) | "Disponibilidad esta semana", person cards, load bar, "Ver tareas". Puesto comes from Project Flow; the demo people show their roles. |
| PersonasEsencial | idem (Esencial) | matches | |
| PersonasAnalitico | idem (Analítico) | matches | |
| PersonasClientes | `/personas/clientes` | open | Primary action reads "Agregar persona" on every tab (canvas: "Agregar cliente", "Agregar contratista", "Agregar proveedor"); portal filter chips ("Con acceso al portal · n", "Invitados · n"), "Último contacto" column and "8 de 14 clientes · Ver todos" footer. |
| PersonasClientesEsencial | idem (Esencial) | open | Same. |
| PersonasClientesAnalitico | idem (Analítico) | open | Same. |
| PersonasContratistas | `/personas/contratistas` | open | Specialty filter chips, "Obras activas" and document badges ("Vigente · IMSS", "Vencido · Contrato") with the warning banner; there is no contractor document data. |
| PersonasContratistasEsencial | idem (Esencial) | open | Same. |
| PersonasContratistasAnalitico | idem (Analítico) | open | Same. |
| PersonasProveedores | `/personas/proveedores` | open | Multi-select with "Comparar cotizaciones" / "Pedir cotización", "Última cotización" and "Tiempo de entrega" columns. |
| PersonasProveedoresEsencial | idem (Esencial) | open | Same. |
| PersonasProveedoresAnalitico | idem (Analítico) | open | Same. |
| PersonaDetalle | `/personas/equipo/[id]` | open | "En jornada desde 8:51" (time clock), "Completadas este mes" with month delta, "Actividad reciente" feed. |
| PersonaDetalleEsencial | idem (Esencial) | open | Same. |
| PersonaDetalleAnalitico | idem (Analítico) | open | Same. |

### Mi espacio

| Frame | Route | Status | Notes |
|---|---|---|---|
| MiEspacio | `/mi-espacio` | matches | "Solo tú lo ves" badge, "Captura rápida" (Nota / Checklist / Recordatorio), Bandeja filters, Recordatorios "hoy y mañana", Checklists, Notas. With the demo seed the notes, checklists and reminders show. The Gmail line "Los correos con el nombre de un proyecto se etiquetan solos." under the inbox: open. |
| MiEspacioEsencial | idem (Esencial) | matches | |
| MiEspacioAnalitico | idem (Analítico) | open | Summary table ("Bandeja sin leer", "Recordatorios hoy / mañana", "Puntos hechos", "% hecho", "Fijadas"). |
| MiEspacioGmail | Bandeja with Gmail | matches | Needs a connected Gmail account to show threads. |
| NotaEditor | `/mi-espacio/notas/[id]` | matches | |
| NuevoRecordatorio | reminder dialog | matches | |
| MovilMiEspacio | `/mi-espacio` at 390 px | #915 | "Gmail al día" empty line: open. |

### Biblioteca and vacaciones

| Frame | Route | Status | Notes |
|---|---|---|---|
| Biblioteca | `/biblioteca` | matches | |
| BibliotecaEsencial | idem (Esencial) | matches | |
| BibliotecaAnalitico | idem (Analítico) | matches | |
| BibliotecaSeccion | `/biblioteca/[seccion]` | matches | Section items come from resource links. |
| BibliotecaSeccionEsencial | idem (Esencial) | matches | |
| BibliotecaSeccionAnalitico | idem (Analítico) | matches | |
| BibliotecaDocumento | `/biblioteca/empresa/[doc]` | matches | |
| MisVacaciones | `/biblioteca/vacaciones` | matches | |
| MisVacacionesEsencial | idem (Esencial) | matches | |
| MisVacacionesAnalitico | idem (Analítico) | matches | |

### Asistente

| Frame | Route | Status | Notes |
|---|---|---|---|
| Asistente (panel) | `AssistantLauncher` | matches | "Viendo: {página}" context, answer cards, actions. The canvas conversation is sample content. "Avisar a Paul por WhatsApp" action is out of scope. |
| AsistentePagina | `/asistente` | matches | "Buscar conversaciones" in the thread list: open (minor). |
| AsistenteWidgets | assistant widgets | matches | Quantity and task widgets; sample content. |
| AsistenteHerramientas | tool catalog | reference | Catalog of tools; implemented tools follow `docs/assistant.md`. |

### Ajustes

| Frame | Route | Status | Notes |
|---|---|---|---|
| Ajustes (Apariencia) | `/ajustes/apariencia` | fixed | Theme cards now carry the canvas one-liners; style cards and the section line ("Cambia cómo se muestran los datos en todas las vistas: gráficas, listas o tablas. La organización usa {estilo}.") match. "color por área" reads "color por tramo" (spec). |
| AjustesAdmin (Tema de la organización) | `/ajustes/tema` | matches (spec) | Token editor; "Áreas y estatus" tokens are the tramo `chart-N` tokens (BE §5). "Comparar estilos": open. |
| AjustesHorario | `/ajustes/horario` | open | Trial copy ("En prueba hasta el {fecha}. Después, registrar entrada y salida será obligatorio.", "Obligatorio desde el {fecha}") and the menu note. |
| AjustesHorarioEsencial | idem (Esencial) | open | Same. |
| AjustesHorarioAnalitico | idem (Analítico) | open | Same. |
| AjustesGeneral | `/ajustes/general` | open | Logo upload ("Subir logo"), "Nombre del despacho" / "Nombre corto", allowed domain note, time zone and currency selects. |
| AjustesAreas | `/ajustes/tramos` | matches (spec) | "Áreas" is "Tramos y fases" (Project Flow). |
| AjustesEstatus | `/ajustes/estatus` | open | Header line "Los estatus base no cambian. Los personalizados toman el color de su base." and "Agregar estatus en {base}" per group. |
| AjustesPermisos | `/ajustes/permisos` | open | Canvas is a role × permission matrix ("Qué puede hacer cada rol. Los cambios aplican de inmediato.", "Nuevo rol"); the app edits one access at a time. |
| AjustesWorkflows | `/ajustes/tramos` | matches (spec) | Tramos y fases. |
| AjustesMonday | `/ajustes/monday` | matches | Run summary and board → tramo mapping come from import data. |
| AjustesNotificaciones | `/ajustes/notificaciones` | open | Matrix of events × channels ("En la app", "Correo", "Resumen diario") is there, but rows use the kind names ("Asignación", "Mención", …) instead of the canvas sentences ("Te asignan una tarea", "Te mencionan", "Una tarea tuya vence mañana", …). |
| AjustesIntegraciones | `/ajustes/integraciones` | open | Gmail label list ("Etiquetas que llegan a Mi espacio › Bandeja"), "Etiquetar correos con el proyecto…" switch and calendar list. |
| Perfil | `/ajustes/perfil` | open | "Área principal", email signature note, time zone and "Inicio de semana" selects. |

### Sign-in, onboarding, portal and errors

| Frame | Route | Status | Notes |
|---|---|---|---|
| Login | `/login` | matches | Footer "Co-creado con Cloudketer ·" is not shown: open (minor). |
| LoginDenegado | `/login/denegado` | matches | |
| LoginJornada | login clock-in prompt | matches | |
| CambioContrasena | `/change-password` | open | Strength meter ("Seguridad: buena", "Incluye un número", "Incluye una mayúscula"). |
| BienvenidaGoogle | `/ajustes/google/primeros-pasos` | matches | Group mapping step. |
| BienvenidaMonday | onboarding monday step | matches | |
| PortalLogin | `/portal` | matches | |
| PortalProyecto | `/portal/proyectos/[id]` | open | Approvals and comments ("Comentar y aprobar") are not in the portal. |
| PortalProyectoEsencial | idem (Esencial) | open | Same. |
| PortalProyectoAnalitico | idem (Analítico) | open | Same. |
| Portal404 | portal not found | matches | |
| Error404 | `app/not-found.tsx` | matches | |
| CuttoLlamada | — | out of scope | Cutto embedded. |

## Totals

117 frames: 57 matches (incl. matches per spec), 1 fixed, 10 covered by #915/#917/#918/#919, 43 open, 2 out of scope, 4 reference.

## Left to do

1. File one issue per **open** group (TareasLista toolbar; NuevaTarea template; TareaDetalle complete button; Notificaciones row labels; Proyectos Analítico; Proyecto Resumen/Ficha fields; Proyecto Tareas by partida; Archivos panel; Proyecto Clientes portal panel; Personas tab actions and columns; contractor documents; supplier quotes; Persona detalle; Mi espacio Analítico; Horario trial copy; General; Estatus; Permisos matrix; Integraciones; Perfil; password strength; portal approvals; minor copy) and put its number in the table.
2. Screenshot pass at 1440 px and 390 px on a local app with the demo data:

   ```sh
   cd cincel-app
   npm run db:setup          # fresh local DB: migrations + base seed
   npm run db:seed:demo      # canvas sample data
   npm run db:seed:madrid22  # optional: Madrid 22 cronograma
   npm run dev
   ```
