import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('history backup includes committed WAL data, excludes credentials and restores without overwriting history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-history-'));
  const home = join(root, 'codex');
  const saved = join(root, 'saved');
  await mkdir(join(home, 'sessions/2026/09'), { recursive: true });
  const db = new DatabaseSync(join(home, 'state_5.sqlite'));
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE threads(id TEXT, title TEXT); INSERT INTO threads VALUES('recovered','Invitados');");
    await writeFile(join(home, 'sessions/2026/09/rollout.jsonl'), '{"id":"recovered"}\n');
    await writeFile(join(home, 'session_index.jsonl'), '{"id":"recovered"}\n');
    await writeFile(join(home, 'auth.json'), 'PRIVATE');
    await writeFile(join(home, 'config.toml'), 'PRIVATE');
    const run = mode => spawnSync(process.execPath, ['scripts/codex-history.mjs', mode], {
      encoding: 'utf8', env: { ...process.env, CODEX_HOME: home, CODEX_HISTORY_BACKUP_ROOT: saved },
    });
    assert.equal(run('--once').status, 0);
    const copy = new DatabaseSync(join(saved, 'latest/state_5.sqlite'), { readOnly: true });
    try { assert.equal(copy.prepare('SELECT title FROM threads').get().title, 'Invitados'); }
    finally { copy.close(); }
    assert.ok(!(await readdir(join(saved, 'latest'))).includes('auth.json'));
    assert.ok(!(await readdir(join(saved, 'latest'))).includes('config.toml'));
    // Windows does not expose POSIX owner/group permission bits through stat.
    // Keep the content, credential-exclusion and restore checks on every OS.
    if (process.platform !== 'win32') {
      assert.equal((await stat(saved)).mode & 0o777, 0o700);
    }
    assert.equal(run('--restore').status, 1, 'existing history must be preserved');
    db.close();
    await rm(home, { recursive: true });
    assert.equal(run('--restore').status, 0);
    assert.equal(await readFile(join(home, 'sessions/2026/09/rollout.jsonl'), 'utf8'), '{"id":"recovered"}\n');
    const restored = new DatabaseSync(join(home, 'state_5.sqlite'), { readOnly: true });
    try { assert.equal(restored.prepare('SELECT title FROM threads').get().title, 'Invitados'); }
    finally { restored.close(); }
  } finally {
    if (db.isOpen) db.close();
    await rm(root, { recursive: true, force: true });
  }
});
