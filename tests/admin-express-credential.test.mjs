import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { readExpressCredential, prepareExpressCredential, saveExpressCredential, expressCredentialFetch } from '../src/utils/expressCredential.ts';

function browser() {
 const values=new Map();
 globalThis.window={localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
 return values;
}
test('credential is strong, persisted before use and reused after reload',()=>{
 browser(); const credential=prepareExpressCredential();
 assert.match(credential.secret,/^[a-f0-9]{64}$/);
 assert.deepEqual(readExpressCredential(),credential);
 assert.deepEqual(prepareExpressCredential(),credential);
 saveExpressCredential({...credential,ownerId:'anon_11111111-2222-4333-8444-555555555555'});
 assert.equal(prepareExpressCredential().ownerId,'anon_11111111-2222-4333-8444-555555555555');
 window.localStorage.setItem('omiki.express.owner.v1','broken'); assert.equal(readExpressCredential(),null);
});
test('storage failure rejects creation rather than registering a credential that will be lost',()=>{
 browser(); window.localStorage.setItem=()=>{throw new Error('blocked');};
 assert.throws(prepareExpressCredential,/almacenamiento/);
});
test('private credential is attached only to same-origin database requests, never Auth, functions or third parties',async()=>{
 browser(); const credential=prepareExpressCredential(); const sent=[];
 const transport=async(input,init)=>{sent.push(init.headers);return new Response('{}');};
 const wrapped=expressCredentialFetch('https://database.example.test',transport);
 await wrapped('https://database.example.test/rest/v1/round_scores',{headers:{apikey:'public-key'}});
 assert.equal(sent[0].get('x-omiki-express-secret'),credential.secret);
 assert.equal(sent[0].get('apikey'),'public-key');
 for(const path of ['https://database.example.test/auth/v1/user','https://database.example.test/functions/v1/test','https://evil.example.test/rest/v1/round_scores']){
  await wrapped(path,{headers:{'x-omiki-express-secret':'injected'}});
  assert.equal(sent.at(-1).has('x-omiki-express-secret'),false);
 }
});
test('simultaneous registration shares one request; retries keep the persisted secret',async()=>{
 browser(); let calls=0; let first=true; const secrets=[];
 const source=await readFile(new URL('../src/services/expressIdentity.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,'').replace('export async function ensureExpressIdentity','async function ensureExpressIdentity')+'\nglobalThis.ensure=ensureExpressIdentity;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context=vm.createContext({prepareExpressCredential,readExpressCredential,saveExpressCredential,
  supabase:{rpc:async(name,args)=>{calls++; secrets.push(args.p_secret);assert.equal(name,'register_express_owner');if(first){first=false;return {error:{message:'network'}};}return {data:'anon_11111111-2222-4333-8444-555555555555'};}}});
 vm.runInContext(code,context);
 const failed=await Promise.allSettled([context.ensure(),context.ensure()]);
 assert.ok(failed.every(r=>r.status==='rejected')); assert.equal(calls,1);
 const owners=await Promise.all([context.ensure(),context.ensure()]);
 assert.equal(calls,2);assert.equal(owners[0],owners[1]);assert.equal(secrets[0],secrets[1]);
 await context.ensure();assert.equal(calls,2);
});

test('local creator checks distinguish legacy identifiers, verified Express and signed-in accounts',async()=>{
 const values=browser();const legacy='anon_11111111-2222-4333-8444-555555555555';
 const verified='anon_99999999-2222-4333-8444-555555555555';
 window.localStorage.setItem('la_partideta_device_user_id',legacy);
 const source=await readFile(new URL('../src/utils/userId.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,'').replace(/export const /g,'const ')+'\nglobalThis.api={getUserId,getDeviceUserId,isVerifiedLocalRoundCreator,setAuthenticatedUserId};', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context=vm.createContext({window,readExpressCredential,crypto,safeStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});
 vm.runInContext(code,context);
 assert.equal(context.api.getUserId(),legacy);assert.equal(context.api.isVerifiedLocalRoundCreator(legacy),false);
 saveExpressCredential({...prepareExpressCredential(),ownerId:verified});
 assert.equal(context.api.isVerifiedLocalRoundCreator(verified),true);assert.equal(context.api.isVerifiedLocalRoundCreator(legacy),false);
 assert.equal(context.api.getDeviceUserId(),legacy);
 context.api.setAuthenticatedUserId('account');
 assert.equal(context.api.getUserId(),'account');assert.equal(context.api.isVerifiedLocalRoundCreator(verified),false);
});
