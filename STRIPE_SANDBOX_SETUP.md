# Stripe Sandbox de Omiki

Cuenta permitida: `acct_1UIWPn3OErhJmu5v` (Entorno de prueba de OmikiGolf).
Solo se admiten claves `sk_test_`; cada servicio comprueba también el identificador de cuenta.

## Configuración

1. Guardar `STRIPE_SECRET_KEY` en los secretos de Edge Functions del proyecto
   Supabase `sjzivdhzlptxveygmpys`. Nunca usar un prefijo `VITE_` para esta clave.
2. Validar con `npm run check` y comprobar las funciones con
   `deno check --node-modules-dir=none supabase/functions/stripe-checkout/index.ts supabase/functions/stripe-webhook/index.ts supabase/functions/stripe-setup/index.ts`.
3. Revisar `npm run db:status` y aplicar individualmente, primero en simulación,
   la migración de Premium `20260922120000` y después `20260923100000`.
   No volver a aplicar versiones ya registradas.
4. Desplegar las funciones `stripe-checkout`, `stripe-webhook` y `stripe-setup`.
5. Ejecutar `node scripts/configure-stripe-sandbox.mjs`. Usa la credencial de
   despliegue solo en memoria; no muestra claves. Crea seis precios recurrentes y
   el webhook, de forma idempotente. La firma del webhook se conserva en una tabla
   privada con RLS, inaccesible a usuarios anónimos y autenticados.

| Plan | Mes | Año |
| --- | ---: | ---: |
| Player | 2,99 EUR | 28,99 EUR |
| Team | 5,99 EUR | 57,99 EUR |
| Premium | 7,99 EUR | 76,99 EUR |

Orígenes permitidos: `http://localhost:5173`, `http://127.0.0.1:5173` y
`https://golf.arinsaldev.com`. Checkout regresa al origen desde el que se inició.
El frontend local se actualiza con Vite; publicar la web del VPS es una operación
independiente mediante el flujo de despliegue del repositorio.

## Flujo y comprobaciones

Registro → confirmar correo → iniciar sesión → Continuar a Stripe → tarjeta de
prueba → regreso a Omiki. Tarjeta de prueba: `4242 4242 4242 4242`, caducidad futura
y CVC de tres cifras. La cuenta debe ser una cuenta de prueba, no un administrador.

El retorno del navegador no concede acceso por sí solo. Tanto el webhook firmado
como «Comprobar pago» consultan la suscripción directamente en Stripe, verifican
el precio y el registro y guardan el estado mediante una operación restringida al
servidor. Una factura pendiente o una cancelación no concede un plan activo.
Las notificaciones repetidas o antiguas no extienden fechas ni reactivan un plan.
Reintentar un pago abierto reutiliza la misma sesión; solo se sustituye después
de comprobar con Stripe que está caducada.

La migración impide que el navegador escriba suscripciones y desactiva el antiguo
alta automática desde los metadatos de registro. Los cambios de plan del
administrador siguen disponibles. El antiguo pago Lightning que intentaba
activar planes desde el navegador necesita verificación de servidor antes de
volver a utilizarse para suscripciones.

Las pruebas automáticas nuevas usan PGlite, no usuarios de la base compartida.
Falta verificar un pago completo con una cuenta de prueba cuando esté guardada
la clave. No se deben describir estos pasos como completados sin verificarlos.

## Estado verificado el 22/09/2026 tras retomar la sesión

- Migración `20260923100000_stripe_sandbox_checkout.sql` revisada, probada con PGlite, simulada y aplicada. Supabase confirma 48 versiones registradas y 0 migraciones nuevas pendientes.
- Las funciones `stripe-checkout`, `stripe-webhook` y `stripe-setup` figuran activas.
- La configuración aún no está completada: `configure-stripe-sandbox.mjs` recibe HTTP 401 (`Unauthorized`) de `stripe-setup`. Hay que revisar la autenticación de esa operación antes de dar el catálogo y el webhook por configurados.
- La prueba de integración recibe HTTP 503 al crear Checkout. La cuenta temporal se eliminó correctamente; no se realizó ningún pago.
- Validación: 31 pruebas de administración correctas (incluidas las de Stripe), 4 pruebas del flujo de migraciones correctas y build correcto. `typecheck` falla en `src/services/messageService.ts` (líneas 120 y 188); la prueba de historial falla por la comparación de permisos de archivo (438 frente a 448).
- No se ha publicado la web en el VPS. Sigue pendiente verificar un pago completo de prueba.

## Corrección y verificación posterior (22/09/2026)

Los bloqueos anteriores están resueltos:

- `stripe-setup` usa exclusivamente una clave secreta de servidor en `apikey`, cotejada contra `SUPABASE_SECRET_KEYS`. El script obtiene la clave completa con `--reveal`, la conserva en memoria y no la imprime. Las peticiones anónimas y las sesiones de jugadores no pueden ejecutar esta operación.
- El cliente de servidor de Stripe usa las claves actuales de Supabase. Las tres funciones se han actualizado en el proyecto remoto.
- El Sandbox tenía Managed Payments activado por defecto. Stripe rechazaba `payment_method_types`; las sesiones de esta integración especifican `managed_payments.enabled=false` para mantener Checkout estándar con tarjeta. No se cambia la configuración global de la cuenta.
- Catálogo de seis precios y webhook configurados correctamente. La configuración incluye una comprobación de disponibilidad: crea una sesión sin cliente y la caduca inmediatamente, sin realizar ningún pago.
- Prueba de integración correcta: creación de Checkout, reintento que conserva la sesión, ausencia de activación sin pago, controles de origen/autenticación y rechazo de firma de webhook falsa. Las cuentas temporales se eliminan al terminar.
- 32 pruebas de administración correctas y comprobación Deno de las tres funciones correcta. Persisten los errores ajenos a Stripe de `typecheck` en `messageService.ts` indicados arriba.
- Ya se puede probar desde la web local con una cuenta de jugador de prueba y la tarjeta `4242 4242 4242 4242`, fecha futura y CVC de tres cifras. El pago completo y la activación posterior quedan pendientes de esa prueba manual. La web del VPS no se ha publicado.

Referencias técnicas: https://supabase.com/docs/guides/functions/auth-headers y https://docs.stripe.com/payments/managed-payments/update-checkout.
