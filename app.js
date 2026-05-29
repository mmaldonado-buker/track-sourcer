// SourcerTrack — Punto de entrada principal: estado, navegación y arranque
// Cargado ÚLTIMO

// Estado global declarado en config.js y utils.js.

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function toast(title,msg,type='inf',icon='ℹ'){
  const c=document.getElementById('toasts'); if(!c) return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML='<div class="ti">' + icon + '</div><div><div class="tt">' + title + '</div>' + (msg ? '<div class="tm">'+msg+'</div>' : '') + '</div>';
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
