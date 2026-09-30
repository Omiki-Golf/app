# Dominios de Omiki Golf

La aplicación sigue alojada en el VPS 169.58.89.28. cdmon gestiona dominio y DNS:

- app.omikigolf.com: A hacia 169.58.89.28, TTL 900; dirección principal.
- omikigolf.com: A hacia 169.58.89.28, TTL 900.
- www: CNAME hacia omikigolf.com, TTL 900.
- Raíz y www redirigen con HTTP 307 y Cache-Control no-store a HTTPS en app, conservando ruta y query. El navegador conserva el fragmento al no incluir uno en Location.
- golf.arinsaldev.com permanece operativo. No se modifica correo, DNSSEC ni servidores DNS.

Cuando exista la web pública, www dejará de redirigir. Ahora no hay una segunda web.
Las sesiones están aisladas por origen; puede ser necesario entrar de nuevo en app.

## Publicación

Se mantiene `npm run deploy -- --apply`, desde main validada y subida a GitHub.
El servidor usa `/var/www/miapp/deploy.sh`, instalado desde `scripts/vps/deploy.sh`.
Este compila la web con el entorno privado del VPS y construye la imagen mediante
`docker/Dockerfile.vps`, que incorpora `dist` y `scripts/vps/nginx.conf`.
`docker/Dockerfile.umbrel` corresponde al despliegue independiente en Umbrel.
Los cuatro dominios
figuran en VIRTUAL_HOST y LETSENCRYPT_HOST; el proxy Docker y su servicio de
certificados gestionan HTTPS y renovación. No editar la configuración generada del
proxy ni reiniciar otros servicios. El check verifica app, el dominio antiguo y
ambas redirecciones temporales.

La integración local del 30/09/2026 cambia el Dockerfile utilizado por el script.
Cuando se autorice publicar, `npm run deploy -- --apply` descarga `main`, guarda
el script anterior en `/root/omiki-deploy-before-FECHA.sh` e instala la versión
integrada de `scripts/vps/deploy.sh` en `/var/www/miapp/deploy.sh` antes de ejecutarla.
El script remoto antiguo utiliza un Dockerfile no versionado en la raíz. Se
conserva ese archivo: ambos Dockerfiles nuevos están en `docker/` para evitar
colisiones al actualizar el repositorio. Esta
actualización del servidor no se ha realizado durante la integración local.

## Supabase

Se conservan usuarios y datos. Site URL y APP_ORIGIN: https://app.omikigolf.com.
APP_ALLOWED_ORIGINS: https://golf.arinsaldev.com,https://omikigolf.com.
APP_ORIGIN también se autoriza por coincidencia exacta; sin comodines CORS.
Los retornos permitidos añaden la raíz de app y las query strings email-confirmed=1,
auth-action=recovery, admin-action=setup y admin-action=recovery.
Se conservan las entradas anteriores para enlaces ya enviados. Las funciones usan
APP_ORIGIN para nuevos enlaces administrativos; el cliente utiliza su origen actual.

## Verificación y reversión

Validar HTTPS, recursos, login y persistencia de sesión en app; HTTP 200 en el dominio
antiguo; HTTP 307 del raíz y www conservando ruta, query y fragmento en navegador.
Verificar preflight y solicitudes de las tres funciones para orígenes permitidos y
rechazo 403 de orígenes ajenos. No enviar correos reales para pruebas automáticas.

Copia previa al cambio a app: `/root/omiki-app-backup-20260929`, fuera del repositorio,
con Dockerfile, nginx.conf, deploy.sh, inspección del contenedor y commit anterior.
Para revertir, publicar el commit previo guardado, restaurar el script remoto y
su configuración de contenedor, y devolver Site URL y APP_ORIGIN a
https://omikigolf.com; APP_ALLOWED_ORIGINS mantiene los valores anteriores.
Las entradas añadidas de retorno y DNS app se pueden conservar durante la revisión;
no retirar registros ajenos. La copia de la primera transición sigue en
`/root/omiki-domain-backup-20260929`.
