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
    opts.headers = { 'Content-Type': 'application/json' };
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
  // ... (Toda la lógica de localFallback para getCandidates, addPool, etc.)
}

// GEMINI IA INTEGRATION CALLS
async function autoInsights() {
  // ... (Toda la lógica del fetch a generativelanguage.googleapis.com)
}

async function deepAnalysis() {
  // ... (Toda la lógica de deepAnalysis)
}

async function aiCand(id) {
  // ... (Toda la lógica de aiCand)
}
