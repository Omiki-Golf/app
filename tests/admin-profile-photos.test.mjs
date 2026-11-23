import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('profile photos live in a small public bucket, writable only in the own folder', async () => {
  const sql = await read('supabase/migrations/20261201100000_profile_photos.sql');
  assert.match(sql, /VALUES \('avatars', 'avatars', true, 102400, ARRAY\['image\/webp', 'image\/jpeg'\]\)/);
  for (const policy of ['avatars_own_insert', 'avatars_own_update', 'avatars_own_delete']) {
    assert.match(sql, new RegExp(`CREATE POLICY "${policy}"[\\s\\S]*?\\(storage\\.foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text`));
  }
  assert.match(sql, /avatars_own_insert[\s\S]*?NOT public\.is_app_user_read_only\(\)/);
  // La edición de admin acepta los avatares ilustrados o conservar la foto actual, nunca una URL cualquiera.
  assert.match(sql, /~ '\^\/avatars\/\[a-z0-9-\]\+\\\.webp\$'/);
  assert.match(sql, /p_values->>'avatar_url' IS NOT DISTINCT FROM before_data->'profile'->>'avatar_url'/);
});

test('the photo is cropped to 256 px and kept under the bucket limit', async () => {
  const util = await read('src/utils/profilePhoto.ts');
  assert.match(util, /export const PHOTO_SIZE = 256;/);
  assert.match(util, /export const PHOTO_MAX_BYTES = 90 \* 1024;/);
  assert.match(util, /upload\(PHOTO_PATH\(userId\), blob, \{\s*upsert: true/);
  assert.match(util, /\?v=\$\{Date\.now\(\)\}/);
});

test('signup never sends the photo in the auth metadata; it waits for the first login', async () => {
  const form = await read('src/components/RegistrationForm.tsx');
  assert.match(form, /avatarUrl: isLocalPhoto\(avatarUrl\) \? DEFAULT_AVATAR_URL : avatarUrl/);
  assert.match(form, /if \(isLocalPhoto\(avatarUrl\)\) savePendingPhoto\(email, avatarUrl\);/);
  assert.match(form, /<AvatarPicker value=\{avatarUrl\} onSelect=\{setAvatarUrl\} allowPhoto \/>/);
  const hook = await read('src/hooks/useSubscription.ts');
  assert.match(hook, /readPendingPhoto\(user\.email\)/);
  assert.match(hook, /clearPendingPhoto\(user\.email\)/);
});

test('Mis datos uploads before saving and removes the file when going back to an avatar', async () => {
  const details = await read('src/components/ProfileDetails.tsx');
  assert.match(details, /savedAvatarUrl = await uploadProfilePhoto\(/);
  assert.match(details, /avatar_url: savedAvatarUrl/);
  assert.match(details, /isProfilePhotoUrl\(profile\?\.avatar_url\) && !isProfilePhotoUrl\(savedAvatarUrl\)/);
  const deletion = await read('src/components/DeleteAccountSection.tsx');
  assert.match(deletion, /removeProfilePhoto\(currentUser\.id\)/);
});
