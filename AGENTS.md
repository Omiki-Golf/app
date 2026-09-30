# Entorno de trabajo

- Entorno principal: ordenador local Windows, proyecto `C:\Users\VORPC\OneDrive\Escritorio\Fede\00-LaPartideta_Test\project`. La terminal es PowerShell.
- Guía principal: `LOCAL_SETUP.md`. Codespaces es una alternativa; consultar `CODESPACE_SETUP.md` si se trabaja allí.
- Usar Node.js 24, instalar las dependencias fijadas con `npm ci` y arrancar con `npm run dev` (normalmente `http://localhost:5173`). En Codespaces usar `npm run dev:codespace`.
- Las variables públicas de la web están en `.env.local`, excluido de Git. Mantener credenciales, claves SSH y copias de seguridad fuera del repositorio.
- GitHub: `FedeBaezaPastor/LaPartidetaKF`, rama habitual `main`. Comprobar cambios locales y remotos antes de sincronizar; conservar el trabajo del usuario.

## Supabase

- Destino existente: `sjzivdhzlptxveygmpys` (La Partideta K&F_01). CLI autenticada y enlazada; comprobación del 30/09/2026: 51 versiones remotas y 0 migraciones nuevas pendientes (`20260930120000_admin_metrics_premium.sql` ya aplicada). No confundir archivos locales con migraciones ya publicadas.
- Jugadores invitados ya publicados: migraciones `20260918100000_group_guest_players.sql` y `20260919100000_guest_creation_choices.sql` aplicadas y registradas. No repetirlas.
- `npm run db:status` consulta las migraciones nuevas. `npm run db:migrate -- supabase/migrations/ARCHIVO.sql` muestra una simulación; añadir `--apply` aplica ese archivo y registra la versión.
- Revisar y probar el SQL antes de aplicar. Una migración nueva debe tener una versión única posterior a `20260917100000` y a las versiones remotas.
- El historial antiguo contiene ejecuciones manuales, importaciones duplicadas y versiones repetidas. Los archivos hasta `20260917100000` se conservan como referencia histórica y quedan fuera del flujo nuevo. Su exclusión no afirma que cada archivo se ejecutara literalmente.
- No ejecutar `supabase db push` directamente sobre toda la carpeta histórica, ni `db reset --linked`, ni registrar en bloque los archivos antiguos como aplicados. Si hay que corregir un comportamiento histórico, crear una migración nueva revisada.
- La simulación usa archivos temporales que representan las versiones ya registradas remotamente y copia solo la migración nueva seleccionada. No modifica el historial previo.
- La web local utiliza la base compartida real: las pruebas que escriben datos deben usar las pruebas locales con PGlite o cuentas/datos de prueba adecuados.

## VPS

- Alias SSH local: `lapartideta-vps` (`root@169.58.89.28`), configurado en `C:\Users\VORPC\.ssh\config` con la clave propia `~/.ssh/id_ed25519`. Acceso comprobado el 16/09/2026: contenedor activo. Codespaces usa su propia clave `~/.ssh/id_ed25519_lapartideta_vps`.
- Aplicación en `/var/www/miapp`, contenedor `lapartideta-app`, web principal `https://app.omikigolf.com`; `https://golf.arinsaldev.com` sigue operativo. Ver `DOMAIN_SETUP.md`. Dockerfiles separados para VPS y Umbrel dentro de `docker/`.
- Consultar estado: `ssh -o BatchMode=yes lapartideta-vps 'docker ps --filter name=lapartideta-app'`.
- Solo cuando la tarea incluya publicar: validar el código, confirmar y subir los commits destinados a producción, y ejecutar `npm run deploy -- --apply`. `npm run deploy:check` valida sin publicar. El script remoto `/var/www/miapp/deploy.sh` descarga `main` y reinicia el contenedor.
- Para comprobar accesos o continuar en local no aplicar migraciones ni desplegar. No usar `local-deploy.ps1` como flujo principal; usar los scripts npm del repositorio.

## Validación

- Código: `npm run typecheck`, `npm run test:admin`, `npm run build`.
- Flujo de migraciones: `npm run test:workflow` y `npm run db:status`.
- Git: `git diff --check`; confirmar que `.env.local`, `.local/` y los nuevos archivos de `supabase/.temp/` están excluidos.
