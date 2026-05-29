// SourcerTrack — Vistas: renders de todas las secciones
// Depende de: config.js, api.js, utils.js

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
// ── Permisos unificados ─────────────────────────────────────
function can(action, c) {
  if (!CU) return false;
  const role = HAT || '';
  switch(action) {
    case 'edit':
      if (role === 'viewer') return false;
      if (role === 'supervisor' || role === 'owner') return true;
      if (role === 'recruiter') return canSeeCandidate(c);
      if (role === 'sourcer') return c && normName(c.src||'').includes(normName(CU.name));
      return false;
    case 'delete':    return role !== 'viewer';
    case 'approve':   return role === 'recruiter' || role === 'owner' || role === 'supervisor';
    case 'addCand':   return role !== 'viewer';
    case 'seePools':  return true;
    case 'seeAllMetrics': return CU.id === 'JQ' || CU.id === 'EF';
    case 'manageZDP': return role === 'recruiter' || role === 'owner' || role === 'supervisor';
    default: return false;
  }
}
// ─────────────────────────────────────────────────────────────


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

// ── Modo día/noche ───────────────────────────────────────────
let THEME = localStorage.getItem('st4_theme') || 'dark';
(function(){ document.documentElement.setAttribute('data-theme', localStorage.getItem('st4_theme')||'dark'); })();
function applyTheme(theme) {
  THEME = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('st4_theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀ Modo día' : '🌙 Modo noche';
}
function toggleTheme() { applyTheme(THEME === 'dark' ? 'light' : 'dark'); }
// ─────────────────────────────────────────────────────────────


function nav(view, poolId){
  if(poolId!==undefined) currentPool=poolId;
  document.querySelectorAll('[id^="v-"]').forEach(v=>v.style.display='none');
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  closePanel();
  if(view==='pool'){
    if(!canSeePools()){ nav('pipeline'); return; }
