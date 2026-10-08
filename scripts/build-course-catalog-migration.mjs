import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../src/data/recorridos-golf-espana.json', import.meta.url), 'utf8'));
const target = new URL('../supabase/migrations/20261008140000_spanish_course_catalog.sql', import.meta.url);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const uuidFor = key => {
  const hex = createHash('sha256').update(`omkigolf-course:${key}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

const courses = [];
const holes = [];
for (const club of catalog.campos) {
  club.recorridos.forEach((route, index) => {
    const key = `${club.codigo}:${index}`;
    const id = uuidFor(key);
    const suffix = route.variante ? ` (variante ${route.variante})` : '';
    courses.push(`(${quote(id)},${quote(key)},${quote(club.campo)},${quote(route.recorrido)},${quote(club.comunidad_autonoma)},${quote(club.provincia)},${quote(`${club.campo} — ${route.recorrido}${suffix}`)},${quote(`Catálogo RFEG consultado el ${catalog.fecha_consulta}`)})`);
    for (const hole of route.hoyos) holes.push(`(${quote(id)},${hole.hoyo},${hole.par},${hole.dificultad})`);
  });
}
const batches = (values, size, statement) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => statement(values.slice(index * size, (index + 1) * size).join(',\n'))).join('\n');
const sql = `-- Catálogo nacional RFEG normalizado: campo, recorrido, par e índice de dificultad.
ALTER TABLE public.golf_courses
  ADD COLUMN IF NOT EXISTS catalog_key text,
  ADD COLUMN IF NOT EXISTS catalog_field text,
  ADD COLUMN IF NOT EXISTS catalog_route text,
  ADD COLUMN IF NOT EXISTS autonomous_community text,
  ADD COLUMN IF NOT EXISTS province text;

CREATE UNIQUE INDEX IF NOT EXISTS golf_courses_catalog_key_uidx
  ON public.golf_courses (catalog_key) WHERE catalog_key IS NOT NULL;

ALTER TABLE public.golf_holes DROP CONSTRAINT IF EXISTS golf_holes_par_check;
ALTER TABLE public.golf_holes ADD CONSTRAINT golf_holes_par_check CHECK (par BETWEEN 3 AND 6);

${batches(courses, 100, rows => `INSERT INTO public.golf_courses (id,catalog_key,catalog_field,catalog_route,autonomous_community,province,name,description) VALUES\n${rows}\nON CONFLICT (name) DO UPDATE SET catalog_key=EXCLUDED.catalog_key,catalog_field=EXCLUDED.catalog_field,catalog_route=EXCLUDED.catalog_route,autonomous_community=EXCLUDED.autonomous_community,province=EXCLUDED.province;`)}

${batches(holes, 500, rows => `INSERT INTO public.golf_holes (course_id,hole_number,par,stroke_index) VALUES\n${rows}\nON CONFLICT (course_id,hole_number) DO UPDATE SET par=EXCLUDED.par,stroke_index=EXCLUDED.stroke_index,updated_at=now();`)}
`;
await writeFile(target, sql);
console.log(`Migración generada: ${courses.length} recorridos y ${holes.length} hoyos.`);
