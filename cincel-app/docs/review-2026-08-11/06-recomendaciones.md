# Revisión en profundidad — Recomendaciones priorizadas

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)

Este documento consolida los hallazgos de [01-arquitectura.md](./01-arquitectura.md), [02-seguridad.md](./02-seguridad.md), [03-modelo-de-datos.md](./03-modelo-de-datos.md), [04-calidad-frontend.md](./04-calidad-frontend.md) y [05-testing-qa.md](./05-testing-qa.md) en un plan de acción. No sustituye la lectura de cada documento — cada línea abajo referencia el detalle completo.

## Bloqueantes de release (antes de manejar datos reales de clientes)

Estos cinco puntos están relacionados entre sí: son, en conjunto, la razón por la que hoy no hay ninguna capa real de seguridad ni de persistencia de servidor en el proyecto.

1. **Reemplazar la autenticación casera por autenticación real de servidor.** (`02-seguridad.md` #1–#2) La sesión y el hash de contraseña viven enteramente en `localStorage`, con un hash de 32 bits no criptográfico. Cualquiera puede forjar una sesión de administrador desde DevTools sin conocer contraseña alguna. Camino recomendado: Supabase Auth, dado que el resto de la infraestructura ya apunta ahí.
2. **Agregar protección de rutas server-side (`middleware.ts` o verificación en Server Components).** (`02-seguridad.md` #1) Hoy la única barrera es un componente `"use client"` que decide después de la hidratación — el bundle completo ya se descargó antes de esa decisión.
3. **Diseñar políticas RLS con scoping real por rol/proyecto, reemplazando `using (true)`.** (`02-seguridad.md` #3, `03-modelo-de-datos.md` #6) Aplica a las 17 tablas de `core.*`, incluida `resource_links`. `lib/auth/permissions.ts` ya es, de hecho, un buen borrador de la matriz de roles que debería reflejarse en las políticas.
4. **Sacar los datos personales del equipo (`lib/data/team.ts`) del código fuente / bundle de cliente.** (`02-seguridad.md` #9) CURP, RFC, domicilio y contacto de emergencia de cada colaborador viajan hoy en el JavaScript servido a cualquier visitante, autenticado o no.
5. **Confirmar y fijar el valor real de `NEXT_PUBLIC_CINCEL_DATA_SOURCE` en producción.** (`03-modelo-de-datos.md` §0) Si no está en `"supabase"`, todos los datos de negocio viven solo en el `localStorage` de cada navegador — sin persistencia de servidor ni colaboración multiusuario real.

## Alto impacto, no bloqueante inmediato

6. **Mover la autorización de "qué puede hacer cada rol" de la UI a la capa de datos.** (`02-seguridad.md` #2) Ocultar un botón no impide una llamada directa a Supabase con la misma clave pública. Depende de resolver el punto 3.
7. **Adoptar un test runner real (Playwright o vitest) y un pipeline de CI mínimo.** (`05-testing-qa.md` #1, #2, #8) Cero pruebas automatizadas y cero CI hoy sobre un ERP de ~28k líneas con un sistema de permisos de 9 roles.
8. **Corregir el autoguardado sin debounce/diff en `ProjectsTable.tsx`.** (`04-calidad-frontend.md` #2) Riesgo de tormentas de escritura y pérdida de cambios entre usuarios concurrentes — más urgente que cualquier problema de tamaño de archivo.
9. **Eliminar la duplicación de rutas de Contratistas (~88% idénticas).** (`01-arquitectura.md`, sección "Duplicación de código") Dos páginas de 1140 líneas casi byte-idénticas; consolidar en un componente compartido.

## Medio plazo

10. Cerrar DT-12-001 (warnings `next/no-img-element` en `GeneralSettingsWorkspace.tsx`) — ya aprobado para Sprint 12, confirmado que sigue sin resolver (`01-arquitectura.md`, `04-calidad-frontend.md`).
11. Agregar semántica de diálogo y manejo de teclado (Escape, focus trap) al patrón compartido de drawer/modal. (`04-calidad-frontend.md` #4)
12. Configurar backup automatizado real de la base de datos (point-in-time recovery o `pg_dump` programado), en vez de depender solo del checklist manual de exportación a Excel. (`03-modelo-de-datos.md` #7)
13. Actualizar `AGENTS.md` para documentar `lib/repositories`, `lib/auth`, `lib/supabase`, `lib/settings`, `lib/calendar` — hoy la guía de arquitectura del proyecto no menciona sus módulos más sensibles. (`01-arquitectura.md`)
14. Actualizar ERD y diccionario de datos para incluir `resource_links` (Sprint 11.2). (`03-modelo-de-datos.md` #2)
15. Mover `SYSTEM_ADMIN_MEMBER_EMAILS` de una constante en el código fuente a configuración/variable de entorno. (`02-seguridad.md` #6)

## Bajo esfuerzo / buenas prácticas a mantener

- El sistema de exportación (`lib/utils/export-service.ts`) y el patrón repositorio + selector de fuente de datos son los dos mejores ejemplos de arquitectura del proyecto — usarlos como referencia al construir los módulos que aún no los siguen (Tareas).
- TypeScript estricto sin `any`, `.gitignore` correcto para secretos, y disciplina de documentación de sprint ya existente son fortalezas reales; no requieren acción, solo mantenerse.

## Nota sobre alcance de esta revisión

Esta carpeta (`docs/review-2026-08-11/`) es un documento de análisis, no un plan de sprint ejecutable ni un conjunto de issues de GitHub. Convertir estos puntos en milestones/issues accionables es un paso siguiente natural, pero es una acción visible en el repositorio compartido de GitHub y debe confirmarse explícitamente con el equipo antes de ejecutarse.
