import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { calculateModePoints } from '../src/utils/calculations.ts';

const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
const method=app.slice(app.indexOf('  const handleScoreChange ='),app.indexOf('  const handleHolesUpdated ='));
const script=ts.transpileModule(method+'\nglobalThis.changeScore=handleScoreChange;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(mode='stableford',error=null){
 const players=Array.from({length:mode==='parejas'?4:2},(_,i)=>({id:String(i),playing_handicap:i+4}));
 const scores=players.map((p,i)=>({id:'original-'+p.id,player_id:p.id,round_id:'round',hole_number:1,gross_strokes:i+5,net_strokes:i+5,strokes_received:0,stableford_points:1,mode_points:99,abandoned:false}));
 let state={round:{id:'round',game_mode:mode,status:'active'},hasEditAccess:true,players,scores};
 const inputState=state;const alerts=[];let sent;let refreshes=0;
 const context=vm.createContext({roundState:inputState,readOnly:false,console:{log(){},error(){}},calculateModePoints,
  setError:text=>alerts.push(text),setRoundState:fn=>{state=fn(state);},
  golfService:{
   async recordHoleScores(r,h,rows){if(error)throw error; sent=rows;return rows.map(s=>({...s,id:'persisted-'+s.player_id}));},
   async recordRoundDecision(){return null;},
   async getRoundWithDetails(){refreshes++;return {round:{...inputState.round,status:'completed'},scores:inputState.scores};},
  }});
 vm.runInContext(script,context);
 return {change:context.changeScore,state:()=>state,sent:()=>sent,alerts,refreshes:()=>refreshes,players,scores};
}
test('real score handler retains mode calculations, persists a whole hole once and removes duplicate rows',async()=>{
 for(const mode of ['stableford','match','sindicato','parejas']){
  const h=harness(mode);const inputs=h.scores.map(s=>({playerId:s.player_id,netStrokes:s.player_id==='0'?4:s.net_strokes,abandoned:false,entered:true}));
  const teams=mode==='parejas'?{'0':0,'1':0,'2':1,'3':1}:undefined;
  const points=mode==='stableford'?0:calculateModePoints(mode,'0',inputs,teams);
  await h.change('0',1,{grossStrokes:4,netStrokes:4,strokesReceived:0,stablefordPoints:2,mode_points:points});
  assert.equal(h.state().scores.length,h.scores.length);
  assert.equal(h.state().scores.find(s=>s.player_id==='0').id,'persisted-0');
  assert.equal(h.state().scores.find(s=>s.player_id==='0').gross_strokes,4);
  if(mode!=='stableford') for(const p of h.players) assert.equal(h.state().scores.find(s=>s.player_id===p.id).mode_points,calculateModePoints(mode,p.id,inputs,teams));
  assert.ok(h.sent().every(s=>s.round_id==='round'&&s.hole_number===1));
 }
});
test('server denial displays the reason, revokes editing and refreshes the canonical status',async()=>{
 const h=harness('stableford',{code:'42501',message:'El creador ya ha finalizado esta partida.'});
 await h.change('0',1,{grossStrokes:4,netStrokes:4});
 assert.equal(h.state().hasEditAccess,false);assert.equal(h.state().round.status,'completed');
 assert.equal(h.alerts.at(-1),'El creador ya ha finalizado esta partida.');assert.equal(h.refreshes(),1);
});
test('network errors do not falsely revoke ownership or discard unsaved display data',async()=>{
 const h=harness('stableford',{message:'Sin conexión'});
 await h.change('0',1,{grossStrokes:4,netStrokes:4});
 assert.equal(h.state().hasEditAccess,true);assert.equal(h.state().scores,h.scores);
 assert.equal(h.alerts.at(-1),'Sin conexión');assert.equal(h.refreshes(),0);
});
