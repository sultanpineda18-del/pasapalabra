const test = require('node:test');
const assert = require('node:assert/strict');
const {server,buildQuestions,LETTERS} = require('../server');
const BANK=require('../banco-preguntas.json');
const base = async () => {
  if (!server.listening) await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return `http://127.0.0.1:${server.address().port}`;
};
let origin;
test.before(async()=>{origin=await base()});
test.after(async()=>{await new Promise(r=>server.close(r))});
test('banco de preguntas y nuevas rondas',()=>{
  assert.equal(LETTERS.length,27);
  assert.equal(LETTERS.reduce((n,l)=>n+BANK[l].length,0),1350);
  assert.ok(LETTERS.every(l=>BANK[l].length===50));
  assert.equal(new Set(LETTERS.flatMap(l=>BANK[l].map(q=>q.q.toLowerCase()))).size,1350);
  for (let i=0;i<50;i++) {
    const qs=buildQuestions();
    assert.equal(qs.length,27);
    assert.equal(qs.filter(q=>q.type==='ciudadania').length,8);
    assert.ok(qs.some(q=>['Pobreza','Protección social','Reducción de la pobreza','Pobreza multidimensional'].includes(q.a)),'Cada ronda incluye un concepto de pobreza o protección social');
    assert.equal(new Set(qs.map(q=>q.a.toLowerCase())).size,27);
    const again=buildQuestions(qs);
    assert.equal(qs.filter((q,j)=>q.id===again[j].id).length,0);
    assert.equal(qs.filter((q,j)=>q.a===again[j].a).length,0);
  }
});
test('crear sala, consultar estados, protección de control y cronómetro',async()=>{
  const made=await fetch(origin+'/api/rooms',{method:'POST'});
  assert.equal(made.status,201);
  const {code,key}=await made.json();
  assert.match(code,/^[A-Z2-9]{6}$/);
  assert.equal(key.length,48);
  const publicState=await (await fetch(`${origin}/api/rooms/${code}`)).json();
  assert.equal(publicState.stats.pending,27);
  assert.equal(publicState.answer,undefined);
  assert.equal(publicState.clue,null);
  const hostState=await (await fetch(`${origin}/api/rooms/${code}?clave=${key}`)).json();
  assert.equal(typeof hostState.answer,'string');
  assert.equal(hostState.clue.letter,'A');
  const forbidden=await fetch(`${origin}/api/rooms/${code}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'play',clave:'false'})});
  assert.equal(forbidden.status,403);
  const act=async(action,fields={})=>{
    const res=await fetch(`${origin}/api/rooms/${code}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,clave:key,...fields})});
    assert.equal(res.status,200,`${action} ${await res.text().catch(()=> '')}`);
  };
  await act('duration',{duration:180});
  await act('clue',{value:true});
  assert.equal((await (await fetch(`${origin}/api/rooms/${code}`)).json()).clue.letter,'A');
  await act('play');
  await act('mark',{value:'ok'});
  const started=await (await fetch(`${origin}/api/rooms/${code}`)).json();
  assert.equal(started.stats.ok,1);
  assert.equal(started.index,1);
  assert.equal(started.flash.kind,'ok');
  await act('pause');
  const paused=await (await fetch(`${origin}/api/rooms/${code}`)).json();
  assert.equal(paused.phase,'paused');
  await act('new');
  const renewed=await (await fetch(`${origin}/api/rooms/${code}`)).json();
  assert.equal(renewed.phase,'ready');
  assert.equal(renewed.round,2);
  assert.equal(renewed.stats.pending,27);
});
test('recursos públicos disponibles y SSE sincronizable',async()=>{
  for(const name of ['/','/style.css','/app.js','/favicon.svg','/salud']) {
    const r=await fetch(origin+name);
    assert.equal(r.status,200,name);
  }
  const create=await (await fetch(origin+'/api/rooms',{method:'POST'})).json();
  const r=await fetch(`${origin}/api/rooms/${create.code}/events?rol=publico`,{headers:{Accept:'text/event-stream'}});
  assert.equal(r.status,200);
  const reader=r.body.getReader();
  const part=await reader.read();
  assert.match(new TextDecoder().decode(part.value),/event: state/);
  reader.cancel();
});
