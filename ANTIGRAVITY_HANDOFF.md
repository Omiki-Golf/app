# Informe de traspaso a Antigravity

Fecha: 31/10/2026. Proyecto: La Partideta K&F / Omiki Golf.

## Entorno y fuentes

- Windows local, PowerShell, proyecto `C:\Users\user\Desktop\Trabajo\La Partideta KF\project`.
- Repositorio GitHub: `Omiki-Golf/app`, rama `main`. Leer `AGENTS.md` y `LOCAL_SETUP.md` antes de trabajar.
- Frontend React 18, TypeScript y Vite 5; Tailwind con colores semánticos definidos en `src/index.css` y `tailwind.config.js`. Backend Supabase.
- Node.js 24; dependencias fijadas mediante `npm ci`; desarrollo con `npm run dev`, normalmente en `http://localhost:5173`.
- `.env.local` contiene la configuración local y está excluido de Git. No copiar secretos, credenciales ni respaldos al repositorio o a informes.
- La aplicación local conecta con la base real compartida. Para pruebas con escrituras, usar PGlite o cuentas/datos de prueba apropiados.

## Estado comprobado antes de esta publicación

- Local, `origin/main` tras `git fetch` y VPS coincidían en `97847bc`.
- Solo había cambios locales en `Scorecard.tsx`, `HoleCard.tsx` y `HandshakeModal.tsx`, correspondientes a las peticiones de este chat.
- Supabase `sjzivdhzlptxveygmpys`: 84 versiones remotas, 0 migraciones nuevas pendientes, comprobado con `npm run db:status`.
- El estado de septiembre y la preparación del 27/10 en `ESTADO_TAREA.md` y `SCORE_PERMISSIONS_REVIEW.md` son históricos. No asumir que la migración de propietarios sigue pendiente: el estado remoto actual no tiene migraciones pendientes.
- VPS: `/var/www/miapp`, alias SSH `lapartideta-vps`, contenedor `lapartideta-app` activo. Había tres archivos sin seguimiento propios del despliegue: `Dockerfile`, `deploy.sh`, `nginx.conf`; conservarlos.
- Web principal: https://app.omikigolf.com ; dominio anterior: https://golf.arinsaldev.com .
- Versión de producto declarada: 1.6.1. Estos ajustes no cambian ese número; identificar el despliegue por el commit.

## Cambios de este traspaso

1. `src/components/Scorecard.tsx`: en la tabla de golpes, Match muestra los hoyos ganados acumulados por cada jugador. Empate = `AS`; ejemplo solicitado: `AS`, `0-1`, `AS`. Los hoyos empatados no incrementan los contadores de hoyos ganados. No confundir esta presentación con el total de puntos de modalidad, donde un empate puede asignar 0,5 a cada jugador.
2. La fila de marcador no considera completado un hoyo sin golpes introducidos; acepta la raya/abandono. Parejas conserva sus puntos acumulados y usa coma decimal, por ejemplo `1,5-2,5`. Las etiquetas llevan cifras tabulares, tamaño compacto y no saltan de línea.
3. `src/components/HoleCard.tsx`: paleta compartida para bolas e iniciales: azul, naranja vivo y amarillo. Iniciales blancas sobre azul y oscuras sobre naranja/amarillo; bordes claros para el fondo oscuro. El color conserva el índice original del jugador aunque Sindicato ordene el marcador por puntos; Parejas identifica por equipo.
4. `src/components/HandshakeModal.tsx`: el nombre del ganador usa `text-ink`, que adapta el texto al tema. Antes tenía un verde oscuro fijo, ilegible sobre el modo oscuro. Afecta a la ventana «Partida decidida» de Match, Sindicato y Parejas.

Preferencia expresa del usuario: los colores asignados a jugadores/equipos deben distinguirse claramente, y los nombres/resultados deben leerse tanto en modo claro como oscuro.

## Validación realizada

- `npm run typecheck` y `npm run build`: correctos tras la última corrección.
- `npm run test:admin`: 155 pruebas correctas tras los ajustes de marcador/paleta, antes del cambio final de una clase de color del ganador.
- Contraste calculado del nombre sobre `accent-soft`: 16,15:1 en claro y 13,58:1 en oscuro, usando los valores reales de `src/index.css`.
- `git diff --check`: correcto. `.env.local`, `.local/` y archivos nuevos de `supabase/.temp/` excluidos.
- El flujo `npm run deploy -- --apply` vuelve a ejecutar tipos, pruebas administrativas, pruebas del flujo y compilación antes de publicar; comprobar el resultado de la ejecución y la versión remota para confirmar el despliegue.
- Vite muestra avisos de tamaño de paquete e importación estática/dinámica de Supabase; no impiden compilar.
- No se ha hecho una revisión visual completa de estos tres cambios en móviles reales. Las capturas del usuario corresponden al comportamiento anterior.

## Qué probar ahora

1. Recargar la web publicada y comprobar Match con empate, victoria del segundo y victoria del primero: `AS`, `0-1`, `AS`. Un hoyo incompleto debe mostrar `-`; corregir un hoyo anterior debe actualizar los siguientes acumulados.
2. Parejas: revisar un resultado con medios puntos, incluido `1,5-2,5`, en pantalla estrecha y con desplazamiento horizontal de la tabla.
3. Sindicato: distinguir las tres bolas; al cambiar las posiciones por puntos, cada jugador debe conservar su color.
4. Provocar una «Partida decidida» en Sindicato con datos de prueba y verificar el nombre del ganador en claro y oscuro. Comprobar también Match y Parejas.
5. Continuar anotando tras el resultado decidido y confirmar que el resultado oficial guardado no cambia.

## Trabajo reciente ya incluido en la base del proyecto

Consultar `git log` para el detalle. Los commits anteriores incluyen: credenciales Express y propietarios verificados; edición mediante código de partida; códigos guardados por cuenta; resultados de participantes aceptados en solo lectura; invitaciones a cuentas durante una partida; partidas abiertas por código en la lista de partidas en curso; mejoras de caché, navegación y recarga ante recursos antiguos.

## Reglas para continuar

- Revisar `git status` y el remoto antes de sincronizar; preservar el trabajo del usuario.
- No aplicar SQL histórico en bloque, no usar `supabase db push` sobre toda la carpeta ni `db reset --linked`. Consultar `npm run db:status`; una migración nueva debe revisarse y seleccionarse con `npm run db:migrate -- supabase/migrations/ARCHIVO.sql`, primero en simulación.
- No cambiar fórmulas ni permisos para resolver problemas visuales.
- Publicar solo cuando se solicite, con los commits validados y subidos a `main`, mediante `npm run deploy -- --apply`.
- No dar por publicado un cambio solo por estar en GitHub: comprobar que el despliegue termina, el contenedor está activo, el commit del VPS coincide y las webs responden.
- El usuario quiere probar ahora con Antigravity. Este informe no encarga cambios adicionales ni autoriza nuevas migraciones o limpiezas de datos.
