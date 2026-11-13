# Asistente IA (`/asistente`)

Chat interno de Cincel. Responde preguntas generales de arquitectura, diseño y
construcción con su propio conocimiento (marcadas como referencia general, con la
norma mexicana que aplique), consulta los datos de Cincel solo con herramientas
y —según el rol del usuario— puede crear y asignar trabajo. Todo el acceso a datos es vía Drizzle contra `core.*`; nunca toca
`auth_credentials`, `sessions` ni información financiera de clientes.

## Partes principales

| Archivo | Responsabilidad |
| --- | --- |
| `lib/assistant/provider.ts` | Modelo de lenguaje. `isAssistantConfigured()` (¿hay `LLM_BASE_URL` + `LLM_API_KEY`?) y `getLanguageModel()` (`createOpenAI({ baseURL, apiKey }).chat(LLM_MODEL)`). Proveedor-neutro: cualquier endpoint compatible con OpenAI. |
| `lib/assistant/prompt.ts` | `buildSystemPrompt({ tools, user, context, serverThreads })` — arma el prompt de sistema en español: conocimiento general permitido (con la referencia normativa y la aclaración de que es una referencia general), datos de Cincel solo con herramientas, y la lista de herramientas **generada** del conjunto de la petición (`toolCatalogOf(tools, writes)`: nombre, primera frase de la descripción, consulta o escritura). Solo algunas herramientas agregan una regla propia (`TOOL_RULES`). `SYSTEM_PROMPT` es la variante sin herramientas ni usuario. |
| `lib/assistant/tools.ts` | Definición de las herramientas (`tool()` de la AI SDK, `inputSchema` con Zod) y `buildAssistantTools(user)`, que devuelve el subconjunto de herramientas permitido para ese usuario. |
| `app/api/asistente/chat/route.ts` | Endpoint `POST` de streaming. `getSession()` → 401 · `isAssistantConfigured()` → 503 · `requireCapabilityUser()` → 403. Luego `streamText({ model, system, messages, tools, stopWhen: stepCountIs(5) })` y `toUIMessageStreamResponse()`. |
| `components/asistente/AssistantChat.tsx` | Cliente (`useChat` + `DefaultChatTransport`). Renderiza `message.parts`: texto → burbuja markdown; `tool-render_chart` → `<AssistantChartMessage>`; el resto de `tool-*` → línea de progreso ("Consultando datos…", "Creando tarea…", …). |
| `components/asistente/AssistantChartMessage.tsx` | Gráfico recharts (barras / línea) a partir de `part.input` de `render_chart`. |
| `app/asistente/page.tsx` | Server Component con guardia de sesión; monta Sidebar + Header + `AssistantChat`. |

## Herramientas y control por rol

El conjunto de herramientas **cambia según el rol** del usuario. `buildAssistantTools()`
reutiliza las mismas capacidades que aplican las pantallas `/tareas` y `/clientes`
(`resolveActivitiesCapabilities` / `resolveClientsCapabilities` en
`lib/auth/permissions.ts`). Cada acción de escritura **vuelve a verificar** la
capacidad en el servidor (defensa en profundidad) y **siempre** escribe un
registro en `activity_history` nombrando a quien lo solicitó — el historial nunca
se sobrescribe.

| Herramienta | Tipo | Capacidad requerida | Roles que la reciben |
| --- | --- | --- | --- |
| `list_projects` | lectura | — | todos |
| `list_activities_due` | lectura | — | todos — con `projectName` lista **todas** las tareas del proyecto (con o sin fecha), útil para revisar/secuenciar uno recién creado |
| `team_workload_summary` | lectura | — | todos |
| `render_chart` | UI (no-op en servidor) | — | todos |
| `create_task` | escritura | `canCreateActivity` | todos |
| `assign_task` | escritura | `canChangeResponsible` | Administrador, Dirección, Jefe de Taller, Jefe de Construcción, Arquitecto Senior |
| `create_client` | escritura | `canCreateClient` | Administrador, Dirección, Jefes, Arquitecto Senior |
| `onboard_client` | escritura | `canCreateClient` **y** `canCreateActivity` | Administrador, Dirección, Jefes, Arquitecto Senior |
| `create_rfc` | escritura externa | `canCreateActivity` | todos |

`onboard_client` da de alta el cliente (o reutiliza el que ya existe con el mismo
nombre), crea el proyecto sin etapa y lo liga al cliente —como cliente del
proyecto si quien lo pide es administrador; si no, como contacto del proyecto, y
avisa que un administrador debe asignarlo— y luego inicia el etapa elegido
(las plantillas de `workflow_task_templates` de sus fases activas, vía
`startEtapaAction`; Presale por defecto) con el responsable indicado, más
`extraTasks` opcionales.

Acciones de servidor: `lib/actions/activities-actions.ts`
(`createActivityViaAssistantAction`, `assignActivityViaAssistantAction`) y
`lib/actions/clients-actions.ts` (`createClientViaAssistantAction`,
`onboardClientViaAssistantAction`).

`create_rfc` es distinto de las demás escrituras: no toca `core.*`, crea un
GitHub Issue vía `lib/github/client.ts` (`createGithubIssue`), etiquetado
`rfc`, con el problema/propuesta/alternativas armados en el cuerpo del issue.
Requiere `GITHUB_PAT` (fine-grained, scope `Issues: write` solo sobre
`GITHUB_REPO`) y `GITHUB_REPO` (`owner/repo`) — sin ellas, la herramienta
responde `{ ok: false, error }` en vez de fallar silenciosamente.

## Calendario: herramientas, propuestas y deshacer

El grupo `calendario` (`lib/assistant/tools/calendario.ts`, ADR 0007) deja que el
asistente planee desde `/calendario` sin cambiar datos por su cuenta: toda
modificación es una **propuesta guardada** (`assistant_proposals`) que la persona
aplica o cancela y que se puede deshacer.

- **Lectura:** `calendar_range`, `summarize_day`, `summarize_week`, `day_load`,
  `find_overloads`, `meeting_prep`. Las descripciones de eventos de Google se
  entregan marcadas como contenido no confiable.
- **Proponen (no escriben tareas ni eventos):** `move_tasks`, `propose_from_text`
  (la Barra para pedir; «Pasa lo vencido al jueves» se resuelve sin modelo),
  `propose_redistribution`, `resolve_overlap`, `plan_week`, `extract_minutes`.
  Cada una devuelve `proposalId`, `changes` y `deferred`.
- **Escriben, con confirmación:** `apply_proposal` (completa o solo los cambios
  elegidos), `undo_proposal` (con el token, 15 minutos; solo restaura lo que no
  cambió después), `create_tasks_from_minutes`, `send_agenda`, `send_minutes`.
- **Deshacer:** aplicar guarda un token; deshacer retira las tareas y reuniones
  creadas, devuelve las fechas y retira las decisiones de la minuta del historial
  del proyecto. Al aplicar `planear_semana`, cada responsable distinto de quien
  aplica recibe un solo aviso «Tu semana cambió».
- **Límites de uso (por persona):** modelo de la Barra 20 cada 10 min; aplicar y
  deshacer 60 cada 10 min; extraer minuta 20 cada 10 min; enviar minuta o agenda
  10 por hora y 3 por evento por hora; crear reuniones 30 por hora.
- **Sugerencias:** cada sugerencia de la página nombra una herramienta registrada
  y disponible para el rol (`tool-references.test.ts`).

## Cómo agregar una herramienta

1. Si escribe datos, agrega una Server Action en `lib/actions/<entidad>-actions.ts`
   que llame `requireCapabilityUser()`, verifique la capacidad, ejecute la
   mutación con Drizzle, deje una entrada en el historial correspondiente y llame
   `revalidatePath()` de las rutas afectadas.
2. Define la herramienta en `lib/assistant/tools.ts` con `tool({ description,
   inputSchema: z.object({...}), execute })`. Whitelist de columnas, tope de
   resultados.
3. Si aplica solo a ciertos roles, agrégala dentro de `buildAssistantTools()` bajo
   la comprobación de capacidad correspondiente.
4. No hace falta tocar el prompt: la lista de herramientas se genera de la
   descripción (escríbela en español, corta, con la primera frase autosuficiente).
   Solo si la herramienta necesita una regla extra, agrégala a `TOOL_RULES` en
   `lib/assistant/prompt.ts`.
5. Agrega su paso en `lib/assistant/tool-steps.ts`, su resumen en
   `lib/assistant/tool-summaries.ts` y, si escribe, su entrada en
   `TOOL_INVALIDATIONS` (o en `WRITES_WITHOUT_LOCAL_CACHE` si no cambia nada de
   la app) en `lib/assistant/tool-invalidation.ts`.
6. Si un comando o sugerencia la usa, nómbrala en `tools` del prompt en
   `lib/assistant/starter-prompts.ts`: solo se muestra a quien tiene todas sus
   herramientas (`groupsForTools`, con los nombres que lee `/asistente` en el
   servidor).
7. Tests: `lib/assistant/tools.test.ts` (Zod + gating por rol),
   `app/api/asistente/chat/route.test.ts` (conjunto de herramientas por rol) y
   las guardas de `lib/assistant/tool-references.test.ts` (nombres registrados,
   paso, resumen e invalidación de cada escritura).

## Configuración

`.env` (git-ignored) / `docker-compose.yml` `env_file`:

```
LLM_BASE_URL=https://…/v1
LLM_API_KEY=…
LLM_MODEL=…
```

Sin estas variables el endpoint responde 503 y la UI muestra el aviso "El
asistente no está configurado". El sheet con una escritura confirmada está
cubierto por `tests/e2e/asistente-sheet.spec.ts` (respuestas simuladas); el
camino con LLM real por `tests/e2e/asistente-live.spec.ts` (`RUN_LIVE_ASSISTANT=1`).

`create_rfc` (opcional, independiente de lo anterior):

```
GITHUB_PAT=github_pat_…
GITHUB_REPO=owner/repo
```

Sin estas dos variables la herramienta sigue apareciendo para los roles con
`canCreateActivity`, pero devuelve un error legible en vez de crear el issue.
