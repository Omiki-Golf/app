import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Capture privileged keys in memory. Never print them or write them to the repo.
const project = 'sjzivdhzlptxveygmpys';
const result = spawnSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'projects','api-keys','--project-ref',project,'--reveal','--output','json'],{encoding:'utf8'});
if(result.status!==0) throw new Error('No se pudieron recuperar las credenciales de despliegue.');
const keys=JSON.parse(result.stdout);
const key=keys.find(item=>item.type==='secret')?.api_key;
if(!key) throw new Error('No se encontró la credencial de servidor.');
const response=await fetch(`https://${project}.supabase.co/functions/v1/stripe-setup`,{method:'POST',headers:{apikey:key}});
const data=await response.json().catch(()=>null);
if(!response.ok) throw new Error(`Configuración Stripe: HTTP ${response.status}${data?.stage ? ` (${data.stage})` : ''}. ${data?.error || 'Respuesta no JSON del servidor.'} ${data?.reason || ''}`);
console.log(JSON.stringify(data,null,2));
