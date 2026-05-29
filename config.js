// SourcerTrack — Configuración, constantes y datos seed
// Debe cargarse PRIMERO

// GOOGLE SHEETS API LAYER
// ╔══════════════════════════════════════════════════════════╗
// ║  1. CONFIGURACIÓN DE CONEXIÓN                           ║
// ╚══════════════════════════════════════════════════════════╝
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
    const views = ['pool','pipeline','kanban','analytics','review','stale','today','contactar','metrics','recontact'];
    views.forEach(v => {
      const el = document.getElementById('v-' + v);
      if (el && el.style.display !== 'none') {
        if (v === 'pool') renderPoolView();
        if (v === 'pipeline') renderPipeline();
        if (v === 'kanban') renderKanban();
        if (v === 'analytics') renderAnalytics();
        if (v === 'review') renderReview();
        if (v === 'contactar') renderContactar();
        if (v === 'recontact') renderRecontact();
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

// ╔══════════════════════════════════════════════════════════╗
// ║  5. NOTIFICACIONES                                      ║
// ╚══════════════════════════════════════════════════════════╝
