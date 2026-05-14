// MANEJO DE MODALES Y TOASTS
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function toast(title, msg, type='inf', icon='ℹ') {
  const c = document.getElementById('toasts'), el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="ti">${icon}</div><div><div class="tt">${title}</div>${msg?`<div class="tm">${msg}</div>`:''}</div>`;
  c.appendChild(el);
  setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(300px)';
      el.style.transition = 'all .25s';
      setTimeout(() => el.remove(), 250);
  }, 5000);
}

// GENERADORES DE BADGES Y CHIPS
function sitB(s){ const m={Aprobado:'ba',Rechazado:'br','Por revisar':'bpr'}; return `<span class="badge ${m[s]||''}">${s||'—'}</span>`; }
function estB(e){ const m={Contactado:'bco',Screening:'bsc','Entrevista Inicial':'bei','Entrevista EM':'bem',Misión:'bmi',Descartado:'bde','No interesado':'bde'}; return `<span class="badge ${m[e]||''}">${e||'—'}</span>`; }
function chips(s){ if(!s) return '—'; return s.split(',').map(x=>`<span class="chip">${x.trim()}</span>`).join(''); }

// HELPERS DE FECHAS
function daysSince(dateStr){ if(!dateStr) return null; return Math.floor((new Date()-new Date(dateStr))/(86400000)); }
function daysInStage(c){ return daysSince(c.dates?.[c.est]); }
function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('es-CL',{day:'numeric',month:'short'}); }

// INDICADORES DE UI
function setSyncStatus(state, msg) {
  // ... (Lógica de setSyncStatus)
}
