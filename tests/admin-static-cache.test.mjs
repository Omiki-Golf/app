import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../scripts/vps/nginx.conf', import.meta.url), 'utf8');
const match = config.match(/location ~ (\^\/assets\/[^\n]+) \{\s*try_files \$uri =404;\s*add_header Cache-Control "public, max-age=31536000, immutable";\s*\}/);

test('long-lived caching matches only versioned build assets', () => {
  assert.ok(match);
  const pattern = new RegExp(match[1]);
  for (const path of ['/assets/index-v1793041881737-DYtfayvs.js', '/assets/index-v123-Ab_12-x.css', '/assets/course-search-v123-Abc123.json']) assert.equal(pattern.test(path), true, path);
  for (const path of ['/', '/index.html', '/manifest.webmanifest', '/assets/app.js', '/images/logo.png', '/assets/backup-v123-Abc.sql', '/assets/nested/file-v123-Abc.js']) assert.equal(pattern.test(path), false, path);
});

test('HTML and manifest still revalidate and missing assets do not receive immutable headers', () => {
  for (const path of ['/index.html', '/manifest.webmanifest']) {
    const block = config.slice(config.indexOf(`location = ${path}`)).split(/\n\s+location /)[0];
    assert.match(block, /no-cache, max-age=0, must-revalidate/);
  }
  assert.match(match[0], /try_files \$uri =404/);
  assert.doesNotMatch(match[0], /immutable" always/);
});
