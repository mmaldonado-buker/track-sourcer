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

// USERS & SQUADS (Estructura de Permisos Crítica)
const USERS = [
  // Supervisión y Liderazgo
  {id:'JQ', name:'Jonathan Quiroz',    role:'supervisor', team:'A', color:'#7c6ef0', email:'jquiroz@buk.mx'},
  {id:'EF', name:'Eliana Franco',      role:'viewer',     team:'*', color:'#f0a940', email:'efranco@buk.co'},
  
  // Owners / Recruiters (Dual Role)
  {id:'LR', name:'Laura Rodriguez',    role:'owner',      team:'C', color:'#2dd4a0', email:'larodriguez@buk.co'},
  {id:'CP', name:'Catalina Poblete',   role:'owner',      team:'B', color:'#a78bfa', email:'cpoblete@buk.cl'},
  {id:'GJ', name:'Gaspar Jaramillo',   role:'owner',      team:'B', color:'#e06cc0', email:'gjaramillo@buk.cl'},
  
  // Recruiters
  {id:'PM', name:'Paula Mahecha',      role:'recruiter',  team:'A', color:'#5b9cf0', email:'pmahecha@buk.co'},
  {id:'JM', name:'Joaquín Maragaño',   role:'recruiter',  team:'C', color:'#2dd4a0', email:'jmaragano@buk.cl'},
  
  // Sourcers
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
  {id:1,pid:2,n:'Ejemplo Candidato', l:'', s:'L2', stack:'JS', emp:'Buk', sit:'Aprobado', est:'Contactado', mo:'', src:'Catalina León', rec:'Paula Mahecha', fb:'', eq:'', sal:'', dates:{Contactado:daysAgo(1)}, dt:daysAgo(1)}
];

// STATE
let CU = null, HAT = '', API_KEY = '';
let pools = [], cands = [];
let currentPool = null, pipeStageF = '';
let thresholds = {}, emailMap = {};

// STORAGE & CONFIG
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

// ==========================================
// SISTEMA DE ROLES AUTOMÁTICO Y RESTRICCIONES
// ==========================================

function canSeeCandidate(c) {
  if (!CU) return false;
  const role = CU.role.toLowerCase();
  
  // Jonathan y Eliana ven TODO
  if (role === 'supervisor' || role === 'viewer') return true; 
  
  // Owners ven a su equipo completo (Sourcers y Recruiters de su Squad)
  if (role === 'owner') return isMyTeamCandidate(c); 
  
  // Recruiters ven lo asignado a ellos
  if (role === 'recruiter') return c.rec && c.rec.toLowerCase() === CU.name.toLowerCase();
  
  // Sourcers ven SOLO lo hunteado por ellos
  if (role === 'sourcer') return c.src && c.src.toLowerCase() === CU.name.toLowerCase();
  
  return false;
}

function isMyTeamCandidate(c) {
  const sq = SQUADS.find(s => s.id === CU.team);
  if (!sq) return false;
  const teamMembers = [...sq.owners, ...sq.recruiters, ...sq.sourcers].map(n => n.toLowerCase());
  return teamMembers.includes((c.src || '').toLowerCase()) || teamMembers.includes((c.rec || '').toLowerCase());
}

function canEdit(c) {
  if (!CU || CU.role === 'viewer') return false; // Eliana no edita NADA
  if (CU.role === 'supervisor') return true;     // Jonathan edita TODO
  return canSeeCandidate(c);                     // Otros editan lo que pueden ver
}

function canAddCandidates() {
  return CU && CU.role !== 'viewer';
}

// LOGIN SIN INTERMEDIOS
function buildLoginList() {
  const sorted = [...USERS].sort((a,b) => a.name.localeCompare(b.name));
  document.getElementById('user-list').innerHTML = sorted.map(u => `
    <div class="ul-item" onclick="autoLogin('${u.id}')">
      <div class="ul-ava" style="background:${u.color}22;color:${u.color}">${u.name.split(' ').map(w=>w[0]).join('')}</div>
      <div class="ul-info">
        <div class="ul-name">${u.name}</div>
        <div class="ul-role">${u.role.toUpperCase()}</div>
      </div>
    </div>`).join('');
}

async function autoLogin(id) {
  CU = USERS.find(u => u.id === id);
  HAT = CU.role; // Asignación automática de rol
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  loadLocalConfig();
  init();
  if (!IS_OFFLINE) syncNow();
}

function init() {
  buildSidebar();
  updateFooter();
  if (CU.role === 'recruiter' || CU.role === 'owner') nav('pipeline');
  else { currentPool = pools[0]?.id || 1; nav('pool'); }
  toast('Sesión Iniciada', CU.name, 'ok', '⬡');
}

function updateFooter() {
  const ava = document.getElementById('sb-ava');
  ava.style.background = CU.color + '22'; ava.style.color = CU.color;
  ava.textContent = CU.name.split(' ').map(w=>w[0]).join('').slice(0,2);
  document.getElementById('sb-uname').textContent = CU.name;
  document.getElementById('sb-urole').textContent = CU.role.toUpperCase();
  document.getElementById('sb-switch').style.display = 'block';
}

function switchHat() { location.reload(); } // Reinicia para volver al login

// SIDEBAR & NAVIGATION
function buildSidebar() {
  const poolsEl = document.getElementById('sb-pools');
  poolsEl.innerHTML = pools.map(p => `
    <button class="ni ni-pool-${p.id}" onclick="nav('pool',${p.id})">
      <span class="dot" style="background:${p.color}"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${p.name}</span>
      <span class="nb live">${cands.filter(c=>c.pid===p.id && canSeeCandidate(c)).length}</span>
    </button>`).join('');
    
  document.querySelectorAll('#btn-add-cand,#btn-add-pipe').forEach(b=>b.style.display=canAddCandidates()?'':'none');
  
  const nbr = document.getElementById('nb-review');
  if(nbr) nbr.textContent = cands.filter(c => canSeeCandidate(c) && (c.est==='Screening'||c.est==='Contactado') && c.sit==='Por revisar').length;
  
  const nbp = document.getElementById('nb-pipe');
  if(nbp) nbp.textContent = cands.filter(c => canSeeCandidate(c) && ACTIVE_S.has(c.est)).length;
}

function nav(view, poolId) {
  if (poolId !== undefined) currentPool = poolId;
  document.querySelectorAll('[id^="v-"]').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.ni').forEach(b => b.classList.remove('active'));
  closePanel();
  
  const target = document.getElementById('v-' + view);
  if (target) {
    target.style.display = 'flex';
    if (view === 'pool') {
        document.querySelector(`.ni-pool-${currentPool}`)?.classList.add('active');
        renderPoolView();
    } else {
        document.getElementById('ni-' + view)?.classList.add('active');
        if (view === 'pipeline') { buildStageTabs(); renderPipeline(); }
        if (view === 'review') renderReview();
        if (view === 'kanban') renderKanban();
        if (view === 'analytics') renderAnalytics();
    }
  }
}

// RENDER HELPERS
function sitB(s){ const m={Aprobado:'ba',Rechazado:'br','Por revisar':'bpr'}; return `<span class="badge ${m[s]||''}">${s||'—'}</span>`; }
function estB(e){ const m={Contactado:'bco',Screening:'bsc','Entrevista Inicial':'bei','Entrevista EM':'bem',Misión:'bmi',Descartado:'bde','No interesado':'bde'}; return `<span class="badge ${m[e]||''}">${e||'—'}</span>`; }
function chips(s){ if(!s) return '—'; return s.split(',').map(x=>`<span class="chip">${x.trim()}</span>`).join(''); }
function pname(id){ return pools.find(p=>p.id===id)?.name||'—'; }
function pcolor(id){ return pools.find(p=>p.id===id)?.color||'var(--txt3)'; }

// EDICION DE CANDIDATOS (Formularios según el rol de la persona que entró)
function openPanel(id) {
  const c = cands.find(x => x.id === id);
  if (!c || !canSeeCandidate(c)) return;
  
  const init = c.n.split(' ').map(x=>x[0]).join('').toUpperCase();
  const editable = canEdit(c);
  
  let editHTML = '';
  if (CU.role === 'viewer') {
      editHTML = `<div class="fnote" style="border-left-color:var(--red); color:var(--txt3)">Modo Lectura: No tienes permisos para modificar este candidato.</div>`;
  } else if (CU.role === 'sourcer') {
      editHTML = sourcerForm(c);
  } else if (CU.role === 'recruiter') {
      editHTML = recruiterForm(c);
  } else {
      editHTML = ownerForm(c);
  }

  document.getElementById('pi').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:15px">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="pava">${init}</div>
        <div><h2 style="font-size:15px">${c.n}</h2><div style="color:var(--txt2);font-size:11px">${c.emp} · ${c.s}</div></div>
      </div>
      <button class="pc" onclick="closePanel()">✕</button>
    </div>
    <div class="psec"><div class="pst">Pipeline</div><div style="display:flex;gap:5px">${sitB(c.sit)} ${estB(c.est)}</div></div>
    <div class="psec"><div class="pst">Detalles</div>
      <div class="pr"><span class="prl">Stack</span><span>${chips(c.stack)}</span></div>
      <div class="pr"><span class="prl">Recruiter</span><span>${c.rec || '—'}</span></div>
      <div class="pr"><span class="prl">Sourcer</span><span>${c.src || '—'}</span></div>
    </div>
    ${c.fb ? `<div class="psec"><div class="pst">Feedback</div><div class="pfb">${c.fb}</div></div>` : ''}
    ${editHTML}
  `;
  document.getElementById('panel').classList.add('open');
}

function closePanel() { document.getElementById('panel').classList.remove('open'); }

// FORMULARIOS ESPECÍFICOS
function ownerForm(c) {
  const poolOpts = pools.map(p => `<option value="${p.id}" ${p.id === c.pid ? 'selected' : ''}>${p.name}</option>`).join('');
  return `<div class="uf">
    <label>Pool / Categoría</label><select id="u-pid">${poolOpts}</select>
    <label>Estado</label><select id="u-est">${[...STAGES, 'Descartado'].map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}</select>
    <label>Situación</label><select id="u-sit">${['Aprobado', 'Por revisar', 'Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
    <label>Feedback</label><textarea id="u-fb">${c.fb||''}</textarea>
    <button class="btn btn-p" onclick="saveUpdate(${c.id})">Guardar Cambios</button>
  </div>`;
}

function recruiterForm(c) {
  return `<div class="uf">
    <label>Situación (Aprobar/Rechazar)</label><select id="u-sit">${['Aprobado', 'Por revisar', 'Rechazado'].map(s=>`<option ${s===c.sit?'selected':''}>${s}</option>`).join('')}</select>
    <label>Notas del Recruiter</label><textarea id="u-fb">${c.fb||''}</textarea>
    <button class="btn btn-p" onclick="saveUpdate(${c.id})">Guardar Decisión</button>
  </div>`;
}

function sourcerForm(c) {
  return `<div class="uf">
    <label>Estado Pipeline</label><select id="u-est">${STAGES.map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}</select>
    <label>Notas de Hunting</label><textarea id="u-fb">${c.fb||''}</textarea>
    <button class="btn btn-p" onclick="saveUpdate(${c.id})">Actualizar Hunting</button>
  </div>`;
}

async function saveUpdate(id) {
  const c = cands.find(x => x.id === id);
  const changes = {
    fb: document.getElementById('u-fb')?.value,
    sit: document.getElementById('u-sit')?.value || c.sit,
    est: document.getElementById('u-est')?.value || c.est,
    pid: document.getElementById('u-pid') ? parseInt(document.getElementById('u-pid').value) : c.pid
  };
  
  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', { id, changes, changedBy: CU.name });
    Object.assign(c, changes);
    setSyncStatus('ok');
    syncNow(); // Recarga para ver cambios
    toast('Actualizado', c.n, 'ok', '✓');
    closePanel();
  } catch(e) { setSyncStatus('error', 'Error al guardar'); }
}

// RESTO DE FUNCIONES (Sync, Analytics, etc.) SE MANTIENEN IGUAL PERO FILTRADAS POR canSeeCandidate
async function syncNow() {
  setSyncStatus('loading');
  try {
    const [cResp, pResp] = await Promise.all([sheetsAPI('getCandidates'), sheetsAPI('getPools')]);
    cands = cResp.candidates || [];
    let fetchedPools = pResp.pools || [];
    if (fetchedPools.length === 0) fetchedPools = DEFAULT_POOLS;
    pools = fetchedPools;
    buildSidebar();
    setSyncStatus('ok');
  } catch (err) { setSyncStatus('error', '⚠ Error'); }
}

function toast(title,msg,type='inf',icon='ℹ'){
  const c=document.getElementById('toasts'), el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<div class=\"ti\">${icon}</div><div><div class=\"tt\">${title}</div>${msg?`<div class=\"tm\">${msg}</div>`:''}</div>`;
  c.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(300px)';el.style.transition='all .25s';setTimeout(()=>el.remove(),250);},5000);
}

// Inicialización
loadLocalConfig();
buildLoginList();
