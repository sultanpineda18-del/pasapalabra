(() => {
'use strict';
const $ = id=>document.getElementById(id);
const letters = 'A B C D E F G H I J K L M N Ñ O P Q R S T U V W X Y Z'.split(' ');
let bank=null;
let password=null; // Held only in memory; never saved to localStorage or cookies.
let mode='add', editingId=null, previousLetter=null;
let page=1;
const PAGE_SIZE=30;
let toastTimer;
function toast(message){
  $('toast').textContent=message;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);
}
async function api(url, options={}){
  const r=await fetch(url,{cache:'no-store',...options});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||'No se pudo completar la solicitud');
  return body;
}
async function loadBank(){
  bank=await api('/api/bank');
  $('totalCount').textContent=bank.total.toLocaleString('es-CL');
  render();
}
function filtered(){
  if(!bank)return [];
  const search=$('search').value.trim().toLocaleLowerCase('es');
  const letter=$('letterFilter').value;
  const type=$('typeFilter').value;
  const items=[];
  for(const l of bank.letters){
    if(letter!=='all' && l!==letter)continue;
    for(const q of bank.questions[l]){
      if(type!=='all'&&q.type!==type)continue;
      if(search && !`${q.q} ${q.a} ${l}`.toLocaleLowerCase('es').includes(search))continue;
      items.push({letter:l,...q});
    }
  }
  return items;
}
function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
function render(){
  const items=filtered();
  const maxPage=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  page=Math.min(page,maxPage);
  $('resultsCount').textContent=`${items.length.toLocaleString('es-CL')} preguntas encontradas`;
  $('pageLabel').textContent=`Página ${page} de ${maxPage}`;
  $('prevBtn').disabled=page<=1;
  $('nextBtn').disabled=page>=maxPage;
  $('cards').replaceChildren();
  for(const item of items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
    const card=el('article','q-card');
    const head=el('div','q-head');
    head.append(el('span','letter',item.letter),el('span',`category ${item.type==='ciudadania'?'social':''}`,item.type==='ciudadania'?'Comunidad y derechos':'Cultura general'));
    const question=el('p','',item.q);
    const answer=el('div','q-answer');
    answer.append(el('span','','Respuesta:'),document.createTextNode(item.a));
    card.append(head,question,answer);
    if(password){
      const actions=el('div','q-actions');
      const edit=el('button','btn secondary','Editar');
      const remove=el('button','btn danger','Eliminar');
      edit.addEventListener('click',()=>openEdit(item));
      remove.addEventListener('click',()=>removeQuestion(item));
      actions.append(edit,remove);card.append(actions);
    }
    $('cards').append(card);
  }
}
function setEditing(enabled){
  $('unlockBtn').classList.toggle('hidden',enabled);
  $('lockBtn').classList.toggle('hidden',!enabled);
  $('editBar').classList.toggle('hidden',!enabled);
  render();
}
function openEdit(item=null){
  if(!password)return;
  mode=item?'edit':'add';
  editingId=item?.id||null;
  previousLetter=item?.letter||null;
  $('editHeading').textContent=item?'Editar pregunta':'Nueva pregunta';
  $('editLetter').value=item?.letter||($('letterFilter').value!=='all' ? $('letterFilter').value:'A');
  $('editLetter').disabled=!!item;
  $('editQuestion').value=item?.q||'';
  $('editAnswer').value=item?.a||'';
  $('editType').value=item?.type||'entretenimiento';
  $('editError').classList.add('hidden');
  $('editDialog').showModal();
  $('editQuestion').focus();
}
async function removeQuestion(item){
  if(!password||!window.confirm(`¿Eliminar la pregunta de la letra ${item.letter}?\n\n${item.q}`))return;
  try{
    await api('/api/admin/questions/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,letter:item.letter,id:item.id})});
    toast('Pregunta eliminada');await loadBank();
  }catch(e){toast(e.message)}
}
function downloadJson(){
  if(!bank)return;
  const blob=new Blob([JSON.stringify(bank.questions,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='pasapalabra-respaldo-preguntas.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
function setup(){
  const lf=$('letterFilter');const edit=$('editLetter');
  for(const letter of letters){
    lf.add(new Option(`Letra ${letter}`,letter));
    edit.add(new Option(`Letra ${letter}`,letter));
  }
  for(const id of ['search','letterFilter','typeFilter']){
    $(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render()});
  }
  $('prevBtn').addEventListener('click',()=>{page--;render();window.scrollTo({top:300,behavior:'smooth'})});
  $('nextBtn').addEventListener('click',()=>{page++;render();window.scrollTo({top:300,behavior:'smooth'})});
  $('exportBtn').addEventListener('click',downloadJson);
  $('unlockBtn').addEventListener('click',()=>{$('passwordInput').value='';$('passwordError').classList.add('hidden');$('passwordDialog').showModal();$('passwordInput').focus()});
  $('cancelPassword').addEventListener('click',()=>$('passwordDialog').close());
  $('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const candidate=$('passwordInput').value;
    const login=$('loginBtn');login.disabled=true;
    try{
      await api('/api/admin/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:candidate})});
      password=candidate;
      $('passwordInput').value='';
      $('passwordDialog').close();
      setEditing(true);toast('Edición habilitada');
    }catch(e){$('passwordError').textContent=e.message;$('passwordError').classList.remove('hidden')}
    finally{login.disabled=false}
  });
  $('lockBtn').addEventListener('click',()=>{password=null;setEditing(false);toast('Edición bloqueada')});
  $('addBtn').addEventListener('click',()=>openEdit());
  $('cancelEdit').addEventListener('click',()=>$('editDialog').close());
  $('editForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const data={password,letter:previousLetter||$('editLetter').value,id:editingId,question:$('editQuestion').value,answer:$('editAnswer').value,type:$('editType').value};
    const save=$('saveEditBtn');save.disabled=true;
    try{
      await api(`/api/admin/questions/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      $('editDialog').close();toast(mode==='add'?'Pregunta agregada':'Pregunta actualizada');await loadBank();
    }catch(e){$('editError').textContent=e.message;$('editError').classList.remove('hidden')}
    finally{save.disabled=false}
  });
  loadBank().catch(e=>toast('No se pudo cargar la base: '+e.message));
  api('/api/bank/status').then(s=>{if(!s.editingEnabled)toast('Configura PASAPALABRA_ADMIN_PASSWORD en Railway para habilitar la edición')}).catch(()=>{});
}
setup();
})();
