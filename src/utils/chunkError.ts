/** Fallo al descargar una parte de la app (habitual sin cobertura o tras publicar una versión). */
export const isChunkLoadError = (error: unknown): boolean => {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically/i.test(text);
};
