// Una petición sin respuesta (red móvil inestable, conexión medio caída) dejaba la app
// esperando para siempre en las comprobaciones de arranque. Con este límite la petición
// falla y la pantalla correspondiente puede mostrar el error y «Reintentar».
// Las subidas a Storage (fotos) quedan fuera: en redes lentas pueden tardar más.
// La función de Stripe encadena varias llamadas a Stripe (cada una limitada a 10 s en
// el servidor), así que tiene un margen propio más amplio.
export const STRIPE_FUNCTION_TIMEOUT_MS = 45000;
export function timeoutFetch(timeoutMs = 20000, transport: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/storage/v1/')) return transport(input, init);
    const limitMs = url.includes('/functions/v1/stripe-checkout') ? Math.max(timeoutMs, STRIPE_FUNCTION_TIMEOUT_MS) : timeoutMs;
    const controller = new AbortController();
    const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(outer?.reason);
    if (outer?.aborted) abort();
    else outer?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('La conexión ha tardado demasiado.', 'TimeoutError')), limitMs);
    return transport(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abort);
    });
  };
}
