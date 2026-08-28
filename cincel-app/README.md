# Cincel Workspace

ERP interno para un despacho de arquitectura y construcción: gestión centralizada de proyectos, tareas, clientes, equipo, proveedores y recursos, con permisos configurables por rol.

Construido con **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4**, persistencia en **Postgres vía Drizzle ORM + Server Actions**, con autenticación de sesión respaldada por la base de datos.

> Convenciones de código, filosofía de producto y reglas de negocio: ver [`AGENTS.md`](./AGENTS.md).

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Modelo de autenticación y autorización](#modelo-de-autenticación-y-autorización)
- [Infraestructura y despliegue](#infraestructura-y-despliegue)
- [Flujo de uso (caso de uso principal)](#flujo-de-uso-caso-de-uso-principal)
- [Matriz de funcionalidades por módulo](#matriz-de-funcionalidades-por-módulo)
- [Roles del sistema](#roles-del-sistema)
- [Guía para desarrolladores](#guía-para-desarrolladores)
- [Testing](#testing)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## Arquitectura

La app es un monolito Next.js: todas las rutas viven bajo `app/`, la mayoría de las pantallas de datos son componentes cliente (`"use client"`) que hidratan desde Postgres al montar, y toda lectura/escritura pasa por Server Actions.

```mermaid
flowchart TB
    subgraph Browser["Navegador"]
        UI["Páginas y componentes\n(app/*, components/*)"]
        Repos["lib/repositories/*\ndelegadores delgados"]
        Perms["lib/auth/permissions.ts\nresolución de capacidades por rol"]
    end

    subgraph Server["Servidor (Next.js)"]
        MW["middleware.ts\nguard de sesión antes de renderizar"]
        Actions["lib/actions/*-actions.ts\nServer Actions ('use server')"]
        API["app/api/team/sensitive/[id]\nRoute Handler autenticado (PII)"]
        Session["lib/auth/session.ts\nsesión por cookie opaca + rol resuelto"]
        DB["lib/db/client.ts\nDrizzle + postgres.js"]
    end

    subgraph Data["Datos"]
        PG[("Postgres\nschema core.*")]
        LS[("localStorage\nsolo prefs de UI + mirror\nde primer render")]
    end

    UI --> Perms
    UI --> Repos --> Actions
    UI --> API
    Actions --> Session
    Actions --> DB --> PG
    API --> DB
    MW --> Session --> DB
    UI -.prefs / primer render.-> LS
```

**Puntos clave:**

- Cada entidad tiene `lib/actions/<entidad>-actions.ts` (`"use server"`): lee/escribe Postgres vía Drizzle y se autoriza con `requireCapabilityUser()` + `resolve<Módulo>Capabilities()` (el reemplazo de RLS).
- `lib/repositories/*` quedaron como delegadores delgados hacia las actions; conservan los nombres de tipos y funciones históricos para no tocar los consumidores.
- Lectores síncronos legados (Header, ficha de proyecto, dashboard, `lib/utils/tasks-linking.ts`) siguen leyendo claves de `localStorage` que las funciones `fetch*`/`save*` **espejan** con la lista completa tras cada lectura/escritura.
- Los datos sensibles (PII de colaboradores: CURP, RFC, domicilio) **no** viven en el bundle de cliente — se separan en `lib/data/team.ts` vs. `lib/data/team-public.ts`, y se sirven solo vía `app/api/team/sensitive/[id]/route.ts`, autenticado y limitado a Administrador/Dirección.

## Modelo de autenticación y autorización

```mermaid
sequenceDiagram
    actor U as Usuario
    participant L as /login
    participant LA as loginAction (Server Action)
    participant DB as Postgres (core.auth_credentials / core.sessions)
    participant MW as middleware.ts
    participant P as permissions.ts

    U->>L: Ingresa correo + contraseña
    L->>LA: submit
    LA->>DB: verifica hash scrypt de auth_credentials
    LA->>DB: crea fila en core.sessions
    LA-->>U: cookie de sesión httpOnly + opaca
    U->>MW: Solicita ruta protegida (ej. /proyectos)
    MW->>DB: resuelve la cookie → sesión + rol
    alt sin sesión válida
        MW-->>U: redirect a /login
    else sesión válida
        MW-->>U: continúa el render
        U->>P: cada módulo resuelve sus capacidades
        P-->>U: botones/acciones visibles según rol
    end
```

- **`lib/auth/session.ts`** + **`lib/auth/auth-actions.ts`**: login por Server Action que verifica un hash **scrypt** contra `core.auth_credentials` y emite una cookie de sesión opaca respaldada por `core.sessions` (TTL 14 días). No hay identidad en `localStorage`.
- **`middleware.ts`** protege rutas a nivel de servidor, antes de que se descargue cualquier bundle — resuelve la cookie de sesión contra la base de datos en cada request.
- **`components/auth/AppRouteGuard.tsx`** es una capa adicional de UX (evita parpadeo de contenido durante hidratación), no la barrera de seguridad principal.
- **`lib/auth/permissions.ts`** centraliza "qué puede hacer cada rol" por módulo (Dashboard, Calendario, Actividades, Proyectos, Recursos, Clientes, Equipo), con overrides configurables por un administrador desde `Configuración → Permisos` — no es una matriz fija en código, sino un conjunto de defaults por rol que puede sobreescribirse en runtime.

## Infraestructura y despliegue

```mermaid
flowchart LR
    subgraph Dev["Desarrollo local"]
        D1["npm run dev\n(next dev --webpack)"]
    end

    subgraph CI["GitHub Actions\n.github/workflows/cincel-app-build.yml"]
        V["verify\nlint + build"]
        UT["unit-tests\nvitest"]
        E2E["e2e-tests\nservicio Postgres + db:migrate + db:seed\nplaywright (contra next build && next start)"]
        DB["docker-build\ndocker build ."]
        V --> UT
        V --> E2E
        V --> DB
    end

    subgraph Image["Imagen Docker (multi-stage)"]
        B1["Stage build:\nnode:23-alpine\nnpm ci + next build\n(output: standalone)"]
        B2["Stage runtime:\nnode:23-alpine\nusuario no-root\ndumb-init + node server.js"]
        B1 --> B2
    end

    subgraph Runtime["Despliegue"]
        Compose["docker-compose.yml\napp (puerto 3000) + db (Postgres 17)"]
        PGProd[("Postgres\n(gestionado por ambiente)")]
    end

    D1 -.git push / PR.-> CI
    CI --> Image
    Image --> Compose
    Compose -.DATABASE_URL en runtime.-> PGProd
```

- **`Dockerfile`**: build multi-stage sobre `node:23-alpine` con `output: standalone`. No requiere build args — `DATABASE_URL` se inyecta en runtime.
- **`docker-compose.yml`**: incluye un servicio `db` (`postgres:17-alpine`) para desarrollo/CI local; en producción se apunta `DATABASE_URL` a un Postgres gestionado.
- **CI** (`cincel-app-build.yml`) corre en cada PR/push a `main` que toque `cincel-app/**`: lint + build, suite unitaria (vitest), suite E2E (Playwright contra una build de producción, con un servicio Postgres al que se le aplican migraciones y seed), y una verificación de que la imagen Docker construye.
- No hay paso de *push* a un registro de contenedores todavía — la validación de CI es solo de build.

## Flujo de uso (caso de uso principal)

Ciclo de vida típico de un proyecto, de punta a punta:

```mermaid
flowchart TD
    A["Administrador/Dirección\ncrea un Cliente"] --> B["Crea un Proyecto\nasociado al cliente"]
    B --> C["Asigna responsables\n(Jefe de Taller / Construcción)"]
    C --> D["Se generan Actividades\nen Presale / Taller de Diseño / Construcción"]
    D --> E["Cada actividad define\ncommitmentDate + reviewDate\n(regla de negocio obligatoria)"]
    E --> F["Colaboradores actualizan estatus\ny agregan notas a la bitácora\n(historial nunca se elimina)"]
    F --> G["Dashboard agrega:\nriesgo por proyecto, carga del equipo,\nagenda operativa, calendario"]
    G --> H{"¿Entrega o revisión\nvencida / bloqueada?"}
    H -- sí --> I["Alerta accionable\nen Dashboard"]
    H -- no --> J["Progreso visible\nen Proyectos / Tareas"]
    F --> K["Exportación centralizada\n(PDF/Excel) por módulo"]
```

## Matriz de funcionalidades por módulo

| Módulo | Ruta | Descripción | Persistencia | Componentes/lib clave |
|---|---|---|---|---|
| **Dashboard** | `/dashboard` | Riesgo por proyecto, carga del equipo, agenda operativa, calendario resumido, alertas accionables | Deriva de Proyectos + Actividades | `components/dashboard/InteractiveDashboard.tsx` |
| **Calendario** | `/calendario` | Vista unificada de eventos (compromisos, revisiones, entregas) por día/equipo | Deriva de Actividades | `components/calendario/UnifiedCalendar.tsx`, `lib/calendar/calendar-service.ts` |
| **Actividades (Tareas)** | `/tareas`, `/tareas/presale`, `/tareas/diseno`, `/tareas/construccion` | Gestión de tareas por flujo de trabajo (Presale, Taller de Diseño, Construcción), con `commitmentDate`/`reviewDate` obligatorios e historial append-only | Postgres `core.activities` (+ support/history/checklist) vía `activities-actions.ts` | `components/tareas/PresaleTable.tsx`, `lib/repositories/activities-repository.ts` |
| **Proyectos** | `/proyectos`, `/proyectos/[id]` | Tabla de proyectos con filtros, edición inline, notas, ficha de detalle, autoguardado con debounce/diff | Postgres `core.projects` vía `projects-actions.ts` | `components/proyectos/ProjectsTable.tsx`, `lib/repositories/projects-repository.ts` |
| **Clientes** | `/clientes`, `/clientes/[id]` | CRUD de clientes, historial de interacciones, ficha de detalle | Postgres `core.clients` vía `clients-actions.ts` (historial de interacciones aún en `localStorage`) | `lib/repositories/clients-repository.ts`, `lib/repositories/client-history-repository.ts` |
| **Equipo** | `/equipo` | Alta/edición de colaboradores, roles del sistema, disponibilidad y carga de trabajo | Postgres `core.team_members` vía `team-actions.ts` + Route Handler autenticado para PII | `app/equipo/page.tsx`, `app/api/team/sensitive/[id]/route.ts`, `lib/repositories/team-repository.ts` |
| **Proveedores** | `/proveedores/contratistas`, `/proveedores/colaboradores`, `/proveedores/tiendas` | Catálogo de contratistas, colaboradores externos y tiendas | Postgres `core.contractors` / `core.collaborator_providers` / `core.stores` vía `providers-actions.ts` | `lib/repositories/providers-repository.ts` |
| **Recursos** | `/recursos/*` | Documentos, favoritos, plantillas de diseño, formatos de obra, vacaciones, formación, y sección Empresa (book, manual, imagen, RFC, políticas) | Postgres `core.resource_links` vía `resources-actions.ts` | `components/recursos/ResourcesWorkspace.tsx`, `lib/repositories/resources-repository.ts` |
| **Configuración** | `/configuracion/general`, `/configuracion/permisos` | Ajustes generales del sistema (nombre, versión, logo) y overrides de permisos por rol/módulo | `localStorage` | `components/configuracion/GeneralSettingsWorkspace.tsx`, `components/configuracion/PermissionsWorkspace.tsx` |
| **Exportación** | (transversal, botón "Exportar" por módulo) | Exportación a PDF/Excel con checklist de QA | En memoria (no persiste) | `components/ui/ExportMenu.tsx`, `lib/utils/export-service.ts` |
| **Autenticación** | `/login`, `/change-password`, `/profile` | Login por Server Action (scrypt vs. `core.auth_credentials`), sesión por cookie opaca (`core.sessions`), cambio de contraseña, perfil con foto | Postgres `core.auth_credentials` / `core.sessions` | `lib/auth/session.ts`, `lib/auth/auth-actions.ts`, `middleware.ts` |

## Roles del sistema

Definidos en `lib/data/roles.ts` (`OFFICIAL_CINCEL_ROLES`). El acceso por módulo es configurable por un Administrador en `Configuración → Permisos`; esta tabla resume el nivel de acceso **por defecto**:

| Rol | Alcance de datos por defecto | Notas |
|---|---|---|
| **Administrador** | Global | Acceso total; escalación automática vía `CINCEL_ADMIN_EMAILS` (variable de entorno) |
| **Dirección** | Global | Visibilidad ejecutiva de todos los proyectos |
| **Jefe de Taller** | Proyectos/tareas gestionadas | Lidera el flujo de Taller de Diseño |
| **Jefe de Construcción** | Proyectos/tareas gestionadas | Lidera el flujo de Construcción |
| **Arquitecto Senior** | Proyectos/tareas asignadas | |
| **Arquitecto Junior** | Tareas asignadas | |
| **Colaborador** | Tareas asignadas | Rol por defecto para nuevas altas |
| **Pasante / Servicio Social** | Tareas asignadas (acotado) | |
| **Otros** | Mínimo | Rol de contención para casos no clasificados |

## Guía para desarrolladores

### Requisitos

- Node.js 23+
- Docker + Docker Compose (para el Postgres local; también corre la imagen productiva)

### Arranque rápido

```bash
npm install
docker compose up -d db          # Postgres 17 en localhost:5432
npm run db:migrate               # aplica lib/db/migrations/*
npm run db:seed                  # equipo, clientes/proyectos demo, credencial admin
npm run dev
# http://localhost:3000  ·  login: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

### Variables de entorno

Ver [`.env.example`](./.env.example). Las relevantes:

| Variable | Uso | Default |
|---|---|---|
| `DATABASE_URL` | Conexión Postgres — `lib/db/client.ts`, drizzle-kit, `scripts/seed.ts` | `postgres://cincel:cincel@localhost:5432/cincel` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Credencial admin que crea `npm run db:seed` | `paul@cincel.mx` / `CincelAdmin2026!` |
| `CINCEL_ADMIN_EMAILS` | Emails con escalación automática a Administrador (solo servidor) | vacío |

### Scripts disponibles

```bash
npm run dev              # servidor de desarrollo (next dev --webpack)
npm run build            # build de producción (output: standalone)
npm run start            # sirve el build de producción
npm run lint             # eslint
npm run test:unit        # vitest (permisos por rol, auth, reglas de negocio de tareas, authz de repos)
npm run test:unit:watch  # vitest en modo watch
npm run test:e2e         # playwright (levanta el server automáticamente; requiere db migrada + seed)
npm run test:e2e:ui      # playwright con UI interactiva
npm run db:generate      # drizzle-kit generate — nueva migración desde el schema
npm run db:migrate       # drizzle-kit migrate — aplica migraciones pendientes
npm run db:seed          # tsx scripts/seed.ts
npm run db:studio        # drizzle-kit studio
```

> Para correr E2E localmente de forma fiable usá `CI=1 npx playwright test` (build de producción); `next dev` recompila rutas bajo demanda y suele exceder el timeout de 30s.

### Correr con Docker

```bash
docker compose up --build
# http://localhost:3000  (app + db)
```

Ver [`Dockerfile`](./Dockerfile) y [`docker-compose.yml`](./docker-compose.yml).

### Base de datos

El schema Drizzle vive en `lib/db/schema/` y las migraciones en `lib/db/migrations/` (generadas con `npm run db:generate`, aplicadas con `npm run db:migrate`). `scripts/seed.ts` es idempotente (upsert por `legacy_id`).

## Testing

| Tipo | Herramienta | Ubicación | Qué cubre |
|---|---|---|---|
| Unitario | Vitest + happy-dom | `tests/unit/` | Matriz de permisos por rol, flujo de login/hash, reglas de negocio de Tareas (fechas obligatorias, historial append-only), rechazo de escritura sin capacidad |
| E2E | Playwright | `tests/e2e/` | Login (flujo real de formulario), navegación, CRUD con verificación de persistencia en Postgres (Clientes, Proyectos, Tareas, Equipo, Proveedores), exportación |

La suite E2E corre en CI contra una build de producción (`next build && next start`) con un servicio Postgres migrado + seed; no `next dev`, para evitar timeouts por compilación bajo demanda. `tests/e2e/global-cleanup.ts` purga las filas etiquetadas `E2E` antes y después de la corrida (la suite comparte una sola base sin aislamiento por test).

## Estructura del proyecto

```
app/                  Rutas y páginas (App Router)
  api/                Route Handlers autenticados (ej. PII de equipo)
components/
  layout/             Header, Sidebar, estructura general
  dashboard/          Panel principal
  proyectos/          Tabla y ficha de proyectos
  tareas/             Flujos de actividades (Presale/Diseño/Construcción)
  calendario/         Calendario unificado
  configuracion/      Ajustes generales y permisos
  auth/               Guards de ruta client-side
  ui/                 Componentes reutilizables (Avatar, ExportMenu, ...)
lib/
  actions/            Server Actions por entidad (Drizzle + autorización de sesión)
  auth/               Login, sesión por cookie opaca, permisos por rol
  data/               Datos semilla / catálogos (equipo, roles, proyectos base)
  db/                 Schema Drizzle, cliente Postgres, migraciones
  repositories/       Delegadores delgados hacia lib/actions/*
  settings/           Configuración general persistida
  calendar/           Agregación de eventos de calendario
  templates/          Plantillas de fases/tareas por flujo
  types/              Tipos de dominio compartidos
  utils/              Exportación, fechas, vinculación de tareas
middleware.ts         Guard de sesión a nivel de servidor
tests/                Suites unitarias y E2E
scripts/              seed.ts
docs/                 Documentación de arquitectura, seguridad, fases y sprints
```
