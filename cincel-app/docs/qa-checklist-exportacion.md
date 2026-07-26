# QA checklist exportacion de informacion

## Objetivo
- Validar que la exportacion entregue exactamente la vista actual del usuario.
- Validar consistencia del servicio central para Excel y PDF.
- Validar control de acceso por permisos del sistema.

## Alcance recomendado por modulo
- Ejecutar este checklist en cualquier modulo con tabla exportable.
- Repetir para cada vista de tabla relevante (ejemplo: Activos/Archivados).

## Precondiciones
- Tener datos suficientes para probar filtros, busqueda, orden y estados vacios.
- Confirmar que el usuario de prueba tiene un rol con permiso de exportacion.
- Confirmar que existe al menos un usuario de prueba sin permiso de exportacion.

## A) Permisos y visibilidad
- Ingresar con rol Administrador y validar que aparece el boton Exportar.
- Ingresar con rol Direccion y validar que aparece el boton Exportar.
- Ingresar con un rol no autorizado y validar que el boton Exportar no aparece.
- Confirmar que la restriccion es por permisos (no por CSS ni ocultamiento visual).

## B) Comportamiento del menu Exportar
- Validar que el boton muestra menu con opciones:
  - Exportar a Excel (.xlsx)
  - Exportar a PDF
- Validar cierre del menu al hacer click fuera.
- Validar estado de carga durante exportacion (sin duplicar clicks).

## C) Exactitud de datos exportados
- Aplicar filtros por columnas y validar que solo salen registros visibles.
- Aplicar busqueda y validar coincidencia exacta con tabla en pantalla.
- Cambiar orden de tabla y validar mismo orden en archivo exportado.
- Ocultar/mostrar columnas (si aplica en el modulo) y validar que solo se exportan columnas visibles.
- Validar que no se exportan registros archivados/ocultos por la vista actual.

## D) Validacion Excel (.xlsx)
- Abrir el archivo y validar nombre de hoja y nombre de archivo esperado.
- Confirmar encabezados iguales a la tabla visible.
- Confirmar cantidad de filas igual a los registros visibles.
- Validar celdas de fecha como fechas (no texto plano) cuando corresponda.
- Validar tipos basicos (texto, numero, booleano) sin corrupcion.

## E) Validacion PDF
- Confirmar que el PDF incluye:
  - Nombre del modulo
  - Empresa
  - Fecha y hora de generacion
  - Encabezados
  - Datos visibles
- Validar orientacion horizontal cuando la tabla lo requiera.
- Validar legibilidad: cortes de texto aceptables, margenes y encabezados visibles.

## F) Escenarios limite
- Exportar con 0 resultados filtrados y validar archivo generado sin error.
- Exportar con campos vacios/null y validar placeholders o vacio consistente.
- Exportar con caracteres especiales y acentos.
- Exportar dataset grande y validar que no se congela la interfaz.

## G) Regresion tecnica
- Validar que exportar no modifica estado de filtros ni orden en pantalla.
- Validar que no rompe paginacion o seleccion (si aplica).
- Ejecutar npm run lint y confirmar sin errores nuevos.
- Ejecutar npm run build y confirmar compilacion exitosa.

## Evidencia minima por modulo
- Captura de pantalla de vista antes de exportar (con filtros aplicados).
- Archivo Excel generado y verificacion de encabezados/filas.
- Archivo PDF generado y verificacion de metadatos y tabla.
- Registro del rol usado en la prueba (autorizado/no autorizado).

## Criterio de aprobacion
- Se aprueba cuando Excel y PDF reflejan exactamente la vista del usuario,
  el control de acceso funciona por permisos, y lint/build no presentan fallos.
