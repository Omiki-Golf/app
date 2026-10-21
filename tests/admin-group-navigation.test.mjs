import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profile = await readFile(new URL('../src/components/ProfileScreen.tsx', import.meta.url), 'utf8');
const groups = await readFile(new URL('../src/components/MyGroups.tsx', import.meta.url), 'utf8');

test('a Player member can open My groups without being redirected home', () => {
  assert.doesNotMatch(
    app,
    /currentView === ['"]my-groups['"][\s\S]{0,250}activePlanType !== ['"]team['"]/
  );
  assert.match(profile, /show:\s*isTeam\s*\|\|\s*hasGroups/);
});

test('accepting an invitation refreshes group membership access', () => {
  assert.match(app, /handleNotificationsRefresh[\s\S]{0,250}refreshGroupMembership\(\)/);
  assert.match(app, /from\(['"]group_members['"]\)[\s\S]{0,200}eq\(['"]user_id['"],\s*user\.id\)/);
});

test('My groups loads both owned and joined groups', () => {
  assert.match(groups, /from\(['"]group_members['"]\)[\s\S]{0,150}eq\(['"]user_id['"],\s*user\.id\)/);
  assert.match(groups, /\.in\(['"]id['"],\s*\[\.\.\.roles\.keys\(\)\]\)/);
});
