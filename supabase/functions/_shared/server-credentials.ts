// Only keys provisioned in the server environment are trusted. Never infer
// service privileges from an unverified JWT payload or from a key prefix alone.
export function serverKeys(serialized: string | undefined): string[] {
  try {
    const value = JSON.parse(serialized || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.values(value).filter((key): key is string =>
      typeof key === 'string' && key.startsWith('sb_secret_') && key.length > 20);
  } catch { return []; }
}

export function isServerRequest(headers: Headers, serialized: string | undefined): boolean {
  const supplied = headers.get('apikey');
  return !!supplied && serverKeys(serialized).includes(supplied);
}
