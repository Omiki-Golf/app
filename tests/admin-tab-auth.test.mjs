import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/services/tabAuthStorage.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class Storage {
 constructor(other){this.items=new Map(other?.items);}
 get length(){return this.items.size;}
 key(i){return [...this.items.keys()][i]??null;}
 getItem(k){return this.items.get(k)??null;}
 setItem(k,v){this.items.set(k,v);}
 removeItem(k){this.items.delete(k);}
}
function tab(localStorage,sessionStorage=new Storage()){const exports={};new Function('exports','window',js)(exports,{localStorage,sessionStorage});return exports;}
test('auth persistence: tabs, restart, legacy migration, scoped cleanup and private storage',async()=>{
 const persistent=new Storage();
 const first=tab(persistent);
 assert.equal(first.authStorageKey,'golf.auth.session.v2');
 await first.persistentAuthStorage.setItem(first.authStorageKey,'shared-session');
 const second=tab(persistent);
 assert.equal(await second.persistentAuthStorage.getItem(second.authStorageKey),'shared-session');
 const restarted=tab(persistent);
 assert.equal(await restarted.persistentAuthStorage.getItem(restarted.authStorageKey),'shared-session');
 await restarted.persistentAuthStorage.setItem(restarted.authStorageKey+'-code-verifier','verifier');
 persistent.setItem('unrelated-setting','keep');
 await restarted.clearPersistentAuthSession();
 assert.equal(await first.persistentAuthStorage.getItem(first.authStorageKey),null);
 assert.equal(persistent.getItem('unrelated-setting'),'keep');

 const legacySession=new Storage();
 legacySession.setItem('golf.auth.tab.v1.session','legacy-session');
 legacySession.setItem('golf.auth.tab.v1.session-code-verifier','legacy-verifier');
 const migratedStorage=new Storage();
 const migrated=tab(migratedStorage,legacySession);
 assert.equal(await migrated.persistentAuthStorage.getItem(migrated.authStorageKey),'legacy-session');
 assert.equal(legacySession.getItem('golf.auth.tab.v1.session'),null);

 const existingStorage=new Storage();
 existingStorage.setItem('golf.auth.session.v2','current-session');
 const ignoredLegacy=new Storage();ignoredLegacy.setItem('golf.auth.tab.v1.session','old-session');
 const existing=tab(existingStorage,ignoredLegacy);
 assert.equal(await existing.persistentAuthStorage.getItem(existing.authStorageKey),'current-session');

 const privateTab=tab({setItem(){throw Error('storage disabled');}});
 await privateTab.persistentAuthStorage.setItem(privateTab.authStorageKey,'private-session');
 assert.equal(await privateTab.persistentAuthStorage.getItem(privateTab.authStorageKey),'private-session');
 await privateTab.clearPersistentAuthSession();
 assert.equal(await privateTab.persistentAuthStorage.getItem(privateTab.authStorageKey),null);
});
