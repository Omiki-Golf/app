import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, '.local', 'course-catalog');
const pages = join(cache, 'pages');
const output = join(root, 'src', 'data', 'recorridos-golf-espana.json');
const existingFile = join(root, 'src', 'data', 'recorridos-golf-comunidad-valenciana.json');
const directoryUrl = 'https://rfegolf.es/jugar-golf/donde-jugar-golf';
const provinceToRegion = {
  'a coruna': 'Galicia', alava: 'País Vasco', albacete: 'Castilla-La Mancha', alicante: 'Comunitat Valenciana', almeria: 'Andalucía', asturias: 'Principado de Asturias', avila: 'Castilla y León', badajoz: 'Extremadura', barcelona: 'Cataluña', bizkaia: 'País Vasco', burgos: 'Castilla y León', caceres: 'Extremadura', cadiz: 'Andalucía', cantabria: 'Cantabria', castellon: 'Comunitat Valenciana', ceuta: 'Ceuta', 'ciudad real': 'Castilla-La Mancha', cordoba: 'Andalucía', cuenca: 'Castilla-La Mancha', girona: 'Cataluña', granada: 'Andalucía', guadalajara: 'Castilla-La Mancha', guipuzcoa: 'País Vasco', gipuzkoa: 'País Vasco', huelva: 'Andalucía', huesca: 'Aragón', 'illes balears': 'Illes Balears', 'islas baleares': 'Illes Balears', jaen: 'Andalucía', 'la rioja': 'La Rioja', 'las palmas': 'Canarias', leon: 'Castilla y León', lleida: 'Cataluña', lugo: 'Galicia', madrid: 'Comunidad de Madrid', malaga: 'Andalucía', melilla: 'Melilla', murcia: 'Región de Murcia', navarra: 'Comunidad Foral de Navarra', ourense: 'Galicia', palencia: 'Castilla y León', pontevedra: 'Galicia', salamanca: 'Castilla y León', 'santa cruz de tenerife': 'Canarias', segovia: 'Castilla y León', sevilla: 'Andalucía', soria: 'Castilla y León', tarragona: 'Cataluña', teruel: 'Aragón', toledo: 'Castilla-La Mancha', valencia: 'Comunitat Valenciana', valladolid: 'Castilla y León', vizcaya: 'País Vasco', zamora: 'Castilla y León', zaragoza: 'Aragón',
};
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const decode = value => value.replace(/&#(x?[\da-f]+);|&(nbsp|amp|quot|apos|lt|gt);/gi, (_, numeric, named) => numeric ? String.fromCodePoint(Number.parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10)) : ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[named.toLowerCase()]);
const plainText = value => decode(value.replace(/<[^>]+>/g, '')).trim();
const number = value => {
  const parsed = Number(String(value ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const exists = async path => stat(path).then(() => true, () => false);
const get = async url => {
  const response = await fetch(url, { headers: { 'user-agent': 'LaPartideta catalog review/1.0' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function inferProvince(address = '') {
  const parts = address.split(',').map(part => part.trim());
  if (['espana', 'spain'].includes(normalize(parts.at(-1) ?? ''))) parts.pop();
  for (const candidate of parts.reverse()) {
    const cleaned = candidate.replace(/^\d{5}\s+/, '').trim();
    const region = provinceToRegion[normalize(cleaned)];
    if (region) return [cleaned, region];
  }
  return ['Sin identificar', 'Sin identificar'];
}

function provinceFromClubPage(raw) {
  const match = raw.match(/<p[^>]*data-interaction-id="cd73903"[^>]*>(.*?)<\/p>/s);
  if (!match) return null;
  const province = plainText(match[1]);
  const region = provinceToRegion[normalize(province)];
  return region ? [province, region] : null;
}

function parseCards(raw, slug, issues) {
  const match = raw.match(/window\.rfegHcpData\['[^']+'\]\s*=\s*(\{.*?\});/s);
  if (!match) return [];
  let metadata;
  try { metadata = JSON.parse(match[1]); } catch (error) {
    issues.push([slug, 'Metadatos de tarjetas inválidos', error.message]);
    return [];
  }
  const cards = [];
  for (const [panelId, meta] of Object.entries(metadata)) {
    const escaped = panelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const panel = raw.match(new RegExp(`id="${escaped}".*?<table[^>]*>(.*?)</table>`, 's'));
    if (!panel) { issues.push([slug, panelId, 'Tabla ausente']); continue; }
    const rows = [...panel[1].matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>(.*?)<\/t[dh]>/gs)].map(cell => plainText(cell[1])));
    if (!rows.length || !rows[0].length) continue;
    const labels = rows[0].slice(1);
    const values = Object.fromEntries(rows.slice(1).filter(row => row.length).map(row => [row[0], row.slice(1)]));
    if (!['Par', 'Hdcp', 'Metros'].every(key => key in values) || !labels.includes('TOTAL')) { issues.push([slug, panelId, 'Columnas incompletas']); continue; }
    const holes = labels.flatMap((label, index) => /^\d+$/.test(label) ? [{ hoyo: Number(label), par: number(values.Par[index]), handicap: number(values.Hdcp[index]), metros: number(values.Metros[index]) }] : []);
    const totalIndex = labels.indexOf('TOTAL');
    const card = { recorrido: meta.label ?? '', barras: meta.color ?? '', categoria: meta.genero ?? '', valor_campo: number(meta.cr), slope: number(meta.slope), par_total: number(values.Par[totalIndex]), metros_total: number(values.Metros[totalIndex]), hoyos: holes };
    if (!holes.length || holes.some((hole, index) => hole.hoyo !== index + 1)) issues.push([slug, panelId, 'Numeración inesperada']);
    for (const [key, totalKey] of [['par', 'par_total'], ['metros', 'metros_total']]) {
      if (holes.some(hole => hole[key] === null) || holes.reduce((sum, hole) => sum + (hole[key] ?? 0), 0) !== card[totalKey]) issues.push([slug, meta.label, meta.color, key, 'No coincide suma']);
    }
    cards.push(card);
  }
  return cards;
}

function compactRoutes(cards) {
  const grouped = new Map();
  for (const card of cards) {
    const holes = card.hoyos.map(hole => ({ hoyo: hole.hoyo, par: hole.par, dificultad: hole.handicap }));
    const signature = JSON.stringify(holes);
    const key = `${card.recorrido}\0${signature}`;
    if (!grouped.has(key)) grouped.set(key, { recorrido: card.recorrido, par_total: holes.reduce((sum, hole) => sum + hole.par, 0), hoyos: holes });
  }
  const nameTotals = new Map();
  for (const route of grouped.values()) nameTotals.set(route.recorrido, (nameTotals.get(route.recorrido) ?? 0) + 1);
  const nameIndexes = new Map();
  return [...grouped.values()].map(route => {
    if (nameTotals.get(route.recorrido) === 1) return route;
    const variante = (nameIndexes.get(route.recorrido) ?? 0) + 1;
    nameIndexes.set(route.recorrido, variante);
    return { ...route, variante };
  });
}

async function mapConcurrent(items, limit, work) {
  let next = 0;
  let done = 0;
  const failures = [];
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      try { await work(items[index]); } catch (error) { failures.push([items[index].title, error.message]); }
      done++;
      if (done % 25 === 0) console.log(`Descargadas ${done}/${items.length} fichas`);
    }
  }));
  return failures;
}

await mkdir(pages, { recursive: true });
const directoryHtml = await get(directoryUrl);
await writeFile(join(cache, 'rfeg-directory.html'), directoryHtml);
const markersMatch = directoryHtml.match(/var markers\s*=\s*(\[.*?\]);/s);
if (!markersMatch) throw new Error('No se ha encontrado el directorio RFEG en la página oficial');
const markers = JSON.parse(markersMatch[1]);
const existing = JSON.parse(await readFile(existingFile, 'utf8'));
const existingBySlug = new Map(existing.campos.filter(club => club.fuente_tarjetas).map(club => [club.fuente_tarjetas.replace(/\/$/, '').split('/').at(-1), club]));
const failures = await mapConcurrent(markers, 3, async marker => {
  const slug = marker.url.replace(/\/$/, '').split('/').at(-1);
  const page = join(pages, `${slug}.html`);
  if (!(await exists(page))) {
    await writeFile(page, await get(`https://rfegolf.es/club/${slug}`));
    await sleep(150);
  }
});
const issues = [...failures];
const usedCodes = new Set();
const clubs = [];
for (const marker of markers) {
  const slug = marker.url.replace(/\/$/, '').split('/').at(-1);
  const page = join(pages, `${slug}.html`);
  const pageHtml = await exists(page) ? await readFile(page, 'utf8') : '';
  let [province, region] = provinceFromClubPage(pageHtml) ?? inferProvince(marker.address);
  const old = existingBySlug.get(slug);
  if (old) { province = old.provincia; region = 'Comunitat Valenciana'; }
  let code = old?.codigo ?? `RFEG-${slug}`;
  if (usedCodes.has(code)) { issues.push([slug, 'Código duplicado']); code = `${code}-${usedCodes.size + 1}`; }
  usedCodes.add(code);
  const cards = pageHtml ? parseCards(pageHtml, slug, issues) : [];
  const club = { codigo: code, campo: marker.title, comunidad_autonoma: region, provincia: province, direccion: marker.address ?? '', numero_hoyos_directorio: marker.hoyos ?? '', fuente_directorio: directoryUrl, fuente_tarjetas: `https://rfegolf.es/club/${slug}`, tarjetas: cards, estado: cards.length ? 'Datos extraídos' : 'Sin tarjeta extraíble en las fuentes consultadas' };
  if (old) for (const key of ['codigo', 'campo', 'provincia', 'tarjetas', 'estado']) club[key] = old[key];
  clubs.push(club);
}
for (const old of existing.campos.filter(club => !club.fuente_tarjetas)) {
  if (usedCodes.has(old.codigo)) continue;
  usedCodes.add(old.codigo);
  clubs.push({ ...old, comunidad_autonoma: 'Comunitat Valenciana', direccion: '', numero_hoyos_directorio: '', fuente_directorio: old.fuente_directorio });
}
clubs.sort((a, b) => `${a.comunidad_autonoma}\0${a.provincia}\0${a.campo}`.localeCompare(`${b.comunidad_autonoma}\0${b.provincia}\0${b.campo}`, 'es'));
for (const club of clubs) {
  club.recorridos = compactRoutes(club.tarjetas);
  delete club.tarjetas;
  club.estado = club.recorridos.length ? 'Recorridos extraídos' : 'Sin recorrido extraíble en las fuentes consultadas';
}
const data = {
  titulo: 'Recorridos de golf de España', fecha_consulta: new Date().toISOString().slice(0, 10),
  notas: [
    'El alcance reproduce las instalaciones publicadas en el directorio nacional de la RFEG; incluye pitch & putt e instalaciones sin tarjeta hoyo a hoyo.',
    'Dificultad es el índice de hándicap de cada hoyo, no el hándicap del jugador.',
    'Se eliminan barras, categoría, sexo, distancias, valor de campo y slope; solo se conservan recorrido, hoyo, par e índice de dificultad.',
    'Cuando un mismo nombre de recorrido tiene más de una distribución oficial de par o dificultad, se conservan como variantes separadas.',
    'Una tarjeta de 18 hoyos puede repetir dos veces un campo físico de 9 hoyos.',
    'Fecha de consulta no equivale a fecha de actualización u homologación. No se garantiza la vigencia operativa de todos los recorridos.',
    'Los campos sin tarjeta publicada se mantienen en el directorio sin inventar datos.',
  ], campos: clubs, incidencias_validacion: issues,
};
await writeFile(output, JSON.stringify(data));
console.log(JSON.stringify({ campos: clubs.length, con_recorridos: clubs.filter(club => club.recorridos.length).length, recorridos: clubs.reduce((sum, club) => sum + club.recorridos.length, 0), incidencias: issues.length, salida: output }, null, 2));
