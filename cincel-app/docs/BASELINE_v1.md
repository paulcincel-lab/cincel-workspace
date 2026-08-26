# BASELINE v1

## Fecha
- 2026-07-29

## Referencias
- Commit base estable: b4dadf7
- Tag: v1.0.0
- Rama release: release/v1.0

## Estado del proyecto
- Estado funcional estable para operación interna.
- Build de producción exitoso con Next.js 16.2.10.
- Árbol de trabajo limpio al momento del commit de baseline.

## Funcionalidades incluidas
- Rediseño y ajustes de interfaz en Dashboard, Clientes, Equipo, Proyectos y Actividades.
- Calendario unificado con agenda diaria y control de visibilidad por perfil.
- Endurecimiento de reglas de acceso para cuentas administrativas en Equipo.
- Control de acceso por rol en navegación y rutas de Configuración.
- Mejoras en flujo de exportación y consistencia visual de controles.
- Ajustes de login y mensajes de soporte para recuperación de acceso.

## Funcionalidades pendientes
- Integrar suite formal de pruebas automatizadas (actualmente no hay script test).
- Definir pipeline CI/CD con validación obligatoria de build y lint en PR.
- Revisar política de artefactos grandes en repositorio para evitar bloqueos de push.

## Cómo volver a este punto
1. Obtener referencias remotas:
   - git fetch --all --tags
2. Ir al baseline por rama:
   - git checkout release/v1.0
3. O ir por tag exacto:
   - git checkout tags/v1.0.0
4. Verificar estado:
   - npm install
   - npm run build
