# La Partideta en Umbrel con Docker Compose

Estos archivos permiten ejecutar la web desde la terminal del equipo Umbrel.
`docker/Dockerfile.umbrel` y `docker/nginx.conf` son para este uso. El VPS usa
`docker/Dockerfile.vps` con `scripts/vps/nginx.conf`, que conserva los dominios
y redirecciones de producción. No intercambiar las dos configuraciones.
La instalacion manual no registra un icono en la tienda ni en el escritorio de
Umbrel. La integracion como app de la tienda requiere un paquete adicional;
consulta la [documentacion oficial](https://github.com/getumbrel/umbrel-apps).

## Instalacion

1. Copia esta carpeta de proyecto a una carpeta persistente del equipo Umbrel.
   Incluye `src`, `public`, los archivos de configuracion, `package.json`,
   `package-lock.json`, `docker/Dockerfile.umbrel`, `.dockerignore`, `docker-compose.yml`
   y `docker/nginx.conf`. No necesitas copiar `node_modules` ni `dist`.
   Usa esta copia local si quieres incluir los cambios aun no subidos a Git.
2. Transfiere de forma privada tu `.env.local` a esa carpeta, o crea uno con:

   ```dotenv
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
   LAPARTIDETA_PORT=8090
   ```

   Utiliza la URL y la clave publica del proyecto Supabase existente para
   conservar sus cuentas y datos. No uses una clave `service_role`.
3. Abre una terminal en esa carpeta del equipo Umbrel y ejecuta:

   ```sh
   docker compose --env-file .env.local config --quiet
   docker compose --env-file .env.local up -d --build
   docker compose --env-file .env.local ps
   ```

   Si tu usuario necesita permisos para Docker, antepon `sudo` a los comandos.
4. Abre `http://umbrel.local:8090` o `http://IP_DE_TU_UMBREL:8090`.
   Si el puerto esta ocupado, cambia `LAPARTIDETA_PORT` y repite el arranque.

## Configuracion y datos

- Node.js 24 compila la web dentro de Docker; Nginx sirve el resultado.
  Las imagenes base admiten equipos ARM64 y AMD64, sin fijar una arquitectura.
- Las dos variables de Supabase se incorporan al JavaScript al compilar.
  Si las cambias, repite `up -d --build`; reiniciar no basta.
- `.env.local` queda fuera del contexto de Docker. Compose pasa explicitamente
  solo las dos variables publicas necesarias para Supabase.
- La base de datos, autenticacion y funciones siguen en Supabase. Este Compose
  no instala un Supabase local ni aplica migraciones. Las escrituras de la web
  afectan al proyecto configurado, igual que la web actual.
- Los pagos siguen dependiendo de los servicios externos del proyecto. El codigo
  existente de Lightning incluye una credencial BTCPay en el frontend; Docker no
  la oculta. Este Compose no configura otro BTCPay ni un nodo Lightning de Umbrel.
- Para enlaces de autenticacion, revisa las URL de redireccion autorizadas en
  Supabase si utilizas una direccion nueva. Los retornos y webhooks de pagos
  necesitan su configuracion propia y no se reconfiguran con este Compose.
- El puerto se publica en la red del equipo. Esta instalacion manual usa el
  acceso propio de la aplicacion y no pasa por el proxy de autenticacion Umbrel.
  Para acceso publico con funciones que requieran HTTPS, configura un proxy HTTPS.

## Mantenimiento

```sh
# Consultar errores
docker compose --env-file .env.local logs --tail=100 web

# Reconstruir despues de copiar una nueva version del codigo
docker compose --env-file .env.local up -d --build

# Detener la web (los datos de Supabase permanecen alli)
docker compose --env-file .env.local down
```

No pegues unicamente el YAML en un gestor de stacks: `build.context: .` necesita
tambien el codigo y los archivos indicados en la misma carpeta del servidor.
