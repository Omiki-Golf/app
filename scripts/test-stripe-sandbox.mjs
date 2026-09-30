import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

// Explicit integration smoke test: creates then deletes one disposable Auth user.
// No emails are sent, no card is charged, and no token/password is printed.
if (!process.argv.includes('--apply')) throw new Error('Use --apply to create a temporary Sandbox test account.');
const project='sjzivdhzlptxveygmpys', url=`https://${project}.supabase.co`;
const output=spawnSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8'});
if(output.status!==0) throw new Error('Could not obtain deployment credentials.');
const keys=JSON.parse(output.stdout);
const serviceKey=keys.find(item=>item.name==='service_role')?.api_key;
const anonKey=keys.find(item=>item.name==='anon')?.api_key;
if(!serviceKey || !anonKey) throw new Error('Missing credentials.');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,serviceKey,options),client=createClient(url,anonKey,options);
const email=`omiki-stripe-qa-${crypto.randomUUID()}@example.com`,password=`Qa!${crypto.randomUUID()}`;
let userId;
try {
 const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{requested_plan:'premium',player_checkout:{id:crypto.randomUUID(),plan:'player',period:'monthly'}}});
 if(error) throw new Error('Could not create disposable test account.');
 userId=data.user.id;
 const {data:login,error:loginError}=await client.auth.signInWithPassword({email,password});
 if(loginError) throw new Error('Could not log in to disposable account.');
 const headers={Authorization:`Bearer ${login.session.access_token}`,apikey:anonKey,Origin:'http://localhost:5173','Content-Type':'application/json'};
 const invoke=async(action,overrides={})=>{
  const response=await fetch(`${url}/functions/v1/stripe-checkout`,{method:'POST',headers:{...headers,...overrides},body:JSON.stringify({action})});
  return {status:response.status,data:await response.json()};
 };
 const first=await invoke('create');
 assert.equal(first.status,200,`${first.data.error || ''} ${first.data.code || ''} ${JSON.stringify(first.data.diagnostic || {})}`);
 assert.equal(new URL(first.data.url).hostname,'checkout.stripe.com');
 const second=await invoke('create');
 assert.equal(second.status,200,second.data.error);
 assert.equal(second.data.url,first.data.url,'Retry must reuse the same checkout.');
 assert.equal((await invoke('status')).status,200);
 const {data:sub,error:subError}=await service.from('user_subscriptions').select('status').eq('user_id',userId).maybeSingle();
 assert.equal(subError,null); assert.equal(sub,null,'Unpaid registration must not activate a plan.');
 const {error:grantError}=await client.from('user_subscriptions').insert({user_id:userId,plan_type:'premium',status:'active'});
 assert.ok(grantError,'The browser must not be able to grant paid access.');
 assert.equal((await invoke('create',{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await invoke('create',{Authorization:'Bearer invalid'})).status,401);
 const forged=await fetch(`${url}/functions/v1/stripe-webhook`,{method:'POST',headers:{'stripe-signature':'t=1,v1=invalid'},body:'{}'});
 assert.equal(forged.status,400);
 for(const setupHeaders of [{},{apikey:anonKey},headers]) {
  const denied=await fetch(`${url}/functions/v1/stripe-setup`,{method:'POST',headers:setupHeaders});
  assert.equal(denied.status,401,'Setup must reject anonymous callers and player sessions.');
 }
 console.log('PASS: Stripe Checkout URL, idempotent retry, no unpaid activation, origin/auth checks and webhook signature rejection.');
 console.log('No card payment was submitted. The unused Sandbox checkout expires automatically.');
} finally {
 if(userId) {
  const {error}=await service.auth.admin.deleteUser(userId);
  if(error) throw new Error(`Disposable account cleanup failed: ${userId}`);
  console.log('Disposable test account deleted.');
 }
}
