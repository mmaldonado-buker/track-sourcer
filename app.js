// GOOGLE SHEETS API LAYER
let SHEETS_URL = localStorage.getItem('st4_sheets_url') || '';
let IS_OFFLINE = false;

async function sheetsAPI(action, payload = null) {
  if (IS_OFFLINE) throw new Error('Modo offline');
  if (!SHEETS_URL) throw new Error('URL no configurada');
  const url = new URL(SHEETS_URL);
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
    const resp = await fetch(`${url}?action=ping`);
    const data = await resp.json();
    if (!data.ok) throw new Error('El script no responde correctamente');
    SHEETS_URL = url; localStorage.setItem('st4_sheets_url', url); IS_OFFLINE = false;
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
    
    // Forzar el uso de los nombres de pools correctos si el backend devuelve los viejos
    let fetchedPools = pResp.pools || [];
    if (fetchedPools.length === 0 || fetchedPools.some(p => p.name === 'Software Engineers' || p.name === 'Tribu Plataforma')) {
        fetchedPools = JSON.parse(JSON.stringify(DEFAULT_POOLS));
    }
    pools = fetchedPools;
    
    localStorage.setItem('st4_cands', JSON.stringify(cands));
    localStorage.setItem('st4_pools', JSON.stringify(pools));
    setSyncStatus('ok'); buildSidebar();
    
    const views = ['pool','pipeline','kanban','analytics','review'];
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
  {id:'JQ', name:'Jonathan Quiroz',    role:'supervisor', team:'A', color:'#7c6ef0', email:'jquiroz@buk.mx'},
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
  {id:'B', name:'Squad B', owners:['Catalina Poblete','Gaspar Jaramillo'], recruiters:['Gaspar Jaramillo'], sourcers:['Valentina Larenas']},
  {id:'C', name:'Squad C', owners:['Laura Rodriguez'],  recruiters:['Joaquín Maragaño'], sourcers:['Matías Maldonado']},
];

const DEFAULT_POOLS = [
  {id:1, name:'Devs', desc:'Pool general de ingenieros de software', color:'#5b9cf0'},
  {id:2, name:'PLTF', desc:'DevOps, DevSecOps, DevEx y afines',      color:'#7c6ef0'},
  {id:3, name:'EM',   desc:'Engineering Managers por célula',        color:'#e06cc0'},
];

const DEFAULT_THRESHOLDS = { 'Contactado':7, 'Screening':7, 'Entrevista Inicial':10, 'Entrevista EM':10, 'Misión':14 };
const STAGES   = ['Contactado','Screening','Entrevista Inicial','Entrevista EM','Misión'];
const ACTIVE_S = new Set(['Entrevista Inicial','Entrevista EM','Misión']);
const DISC_S   = new Set(['Descartado','No interesado']);
const SCREEN_S = new Set(['Screening','Entrevista Inicial','Entrevista EM','Misión']);

const today_d = new Date();
function daysAgo(n){ const d=new Date(today_d); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
const SEED = [
  {id:1,pid:2,n:'Brian Guadron',    l:'https://linkedin.com/in/brianguadron',      s:'L2',stack:'JavaScript',  emp:'LifeMiles',      sit:'Aprobado',   est:'Entrevista Inicial',mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Buen candidato pasado dev + devops',         eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(25),Screening:daysAgo(18),'Entrevista Inicial':daysAgo(12)},dt:daysAgo(25)},
  {id:2,pid:2,n:'Michael Salgado',  l:'https://linkedin.com/in/michael-salgado',   s:'L2',stack:'Javascript',  emp:'UPRA',           sit:'Aprobado',   est:'Screening',         mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Me gusta, experiencia orientada a producto', eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(14),Screening:daysAgo(5)},dt:daysAgo(14)},
  {id:3,pid:1,n:'Daniel Amaya',     l:'https://linkedin.com/in/amayabdaniel',       s:'L3',stack:'RoR, TS',     emp:'Furnished Finder',sit:'Aprobado',  est:'Contactado',        mo:'',src:'Catalina León',    rec:'Gaspar Jaramillo',fb:'Me gustó mucho, hagamos outreach',          eq:'Backend',    sal:'',       dates:{Contactado:daysAgo(3)},dt:daysAgo(3)},
];

// STATE
let CU = null, HAT = '', API_KEY = '';
let pools = [], cands = [];
let currentPool = null, pipeStageF = '';
let thresholds = {}, emailMap = {};
let selUserId = null;

// STORAGE
function loadLocalConfig() {
  const st = localStorage.getItem('st4_thresh');
  thresholds = st ? JSON.parse(st) : {...DEFAULT_THRESHOLDS};
  USERS.forEach(u => { emailMap[u.name] = u.email; });
  API_KEY = localStorage.getItem('st4_key') || '';
  
  // Limpiador de Caché de Pools
  let sp = localStorage.getItem('st4_pools');
  if (sp && (sp.includes('Software Engineers') || sp.includes('Tribu Plataforma'))) {
      sp = null;
      localStorage.removeItem('st4_pools');
  }
  pools = sp ? JSON.parse(sp) : JSON.parse(JSON.stringify(DEFAULT_POOLS));
  
  const sc = localStorage.getItem('st4_cands');
  cands = sc ? JSON.parse(sc) : JSON.parse(JSON.stringify(SEED));
}
function saveLocal() { localStorage.setItem('st4_thresh', JSON.stringify(thresholds)); }

// HELPERS
function daysSince(dateStr){ if(!dateStr) return null; return Math.floor((new Date()-new Date(dateStr))/(86400000)); }
function daysInStage(c){ return daysSince(c.dates?.[c.est]); }
function isStale(c){ if(DISC_S.has(c.est)) return false; const d=daysInStage(c); return d!==null && d>=(thresholds[c.est]||10); }
function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('es-CL',{day:'numeric',month:'short'}); }
function daysLabel(n,thresh){ if(n===null) return '—'; const cls=n>=thresh?(n>=thresh*1.5?'danger':'warn'):'ok'; return `<span class="tl-days ${cls}">${n}d</span>`; }
function getStaleCands(){ return cands.filter(c=>!DISC_S.has(c.est)&&isStale(c)&&canSeeCandidate(c)); }

function checkStaleNow(){
  const stale=getStaleCands();
  if(!stale.length){ toast('Sin candidatos estancados','Todo el pipeline está al día','ok','✓'); return; }
  updateStaleSidebar();
  toast(`${stale.length} estancado${stale.length>1?'s':''}`, 'Ver en sidebar','wrn','⚠');
}

function updateStaleSidebar(){
  const stale=getStaleCands();
  const sec=document.getElementById('sb-stale-sec'), list=document.getElementById('sb-stale-list'), nb=document.getElementById('nb-stale');
  if(!sec) return;
  if(stale.length){
    sec.style.display=''; nb.textContent=stale.length;
    list.innerHTML=stale.slice(0,4).map(c=>`
      <div class="ni" style="flex-direction:column;align-items:flex-start;gap:2px;border:1px solid var(--aborder);background:var(--abg);border-radius:var(--r);margin-bottom:3px;padding:7px 8px" onclick="openPanel(${c.id})">
        <div style="font-size:11px;font-weight:600;color:var(--amber)">${c.n}</div>
        <div style="font-size:10px;color:var(--txt3)">${c.est} · ${daysInStage(c)}d sin actualizar</div>
      </div>`).join('');
  } else { sec.style.display='none'; }
}

function buildStaleEmail(c){
  const days=daysInStage(c), thresh=thresholds[c.est]||10;
  const involvedNames=[...new Set([c.src,c.rec,getOwnerForTeam(c)])].filter(Boolean);
  const toEmails=involvedNames.map(n=>emailMap[n]||n).join(', ');
  const subject=`[SourcerTrack] ⚠ Candidato estancado: ${c.n} (${days} días en ${c.est})`;
  const body=`Hola equipo,\n\nEste es un recordatorio automático de SourcerTrack.\n\nEl candidato ${c.n} lleva ${days} días en la etapa "${c.est}", superando el umbral de ${thresh} días.\n\nDetalles:\n• Pool: ${pname(c.pid)}\n• Etapa actual: ${c.est}\n• Equipo sugerido: ${c.eq||'—'}\n• Sourcer: ${c.src||'—'}\n• Recruiter: ${c.rec||'—'}\n• Rango salarial: ${c.sal||'No registrado'}\n\nPor favor actualiza el estado en SourcerTrack.\nID: #ST-${String(c.id).padStart(4,'0')}\n\nSourcerTrack v4.1`;
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

// LOGIN DIRECTO AUTOMÁTICO
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
  if(HAT==='recruiter' || HAT==='owner') nav('review');
  else { currentPool=pools[0]?.id||1; nav('pool'); }
  toast('Bienvenid@',CU.name,CU.role==='viewer'?'inf':'ok','⬡');
}

// ==========================================
// SISTEMA ESTRICTO DE ROLES Y VISIBILIDAD
// ==========================================
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

function canEditFull(c) {
  if (HAT === 'viewer') return false;
  if (HAT === 'owner' || HAT === 'supervisor') return true;
  return false;
}

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
  
  const nbr=document.getElementById('nb-review');
  if(nbr) nbr.textContent=cands.filter(c=>canSeeCandidate(c)&&(c.est==='Screening'||c.est==='Contactado')&&c.sit==='Por revisar').length;
  
  const nbpipe = document.getElementById('nb-pipe');
  if(nbpipe) nbpipe.textContent=cands.filter(c=>canSeeCandidate(c)&&ACTIVE_S.has(c.est)).length;
}

function updateFooter(){
  const roleLabel={owner:'Owner',recruiter:'Recruiter',sourcer:'Sourcer',supervisor:'Supervisor',viewer:'Tech Lead'};
  const ava=document.getElementById('sb-ava');
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
  } else if(view==='config'){
    document.getElementById('v-config').style.display='flex';
    document.getElementById('ni-config')?.classList.add('active');
    renderConfig();
  }
}

function sitB(s){ const m={Aprobado:'ba',Rechazado:'br','Por revisar':'bpr'}; return `<span class="badge ${m[s]||''}">${s||'—'}</span>`; }
function estB(e){ const m={Contactado:'bco',Screening:'bsc','Entrevista Inicial':'bei','Entrevista EM':'bem',Misión:'bmi',Descartado:'bde','No interesado':'bde'}; return `<span class="badge ${m[e]||''}">${e||'—'}</span>`; }
function chips(s){ if(!s) return '—'; return s.split(',').map(x=>`<span class="chip">${x.trim()}</span>`).join(''); }
function pname(id){ return pools.find(p=>p.id===id)?.name||'—'; }
function pcolor(id){ return pools.find(p=>p.id===id)?.color||'var(--txt3)'; }
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

function getPoolCands(){ return cands.filter(c=>c.pid===currentPool&&canSeeCandidate(c)); }

function renderPoolView(){
  const pool=pools.find(p=>p.id===currentPool); if(!pool) return;
  document.getElementById('pool-title').textContent=pool.name;
  document.getElementById('pool-ptabs').innerHTML=pools.map(p=>`
    <button class="ptab${p.id===currentPool?' active':''}" onclick="nav('pool',${p.id})">
      <span style="width:6px;height:6px;border-radius:50%;background:${p.color};display:inline-block;margin-right:4px;vertical-align:middle"></span>${p.name}
    </button>`).join('');
  const cs=getPoolCands();
  const active=cs.filter(c=>ACTIVE_S.has(c.est)).length, disc=cs.filter(c=>DISC_S.has(c.est)).length;
  const aprov=cs.filter(c=>c.sit==='Aprobado').length, stale=cs.filter(c=>isStale(c)).length;
  document.getElementById('pool-mg').innerHTML=`
    <div class="mc"><div class="mcl">Total pool</div><div class="mcv mv-p">${cs.length}</div><div class="mcs">candidatos</div></div>
    <div class="mc"><div class="mcl">Aprobados</div><div class="mcv mv-g">${aprov}</div><div class="mcs">${cs.length?Math.round(aprov/cs.length*100):0}%</div></div>
    <div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-a">${active}</div><div class="mcs">Ent.Inicial+</div></div>
    <div class="mc"><div class="mcl" style="color:var(--amber)">Estancados</div><div class="mcv mv-r">${stale}</div><div class="mcs">sin actualizar</div></div>`;
  renderPool();
}

function renderPool(){
  const q=(document.getElementById('ps-q')?.value||'').toLowerCase();
  const fs=document.getElementById('ps-sit')?.value||'';
  const fe=document.getElementById('ps-est')?.value||'';
  let cs=getPoolCands().filter(c=>{
    if(q&&!c.n.toLowerCase().includes(q)&&!c.stack.toLowerCase().includes(q)&&!(c.emp||'').toLowerCase().includes(q)) return false;
    if(fs&&c.sit!==fs) return false; if(fe&&c.est!==fe) return false; return true;
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
  const stages=['Todas','Entrevista Inicial','Entrevista EM','Misión'];
  document.getElementById('pipe-stabs').innerHTML=stages.map(s=>`<button class="stab${pipeStageF===(s==='Todas'?'':s)?' active':''}" onclick="setPipeStage('${s==='Todas'?'':s}')">${s}</button>`).join('');
}
function setPipeStage(s){ pipeStageF=s; buildStageTabs(); renderPipeline(); }
function getPipeCands(){
  const pf=parseInt(document.getElementById('pipe-pool-f')?.value)||0;
  return cands.filter(c=>ACTIVE_S.has(c.est)&&(!pf||c.pid===pf)&&(!pipeStageF||c.est===pipeStageF)&&canSeeCandidate(c));
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
    </tr>`).join(''):`<tr><td colspan="9" class="nr">Sin candidatos en pipeline activo.</td></tr>`;
  const all=cands.filter(c=>ACTIVE_S.has(c.est)&&canSeeCandidate(c));
  document.getElementById('pipe-mg').innerHTML=`
    <div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-p">${all.length}</div><div class="mcs">activos</div></div>
    <div class="mc"><div class="mcl">Ent. Inicial</div><div class="mcv mv-a">${all.filter(c=>c.est==='Entrevista Inicial').length}</div></div>
    <div class="mc"><div class="mcl">Ent. EM</div><div class="mcv" style="color:var(--pink)">${all.filter(c=>c.est==='Entrevista EM').length}</div></div>
    <div class="mc"><div class="mcl">Misión</div><div class="mcv mv-g">${all.filter(c=>c.est==='Misión').length}</div></div>`;
  const sc=['Entrevista Inicial','Entrevista EM','Misión'], cnt=sc.map(s=>all.filter(c=>c.est===s).length), mx=Math.max(...cnt,1);
  const cl=['#a78bfa','#e06cc0','#2dd4a0'];
  document.getElementById('pipe-funnel').innerHTML=`<h3 style="font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.09em;margin-bottom:10px">Embudo</h3>`+
    sc.map((s,i)=>`<div class="br-row"><div class="br-label">${s}</div><div class="br-track"><div class="br-fill" style="width:${Math.max(cnt[i]/mx*100,3)}%;background:${cl[i]}22;color:${cl[i]}">${cnt[i]||''}</div></div><div style="font-size:10px;color:var(--txt3);width:18px">${cnt[i]}</div></div>`).join('');
}

function renderKanban(){
  const stages=['Entrevista Inicial','Entrevista EM','Misión'];
  const clrs={'Entrevista Inicial':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#2dd4a0'};
  document.getElementById('kb-board').innerHTML=stages.map(stage=>{
    const cards=cands.filter(c=>c.est===stage&&canSeeCandidate(c));
    return `<div class="kc"><div class="kch"><div class="kct" style="color:${clrs[stage]}">${stage}</div><div class="kcc">${cards.length}</div></div>
      <div class="kcards">${cards.length?cards.map(c=>`
        <div class="kcard${isStale(c)?' stale-card-k':''}" onclick="openPanel(${c.id})">
          <div class="kn">${c.n}${isStale(c)?' <span style="color:var(--amber)">⚠</span>':''}</div>
          <div class="km">${c.emp||'—'} · ${c.s||'?'} · ${daysInStage(c)??'—'}d</div>
          <div style="margin-top:4px">${chips(c.stack)}</div>
        </div>`).join(''):`<div class="ke">Sin candidatos</div>`}
      </div></div>`;
  }).join('');
}

function openPanel(id){
  const c=cands.find(x=>x.id===id); if(!c||!canSeeCandidate(c)) return;
  const init=c.n.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
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
    ${c.l?`<a href="${c.l}" target="_blank" class="tdl" style="font-size:12px;margin-bottom:12px;display:inline-flex">↗ Ver en LinkedIn</a>`:''}
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
  const poolOptions = pools.map(p => `<option value="${p.id}" ${p.id === c.pid ? 'selected' : ''}>${p.name}</option>`).join('');
  return `<div class="psec"><div class="pst">Actualizar (Owner/Supervisor)</div><div class="uf">
    <label style="color:var(--p2); font-weight:600;">Pool / Categoría del Candidato</label>
    <select id="u-po" style="margin-bottom:12px; border-color:var(--pborder); background:var(--bg3);">${poolOptions}</select>
    <label>Estado pipeline</label>
    <select id="u-est">${[...STAGES,'Descartado','No interesado'].map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}</select>
    <label>Situación</label>
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
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
      Aprueba o deja en revisión para que el sourcer pueda iniciar el screening. Si rechazas, el candidato queda archivado.
    </div>` : `
    <div style="font-size:11px;color:var(--red);padding:8px 10px;background:rgba(224,92,92,.08);border-radius:var(--r);margin-bottom:8px;border-left:2px solid var(--red)">
      Candidato rechazado — no avanzará en el proceso.
    </div>`}
    <label>Decisión</label>
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
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
      ✕ Candidato <strong>rechazado</strong> por el recruiter — no puede avanzar en el proceso.
    </div>` : c.sit === 'Por revisar' ? `
    <div style="font-size:11px;color:var(--amber);padding:9px 11px;background:rgba(240,169,64,.08);border-radius:var(--r);border-left:2px solid var(--amber);margin-bottom:8px">
      ⏸ En revisión por el recruiter — ya puedes iniciar el screening mientras decide.
    </div>` : c.sit === 'Aprobado' ? `
    <div style="font-size:11px;color:var(--green);padding:9px 11px;background:rgba(45,212,160,.08);border-radius:var(--r);border-left:2px solid var(--green);margin-bottom:8px">
      ✓ Candidato <strong>aprobado</strong> por el recruiter — puedes avanzar el proceso.
    </div>` : ''}
    <label>Estado pipeline</label>
    <select id="u-est" ${isRejected?'disabled':''}>
      ${stagesAllowed.map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}
    </select>
    <label>Equipo sugerido</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?`<label>Rango salarial</label><input type="text" id="u-sal" value="${c.sal||''}" placeholder="Expectativa salarial">`:
    `<div class="ro">Rango salarial — desde Screening</div>`}
    <label>Feedback / Notas</label><textarea id="u-fb">${c.fb||''}</textarea>
    <div style="display:flex;gap:6px;flex-direction:column">
      ${!isRejected?`<button class="btn btn-p btn-sm" style="justify-content:center" onclick="saveUpdate(${c.id},'sourcer')">Guardar cambios</button>`:''}
      ${c.sit==='Por revisar'?`<button class="btn btn-amber btn-sm" style="justify-content:center" onclick="openEmailModal(${c.id})">📧 Notificar al Recruiter</button>`:''}
    </div>
  </div></div>`;
}

// Clasificar motivos de descarte basados en el feedback escrito
async function autoCategorizarDescarte(idx) {
  const feedback = document.getElementById('u-fb').value;
  const statusDiv = document.getElementById('ai-motivo-status');
  const selectMotivo = document.getElementById('u-mo');

  if (!API_KEY) {
      statusDiv.innerHTML = '<span style="color:var(--amber)">⚠ Requiere API Key de Gemini.</span>';
      return;
  }

  if (!feedback.trim()) {
    statusDiv.innerHTML = '<span style="color:var(--amber)">⚠ Escribe un feedback en la casilla de arriba primero.</span>';
    return;
  }

  statusDiv.innerHTML = '<span style="color:var(--txt2)">✨ Analizando feedback con Gemini...</span>';

  try {
    const prompt = `Actúa como un Tech Recruiter. Lee este feedback de un candidato descartado y clasifícalo en UNA sola categoría exacta de esta lista: Renta, Stack o tecnología, Experiencia, Seniority, Formación, No contesta, No hay fit, No interés, Se bajó del proceso. 
    Responde ÚNICAMENTE con el nombre de la categoría elegida, sin puntos ni texto extra.
    FEEDBACK: "${feedback}"`;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const d = await r.json();
    if (d.error) throw new Error(d.error.message);

    let categoriaIA = d.candidates[0].content.parts[0].text.trim();
    
    let matchEncontrado = false;
    for (let i = 0; i < selectMotivo.options.length; i++) {
      if (selectMotivo.options[i].value.toLowerCase() === categoriaIA.toLowerCase()) {
        selectMotivo.selectedIndex = i;
        matchEncontrado = true;
        break;
      }
    }

    if(matchEncontrado){
        statusDiv.innerHTML = `<span style="color:var(--green)">✓ Clasificado como: <strong>${categoriaIA}</strong></span>`;
    } else {
        statusDiv.innerHTML = `<span style="color:var(--amber)">⚠ IA sugirió: "${categoriaIA}". Elige manual.</span>`;
    }

  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = '<span style="color:var(--red)">⚠ Error al conectar con IA.</span>';
  }
}

async function saveUpdate(id, role) {
  const c = cands.find(x=>x.id===id); if(!c) return;
  const prev = c.est;
  const changes = {};

  if(role==='recruiter'){
    changes.sit = document.getElementById('u-sit').value;
    changes.fb  = document.getElementById('u-fb').value;
  } else if(role==='sourcer'){
    if(c.sit === 'Rechazado'){
      toast('Sin permisos','El recruiter rechazó este candidato — no puede avanzar','err','✕');
      return;
    }
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
  } else {
    // ROL OWNER / SUPERVISOR
    const newEst = document.getElementById('u-est')?.value;
    if(newEst) {
      changes.est = newEst;
      const newDates = {...(c.dates||{})};
      if(!newDates[newEst]) newDates[newEst] = new Date().toISOString().slice(0,10);
      changes.dates = newDates;
    }
    
    // Capturar cambio de pool para el Owner
    const po = document.getElementById('u-po');
    if(po && parseInt(po.value) !== c.pid) {
       changes.pid = parseInt(po.value);
    }

    changes.sit = document.getElementById('u-sit')?.value || c.sit;
    changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
    changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
    if(role!=='sourcer') changes.mo = document.getElementById('u-mo')?.value || c.mo;
    const se = document.getElementById('u-sal'); if(se) changes.sal = se.value;
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
      est:'Descartado', 
      mo: moValue,
      dates:{...(c.dates||{}), Descartado: new Date().toISOString().slice(0,10)} 
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
    sit:'Por revisar', est:'Contactado', mo:'',
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

// VISTA DE REVISIÓN (RECRUITER)
function getReviewCands(){
  return cands.filter(c =>
    canSeeCandidate(c) &&
    (c.est === 'Screening' || c.est === 'Contactado') &&
    c.sit !== 'Rechazado'
  );
}

function renderReview(){
  const pending  = getReviewCands().filter(c => c.sit === 'Por revisar');
  const approved = getReviewCands().filter(c => c.sit === 'Aprobado');
  const rb = document.getElementById('review-body'); if(!rb) return;

  const mkCard = (c, showActions) => {
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
      ${c.l ? `<a href="${c.l}" target="_blank" class="tdl" style="font-size:11px;margin-bottom:8px;display:inline-flex">↗ LinkedIn</a>` : ''}
      ${showActions ? `
      <div class="rev-actions">
        <textarea class="rev-comment" id="rev-fb-${c.id}" placeholder="Comentario (opcional antes de decidir)...">${c.fb||''}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" style="flex:1;justify-content:center" onclick="reviewAction(${c.id},'approve')">✓ Aprobar → Entrevista Inicial</button>
          <button class="btn btn-sm" style="justify-content:center;border-color:var(--amber);color:var(--amber)" onclick="reviewAction(${c.id},'hold')">⏸ En revisión</button>
          <button class="btn btn-danger btn-sm" onclick="reviewAction(${c.id},'reject')">✕ Rechazar</button>
        </div>
      </div>` : `
      <div style="font-size:11px;color:var(--green);margin-top:6px">✓ Aprobado — ya está en pipeline activo</div>`}
    </div>`;
  };

  rb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl">Para revisar</div><div class="mcv mv-a">${pending.length}</div><div class="mcs">pendientes</div></div>
      <div class="mc"><div class="mcl">Aprobados hoy</div><div class="mcv mv-g">${approved.length}</div><div class="mcs">en pipeline</div></div>
      <div class="mc"><div class="mcl">Rechazados</div><div class="mcv mv-r">${cands.filter(c=>canSeeCandidate(c)&&c.sit==='Rechazado').length}</div><div class="mcs">total</div></div>
    </div>

    ${pending.length ? `
    <div class="rev-section">
      <div class="rev-sec-title">⏳ Pendientes de revisión <span class="nb">${pending.length}</span></div>
      <div class="rev-list">${pending.map(c=>mkCard(c,true)).join('')}</div>
    </div>` : `
    <div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">✓</div>
      <div style="font-size:13px">Sin candidatos pendientes de revisión</div>
      <div style="font-size:11px;margin-top:4px">Los sourcers agregarán nuevos candidatos al pool</div>
    </div>`}

    ${approved.length ? `
    <div class="rev-section" style="margin-top:20px">
      <div class="rev-sec-title">✓ Aprobados — en pipeline <span class="nb" style="background:rgba(45,212,160,0.15);color:var(--green)">${approved.length}</span></div>
      <div class="rev-list">${approved.map(c=>mkCard(c,false)).join('')}</div>
    </div>` : ''}
  `;
}

async function reviewAction(id, action){
  const c = cands.find(x=>x.id===id); if(!c) return;
  const fbEl = document.getElementById(`rev-fb-${id}`);
  const fb = fbEl ? fbEl.value.trim() : c.fb||'';
  const changes = { fb };
  const today = new Date().toISOString().slice(0,10);

  if(action === 'approve'){
    changes.sit = 'Aprobado';
  } else if(action === 'reject'){
    changes.sit = 'Rechazado';
  } else {
    changes.sit = 'Por revisar';
  }

  Object.assign(c, changes);
  if(changes.dates) c.dates = changes.dates;

  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', {id, changes, changedBy: CU.name});
    setSyncStatus('ok');
  } catch(err){ setSyncStatus('error','⚠ Guardado local'); }

  const labels = {approve:'Aprobado ✓ — pasa a Entrevista Inicial', reject:'Rechazado', hold:'Marcado en revisión'};
  const types  = {approve:'ok', reject:'err', hold:'wrn'};
  toast(c.n, labels[action], types[action], action==='approve'?'⬆':'↩');
  buildSidebar();
  renderReview();
}

// GEMINI IA INTEGRATION - ANALYTICS
function renderAnalytics(){
  const all=cands.filter(c=>canSeeCandidate(c));
  const byPool=pools.map(p=>({p,n:all.filter(c=>c.pid===p.id).length}));
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
        <div class="sr"><span>Pipeline activo</span><span class="sv mv-g">${all.filter(c=>ACTIVE_S.has(c.est)).length}</span></div>
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
  const prompt=`Eres analista senior de sourcing tech. Pool multi-equipo.\nTotal: ${all.length} | Activos: ${all.filter(c=>ACTIVE_S.has(c.est)).length} | Descartados: ${all.filter(c=>DISC_S.has(c.est)).length} | Estancados: ${stale}\n3 insights accionables en bullets: [problema] → [acción concreta]. Max 80 palabras.`;
  try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,{
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
  const prompt=`Experta en sourcing tech. Pool: ${all.length} candidatos. Estancados: ${stale||'ninguno'}.\n\nFeedbacks:\n${fbs.substring(0,2200)}\n\n1. Patrón de fallos 2. Perfil que convierte 3. 3 cambios de estrategia 4. Candidatos a reactivar. Max 220 palabras.`;
  try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${API_KEY}`,{
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
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:350}})
    });
    const d=await r.json();
    const text=d.candidates?.[0]?.content?.parts?.[0]?.text||'Sin respuesta';
    out.textContent=text;
  } catch(e){ out.textContent='Error de conexión con Gemini API.'; }
}

function renderConfig(){
  document.getElementById('threshold-rows').innerHTML=STAGES.map(s=>`
    <div class="threshold-row">
      <div><div style="font-size:13px;font-weight:500">${s}</div><div style="font-size:11px;color:var(--txt3)">Días sin actualización</div></div>
      <div class="threshold-val"><input type="number" id="thr-${s.replace(/ /g,'_')}" value="${thresholds[s]||10}" min="1" max="60"> <span style="font-size:11px;color:var(--txt3)">días</span></div>
    </div>`).join('');
  document.getElementById('cfg-pools').innerHTML=pools.map(p=>`
    <div class="pool-cfg"><h3><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.name}</h3>
    <div style="font-size:11px;color:var(--txt2)">${p.desc||''} · ${cands.filter(c=>c.pid===p.id).length} candidatos</div></div>`).join('');
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
  const c=document.getElementById('toasts'), el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<div class="ti">${icon}</div><div><div class="tt">${title}</div>${msg?`<div class="tm">${msg}</div>`:''}</div>`;
  c.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(300px)';el.style.transition='all .25s';setTimeout(()=>el.remove(),250);},5000);
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePanel();['mb-cand','mb-pool','mb-email'].forEach(closeModal);}
});

setInterval(()=>{ if(document.getElementById('app').style.display!=='none'&&!IS_OFFLINE) syncNow(); }, 120000);

// ==========================================
// ARRANQUE AUTOMÁTICO DE LA APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (SHEETS_URL) {
    document.getElementById('setup').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    buildLoginList();
    fetch(`${SHEETS_URL}?action=ping`)
      .then(r => r.json())
      .then(d => { if(d.ok) setSyncStatus('ok'); else setSyncStatus('error','⚠ Script no responde'); })
      .catch(() => setSyncStatus('error', '⚠ Sin conexión'));
  } else {
    document.getElementById('setup').style.display = 'flex';
    document.getElementById('login').style.display = 'none';
    buildLoginList();
  }
});
