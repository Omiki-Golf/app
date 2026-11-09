import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the profile identifies an active Team trial and shows its end date',async()=>{
 const source=await readFile(new URL('../src/components/ProfileScreen.tsx',import.meta.url),'utf8');
 assert.match(source,/Team de prueba/);
 assert.match(source,/La prueba termina el/);
 assert.match(source,/team_trial_ends_at/);
 assert.match(source,/volverás automáticamente a tu plan Player/);
});

test('a Player can subscribe to Team directly and a used trial is not offered again',async()=>{
 const source=await readFile(new URL('../src/components/PlansComparison.tsx',import.meta.url),'utf8');
 assert.match(source,/teamTrialUsed/);
 assert.match(source,/canStartTeamTrial[^;]*!teamTrialUsed/);
 assert.match(source,/Suscribirse a Team/);
 assert.match(source,/Mejorar de Player a Team/);
 assert.match(source,/diferencia proporcional/);
 assert.doesNotMatch(source,/Suscribirse a Team[\s\S]{0,300}setComingSoon\(true\)/);
});
