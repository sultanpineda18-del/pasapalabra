'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {URL} = require('node:url');
const {BANK,changeBank,listBank,DATA_FILE} = require('./question-store');
const LETTERS = Object.keys(BANK);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const DURATION = [180,300,480,600,900];
const FLASH_MS = 700;
const failedAdmin = new Map();
const random = n => crypto.randomInt(n);
const pick = values => values[random(values.length)];

function json(res,status,data){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  });
  res.end(JSON.stringify(data));
}
function fail(res,status,message){ json(res,status,{error:message}); }
function allowedAdmin(password){
  const expected=process.env.PASAPALABRA_ADMIN_PASSWORD;
  if(typeof expected!=='string'||expected.length<12||typeof password!=='string'||password.length>256)return false;
  const left=crypto.createHash('sha256').update(password).digest();
  const right=crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left,right);
}
function adminAuthorized(req,data){
  const ip=req.socket.remoteAddress||'unknown';
  const now=Date.now();
  const attempts=(failedAdmin.get(ip)||[]).filter(time=>time>now-15*60*1000);
  if(attempts.length>=12)throw Object.assign(Error('Demasiados intentos. Vuelve a intentarlo en 15 minutos.'),{status:429});
  if(!allowedAdmin(data.password)){
    attempts.push(now); failedAdmin.set(ip,attempts);
    throw Object.assign(Error('Contraseña incorrecta o edición no configurada'),{status:403});
  }
  failedAdmin.delete(ip);
}

function roomCode(){
  for(let t=0;t<40;t++){
    let value='';
    for(let i=0;i<6;i++) value += ALPHABET[random(ALPHABET.length)];
    if(!rooms.has(value)) return value;
  }
  throw new Error('No se pudo crear sala');
}
function buildQuestions(previous = []){
  const socialLetters = LETTERS.filter(l=>BANK[l].some(q=>q.type==='ciudadania'));
  const shuffled = [...socialLetters];
  for(let i=shuffled.length-1;i>0;i--){
    const j=random(i+1);
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  const chosen = new Set(['P','Z',...shuffled.filter(l=>l!=='P'&&l!=='Z').slice(0,6)]);
  const usedAnswers = new Set();
  // Todas las rondas mantienen alguna pregunta sobre pobreza o protección social,
  // alternando la letra para no reducir la variedad del rosco.
  const povertyLetter=pick(['P','Z']);
  const povertyOptions=new Set(['Pobreza','Protección social','Reducción de la pobreza','Pobreza multidimensional']);
  return LETTERS.map((letter,i)=>{
    let options = BANK[letter].filter(q=>chosen.has(letter)?q.type==='ciudadania':q.type!=='ciudadania');
    if(letter===povertyLetter) options=options.filter(q=>povertyOptions.has(q.a));
    if(!options.length) options = BANK[letter];
    const previousId = previous[i]?.id;
    const previousAnswer = previous[i]?.a?.toLocaleLowerCase('es');
    const distinct = q => !usedAnswers.has(q.a.toLocaleLowerCase('es'));
    let available = options.filter(q=>q.id!==previousId && q.a.toLocaleLowerCase('es')!==previousAnswer && distinct(q));
    if(!available.length) available = options.filter(q=>q.id!==previousId && distinct(q));
    if(!available.length) available = options.filter(q=>distinct(q));
    if(!available.length) available = options;
    const result = pick(available);
    usedAnswers.add(result.a.toLowerCase());
    return result;
  });
}
function makeRoom(){
  const code = roomCode();
  const secret = crypto.randomBytes(24).toString('hex');
  const room = {
    code,
    secret,
    duration:600,
    remainingMs:600000,
    phase:'ready',
    deadline:null,
    round:1,
    questions:buildQuestions(),
    answers:Array(27).fill('pending'),
    index:0,
    showClue:false,
    showHint:false,
    showPublicAnswer:false,
    revealSummaryAtEnd:false,
    flash:null,
    version:1,
    updatedAt:Date.now(),
    clients:new Set(),
    timeout:null
  };
  rooms.set(code,room);
  return room;
}
function remaining(room){
  return room.phase==='running' ? Math.max(0, room.deadline - Date.now()) : room.remainingMs;
}
function stats(room){
  return {
    ok: room.answers.filter(x=>x==='ok').length,
    bad: room.answers.filter(x=>x==='bad').length,
    pending: room.answers.filter(x=>x!=='ok'&&x!=='bad').length
  };
}
function currentQuestion(room){ return room.questions[room.index]; }
function currentClue(room){
  const q = currentQuestion(room);
  const letter=LETTERS[room.index];
  // Se consideran equivalentes las vocales con y sin tilde; la Ñ mantiene su identidad.
  const normalizedStart=q.a.toLocaleUpperCase('es').replace(/[ÁÉÍÓÚÜ]/g,c=>({'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U'}[c]));
  return {
    letter,
    question: q.q.replace(/^(?:Contiene la|Empieza con) [A-ZÑ]:\s*/,''),
    rule: normalizedStart.startsWith(letter)?'Empieza con':'Contiene la',
    type: q.type
  };
}
function hint(q){
  const answer = q.a;
  return `Pista: ${Array.from(answer.replace(/[\s-]/g,'')).length} letras; empieza con «${answer.slice(0,2)}».`;
}
function finalSummary(room){
  return LETTERS.map((letter, index) => {
    const q = room.questions[index];
    return {
      letter,
      answer:q.a,
      question:q.q.replace(/^(?:Contiene la|Empieza con) [A-ZÑ]:\s*/,''),
      type:q.type,
      status:room.answers[index]
    };
  });
}
function publicState(room){
  const q = currentQuestion(room);
  const current = currentClue(room);
  return {
    code:room.code,
    phase:room.phase,
    round:room.round,
    duration:room.duration,
    remainingMs:remaining(room),
    serverNow:Date.now(),
    deadline:room.deadline,
    answers:room.answers,
    index:room.index,
    stats:stats(room),
    clue:room.showClue?current:null,
    extra:room.showClue&&room.showHint?hint(q):null,
    publicAnswer:room.showClue&&room.showPublicAnswer?q.a:null,
    revealSummaryAtEnd:room.revealSummaryAtEnd,
    summary:room.phase==='finished'&&room.revealSummaryAtEnd?finalSummary(room):null,
    flash:room.flash?.until>Date.now()?room.flash:null,
    version:room.version
  };
}
function hostState(room){
  const q = currentQuestion(room);
  return {
    ...publicState(room),
    clue:currentClue(room),
    extra:room.showHint?hint(q):null,
    showClue:room.showClue,
    showHint:room.showHint,
    showPublicAnswer:room.showPublicAnswer,
    revealSummaryAtEnd:room.revealSummaryAtEnd,
    answer:q.a,
    questionId:q.id
  };
}
function validSecret(room,secret){
  if(typeof secret!=='string'||secret.length!==room.secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(room.secret));
}
function sendEvent(res,data){ try{res.write(`event: state\ndata: ${JSON.stringify(data)}\n\n`);}catch{} }
function notify(room){
  room.version++;
  room.updatedAt=Date.now();
  for(const c of room.clients) sendEvent(c.res, c.host ? hostState(room) : publicState(room));
}
function scheduleTimer(room){
  if(room.timeout) clearTimeout(room.timeout);
  room.timeout = null;
  if(room.phase==='running') {
    room.timeout = setTimeout(()=>{
      if(room.phase==='running'&&remaining(room)===0){
        room.phase='finished';
        room.remainingMs=0;
        room.deadline=null;
        notify(room);
      }
    }, Math.max(1, remaining(room)+8));
  }
}
function moveNext(room){
  for(let step=1;step<=27;step++){
    const k=(room.index+step)%27;
    if(!['ok','bad'].includes(room.answers[k])){ room.index=k; return; }
  }
}
function apply(room,action,data){
  switch(action){
    case 'duration':
      if(room.phase!=='ready' || !DURATION.includes(data.duration)) throw Error('Duración inválida');
      room.duration=data.duration; room.remainingMs=data.duration*1000; break;
    case 'play':
      if(room.phase!=='ready'&&room.phase!=='paused') throw Error('La partida no está lista');
      room.deadline=Date.now()+room.remainingMs; room.phase='running'; break;
    case 'pause':
      if(room.phase!=='running') throw Error('La partida no está en marcha');
      room.remainingMs=remaining(room); room.deadline=null; room.phase='paused'; break;
    case 'select':
      if(room.phase==='finished'||!Number.isInteger(data.index)||data.index<0||data.index>=27) throw Error('Letra inválida');
      if(['ok','bad'].includes(room.answers[data.index])) throw Error('Letra ya respondida');
      room.index=data.index; room.showHint=false; room.showPublicAnswer=false; break;
    case 'clue': room.showClue=!!data.value; break;
    case 'hint': room.showHint=!!data.value; break;
    case 'publicAnswer': room.showPublicAnswer=!!data.value; break;
    case 'revealEnd': room.revealSummaryAtEnd=!!data.value; break;
    case 'mark': {
      if(room.phase!=='running' || !['ok','bad','passed'].includes(data.value)) throw Error('Primero inicia el cronómetro');
      room.answers[room.index]=data.value;
      room.flash = data.value!=='passed' ? {kind:data.value, until:Date.now()+FLASH_MS} : null;
      room.showHint=false;
      room.showPublicAnswer=false;
      if(stats(room).pending===0){
        room.remainingMs=remaining(room); room.deadline=null; room.phase='finished';
      } else {
        moveNext(room);
      }
      break;
    }
    case 'new': {
      const old=room.questions;
      room.questions=buildQuestions(old);
      room.round+=1;
      room.answers=Array(27).fill('pending');
      room.index=0;
      room.remainingMs=room.duration*1000;
      room.deadline=null;
      room.phase='ready';
      room.showClue=false;
      room.showHint=false;
      room.showPublicAnswer=false;
      room.flash=null;
      break;
    }
    default: throw Error('Acción no reconocida');
  }
  if(room.phase==='running'&&remaining(room)===0){
    room.remainingMs=0; room.deadline=null; room.phase='finished';
  }
  scheduleTimer(room);
  notify(room);
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let str='';
    req.on('data', chunk=>{
      str+=chunk;
      if(str.length>12000){ reject(Error('Solicitud demasiado grande')); req.destroy(); }
    });
    req.on('end',()=>{ try{ resolve(JSON.parse(str||'{}')); }catch{ reject(Error('JSON inválido')); } });
    req.on('error',reject);
  });
}
function events(req,res,room,host){
  res.writeHead(200,{
    'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no',
    'Referrer-Policy':'no-referrer'
  });
  res.write('retry: 1500\n\n');
  const c={res,host}; room.clients.add(c);
  sendEvent(res, host ? hostState(room) : publicState(room));
  const keep=setInterval(()=>{ try{ res.write(': vivo\n\n'); }catch{} },18000);
  const clean=()=>{ clearInterval(keep); room.clients.delete(c); };
  req.on('close',clean); res.on('close',clean);
}
const CONTENT_TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png'};
function staticFile(res,pathname){
  const file=pathname==='/'?'/index.html':pathname==='/banco'?'/banco.html':pathname;
  if(!['/index.html','/style.css','/app.js','/favicon.svg','/banco.html','/banco.css','/banco.js'].includes(file)) return fail(res,404,'Página no encontrada');
  const full=path.join(__dirname,'public',file);
  fs.readFile(full,(err,buf)=>{
    if(err) return fail(res,404,'No encontrado');
    res.writeHead(200,{
      'Content-Type':CONTENT_TYPES[path.extname(full)]||'application/octet-stream',
      'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    });
    res.end(buf);
  });
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const pathname=url.pathname;
  if(req.method==='GET'&&pathname==='/api/bank')return json(res,200,listBank());
  if(req.method==='GET'&&pathname==='/api/bank/status')return json(res,200,{editingEnabled:typeof process.env.PASAPALABRA_ADMIN_PASSWORD==='string'&&process.env.PASAPALABRA_ADMIN_PASSWORD.length>=12,persistentStorage:process.env.QUESTION_BANK_PATH===DATA_FILE&&DATA_FILE.startsWith('/data/')});
  if(req.method==='POST'&&pathname.startsWith('/api/admin/')){
    try{
      const data=await readJson(req);
      adminAuthorized(req,data);
      if(pathname==='/api/admin/verify')return json(res,200,{ok:true});
      let mode;
      if(pathname==='/api/admin/questions/add') mode='add';
      else if(pathname==='/api/admin/questions/edit') mode='edit';
      else if(pathname==='/api/admin/questions/delete') mode='remove';
      else return fail(res,404,'Acción no encontrada');
      const result=changeBank(mode,data);
      return json(res,200,{ok:true,question:result,total:listBank().total});
    }catch(err){return fail(res,err.status||400,err.message||'No se pudo guardar');}
  }
  if(req.method==='GET'&&pathname==='/salud') return json(res,200,{ok:true,service:'pasapalabra-online'});
  if(req.method==='POST'&&pathname==='/api/rooms'){
    if(rooms.size>=300) return fail(res,503,'Se alcanzó el límite de salas activas');
    const room=makeRoom();
    return json(res,201,{code:room.code,key:room.secret,control:`/?sala=${room.code}&rol=control&clave=${room.secret}`,publico:`/?sala=${room.code}&rol=publico`});
  }
  const match=pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(events|action))?$/);
  if(match){
    const room=rooms.get(match[1]);
    if(!room) return fail(res,404,'Esta sala no existe o ya terminó');
    const part=match[2];
    if(req.method==='GET'&&part==='events'){
      const host=url.searchParams.get('rol')==='control';
      if(host&&!validSecret(room,url.searchParams.get('clave'))) return fail(res,403,'Clave de control incorrecta');
      return events(req,res,room,host);
    }
    if(req.method==='GET'&&!part){
      const host=validSecret(room,url.searchParams.get('clave'));
      return json(res,200,host?hostState(room):publicState(room));
    }
    if(req.method==='POST'&&part==='action'){
      try{
        const data=await readJson(req);
        if(!validSecret(room,data.clave)) return fail(res,403,'No tienes permiso para controlar esta sala');
        if(room.phase==='running'&&remaining(room)===0){ room.phase='finished'; room.remainingMs=0; room.deadline=null; notify(room); }
        try { apply(room,data.action,data); return json(res,200,{ok:true,version:room.version}); }
        catch(err){ return fail(res,400,err.message); }
      } catch(err) { return fail(res,400,err.message); }
    }
    return fail(res,405,'Método no admitido');
  }
  if(req.method==='GET') return staticFile(res,pathname);
  return fail(res,404,'No encontrado');
});
const janitor=setInterval(()=>{
  const now=Date.now();
  for(const [code,room] of rooms){
    if(now-room.updatedAt>6*60*60*1000){
      for(const c of room.clients){ try{ c.res.end(); }catch{} }
      if(room.timeout) clearTimeout(room.timeout);
      rooms.delete(code);
    }
  }
},15*60*1000);
janitor.unref();
if(require.main===module){ server.listen(PORT,HOST,()=>console.log(`Pasapalabra online listo en http://localhost:${PORT}`)); }
module.exports={server,rooms,buildQuestions,LETTERS,apply,makeRoom,publicState,hostState};
