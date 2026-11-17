'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initial = require('./banco-preguntas.json');
const letters = Object.keys(initial);
const TYPES = new Set(['ciudadania', 'entretenimiento']);
const POVERTY = new Set(['Pobreza','Protección social','Reducción de la pobreza','Pobreza multidimensional']);
const DATA_FILE = process.env.QUESTION_BANK_PATH || path.join(__dirname, 'data', 'banco-preguntas.json');
const BANK = structuredClone(initial);

function checkData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 27) throw Error('La base de preguntas tiene una estructura incorrecta');
  const allIds = new Set();
  for (const letter of letters) {
    if (!Array.isArray(data[letter]) || data[letter].length < 1) throw Error(`La letra ${letter} no tiene preguntas`);
    for (const q of data[letter]) {
      if (!q || typeof q.id!=='string' || typeof q.q!=='string' || typeof q.a!=='string' || !TYPES.has(q.type)) throw Error(`Hay una pregunta incorrecta en ${letter}`);
      if (allIds.has(q.id)) throw Error(`Identificador duplicado: ${q.id}`);
      allIds.add(q.id);
    }
  }
  const socialLetters = letters.filter(l=>data[l].some(q=>q.type==='ciudadania'));
  if (socialLetters.length < 8) throw Error('Se necesitan conceptos de ciudadanía en al menos 8 letras');
  for(const letter of ['P','Z']) {
    if(!data[letter].some(q=>q.type==='ciudadania'&&POVERTY.has(q.a))) throw Error(`Conserva un concepto de pobreza o protección social en la letra ${letter}`);
  }
}
function atomicSave(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), {recursive:true});
  const tmp = `${DATA_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});
    fs.renameSync(tmp,DATA_FILE);
  } finally {
    try {fs.unlinkSync(tmp);}catch{}
  }
}
if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
  checkData(saved);
  for(const letter of letters) BANK[letter] = saved[letter];
} else {
  checkData(BANK);
  atomicSave(BANK);
}
function normalizeForLetter(s) {
  // Remove vocal accents but preserve Ñ as a distinct letter.
  return s.toLocaleUpperCase('es').replace(/[ÁÉÍÓÚÜ]/g,c=>({'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U'}[c]));
}
function cleanPayload(payload, letter) {
  const question = String(payload.question||'').trim().replace(/\s+/g,' ');
  const answer = String(payload.answer||'').trim().replace(/\s+/g,' ');
  const type = payload.type;
  if(question.length<10||question.length>350) throw Error('La pista debe contener entre 10 y 350 caracteres');
  if(answer.length<2||answer.length>90) throw Error('La respuesta debe contener entre 2 y 90 caracteres');
  if(!TYPES.has(type)) throw Error('Categoría no válida');
  if(!normalizeForLetter(answer).includes(letter)) throw Error(`La respuesta debe contener la letra ${letter}`);
  return {q:question,a:answer,type};
}
function changeBank(mode, input) {
  const letter = input.letter;
  if(!letters.includes(letter)) throw Error('Letra incorrecta');
  const next = structuredClone(BANK);
  const items = next[letter];
  let changed;
  if(mode==='add') {
    const q=cleanPayload(input,letter);
    changed={id:`${letter}-${crypto.randomBytes(8).toString('hex')}`,...q};
    items.push(changed);
  } else {
    const i=items.findIndex(q=>q.id===input.id);
    if(i<0) throw Error('No se encontró la pregunta');
    if(mode==='edit'){
      changed={...items[i],...cleanPayload(input,letter)};
      items[i]=changed;
    }else if(mode==='remove'){
      if(items.length===1) throw Error('No puedes dejar una letra sin preguntas');
      changed=items.splice(i,1)[0];
    }else throw Error('Acción incorrecta');
  }
  if(items.some((q,i)=>items.findIndex(x=>x.q.toLowerCase()===q.q.toLowerCase())!==i)) throw Error('Ya existe una pregunta idéntica en esa letra');
  checkData(next);
  // Save before changing live game data; failure leaves everything untouched.
  atomicSave(next);
  for(const l of letters) BANK[l]=next[l];
  return changed;
}
function listBank(){
  return {letters, total:letters.reduce((n,l)=>n+BANK[l].length,0), categories:{ciudadania:letters.reduce((n,l)=>n+BANK[l].filter(q=>q.type==='ciudadania').length,0),entretenimiento:letters.reduce((n,l)=>n+BANK[l].filter(q=>q.type==='entretenimiento').length,0)},questions:BANK};
}
module.exports={BANK,DATA_FILE,changeBank,listBank};
