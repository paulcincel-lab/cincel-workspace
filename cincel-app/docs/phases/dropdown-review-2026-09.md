# Dropdown Review (September 2026)

Milestone de GitHub: **UI Bugs — Dropdown Review (Sept 2026)**

Fuente: revisión manual del sitio en vivo (`cincel.cloudketer.dev`),
sesión autenticada como Paul/Administrador.
Tres hallazgos reproducibles, cada uno confirmado en más de un punto de la
app, no solo un frame de animación a medio render (se verificó con el árbol
de accesibilidad además de capturas de pantalla).

Todos los `Select` de la app comparten el mismo wrapper delgado sobre
`base-ui`'s `SelectPrimitive` en `components/ui/shadcn/select.tsx`
(`SelectValue` en la línea 22). Los tres bugs probablemente comparten ahí
una causa común o cercana, pero cada uno se manifiesta distinto y se debe
verificar por separado.

## Goal
Corregir tres defectos de UI en los componentes `Select` de la app: dos
donde el disparador (trigger) cerrado no muestra una etiqueta legible, y
uno donde la lista de opciones abierta se renderiza detrás de contenido
de la página en vez de flotar por encima.

## Deliverables

### Bug 1 — El trigger muestra el valor crudo (uuid o sentinela) en vez de una etiqueta

- [ ] **`components/proyectos/ProjectCreateModal.tsx`** — en el modal "Nuevo
      proyecto": el campo "Etapa inicial" muestra el uuid crudo del
      workflow (p. ej. `4931d831-7716-4510-a6fa-33172cd39b3c`) en vez de su
      nombre ("Presale"). Los campos "Cliente" y "Encargado" muestran el
      texto sentinela literal `__none__` en vez de un placeholder legible
      ("Selecciona un cliente" / "Sin encargado"). Confirmado que persiste
      incluso después de hacer clic explícito en "Presale" dentro de la
      lista ya abierta — no es solo el primer render, nunca se resuelve.
- [ ] **`app/mis-tareas/MisTareasClient.tsx`** — el filtro de estado junto a
      "Soy encargado" / "Soy apoyo" muestra el texto literal `__all__` en
      vez de una etiqueta como "Todos los estados", visible incluso sin
      interacción, solo con cargar la página.
- [ ] Revisar si el mismo patrón de "valor sentinela sin resolver" aparece
      en otros `Select` con una opción "todos" / "ninguno" en el resto de
      la app (p. ej. otros filtros en Tablero, Calendario, Directorio) —
      no se revisaron exhaustivamente todas las pantallas.

### Bug 2 — Directorio: el tipo de contacto se muestra en minúsculas sin capitalizar

- [ ] **`components/directorio/ContactEditorSheet.tsx`** — en el sheet
      "Nuevo contacto": los campos "Tipo de contacto" y "Empresa o
      particular" muestran el valor crudo en minúsculas ("cliente",
      "particular", "socio") en el trigger cerrado, incluso después de
      seleccionar una opción explícitamente con clic. La lista de opciones
      abierta sí muestra las mismas opciones capitalizadas ("Cliente",
      "Socio", "Proveedor"), así que la inconsistencia es solo entre el
      trigger y la lista — probablemente falta la misma clase CSS de
      capitalización en el `SelectValue` del trigger que sí tiene cada
      `SelectItem`.

### Bug 3 — La lista de opciones abierta se renderiza detrás del contenido de la página

- [ ] **`components/directorio/ContactEditorSheet.tsx`** — al abrir el
      `Select` de "Tipo de contacto" dentro del sheet "Nuevo contacto", la
      lista de opciones ("Socio", "Proveedor") se renderiza detrás del
      texto de la etiqueta "Nombre" y su placeholder, en vez de flotar por
      encima como una capa superior. Se repitió en aperturas sucesivas, no
      fue solo un frame de transición.
- [ ] **`app/mis-tareas/MisTareasClient.tsx`** — el mismo patrón de
      superposición ocurre con la lista del filtro de estado, que se
      renderiza detrás del encabezado de columna "Equipo" de la tabla.
- [ ] Diagnosticar si es un problema de `z-index` / stacking context del
      popover del `Select` en general, o específico a cuando el `Select`
      vive dentro de un `Sheet` / sobre una tabla — revisar
      `components/ui/shadcn/select.tsx` y cómo se porta (`portal`) el
      contenido del popover.

## Done Definition
- Los tres campos de "Bug 1" muestran una etiqueta legible en el trigger
  cerrado en todo momento, incluso en el primer render antes de cualquier
  interacción del usuario
- Los selects de "Bug 2" muestran el mismo texto capitalizado que su lista
  de opciones
- La lista de opciones de cualquier `Select` se renderiza siempre por
  encima del resto del contenido de la página, sin importar en qué
  contenedor viva (sheet, tabla, modal)
- `npx tsc --noEmit` limpio y `npm run test:unit` verde después de cada
  cambio
- Verificar manualmente cada corrección contra el sitio en vivo o un
  build local, no solo contra el tipo — estos son bugs de comportamiento
  visual/runtime que `tsc` no detecta

## Parallel work
- Bug 1 y Bug 2 son independientes entre sí
- Bug 3 puede requerir tocar el wrapper compartido
  (`components/ui/shadcn/select.tsx`), así que conviene diagnosticarlo
  antes de decidir si es un fix local por pantalla o un fix central

## Phase dependencies
- Ninguna — hallazgos de una revisión manual sobre `main`, sin relación
  con el rebuild ni con la limpieza de código muerto

## Complexity
- Bug 1: S (dos archivos, mismo patrón, posible causa común pero
  arreglable por sitio de uso)
- Bug 2: XS (clase CSS faltante en un componente)
- Bug 3: M (puede requerir tocar el componente compartido; diagnosticar
  antes de estimar con más precisión)

## Risks
- Si Bug 1 y Bug 3 resultan tener la misma causa raíz en el wrapper
  compartido de `Select`, un fix ahí afecta a todos los `Select` de la
  app — probar visualmente varias pantallas después de cualquier cambio
  al wrapper, no solo las que aparecen aquí
