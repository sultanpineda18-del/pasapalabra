'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {URL} = require('node:url');
const BANK = require('./banco-preguntas.json');
const LETTERS = Object.keys(BANK);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const DURATION = [180,300,480,600,900];
const FLASH_MS = 700;
const random = n => crypto.randomInt(n);
const pick = values => values[random(values.length)];
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));}
function fail(res,status,message){json(res,status,{error:message})}
function roomCode(){for(let t=0;t<40;t++){let value='';for(let i=0;i<6;i++)value+=ALPHABET[random(ALPHABET.length)];if(!rooms.has(value))return value}throw new Error('No se pudo crear sala')}
function buildQuestions(previous = []){
  const socialLetters = LETTERS.filter(l=>BANK[l].some(q=>q.type==='ciudadania'));
  const shuffled = [...socialLetters]; for(let i=shuffled.length-1;i>0;i--){const j=random(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  // Siempre incluir una pista de participación/pobreza mediante las letras P y Z.
  const chosen = new Set(['P','Z',...shuffled.filter(l=>l!=='P'&&l!=='Z').slice(0,6)]);
  const usedAnswers = new Set();
  return LETTERS.map((letter,i)=>{
    let options = BANK[letter].filter(q=>chosen.has(letter)?q.type==='ciudadania':q.type!=='ciudadania');
    if(letter==='Z')options=options.filter(q=>q.a===(usedAnswers.has('pobreza')?'Voz':'Pobreza'));
    if(!options.length)options=BANK[letter];
    const previousId=previous[i]?.id;
    let available=options.filter(q=>q.id!==previousId && !usedAnswers.has(q.a.toLowerCase()));
    if(!available.length)available=options.filter(q=>q.id!==previousId);
    if(!available.length)available=options;
    const result=pick(available);usedAnswers.add(result.a.toLowerCase());return result;
  });
}
function makeRoom(){
  const code=roomCode(),secret=crypto.randomBytes(24).toString('hex');
  const room={code,secret,duration:600,remainingMs:600000,phase:'ready',deadline:null,round:1,questions:buildQuestions(),answers:Array(27).fill('pending'),index:0,showClue:false,showHint:false,showAnswer:false,flash:null,version:1,updatedAt:Date.now(),clients:new Set(),timeout:null};
  rooms.set(code,room);return room;
}
function remaining(room){return room.phase==='running'?Math.max(0,room.deadline-Date.now()):room.remainingMs}
function stats(room){return {ok:room.answers.filter(x=>x==='ok').length,bad:room.answers.filter(x=>x==='bad').length,pending:room.answers.filter(x=>x!=='ok'&&x!=='bad').length};}
function currentClue(room){let q=room.questions[room.index];return {letter:LETTERS[room.index],question:q.q.replace(/^Contiene la [ÑXZO]:\s*/,''),rule:q.a.normalize('NFC').toLocaleUpperCase('es').startsWith(LETTERS[room.index])?'Empieza con':'Contiene la',type:q.type};}
function hint(q){const answer=q.a;return `Pista: ${Array.from(answer.replace(/[\s-]/g,'')).length} letras; empieza con «${answer.slice(0,2)}».`}
function publicState(room){
 const q=room.questions[room.index],current=currentClue(room);
 return {code:room.code,phase:room.phase,round:room.round,duration:room.duration,remainingMs:remaining(room),serverNow:Date.now(),deadline:room.deadline,answers:room.answers,index:room.index,stats:stats(room),clue:room.showClue?current:null,extra:room.showClue&&room.showHint?hint(q):null,flash:room.flash?.until>Date.now()?room.flash:null,version:room.version};
}
function hostState(room){const q=room.questions[room.index];return {...publicState(room),clue:currentClue(room),extra:room.showHint?hint(q):null,showClue:room.showClue,showHint:room.showHint,showAnswer:room.showAnswer,answer:q.a,questionId:q.id};}
function validSecret(room,secret){if(typeof secret!=='string'||secret.length!==room.secret.length)return false;return crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(room.secret));}
function sendEvent(res,data){try{res.write(`event: state\ndata: ${JSON.stringify(data)}\n\n`)}catch{}}
function notify(room){room.version++;room.updatedAt=Date.now();for(const c of room.clients)sendEvent(c.res,c.host?hostState(room):publicState(room));}
function scheduleTimer(room){if(room.timeout)clearTimeout(room.timeout);room.timeout=null;if(room.phase==='running')room.timeout=setTimeout(()=>{if(room.phase==='running'&&remaining(room)===0){room.phase='finished';room.remainingMs=0;room.deadline=null;notify(room)}},Math.max(1,remaining(room)+8));}
function moveNext(room){for(let step=1;step<=27;step++){const k=(room.index+step)%27;if(!['ok','bad'].includes(room.answers[k])){room.index=k;return;}}}
function apply(room,action,data){
 switch(action){
  case 'duration': if(room.phase!=='ready'||!DURATION.includes(data.duration))throw Error('Duración inválida');room.duration=data.duration;room.remainingMs=data.duration*1000;break;
  case 'play': if(room.phase!=='ready'&&room.phase!=='paused')throw Error('La partida no está lista');room.deadline=Date.now()+room.remainingMs;room.phase='running';break;
  case 'pause': if(room.phase!=='running')throw Error('La partida no está en marcha');room.remainingMs=remaining(room);room.deadline=null;room.phase='paused';break;
  case 'select': if(room.phase==='finished'||!Number.isInteger(data.index)||data.index<0||data.index>=27)throw Error('Letra inválida');if(['ok','bad'].includes(room.answers[data.index]))throw Error('Letra ya respondida');room.index=data.index;room.showHint=false;room.showAnswer=false;break;
  case 'clue': room.showClue=!!data.value;break;
  case 'hint': room.showHint=!!data.value;break;
  case 'answer': room.showAnswer=!!data.value;break;
  case 'mark': {
   if(room.phase!=='running'||!['ok','bad','passed'].includes(data.value))throw Error('Primero inicia el cronómetro');
   room.answers[room.index]=data.value;
   if(data.value!=='passed')room.flash={kind:data.value,until:Date.now()+FLASH_MS};
   else room.flash=null;
   room.showHint=false;room.showAnswer=false;
   if(stats(room).pending===0){room.remainingMs=remaining(room);room.deadline=null;room.phase='finished'}
   else moveNext(room);
   break;
  }
  case 'new': {
   const old=room.questions;room.questions=buildQuestions(old);room.round+=1;room.answers=Array(27).fill('pending');room.index=0;room.remainingMs=room.duration*1000;room.deadline=null;room.phase='ready';room.showClue=false;room.showHint=false;room.showAnswer=false;room.flash=null;break;
  }
  default: throw Error('Acción no reconocida');
 }
 if(room.phase==='running'&&remaining(room)===0){room.remainingMs=0;room.deadline=null;room.phase='finished';}
 scheduleTimer(room);notify(room);
}
function readJson(req){return new Promise((resolve,reject)=>{let str='';req.on('data',chunk=>{str+=chunk;if(str.length>12000){reject(Error('Solicitud demasiado grande'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(str||'{}'))}catch{reject(Error('JSON inválido'))}});req.on('error',reject)})}
function events(req,res,room,host){
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer'});
 res.write('retry: 1500\n\n');const c={res,host};room.clients.add(c);
 sendEvent(res,host?hostState(room):publicState(room));
 const keep=setInterval(()=>{try{res.write(': vivo\n\n')}catch{}},18000);
 const clean=()=>{clearInterval(keep);room.clients.delete(c)};req.on('close',clean);res.on('close',clean);
}
const CONTENT_TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png'};
function staticFile(res,pathname){
 const file=pathname==='/'?'/index.html':pathname;
 if(!['/index.html','/style.css','/app.js','/favicon.svg'].includes(file))return fail(res,404,'Página no encontrada');
 const full=path.join(__dirname,'public',file);
 fs.readFile(full,(err,buf)=>{if(err)return fail(res,404,'No encontrado');res.writeHead(200,{'Content-Type':CONTENT_TYPES[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(buf)});
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
 if(req.method==='GET'&&pathname==='/salud')return json(res,200,{ok:true,service:'pasapalabra-online'});
 if(req.method==='POST'&&pathname==='/api/rooms'){
  if(rooms.size>=300)return fail(res,503,'Se alcanzó el límite de salas activas');
  const room=makeRoom();return json(res,201,{code:room.code,key:room.secret,control:`/?sala=${room.code}&rol=control&clave=${room.secret}`,publico:`/?sala=${room.code}&rol=publico`});
 }
 const match=pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(events|action))?$/);
 if(match){
  const room=rooms.get(match[1]);if(!room)return fail(res,404,'Esta sala no existe o ya terminó');
  const part=match[2];
  if(req.method==='GET'&&part==='events'){
   const host=url.searchParams.get('rol')==='control';
   if(host&&!validSecret(room,url.searchParams.get('clave')))return fail(res,403,'Clave de control incorrecta');
   return events(req,res,room,host);
  }
  if(req.method==='GET'&&!part){const host=validSecret(room,url.searchParams.get('clave'));return json(res,200,host?hostState(room):publicState(room));}
  if(req.method==='POST'&&part==='action'){
   try{const data=await readJson(req);
    if(!validSecret(room,data.clave))return fail(res,403,'No tienes permiso para controlar esta sala');
    // Before action, close an expired round instead of allowing a late answer.
    if(room.phase==='running'&&remaining(room)===0){room.phase='finished';room.remainingMs=0;room.deadline=null;notify(room);}
    try{apply(room,data.action,data);return json(res,200,{ok:true,version:room.version});}catch(err){return fail(res,400,err.message)}
   }catch(err){return fail(res,400,err.message)}
  }
  return fail(res,405,'Método no admitido');
 }
 if(req.method==='GET')return staticFile(res,pathname);
 return fail(res,404,'No encontrado');
});
// Salas temporales: sin base de datos. Se pierden si el servicio se reinicia.
const janitor=setInterval(()=>{const now=Date.now();for(const [code,room] of rooms){if(now-room.updatedAt>6*60*60*1000){for(const c of room.clients){try{c.res.end()}catch{}}if(room.timeout)clearTimeout(room.timeout);rooms.delete(code)}}},15*60*1000);
janitor.unref();
if(require.main===module){server.listen(PORT,HOST,()=>console.log(`Pasapalabra online listo en http://localhost:${PORT}`))}
module.exports={server,rooms,buildQuestions,LETTERS,apply,makeRoom,publicState,hostState};
