const KEY = 'omiki.express.owner.v1';
export interface ExpressCredential { secret: string; ownerId?: string }

export function readExpressCredential(): ExpressCredential | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (value && typeof value.secret === 'string' && /^[a-f0-9]{64}$/.test(value.secret) &&
      (value.ownerId === undefined || (typeof value.ownerId === 'string' && /^anon_[0-9a-f-]{36}$/.test(value.ownerId)))) return value;
  } catch { /* Missing or invalid credentials never authorize legacy ownership. */ }
  return null;
}

export function saveExpressCredential(value: ExpressCredential): void {
  const text = JSON.stringify(value);
  try {
    window.localStorage.setItem(KEY, text);
    if (window.localStorage.getItem(KEY) !== text) throw new Error();
  } catch { throw new Error('No se puede guardar tu identificación Express. Permite el almacenamiento del navegador antes de crear la partida.'); }
}

export function prepareExpressCredential(): ExpressCredential {
  const existing = readExpressCredential();
  if (existing) return existing;
  const value = { secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') };
  saveExpressCredential(value); // Persist before the first request, including retries.
  return value;
}

export function clearExpressCredential(): void { window.localStorage.removeItem(KEY); }

// Never send the owner credential to Auth, Edge Functions, images or external URLs.
export function expressCredentialFetch(origin: string, transport: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('x-omiki-express-secret');
    if (url.origin === new URL(origin).origin && url.pathname.startsWith('/rest/v1/')) {
      const credential = readExpressCredential();
      if (credential) headers.set('x-omiki-express-secret', credential.secret);
    }
    return transport(input, { ...init, headers });
  };
}
