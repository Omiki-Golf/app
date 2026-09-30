# Trabajar en local — entorno principal

Desde el 16/09/2026 el ordenador local Windows es el entorno principal. Proyecto: `C:\Users\VORPC\OneDrive\Escritorio\Fede\00-LaPartideta_Test\project`; terminal PowerShell. Codespaces queda como alternativa, descrita en [CODESPACE_SETUP.md](CODESPACE_SETUP.md). La aplicación publicada y Supabase siguen siendo los mismos.

Estado del 30/09/2026: la integración está en `main` (`ceb08de`), subida a GitHub y
desplegada en el VPS. Trabajar en `main`. El respaldo original se conserva en
`backup/local-before-integration-20260930`. `npm ci`, TypeScript, pruebas y build
se han validado. `.env.local` está configurado y excluido de Git.
Leer primero el estado y los pendientes actuales en `ESTADO_TAREA.md`.

## Abrir la copia local

Abrir la carpeta local de `LaPartidetaKF` en una ventana normal de VS Code, sin conexión remota a Codespaces. Antes de actualizar una copia existente:

```powershell
git status
git fetch origin
```

Conservar cualquier cambio local. Si la copia está limpia y no hay commits divergentes, actualizar con `git merge --ff-only origin/main`. Si no existe copia, clonar `https://github.com/FedeBaezaPastor/LaPartidetaKF.git`.

Instalar Node.js 24 y ejecutar:

```powershell
npm ci
npm run dev
```

Abrir la dirección que muestra Vite, normalmente `http://localhost:5173`. En local no se necesita `dev:codespace` ni abrir puertos remotos.

## Configuración y accesos

- `.env.local` ya está configurado en este ordenador. Si se prepara otra copia, transferir el archivo de forma privada desde un entorno ya configurado. Guardarlo en la carpeta local y comprobar que Git lo excluye. No pegar su contenido en el chat ni subirlo al repositorio.
- Acceso comprobado el 30/09/2026: CLI autenticada y enlazada, 51 versiones remotas y 0 migraciones nuevas pendientes. `20260930120000_admin_metrics_premium.sql` ya está aplicada; no repetir migraciones ya registradas.
- Para configurar otro ordenador, Supabase sigue siendo `sjzivdhzlptxveygmpys`. Para consultas de migraciones desde el ordenador: `npx supabase login` y `npx supabase link --project-ref sjzivdhzlptxveygmpys`, después `npm run db:status`. Las migraciones de invitados ya aplicadas no se repiten.
- El alias local `lapartideta-vps` está configurado en `C:\Users\VORPC\.ssh\config` para `root@169.58.89.28`, con la clave propia `~/.ssh/id_ed25519`. El acceso SSH y el contenedor activo se comprobaron el 16/09/2026. No copiar la clave privada del Codespace al repositorio. Solo si la tarea pide publicar, la publicación desde terminal usa `npm run deploy -- --apply`, con el commit validado y subido a `main`.
- La web de desarrollo utiliza la base real compartida; las pruebas de escritura deben usar PGlite o datos de prueba adecuados.

Para comprobar los accesos sin aplicar migraciones ni publicar:

```powershell
npm run db:status
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 lapartideta-vps 'docker ps --filter name=lapartideta-app'
```

Las migraciones de invitados `20260918100000` y `20260919100000` ya están aplicadas y registradas; no repetirlas.

## Continuidad de la tarea y del chat

Abrir la extensión Codex en la ventana local. El historial del Codespace permanece en ese entorno: no se presume que aparezca automáticamente en el ordenador. Para retomar el trabajo, leer `AGENTS.md`, `ESTADO_TAREA.md` y `GUEST_PLAYERS_SETUP.md`; contienen el alcance y el estado verificable de la tarea.

La copia privada del historial remoto está en `/workspaces/.lapartideta-codex-history`, fuera del repositorio. Conserva conversaciones e índices, sin copiar los archivos de autenticación o las claves SSH. Permanece en el disco de ese Codespace; no sustituye una descarga antes de eliminarlo.

El chat original de invitados tiene el identificador `01a0aaf7-7d05-7be0-a18b-417d97b9e2d8` y el título antiguo «Corrige controles de locución VR». Desde una terminal del Codespace se puede abrir con:

```bash
codex resume 01a0aaf7-7d05-7be0-a18b-417d97b9e2d8
```

La sesión local guarda su propio historial. Mantener el estado importante de cada tarea en el repositorio permite continuar aunque se cambie de ordenador o de conversación.
