# Codespaces — entorno alternativo

**Decisión actual del 16/09/2026:** trabajar principalmente en el ordenador local Windows según [LOCAL_SETUP.md](LOCAL_SETUP.md). Codespaces queda como alternativa. La copia local, la web de desarrollo y los accesos a Supabase y al VPS ya están comprobados. Las migraciones de invitados están aplicadas y la tarea publicada; no repetirlas ni desplegar para cambiar de entorno.

## Suspensión e historial

El Codespace tenía un timeout de **30 minutos** en la última comprobación del 16/09/2026. La petición anterior de ampliarlo a cuatro horas queda como contexto histórico; no es un paso pendiente para continuar en local. La API pública de actualización no permite cambiar ese campo; no se ha aumentado. GitHub permite configurar entre 5 y 240 minutos para Codespaces nuevos, pero mantiene la suspensión por inactividad: no ofrece aquí una configuración para funcionar siempre sin «Start».

Las cinco conversaciones recuperadas el 16/09/2026 siguen en `~/.codex`. La desconexión no borró esos archivos; no se ha podido reproducir por qué la interfaz no abrió el chat anterior.

`npm run history:backup` inicia una copia silenciosa cada 60 segundos en `/workspaces/.lapartideta-codex-history`, fuera del repositorio, con la última copia y la anterior. SQLite se copia con su API de backup para incluir escrituras confirmadas en WAL. No se copian `auth.json`, configuración de autenticación ni claves SSH. Este proceso no evita la suspensión del Codespace.

La configuración de Dev Container instala Codex y arranca la copia al iniciar el entorno. Si, tras reconstruirlo, el directorio del historial está vacío y conserva la misma ruta, restaura la copia antes de arrancar el proceso. La recuperación manual (`npm run history:restore`) rechaza sobrescribir un historial existente. Cerrar Codex antes de una recuperación manual. Durante la recuperación del 16/09/2026 no se reinició ni reconstruyó el Codespace para evitar interrumpir la sesión remota.

La copia reside en el mismo disco persistente del Codespace: descargarla antes de eliminarlo. Las credenciales deberán configurarse por separado tras una reconstrucción.

Referencias: [timeout de Codespaces](https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces), [archivos persistentes durante una reconstrucción](https://docs.github.com/en/codespaces/developing-in-a-codespace/rebuilding-the-container-in-a-codespace), [reanudar una sesión de Codex](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

Si se necesita la alternativa remota, abrir en VS Code el Codespace existente **glowing-space-system-rpw7rr56pv3xq4q**. La carpeta remota es `/workspaces/LaPartidetaKF` y la terminal es Linux/Bash. Los equipos conectados a ese Codespace acceden a la misma carpeta y herramientas.

## Abrir la web de desarrollo

En Terminal → Nueva terminal:

```bash
npm run dev:codespace
```

En la pestaña **Puertos / Ports** de VS Code, abrir el puerto **5173** en el navegador. Mantener su visibilidad privada. Si no aparece, añadir el puerto 5173 desde esa pestaña. Si ya hay un servidor escuchando, abrir su puerto en lugar de iniciar otro.

La configuración está en `.env.local` y usa la URL y la clave pública del mismo proyecto Supabase que producción. La base de datos es compartida: los cambios hechos desde la web de desarrollo afectan a los datos reales. Los inicios de sesión del navegador de cada equipo siguen siendo independientes.

## GitHub

Repositorio: `Omiki-Golf/app`. Los archivos del Codespace se comparten entre los equipos conectados a ese mismo entorno. La copia local es independiente: sincronizar los commits mediante Git antes de cambiar de entorno y conservar cualquier trabajo pendiente. GitHub guarda los commits que se suben; no sustituye guardar y confirmar el trabajo.

Antes de traer cambios de otras herramientas:

```bash
git status
git fetch origin
```

Con la copia limpia y sin commits divergentes, `git merge --ff-only origin/main` actualiza sin crear una mezcla automática. Con trabajo pendiente, revisarlo antes de sincronizar.

## Migraciones de Supabase

Supabase CLI está fijado en `package.json` y `package-lock.json`. En la última comprobación, el Codespace estaba autenticado y vinculado a **La Partideta K&F_01**, referencia `sjzivdhzlptxveygmpys`.

```bash
npm run db:status
# Primero, revisar el SQL y simular un archivo NUEVO:
npm run db:migrate -- supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql
# Para aplicar ese archivo revisado:
npm run db:migrate -- supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql --apply
```

Las versiones nuevas deben ser únicas y posteriores a `20260917100000` y al historial remoto. Se procesan en orden. El comando rechaza repetir una versión registrada o ejecutar archivos históricos; sin `--apply` solo simula. Usa el CLI oficial para aplicar y registrar la migración seleccionada. No es un servicio automático que ejecute SQL al guardar archivos o al subir commits.

Las migraciones de invitados `20260918100000_group_guest_players.sql` y `20260919100000_guest_creation_choices.sql` ya están aplicadas y registradas. La comprobación desde local del 16/09/2026 confirma 46 versiones remotas y 0 migraciones nuevas pendientes. Cambiar de entorno no requiere aplicar SQL.

### Auditoría de partida (15/09/2026)

- 238 archivos SQL locales, con 229 versiones distintas.
- 44 versiones registradas remotamente: 43 coinciden con archivos locales y una solo aparece en Supabase (`20260729182230`).
- 195 archivos locales sin una entrada con su versión en el historial remoto. Esto **no** significa que estén pendientes: hay ejecuciones manuales, versiones duplicadas e importaciones antiguas.
- Los cuerpos de las **71 funciones más recientes definidas por las migraciones de septiembre** coinciden con Supabase tras normalizar espacios y comentarios de línea. Incluyen la última migración de miembros y hándicaps. También se consultaron tablas y columnas actuales; las tablas y funciones declaradas en las migraciones de septiembre existen.
- Se conservó una exportación del esquema `public`, sin filas de usuarios, en `.local/backups/supabase-public-20260915.sql` (excluida de Git). Es una referencia del esquema, **no una copia completa de seguridad de la base**.
- No se modificó el historial remoto ni se volvieron a ejecutar las migraciones antiguas. No se certifica retrospectivamente cada importación de datos o cada versión histórica intermedia.

El flujo nuevo toma el estado actual como punto de partida y mantiene intactos los registros existentes. En su carpeta temporal incluye marcadores para esas versiones registradas y solamente el archivo nuevo seleccionado. Así se evitan los falsos pendientes de la carpeta histórica. La reconstrucción completa de una base vacía desde todos los scripts históricos queda fuera de este flujo; no usar `db reset --linked` ni un `db push` directo de toda la carpeta.

## VPS

```bash
ssh lapartideta-vps
```

Alias: `root@169.58.89.28`; carpeta `/var/www/miapp`; contenedor `lapartideta-app`. El Codespace tiene su propia clave SSH autorizada. La clave privada permanece en `~/.ssh/`, fuera de Git.

El despliegue remoto existente es `/var/www/miapp/deploy.sh`: descarga `main`, compila y reinicia el contenedor. Solo ejecutarlo cuando la tarea incluya publicar una versión validada y subida a `main`; el flujo principal documentado es `npm run deploy -- --apply`. Para comprobar acceso basta consultar `docker ps` por SSH. Cambiar de entorno no requiere desplegar.

## Pruebas

```bash
npm run typecheck
npm run test:admin
npm run test:workflow
npm run build
```

Las pruebas administrativas usan PostgreSQL embebido (PGlite) y no escriben en Supabase. Las pruebas del flujo comprueban el bloqueo de históricos, versiones repetidas y orden incorrecto, y el contenido de la carpeta temporal.

## Si se crea o reconstruye otro entorno

Las credenciales no viajan por Git. Ejecutar `npm ci`, volver a iniciar sesión con `npx supabase login`, vincular con `npx supabase link --project-ref sjzivdhzlptxveygmpys`, configurar `.env.local` y autorizar una clave SSH propia. Los accesos descritos aquí estaban preparados en el Codespace existente en la última comprobación; verificarlos al retomarlo. Cada entorno conserva sus propios secretos y claves.

Documentación oficial: [historial de migraciones de Supabase](https://supabase.com/docs/guides/deployment/database-migrations), [referencia de db push](https://supabase.com/docs/reference/cli/supabase-db-push).
