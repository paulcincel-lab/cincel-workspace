# QA checklist flujos de tareas

## 1) Presale
- Abrir Tareas > Presale y validar que carga grupos por proyecto.
- Confirmar scroll horizontal y acceso a columnas finales (Fecha entrega, Fecha actualizada, Acciones).
- Crear tarea con + Nueva tarea y validar que aparece en el proyecto elegido.
- Usar Iniciar plantilla de Presale con un proyecto nuevo y validar que crea multiples filas.
- Usar Iniciar plantilla de Presale desmarcando 2 descripciones y validar que solo crea seleccionadas.
- Validar que Responsable por defecto sea Sin responsable en alta rapida y plantilla.
- Editar en linea: fase, descripcion, responsable, equipo, estatus y fechas.
- Abrir detalle (icono i), agregar nota y validar que se guarda en historial cronologico.
- Archivar una tarea y validar que desaparece de Activas y aparece en Archivadas.
- Probar filtros: proyecto, responsable, equipo, estatus, fecha entrega y busqueda.

## 2) Operativas
- Abrir Tareas > Operativas y validar que usa el mismo patron visual y comportamiento.
- Confirmar que el titulo sea Operativas y el workflow de nuevas tareas sea Construccion.
- Crear plantilla de Operativas en proyecto nuevo y validar agrupacion correcta.
- Verificar que no se oculten proyectos existentes despues de crear plantilla.

## 3) Navegacion y consistencia
- Abrir Tareas > Diseno y validar que existe la vista (sin 404).
- Validar estilo base consistente: tarjetas, bordes, espaciado y botones.
- Validar que no hay errores de lint.

## 4) Regresion rapida
- Recargar pagina en Presale y Operativas para confirmar estado inicial estable.
- Validar que editar una fila no rompe otras filas del mismo proyecto.
- Validar que filtros combinados no bloquean la interaccion de la tabla.
