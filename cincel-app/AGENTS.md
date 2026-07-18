# AGENTS.md

## Proyecto
- Nombre: Cincel Workspace
- Tipo: ERP para despacho de arquitectura y construcción.

## Objetivo
Construir una plataforma para administrar proyectos, colaboradores, clientes y obra de forma centralizada y clara.

## Filosofía
- No crear componentes nuevos si ya existe uno reutilizable.
- Mantener una UI limpia, minimalista y consistente con el diseño actual.
- Priorizar la claridad y la experiencia del usuario sobre soluciones complejas.

## Arquitectura
Este proyecto está basado en Next.js con React y sigue una estructura simple y modular:

- app/: páginas y rutas principales de la aplicación.
  - Ejemplos: dashboard, proyectos, tareas, equipo, recursos, clientes y configuración.
- components/: componentes reutilizables compartidos por varias vistas.
  - layout/: encabezado, barra lateral y estructura general.
  - dashboard/: componentes del panel principal.
  - proyectos/: componentes relacionados con proyectos.
  - tareas/: componentes para tareas y flujos operativos.
  - ui/: elementos de interfaz reutilizables como Avatar y Badge.
- lib/: lógica de datos, mocks y utilidades.
  - data/: datos mock utilizados por la aplicación.
  - templates/: plantillas auxiliares.
  - types/: tipos de TypeScript.
- public/: archivos estáticos.
- package.json: dependencias y scripts del proyecto.

## Convenciones
- Reutilizar Avatar y Badge cuando sea posible.
- Mantener los datos mock dentro de lib/data.
- Mantener los tipos en lib/types.
- Seguir el estilo existente de la interfaz: tarjetas, tablas, espaciado limpio y colores sobrios.
- Preferir cambios pequeños y coherentes sobre refactors grandes.

## Principios
- Pensar primero en la experiencia del usuario.
- Priorizar reutilización sobre duplicación.
- No romper componentes existentes.
- Mantener el código simple, legible y fácil de extender.
- Respetar la estructura actual del proyecto y no inventar una arquitectura nueva.

## Visión del producto
Cincel Workspace no es un CRM ni un gestor de tareas genérico.
Es un ERP especializado para despachos de arquitectura y construcción.

Cada pantalla debe ayudar a responder preguntas operativas reales:
- ¿Quién está saturado?
- ¿Qué proyectos están en riesgo?
- ¿Qué entregas vencen esta semana?
- ¿Qué cliente requiere atención?
- ¿Qué etapa del proyecto está detenida?

Las interfaces deben priorizar información accionable antes que formularios.

## Reglas de negocio

### Tareas
Toda tarea tiene:
- commitmentDate
- reviewDate

Nunca eliminar historial.

Las notas funcionan como una bitácora cronológica.

### Proyectos
Cada proyecto pertenece a un cliente.

Puede tener múltiples responsables.

Puede contener tareas de distintas áreas.

### Colaboradores
Un colaborador puede participar en varios proyectos.

La carga de trabajo debe poder visualizarse.

La disponibilidad debe ser visible.

## Diseño
La aplicación debe mantener:
- UI limpia.
- pocas acciones por pantalla.
- componentes reutilizables.
- tablas consistentes.
- drawers para edición.
- evitar navegación innecesaria.

## Recomendaciones para agentes de IA
- Antes de implementar, inspeccionar si ya existe un componente o patrón similar.
- Si un cambio puede resolverse con un componente existente, usarlo.
- Mantener los nombres y la organización de archivos coherentes con la estructura actual.
- Cuando agregues nuevas vistas, seguir el mismo patrón visual y de composición que las páginas existentes.

