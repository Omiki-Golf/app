import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const fixture = await read('../tests/helpers/verified-round-owners-fixture.sql');
const administration = await read('../supabase/migrations/20260912190000_app_round_management.sql');
const migration = await read('../supabase/migrations/20261028100000_verified_round_owners.sql');
const schema = fixture + administration.slice(administration.indexOf('CREATE FUNCTION public.admin_change_app_round('), administration.indexOf('CREATE FUNCTION public.count_available_quick_rounds(')) + migration;
const source = (await read('../tests/helpers/check-owner-concurrency.py')).replace('SETUP_SQL = None', `SETUP_SQL = base64.b64decode('${Buffer.from(schema).toString('base64')}').decode()`);
const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'lapartideta-vps', 'python3', '-'], { input: source, encoding: 'utf8', maxBuffer: 1024 * 1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
