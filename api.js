// SourcerTrack — Capa de datos: Google Sheets API + Notificaciones
// Depende de: config.js

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

// ╔══════════════════════════════════════════════════════════╗
// ║  2. NORMALIZACIÓN Y UTILIDADES PURAS                    ║
// ╚══════════════════════════════════════════════════════════╝
