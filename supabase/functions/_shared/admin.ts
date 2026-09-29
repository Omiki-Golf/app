import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function clients() {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appOrigin = Deno.env.get('APP_ORIGIN');
  if (!url || !anonKey || !serviceKey || !appOrigin) throw new HttpError(503, 'El acceso administrativo aún no está configurado.');
  const origin = new URL(appOrigin).origin;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return {
    origin,
    service: createClient(url, serviceKey, options),
    auth: createClient(url, anonKey, options),
    caller: (authorization: string) => createClient(url, anonKey, {
      ...options, global: { headers: { Authorization: authorization } },
    }),
  };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
  const raw = await req.text();
  if (raw.length > 4096) throw new HttpError(413, 'Solicitud demasiado grande.');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, 'Solicitud no válida.'); }
}

export function aliasValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{2,31}$/i.test(value.trim())) {
    throw new HttpError(400, 'El alias debe tener entre 3 y 32 letras, números, guiones o guiones bajos.');
  }
  return value.trim();
}

export function uuidValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Identificador no válido.');
  }
  return value;
}

export async function rateLimit(service: ReturnType<typeof clients>['service'], key: string, limit: number, seconds: number) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await service.rpc('consume_app_admin_auth_limit', {
    p_key_hash: hash, p_limit: limit, p_seconds: seconds,
  });
  if (error) throw new HttpError(503, 'No se ha podido comprobar el acceso.');
  if (!data) throw new HttpError(429, 'Demasiados intentos. Inténtalo más tarde.');
}

export async function requireAdministrator(req: Request, api: ReturnType<typeof clients>) {
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new HttpError(401, 'Inicia sesión para continuar.');
  const caller = api.caller(authorization);
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) throw new HttpError(401, 'La sesión ha caducado.');
  const { data: admin, error: roleError } = await caller.rpc('get_my_app_administrator');
  if (roleError || !admin || admin.status !== 'active' || admin.user_id !== user.id) {
    throw new HttpError(403, 'No tienes acceso administrativo.');
  }
  return { user, admin, caller };
}

export function serve(handler: (req: Request, api: ReturnType<typeof clients>) => Promise<unknown>) {
  Deno.serve(async req => {
    const origin = Deno.env.get('APP_ORIGIN') || '';
    const allowedOrigins = new Set([origin, ...(Deno.env.get('APP_ALLOWED_ORIGINS') || '').split(',')].map(value => value.trim()).filter(Boolean));
    const requestOrigin = req.headers.get('Origin');
    const permitted = !requestOrigin || allowedOrigins.has(requestOrigin);
    const headers: Record<string, string> = {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'Vary': 'Origin',
    };
    if (requestOrigin && permitted) headers['Access-Control-Allow-Origin'] = requestOrigin;
    try {
      if (!permitted) throw new HttpError(403, 'Origen no permitido.');
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const result = await handler(req, clients());
      return new Response(JSON.stringify(result), { headers });
    } catch (error) {
      // Never log request bodies, passwords, tokens, or recovery URLs.
      if (!(error instanceof HttpError)) console.error('Administrative request failed');
      const status = error instanceof HttpError ? error.status : 500;
      return new Response(JSON.stringify({ error: error instanceof HttpError ? error.message : 'No se ha podido completar la operación.' }), { status, headers });
    }
  });
}
