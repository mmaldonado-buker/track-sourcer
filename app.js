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
  // Notificaciones en modo offline: guardar en localStorage
  if (action === 'sendNotification') {
    const notifs = JSON.parse(localStorage.getItem('st4_notifs') || '[]');
    const newId  = notifs.length ? Math.max(...notifs.map(n=>n.id)) + 1 : 1;
    notifs.push({ id: newId, ts: new Date().toISOString(), read: 'false', ...payload });
    localStorage.setItem('st4_notifs', JSON.stringify(notifs));
    return { ok: true, id: newId };
  }
  if (action === 'getNotifications') {
    const notifs = JSON.parse(localStorage.getItem('st4_notifs') || '[]');
    const toUser = payload?.to_user || '';
    const since  = payload?.since   || '';
    const result = notifs.filter(n =>
      n.to_user === toUser &&
      n.read !== 'true' &&
      (!since || n.ts > since)
    );
    return { notifications: result };
  }
  if (action === 'markNotifRead') {
    const notifs = JSON.parse(localStorage.getItem('st4_notifs') || '[]');
    const ids = payload?.ids || [];
    ids.forEach(id => { const n = notifs.find(x=>x.id===id); if(n) n.read='true'; });
    localStorage.setItem('st4_notifs', JSON.stringify(notifs));
    return { ok: true };
  }
  if (action === 'deleteCandidate') {
    const stored = JSON.parse(localStorage.getItem('st4_cands') || '[]');
    // Coerción de tipo: comparar ambos como número para evitar "1" !== 1
    const filtered = stored.filter(c => Number(c.id) !== Number(payload.id));
    localStorage.setItem('st4_cands', JSON.stringify(filtered));
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
    const views = ['pool','pipeline','kanban','analytics','review','stale','today','contactar','metrics'];
    views.forEach(v => {
      const el = document.getElementById('v-' + v);
      if (el && el.style.display !== 'none') {
        if (v === 'pool') renderPoolView();
        if (v === 'pipeline') renderPipeline();
        if (v === 'kanban') renderKanban();
        if (v === 'analytics') renderAnalytics();
        if (v === 'review') renderReview();
        if (v === 'contactar') renderContactar();
        if (v === 'metrics') renderMetrics();
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

// ══════════════════════════════════════════════════════════════
// NOTIFICATION ENGINE
// Completamente aislado: si falla, no afecta nada del resto.
// ══════════════════════════════════════════════════════════════

let _notifPollTimer = null;   // referencia al setInterval
let _notifLastCheck = '';     // ISO timestamp del último poll exitoso
let _notifAudioCtx  = null;   // AudioContext (lazy, se crea al primer uso)

// ── Sonido ──────────────────────────────────────────────────
// Tres pulsos cortos tipo messenger antiguo.
// Si el browser bloquea AudioContext, falla silenciosamente.
function playBuzz() {
  try {
    if (!_notifAudioCtx) {
      _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = _notifAudioCtx;
    // Desbloquear contexto suspendido (política autoplay)
    if (ctx.state === 'suspended') ctx.resume();

    const pulses = [
      { freq: 880,  start: 0.00, dur: 0.07 },
      { freq: 880,  start: 0.12, dur: 0.07 },
      { freq: 1100, start: 0.24, dur: 0.15 },
    ];
    pulses.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0,    ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0,   ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime  + start + dur + 0.02);
    });
  } catch(e) { /* AudioContext bloqueado — no pasa nada */ }
}

// ── Badge pulsante en el nav ─────────────────────────────────
function showNotifBadge(count) {
  let badge = document.getElementById('notif-ping-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'notif-ping-badge';
    badge.className = 'notif-ping';
    const niReview = document.getElementById('ni-review');
    if (niReview) niReview.appendChild(badge);
    else return; // nav item no existe todavía
  }
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = 'inline-flex';
}

function hideNotifBadge() {
  const badge = document.getElementById('notif-ping-badge');
  if (badge) badge.style.display = 'none';
}

// ── Marcar leídas en el Sheet ────────────────────────────────
async function markNotifsRead(ids) {
  if (!ids.length) return;
  try {
    await apiCall('markNotifRead', { ids });
  } catch(e) { /* no crítico */ }
}

// ── Poll: busca notificaciones nuevas para el usuario actual ─
async function pollNotifications() {
  // Solo corre para recruiters y owners, nunca para sourcers ni viewers
  if (!CU || IS_OFFLINE) return;
  if (HAT !== 'recruiter' && HAT !== 'owner' && HAT !== 'supervisor') return;
  // En modo offline usamos localFallback directamente
  if (IS_OFFLINE) return;

  try {
    const safeUrl = getSafeUrl(SHEETS_URL);
    const url = new URL(safeUrl);
    url.searchParams.set('action', 'getNotifications');
    url.searchParams.set('to_user', CU.name);
    if (_notifLastCheck) url.searchParams.set('since', _notifLastCheck);

    const resp = await fetch(url.toString());
    if (!resp.ok) return; // falla silenciosamente
    const data = await resp.json();
    if (data.error) return;

    _notifLastCheck = new Date().toISOString();

    const notifs = data.notifications || [];
    if (!notifs.length) return;

    // Hay notificaciones nuevas → badge + sonido + toast
    showNotifBadge(notifs.length);
    playBuzz();
    notifs.forEach(n => {
      toast(
        `🔔 ${n.from_user?.split(' ')[0] || 'Sourcer'} quiere tu revisión`,
        n.message || `Candidato ${n.cand_name} pendiente`,
        'inf',
        '🔔'
      );
    });

    // Refrescar contador del nav si la vista de revisión está activa
    buildSidebar();

    // Marcar como leídas para que no vuelvan a aparecer
    await markNotifsRead(notifs.map(n => Number(n.id)));

  } catch(e) { /* network error — no afecta nada */ }
}

// ── Arrancar / detener el polling ───────────────────────────
function startNotifPolling() {
  stopNotifPolling(); // limpiar timer previo si hubiera
  _notifLastCheck = new Date().toISOString();
  _notifPollTimer = setInterval(pollNotifications, 20000); // cada 20s
}

function stopNotifPolling() {
  if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
}

// ── Enviar notificación (llamado por el sourcer) ─────────────
async function sendNotifToRecruiter(candId) {
  const c = cands.find(x => x.id === candId);
  if (!c) return;

  // Buscar el recruiter asignado
  const recruiterUser = USERS.find(u => u.name === c.rec);
  if (!recruiterUser) {
    toast('Sin recruiter asignado', `${c.n} no tiene recruiter — asígnalo primero`, 'wrn', '⚠');
    return;
  }

  // Anti-spam: no permitir enviar dos notificaciones del mismo candidato en < 5 min
  const lastSent = localStorage.getItem(`notif_sent_${candId}`);
  if (lastSent) {
    const minsSince = (Date.now() - new Date(lastSent)) / 60000;
    if (minsSince < 5) {
      toast('Ya notificado', `Espera ${Math.ceil(5 - minsSince)} min antes de volver a notificar`, 'wrn', '⏳');
      return;
    }
  }

  const btn = document.getElementById(`notif-btn-${candId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  const payload = {
    from_user:  CU.name,
    to_user:    recruiterUser.name,
    cand_id:    candId,
    cand_name:  c.n,
    message:    `${CU.name} solicita revisión de ${c.n} (${c.stack || '—'}, ${c.s || '?'}) — Pool: ${pname(c.pid)}`,
  };

  try {
    await apiCall('sendNotification', payload);
    localStorage.setItem(`notif_sent_${candId}`, new Date().toISOString());
    toast('Notificación enviada', `${recruiterUser.name} recibirá un aviso`, 'ok', '🔔');
    if (btn) {
      btn.textContent = '✓ Enviado';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--gborder)';
      btn.disabled = true;
    }
  } catch(err) {
    toast('Error al notificar', err.message, 'err', '⚠');
    if (btn) { btn.disabled = false; btn.textContent = '🔔 Notificar'; }
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

const DEFAULT_THRESHOLDS = {
  'En pool':7, 'Por contactar':5, 'Contactado':7, 'Screening':7,
  'Entrevista TR':10, 'Entrevista EM':10,
  'Misión':14, 'Referencias':7
};

const STAGES   = ['En pool','Por contactar','Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias','Contratado'];
const DISC_S   = new Set(['Descartado','No interesado']);
const SCREEN_S = new Set(['Screening','Entrevista TR','Entrevista EM','Misión','Referencias','Contratado']);
const HIRED_S  = new Set(['Contratado']);

// "En pool" nunca entra al pipeline — es la etapa cero, solo visible en Revisión
// El pipeline empieza desde "Por contactar" una vez aprobado
const PIPELINE_STAGES = new Set(['Por contactar','Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias']);

// ─── NORMALIZACIÓN DE SITUACIÓN ─────────────────────────────
// 'Por revisar'  → estado legacy del pool, se trata como Aprobado
// 'Por validar'  → nuevo estado: subido desde la app, esperando validación humana
// ''  / null     → sin decisión (igual que Por validar)
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
  return new Date().toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).split('-').reverse().join('-');
  // toLocaleDateString en es-CL devuelve DD-MM-YYYY, reverse() lo convierte a YYYY-MM-DD
}

// Versión con hora incluida, para logs y notificaciones
function nowCL() {
  return new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    year:   'numeric', month:  '2-digit', day:    '2-digit',
    hour:   '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}
// ────────────────────────────────────────────────────────────

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

async function directLogin(id){
  CU=USERS.find(u=>u.id===id); 
  HAT=CU.role;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  loadLocalConfig(); init();
  if(!IS_OFFLINE) setTimeout(()=>syncNow(), 300);
  // Arrancar polling de notificaciones solo para recruiters y owners
  startNotifPolling();
}

function init(){
  buildSidebar(); updateFooter(); checkStaleNow();
  if(HAT==='recruiter' || HAT==='owner') nav('today');
  else { currentPool=pools[0]?.id||1; nav('today'); }
  toast('Bienvenid@',CU.name,CU.role==='viewer'?'inf':'ok','⬡');
}

// Normaliza una cadena: minúsculas + sin tildes
// Resuelve el problema de "Joaquín" vs "Joaquin", "María" vs "Maria", etc.
function normName(s) {
  return (s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function canSeeCandidate(c) {
  if (!CU) return false;
  const role = (HAT || '').toLowerCase();
  if (role === 'supervisor' || role === 'viewer') return true;
  if (role === 'owner') return isMyTeamCandidate(c);
  if (role === 'sourcer') {
    return normName(c.src) === normName(CU.name) ||
           normName(c.src).includes(normName(CU.name)) ||
           normName(CU.name).includes(normName(c.src));
  }
  if (role === 'recruiter') {
    const recNorm = normName(c.rec);
    const cuNorm  = normName(CU.name);
    if (recNorm === cuNorm || recNorm.includes(cuNorm) || cuNorm.includes(recNorm)) return true;
    if (!c.rec || c.rec.trim() === '') return isMyTeamCandidate(c);
    return false;
  }
  return false;
}

function isMyTeamCandidate(c) {
  const sq = SQUADS.find(s => s.id === CU.team);
  if (!sq) return false;
  const members = [...sq.owners, ...sq.recruiters, ...sq.sourcers];
  // Comparar con normalización de acentos
  return members.some(m => normName(m) === normName(c.src) || normName(m) === normName(c.rec));
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

function switchHat(){ stopNotifPolling(); location.reload(); }

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
  } else if(view==='metrics'){
    document.getElementById('v-metrics').style.display='flex';
    document.getElementById('ni-metrics')?.classList.add('active');
    renderMetrics();
  } else if(view==='analytics'){
    document.getElementById('v-analytics').style.display='flex';
    document.getElementById('ni-analytics')?.classList.add('active');
    renderAnalytics();
  } else if(view==='contactar'){
    document.getElementById('v-contactar').style.display='flex';
    document.getElementById('ni-contactar')?.classList.add('active');
    renderContactar();
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

function sitB(s){ const m={'Aprobado':'ba','Rechazado':'br','Por revisar':'brev','Por validar':'bval'}; return `<span class="badge ${m[s]||''}">${s||'—'}</span>`; }
function estB(e){
  const m={
    'En pool':'bpool',
    'Por contactar':'bpc', 'Contactado':'bco', 'Screening':'bsc',
    'Entrevista TR':'bei', 'Entrevista EM':'bem',
    'Misión':'bmi', 'Referencias':'bref', 'Contratado':'bhired',
    'Descartado':'bde', 'No interesado':'bde',
    'Entrevista Inicial':'bei'
  };
  return `<span class="badge ${m[e]||''}">${e||'—'}</span>`;
}
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
  
  // Métricas superiores (Solo cuenta las entrevistas y misión)
  const validStages = ['Entrevista Inicial', 'Entrevista EM', 'Misión'];
  const all=cands.filter(c=> validStages.includes(c.est) && canSeeCandidate(c) && c.sit !== 'Rechazado' && !DISC_S.has(c.est));
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
  const stages=['Contactado','Screening','Entrevista Inicial','Entrevista EM','Misión'];
  const clrs={'Contactado':'#60a5fa','Screening':'#f0a940','Entrevista Inicial':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#2dd4a0'};
  
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

function getReviewCands(){
  // Solo candidatos con sit='Por validar' — subidos desde la app, esperando validación
  // Excluye 'Por revisar' (legacy válido) y descartados/rechazados
  return cands.filter(c =>
    canSeeCandidate(c) &&
    isPendingValidation(c) &&
    !DISC_S.has(c.est) &&
    c.sit !== 'Rechazado'
  );
}

function renderReview(){
  const rb = document.getElementById('review-body'); if(!rb) return;
  const pending = getReviewCands();
  const isSourcer = HAT === 'sourcer';

  const mkCard = (c) => {
    const staleWarn = isStale(c) ? `<span style="color:var(--amber);font-size:10px"> ⚠${daysInStage(c)}d</span>` : '';
    const lastSent  = localStorage.getItem(`notif_sent_${c.id}`);
    const recentlySent = lastSent && (Date.now() - new Date(lastSent)) / 60000 < 5;

    // Vista sourcer: solo tarjeta informativa + botón notificar
    if (isSourcer) {
      return `<div class="rev-card" id="rcard-${c.id}">
        <div class="rev-card-top">
          <div style="flex:1;min-width:0">
            <div class="rev-name">${c.n}${staleWarn}</div>
            <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · <span style="color:var(--p2)">${c.stack}</span></div>
            ${c.fb ? `<div class="rev-fb">"${c.fb}"</div>` : ''}
            <div style="font-size:10px;color:var(--txt3);margin-top:3px">Recruiter: <strong style="color:var(--txt2)">${c.rec||'—'}</strong></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
            ${estB(c.est)}
            <button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver</button>
          </div>
        </div>
        ${c.l ? `<a href="${c.l}" target="_blank" class="tdl" style="font-size:11px;margin-bottom:8px;display:inline-flex">↗ LinkedIn</a>` : ''}
        <div style="margin-top:8px">
          <button
            id="notif-btn-${c.id}"
            class="btn btn-sm"
            style="width:100%;justify-content:center;${recentlySent ? 'opacity:.5;color:var(--green);border-color:var(--gborder)' : 'border-color:var(--pborder);color:var(--p2)'}"
            onclick="sendNotifToRecruiter(${c.id})"
            ${recentlySent ? 'disabled' : ''}>
            ${recentlySent ? '✓ Notificado recientemente' : '🔔 Notificar al recruiter'}
          </button>
        </div>
      </div>`;
    }

    // Vista recruiter/owner: tarjeta completa con acciones de decisión
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
      <div class="rev-actions">
        <textarea class="rev-comment" id="rev-fb-${c.id}" placeholder="Comentario (opcional antes de decidir)...">${c.fb||''}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" style="flex:1;justify-content:center" onclick="reviewAction(${c.id},'approve')">✓ Aprobar — pasa a Por contactar</button>
          <button class="btn btn-danger btn-sm" onclick="reviewAction(${c.id},'reject')">✕ Rechazar</button>
        </div>
      </div>
    </div>`;
  };

  const titleSourcer   = `⏳ Pendientes por validar <span class="nb">${pending.length}</span>
    <span style="font-size:10px;font-weight:400;color:var(--txt3);margin-left:8px">Notifica al recruiter para que valide tus candidatos</span>`;
  const titleRecruiter = `⏳ Pendientes por validar <span class="nb">${pending.length}</span>`;

  rb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl">Para revisar</div><div class="mcv mv-a">${pending.length}</div><div class="mcs">pendientes</div></div>
      <div class="mc"><div class="mcl">Rechazados</div><div class="mcv mv-r">${cands.filter(c=>canSeeCandidate(c)&&normalizeSit(c.sit)==='Rechazado').length}</div><div class="mcs">histórico</div></div>
    </div>
    ${pending.length ? `
    <div class="rev-section">
      <div class="rev-sec-title">${isSourcer ? titleSourcer : titleRecruiter}</div>
      <div class="rev-list">${pending.map(c=>mkCard(c)).join('')}</div>
    </div>` : `
    <div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">✓</div>
      <div style="font-size:13px">Sin candidatos pendientes de revisión</div>
      <div style="font-size:11px;margin-top:4px">${isSourcer ? 'Agrega candidatos al pool para que el recruiter los revise' : 'Los sourcers agregarán nuevos candidatos aquí'}</div>
    </div>`}
  `;
}

// =====================================
// VISTA POR CONTACTAR
// =====================================
function getContactarCands(){
  // Solo aparecen aquí si el recruiter EXPLÍCITAMENTE aprobó (sit='Aprobado')
  // y el sourcer todavía no contactó (est='Por contactar')
  // 'Por revisar' legacy NO aparece aquí — ya está en el pool como válido
  return cands.filter(c =>
    canSeeCandidate(c) &&
    c.est === 'Por contactar' &&
    c.sit === 'Aprobado' &&
    !DISC_S.has(c.est)
  );
}

function renderContactar(){
  const cb = document.getElementById('contactar-body'); if(!cb) return;
  const pending = getContactarCands();

  // Banner explicativo del flujo
  const flowBanner = `<div style="font-size:11px;color:var(--txt2);margin-bottom:14px;padding:9px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);border-left:2px solid var(--p2)">
    <strong style="color:var(--p2)">Flujo:</strong> Recruiter aprueba perfil → aparece aquí → tú lo contactas → pasa a pipeline
  </div>`;

  if(!pending.length){
    cb.innerHTML=`<div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <div style="font-size:28px;margin-bottom:8px">📭</div>
      <div style="font-size:13px;font-weight:600;color:var(--txt)">Sin candidatos por contactar</div>
      <div style="font-size:11px;margin-top:6px">Cuando el recruiter apruebe perfiles, aparecerán aquí</div>
    </div>`;
    return;
  }

  cb.innerHTML = `
    ${flowBanner}
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl" style="color:var(--p2)">Por contactar</div><div class="mcv mv-p">${pending.length}</div><div class="mcs">aprobados listos</div></div>
      <div class="mc"><div class="mcl">Hoy</div><div class="mcv mv-g">${pending.filter(c=>c.dates?.['Por contactar']===todayCL()).length}</div><div class="mcs">aprobados hoy</div></div>
    </div>
    <div class="rev-section">
      <div class="rev-sec-title" style="color:var(--p2)">📬 Listos para contactar <span class="nb live">${pending.length}</span></div>
      <div class="rev-list">
        ${pending.map(c => {
          const daysWaiting = daysInStage(c) ?? 0;
          const urgency = daysWaiting >= 3 ? `<span style="color:var(--amber);font-size:10px;font-weight:600"> ⚠ ${daysWaiting}d esperando</span>` : `<span style="color:var(--txt3);font-size:10px"> ${daysWaiting}d</span>`;
          return `<div class="rev-card" id="ccard-${c.id}">
            <div class="rev-card-top">
              <div style="flex:1;min-width:0">
                <div class="rev-name">${c.n}${urgency}</div>
                <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · <span style="color:var(--p2)">${c.stack}</span></div>
                <div style="font-size:10px;color:var(--txt3);margin-top:2px">Pool: ${pname(c.pid)} · Eq: ${c.eq||'—'}</div>
                ${c.fb ? `<div class="rev-fb">"${c.fb}"</div>` : ''}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
                ${c.l ? `<a href="${c.l}" target="_blank" class="tdl" style="font-size:11px" onclick="event.stopPropagation()">↗ LinkedIn</a>` : ''}
                <button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver detalle</button>
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:10px">
              <button class="btn btn-p btn-sm" style="flex:1;justify-content:center" onclick="marcarContactado(${c.id})">✓ Marquar como Contactado</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function marcarContactado(id){
  const c = cands.find(x=>x.id===id); if(!c) return;
  const today = todayCL();
  const changes = {
    est: 'Contactado',
    dates: {...(c.dates||{}), Contactado: today}
  };
  Object.assign(c, changes); c.dates = changes.dates;
  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', {id, changes, changedBy: CU.name});
    setSyncStatus('ok');
  } catch(err){ setSyncStatus('error','⚠ Guardado local'); }
  toast(c.n, 'Marcado como Contactado ✓', 'ok', '📬');
  buildSidebar();
  renderContactar();
  // Si el panel está abierto para este candidato, refrescarlo
  if(document.getElementById('panel').classList.contains('open')) openPanel(id);
}
async function reviewAction(id, action){
  const c = cands.find(x=>x.id===id); if(!c) return;
  const fbEl = document.getElementById(`rev-fb-${id}`);
  const fb = fbEl ? fbEl.value.trim() : c.fb||'';
  const changes = { fb };

  if(action === 'approve') {
    changes.sit = 'Aprobado'; // reemplaza 'Por validar' con decisión explícita
    if(c.est === 'En pool' || !c.est) {
      changes.est = 'Por contactar';
      const newDates = {...(c.dates||{})};
      if(!newDates['Por contactar']) newDates['Por contactar'] = todayCL();
      changes.dates = newDates;
    }
  }
  else if(action === 'reject') {
    changes.sit = 'Rechazado';
  }

  Object.assign(c, changes);
  if(changes.dates) c.dates = changes.dates;
  setSyncStatus('loading');
  try {
    await apiCall('updateCandidate', {id, changes, changedBy: CU.name});
    setSyncStatus('ok');
  } catch(err){ setSyncStatus('error','⚠ Guardado local'); }

  const labels = {approve:'Aprobado ✓ — Sourcer puede contactar', reject:'Rechazado'};
  const types  = {approve:'ok', reject:'err'};
  toast(c.n, labels[action], types[action], action==='approve'?'⬆':'✕');
  buildSidebar(); renderReview();
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
      <div style="display:flex;gap:5px;align-items:center">
        <button class="btn btn-sm btn-danger" style="font-size:10px;padding:3px 8px" onclick="deleteCandidate(${c.id})" title="Eliminar candidato permanentemente">🗑 Eliminar</button>
        <button class="pc" onclick="closePanel()">✕</button>
      </div>
    </div>
    ${c.l || c.cv ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${c.l ? `<a href="${c.l}" target="_blank" class="btn btn-sm btn-ghost" style="font-size:11px;text-decoration:none">↗ LinkedIn</a>` : ''}
      ${c.cv ? `<a href="${c.cv}" target="_blank" class="btn btn-sm" style="font-size:11px;text-decoration:none;background:var(--gbg);border-color:var(--gborder);color:var(--green)">📄 Ver CV</a>` : ''}
    </div>` : ''}
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
      <div class="pr"><span class="prl">CV</span><span style="font-size:11px">${c.cv
        ? `<a href="${c.cv}" target="_blank" style="color:var(--green);text-decoration:none;display:inline-flex;align-items:center;gap:3px">📄 Ver CV en Drive ↗</a>`
        : '<em style="color:var(--txt3)">Sin CV adjunto</em>'
      }</span></div>
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
    <label>Link CV <span style="color:var(--txt3);font-weight:400">(Google Drive)</span></label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="https://drive.google.com/file/d/...">
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
    <label>Comentarios</label>
    <textarea id="u-fb" placeholder="Justificación o notas para el sourcer...">${c.fb||''}</textarea>
    <button class="btn btn-p btn-sm" style="width:100%;justify-content:center" onclick="saveUpdate(${c.id},'recruiter')">Guardar decisión</button>
  </div></div>`;
}

function sourcerForm(c,salOk){
  const isUndecided    = !c.sit || c.sit === '';
  const isRejected     = c.sit === 'Rechazado';
  const isApproved     = c.sit === 'Aprobado';
  const isEnPool       = c.est === 'En pool';
  const isPorContactar = c.est === 'Por contactar';
  const isPending      = isPendingValidation(c);
  const zdpActive      = isZDPActive(c.src);
  const needsApproval  = sourcerNeedsApproval(c); // true si ZDP activo Y sin validar
  const isReadyToCall  = isApproved && isPorContactar;
  const stagesAllowed  = needsApproval ? [c.est] : [...STAGES,'Descartado'];

  return `<div class="psec"><div class="pst">Actualizar (Sourcer)</div><div class="uf">
    ${needsApproval && !zdpActive===false ? `
    <div style="font-size:11px;color:var(--txt3);padding:9px 11px;background:var(--bg3);border-radius:var(--r);border-left:2px solid var(--border2);margin-bottom:8px">
      ⏳ <strong>En revisión</strong> — esperando que el recruiter apruebe o rechace este perfil.
      <br><span style="font-size:10px">Puedes notificarle para que lo revise más rápido.</span>
    </div>` : !zdpActive ? `
    <div style="font-size:11px;color:var(--green);padding:9px 11px;background:rgba(45,212,160,.08);border-radius:var(--r);border-left:2px solid var(--green);margin-bottom:8px">
      🚀 <strong>Zona de Desarrollo Próximo desactivada</strong> — puedes mover este candidato libremente sin aprobación del recruiter.
    </div>` : isRejected ? `
    <div style="font-size:11px;color:var(--red);padding:9px 11px;background:rgba(224,92,92,.08);border-radius:var(--r);border-left:2px solid var(--red);margin-bottom:8px">
      ✕ Candidato <strong>rechazado</strong> por el recruiter.
    </div>` : isReadyToCall ? `
    <div style="font-size:11px;color:var(--p2);padding:9px 11px;background:var(--pbg);border-radius:var(--r);border-left:2px solid var(--p);margin-bottom:8px">
      📬 <strong>Aprobado — listo para contactar.</strong> Una vez que lo contactes, márcalo como Contactado.
    </div>` : `
    <div style="font-size:11px;color:var(--green);padding:9px 11px;background:rgba(45,212,160,.08);border-radius:var(--r);border-left:2px solid var(--green);margin-bottom:8px">
      ✓ Candidato <strong>aprobado</strong> — en proceso activo.
    </div>`}
    <label>Estado pipeline</label>
    <select id="u-est" ${(isRejected || needsApproval)?'disabled':''}>
      ${stagesAllowed.map(s=>`<option ${s===c.est?'selected':''}>${s}</option>`).join('')}
    </select>
    ${needsApproval?`<div style="font-size:10px;color:var(--txt3);margin-top:-4px;margin-bottom:8px">El estado cambia cuando el recruiter apruebe o se desactive la ZDP.</div>`:''}
    <label>Equipo sugerido</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?`<label>Rango salarial</label><input type="text" id="u-sal" value="${c.sal||''}" placeholder="Expectativa salarial">`:
    `<div class="ro">Rango salarial — desde Screening</div>`}
    <label>Feedback / Notas</label><textarea id="u-fb">${c.fb||''}</textarea>
    <label>Link CV <span style="color:var(--txt3);font-weight:400">(Google Drive)</span></label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="https://drive.google.com/file/d/...">
    <div style="display:flex;gap:6px;flex-direction:column">
      <button class="btn btn-p btn-sm" style="justify-content:center" onclick="saveUpdate(${c.id},'sourcer')">Guardar notas / CV</button>
      ${isReadyToCall?`<button class="btn btn-sm" style="justify-content:center;border-color:var(--p);color:var(--p2)" onclick="marcarContactado(${c.id})">📬 Marcar como Contactado</button>`:''}
      ${needsApproval?`<button class="btn btn-sm" style="justify-content:center;border-color:var(--pborder);color:var(--p2)" onclick="sendNotifToRecruiter(${c.id})" id="notif-btn-${c.id}">🔔 Notificar al recruiter</button>`:''}
    </div>
  </div></div>`;


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

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
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
    if(sourcerNeedsApproval(c)){
      // ZDP activo + sin validar: solo notas/CV, no estado
      changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
      changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
      const cve0 = document.getElementById('u-cv'); if(cve0) changes.cv = cve0.value.trim();
      Object.assign(c, changes);
      setSyncStatus('loading');
      try { await apiCall('updateCandidate',{id,changes,changedBy:CU.name}); setSyncStatus('ok'); }
      catch(err){ setSyncStatus('error','⚠ Guardado local'); }
      toast('Notas guardadas','Estado bloqueado hasta aprobación del recruiter (ZDP activa)','ok','✓');
      afterEdit(id, c.est, c.est);
      return;
    }
    if(c.sit === 'Rechazado'){
      toast('Sin permisos','El recruiter rechazó este candidato — no puede avanzar','err','✕');
      return;
    }
    const newEst = normalizeEst(document.getElementById('u-est')?.value || '');
    if(newEst) {
      changes.est = newEst;
      const newDates = {...(c.dates||{})};
      if(!newDates[newEst]) newDates[newEst] = todayCL();
      changes.dates = newDates;
    }
    changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
    changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
    const se = document.getElementById('u-sal'); if(se) changes.sal = se.value;
    const cve = document.getElementById('u-cv'); if(cve) changes.cv = cve.value.trim();
  } else {
    const newEst = normalizeEst(document.getElementById('u-est')?.value || '');
    if(newEst) {
      changes.est = newEst;
      const newDates = {...(c.dates||{})};
      if(!newDates[newEst]) newDates[newEst] = todayCL();
      changes.dates = newDates;
    }
    const po = document.getElementById('u-po');
    if(po && parseInt(po.value) !== c.pid) {
       changes.pid = parseInt(po.value);
    }
    changes.sit = document.getElementById('u-sit')?.value || c.sit;
    changes.eq  = document.getElementById('u-eq')?.value  || c.eq;
    changes.fb  = document.getElementById('u-fb')?.value  || c.fb;
    if(role!=='sourcer') changes.mo = document.getElementById('u-mo')?.value || c.mo;
    const se = document.getElementById('u-sal'); if(se) changes.sal = se.value;
    const cve = document.getElementById('u-cv'); if(cve) changes.cv = cve.value.trim();
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
      est:'Descartado', mo: moValue, dates:{...(c.dates||{}), Descartado: todayCL()} 
  };
  Object.assign(c, changes); c.dates = changes.dates;
  setSyncStatus('loading');
  try { await apiCall('updateCandidate',{id,changes,changedBy:CU.name}); setSyncStatus('ok'); }
  catch(err) { setSyncStatus('error','⚠ Guardado local'); }
  afterEdit(id,prev,'Descartado');
}

// Elimina el candidato completamente — disponible para todos los roles
async function deleteCandidate(id){
  const numId = Number(id);
  const c = cands.find(x=>Number(x.id)===numId);
  if(!c){ toast('Candidato no encontrado','','err','⚠'); return; }
  if(!confirm(`¿Eliminar permanentemente a ${c.n}?\n\nEsta acción no se puede deshacer.`)) return;

  // 1. Eliminar del array en memoria PRIMERO (no espera la BD)
  const idx = cands.findIndex(x=>Number(x.id)===numId);
  if(idx !== -1) cands.splice(idx, 1);

  // 2. Actualizar localStorage inmediatamente
  localStorage.setItem('st4_cands', JSON.stringify(cands));

  // 3. UI actualiza ANTES de esperar la BD
  closePanel();
  buildSidebar();
  if(document.getElementById('v-pool')?.style.display==='flex') renderPool();
  if(document.getElementById('v-pipeline')?.style.display==='flex') renderPipeline();
  if(document.getElementById('v-review')?.style.display==='flex') renderReview();
  if(document.getElementById('v-contactar')?.style.display==='flex') renderContactar();
  if(document.getElementById('v-metrics')?.style.display==='flex') renderMetrics();
  toast(`${c.n} eliminado`, 'Candidato borrado permanentemente', 'wrn', '🗑');

  // 4. Sincronizar con Sheet en segundo plano
  try {
    await apiCall('deleteCandidate', { id: numId, deletedBy: CU.name });
  } catch(err) {
    console.warn('deleteCandidate BD error:', err.message);
  }
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
  if(document.getElementById('v-contactar')?.style.display==='flex') renderContactar();
  openPanel(id);
}

function openAddCand(){
  if(!canAddCandidates()){ toast('Sin permisos','','err','⛔'); return; }
  document.getElementById('f-rc').innerHTML=allRecruiters().map(r=>`<option>${r}</option>`).join('');
  document.getElementById('f-po').innerHTML=pools.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('f-so').value=CU.name;
  ['f-n','f-l','f-st','f-em','f-eq','f-cv'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
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
  const today=todayCL();
  const nc={
    pid, n, l:document.getElementById('f-l').value.trim(),
    s:document.getElementById('f-se').value, stack:st,
    emp:document.getElementById('f-em').value.trim(),
    // sit='Por validar' → subido desde la app, esperando validación del recruiter
    // est='En pool'     → recién ingresado al sistema
    sit:'Por validar', est:'En pool', mo:'',
    src:document.getElementById('f-so').value.trim()||CU.name,
    rec:document.getElementById('f-rc').value.trim(), fb:'',
    eq:document.getElementById('f-eq').value.trim(),
    cv:document.getElementById('f-cv')?.value.trim()||'',
    sal:'', dt:today,
    dates:{'En pool':today}
  };

  setSyncStatus('loading');
  try {
    const res = await apiCall('addCandidate', nc);
    nc.id = res.id; cands.unshift(nc); setSyncStatus('ok');
    buildSidebar(); closeModal('mb-cand');
    // Refrescar todas las vistas relevantes
    if(document.getElementById('v-pool')?.style.display==='flex') renderPool();
    if(document.getElementById('v-review')?.style.display==='flex') renderReview();
    toast('Candidato agregado', `${n} → aparece en "Revisión sourcing" para ${nc.rec}`, 'ok', '⬡');
  } catch(err) {
    toast('Error al guardar', err.message, 'err', '⚠'); setSyncStatus('error');
  } finally { btn.disabled=false; btn.textContent='Guardar candidato'; }
}

// ══════════════════════════════════════════════════════════════
// MOTOR DE MÉTRICAS
// ══════════════════════════════════════════════════════════════

// Devuelve lunes y domingo de la semana que contiene 'date'
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom, 1=lun...
  const diff = (day === 0) ? -6 : 1 - day; // ajuste a lunes
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { start: mon, end: sun };
}

// Últimas N semanas (empezando en lunes)
function getLastNWeeks(n) {
  const weeks = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - (i * 7));
    const { start, end } = getWeekRange(ref);
    weeks.unshift({ start, end,
      label: `${start.getDate()}/${start.getMonth()+1} – ${end.getDate()}/${end.getMonth()+1}`
    });
  }
  return weeks;
}

// Últimos N meses
function getLastNMonths(n) {
  const months = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = start.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
    months.push({ start, end, label });
  }
  return months;
}

// Comprueba si la fecha de una etapa cae en el rango dado
function dateInRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

// Métricas de un sourcer en un rango de fechas
function calcSourcerMetrics(sourcerName, start, end, candList) {
  const mine = candList.filter(c => c.src === sourcerName);

  const agregados    = mine.filter(c => dateInRange(c.dt || c.dates?.Contactado, start, end)).length;
  const aprobados    = mine.filter(c => normalizeSit(c.sit) === 'Aprobado' &&
                         dateInRange(c.dates?.['Por contactar'] || c.dates?.Contactado, start, end)).length;
  const contactados  = mine.filter(c => dateInRange(c.dates?.Contactado, start, end)).length;
  const entrevTR     = mine.filter(c => dateInRange(c.dates?.['Entrevista TR'] || c.dates?.['Entrevista Inicial'], start, end)).length;
  const entrevEM     = mine.filter(c => dateInRange(c.dates?.['Entrevista EM'], start, end)).length;
  const enMision     = mine.filter(c => dateInRange(c.dates?.Misión, start, end)).length;
  const enReferencias= mine.filter(c => dateInRange(c.dates?.Referencias, start, end)).length;
  const contratados  = mine.filter(c => dateInRange(c.dates?.Contratado, start, end)).length;

  // Tasas de conversión (evitar división por 0)
  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : null;

  return {
    sourcer:      sourcerName,
    agregados,    aprobados,   contactados,
    entrevTR,     entrevEM,    enMision,
    enReferencias,contratados,
    tasaTR:       pct(entrevTR,    contactados),  // contactados → TR
    tasaEM:       pct(entrevEM,    entrevTR),      // TR → EM
    tasaMision:   pct(enMision,    entrevEM),      // EM → Misión
    tasaContrat:  pct(contratados, contactados),   // contactados → contratado (global)
  };
}

// Lista de sourcers visibles según el rol actual
function getVisibleSourcers() {
  // Jonathan (JQ) y Eliana (EF) ven todos los sourcers — misma vista compartida
  const canSeeAll = CU.id === 'JQ' || CU.id === 'EF';
  if (canSeeAll) return USERS.filter(u => u.role === 'sourcer').map(u => u.name);
  // Sourcer: solo sus propias métricas
  if (HAT === 'sourcer') return [CU.name];
  // Owner: sourcers de su squad
  if (HAT === 'owner') {
    const sq = SQUADS.find(s => s.id === CU.team);
    return sq ? sq.sourcers : [];
  }
  // Recruiter: sourcers de su squad
  const mySquad = SQUADS.find(s => s.recruiters.some(r => normName(r) === normName(CU.name)));
  return mySquad ? mySquad.sourcers : [];
}

// ── Renderizado de la tabla de métricas ─────────────────────
function renderMetrics() {
  const el = document.getElementById('metrics-body'); if (!el) return;
  const mode    = document.getElementById('metrics-mode')?.value || 'weekly';
  const nPeriods = mode === 'weekly' ? 6 : 4;
  const periods  = mode === 'weekly' ? getLastNWeeks(nPeriods) : getLastNMonths(nPeriods);
  const sourcers = getVisibleSourcers();
  const allCands = cands.filter(c => canSeeCandidate(c));

  // ── Tabla por sourcer x período ───────────────────────────
  const rows = sourcers.map(src =>
    periods.map(p => calcSourcerMetrics(src, p.start, p.end, allCands))
  );

  // ── Totales del período más reciente ─────────────────────
  const latest = periods[periods.length - 1];
  const totals  = calcSourcerMetrics('__all__', latest.start, latest.end,
    allCands.map(c => ({...c, src: '__all__'}))
  );

  const fmtPct = v => v === null ? '<span style="color:var(--txt3)">—</span>'
                                  : `<span style="color:${v>=30?'var(--green)':v>=15?'var(--amber)':'var(--red)'}; font-weight:600">${v}%</span>`;
  const fmtN   = (v, dim) => v === 0
    ? `<span style="color:var(--txt3)">0</span>`
    : `<span style="color:${dim};font-weight:600;font-family:var(--mono)">${v}</span>`;

  // ── HTML ──────────────────────────────────────────────────
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <select id="metrics-mode" onchange="renderMetrics()"
        style="background:var(--bg3);border:1px solid var(--border2);color:var(--txt);border-radius:var(--r);padding:5px 9px;font-size:12px;font-family:var(--font);outline:none">
        <option value="weekly" ${mode==='weekly'?'selected':''}>Semanas (últimas 6)</option>
        <option value="monthly" ${mode==='monthly'?'selected':''}>Meses (últimos 4)</option>
      </select>
      <button class="btn btn-sm" onclick="exportMetricsCSV()">↓ Exportar CSV</button>
      <span style="font-size:11px;color:var(--txt3);margin-left:auto">Actualizado al cargar la página</span>
    </div>

    ${sourcers.map((src, si) => {
      const srcRows = rows[si];
      const user    = USERS.find(u => u.name === src);
      const color   = user?.color || 'var(--p)';

      // Resumen del período actual para el header
      const cur = srcRows[srcRows.length - 1];

      return `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="width:26px;height:26px;border-radius:50%;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">
            ${src.split(' ').map(w=>w[0]).join('').slice(0,2)}
          </div>
          <span style="font-size:13px;font-weight:600">${src}</span>
          <span style="font-size:10px;color:var(--txt3);margin-left:4px">
            esta semana: ${cur.entrevTR} TR · ${cur.entrevEM} EM · ${cur.contratados} contratados
          </span>
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);white-space:nowrap">Período</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Agregados</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Contactados</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--p2);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Entrev. TR</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--pink);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Entrev. EM</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Misión</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Referencias</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">Contratados</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">% TR</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">% EM</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">% Misión</th>
                <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);background:var(--bg3);border-bottom:1px solid var(--border);text-align:center">% Contrat.</th>
              </tr>
            </thead>
            <tbody>
              ${srcRows.map((m, pi) => {
                const isLatest = pi === srcRows.length - 1;
                const bg = isLatest ? 'background:rgba(124,110,240,.06);' : '';
                const fw = isLatest ? 'font-weight:600;' : '';
                return `<tr style="${bg}border-bottom:1px solid var(--border)">
                  <td style="padding:7px 10px;${fw}color:${isLatest?'var(--txt)':'var(--txt2)'};white-space:nowrap">${periods[pi].label}${isLatest?' <span style="font-size:9px;color:var(--p2);font-weight:600">← actual</span>':''}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.agregados,'var(--txt)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.contactados,'var(--txt2)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.entrevTR,'var(--p2)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.entrevEM,'var(--pink)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.enMision,'var(--amber)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.enReferencias,'var(--blue)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtN(m.contratados,'var(--green)')}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtPct(m.tasaTR)}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtPct(m.tasaEM)}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtPct(m.tasaMision)}</td>
                  <td style="padding:7px 8px;text-align:center">${fmtPct(m.tasaContrat)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('')}

    ${sourcers.length > 1 ? `
    <div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:var(--txt2)">Resumen equipo — período actual (${periods[periods.length-1].label})</div>
      <div class="mg">
        <div class="mc"><div class="mcl">Entrevistas TR</div><div class="mcv mv-p">${rows.reduce((s,r)=>s+r[r.length-1].entrevTR,0)}</div><div class="mcs">esta semana</div></div>
        <div class="mc"><div class="mcl">Entrevistas EM</div><div class="mcv" style="color:var(--pink)">${rows.reduce((s,r)=>s+r[r.length-1].entrevEM,0)}</div><div class="mcs">esta semana</div></div>
        <div class="mc"><div class="mcl">En Misión</div><div class="mcv mv-a">${rows.reduce((s,r)=>s+r[r.length-1].enMision,0)}</div><div class="mcs">esta semana</div></div>
        <div class="mc"><div class="mcl">Contratados</div><div class="mcv mv-g">${rows.reduce((s,r)=>s+r[r.length-1].contratados,0)}</div><div class="mcs">esta semana</div></div>
      </div>
    </div>` : ''}
  `;
}

// ── Exportar métricas a CSV ───────────────────────────────────
function exportMetricsCSV() {
  const mode    = document.getElementById('metrics-mode')?.value || 'weekly';
  const periods = mode === 'weekly' ? getLastNWeeks(6) : getLastNMonths(4);
  const sourcers = getVisibleSourcers();
  const allCands = cands.filter(c => canSeeCandidate(c));

  const headers = ['Sourcer','Período','Agregados','Contactados','Entrev.TR','Entrev.EM',
                   'Misión','Referencias','Contratados','%TR','%EM','%Misión','%Contrat.'];
  const csvRows = [headers];

  sourcers.forEach(src => {
    periods.forEach(p => {
      const m = calcSourcerMetrics(src, p.start, p.end, allCands);
      csvRows.push([
        src, p.label, m.agregados, m.contactados,
        m.entrevTR, m.entrevEM, m.enMision, m.enReferencias, m.contratados,
        m.tasaTR ?? '', m.tasaEM ?? '', m.tasaMision ?? '', m.tasaContrat ?? ''
      ]);
    });
  });

  const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `metricas_sourcing_${todayCL()}.csv`;
  a.click();
  toast('CSV exportado', `${sourcers.length} sourcers · ${periods.length} períodos`, 'ok', '↓');
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
// Candidatos post-entrevista TR sin feedback (para recruiter)
function getPendingFeedbackCands() {
  // Solo candidatos en Entrevista TR sin ningún comentario
  return cands.filter(c =>
    canSeeCandidate(c) &&
    normalizeEst(c.est) === 'Entrevista TR' &&
    (!c.fb || c.fb.trim() === '') &&
    !DISC_S.has(c.est)
  );
}

let todayFilter = '';
function setTodayFilter(key){ todayFilter = todayFilter===key?'':key; renderToday(); }

function renderToday(){
  const tb = document.getElementById('today-body'); if(!tb) return;
  document.getElementById('today-title').textContent = `Mi día — ${CU.name.split(' ')[0]}`;

  if(HAT === 'sourcer') renderTodaySourcer(tb);
  else if(HAT === 'recruiter') renderTodayRecruiter(tb);
  else renderTodayDefault(tb);
}

// ── Mi Día: SOURCER ──────────────────────────────────────────
function renderTodaySourcer(tb) {
  const porContactar  = getContactarCands();
  // Pendientes de validación: candidatos que este sourcer agregó y aún no tienen aprobación
  const porValidar    = cands.filter(c =>
    canSeeCandidate(c) &&
    (c.sit === 'Por validar' || !c.sit || c.sit === '') &&
    !DISC_S.has(c.est) &&
    c.sit !== 'Rechazado'
  );
  const enProceso     = cands.filter(c=>canSeeCandidate(c)&&isActiveInPipeline(c)&&c.est!=='Por contactar');

  const nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = porContactar.length + porValidar.length;

  const mkContactarCard = (c) => `
    <div class="today-card today-card-action" onclick="openPanel(${c.id})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
        <div style="min-width:0;flex:1">
          <div class="rev-name" style="font-size:12px">${c.n}</div>
          <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'}</div>
          <div style="font-size:10px;color:var(--p2);margin-top:2px">${c.stack}</div>
        </div>
        ${c.l?`<a href="${c.l}" target="_blank" onclick="event.stopPropagation()" style="font-size:10px;color:var(--p2);flex-shrink:0">↗ LI</a>`:''}
      </div>
      <button class="btn btn-p btn-sm" style="width:100%;justify-content:center;margin-top:8px" onclick="event.stopPropagation();marcarContactado(${c.id})">
        📬 Marcar Contactado
      </button>
    </div>`;

  const mkValidarCard = (c) => `
    <div class="today-card" onclick="openPanel(${c.id})" style="border-color:var(--aborder)">
      <div class="rev-name" style="font-size:12px">${c.n}</div>
      <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        ${estB(c.est)}
        <button class="btn btn-sm" style="font-size:10px;padding:2px 7px;border-color:var(--pborder);color:var(--p2)" onclick="event.stopPropagation();sendNotifToRecruiter(${c.id})" id="notif-btn-${c.id}">🔔</button>
      </div>
    </div>`;

  // Kanban de en proceso
  const kanbanStages = ['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias'];
  const stageColors  = {'Contactado':'#5b9cf0','Screening':'#9d91f5','Entrevista TR':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#f0a940','Referencias':'#2dd4a0'};
  const kanbanHTML = kanbanStages.map(stage => {
    const cards = enProceso.filter(c=>normalizeEst(c.est)===stage);
    if(!cards.length) return '';
    return `<div class="today-kanban-col">
      <div class="today-kanban-header" style="color:${stageColors[stage]||'var(--txt2)'}">
        ${stage} <span class="nb" style="background:${stageColors[stage]+'22'};color:${stageColors[stage]}">${cards.length}</span>
      </div>
      ${cards.map(c=>`
        <div class="today-kanban-card ${isStale(c)?'stale-card-k':''}" onclick="openPanel(${c.id})">
          <div style="font-size:12px;font-weight:500">${c.n}${isStale(c)?` <span style="color:var(--amber)">⚠</span>`:''}</div>
          <div style="font-size:10px;color:var(--txt3)">${c.emp||'—'} · ${daysInStage(c)??'—'}d</div>
          <div style="margin-top:3px">${chips(c.stack)}</div>
        </div>`).join('')}
    </div>`;
  }).join('');

  tb.innerHTML = `
    <div class="today-grid-sourcer">
      <div class="today-box" style="border-color:var(--pborder)">
        <div class="today-box-title" style="color:var(--p2)">📬 Por contactar <span class="nb live">${porContactar.length}</span></div>
        ${porContactar.length
          ? porContactar.map(mkContactarCard).join('')
          : `<div class="today-empty">Sin candidatos por contactar</div>`}
      </div>
      <div class="today-box" style="border-color:var(--aborder)">
        <div class="today-box-title" style="color:var(--amber)">⏳ Pendientes de validación <span class="nb warn">${porValidar.length}</span></div>
        ${porValidar.length
          ? porValidar.map(mkValidarCard).join('')
          : `<div class="today-empty">Sin pendientes — ¡al día!</div>`}
      </div>
    </div>
    <div class="today-box today-box-wide" style="margin-top:14px">
      <div class="today-box-title">🔄 Mis candidatos en proceso <span class="nb">${enProceso.length}</span></div>
      ${enProceso.length
        ? `<div class="today-kanban">${kanbanHTML||'<div class="today-empty">Sin candidatos en proceso aún</div>'}</div>`
        : `<div class="today-empty">Sin candidatos en proceso aún</div>`}
    </div>
  `;
}

// ── Mi Día: RECRUITER ────────────────────────────────────────
function renderTodayRecruiter(tb) {
  // Pendientes de validar: candidatos asignados a este recruiter sin decisión aún
  const porValidar   = cands.filter(c =>
    canSeeCandidate(c) &&
    (c.sit === 'Por validar' || !c.sit || c.sit === '') &&
    !DISC_S.has(c.est) &&
    c.sit !== 'Rechazado'
  );
  const sinFeedback  = getPendingFeedbackCands();
  const enProceso    = cands.filter(c=>canSeeCandidate(c)&&isActiveInPipeline(c)&&c.est!=='Por contactar'&&c.est!=='En pool');

  const nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = porValidar.length + sinFeedback.length;

  const mkValidarCard = (c) => `
    <div class="today-card" onclick="openPanel(${c.id})">
      <div class="rev-name" style="font-size:12px">${c.n}</div>
      <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'} · ${c.stack}</div>
      <div style="font-size:10px;color:var(--txt3);margin-top:3px">Sourcer: ${c.src||'—'}</div>
      <div style="display:flex;gap:5px;margin-top:8px" onclick="event.stopPropagation()">
        <button class="btn btn-green btn-sm" style="flex:1;justify-content:center;font-size:10px" onclick="reviewAction(${c.id},'approve')">✓ Aprobar</button>
        <button class="btn btn-danger btn-sm" style="font-size:10px" onclick="reviewAction(${c.id},'reject')">✕</button>
      </div>
    </div>`;

  const mkFeedbackCard = (c) => `
    <div class="today-card" onclick="openPanel(${c.id})" style="border-color:var(--bborder)">
      <div class="rev-name" style="font-size:12px">${c.n}</div>
      <div class="rev-meta">${c.emp||'—'} · ${c.s||'?'}</div>
      <div style="margin-top:4px">${estB(c.est)}</div>
    </div>`;

  const kanbanStages = ['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias'];
  const stageColors  = {'Contactado':'#5b9cf0','Screening':'#9d91f5','Entrevista TR':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#f0a940','Referencias':'#2dd4a0'};
  const kanbanHTML = kanbanStages.map(stage => {
    const cards = enProceso.filter(c=>normalizeEst(c.est)===stage);
    if(!cards.length) return '';
    return `<div class="today-kanban-col">
      <div class="today-kanban-header" style="color:${stageColors[stage]||'var(--txt2)'}">
        ${stage} <span class="nb">${cards.length}</span>
      </div>
      ${cards.map(c=>`
        <div class="today-kanban-card ${isStale(c)?'stale-card-k':''}" onclick="openPanel(${c.id})">
          <div style="font-size:12px;font-weight:500">${c.n}</div>
          <div style="font-size:10px;color:var(--txt3)">${c.src||'—'} · ${daysInStage(c)??'—'}d</div>
        </div>`).join('')}
    </div>`;
  }).join('');

  tb.innerHTML = `
    <div class="today-grid-recruiter">
      <div class="today-box" style="border-color:var(--aborder)">
        <div class="today-box-title" style="color:var(--amber)">⏳ Por validar <span class="nb warn">${porValidar.length}</span></div>
        ${porValidar.length
          ? porValidar.map(mkValidarCard).join('')
          : `<div class="today-empty">Sin perfiles por validar</div>`}
      </div>
      <div class="today-box" style="border-color:var(--bborder)">
        <div class="today-box-title" style="color:var(--blue)">💬 Sin feedback post-entrevista <span class="nb" style="background:var(--bbg);color:var(--blue)">${sinFeedback.length}</span></div>
        <div style="font-size:10px;color:var(--txt3);margin-bottom:8px">Candidatos que pasaron entrevista TR y aún no tienen feedback</div>
        ${sinFeedback.length
          ? sinFeedback.map(mkFeedbackCard).join('')
          : `<div class="today-empty">Sin pendientes de feedback 🎉</div>`}
      </div>
    </div>
    <div class="today-box today-box-wide" style="margin-top:14px">
      <div class="today-box-title">🔄 Mis candidatos en proceso <span class="nb">${enProceso.length}</span></div>
      ${enProceso.length
        ? `<div class="today-kanban">${kanbanHTML||'<div class="today-empty">Sin candidatos aún</div>'}</div>`
        : `<div class="today-empty">Sin candidatos en proceso aún</div>`}
    </div>
  `;
}

// ── Mi Día: OWNER / SUPERVISOR / VIEWER ─────────────────────
function renderTodayDefault(tb) {
  const all = cands.filter(c=>canSeeCandidate(c));
  const stale = all.filter(c=>isStale(c));
  const sinFeedback = getPendingFeedbackCands();
  const porValidar = getReviewCands();
  const nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = stale.length + porValidar.length;

  tb.innerHTML = `
    <div class="mg" style="margin-bottom:16px">
      <div class="mc"><div class="mcl">Por validar</div><div class="mcv mv-a">${porValidar.length}</div></div>
      <div class="mc"><div class="mcl">Sin feedback</div><div class="mcv" style="color:var(--blue)">${sinFeedback.length}</div></div>
      <div class="mc"><div class="mcl">Estancados</div><div class="mcv mv-r">${stale.length}</div></div>
      <div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-g">${all.filter(c=>isActiveInPipeline(c)).length}</div></div>
    </div>
    ${stale.length?`<div class="rev-section"><div class="rev-sec-title" style="color:var(--amber)">⚠ Estancados</div><div class="rev-list">
      ${stale.slice(0,5).map(c=>`<div class="rev-card" onclick="openPanel(${c.id})" style="cursor:pointer">
        <div class="rev-name">${c.n}</div>
        <div class="rev-meta">${c.est} · ${daysInStage(c)}d · ${c.src||'—'}</div>
      </div>`).join('')}
    </div></div>`:''}
  `;
}

function getTodayCands(){ return []; } // legacy — ya no se usa directamente

function renderConfig(){
  // ── Toggle detección de estancados ──────────────────────
  const staleToggleEl = document.getElementById('stale-toggle');
  if (staleToggleEl) {
    staleToggleEl.checked = STALE_DETECTION_ENABLED;
    staleToggleEl.onchange = () => {
      STALE_DETECTION_ENABLED = staleToggleEl.checked;
      localStorage.setItem('st4_stale_enabled', STALE_DETECTION_ENABLED);
      updateStaleSidebar();
      const msg = STALE_DETECTION_ENABLED ? 'Detección de estancados activada' : 'Detección de estancados pausada';
      toast(msg, '', STALE_DETECTION_ENABLED ? 'ok' : 'wrn', STALE_DETECTION_ENABLED ? '⚠' : '○');
    };
  }
  // ── ZDP por sourcer ─────────────────────────────────────────
  const zdpEl = document.getElementById('zdp-rows');
  if(zdpEl) {
    let mySourcers = [];
    if(HAT==='recruiter'){
      const sq = SQUADS.find(s=>s.recruiters.some(r=>normName(r)===normName(CU.name)));
      mySourcers = sq ? sq.sourcers : [];
    } else if(HAT==='owner'){
      const sq = SQUADS.find(s=>s.id===CU.team);
      mySourcers = sq ? sq.sourcers : [];
    } else if(HAT==='supervisor'||CU.id==='JQ'||CU.id==='EF'){
      mySourcers = USERS.filter(u=>u.role==='sourcer').map(u=>u.name);
    }

    if(mySourcers.length){
      zdpEl.innerHTML = mySourcers.map(src => {
        const active = isZDPActive(src);
        const safeSrc = src.replace(/'/g,"\\'");
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${src}</div>
            <div style="font-size:11px;color:${active?'var(--txt3)':'var(--green)'};margin-top:3px">
              ${active
                ? '🔒 ZDP activa — necesita aprobación del recruiter para avanzar'
                : '🚀 ZDP inactiva — puede mover candidatos libremente sin aprobación'}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:16px">
            <span style="font-size:11px;font-weight:600;color:${active?'var(--p2)':'var(--green)'}">
              ${active?'Activa':'Inactiva'}
            </span>
            <div onclick="toggleZDP('${safeSrc}')"
              style="position:relative;width:44px;height:24px;cursor:pointer;flex-shrink:0">
              <span style="position:absolute;inset:0;background:${active?'var(--p)':'var(--border2)'};border-radius:24px;transition:background .2s;display:block"></span>
              <span style="position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;top:3px;left:${active?'23':'3'}px;transition:left .2s;display:block;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
            </div>
          </div>
        </div>`;
      }).join('');
    } else {
      zdpEl.innerHTML = `<div style="font-size:12px;color:var(--txt3);padding:10px;background:var(--bg3);border-radius:var(--r);border:1px solid var(--border)">
        ${HAT==='viewer'||HAT==='sourcer'?'Solo recruiters y owners pueden gestionar la ZDP.':'Sin sourcers asignados a tu equipo.'}
      </div>`;
    }
  }

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

function toggleZDP(sourcerName) {
  const newVal = !isZDPActive(sourcerName);
  setZDP(sourcerName, newVal);
  renderConfig(); // re-render para actualizar el toggle visual
  toast(
    `ZDP ${newVal ? 'activada' : 'desactivada'} para ${sourcerName.split(' ')[0]}`,
    newVal ? 'Ahora necesita aprobación del recruiter' : 'Puede mover candidatos libremente',
    newVal ? 'wrn' : 'ok',
    newVal ? '🔒' : '🚀'
  );
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
  a.download=`sourcer_pool_${todayCL()}.csv`; a.click();
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
