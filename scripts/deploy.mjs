import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply') || args.length > 1) {
  console.error('Uso: npm run deploy:check | npm run deploy -- --apply');
  process.exit(1);
}
const apply = args.includes('--apply');
const target = 'lapartideta-vps';
const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', target];
function run(command, argv, capture = false) {
  const result = spawnSync(command, argv, {
    cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} falló. ${capture ? result.stderr : ''}`);
  return result.stdout?.trim();
}
try {
  if (!process.env.npm_execpath) throw new Error('Ejecuta este script mediante npm run deploy:check.');
  if (apply) {
    if (run('git', ['branch', '--show-current'], true) !== 'main') throw new Error('Publicar requiere la rama main.');
    if (run('git', ['status', '--porcelain'], true)) throw new Error('Guarda los cambios en un commit y súbelo antes de publicar.');
    const head = run('git', ['rev-parse', 'HEAD'], true);
    const remote = run('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], true).split(/\s/)[0];
    if (head !== remote) throw new Error('El commit local debe coincidir con main en GitHub antes de publicar.');
  }
  for (const script of ['typecheck', 'test:admin', 'test:workflow', 'build']) {
    run(process.execPath, [process.env.npm_execpath, 'run', script]);
  }
  run('git', ['diff', '--check']);
  run('ssh', [...ssh, 'test -x /var/www/miapp/deploy.sh && docker inspect --format "{{.State.Running}}" lapartideta-app']);
  if (apply) {
    run('ssh', [...ssh, 'cd /var/www/miapp && ./deploy.sh && test "$(docker inspect --format "{{.State.Running}}" lapartideta-app)" = true']);
  }
  for (const origin of ['https://app.omikigolf.com', 'https://golf.arinsaldev.com']) {
    const response = await fetch(`${origin}/?deploy_check=${Date.now()}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    await response.body?.cancel();
    if (response.status !== 200) throw new Error(`${origin} responde HTTP ${response.status}.`);
  }
  for (const origin of ['https://omikigolf.com', 'https://www.omikigolf.com']) {
    const path = '/?deploy_check=redirect';
    const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    await response.body?.cancel();
    if (response.status !== 307 || response.headers.get('location') !== `https://app.omikigolf.com${path}`) {
      throw new Error(`${origin} no redirige temporalmente a app.omikigolf.com.`);
    }
  }
  console.log(apply ? 'Publicación completada; contenedor activo y web HTTP 200.' : 'Comprobaciones completadas. No se ha publicado. Para publicar el commit subido: npm run deploy -- --apply');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
