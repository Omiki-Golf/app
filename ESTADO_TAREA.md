# Estado para continuar — 30/09/2026

## Integración local y GitHub

- Rama de trabajo: `integrate/local-github-20260930`, basada en `origin/main` (`fac3feb`).
- Respaldo del trabajo encontrado sin commit: `backup/local-before-integration-20260930`, commit `8bc7ecc`. Conservarlo.
- Integración inicial: `b4a5780`. Incluye los cinco commits remotos de administración, catálogo y dominios, además de Premium, Stripe Sandbox, interfaz Omiki y Docker/Umbrel locales.
- `main` local se ha conservado en su posición anterior. Continuar en la rama de integración; no actualizar descartando su trabajo. No se ha subido ningún commit.
- Se corrigieron las promesas de Web Locks del buzón Express, preservando concurrencia, reintentos e identidad; Stripe admite el dominio principal mediante coincidencia exacta.
- Se conservaron métricas y opciones Premium de administración. El SQL remoto del 29/09 había eliminado Premium del listado y sus métricas: nueva corrección `20260930120000_admin_metrics_premium.sql`, sin editar migraciones históricas.
- Los archivos temporales de Supabase que seguían versionados se retiraron del índice, conservándolos en disco y excluidos de Git. `.env.local` y `.local/` siguen excluidos.

## Validación y límites

- Dependencias reinstaladas con `npm ci` y Node.js 24.11.0.
- TypeScript, 37 pruebas administrativas, 5 pruebas del flujo e historial, build y `git diff --check`: correctos. La prueba de métricas se repitió después de incorporar la corrección Premium, incluyendo la secuencia de migraciones de ambos ordenadores.
- Deno 2.5.6: las tres funciones Stripe pasan `check --frozen --node-modules-dir=none` sin modificar el lockfile.
- `npm run deploy:check`: correcto; contenedor activo, app y dominio anterior HTTP 200, raíz y www redirigen temporalmente. No publica.
- Docker Compose valida por SSH en modo `config --quiet` con variables ficticias. Docker no está instalado localmente: no se ha construido ni arrancado una imagen nueva.
- Revisión de inicio y selector de planes en navegador con componentes reales y datos simulados, bloqueando red externa. Se verificaron planes y selección Premium. El control del navegador se interrumpió al continuar al registro; la revisión visual completa de registro y administración no está terminada. Su código y pruebas automáticas sí se revisaron.
- `npm ci` informa 21 avisos de vulnerabilidad de dependencias fijadas. No se actualizaron paquetes ni se ejecutó `npm audit fix`; queda fuera de esta integración.

## Pendientes antes de publicar

1. Revisar y aplicar individualmente `20260930120000_admin_metrics_premium.sql` cuando se autorice. Ya probada con PGlite y simulada correctamente. Supabase conserva 50 versiones registradas y esta única migración nueva pendiente; no se aplicó SQL remoto.
2. Publicar la función `stripe-checkout` actualizada para los dominios nuevos y revisar el retorno de confirmación de correo indicado en `STRIPE_SANDBOX_SETUP.md`.
3. Completar registro, pago Sandbox con cuenta de prueba, webhook y activación. No se ha realizado ningún pago ni creado cuentas remotas durante esta integración.
4. Finalizar revisión visual y después integrar la rama validada en `main`, subirla y publicar únicamente cuando se autorice. El despliegue usa `docker/Dockerfile.vps`; Umbrel usa `docker/Dockerfile.umbrel`. El comando de publicación actualiza el script remoto conservando una copia anterior fuera del repositorio; consultar `DOMAIN_SETUP.md`.

## Estado histórico — 16/09/2026

Lo que sigue conserva el contexto de la transición original. Sus cifras y estado
de sincronización corresponden a esa fecha; prevalece el estado del 30/09 anterior.

## Decisiones y alcance recuperado

El usuario pidió terminar y desplegar los jugadores invitados. Tras considerar mantener Codespaces y ampliar su timeout, el 16/09/2026 decidió continuar en el ordenador local como entorno principal; Codespaces queda como alternativa. Se recuperó el chat original desde el historial del Codespace; su título antiguo es «Corrige controles de locución VR», identificador `01a0aaf7-7d05-7be0-a18b-417d97b9e2d8`.

La casilla «Invitado: solo juega esta partida» debe empezar desmarcada. Sin marcar crea una ficha habitual sin cuenta; marcada crea una ficha reutilizable de invitado. Solo un administrador puede elegir «Incorporar al grupo» para convertir un invitado existente. La incorporación afecta a participaciones futuras, no al historial. Las fichas no crean cuentas ni conceden acceso.

## Jugadores invitados

- Implementados alta y selección mediante RPC atómico, etiquetas de invitados y archivo completo de las partidas.
- Los invitados juegan y aparecen en la clasificación de la partida y en el historial. Se excluyen de estadísticas, premios, cervezas y ajustes automáticos de hándicap del grupo.
- Los resultados archivados conservan identidad y condición de invitado; la vista estadística recalcula posiciones entre los habituales. Se soportan partidas y días con solo invitados.
- Migraciones `20260918100000_group_guest_players.sql` y `20260919100000_guest_creation_choices.sql` aplicadas y registradas. La segunda conserva el permiso habitual de alta para usuarios que pueden registrar resultados; incorporar una ficha existente sigue requiriendo administrador. El historial remoto tiene 46 versiones. No se ha reproducido ni modificado el historial SQL antiguo.
- Validación: TypeScript, 22 pruebas administrativas con PGlite, 5 pruebas del flujo e historial, compilación y `git diff --check`. No se escribieron datos de prueba en Supabase.
- Primera publicación verificada: commit `7fa0144`, contenedor activo, HTML y JavaScript HTTP 200. Corrección de la casilla e incorporación explícita publicada en el commit `4ded669`: contenedor activo sin reinicios, HTML y JavaScript HTTP 200, textos y RPC nuevos verificados en el JavaScript servido.
- Detalles en `GUEST_PLAYERS_SETUP.md`.

## Entorno principal local y alternativa Codespaces

Proyecto local: `C:\Users\VORPC\OneDrive\Escritorio\Fede\00-LaPartideta_Test\project`, Windows/PowerShell, Node.js `v24.11.0`. Copia sincronizada con `origin/main`; `npm ci` y `npm run build` correctos. `.env.local` configurado y excluido de Git. La web funciona en `http://localhost:5173`, con inicio de sesión y acceso al grupo comprobados por el usuario.

Accesos locales comprobados el 16/09/2026:

- Supabase CLI autenticada y enlazada a `sjzivdhzlptxveygmpys`. `npm run db:status`: 46 versiones remotas, 0 migraciones nuevas pendientes. El enlace en `supabase/.temp/` está excluido de Git.
- SSH con clave propia del ordenador `~/.ssh/id_ed25519`; alias `lapartideta-vps` en `C:\Users\VORPC\.ssh\config`, destino `root@169.58.89.28`. Consulta de Docker correcta y contenedor `lapartideta-app` activo.
- No se aplicaron migraciones ni se desplegó durante estas comprobaciones. El árbol de Git estaba limpio antes de esta actualización documental.

Como alternativa, el Codespace `glowing-space-system-rpw7rr56pv3xq4q` en `/workspaces/LaPartidetaKF` tenía timeout de 30 minutos en la última comprobación. GitHub permite hasta cuatro horas para entornos nuevos, pero seguirá pudiendo suspenderlos. La petición anterior de ampliar el timeout a cuatro horas queda como contexto histórico, no como siguiente paso de la sesión local. La API consultada entonces mostraba 30 minutos; el cambio no está realizado. GitHub documenta la preferencia de 240 minutos para entornos nuevos. No se ha reiniciado ni reconstruido este entorno durante la recuperación.

Se localizaron cinco conversaciones guardadas en `~/.codex`; el chat anterior no se había borrado del disco. No se reprodujo el fallo por el que la interfaz abrió otra conversación.

Se inició una copia privada del historial cada 60 segundos en `/workspaces/.lapartideta-codex-history`, fuera del repositorio. Se conservan dos copias, con backup consistente de SQLite, conversaciones e índices. No se copian archivos de autenticación ni claves SSH. Descargar la copia antes de eliminar el Codespace: reside en su mismo disco.

La configuración del entorno, scripts de migración y despliegue, dependencias fijadas y documentación recuperados se conservaron. Los secretos siguen fuera de Git. Pasos para continuar en el ordenador en `LOCAL_SETUP.md`; funcionamiento remoto en `CODESPACE_SETUP.md`.

## Siguiente paso

Continuar el trabajo desde el ordenador local siguiendo `AGENTS.md` y `LOCAL_SETUP.md`. La tarea de invitados está terminada y publicada, y los accesos locales ya están preparados. No quedan migraciones nuevas pendientes en la última comprobación. No repetir las migraciones de invitados ni desplegar salvo que una tarea posterior lo requiera explícitamente. Codespaces queda disponible como alternativa según `CODESPACE_SETUP.md`; no se ha creado, eliminado ni reconfigurado ningún Codespace durante la transición local.
