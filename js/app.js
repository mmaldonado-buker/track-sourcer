// INICIALIZACIÓN Y LOGIN
function loadLocalConfig() { /* ... */ }
function saveLocal() { /* ... */ }

async function connectSheets() { /* ... */ }
function useOffline() { /* ... */ }
async function syncNow() { /* ... */ }

function buildLoginList() { /* ... */ }
function selUser(id) { /* ... */ }
function selHat(h) { /* ... */ }
async function doLogin() { /* ... */ }
function init() { /* ... */ }

// PERMISOS
function canSeeCandidate(c){ /* ... */ }
function isMyTeamCandidate(c){ /* ... */ }
function canEdit(c){ /* ... */ }
function canEditFull(c){ /* ... */ }
function canSeePools(){ /* ... */ }
function canAddCandidates(){ /* ... */ }

// RENDERIZADO DE VISTAS PRINCIPALES
function buildSidebar(){ /* ... */ }
function nav(view, poolId){ /* ... */ }
function renderPoolView(){ /* ... */ }
function renderPool(){ /* ... */ }
function renderPipeline(){ /* ... */ }
function renderKanban(){ /* ... */ }
function renderAnalytics(){ /* ... */ }
function renderConfig(){ /* ... */ }

// PANEL LATERAL (CANDIDATOS)
function openPanel(id){ /* ... */ }
function closePanel(){ /* ... */ }
function ownerForm(c,salOk,disc){ /* ... */ }
function recruiterForm(c){ /* ... */ }
function sourcerForm(c,salOk){ /* ... */ }

// ACCIONES DE DATOS (CRUD LOCAL/API)
async function saveUpdate(id, role) { /* ... */ }
async function discardC(id){ /* ... */ }
async function saveCand(){ /* ... */ }
async function createPool(){ /* ... */ }

// EVENT LISTENERS GLOBALES E INICIO DE LA APP
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') {
      closePanel();
      ['mb-cand', 'mb-pool', 'mb-email'].forEach(closeModal);
  }
});

setInterval(()=>{ 
  if(document.getElementById('app').style.display !== 'none' && !IS_OFFLINE) syncNow(); 
}, 120000);

// Lógica de arranque (comprobar URL guardada)
if(SHEETS_URL){
  document.getElementById('setup').style.display='none';
  document.getElementById('login').style.display='flex';
  buildLoginList();
  fetch(`${SHEETS_URL}?action=ping`)
    .then(r=>r.json())
    .then(d=>{ if(d.ok) setSyncStatus('ok'); else setSyncStatus('error','⚠ Script no responde'); })
    .catch(()=>setSyncStatus('error','⚠ Sin conexión'));
} else {
  document.getElementById('setup').style.display='flex';
  buildLoginList();
}
