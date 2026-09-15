# Rebuild Phase 4: CRM (Directorio)

Milestone de GitHub: **Rebuild M4 — CRM**

Fuente: plan de reconstrucción (Parte A, Fase 4). Backend en `lib/repositories/contacts-repository.ts` y `lib/actions/contacts-actions.ts` (`core.contacts`, `core.contact_people`, `core.contact_tags`, `core.provider_profiles`).

## Goal
Un solo módulo de contactos que reemplaza `clientes` y `proveedores`: lista por tipo, alta/edición, personas de contacto, tags, perfil de proveedor, y ficha de cliente con estadísticas derivadas (`core.client_stats`).

## Deliverables

### Backend
- [ ] Confirmar que `resolveClientsCapabilities` es suficiente para socios/proveedores o si el negocio pide capacidades separadas por tipo -- documentar la decisión en el propio PR
- [ ] Si un colaborador freelance (`provider_profiles.staff_id`) necesita aparecer en los pickers de staff de tareas, exponer ese cruce (ya soportado por el modelo, falta UI)

### Frontend
- [ ] `/directorio`: una sola tabla con filtro por tipo (`cliente` / `socio` / `proveedor`) en vez de las vistas separadas de clientes y proveedores
- [ ] Alta/edición de contacto: formulario común + campos condicionales de `provider_profiles` cuando `type = proveedor`
- [ ] Gestión de personas de contacto (`setContactPeopleAction`) -- alta, marcar primaria, reordenar
- [ ] Gestión de tags (`setContactTagsAction`) -- categorías y habilidades
- [ ] Ficha de cliente: proyectos del cliente + `core.client_stats` (total, activos, primera fecha de trabajo, monto contratado)
- [ ] Migrar `ClientDetailSheet.tsx` y `DirectorioClient.tsx` al nuevo shape (`ContactListItem` / `ContactDetail` de `lib/types/core.ts`)

### Infrastructure
- [ ] Ninguno

## Done Definition
- Alta de cliente, socio y proveedor desde la misma pantalla
- Ficha de cliente muestra estadísticas correctas contra `core.client_stats`
- Perfil de proveedor (subtipo, rating, disponibilidad) editable solo para contactos `proveedor`
- `npm run test:unit` verde; `npx tsc --noEmit` sin errores en `app/directorio` y `components/directorio`

## Parallel work
- FE: la ficha de cliente (stats) puede construirse en paralelo a la lista/alta

## Phase dependencies
- Requires: Rebuild Phase 2 (data access) y, para el cruce con staff, Rebuild Phase 3 (staff picker)

## Complexity
- Backend: XS
- Frontend: M
- Infra: XS

## Risks
- `provider_profiles.staffId` conecta un proveedor freelance con un `staff` real; si la UI no lo expone con cuidado se puede duplicar a la misma persona como colaborador y como proveedor
