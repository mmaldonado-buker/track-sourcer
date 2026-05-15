// GOOGLE SHEETS API LAYER
let SHEETS_URL = localStorage.getItem('st4_sheets_url') || '';
let IS_OFFLINE = false;

// LIMPIADOR AUTOMÁTICO: Quita el /u/1/ para que Google no bloquee la conexión
function getSafeUrl(url) { return url ? url.replace(/\/macros\/u\/\d+\/s\//, '/macros/s/') : ''; }

async function sheetsAPI(action, payload = null) {
  if (IS_OFFLINE) throw new Error('Modo offline');
  if (!SHEETS_URL) throw new Error('URL no configurada');
  const safeUrlStr = getSafeUrl(SHEETS_URL);
  const url = new URL(safeUrlStr);
  url.searchParams.set('action', action);
  const opts = { method: 'GET' };
  if (payload) {
    opts.method = 'POST';
    opts.headers = { 'Content-Type': 'text/plain' };
    opts.body = JSON.stringify(payload);
  }
  const resp = await fetch(url.toString(), opts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiCall(action, payload = null) {
  if (IS_OFFLINE) return localFallback(action, payload);
  try { return await sheetsAPI(action, payload); }
  catch (err) {
    console.warn('Sheets API error, usando caché local:', err.message);
    setSyncStatus('error', 'Error de conexión — usando caché');
    return localFallback(action, payload);
  }
}

function localFallback(action, payload) {
  if (action === 'getCandidates') {
    const stored = localStorage.getItem('st4_cands');
    return { candidates: stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(SEED)) };
  }
  if (action === 'getPools') {
    const stored = localStorage.getItem('st4_pools');
    return { pools: stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_POOLS)) };
  }
  if (action === 'addCandidate') {
    const cands = JSON.parse(localStorage.getItem('st4_cands') || '[]');
    const newId = cands.length ? Math.max(...cands.map(c => c.id)) + 1 : 1;
    payload.id = newId; cands.unshift(payload);
    localStorage.setItem('st4_cands', JSON.stringify(cands));
    return { ok: true, id: newId };
  }
  if (action === 'updateCandidate') {
    const cands = JSON.parse(localStorage.getItem('st4_cands') || '[]');
    const idx = cands.findIndex(c => c.id === payload.id);
    if (idx !== -1) {
      Object.assign(cands[idx], payload.changes);
      if (payload.changes.dates) cands[idx].dates = { ...(cands[idx].dates || {}), ...payload.changes.dates };
      localStorage.setItem('st4_cands', JSON.stringify(cands));
    }
    return { ok: true };
  }
  if (action === 'addPool') {
    const pools_l = JSON.parse(localStorage.getItem('st4_pools') || '[]');
    const newId = pools_l.length ? Math.max(...pools_l.map(p => p.id)) + 1 : 1;
    payload.id = newId; pools_l.push(payload);
    localStorage.setItem('st4_pools', JSON.stringify(pools_l));
    return { ok: true, id: newId };
  }
  return { ok: true };
}

function setSyncStatus(state, msg) {
  const ind = document.getElementById('db-status-indicator');
  const loginStatus = document.getElementById('login-db-status');
  const map = {
    ok:      { cls: 'sync-ok',      txt: '● Sheets conectado' },
    loading: { cls: 'sync-loading', txt: 'Sincronizando...' },
    error:   { cls: 'sync-error',   txt: '⚠ ' + (msg || 'Error') },
    offline: { cls: 'sync-offline', txt: '○ Modo demo (local)' },
  };
  const s = map[state] || map.ok;
  if (ind) { ind.className = 'sync-status ' + s.cls; ind.textContent = msg || s.txt; }
  if (loginStatus) { loginStatus.className = 'sync-status ' + s.cls; loginStatus.textContent = msg || s.txt; }
}

async function connectSheets() {
  const url = document.getElementById('setup-url').value.trim();
  const errEl = document.getElementById('setup-err');
  errEl.style.display = 'none';
  if (!url || !url.includes('script.google.com')) {
    errEl.textContent = 'La URL debe ser de Google Apps Script (script.google.com)';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('#setup .btn-p');
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const safeUrlStr = getSafeUrl(url);
    const resp = await fetch(`${safeUrlStr}?action=ping`);
    const data = await resp.json();
    if (!data.ok) throw new Error('El script no responde correctamente');
    SHEETS_URL = safeUrlStr; localStorage.setItem('st4_sheets_url', safeUrlStr); IS_OFFLINE = false;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    setSyncStatus('ok'); toast('Conectado', 'Google Sheets sincronizado', 'ok', '⬡');
  } catch (err) {
    errEl.textContent = 'No se pudo conectar: ' + err.message + '. Revisa que el despliegue sea público.';
    errEl.style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Conectar'; }
}

function useOffline() {
  IS_OFFLINE = true; SHEETS_URL = '';
  document.getElementById('setup').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  setSyncStatus('offline'); toast('Modo demo', 'Datos locales — no se guardan en Sheets', 'wrn', '○');
}

async function syncNow() {
  setSyncStatus('loading');
  try {
    const [cResp, pResp] = await Promise.all([sheetsAPI('getCandidates'), sheetsAPI('getPools')]);
    cands = cResp.candidates || []; 
    let fetchedPools = pResp.pools || [];
    if (fetchedPools.length === 0 || fetchedPools.some(p => p.name === 'Software Engineers' || p.name === 'Tribu Plataforma')) {
        fetchedPools = JSON.parse(JSON.stringify(DEFAULT_POOLS));
    }
    pools = fetchedPools;
    localStorage.setItem('st4_cands', JSON.stringify(cands));
    localStorage.setItem('st4_pools', JSON.stringify(pools));
    setSyncStatus('ok'); buildSidebar();
    const views = ['pool','pipeline','kanban','analytics','review','stale','today'];
    views.forEach(v => {
      const el = document.getElementById('v-' + v);
      if (el && el.style.display !== 'none') {
        if (v === 'pool') renderPoolView();
        if (v === 'pipeline') renderPipeline();
        if (v === 'kanban') renderKanban();
        if (v === 'analytics') renderAnalytics();
        if (v === 'review') renderReview();
      }
    });
    toast('Sincronizado', `${cands.length} candidatos · ${pools.length} pools`, 'ok', '↻');
  } catch (err) {
    setSyncStatus('error', '⚠ Sin conexión'); toast('Error de sincronización', err.message, 'err', '⚠');
  }
}

function updateSheetsUrl() {
  const url = document.getElementById('cfg-sheets-url').value.trim();
  if (url) {
    SHEETS_URL = url; localStorage.setItem('st4_sheets_url', url); IS_OFFLINE = false;
    toast('URL actualizada', 'Sincronizando...', 'ok', '↻'); syncNow();
  }
}

// USERS & DATA STRUCTURE
const USERS = [
  {id:'JQ', name:'Jonathan Quiroz',    role:'owner', team:'A', color:'#7c6ef0', email:'jquiroz@buk.mx'},
  {id:'EF', name:'Eliana Franco',      role:'viewer',     team:'*', color:'#f0a940', email:'efranco@buk.co'},
  {id:'LR', name:'Laura Rodriguez',    role:'owner',      team:'C', color:'#2dd4a0', email:'larodriguez@buk.co'},
  {id:'CP', name:'Catalina Poblete',   role:'owner',      team:'B', color:'#a78bfa', email:'cpoblete@buk.cl'},
  {id:'GJ', name:'Gaspar Jaramillo',   role:'owner',      team:'B', color:'#e06cc0', email:'gjaramillo@buk.cl'},
  {id:'PM', name:'Paula Mahecha',      role:'recruiter',  team:'A', color:'#5b9cf0', email:'pmahecha@buk.co'},
  {id:'JM', name:'Joaquín Maragaño',   role:'recruiter',  team:'C', color:'#2dd4a0', email:'jmaragano@buk.cl'},
  {id:'CL', name:'Catalina León',      role:'sourcer',    team:'A', color:'#60a5fa', email:'cleon@buk.cl'},
  {id:'MJM',name:'María José Menares', role:'sourcer',    team:'A', color:'#f472b6', email:'mmenares@buk.cl'},
  {id:'VL', name:'Valentina Larenas',  role:'sourcer',    team:'B', color:'#e05c5c', email:'vlarenas@buk.cl'},
  {id:'MM', name:'Matías Maldonado',   role:'sourcer',    team:'C', color:'#fbbf24', email:'mmaldonado@buk.cl'},
];

const SQUADS = [
  {id:'A', name:'Squad A', owners:['Jonathan Quiroz'],  recruiters:['Paula Mahecha'],    sourcers:['Catalina León','María José Menares']},
  {id:'B', name:'Squad B', owners:['Catalina Poblete','Gaspar Jaramillo'], recruiters:['Catalina Poblete','Gaspar Jaramillo'], sourcers:['Valentina Larenas']},
  {id:'C', name:'Squad C', owners:['Laura Rodriguez'],  recruiters:['Joaquín Maragaño'], sourcers:['Matías Maldonado']},
];

const DEFAULT_POOLS = [
  {id:1, name:'Devs', desc:'Pool general de ingenieros de software', color:'#5b9cf0'},
  {id:2, name:'PLTF', desc:'DevOps, DevSecOps, DevEx y afines',      color:'#7c6ef0'},
  {id:3, name:'EM',   desc:'Engineering Managers por célula',        color:'#e06cc0'},
];

const DEFAULT_THRESHOLDS = { 'Contactado':7, 'Screening':7, 'Entrevista Inicial':10, 'Entrevista EM':10, 'Misión':14 };
const STAGES   = ['Contactado','Screening','Entrevista Inicial','Entrevista EM','Misión'];
const DISC_S   = new Set(['Descartado','No interesado']);
const SCREEN_S = new Set(['Screening','Entrevista Inicial','Entrevista EM','Misión']);

// NUEVO: Solo entran al Pipeline Activo y Kanban los que están en etapa de entrevistas
function isActiveInPipeline(c) {
  if (!c) return false;
  if (DISC_S.has(c.est)) return false; 
  if (c.sit === 'Rechazado') return false; 
  
  // SÓLO Entrevista Inicial, Entrevista EM y Misión. Ignora Contactado y Screening.
  return ['Entrevista Inicial','Entrevista EM','Misión'].includes(c.est);
}

function loadLocalConfig() {
  const st = localStorage.getItem('st4_thresh');
  thresholds = st ? JSON.parse(st) : {...DEFAULT_THRESHOLDS};
  USERS.forEach(u => { emailMap[u.name] = u.email; });
  API_KEY = localStorage.getItem('st4_key') || '';
  let sp = localStorage.getItem('st4_pools');
  if (sp && (sp.includes('Software Engineers') || sp.includes('Tribu Plataforma'))) {
      sp = null; localStorage.removeItem('st4_pools');
  }
  pools = sp ? JSON.parse(sp) : JSON.parse(JSON.stringify(DEFAULT_POOLS));
  const sc = localStorage.getItem('st4_cands');
  cands = sc ? JSON.parse(sc) : JSON.parse(JSON.stringify(SEED));
}
function saveLocal() { localStorage.setItem('st4_thresh', JSON.stringify(thresholds)); }

function daysSince(dateStr){ if(!dateStr) return null; return Math.floor((new Date()-new Date(dateStr))/(86400000)); }
function daysInStage(c){ return daysSince(c.dates?.[c.est]); }
function isStale(c){ if(DISC_S.has(c.est)) return false; const d=daysInStage(c); return d!==null && d>=(thresholds[c.est]||10); }
function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('es-CL',{day:'numeric',month:'short'}); }
function daysLabel(n,thresh){ if(n===null) return '—'; const cls=n>=thresh?(n>=thresh*1.5?'danger':'warn'):'ok'; return `<span class="tl-days ${cls}">${n}d</span>`; }
function getStaleCands(){ return cands.filter(c=>!DISC_S.has(c.est)&&isStale(c)&&canSeeCandidate(c)); }
function updateStaleSidebar(){
  const stale=getStaleCands();
  const nb=document.getElementById('nb-stale');
  if(nb) nb.textContent=stale.length;
  const sec=document.getElementById('sb-stale-sec');
  if(sec) sec.style.display=stale.length?'':'none';
  const nbt=document.getElementById('nb-today');
  if(nbt) nbt.textContent=getTodayCands().length;
}

function checkStaleNow(){
  const stale=getStaleCands();
  if(!stale.length){ toast('Sin candidatos estancados','Todo el pipeline está al día','ok','✓'); return; }
  updateStaleSidebar();
  toast(`${stale.length} estancado${stale.length>1?'s':''}`, 'Ver en sidebar','wrn','⚠');
}

function buildSidebar(){
  const poolsEl=document.getElementById('sb-pools');
  if(!canSeePools()){ document.getElementById('sb-pool-sec').style.display='none'; }
  else if (poolsEl) {
    document.getElementById('sb-pool-sec').style.display='';
    poolsEl.innerHTML=pools.map(p=>`
      <button class="ni ni-pool-${p.id}" onclick="nav('pool',${p.id})">
        <span class="dot" style="background:${p.color}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${p.name}</span>
        <span class="nb live">${cands.filter(c=>Number(c.pid)===Number(p.id)&&canSeeCandidate(c)).length}</span>
      </button>`).join('');
  }
  document.querySelectorAll('#btn-add-cand,#btn-add-pipe').forEach(b=>b.style.display=canAddCandidates()?'':'none');
  const ppf=document.getElementById('pipe-pool-f');
  if(ppf) ppf.innerHTML='<option value="">Todos los pools</option>'+pools.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  updateStaleSidebar();
  
  const btnReview = document.getElementById('ni-review');
  if (btnReview) btnReview.style.display = (HAT === 'sourcer') ? 'none' : 'flex';
  
  // ARREGLO: El contador solo suma los "Por revisar" ignorando los descartados y rechazados
  const nbr=document.getElementById('nb-review');
  if(nbr) nbr.textContent=cands.filter(c => canSeeCandidate(c) && c.sit==='Por revisar' && !DISC_S.has(c.est)).length;
  
  const nbpipe = document.getElementById('nb-pipe');
  if(nbpipe) nbpipe.textContent=cands.filter(c=>canSeeCandidate(c)&&isActiveInPipeline(c)).length;
}

function buildStaleEmail(c){
  const days=daysInStage(c), thresh=thresholds[c.est]||10;
  const involvedNames=[...new Set([c.src,c.rec,getOwnerForTeam(c)])].filter(Boolean);
  const toEmails=involvedNames.map(n=>emailMap[n]||n).join(', ');
  const subject=`[SourcerTrack] ⚠ Candidato estancado: ${c.n} (${days} días en ${c.est})`;
  const body=`Hola equipo,\n\nEste es un recordatorio automático.\nEl candidato ${c.n} lleva ${days} días en "${c.est}".\n\nDetalles:\n• Pool: ${pname(c.pid)}\n• Etapa actual: ${c.est}\n• Equipo sugerido: ${c.eq||'—'}\n• Sourcer: ${c.src||'—'}\n• Recruiter: ${c.rec||'—'}\n• Rango salarial: ${c.sal||'No registrado'}\n\nPor favor actualiza el estado. ID: #ST-${String(c.id).padStart(4,'0')}`;
  return {to:toEmails,subject,body,involvedNames};
}
function getOwnerForTeam(c){ const sq=SQUADS.find(s=>s.sourcers.includes(c.src)||s.recruiters.includes(c.rec)); return sq?.owners?.[0]||''; }

function openEmailModal(candId){
  const c=cands.find(x=>x.id===candId); if(!c) return;
  const email=buildStaleEmail(c);
  document.getElementById('email-title').textContent=`Notificación: ${c.n}`;
  document.getElementById('email-context').innerHTML=`Candidato lleva <strong style="color:var(--amber)">${daysInStage(c)} días</strong> en <strong>${c.est}</strong>. Para: <strong>${email.involvedNames.join(', ')}</strong>`;
  document.getElementById('ep-to').textContent=`Para: ${email.to}`;
  document.getElementById('ep-subject').textContent=email.subject;
  document.getElementById('ep-body').textContent=email.body;
  document.getElementById('copy-done').style.display='none';
  openModal('mb-email');
}

function copyEmail(){
  const text=`${document.getElementById('ep-subject').textContent}\n\n${document.getElementById('ep-body').textContent}`;
  navigator.clipboard.writeText(text).then(()=>{ document.getElementById('copy-done').style.display='inline'; toast('Email copiado','Abre Gmail y pega el contenido','ok','📋'); });
}

function buildLoginList() {
  const roleLabel={supervisor:'Supervisor',viewer:'Tech Lead (Solo Lectura)',owner:'Owner',recruiter:'Recruiter',sourcer:'Sourcer'};
  const roleOrder=['supervisor','viewer','owner','recruiter','sourcer'];
  const sorted=[...USERS].sort((a,b)=>roleOrder.indexOf(a.role)-roleOrder.indexOf(b.role));
  document.getElementById('user-list').innerHTML=sorted.map(u=>`
    <div class="ul-item" onclick="directLogin('${u.id}')">
      <div class="ul-ava" style="background:${u.color}22;color:${u.color}">${u.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
      <div class="ul-info"><div class="ul-name">${u.name}</div><div class="ul-role">${roleLabel[u.role]||u.role}</div></div>
    </div>`).join('');
}

async function directLogin(id){
  CU=USERS.find(u=>u.id===id); 
  HAT=CU.role;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  loadLocalConfig(); init();
  if(!IS_OFFLINE) setTimeout(()=>syncNow(), 300);
}

function init(){
  buildSidebar(); updateFooter(); checkStaleNow();
  if(HAT==='recruiter' || HAT==='owner') nav('today');
  else { currentPool=pools[0]?.id||1; nav('today'); }
  toast('Bienvenid@',CU.name,CU.role==='viewer'?'inf':'ok','⬡');
}

function canSeeCandidate(c) {
  if (!CU) return false;
  const role = (HAT || '').toLowerCase();
  if (role === 'supervisor' || role === 'viewer') return true; 
  if (role === 'owner') return isMyTeamCandidate(c); 
  if (role === 'sourcer') return c.src && c.src.toLowerCase().includes(CU.name.toLowerCase());
  if (role === 'recruiter') return c.rec && c.rec.toLowerCase().includes(CU.name.toLowerCase());
  return false;
}

function isMyTeamCandidate(c) {
  const sq = SQUADS.find(s => s.id === CU.team);
  if (!sq) return false;
  const m = [...sq.owners, ...sq.recruiters, ...sq.sourcers];
  return m.includes(c.src) || m.includes(c.rec);
}

function canEdit(c) {
  if (HAT === 'viewer') return false; 
  if (HAT === 'supervisor') return true; 
  if (HAT === 'owner') return isMyTeamCandidate(c);
  if (HAT === 'recruiter') return c.rec === CU.name;
  if (HAT === 'sourcer') return c.src === CU.name;
  return false; 
}

function canEditFull(c) { return (HAT === 'owner' || HAT === 'supervisor'); }
function canSeePools() { return true; }
function canAddCandidates() { return HAT !== 'viewer'; }

function buildSidebar(){
  const poolsEl=document.getElementById('sb-pools');
  if(!canSeePools()){ document.getElementById('sb-pool-sec').style.display='none'; }
  else {
    document.getElementById('sb-pool-sec').style.display='';
    poolsEl.innerHTML=pools.map(p=>`
      <button class="ni ni-pool-${p.id}" onclick="nav('pool',${p.id})">
        <span class="dot" style="background:${p.color}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${p.name}</span>
        <span class="nb live">${cands.filter(c=>c.pid===p.id&&canSeeCandidate(c)).length}</span>
      </button>`).join('');
  }
  document.querySelectorAll('#btn-add-cand,#btn-add-pipe').forEach(b=>b.style.display=canAddCandidates()?'':'none');
  const ppf=document.getElementById('pipe-pool-f');
  if(ppf) ppf.innerHTML='<option value="">Todos los pools</option>'+pools.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  updateStaleSidebar();
  
  const btnReview = document.getElementById('ni-review');
  if (btnReview) {
      btnReview.style.display = (HAT === 'sourcer') ? 'none' : 'flex';
  }
  
  const nbr=document.getElementById('nb-review');
  // ARREGLO: Solo cuenta los que están "Por revisar" y ESTRICTAMENTE en la etapa "Contactado"
  if(nbr) nbr.textContent=cands.filter(c=>canSeeCandidate(c) && (!c.sit||c.sit==='') && !DISC_S.has(c.est)).length;
  
  const nbpipe = document.getElementById('nb-pipe');
  if(nbpipe) nbpipe.textContent=cands.filter(c=>canSeeCandidate(c)&&isActiveInPipeline(c)).length;
}

function updateFooter(){
  const roleLabel={owner:'Owner',recruiter:'Recruiter',sourcer:'Sourcer',supervisor:'Supervisor',viewer:'Tech Lead'};
  const ava=document.getElementById('sb-ava');
  if(!ava) return;
  ava.style.background=CU.color+'22'; ava.style.color=CU.color;
  ava.textContent=CU.name.split(' ').map(w=>w[0]).join('').slice(0,2);
  document.getElementById('sb-uname').textContent=CU.name;
  document.getElementById('sb-urole').textContent=roleLabel[HAT]||HAT;
  document.getElementById('sb-switch').style.display='block';
}

function switchHat(){ location.reload(); }

function nav(view, poolId){
  if(poolId!==undefined) currentPool=poolId;
  document.querySelectorAll('[id^="v-"]').forEach(v=>v.style.display='none');
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  closePanel();
  if(view==='pool'){
    if(!canSeePools()){ nav('pipeline'); return; }
    if(!currentPool) currentPool=pools[0]?.id;
    document.getElementById('v-pool').style.display='flex';
    document.querySelector(`.ni-pool-${currentPool}`)?.classList.add('active');
    renderPoolView();
  } else if(view==='pipeline'){
    document.getElementById('v-pipeline').style.display='flex';
    document.getElementById('ni-pipeline')?.classList.add('active');
    buildStageTabs(); renderPipeline();
  } else if(view==='kanban'){
    document.getElementById('v-kanban').style.display='flex';
    document.getElementById('ni-kanban')?.classList.add('active');
    renderKanban();
  } else if(view==='analytics'){
    document.getElementById('v-analytics').style.display='flex';
    document.getElementById('ni-analytics')?.classList.add('active');
    renderAnalytics();
  } else if(view==='review'){
    document.getElementById('v-review').style.display='flex';
    document.getElementById('ni-review')?.classList.add('active');
    renderReview();
  } else if(view==='stale'){
    document.getElementById('v-stale').style.display='flex';
    document.getElementById('ni-stale')?.classList.add('active');
    renderStale();
  } else if(view==='today'){
    document.getElementById('v-today').style.display='flex';
    document.getElementById('ni-today')?.classList.add('active');
    renderToday();
  } else if(view==='config'){
    document.getElementById('v-config').style.display='flex';
    document.getElementById('ni-config')?.classList.add('active');
    renderConfig();
  }
}

function sitB(s){ const m={Aprobado:'ba',Rechazado:'br','Por revisar':'bpr'}; return `<span class="badge ${m[s]||''}">${s||'—'}</span>`; }
function estB(e){ const m={Contactado:'bco',Screening:'bsc','Entrevista Inicial':'bei','Entrevista EM':'bem',Misión:'bmi',Descartado:'bde','No interesado':'bde'}; return `<span class="badge ${m[e]||''}">${e||'—'}</span>`; }
function chips(s){ if(!s) return '—'; return s.split(',').map(x=>`<span class="chip">${x.trim()}</span>`).join(''); }
function pname(id){ return pools.find(p=>p.id==id)?.name||'—'; }
function pcolor(id){ return pools.find(p=>p.id==id)?.color||'var(--txt3)'; }
function pSteps(c){
  const idx=STAGES.indexOf(c.est), disc=DISC_S.has(c.est);
  const short={Contactado:'Cont',Screening:'Screen','Entrevista Inicial':'Ent.I','Entrevista EM':'Ent.EM',Misión:'Misión'};
  return '<div class="psr">'+STAGES.map((s,i)=>{ let cl='ps'; if(!disc){if(i<idx)cl='ps done';else if(i===idx)cl='ps cur';} return `<span class="${cl}">${short[s]||s}</span>`; }).join('')+(disc?`<span class="ps disc">${c.est}</span>`:'')+' </div>';
}
function staleDaysCell(c){
  if(DISC_S.has(c.est)) return '<span style="color:var(--txt3);font-size:11px">—</span>';
  const d=daysInStage(c); if(d===null) return '—';
  const thresh=thresholds[c.est]||10;
  return d>=thresh ? `<span class="stale-tag"> ${d}d · >${thresh}d</span>` : `<span style="font-size:11px;color:var(--txt3);font-family:var(--mono)">${d}d</span>`;
}
function allRecruiters(){ return [...new Set(SQUADS.flatMap(s=>[...s.owners,...s.recruiters]))]; }

function getPoolCands(){ 
  return cands.filter(c => c.pid == currentPool && canSeeCandidate(c)); 
}

function renderPoolView(){
  const pool=pools.find(p => p.id == currentPool); if(!pool) return;
  document.getElementById('pool-title').textContent=pool.name;
  document.getElementById('pool-ptabs').innerHTML=pools.map(p=>`
    <button class="ptab${p.id == currentPool?' active':''}" onclick="nav('pool',${p.id})">
      <span style="width:6px;height:6px;border-radius:50%;background:${p.color};display:inline-block;margin-right:4px;vertical-align:middle"></span>${p.name}
    </button>`).join('');
  
  const cs=getPoolCands();
  const active=cs.filter(c=>isActiveInPipeline(c)).length, disc=cs.filter(c=>DISC_S.has(c.est)).length;
  const aprov=cs.filter(c=>c.sit==='Aprobado').length, stale=cs.filter(c=>isStale(c)).length;
  
  document.getElementById('pool-mg').innerHTML=`
    <div class="mc"><div class="mcl">Total pool</div><div class="mcv mv-p">${cs.length}</div><div class="mcs">candidatos</div></div>
    <div class="mc"><div class="mcl">Aprobados</div><div class="mcv mv-g">${aprov}</div><div class="mcs">${cs.length?Math.round(aprov/cs.length*100):0}%</div></div>
    <div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-a">${active}</div><div class="mcs">activos</div></div>
    <div class="mc"><div class="mcl" style="color:var(--amber)">Estancados</div><div class="mcv mv-r">${stale}</div><div class="mcs">sin actualizar</div></div>`;
  renderPool();
}

function renderPool(){
  const q=(document.getElementById('ps-q')?.value||'').toLowerCase();
  const fs=document.getElementById('ps-sit')?.value||'';
  const fe=document.getElementById('ps-est')?.value||'';
  
  let cs=getPoolCands().filter(c=>{
    const n = (c.n || '').toLowerCase();
    const stack = (c.stack || '').toLowerCase();
    const emp = (c.emp || '').toLowerCase();
    if(q && !n.includes(q) && !stack.includes(q) && !emp.includes(q)) return false;
    if(fs && fs !== 'Situación' && c.sit !== fs) return false; 
    if(fe && fe !== 'Estado' && c.est !== fe) return false; 
    return true;
  });
  
  const tb=document.getElementById('pool-tb'); if(!tb) return;
  tb.innerHTML=cs.length?cs.map(c=>`
    <tr class="${isStale(c)?'stale':''}" onclick="openPanel(${c.id})">
      <td><div class="tdn">${c.n}${isStale(c)?` <span style="color:var(--amber);font-size:10px">⚠</span>`:''}</div>${c.l?`<a class="tdl" href="${c.l}" target="_blank" onclick="event.stopPropagation()">↗ LinkedIn</a>`:''}</td>
      <td>${chips(c.stack)}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.emp||'—'}</td>
      <td>${sitB(c.sit)}</td>
      <td>${pSteps(c)}</td>
      <td>${staleDaysCell(c)}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.eq||'—'}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.rec||'—'}</td>
      <td onclick="event.stopPropagation()"><button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver</button></td>
    </tr>`).join(''):`<tr><td colspan="9" class="nr">Sin candidatos.</td></tr>`;
  document.getElementById('pool-ct').textContent=`${cs.length} de ${getPoolCands().length} candidatos`;
}
function resetPF(){ ['ps-q','ps-sit','ps-est'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); renderPool(); }

function buildStageTabs(){
  // Solo las etapas avanzadas para el menú del Pipeline
  const stages=['Todas','Entrevista Inicial','Entrevista EM','Misión'];
  document.getElementById('pipe-stabs').innerHTML=stages.map(s=>`<button class="stab${pipeStageF===(s==='Todas'?'':s)?' active':''}" onclick="setPipeStage('${s==='Todas'?'':s}')">${s}</button>`).join('');
}
function setPipeStage(s){ pipeStageF=s; buildStageTabs(); renderPipeline(); }

function getPipeCands(){
  const pf=parseInt(document.getElementById('pipe-pool-f')?.value)||0;
  // NUEVO: Filtro estricto SOLO para Entrevista Inicial, Entrevista EM y Misión
  const validStages = ['Entrevista Inicial', 'Entrevista EM', 'Misión'];
  return cands.filter(c=> validStages.includes(c.est) && (!pf||c.pid==pf) && (!pipeStageF||c.est===pipeStageF) && canSeeCandidate(c) && c.sit !== 'Rechazado' && !DISC_S.has(c.est));
}

function renderPipeline(){
  const cs=getPipeCands();
  const tb=document.getElementById('pipe-tb'); if(!tb) return;
  tb.innerHTML=cs.length?cs.map(c=>`
    <tr class="${isStale(c)?'stale':''}" onclick="openPanel(${c.id})">
      <td><div class="tdn">${c.n}${isStale(c)?` <span style="color:var(--amber);font-size:10px">⚠</span>`:''}</div>${c.l?`<a class="tdl" href="${c.l}" target="_blank" onclick="event.stopPropagation()">↗</a>`:''}</td>
      <td style="font-size:11px"><span style="width:6px;height:6px;border-radius:50%;background:${pcolor(c.pid)};display:inline-block;margin-right:4px"></span>${pname(c.pid)}</td>
      <td>${chips(c.stack)}</td>
      <td>${estB(c.est)}</td>
      <td>${staleDaysCell(c)}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.eq||'—'}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.sal||'—'}</td>
      <td style="font-size:11px;color:var(--txt2)">${c.rec||'—'}</td>
      <td onclick="event.stopPropagation()"><button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Editar</button></td>
    </tr>`).join(''):`<tr><td colspan="9" class="nr">Sin candidatos en entrevistas o misión.</td></tr>`;
  
  const all=cands.filter(c=>isActiveInPipeline(c)&&canSeeCandidate(c));
  const pmg = document.getElementById('pipe-mg');
  if (pmg) {
    pmg.innerHTML=`
      <div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-p">${all.length}</div><div class="mcs">activos</div></div>
      <div class="mc"><div class="mcl">Ent. Inicial</div><div class="mcv mv-a">${all.filter(c=>c.est==='Entrevista Inicial').length}</div><div class="mcs">Primera etapa</div></div>
      <div class="mc"><div class="mcl">Ent. EM</div><div class="mcv" style="color:var(--pink)">${all.filter(c=>c.est==='Entrevista EM').length}</div><div class="mcs">Líder técnico</div></div>
      <div class="mc"><div class="mcl">Misión</div><div class="mcv mv-g">${all.filter(c=>c.est==='Misión').length}</div><div class="mcs">Fase final</div></div>`;
  }
  
  const pfunnel = document.getElementById('pipe-funnel');
  if (pfunnel) {
    const sc=['Entrevista Inicial','Entrevista EM','Misión'];
    const cnt=sc.map(s=>all.filter(c=>c.est===s).length), mx=Math.max(...cnt,1);
    const cl=['#a78bfa','#e06cc0','#2dd4a0'];
    pfunnel.innerHTML=`<h3 style="font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.09em;margin-bottom:10px">Embudo Activo</h3>`+
      sc.map((s,i)=>`<div class="br-row"><div class="br-label">${s}</div><div class="br-track"><div class="br-fill" style="width:${Math.max(cnt[i]/mx*100,3)}%;background:${cl[i]}22;color:${cl[i]}">${cnt[i]||''}</div></div><div style="font-size:10px;color:var(--txt3);width:18px">${cnt[i]}</div></div>`).join('');
  }
}

function renderKanban(){
  const stages=['Entrevista Inicial','Entrevista EM','Misión'];
  const clrs={'Entrevista Inicial':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#2dd4a0'};
  
  document.getElementById('kb-board').innerHTML=stages.map(stage=>{
    const cards=cands.filter(c=>c.est===stage && canSeeCandidate(c) && isActiveInPipeline(c));
    return `<div class="kc"><div class="kch"><div class="kct" style="color:${clrs[stage]}">${stage}</div><div class="kcc">${cards.length}</div></div>
      <div class="kcards">${cards.length?cards.map(c=>`
        <div class="kcard${isStale(c)?' stale-card-k':''}" onclick="openPanel(${c.id})">
          <div class="kn">${c.n}${isStale(c)?' <span style="color:var(--amber)">⚠</span>':''}</div>
          <div class="km">${c.emp||'—'} · ${c.s||'?'} · ${daysInStage(c)??'—'}d</div>
          <div style="margin-top:4px">${chips(c.stack)}</div>
        </div>`).join(''):`<div class="ke">Vacío</div>`}
      </div></div>`;
  }).join('');
}

function renderReview(){
  const pending = getReviewCands();
  const rb = document.getElementById('review-body'); if(!rb) return;

  const mkCard = (c) => {
    const staleWarn = isStale(c) ? `<span style="color:var(--amber);font-size:10px"> ⚠${daysInStage(c)}d</span>` : '';
    return `<div class="rev-card" id="rcard-${c.id}">
      <div class="rev-card-top">
        <div style="flex:1;min-width:0">
          <div class="rev-name">${c.n}${staleWarn}</div>
          <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · <span style="color:var(--p2)">${c.stack}</span></div>
          ${c.fb ? `<div class="rev-fb">"${c.fb}"</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
          ${estB(c.est)}
          <button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver detalle</button>
        </div>
      </div>
      <div style="margin-bottom:8px">
        ${c.l ? `<a href="${c.l}" target="_blank" class="tdl" style="font-size:11px;display:inline-flex">↗ LinkedIn</a>` : ''}
        ${c.cv ? `<a href="${c.cv}" target="_blank" class="tdl" style="font-size:11px;display:inline-flex;margin-left:10px;color:var(--p)">📄 Ver CV</a>` : ''}
      </div>
      <div class="rev-actions">
        <textarea class="rev-comment" id="rev-fb-${c.id}" placeholder="Comentario para el sourcer (opcional)...">${c.fb||''}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" style="flex:1;justify-content:center" onclick="reviewAction(${c.id},'approve')">✓ Aprobar para contactar</button>
          <button class="btn btn-danger btn-sm" style="flex:1;justify-content:center" onclick="reviewAction(${c.id},'reject')">✕ Rechazar</button>
        </div>
      </div>
    </div>`;
  };

  rb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl">Para revisar</div><div class="mcv mv-a">${pending.length}</div><div class="mcs">pendientes</div></div>
      <div class="mc"><div class="mcl">Rechazados</div><div class="mcv mv-r">${cands.filter(c=>canSeeCandidate(c)&&c.sit==='Rechazado').length}</div><div class="mcs">histórico</div></div>
    </div>
    ${pending.length ? `
    <div class="rev-section">
      <div class="rev-sec-title">⏳ Pendientes de revisión <span class="nb">${pending.length}</span></div>
      <div class="rev-list">${pending.map(c=>mkCard(c)).join('')}</div>
    </div>` : `
    <div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">✓</div>
      <div style="font-size:13px">Sin candidatos pendientes de revisión</div>
      <div style="font-size:11px;margin-top:4px">Los sourcers agregarán nuevos candidatos aquí</div>
    </div>`}
  `;
}

async function reviewAction(id, action){
  const c = cands.find(x=>x.id===id); if(!c) return;
  const fbEl = document.getElementById(`rev-fb-${id}`);
  const fb = fbEl ? fbEl.value.trim() : c.fb||'';
  const changes = { fb };

  if(action === 'approve') changes.sit = 'Aprobado';
  else if(action === 'reject') changes.sit = 'Rechazado';

  Object.assign(c, changes);
  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', {id, changes, changedBy: CU.name});
    setSyncStatus('ok');
  } catch(err){ setSyncStatus('error','⚠ Guardado local'); }

  const labels = {approve:'Aprobado ✓ — Sourcer puede contactar', reject:'Rechazado ✕'};
  const types  = {approve:'ok', reject:'err'};
  toast(c.n, labels[action], types[action], action==='approve'?'⬆':'✕');
  buildSidebar(); renderReview();
}

function openPanel(id){
  const c=cands.find(x=>x.id===id); if(!c||!canSeeCandidate(c)) return;
  const init=(c.n||'S').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  const salOk=SCREEN_S.has(c.est)||!!c.sal;
  const disc=DISC_S.has(c.est), editable=canEdit(c), fullEdit=canEditFull(c), stale=isStale(c);
  const timelineHTML=`<div class="timeline">${STAGES.map(s=>{
    const d=c.dates?.[s], days=daysSince(d), thresh=thresholds[s]||10;
    const isCur=c.est===s, isDone=STAGES.indexOf(s)<STAGES.indexOf(c.est)||disc;
    return `<div class="tl-item"><div class="tl-dot ${isCur?'cur':isDone?'done':'empty'}"></div>
      <div style="flex:1"><span class="tl-stage">${s}</span> ${d?`<span class="tl-date">${fmtDate(d)}</span>`:''} ${isCur&&days!==null?daysLabel(days,thresh):''}</div></div>`;
  }).join('')}${disc?`<div class="tl-item"><div class="tl-dot" style="background:var(--red)"></div><div><span class="tl-stage" style="color:var(--red)">${c.est}</span> <span class="tl-date">${fmtDate(c.dates?.[c.est])}</span></div></div>`:''}</div>`;
  
  let editHTML='';
  if(HAT==='viewer' || !editable) editHTML=`<div class="psec"><div style="font-size:11px;color:var(--txt3);padding:8px 10px;background:var(--bg3);border-radius:var(--r);border-left:2px solid var(--border2)">Solo lectura para este candidato.</div></div>`;
  else if(HAT==='sourcer') editHTML=sourcerForm(c,salOk);
  else if(HAT==='recruiter') editHTML=recruiterForm(c);
  else editHTML=ownerForm(c,salOk,disc);
  
  document.getElementById('pi').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="pava">${init}</div>
        <div><h2 style="font-size:14px;font-weight:600;margin-bottom:2px">${c.n} <span style="font-size:10px;color:var(--txt3);font-family:var(--mono)">#ST-${String(c.id).padStart(4,'0')}</span></h2>
        <div style="font-size:11px;color:var(--txt2)">${c.emp||'—'} · ${c.s||'?'}</div></div>
      </div>
      <button class="pc" onclick="closePanel()">✕</button>
    </div>
    <div style="margin-bottom:12px;display:flex;gap:12px">
      ${c.l?`<a href="${c.l}" target="_blank" class="tdl" style="font-size:12px;display:inline-flex">↗ LinkedIn</a>`:''}
      ${c.cv?`<a href="${c.cv}" target="_blank" class="tdl" style="font-size:12px;display:inline-flex;color:var(--p)">📄 Ver CV</a>`:''}
    </div>
    ${stale?`<div style="background:var(--abg);border:1px solid var(--aborder);border-radius:var(--r);padding:8px 11px;margin-bottom:12px;font-size:12px;color:var(--amber)">⚠ <strong>Candidato estancado</strong> — ${daysInStage(c)} días en ${c.est} (umbral: ${thresholds[c.est]||10}d)<br><button class="btn btn-amber btn-sm" style="margin-top:6px" onclick="openEmailModal(${c.id})">📧 Generar notificación</button></div>`:''}
    <div class="psec"><div class="pst">Pipeline</div>${pSteps(c)}<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${sitB(c.sit)} ${estB(c.est)}${c.mo?` <span class="badge" style="background:var(--bg4);color:var(--txt3)">${c.mo}</span>`:''}</div></div>
    <div class="psec"><div class="pst">Historial de fechas</div>${timelineHTML}</div>
    <div class="psec"><div class="pst">Detalle</div>
      <div class="pr"><span class="prl">Stack</span><span>${chips(c.stack)}</span></div>
      <div class="pr"><span class="prl">Equipo sugerido</span><span style="font-size:11px">${c.eq||'—'}</span></div>
      <div class="pr"><span class="prl">Pool</span><span style="font-size:11px;color:${pcolor(c.pid)}">${pname(c.pid)}</span></div>
      <div class="pr"><span class="prl">Salario</span><span style="font-size:11px">${c.sal||(salOk?'—':'<em style="color:var(--txt3);font-size:10px">Desde Screening</em>')}</span></div>
      <div class="pr"><span class="prl">Sourcer</span><span style="font-size:11px">${c.src||'—'}</span></div>
      <div class="pr"><span class="prl">Recruiter</span><span style="font-size:11px">${c.rec||'—'}</span></div>
    </div>
    ${c.fb?`<div class="psec"><div class="pst">Feedback</div><div class="pfb">"${c.fb}"</div></div>`:''}
    ${editHTML}
    ${API_KEY?`<div class="aib"><div class="ait">✦ Análisis IA (Gemini)</div><div id="aio-${c.id}" class="aio" style="color:var(--txt3)">Haz clic para analizar con Google Gemini.</div><button class="btn btn-sm" style="margin-top:7px;width:100%;justify-content:center;border-color:var(--pborder);color:var(--p2)" onclick="aiCand(${c.id})">✦ Analizar</button></div>`:''}`;
  document.getElementById('panel').classList.add('open');
}
function closePanel(){ document.getElementById('panel').classList.remove('open'); }

function ownerForm(c,salOk,disc){
  const poolOptions = pools.map(p => `<option value="${p.id}" ${p.id == c.pid ? 'selected' : ''}>${p.name}</option>`).join('');
  return `<div class="psec"><div class="pst">Actualizar (Owner/Supervisor)</div><div class="uf">
    <label style="color:var(--p2); font-weight:600;">Pool / Categoría del Candidato</label>
    <select id="u-po" style="margin-bottom:12px; border-color:var(--pborder); background:var(--bg3);">${poolOptions}</select>
    <label>Estado pipeline</label>
    <select id="u-est">${[...STAGES,'Descartado','No interesado'].map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}</select>
    <label>Situación</label>
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
    <label>URL del CV (Drive, PDF)</label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="Pega el link del documento...">
    <label>Equipo sugerido (texto libre)</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?`<label>Rango salarial</label><input type="text" id="u-sal" value="${c.sal||''}" placeholder="Expectativa salarial">`:
    `<div class="ro">Rango salarial — disponible desde Screening</div>`}
    <label>Feedback</label>
    <textarea id="u-fb">${c.fb||''}</textarea>
    <button type="button" onclick="autoCategorizarDescarte(${c.id})" style="margin-top:5px; margin-bottom: 10px; background:var(--pbg); color:var(--p2); border:1px solid var(--pborder); border-radius:4px; padding:6px; font-size:11px; cursor:pointer; width: 100%;">
      ✨ Auto-Clasificar Motivo de Descarte con IA
    </button>
    <label>Motivo de descarte (Carpeta)</label>
    <select id="u-mo">
      <option value="">— sin motivo —</option>
      <option value="Renta" ${c.mo === 'Renta' ? 'selected' : ''}>Renta</option>
      <option value="Stack o tecnología" ${c.mo === 'Stack o tecnología' ? 'selected' : ''}>Stack o tecnología</option>
      <option value="Experiencia" ${c.mo === 'Experiencia' ? 'selected' : ''}>Experiencia</option>
      <option value="Seniority" ${c.mo === 'Seniority' ? 'selected' : ''}>Seniority</option>
      <option value="Formación" ${c.mo === 'Formación' ? 'selected' : ''}>Formación</option>
      <option value="No contesta" ${c.mo === 'No contesta' ? 'selected' : ''}>No contesta</option>
      <option value="No hay fit" ${c.mo === 'No hay fit' ? 'selected' : ''}>No hay fit</option>
      <option value="No interés" ${c.mo === 'No interés' ? 'selected' : ''}>No interés</option>
      <option value="Se bajó del proceso" ${c.mo === 'Se bajó del proceso' ? 'selected' : ''}>Se bajó del proceso</option>
    </select>
    <div id="ai-motivo-status" style="font-size:11px; margin-bottom:12px; margin-top:-6px;"></div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-p btn-sm" style="flex:1;justify-content:center" onclick="saveUpdate(${c.id},'owner')">Guardar</button>
      ${!disc?`<button class="btn btn-danger btn-sm" onclick="discardC(${c.id})">Descartar</button>`:''}
    </div>
  </div></div>`;
}

function recruiterForm(c){
  const isRejected = c.sit === 'Rechazado';
  return `<div class="psec"><div class="pst">Revisión de candidato (Recruiter)</div><div class="uf">
    ${c.sit !== 'Rechazado' ? `
    <div style="font-size:11px;color:var(--txt3);padding:8px 10px;background:var(--bg3);border-radius:var(--r);margin-bottom:8px;border-left:2px solid var(--p)">
      Aprueba si el perfil califica directo, o pídele al sourcer que lo evalúe contactándolo. Si rechazas, el candidato queda archivado.
    </div>` : `
    <div style="font-size:11px;color:var(--red);padding:8px 10px;background:rgba(224,92,92,.08);border-radius:var(--r);margin-bottom:8px;border-left:2px solid var(--red)">
      Candidato rechazado — no avanzará en el proceso.
    </div>`}
    <label>Decisión</label>
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
    <label>URL del CV (Drive, PDF)</label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="Pega el link del documento...">
    <label>Comentarios</label>
    <textarea id="u-fb" placeholder="Justificación o notas para el sourcer...">${c.fb||''}</textarea>
    <button class="btn btn-p btn-sm" style="width:100%;justify-content:center" onclick="saveUpdate(${c.id},'recruiter')">Guardar decisión</button>
  </div></div>`;
}

function sourcerForm(c,salOk){
  const canAdvance = c.sit === 'Aprobado' || c.sit === 'Por revisar';
  const isRejected = c.sit === 'Rechazado';
  const stagesAllowed = canAdvance ? [...STAGES,'Descartado'] : [c.est];
  return `<div class="psec"><div class="pst">Actualizar (Sourcer)</div><div class="uf">
    ${isRejected ? `
    <div style="font-size:11px;color:var(--red);padding:9px 11px;background:rgba(224,92,92,.08);border-radius:var(--r);border-left:2px solid var(--red);margin-bottom:8px">
      ✕ Candidato <strong>rechazado</strong> por el recruiter.
    </div>` : c.sit === 'Por revisar' ? `
    <div style="font-size:11px;color:var(--amber);padding:9px 11px;background:rgba(240,169,64,.08);border-radius:var(--r);border-left:2px solid var(--amber);margin-bottom:8px">
      ⏸ En revisión por el recruiter.
    </div>` : c.sit === 'Aprobado' ? `
    <div style="font-size:11px;color:var(--green);padding:9px 11px;background:rgba(45,212,160,.08);border-radius:var(--r);border-left:2px solid var(--green);margin-bottom:8px">
      ✓ Candidato <strong>aprobado</strong> por el recruiter.
    </div>` : ''}
    <label>Estado pipeline</label>
    <select id="u-est" ${isRejected?'disabled':''}>
      ${stagesAllowed.map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}
    </select>
    <label>URL del CV (Drive, PDF)</label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="Pega el link del documento...">
    <label>Equipo sugerido</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?`<label>Rango salarial</label><input type="text" id="u-sal" value="${c.sal||''}" placeholder="Expectativa salarial">`:
    `<div class="ro">Rango salarial — desde Screening</div>`}
    <label>Feedback / Notas</label><textarea id="u-fb">${c.fb||''}</textarea>
    <div style="display:flex;gap:6px;flex-direction:column">
      ${!isRejected?`<button class="btn btn-p btn-sm" style="justify-content:center" onclick="saveUpdate(${c.id},'sourcer')">Guardar cambios</button>`:''}
    </div>
  </div></div>`;
}

async function autoCategorizarDescarte(idx) {
  const feedback = document.getElementById('u-fb').value;
  const statusDiv = document.getElementById('ai-motivo-status');
  const selectMotivo = document.getElementById('u-mo');

  if (!API_KEY) { statusDiv.innerHTML = '<span style="color:var(--amber)">⚠ Requiere API Key de Gemini.</span>'; return; }
  if (!feedback.trim()) { statusDiv.innerHTML = '<span style="color:var(--amber)">⚠ Escribe un feedback en la casilla de arriba primero.</span>'; return; }

  statusDiv.innerHTML = '<span style="color:var(--txt2)">✨ Analizando feedback con Gemini...</span>';

  try {
    const prompt = `Actúa como un Tech Recruiter. Lee este feedback de un candidato descartado y clasifícalo en UNA sola categoría exacta de esta lista: Renta, Stack o tecnología, Experiencia, Seniority, Formación, No contesta, No hay fit, No interés, Se bajó del proceso. 
    Responde ÚNICAMENTE con el nombre de la categoría elegida. FEEDBACK: "${feedback}"`;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);

    let categoriaIA = d.candidates[0].content.parts[0].text.trim();
    let matchEncontrado = false;
    for (let i = 0; i < selectMotivo.options.length; i++) {
      if (selectMotivo.options[i].value.toLowerCase() === categoriaIA.toLowerCase()) {
        selectMotivo.selectedIndex = i; matchEncontrado = true; break;
      }
    }
    if(matchEncontrado){ statusDiv.innerHTML = `<span style="color:var(--green)">✓ Clasificado como: <strong>${categoriaIA}</strong></span>`; } 
    else { statusDiv.innerHTML = `<span style="color:var(--amber)">⚠ IA sugirió: "${categoriaIA}". Elige manual.</span>`; }
  } catch (err) { statusDiv.innerHTML = '<span style="color:var(--red)">⚠ Error al conectar con IA.</span>'; }
}

async function saveUpdate(id, role) {
  const c = cands.find(x=>x.id===id); if(!c) return;
  const prev = c.est;
  const changes = {};

  if(role==='recruiter'){
    changes.sit = document.getElementById('u-sit').value;
    changes.fb  = document.getElementById('u-fb').value;
    const cvEl = document.getElementById('u-cv'); if(cvEl) changes.cv = cvEl.value.trim();
  } else if(role==='sourcer'){
    if(c.sit === 'Rechazado'){ toast('Sin permisos','Candidato rechazado','err','✕'); return; }
    const newEst = document.getElementById('u-est')?.value;
    if(newEst) {
      changes.est = newEst;
      const newDates = {...(c.dates||{})};
      if(!newDates[newEst]) newDates[newEst] = new Date().toISOString().slice(0,10);
      changes.dates = newDates;
    }
    changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
    changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
    const se = document.getElementById('u-sal'); if(se) changes.sal = se.value;
    const cvEl = document.getElementById('u-cv'); if(cvEl) changes.cv = cvEl.value.trim();
  } else {
    const newEst = document.getElementById('u-est')?.value;
    if(newEst) {
      changes.est = newEst;
      const newDates = {...(c.dates||{})};
      if(!newDates[newEst]) newDates[newEst] = new Date().toISOString().slice(0,10);
      changes.dates = newDates;
    }
    const po = document.getElementById('u-po'); if(po && parseInt(po.value) !== c.pid) changes.pid = parseInt(po.value);
    changes.sit = document.getElementById('u-sit')?.value || c.sit;
    changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
    changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
    if(role!=='sourcer') changes.mo = document.getElementById('u-mo')?.value || c.mo;
    const se = document.getElementById('u-sal'); if(se) changes.sal = se.value;
    const cvEl = document.getElementById('u-cv'); if(cvEl) changes.cv = cvEl.value.trim();
  }

  Object.assign(c, changes);
  if(changes.dates) c.dates = changes.dates;

  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', { id, changes, changedBy: CU.name });
    setSyncStatus('ok');
  } catch(err) { setSyncStatus('error', '⚠ Guardado local'); }
  afterEdit(id, prev, c.est);
}

async function discardC(id){
  const c=cands.find(x=>x.id===id); if(!c||!confirm(`¿Descartar a ${c.n}?`)) return;
  const prev=c.est;
  const moValue = document.getElementById('u-mo')?.value || '';
  const changes = { 
      est:'Descartado', mo: moValue, dates:{...(c.dates||{}), Descartado: new Date().toISOString().slice(0,10)} 
  };
  Object.assign(c, changes); c.dates = changes.dates;
  setSyncStatus('loading');
  try { await apiCall('updateCandidate',{id,changes,changedBy:CU.name}); setSyncStatus('ok'); }
  catch(err) { setSyncStatus('error','⚠ Guardado local'); }
  afterEdit(id,prev,'Descartado');
}

function afterEdit(id,prev,newEst){
  buildSidebar();
  if(DISC_S.has(newEst)&&!DISC_S.has(prev)) toast(`${cands.find(x=>x.id===id)?.n} descartado`,'Regresó al historial','wrn','↩');
  else if(newEst!==prev) toast('Avanzó en pipeline',`${prev} → ${newEst}`,'ok','⬆');
  else toast('Candidato actualizado','','ok','✓');
  if(document.getElementById('v-pool').style.display==='flex') renderPool();
  if(document.getElementById('v-pipeline').style.display==='flex') renderPipeline();
  if(document.getElementById('v-kanban').style.display==='flex') renderKanban();
  if(document.getElementById('v-review')?.style.display==='flex') renderReview();
  openPanel(id);
}

function openAddCand(){
  if(!canAddCandidates()){ toast('Sin permisos','','err','⛔'); return; }
  document.getElementById('f-rc').innerHTML=allRecruiters().map(r=>`<option>${r}</option>`).join('');
  document.getElementById('f-po').innerHTML=pools.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('f-so').value=CU.name;
  ['f-n','f-l','f-st','f-em','f-eq'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-se').value='';
  openModal('mb-cand');
}

async function saveCand(){
  const n=(document.getElementById('f-n')?.value||'').trim();
  const st=(document.getElementById('f-st')?.value||'').trim();
  if(!n||!st){ toast('Nombre y stack son requeridos','','wrn','⚠'); return; }

  const btn = document.getElementById('btn-save-cand');
  btn.disabled=true; btn.textContent='Guardando...';

  const pid=parseInt(document.getElementById('f-po').value)||pools[0]?.id;
  const today=new Date().toISOString().slice(0,10);
  const nc={
    pid, n, l:document.getElementById('f-l').value.trim(),
    s:document.getElementById('f-se').value, stack:st,
    emp:document.getElementById('f-em').value.trim(),
    sit:'', est:'Contactado', mo:'',
    src:document.getElementById('f-so').value.trim()||CU.name,
    rec:document.getElementById('f-rc').value, fb:'',
    eq:document.getElementById('f-eq').value.trim(), sal:'', dt:today,
    dates:{Contactado:today}
  };

  setSyncStatus('loading');
  try {
    const res = await apiCall('addCandidate', nc);
    nc.id = res.id; cands.unshift(nc); setSyncStatus('ok');
    buildSidebar(); closeModal('mb-cand');
    if(document.getElementById('v-pool').style.display==='flex') renderPool();
    toast('Candidato agregado', `${n} agregado al pool`, 'ok', '⬡');
    setTimeout(()=>openEmailModal(nc.id), 400);
  } catch(err) {
    toast('Error al guardar', err.message, 'err', '⚠'); setSyncStatus('error');
  } finally { btn.disabled=false; btn.textContent='Guardar candidato'; }
}

function renderAnalytics(){
  const all=cands.filter(c=>canSeeCandidate(c));
  const byPool=pools.map(p=>({p,n:all.filter(c=>Number(c.pid)===Number(p.id)).length}));
  const mos={};
  all.filter(c=>c.mo).forEach(c=>{mos[c.mo]=(mos[c.mo]||0)+1;});
  const topM=Object.entries(mos).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const stks={};
  all.forEach(c=>c.stack.split(',').forEach(s=>{const t=s.trim();if(t)stks[t]=(stks[t]||0)+1;}));
  const topS=Object.entries(stks).sort((a,b)=>b[1]-a[1]).slice(0,5), mx=topS[0]?.[1]||1;
  const clrs=['#7c6ef0','#a78bfa','#5b9cf0','#2dd4a0','#f0a940'];
  const avgDays=STAGES.map(s=>{
    const sc=all.filter(c=>c.dates?.[s]);
    if(!sc.length) return {s,avg:null};
    const avgs=sc.map(c=>daysSince(c.dates[s])).filter(d=>d!==null);
    return {s,avg:avgs.length?Math.round(avgs.reduce((a,b)=>a+b,0)/avgs.length):null};
  });
  document.getElementById('analytics-body').innerHTML=`
    <div class="aib" style="margin-bottom:16px"><div class="ait">✦ Insights automáticos (Gemini)</div>
      <div id="auto-ai" class="aio" style="color:var(--txt3)">${API_KEY?'<span style="display:inline-flex;align-items:center;gap:6px"><span class="spin"></span> Analizando...</span>':'⚠ Agrega tu API key en Configuración para activar insights IA.'}</div>
    </div>
    <div class="ag">
      <div class="ac"><h3>Por pool</h3>${byPool.map(({p,n})=>`<div class="sr"><span style="display:flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.name}</span><span class="sv">${n}</span></div>`).join('')}</div>
      <div class="ac"><h3>Promedio días por etapa</h3>${avgDays.map(({s,avg})=>`<div class="sr"><span>${s}</span><span class="sv ${avg!==null&&avg>=(thresholds[s]||10)?'mv-r':''}">${avg!==null?avg+'d':'—'}</span></div>`).join('')}</div>
      <div class="ac"><h3>Top motivos de descarte</h3>${topM.map(([k,v])=>`<div class="sr"><span>${k}</span><span class="sv mv-r">${v}</span></div>`).join('')}${!topM.length?'<p style="font-size:11px;color:var(--txt3)">Sin datos aún</p>':''}</div>
      <div class="ac"><h3>Stacks más frecuentes</h3>${topS.map(([k,v],i)=>`<div class="br-row"><div class="br-label">${k}</div><div class="br-track"><div class="br-fill" style="width:${Math.max(v/mx*100,4)}%;background:${clrs[i]}22;color:${clrs[i]}">${v}</div></div></div>`).join('')}</div>
      <div class="ac"><h3>Estado actual</h3>
        <div class="sr"><span>Total</span><span class="sv">${all.length}</span></div>
        <div class="sr"><span>Pipeline activo</span><span class="sv mv-g">${all.filter(c=>isActiveInPipeline(c)).length}</span></div>
        <div class="sr"><span>Historial</span><span class="sv mv-r">${all.filter(c=>DISC_S.has(c.est)).length}</span></div>
        <div class="sr"><span style="color:var(--amber)">⚠ Estancados</span><span class="sv mv-r">${all.filter(c=>isStale(c)).length}</span></div>
      </div>
      <div class="ac"><h3>Por sourcer</h3>${[...new Set(all.map(c=>c.src))].filter(Boolean).map(s=>`<div class="sr"><span>${s}</span><span class="sv">${all.filter(c=>c.src===s).length}</span></div>`).join('')}</div>
    </div>
    <div id="deep-box" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:14px">
      <div class="ait" style="margin-bottom:9px">✦ Análisis profundo IA (Gemini Pro)</div>
      <div id="deep-out" class="aio"></div>
    </div>`;
  if(API_KEY) autoInsights();
}

async function autoInsights(){
  const all=cands.filter(c=>canSeeCandidate(c));
  const stale=all.filter(c=>isStale(c)).length;
  const prompt=`Eres analista senior de sourcing tech. Pool multi-equipo.\nTotal: ${all.length} | Activos: ${all.filter(c=>isActiveInPipeline(c)).length} | Descartados: ${all.filter(c=>DISC_S.has(c.est)).length} | Estancados: ${stale}\n3 insights accionables en bullets. Max 80 palabras.`;
  try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:350}})
    });
    const d=await r.json();
    const text=d.candidates?.[0]?.content?.parts?.[0]?.text||'Sin respuesta';
    const el=document.getElementById('auto-ai');
    if(el) el.innerHTML=`<div style="white-space:pre-wrap;line-height:1.7">${text}</div>`;
  } catch(e){ const el=document.getElementById('auto-ai'); if(el) el.textContent='Error de conexión con Gemini API.'; }
}

async function deepAnalysis(){
  if(!API_KEY){ toast('IA no configurada','','wrn','⚠'); return; }
  nav('analytics');
  await new Promise(r=>setTimeout(r,400));
  const box=document.getElementById('deep-box'), out=document.getElementById('deep-out');
  if(!box||!out) return;
  box.style.display='block'; out.innerHTML='<span style="display:inline-flex;align-items:center;gap:6px"><span class="spin"></span> Generando con Gemini...</span>';
  const all=cands.filter(c=>canSeeCandidate(c));
  const fbs=all.filter(c=>c.fb).map(c=>`${c.n} (${c.est}): ${c.fb}`).join('\n');
  const stale=all.filter(c=>isStale(c)).map(c=>`${c.n} (${daysInStage(c)}d en ${c.est})`).join(', ');
  const prompt=`Experta en sourcing tech. Pool: ${all.length} candidatos. Estancados: ${stale||'ninguno'}.\n\nFeedbacks:\n${fbs.substring(0,2200)}\n\n1. Patrón de fallos 2. Perfil que convierte 3. 3 cambios de estrategia. Max 220 palabras.`;
  try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:700}})
    });
    const d=await r.json();
    const text=d.candidates?.[0]?.content?.parts?.[0]?.text||'Sin respuesta';
    out.innerHTML=`<div style="white-space:pre-wrap;line-height:1.7">${text}</div>`;
  } catch(e){ out.textContent='Error de conexión con Gemini API.'; }
}

async function aiCand(id){
  if(!API_KEY) return;
  const c=cands.find(x=>x.id===id); if(!c) return;
  const out=document.getElementById(`aio-${id}`); if(!out) return;
  out.innerHTML='<span style="display:inline-flex;align-items:center;gap:6px"><span class="spin"></span></span>';
  const days=daysInStage(c);
  const prompt=`Tech Sourcer assistant. Candidato: ${c.n} | ${c.stack} | ${c.emp} | ${c.s} | ${c.est} (${days??'?'}d) | Eq: ${c.eq} | Sal: ${c.sal||'N/A'}\nFb: ${c.fb||'—'} | Motivo: ${c.mo||'—'}\n3 puntos: 1.Evaluación 2.Próxima acción 3.Riesgo. Max 90 palabras.`;
  try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:350}})
    });
    const d=await r.json();
    const text=d.candidates?.[0]?.content?.parts?.[0]?.text||'Sin respuesta';
    out.textContent=text;
  } catch(e){ out.textContent='Error de conexión con Gemini API.'; }
}


// =====================================
// VISTA ESTANCADOS
// =====================================
function renderStale(){
  const stale = getStaleCands();
  const sb = document.getElementById('stale-body'); if(!sb) return;

  if(!stale.length){
    sb.innerHTML=`<div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">✓</div>
      <div style="font-size:13px">Sin candidatos estancados</div>
      <div style="font-size:11px;margin-top:4px">Todo el pipeline está al día</div>
    </div>`;
    return;
  }

  // Agrupar por etapa
  const byStage = {};
  stale.forEach(c => { if(!byStage[c.est]) byStage[c.est]=[]; byStage[c.est].push(c); });

  sb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl" style="color:var(--amber)">Estancados</div><div class="mcv mv-r">${stale.length}</div><div class="mcs">candidatos</div></div>
      <div class="mc"><div class="mcl">Promedio</div><div class="mcv mv-r">${Math.round(stale.map(c=>daysInStage(c)||0).reduce((a,b)=>a+b,0)/stale.length)}d</div><div class="mcs">días parados</div></div>
      <div class="mc"><div class="mcl">Más tiempo</div><div class="mcv mv-r">${Math.max(...stale.map(c=>daysInStage(c)||0))}d</div><div class="mcs">máximo</div></div>
    </div>
    ${Object.entries(byStage).map(([stage, cs])=>`
    <div class="rev-section" style="margin-bottom:20px">
      <div class="rev-sec-title" style="color:var(--amber)">⚠ ${stage} <span class="nb danger">${cs.length}</span></div>
      <div class="rev-list">
        ${cs.sort((a,b)=>(daysInStage(b)||0)-(daysInStage(a)||0)).map(c=>`
        <div class="rev-card" onclick="openPanel(${c.id})" style="cursor:pointer;border-color:rgba(240,169,64,.25)">
          <div class="rev-card-top">
            <div style="flex:1;min-width:0">
              <div class="rev-name">${c.n} <span style="color:var(--amber);font-size:11px;font-family:var(--mono)">${daysInStage(c)}d</span></div>
              <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · <span style="color:var(--p2)">${c.stack}</span></div>
              ${c.fb?`<div class="rev-fb">"${c.fb}"</div>`:''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
              <span style="font-size:10px;color:var(--txt3)">${c.rec||'—'}</span>
              <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openEmailModal(${c.id})">📧 Notificar</button>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('')}
  `;
}

// =====================================
// VISTA MI DÍA
// =====================================
function getTodayCands(){
  const all = cands.filter(c=>canSeeCandidate(c));
  const result = [];
  // Pendientes de revisión (recruiter/owner)
  if(HAT==='recruiter'||HAT==='owner'||HAT==='supervisor'){
    all.filter(c=>(!c.sit||c.sit==='')&&!DISC_S.has(c.est)).forEach(c=>result.push({c,reason:'Pendiente de revisión'}));
  }
  // Estancados propios
  all.filter(c=>isStale(c)).forEach(c=>{
    if(!result.find(r=>r.c.id===c.id)) result.push({c,reason:`Estancado — ${daysInStage(c)}d en ${c.est}`});
  });
  // En pipeline activo sin feedback
  all.filter(c=>isActiveInPipeline(c)&&!c.fb&&!DISC_S.has(c.est)).forEach(c=>{
    if(!result.find(r=>r.c.id===c.id)) result.push({c,reason:'Sin feedback registrado'});
  });
  return result;
}

let todayFilter = '';

function setTodayFilter(key){
  todayFilter = todayFilter === key ? '' : key;
  renderToday();
}

function renderToday(){
  const tb = document.getElementById('today-body'); if(!tb) return;
  document.getElementById('today-title').textContent = `Mi día — ${CU.name.split(' ')[0]}`;
  const items = getTodayCands();
  const nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = items.length;

  if(!items.length){
    tb.innerHTML=`<div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">🎉</div>
      <div style="font-size:13px;font-weight:600;color:var(--txt)">Todo al día</div>
      <div style="font-size:11px;margin-top:6px">No tienes candidatos pendientes por hoy</div>
    </div>`;
    return;
  }

  const groups = {};
  items.forEach(({c,reason})=>{ const key=reason.split('—')[0].trim(); if(!groups[key])groups[key]=[]; groups[key].push({c,reason}); });

  const icons  = {'Pendiente de revisión':'⏳','Estancado':'⚠','Sin feedback registrado':'💬'};
  const colors = {'Pendiente de revisión':'var(--p2)','Estancado':'var(--amber)','Sin feedback registrado':'var(--txt2)'};

  // Tarjetas de categoría clickeables en el resumen
  const filterTabs = Object.entries(groups).map(([key, list])=>`
    <div class="mc" onclick="setTodayFilter('${key}')" style="cursor:pointer;border:1px solid ${todayFilter===key?(colors[key]||'var(--border2)'):'var(--border)'};transition:border-color .15s;${todayFilter===key?'background:var(--bg3)':''}">
      <div class="mcl" style="color:${colors[key]||'var(--txt3)'}">${icons[key]||'•'} ${key}</div>
      <div class="mcv" style="color:${colors[key]||'var(--txt)'}">${list.length}</div>
      <div class="mcs">${todayFilter===key?'clic para ver todo':'clic para filtrar'}</div>
    </div>`).join('');

  // Filtrar grupos según selección
  const visibleGroups = todayFilter
    ? Object.entries(groups).filter(([key])=>key===todayFilter)
    : Object.entries(groups);

  tb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">${filterTabs}</div>
    ${todayFilter?`<div style="font-size:11px;color:var(--txt3);margin-bottom:12px;display:flex;align-items:center;gap:8px">
      Mostrando solo: <span style="color:${colors[todayFilter]||'var(--txt)'};font-weight:600">${icons[todayFilter]||''} ${todayFilter}</span>
      <button class="btn btn-sm btn-ghost" style="padding:2px 8px" onclick="setTodayFilter('')">✕ Ver todo</button>
    </div>`:''}
    ${visibleGroups.map(([key, list])=>`
    <div class="rev-section" style="margin-bottom:20px">
      <div class="rev-sec-title" style="color:${colors[key]||'var(--txt3)'}">
        ${icons[key]||'•'} ${key} <span class="nb">${list.length}</span>
      </div>
      <div class="rev-list">
        ${list.map(({c,reason})=>`
        <div class="rev-card" onclick="openPanel(${c.id})" style="cursor:pointer">
          <div class="rev-card-top">
            <div style="flex:1;min-width:0">
              <div class="rev-name">${c.n}</div>
              <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · <span style="color:var(--p2)">${c.stack}</span></div>
              <div style="font-size:10px;color:${colors[key]||'var(--txt3)'};margin-top:3px">${reason}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
              ${estB(c.est)}
              <span style="font-size:10px;color:var(--txt3)">${c.rec||c.src||'—'}</span>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('')}
  `;
}

function renderConfig(){
  document.getElementById('threshold-rows').innerHTML=STAGES.map(s=>`
    <div class="threshold-row">
      <div><div style="font-size:13px;font-weight:500">${s}</div><div style="font-size:11px;color:var(--txt3)">Días sin actualización</div></div>
      <div class="threshold-val"><input type="number" id="thr-${s.replace(/ /g,'_')}" value="${thresholds[s]||10}" min="1" max="60"> <span style="font-size:11px;color:var(--txt3)">días</span></div>
    </div>`).join('');
  document.getElementById('cfg-pools').innerHTML=pools.map(p=>`
    <div class="pool-cfg"><h3><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.name}</h3>
    <div style="font-size:11px;color:var(--txt2)">${p.desc||''} · ${cands.filter(c=>Number(c.pid)===Number(p.id)).length} candidatos</div></div>`).join('');
  document.getElementById('cfg-squads').innerHTML=SQUADS.map(s=>`
    <div class="pool-cfg"><h3>${s.name}</h3>
      <div class="squad-row"><strong>Owners</strong><span>${s.owners.join(', ')}</span></div>
      <div class="squad-row"><strong>Recruiters</strong><span>${s.recruiters.join(', ')}</span></div>
      <div class="squad-row"><strong>Sourcers</strong><span>${s.sourcers.join(', ')}</span></div>
    </div>`).join('');
  const urlInput = document.getElementById('cfg-sheets-url');
  if(urlInput) urlInput.value = SHEETS_URL;
  const ck=document.getElementById('cfg-key'); if(ck&&API_KEY) ck.value=API_KEY;
  const statusCfg=document.getElementById('sheets-status-cfg');
  if(statusCfg) statusCfg.textContent = IS_OFFLINE ? 'Modo demo (local)' : SHEETS_URL ? `✓ Conectado: ${SHEETS_URL.slice(0,50)}...` : 'Sin configurar';
}

function saveThresholds(){
  STAGES.forEach(s=>{const el=document.getElementById('thr-'+s.replace(/ /g,'_')); if(el) thresholds[s]=parseInt(el.value)||10;});
  saveLocal(); updateStaleSidebar(); toast('Umbrales guardados','','ok','✓');
}

function saveKey(){
  const k=document.getElementById('cfg-key').value.trim();
  API_KEY=k; if(k) localStorage.setItem('st4_key',k); else localStorage.removeItem('st4_key');
  toast(k?'IA activada':'IA desactivada','','ok','✦');
}

async function createPool(){
  const n=document.getElementById('np-n').value.trim();
  if(!n){ toast('Nombre requerido','','wrn','⚠'); return; }
  const newPool={name:n, desc:document.getElementById('np-d').value.trim(), color:document.getElementById('np-c').value};
  try {
    const res = await apiCall('addPool', newPool);
    newPool.id = res.id; pools.push(newPool);
    buildSidebar(); closeModal('mb-pool'); renderConfig();
    toast('Pool creado',n,'ok','⬡');
  } catch(err){ toast('Error al crear pool',err.message,'err','⚠'); }
}

function exportCSV(){
  const all=cands.filter(c=>canSeeCandidate(c));
  const h=['ID','Pool','Nombre','LinkedIn','Stack','Empresa','Seniority','Situación','Estado','Motivo','Equipo','Salario','Recruiter','Sourcer','Feedback','Fecha ingreso','F.Contactado','F.Screening','F.Ent.Inicial','F.Ent.EM','F.Misión','F.Descartado'];
  const r=all.map(c=>[`#ST-${String(c.id).padStart(4,'0')}`,pname(c.pid),c.n,c.l,c.stack,c.emp,c.s,c.sit,c.est,c.mo,c.eq,c.sal,c.rec,c.src,c.fb,c.dt,
    c.dates?.Contactado||'',c.dates?.Screening||'',c.dates?.['Entrevista Inicial']||'',c.dates?.['Entrevista EM']||'',c.dates?.Misión||'',c.dates?.Descartado||''
  ].map(v=>`"${(v||'').replace(/"/g,'""')}"`));
  const csv=[h,...r].map(x=>x.join(',')).join('\n');
  const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download=`sourcer_pool_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  toast('CSV exportado',`${all.length} candidatos`,'ok','↓');
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function toast(title,msg,type='inf',icon='ℹ'){
  const c=document.getElementById('toasts'); if(!c) return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<div class="ti">${icon}</div><div><div class="tt">${title}</div>${msg?`<div class="tm">${msg}</div>`:''}</div>`;
  c.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(300px)';el.style.transition='all .25s';setTimeout(()=>el.remove(),250);},5000);
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePanel();['mb-cand','mb-pool','mb-email'].forEach(closeModal);}
});

setInterval(()=>{ if(document.getElementById('app').style.display!=='none'&&!IS_OFFLINE) syncNow(); }, 120000);

document.addEventListener('DOMContentLoaded', () => {
  if (SHEETS_URL) {
    document.getElementById('setup').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    buildLoginList();
    
    const safeUrlStr = getSafeUrl(SHEETS_URL);
    
    fetch(`${safeUrlStr}?action=ping`)
      .then(r => r.json())
      .then(d => { if(d.ok) setSyncStatus('ok'); else setSyncStatus('error','⚠ Script no responde'); })
      .catch(() => setSyncStatus('error', '⚠ Sin conexión'));
  } else {
    document.getElementById('setup').style.display = 'flex';
    document.getElementById('login').style.display = 'none';
    buildLoginList();
  }
});
