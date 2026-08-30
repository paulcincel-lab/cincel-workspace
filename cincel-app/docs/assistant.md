# Asistente IA (`/asistente`)

Chat operativo interno de Cincel. Responde preguntas accionables sobre proyectos,
tareas y carga del equipo, y —según el rol del usuario— puede crear y asignar
trabajo. Todo el acceso a datos es vía Drizzle contra `core.*`; nunca toca
`auth_credentials`, `sessions` ni información financiera de clientes.

## Partes principales

| Archivo | Responsabilidad |
| --- | --- |
| `lib/assistant/provider.ts` | Modelo de lenguaje. `isAssistantConfigured()` (¿hay `LLM_BASE_URL` + `LLM_API_KEY`?) y `getLanguageModel()` (`createOpenAI({ baseURL, apiKey }).chat(LLM_MODEL)`). Proveedor-neutro: cualquier endpoint compatible con OpenAI. |
| `lib/assistant/prompt.ts` | `buildSystemPrompt({ toolNames, user })` — arma el prompt de sistema en español a partir de (a) la identidad del usuario (nombre, rol de acceso, área) y (b) los nombres de las herramientas disponibles, de modo que el modelo no ofrezca acciones que el usuario no puede ejecutar. `SYSTEM_PROMPT` es la variante de solo lectura sin usuario. |
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

`onboard_client` da de alta el cliente y, en el mismo paso, siembra el checklist
estándar del flujo elegido (`lib/templates/{presale,diseno,operativas}.ts`,
Presale por defecto) como tareas `Pendiente` contra un proyecto nuevo, más
`extraTasks` opcionales. Es **idempotente**: si el cliente ya existe (mismo
nombre) lo reutiliza, y omite las tareas de plantilla que el proyecto ya tenga
para ese flujo — una llamada reintentada no duplica nada.

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
4. Añade una línea descriptiva en `buildSystemPrompt()` (`lib/assistant/prompt.ts`)
   condicionada a `toolNames.includes("<nombre>")`.
5. Agrega el caso de progreso en `AssistantChat.tsx` (`tool-<nombre>`).
6. Tests: `lib/assistant/tools.test.ts` (Zod + gating por rol),
   `app/api/asistente/chat/route.test.ts` (conjunto de herramientas por rol).

## Configuración

`.env` (git-ignored) / `docker-compose.yml` `env_file`:

```
LLM_BASE_URL=https://…/v1
LLM_API_KEY=…
LLM_MODEL=…
```

Sin estas variables el endpoint responde 503 y la UI muestra el aviso "El
asistente no está configurado". Las rutas de degradación están cubiertas por
`tests/e2e/asistente.spec.ts`; el camino con LLM real por
`tests/e2e/asistente-live.spec.ts` (`RUN_LIVE_ASSISTANT=1`).

`create_rfc` (opcional, independiente de lo anterior):

```
GITHUB_PAT=github_pat_…
GITHUB_REPO=owner/repo
```

Sin estas dos variables la herramienta sigue apareciendo para los roles con
`canCreateActivity`, pero devuelve un error legible en vez de crear el issue.
