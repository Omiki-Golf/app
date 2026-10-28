import { supabase } from './supabaseClient';
import { prepareExpressCredential, readExpressCredential, saveExpressCredential } from '../utils/expressCredential';

let registering: Promise<string> | null = null;
export async function ensureExpressIdentity(): Promise<string> {
  const register = async () => {
    const credential = prepareExpressCredential();
    if (credential.ownerId) return credential.ownerId;
    const { data, error } = await supabase.rpc('register_express_owner', { p_secret: credential.secret });
    if (error) throw new Error('No se ha podido verificar tu identificación Express. Inténtalo de nuevo.');
    if (typeof data !== 'string' || !/^anon_[0-9a-f-]{36}$/.test(data)) throw new Error('Identificación Express no válida.');
    if (readExpressCredential()?.secret !== credential.secret) throw new Error('La identificación Express ha cambiado. Actualiza la pantalla.');
    saveExpressCredential({ ...credential, ownerId: data });
    return data;
  };
  if (!registering) registering = (typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks.request('omiki.express.owner', register).then(value => value)
    : register()).finally(() => { registering = null; });
  return registering;
}
