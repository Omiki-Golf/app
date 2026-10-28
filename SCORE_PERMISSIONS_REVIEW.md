# Permisos de puntuaciones — preparación local

## Estado — 27/10/2026

Implementación preparada en `20261028100000_verified_round_owners.sql`, sin aplicar.
Producción mantiene sus permisos actuales hasta una publicación coordinada.
La auditoría remota confirmó 79 migraciones registradas y una sola nueva pendiente.
La simulación selecciona únicamente este archivo; no reejecuta el historial antiguo.

## Comportamiento preparado

- Cuenta registrada: el servidor usa `auth.uid()`, nunca el identificador que envía el cliente.
- Express nuevo: credencial privada de 32 bytes, guardada antes de enviarla. El servidor asigna
  un identificador nuevo y guarda únicamente SHA-256 de la credencial. Registro idempotente.
- La credencial viaja solo por HTTPS en la cabecera `x-omiki-express-secret` hacia REST de
  nuestro Supabase. No se añade a Auth, funciones Edge ni dominios externos. La preconsulta
  CORS de producción acepta la cabecera. La tabla de credenciales no tiene acceso público.
- Solo el creador verificado escribe golpes y finaliza. Puede corregir resultados completados;
  archivados, cancelados, eliminados o retirados quedan sin edición. Los participantes conservan
  la consulta. Se mantienen las restricciones de cuenta de solo lectura.
- INSERT, UPDATE y DELETE directos también pasan los guardas. No se pueden cambiar propietario,
  grupo, referencia de creador o identidad del resultado para eludirlos. Las operaciones de
  administración, archivo de grupo y baja de cuenta conservan sus vías controladas.
- El golpe y los puntos recalculados de los demás jugadores del hoyo se guardan juntos, en una
  transacción. Se conservan las fórmulas de Stableford, Match, Sindicato y Parejas y el resultado
  oficial congelado. Un archivo concurrente no deja medio hoyo actualizado.
- El servidor comprueba el límite de cuatro Express bajo bloqueo de la identidad. Cuenta igual
  que antes: partidas sin grupo y no retiradas por administración, incluso si están eliminadas.
  Esto no pretende impedir obtener otra identidad al borrar todo el almacenamiento del navegador.
- Traslado de Express nuevas a una cuenta: requiere la credencial, es atómico e idempotente y
  deja esa credencial retirada permanentemente, incluso si después se elimina la cuenta.
  La antigua reclamación basada solo en `anon_<UUID>` queda deshabilitada.
- Un rechazo del servidor se muestra al usuario; un rechazo de permisos retira la edición y
  refresca la tarjeta. Un fallo de red no se presenta como pérdida de propiedad.

## Express antiguas: decisión del usuario

El usuario confirmó que seguimos en pruebas y se pueden eliminar las Express antiguas.
No se implementa una recuperación administrativa compleja ni se traslada automáticamente
su propiedad. No se ha borrado ninguna partida en esta tarea.

Antes del despliegue, hacer una copia fuera del repositorio y revisar el recuento de las
partidas sin grupo con propietario `anon_...` que carezcan de registro de credencial. La
limpieza debe excluir partidas de grupo y partidas de cuentas registradas. Ejecutarla, si
procede, antes de activar los guardas nuevos. Hasta entonces, los identificadores antiguos
solo sirven para consultar; la aplicación nueva no los acredita como creadores.

## Evidencia y límites

- Auditoría remota en lectura: RLS habilitada, pero políticas públicas permisivas en
  `golf_rounds`, `round_players` y `round_scores`. Los guardas actuales revisan cuentas de
  solo lectura y partidas retiradas; no verifican creador ni estado de las puntuaciones.
- Las tres tablas no están publicadas en Realtime. Esta implementación no cambia eso.
  La tarjeta mantiene el refresco por foco y cada 30 segundos; cualquier escritura se valida
  inmediatamente en el servidor, aunque el estado visual aún no se haya refrescado.
- Pruebas PGlite de cuentas, Express, miembros, ajenos, credenciales falsas/ausentes,
  estados cerrados, reclamación, límite, escrituras directas y conservación de flujos de grupo.
- Pruebas de concurrencia en PostgreSQL temporal sin red ni puertos: cuarta/quinta creación
  simultáneas y ambos órdenes de guardar frente a archivar. Contenedor y volumen eliminados.
- No se han probado dos móviles reales con la migración aplicada. La consulta OPTIONS y la
  simulación de migración no demuestran por sí solas el funcionamiento completo desplegado.

## Publicación posterior, independiente de esta preparación

1. Revisar el diff de seguridad y conservar copia recuperable de código/esquema/datos fuera del repo.
2. Revisar y, si corresponde, limpiar las Express de prueba antiguas con el alcance anterior.
3. Publicar backend y frontend de forma coordinada, con aviso de recarga de clientes antiguos.
   La web preparada requiere las nuevas funciones; no ofrece un fallback inseguro al servidor antiguo.
4. Aplicar solo la migración seleccionada mediante el script npm y `--apply`, cuando se autorice
   publicar. Conservar commits destinados a producción y seguir el flujo habitual de despliegue.
5. Probar Express con cuatro jugadores y una cuenta: creación, código, golpes, finalización,
   corrección del creador, bloqueo de otros, archivo, estadísticas y traslado de las Express nuevas.
6. Ante un fallo, detener escrituras y corregir manteniendo la protección: no restaurar políticas
   públicas de escritura como solución automática ni habilitar Realtime para ocultar problemas.