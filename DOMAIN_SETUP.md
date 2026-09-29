# Dominio de Omiki Golf

La web sigue alojada en el VPS 169.58.89.28. cdmon gestiona el dominio y DNS:

- `omikigolf.com`: A hacia `169.58.89.28`, TTL 900.
- `www`: CNAME hacia `omikigolf.com`, TTL 900; nginx redirige a HTTPS sin www.
- `golf.arinsaldev.com` permanece disponible durante la transición.

El flujo habitual sigue siendo `npm run deploy -- --apply`, desde main validada y subida.
El servidor usa `/var/www/miapp/deploy.sh`, instalado desde `scripts/vps/deploy.sh`.
Ese script copia la configuración versionada `scripts/vps/nginx.conf` antes de construir
la imagen. Los tres dominios están en VIRTUAL_HOST y LETSENCRYPT_HOST; el proxy y
el servicio de certificados Docker existentes gestionan HTTPS y renovación.
No editar la configuración generada del proxy ni reiniciar otros servicios del VPS.

Supabase conserva los usuarios y datos existentes. Site URL y APP_ORIGIN deben ser
`https://omikigolf.com`. APP_ALLOWED_ORIGINS contiene
`https://golf.arinsaldev.com,https://omikigolf.com` (coincidencia exacta, sin comodines).
Los retornos autorizados incluyen la raíz y las query strings `email-confirmed=1`,
`auth-action=recovery`, `admin-action=setup` y `admin-action=recovery` del dominio nuevo;
se conservan las entradas antiguas. El helper compartido requiere desplegar
admin-auth, admin-management y express-messages cuando se modifica.

La copia anterior de Dockerfile, nginx.conf, deploy.sh y la configuración del contenedor
se guarda fuera del repositorio en `/root/omiki-domain-backup-20260929`.
Para revertir el cambio de dominio, restaurar esos archivos y el contenedor con la
configuración anterior, Site URL y APP_ORIGIN antiguos, y retirar únicamente los dos
registros DNS nuevos. No tocar DNSSEC, servidores DNS ni correo.

Verificar HTTPS en ambos dominios, redirección de www con ruta/query, login y preflight
de las tres funciones en ambos orígenes. Los orígenes ajenos deben recibir 403.
