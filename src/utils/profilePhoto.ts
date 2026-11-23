import { supabase } from '../services/supabaseClient';

/**
 * Foto de perfil propia. El archivo se guarda en Supabase Storage (bucket «avatars»,
 * carpeta <uid>/) y en user_profiles.avatar_url solo queda su URL pública.
 * Mientras no se ha subido (alta sin sesión, o Mis datos antes de guardar), la foto
 * recortada viaja como data URL pequeña (256×256, normalmente < 40 KB).
 */

export const PHOTO_BUCKET = 'avatars';
export const PHOTO_SIZE = 256;
/** Límite del bucket (100 KB); se apunta algo por debajo para dejar margen. */
export const PHOTO_MAX_BYTES = 90 * 1024;
const PHOTO_PATH = (userId: string) => `${userId}/avatar`;
const PENDING_KEY = (email: string) => `omiki:pending-profile-photo:${email.trim().toLowerCase()}`;

export interface CropArea {
  /** Esquina superior izquierda y lado del cuadrado, en píxeles de la imagen original. */
  x: number;
  y: number;
  size: number;
}

/** Foto ya subida al bucket de avatares. */
export const isProfilePhotoUrl = (url?: string | null): boolean =>
  !!url && url.includes(`/storage/v1/object/public/${PHOTO_BUCKET}/`);

/** Foto recortada aún sin subir. */
export const isLocalPhoto = (url?: string | null): boolean => !!url && url.startsWith('data:image/');

/** Bytes aproximados de una data URL en base64. */
export const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * Recorta el cuadrado indicado y lo reduce a 256×256. Prueba WebP y, si el navegador no lo
 * genera (Safari devuelve PNG), JPEG; baja la calidad hasta quedar por debajo del límite.
 */
export const cropToAvatarDataUrl = (image: HTMLImageElement, crop: CropArea): string => {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no permite recortar la foto.');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

  const supportsWebp = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  const type = supportsWebp ? 'image/webp' : 'image/jpeg';
  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const dataUrl = canvas.toDataURL(type, quality);
    if (dataUrlBytes(dataUrl) <= PHOTO_MAX_BYTES) return dataUrl;
  }
  throw new Error('La foto ocupa demasiado. Prueba con otra imagen.');
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

/** Sube la foto recortada a la carpeta del usuario y devuelve su URL pública (con versión para evitar la caché). */
export const uploadProfilePhoto = async (userId: string, dataUrl: string): Promise<string> => {
  const blob = await dataUrlToBlob(dataUrl);
  const contentType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(PHOTO_PATH(userId), blob, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(PHOTO_PATH(userId));
  return `${data.publicUrl}?v=${Date.now()}`;
};

/** Borra la foto del usuario (al volver a un avatar ilustrado o al darse de baja). No falla si no existe. */
export const removeProfilePhoto = async (userId: string): Promise<void> => {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([PHOTO_PATH(userId)]);
  if (error) console.warn('No se ha podido borrar la foto de perfil:', error);
};

/** Alta: la foto se guarda en este navegador hasta el primer inicio de sesión. */
export const savePendingPhoto = (email: string, dataUrl: string): void => {
  try { localStorage.setItem(PENDING_KEY(email), dataUrl); } catch { /* Sin almacenamiento: se podrá añadir en Mis datos. */ }
};

export const readPendingPhoto = (email: string): string | null => {
  try {
    const value = localStorage.getItem(PENDING_KEY(email));
    return value && isLocalPhoto(value) ? value : null;
  } catch {
    return null;
  }
};

export const clearPendingPhoto = (email: string): void => {
  try { localStorage.removeItem(PENDING_KEY(email)); } catch { /* Nada que limpiar. */ }
};
