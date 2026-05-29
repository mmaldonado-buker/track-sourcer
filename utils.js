// SourcerTrack — Utilidades: normalización, permisos, ZDP, recontactar
// Depende de: config.js, api.js

function normalizeSit(sit) {
  if (sit === 'Por revisar') return 'Aprobado';  // legacy válido
  if (!sit || sit === '')    return 'Por validar'; // pendiente
  return sit; // 'Aprobado' | 'Rechazado' | 'Por validar'
}

// Indica si un candidato está pendiente de validación humana
function isPendingValidation(c) {
  return !c.sit || c.sit === '' || c.sit === 'Por validar';
}
// ─────────────────────────────────────────────────────────────

// ─── COMPATIBILIDAD ETAPAS ───────────────────────────────────
function normalizeEst(est) {
  if (est === 'Entrevista Inicial') return 'Entrevista TR';
  return est;
}
// ─────────────────────────────────────────────────────────────

// Un candidato está activo en pipeline si:
// - No está descartado/rechazado
// - Está en "Por contactar" (aprobado, esperando contacto del sourcer)
// - O ya avanzó a Contactado o más adelante
function isActiveInPipeline(c) {
  const est = normalizeEst(c.est);
  if (est === 'En pool') return false;           // etapa cero
  if (DISC_S.has(est)) return false;
  if (HIRED_S.has(est)) return false;
  if (c.sit === 'Rechazado') return false;
  if (isPendingValidation(c)) return false;      // Por validar: no entra al pipeline
  // 'Por contactar' solo con aprobación real (Aprobado o Por revisar legacy)
  if (est === 'Por contactar') {
    return c.sit === 'Aprobado' || c.sit === 'Por revisar';
  }
  return new Set(['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias']).has(est);
}

const today_d = new Date();
function daysAgo(n){ const d=new Date(today_d); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
const SEED = [
  {id:1,pid:2,n:'Brian Guadron',    l:'https://linkedin.com/in/brianguadron',      s:'L2',stack:'JavaScript',  emp:'LifeMiles',      sit:'Aprobado',   est:'Entrevista Inicial',mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Buen candidato pasado dev + devops',         eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(25),Screening:daysAgo(18),'Entrevista Inicial':daysAgo(12)},dt:daysAgo(25)},
  {id:2,pid:2,n:'Michael Salgado',  l:'https://linkedin.com/in/michael-salgado',   s:'L2',stack:'Javascript',  emp:'UPRA',           sit:'Aprobado',   est:'Screening',         mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Me gusta, experiencia orientada a producto', eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(14),Screening:daysAgo(5)},dt:daysAgo(14)},
  {id:3,pid:1,n:'Daniel Amaya',     l:'https://linkedin.com/in/amayabdaniel',       s:'L3',stack:'RoR, TS',     emp:'Furnished Finder',sit:'Aprobado',  est:'Contactado',        mo:'',src:'Catalina León',    rec:'Gaspar Jaramillo',fb:'Me gustó mucho, hagamos outreach',          eq:'Backend',    sal:'',       dates:{Contactado:daysAgo(3)},dt:daysAgo(3)},
];

let CU = null, HAT = '', API_KEY = '';
let pools = [], cands = [];
let currentPool = null, pipeStageF = '';
let thresholds = {}, emailMap = {};
let selUserId = null;

// ── Fecha y hora en zona horaria de Chile ───────────────────
// Siempre usa America/Santiago independiente del computador del usuario.
// Devuelve 'YYYY-MM-DD' para guardar en la BD.
function todayCL() {
  // Método robusto que funciona en todos los browsers
  try {
    const d = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Santiago'}));
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  } catch(e) {
    // Fallback: UTC
    return new Date().toISOString().slice(0,10);
  }
}
// ────────────────────────────────────────────────────────────


// ╔══════════════════════════════════════════════════════════╗
// ║  4. CONFIGURACIÓN LOCAL Y SEED DATA                     ║
// ╚══════════════════════════════════════════════════════════╝
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
// ── Zona de Desarrollo Próximo (ZDP) ────────────────────────
// Cuando ZDP está ACTIVO para un sourcer, necesita aprobación del recruiter
// para mover candidatos. Cuando está INACTIVO, puede moverlos libremente.
// Estado por sourcer: { 'Matías Maldonado': true, ... }

// ╔══════════════════════════════════════════════════════════╗
// ║  3. ESTADO GLOBAL Y FEATURES (ZDP, RECONTACT, THEME)    ║
// ╚══════════════════════════════════════════════════════════╝
let ZDP_CONFIG = JSON.parse(localStorage.getItem('st4_zdp') || '{}');

function isZDPActive(sourcerName) {
  // Por defecto activo (true) si no está configurado
  return ZDP_CONFIG[sourcerName] !== false;
}
function setZDP(sourcerName, active) {
  ZDP_CONFIG[sourcerName] = active;
  localStorage.setItem('st4_zdp', JSON.stringify(ZDP_CONFIG));
}
// Con ZDP inactivo, el sourcer puede mover sin aprobación
function sourcerNeedsApproval(c) {
  if (!isZDPActive(c.src)) return false; // ZDP desactivado → libre
  return isPendingValidation(c);          // ZDP activo → necesita aprobación
}
// Desactivado por defecto hasta que las fechas en la BD sean confiables.
// Se activa desde Configuración cuando el equipo esté listo.

// ── Kanban reutilizable ─────────────────────────────────────
const KANBAN_COLORS = {
  'Por contactar':'#5b9cf0','Contactado':'#5b9cf0','Screening':'#9d91f5',
  'Entrevista TR':'#a78bfa','Entrevista EM':'#e06cc0',
  'Misión':'#f0a940','Referencias':'#2dd4a0'
};
function buildKanbanHTML(candList, stages, showSrc=false) {
  let html = '';
  stages.forEach(function(stage) {
    const cards = candList.filter(function(c){ return normalizeEst(c.est)===stage; });
    if (!cards.length) return;
    const color = KANBAN_COLORS[stage] || 'var(--txt2)';
    const cardHTML = cards.map(function(c) {
      const stale = isStale(c) ? ' <span style="color:var(--amber)">⚠</span>' : '';
      const sub   = showSrc ? (c.src||'—') : (c.emp||'—');
      const days  = daysInStage(c);
      return '<div class="today-kanban-card" onclick="openPanel('+c.id+')">'
        +'<div style="font-size:12px;font-weight:500">'+c.n+stale+'</div>'
        +'<div style="font-size:10px;color:var(--txt3)">'+sub+' · '+(days||'—')+'d</div>'
        +(showSrc ? '' : '<div style="margin-top:3px">'+chips(c.stack)+'</div>')
        +'</div>';
    }).join('');
    html += '<div class="today-kanban-col">'
      +'<div class="today-kanban-header" style="color:'+color+'">'+stage
      +' <span class="nb">'+cards.length+'</span></div>'
      +cardHTML+'</div>';
  });
  return html || '<div class="today-empty">Sin candidatos en proceso</div>';
}
// ─────────────────────────────────────────────────────────────

// ── Por Recontactar ──────────────────────────────────────────
let RECONTACT_ENABLED = localStorage.getItem('st4_recontact_enabled') === 'true';
const RECONTACT_MOTIVOS = new Set(['Renta','Sin interés','No contesta','Se bajó del proceso']);

function isRecontactable(c) {
  if (!RECONTACT_ENABLED) return false;
  if (!DISC_S.has(c.est) && c.est !== 'No interesado') return false;
  if (!RECONTACT_MOTIVOS.has(c.mo)) return false;
  const fecha = c.dates && (c.dates.Contactado || c.dates['Por contactar']);
  if (!fecha) return false;
  return (new Date() - new Date(fecha)) / (1000*60*60*24*30.44) >= 6;
}
function getRecontactCands() {
  return cands.filter(function(c){ return canSeeCandidate(c) && isRecontactable(c); });
}
function mesesDesdeContacto(c) {
  const f = c.dates && (c.dates.Contactado || c.dates['Por contactar']);
  return f ? Math.floor((new Date()-new Date(f))/(1000*60*60*24*30.44)) : 0;
}
function renderRecontact() {
  const rb = document.getElementById('recontact-body'); if(!rb) return;
  if (!RECONTACT_ENABLED) {
    rb.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--txt3)">'
      +'<div style="font-size:28px;margin-bottom:8px">⏸</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--txt)">Sección desactivada</div>'
      +'<div style="font-size:11px;margin-top:6px">Actívala en <strong>Configuración → Por recontactar</strong> cuando las fechas sean confiables.</div></div>';
    return;
  }
  const fStack  = (document.getElementById('rc-stack')?.value||'').toLowerCase();
  const fEq     = (document.getElementById('rc-eq')?.value||'').toLowerCase();
  const fPool   = document.getElementById('rc-pool')?.value||'';
  const fMotivo = document.getElementById('rc-motivo')?.value||'';
  let pending = getRecontactCands().filter(function(c){
    if (fStack  && !(c.stack||'').toLowerCase().includes(fStack)) return false;
    if (fEq     && !(c.eq||'').toLowerCase().includes(fEq))       return false;
    if (fPool   && String(c.pid)!==String(fPool))                 return false;
    if (fMotivo && c.mo !== fMotivo)                              return false;
    return true;
  }).sort(function(a,b){ return mesesDesdeContacto(b)-mesesDesdeContacto(a); });

  const total = getRecontactCands().length;
  const poolOpts = pools.map(function(p){ return '<option value="'+p.id+'">'+p.name+'</option>'; }).join('');
  const motivOpts = [...RECONTACT_MOTIVOS].map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('');

  const filterBar = '<div style="display:flex;gap:7px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'
    +'<input type="text" id="rc-stack" placeholder="Stack..." oninput="renderRecontact()" style="background:var(--bg2);border:1px solid var(--border2);color:var(--txt);border-radius:var(--r);padding:5px 9px;font-size:12px;outline:none;width:120px">'
    +'<input type="text" id="rc-eq"    placeholder="Equipo..." oninput="renderRecontact()" style="background:var(--bg2);border:1px solid var(--border2);color:var(--txt);border-radius:var(--r);padding:5px 9px;font-size:12px;outline:none;width:140px">'
    +'<select id="rc-pool"   onchange="renderRecontact()" style="background:var(--bg2);border:1px solid var(--border2);color:var(--txt);border-radius:var(--r);padding:5px 9px;font-size:12px;outline:none"><option value="">Todos los pools</option>'+poolOpts+'</select>'
    +'<select id="rc-motivo" onchange="renderRecontact()" style="background:var(--bg2);border:1px solid var(--border2);color:var(--txt);border-radius:var(--r);padding:5px 9px;font-size:12px;outline:none"><option value="">Todos los motivos</option>'+motivOpts+'</select>'
    +'<button class="btn btn-sm btn-ghost" onclick="resetRecontactF()">Limpiar</button>'
    +'<span style="font-size:11px;color:var(--txt3)">'+pending.length+' de '+total+'</span></div>';

  const cards = pending.map(function(c){
    const m   = mesesDesdeContacto(c);
    const col = m >= 12 ? 'color:var(--green)' : 'color:var(--txt2)';
    return '<div class="rev-card" onclick="openPanel('+c.id+')" style="cursor:pointer">'
      +'<div class="rev-card-top"><div style="flex:1;min-width:0">'
      +'<div class="rev-name">'+c.n+' <span style="font-size:10px;font-weight:400;'+col+'">'+m+'m sin contacto</span></div>'
      +'<div class="rev-meta">'+(c.emp||'—')+' · '+(c.s||'?')+' · <span style="color:var(--p2)">'+c.stack+'</span></div>'
      +'<div style="font-size:10px;color:var(--txt3);margin-top:2px">Pool: '+pname(c.pid)+(c.eq?' · '+c.eq:'')+' · <strong style="color:var(--txt2)">'+(c.mo||'—')+'</strong>'+(c.ciclos?' · <span style="color:var(--amber)">'+c.ciclos+' ciclo'+(c.ciclos>1?'s':'')+'</span>':'')+'</div>'
      +(c.fb?'<div class="rev-fb">"'+c.fb+'"</div>':'')
      +'</div><div style="flex-shrink:0">'+(c.l?'<a href="'+c.l+'" target="_blank" class="tdl" style="font-size:11px" onclick="event.stopPropagation()">↗ LI</a>':'')+'</div></div>'
      +'<div style="display:flex;gap:6px;margin-top:10px" onclick="event.stopPropagation()">'
      +'<button class="btn btn-p btn-sm" style="flex:1;justify-content:center" onclick="reiniciarAlPool('+c.id+')">↩ Reiniciar al pool</button>'
      +'<button class="btn btn-sm btn-ghost" onclick="mantenerDescartado('+c.id+')">Marcar revisado</button>'
      +'</div></div>';
  }).join('');

  rb.innerHTML = filterBar + (pending.length ? '<div class="rev-list">'+cards+'</div>'
    : '<div style="text-align:center;padding:32px;color:var(--txt3)">🔍 Sin candidatos con esos filtros</div>');
}
function resetRecontactF() {
  ['rc-stack','rc-eq','rc-pool','rc-motivo'].forEach(function(id){
    const el=document.getElementById(id); if(el) el.value='';
  });
  renderRecontact();
}
async function reiniciarAlPool(id) {
  const c=cands.find(function(x){return x.id===id;}); if(!c) return;
  if(!confirm('¿Reiniciar a '+c.n+' al pool?')) return;
  const ciclos=(c.ciclos||0)+1;
  const today=new Date().toISOString().slice(0,10);
  const changes={est:'En pool',sit:'Por validar',mo:'',ciclos,dates:Object.assign({},c.dates||{},{'En pool':today})};
  Object.assign(c,changes); c.dates=changes.dates;
  setSyncStatus('loading');
  try{await apiCall('updateCandidate',{id,changes,changedBy:CU.name});setSyncStatus('ok');}
  catch(e){setSyncStatus('error','⚠ Guardado local');}
  toast(c.n,'Reiniciado al pool — ciclo '+ciclos,'ok','↩');
  buildSidebar(); renderRecontact();
}
async function mantenerDescartado(id) {
  const c=cands.find(function(x){return x.id===id;}); if(!c) return;
  const changes={last_recontact_review:new Date().toISOString().slice(0,10)};
  Object.assign(c,changes);
  try{await apiCall('updateCandidate',{id,changes,changedBy:CU.name});}catch(e){}
  toast(c.n,'Marcado como revisado','inf','✓');
  renderRecontact();
}
// ─────────────────────────────────────────────────────────────

// ── Detección de estancados ────────────────────────────────
let STALE_DETECTION_ENABLED = localStorage.getItem('st4_stale_enabled') === 'true';

function isStale(c){
  if (!STALE_DETECTION_ENABLED) return false; // pausado globalmente
  if(DISC_S.has(c.est)) return false;
  const d=daysInStage(c);
  return d!==null && d>=(thresholds[c.est]||10);
}
function fmtDate(d){
  if(!d) return '—';
  // Parsear como fecha local (sin hora) para evitar desfase de zona horaria
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  return date.toLocaleDateString('es-CL', { day:'numeric', month:'short' });
}
function daysLabel(n,thresh){ if(n===null) return '—'; const cls=n>=thresh?(n>=thresh*1.5?'danger':'warn'):'ok'; return `<span class="tl-days ${cls}">${n}d</span>`; }
function getStaleCands(){ return cands.filter(c=>!DISC_S.has(c.est)&&isStale(c)&&canSeeCandidate(c)); }
function getTodayCands(){
  const uniq = lists => [...new Map(lists.flat().map(c => [Number(c.id), c])).values()];
  const safe = fn => (typeof fn === 'function' ? fn() : []);
  if (HAT === 'sourcer') {
    const porValidar = cands.filter(c => canSeeCandidate(c) && isPendingValidation(c) && !DISC_S.has(c.est));
    return uniq([safe(getContactarCands), porValidar]);
  }
  if (HAT === 'recruiter') return uniq([safe(getReviewCands), safe(getPendingFeedbackCands)]);
  return uniq([safe(getReviewCands), getStaleCands(), safe(getPendingFeedbackCands)]);
}
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


// ╔══════════════════════════════════════════════════════════╗
// ║  7. UI: SIDEBAR, NAV, LOGIN, TEMA                       ║
// ╚══════════════════════════════════════════════════════════╝
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

  // Revisión: visible para todos los roles
  const btnReview = document.getElementById('ni-review');
  if (btnReview) btnReview.style.display = 'flex';

  // Contador: candidatos sin situación (pendientes de decisión del recruiter)
  const nbr = document.getElementById('nb-review');
  if(nbr) nbr.textContent = cands.filter(c => canSeeCandidate(c) && isPendingValidation(c) && !DISC_S.has(c.est)).length;

  // Por contactar: solo para sourcers y owners (no recruiters)
  const btnContactar = document.getElementById('ni-contactar');
  if (btnContactar) btnContactar.style.display = (HAT === 'recruiter') ? 'none' : 'flex';

  const nbcontactar = document.getElementById('nb-contactar');
  if(nbcontactar) nbcontactar.textContent = getContactarCands().length;

  const nbpipe = document.getElementById('nb-pipe');
  if(nbpipe) nbpipe.textContent = cands.filter(c=>canSeeCandidate(c)&&isActiveInPipeline(c)).length;
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

function selHat(role) {
  HAT = role;
  ['owner','rec','sou'].forEach(id => {
    const el = document.getElementById('hat-' + id);
    if (el) el.classList.remove('sel', 'active');
  });
  const map = { owner:'owner', recruiter:'rec', sourcer:'sou' };
  const selected = document.getElementById('hat-' + map[role]);
  if (selected) selected.classList.add('sel', 'active');
  const btn = document.getElementById('l-btn');
  if (btn) btn.disabled = false;
}

function doLogin() {
  if (selUserId) {
    directLogin(selUserId);
    return;
  }
  if (CU) {
    HAT = HAT || CU.role;
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='flex';
    loadLocalConfig();
    init();
    if(!IS_OFFLINE) setTimeout(()=>syncNow(), 300);
    startNotifPolling();
    return;
  }
  alert('Selecciona primero un usuario de la lista.');
}

async function directLogin(id){
  try {
    CU = USERS.find(u=>u.id===id);
    if(!CU){ console.error('Usuario no encontrado:', id); return; }
    HAT = CU.role;
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='flex';
    loadLocalConfig();
    init();
    if(!IS_OFFLINE) setTimeout(()=>syncNow(), 300);
    startNotifPolling();
  } catch(e) {
    console.error('Error en directLogin:', e);
    alert('Error al iniciar sesión: ' + e.message + '\n\nRevisa la consola (F12) para más detalles.');
  }
}

function init(){
  try {
    buildSidebar();
    updateFooter();
    checkStaleNow();
    nav('today');
    toast('Bienvenid@', CU.name, CU.role==='viewer'?'inf':'ok', '⬡');
  } catch(e) {
    console.error('Error en init:', e);
  }
}

// Normaliza una cadena: minúsculas + sin tildes
// Resuelve el problema de "Joaquín" vs "Joaquin", "María" vs "Maria", etc.

// ╔══════════════════════════════════════════════════════════╗
// ║  6. PERMISOS Y VISIBILIDAD                              ║
// ╚══════════════════════════════════════════════════════════╝
function normName(s) {
  return (s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
