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
 // Los textos viven en las traducciones de la ventana de planes.
 const texts=await readFile(new URL('../src/i18n/plans.ts',import.meta.url),'utf8');
 assert.match(source,/p\('subscribeTeam'\)/);
 assert.match(source,/p\('upgradeTitle'\)/);
 assert.match(source,/p\('upgradeText'/);
 assert.match(texts,/subscribeTeam: 'Suscribirse a Team'/);
 assert.match(texts,/upgradeTitle: 'Mejorar de Player a Team'/);
 assert.match(texts,/diferencia proporcional/);
 assert.doesNotMatch(source,/p\('subscribeTeam'\)[\s\S]{0,300}setComingSoon\(true\)/);
});
