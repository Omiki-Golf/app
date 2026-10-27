import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function buildCourseSearchCatalog(catalog) {
  return { campos: catalog.campos.map(club => ({
    codigo: club.codigo,
    campo: club.campo,
    comunidad_autonoma: club.comunidad_autonoma,
    provincia: club.provincia,
    // Preserve order: the route index is part of the database catalog_key.
    recorridos: club.recorridos.map(route => ({
      recorrido: route.recorrido,
      ...(route.variante !== undefined ? { variante: route.variante } : {}),
    })),
  })) };
}

export async function generateCourseSearchCatalog() {
  const catalog = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-espana.json', import.meta.url), 'utf8'));
  const directory = new URL('../src/data/generated/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('course-search.json', directory), JSON.stringify(buildCourseSearchCatalog(catalog)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateCourseSearchCatalog();
}
