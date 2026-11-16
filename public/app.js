(() => {
  'use strict';
  const letters = 'A B C D E F G H I J K L M N Ñ O P Q R S T U V W X Y Z'.split(' ');
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(window.location.search);
  const code = (qs.get('sala') || '').trim().toUpperCase();
  const secret = qs.get('clave') || '';
  const isHost = qs.get('rol') === 'control' && /^[a-f0-9]{48}$/i.test(secret);
  const hasRoom = /^[A-Z2-9]{6}$/.test(code);
  let state = null;
  let stream = null;
  let busy = false;
  let timeOffset = 0;
  let flashTimer = 0;
  let toastTimer = 0;

  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3500);
  }
  function setConnection(label, kind) {
    $('connectionLabel').textContent = label;
    $('topStatus').className = `top-status ${kind || ''}`;
  }
  function urlFor(role) {
    const base = `${window.location.origin}/`;
    return role === 'control' ? `${base}?sala=${encodeURIComponent(code)}&rol=control&clave=${encodeURIComponent(secret)}` : `${base}?sala=${encodeURIComponent(code)}&rol=publico`;
  }
  function formatTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  }
  function remaining() {
    if (!state) return 600000;
    return state.phase === 'running' && state.deadline ? Math.max(0, state.deadline - (Date.now() + timeOffset)) : state.remainingMs;
  }
  function makeRing() {
    const group = $('lettersGroup');
    const ns = 'http://www.w3.org/2000/svg';
    letters.forEach((l,i) => {
      const angle = (Math.PI * 2 * i / letters.length) - Math.PI / 2;
      const x = 320 + 266 * Math.cos(angle), y = 320 + 266 * Math.sin(angle);
      const g = document.createElementNS(ns,'g');
      g.classList.add('letter-node','pending');
      g.setAttribute('data-index', String(i));
      const c = document.createElementNS(ns,'circle');
      c.setAttribute('cx',x.toFixed(2)); c.setAttribute('cy',y.toFixed(2)); c.setAttribute('r','27.8');
      const t = document.createElementNS(ns,'text');
      t.setAttribute('x',x.toFixed(2)); t.setAttribute('y',(y+8).toFixed(2)); t.setAttribute('text-anchor','middle');
      t.textContent = l;
      g.append(c,t);
      if (isHost) g.addEventListener('click',()=>{ if (state && !['ok','bad'].includes(state.answers[i])) action('select',{index:i}); });
      group.append(g);
    });
    const buttons = $('letterButtons');
    letters.forEach((l,i) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = l; btn.title = `Elegir letra ${l}`;
      btn.dataset.index = i; btn.addEventListener('click',()=>action('select',{index:i}));
      buttons.append(btn);
    });
    const prev = $('previewOrbit');
    letters.forEach((l,i)=>{
      const a = 2*Math.PI*i/letters.length;
      const d = document.createElement('div');
      d.className = 'preview-dot'; d.textContent = l;
      d.style.setProperty('--sin', Math.sin(a).toFixed(5));
      d.style.setProperty('--cos', Math.cos(a).toFixed(5));
      prev.append(d);
    });
  }
  function publicUi() {
    $('welcome').classList.add('hidden');
    $('arena').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('roleTag').textContent = isHost ? 'CONTROL' : 'PÚBLICO';
    $('playGrid').classList.toggle('public-mode', !isHost);
    $('playGrid').classList.toggle('host-role', isHost);
    $('hostPanel').classList.toggle('hidden', !isHost);
    if (isHost) {
      $('publicUrl').value = urlFor('publico');
      $('controlUrl').value = urlFor('control');
      $('openPublic').href = urlFor('publico');
    }
    setConnection('Conectando con la partida…');
    connect();
  }
  function renderLetters() {
    const nodes = $('lettersGroup').children;
    for (let i=0;i<letters.length;i++) {
      const status = state.answers[i];
      nodes[i].setAttribute('class', `letter-node ${status} ${i===state.index?'active':''}`);
    }
    if (isHost) {
      for (const btn of $('letterButtons').children) {
        const i = Number(btn.dataset.index);
        btn.className = `${state.answers[i]} ${i===state.index?'active':''}`;
        btn.disabled = ['ok','bad'].includes(state.answers[i]) || state.phase==='finished';
      }
    }
  }
  function renderFlash(){
    clearTimeout(flashTimer);
    const f=state?.flash;
    const now=Date.now()+timeOffset;
    if (f && f.until>now) {
      $('feedback').setAttribute('visibility','visible');
      const yes=f.kind==='ok';
      $('feedbackBg').setAttribute('fill',yes?'#12865e':'#bf3e52');
      $('feedbackIcon').textContent=yes?'✓':'✕';
      $('feedbackWord').textContent=yes?'¡CORRECTO!':'¡INCORRECTO!';
      flashTimer=setTimeout(()=>$('feedback').setAttribute('visibility','hidden'),Math.max(0,f.until-now));
    } else $('feedback').setAttribute('visibility','hidden');
  }
  function renderSummary(items) {
    const grid = $('summaryGrid');
    grid.innerHTML = '';
    for (const item of items || []) {
      const card = document.createElement('div');
      card.className = `summary-item ${item.status || 'pending'}`;
      card.innerHTML = `<span class="summary-letter">${item.letter}</span><div class="summary-body"><strong>${item.answer}</strong><small>${item.type==='ciudadania'?'Comunidad y derechos':'Cultura general'}</small></div>`;
      grid.append(card);
    }
  }
  function renderFinale() {
    const show = state.phase === 'finished' && !isHost;
    $('finaleOverlay').classList.toggle('hidden', !show);
    if (show) {
      const noTime = remaining() <= 0;
      $('finaleSubtext').textContent = noTime ? 'Se terminó el tiempo. ¡Gracias por su participación!' : 'Gracias por jugar, compartir y participar en comunidad.';
    }
    const showSummary = state.phase === 'finished' && !!state.revealSummaryAtEnd && Array.isArray(state.summary);
    $('finalSummary').classList.toggle('hidden', !showSummary);
    if (showSummary) renderSummary(state.summary);
  }
  function render() {
    if (!state) return;
    $('roundLabel').textContent = `Partida ${state.round}`;
    const phases={ready:'Esperando inicio',running:'En juego',paused:'Pausado',finished:'Partida terminada'};
    $('gameStateLabel').textContent = phases[state.phase] || 'En preparación';
    $('centerScore').textContent = `${state.stats.ok} ACIERTOS · ${state.stats.pending} PENDIENTES`;
    $('centerTimer').textContent = formatTime(remaining());
    renderLetters();
    renderFlash();
    renderFinale();
    const clue = state.clue;
    const publicHas = clue && (!isHost || state.showClue);
    $('publicQuestion').classList.toggle('hidden', !publicHas);
    $('waitingStrap').classList.toggle('hidden', !!publicHas || state.phase==='finished');
    if (publicHas) {
      $('publicLetter').textContent = clue.letter;
      $('publicRule').textContent = `${clue.rule} ${clue.letter}`;
      $('publicText').textContent = clue.question;
      $('publicHint').textContent = state.extra || '';
      $('publicHint').classList.toggle('hidden', !state.extra);
      $('publicAnswer').textContent = state.publicAnswer ? `Respuesta: ${state.publicAnswer}` : '';
      $('publicAnswer').classList.toggle('hidden', !state.publicAnswer);
    }
    if (isHost) renderHost();
  }
  function renderHost(){
    const q = state.clue;
    $('hostLetter').textContent = q.letter;
    $('hostRule').textContent = `${q.rule} ${q.letter}`;
    $('hostType').textContent = q.type==='ciudadania'?'Comunidad y derechos':'Cultura general';
    $('hostText').textContent = q.question;
    $('answerText').textContent = state.answer;
    $('answerBtn').textContent = state.showPublicAnswer?'Ocultar respuesta al público':'Mostrar respuesta al público';
    $('answerBtn').setAttribute('aria-pressed', String(state.showPublicAnswer));
    $('clueBtn').textContent = state.showClue?'Ocultar pregunta al público':'Mostrar pregunta al público';
    $('clueBtn').setAttribute('aria-pressed', String(state.showClue));
    $('hintBtn').textContent = state.showHint?'Ocultar pista adicional':'Mostrar pista adicional';
    $('hintBtn').setAttribute('aria-pressed', String(state.showHint));
    $('finalRevealBtn').textContent = state.revealSummaryAtEnd ? 'Ocultar respuestas al finalizar' : 'Mostrar respuestas al finalizar';
    $('finalRevealBtn').setAttribute('aria-pressed', String(state.revealSummaryAtEnd));
    $('hintBtn').disabled = !state.showClue;
    $('answerBtn').disabled = !state.showClue;
    $('durationSelect').value = String(state.duration);
    $('durationSelect').disabled = state.phase!=='ready';
    $('playPauseBtn').textContent = state.phase==='running'?'Ⅱ Pausar':state.phase==='paused'?'▶ Continuar':'▶ Iniciar cronómetro';
    $('playPauseBtn').disabled = state.phase==='finished';
    $('correctBtn').disabled = $('wrongBtn').disabled = $('passBtn').disabled = state.phase!=='running';
  }
  function tick() {
    if(!state) return;
    $('centerTimer').textContent = formatTime(remaining());
    if(state.phase==='running'&&remaining()<=0){ $('gameStateLabel').textContent='Tiempo agotado'; }
  }
  async function fetchState(){
    const param=isHost?`?clave=${encodeURIComponent(secret)}`:'';
    const r=await fetch(`/api/rooms/${code}${param}`,{cache:'no-store'});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'No se encontró la sala');
    receive(data);
  }
  function receive(next) {
    if(!next||typeof next!=='object') return;
    if(state&&next.version<state.version) return;
    if(typeof next.serverNow==='number') timeOffset=next.serverNow-Date.now();
    state=next;
    render();
  }
  function connect(){
    if(stream) stream.close();
    fetchState().catch(e=>{toast(e.message);setConnection('Sala no disponible','disconnected');});
    const query=new URLSearchParams({rol:isHost?'control':'publico'});
    if(isHost) query.set('clave',secret);
    stream = new EventSource(`/api/rooms/${code}/events?${query}`);
    stream.addEventListener('state',ev=>{
      try{receive(JSON.parse(ev.data));setConnection('En vivo · Sincronizado','connected');}
      catch(e){console.error(e);}
    });
    stream.addEventListener('error',()=>{setConnection('Reconectando…','disconnected');});
  }
  async function action(name, extra={}) {
    if(!isHost||busy||!state) return;
    if(name==='new'&&state.phase!=='ready'&&!window.confirm('¿Comenzar una nueva partida con preguntas diferentes?')) return;
    busy=true;
    try {
      const r=await fetch(`/api/rooms/${code}/action`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({clave:secret,action:name,...extra})
      });
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||'No se pudo realizar la acción');
      await fetchState();
      if(name==='new') toast('Nueva partida lista: preguntas renovadas');
    } catch(e) {
      toast(e.message);
    } finally {
      busy=false;
    }
  }
  async function createRoom(){
    const btn=$('createRoom'); btn.disabled=true; btn.textContent='Creando partida…';
    try {
      const res=await fetch('/api/rooms',{method:'POST'}),data=await res.json();
      if(!res.ok) throw new Error(data.error||'No se pudo crear la sala');
      window.location.assign(data.control);
    } catch(e) {
      toast(e.message); btn.disabled=false; btn.textContent='Crear una partida ↗';
    }
  }
  async function copy(text){
    try { await navigator.clipboard.writeText(text); toast('Enlace copiado'); }
    catch(err){ toast('No se pudo copiar automáticamente. Mantén presionado el enlace y selecciona Copiar.'); }
  }
  function setup(){
    makeRing();
    $('createRoom').addEventListener('click',createRoom);
    $('joinForm').addEventListener('submit',e=>{
      e.preventDefault();
      const value=$('joinCode').value.trim().toUpperCase();
      if(!/^[A-Z2-9]{6}$/.test(value)) return toast('El código debe tener 6 letras o números');
      window.location.assign(`/?sala=${encodeURIComponent(value)}&rol=publico`);
    });
    $('correctBtn').addEventListener('click',()=>action('mark',{value:'ok'}));
    $('wrongBtn').addEventListener('click',()=>action('mark',{value:'bad'}));
    $('passBtn').addEventListener('click',()=>action('mark',{value:'passed'}));
    $('answerBtn').addEventListener('click',()=>action('publicAnswer',{value:!state?.showPublicAnswer}));
    $('clueBtn').addEventListener('click',()=>action('clue',{value:!state?.showClue}));
    $('hintBtn').addEventListener('click',()=>action('hint',{value:!state?.showHint}));
    $('finalRevealBtn').addEventListener('click',()=>action('revealEnd',{value:!state?.revealSummaryAtEnd}));
    $('durationSelect').addEventListener('change',e=>action('duration',{duration:Number(e.target.value)}));
    $('playPauseBtn').addEventListener('click',()=>{
      if(state?.phase==='running') action('pause');
      else if(state?.phase==='ready'||state?.phase==='paused') action('play');
    });
    $('newRoundBtn').addEventListener('click',()=>action('new'));
    $('copyPublic').addEventListener('click',()=>copy($('publicUrl').value));
    $('copyControl').addEventListener('click',()=>copy($('controlUrl').value));
    $('fullscreenBtn').addEventListener('click',()=>{
      const d=document;
      if(d.fullscreenElement) d.exitFullscreen();
      else d.documentElement.requestFullscreen?.().catch(()=>toast('No se pudo activar pantalla completa'));
    });
    if(hasRoom) publicUi();
    else if(code) toast('Enlace incorrecto: código de sala inválido');
    setInterval(tick,120);
  }
  setup();
})();
