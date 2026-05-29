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
  } else if(view==='recontact'){
    document.getElementById('v-recontact').style.display='flex';
    document.getElementById('ni-recontact')?.classList.add('active');
    renderRecontact();
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


// ╔══════════════════════════════════════════════════════════╗
// ║  8. HELPERS DE RENDER (badges, chips, kanban)            ║
// ╚══════════════════════════════════════════════════════════╝
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


// ╔══════════════════════════════════════════════════════════╗
// ║  9. VISTAS: POOL, PIPELINE, KANBAN                      ║
// ╚══════════════════════════════════════════════════════════╝
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
      <td><div class="tdn">${c.n}${isStale(c)?' <span style="color:var(--amber);font-size:10px">⚠</span>':''}</div>${c.l?'<a class="tdl" href="' + c.l + '" target="_blank" onclick="event.stopPropagation()">↗ LinkedIn</a>':''}</td>
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
      <td><div class="tdn">${c.n}${isStale(c)?' <span style="color:var(--amber);font-size:10px">⚠</span>':''}</div>${c.l?'<a class="tdl" href="' + c.l + '" target="_blank" onclick="event.stopPropagation()">↗</a>':''}</td>
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


// ╔══════════════════════════════════════════════════════════╗
// ║  10. VISTAS: REVISIÓN, POR CONTACTAR, RECONTACTAR       ║
// ╚══════════════════════════════════════════════════════════╝
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
            ${c.fb ? '<div class="rev-fb">"' + c.fb + '"</div>' : ''}
            <div style="font-size:10px;color:var(--txt3);margin-top:3px">Recruiter: <strong style="color:var(--txt2)">${c.rec||'—'}</strong></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
            ${estB(c.est)}
            <button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver</button>
          </div>
        </div>
        ${c.l ? '<a href="' + c.l + '" target="_blank" class="tdl" style="font-size:11px;margin-bottom:8px;display:inline-flex">↗ LinkedIn</a>' : ''}
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
          ${c.fb ? '<div class="rev-fb">"' + c.fb + '"</div>' : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
          ${estB(c.est)}
          <button class="btn btn-sm btn-ghost" onclick="openPanel(${c.id})">Ver detalle</button>
        </div>
      </div>
      ${c.l ? '<a href="' + c.l + '" target="_blank" class="tdl" style="font-size:11px;margin-bottom:8px;display:inline-flex">↗ LinkedIn</a>' : ''}
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
                ${c.fb ? '<div class="rev-fb">"' + c.fb + '"</div>' : ''}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
                ${c.l ? '<a href="' + c.l + '" target="_blank" class="tdl" style="font-size:11px" onclick="event.stopPropagation()">↗ LinkedIn</a>' : ''}
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


// ╔══════════════════════════════════════════════════════════╗
// ║  11. PANEL DE EDICIÓN Y FORMULARIOS                     ║
// ╚══════════════════════════════════════════════════════════╝
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
      <div class="ac"><h3>Top motivos de descarte</h3>${topM.map(([k,v])=>'<div class="sr"><span>' + k + '</span><span class="sv mv-r">' + v + '</span></div>').join('')}${!topM.length?'<p style="font-size:11px;color:var(--txt3)">Sin datos aún</p>':''}</div>
      <div class="ac"><h3>Stacks más frecuentes</h3>${topS.map(([k,v],i)=>'<div class="br-row"><div class="br-label">' + k + '</div><div class="br-track"><div class="br-fill" style="width:' + Math.max(v/mx*100,4) + '%;background:' + clrs[i] + '22;color:' + clrs[i] + '">' + v + '</div></div></div>').join('')}</div>
      <div class="ac"><h3>Estado actual</h3>
        <div class="sr"><span>Total</span><span class="sv">${all.length}</span></div>
        <div class="sr"><span>Pipeline activo</span><span class="sv mv-g">${all.filter(c=>isActiveInPipeline(c)).length}</span></div>
        <div class="sr"><span>Historial</span><span class="sv mv-r">${all.filter(c=>DISC_S.has(c.est)).length}</span></div>
        <div class="sr"><span style="color:var(--amber)">⚠ Estancados</span><span class="sv mv-r">${all.filter(c=>isStale(c)).length}</span></div>
      </div>
      <div class="ac"><h3>Por sourcer</h3>${[...new Set(all.map(c=>c.src))].filter(Boolean).map(s=>'<div class="sr"><span>' + s + '</span><span class="sv">' + all.filter(c=>c.src===s).length + '</span></div>').join('')}</div>
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

// ╔══════════════════════════════════════════════════════════╗
// ║  14. VISTAS: MI DÍA, ESTANCADOS                         ║
// ╚══════════════════════════════════════════════════════════╝
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
              ${c.fb?'<div class="rev-fb">"' + c.fb + '"</div>':''}
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


function renderToday(){
  const tb = document.getElementById('today-body'); if(!tb) return;
  const titleEl = document.getElementById('today-title');
  if(titleEl) titleEl.textContent = `Mi día — ${CU?.name?.split(' ')[0] || ''}`;
  try {
    if(HAT === 'sourcer') renderTodaySourcer(tb);
    else if(HAT === 'recruiter') renderTodayRecruiter(tb);
    else renderTodayDefault(tb);
  } catch(e) {
    console.error('Error en renderToday:', e);
    tb.innerHTML = `<div style="padding:20px;color:var(--red);font-size:12px">
      Error al cargar Mi Día: ${e.message}<br>
      <small style="color:var(--txt3)">Revisa la consola (F12) para más detalles.</small>
    </div>`;
  }
}

// ── Mi Día: SOURCER ──────────────────────────────────────────
function renderTodaySourcer(tb) {
  const porContactar  = getContactarCands();
  const porValidar    = cands.filter(c =>
    canSeeCandidate(c) &&
    (c.sit === 'Por validar' || !c.sit || c.sit === '') &&
    !DISC_S.has(c.est) && c.sit !== 'Rechazado'
  );
  const enProceso = cands.filter(c => canSeeCandidate(c) && isActiveInPipeline(c) && c.est !== 'Por contactar');

  const nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = porContactar.length + porValidar.length;

  function mkContactarCard(c) {
    var liLink = c.l ? '<a href="' + c.l + '" target="_blank" onclick="event.stopPropagation()" style="font-size:10px;color:var(--p2);flex-shrink:0">↗ LI</a>' : '';
    return '<div class="today-card today-card-action" onclick="openPanel(' + c.id + ')">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">'
      + '<div style="min-width:0;flex:1">'
      + '<div class="rev-name" style="font-size:12px">' + c.n + '</div>'
      + '<div class="rev-meta">' + (c.emp||'—') + ' · ' + (c.s||'?') + '</div>'
      + '<div style="font-size:10px;color:var(--p2);margin-top:2px">' + (c.stack||'') + '</div>'
      + '</div>' + liLink + '</div>'
      + '<button class="btn btn-p btn-sm" style="width:100%;justify-content:center;margin-top:8px" onclick="event.stopPropagation();marcarContactado(' + c.id + ')">📬 Marcar Contactado</button>'
      + '</div>';
  }

  function mkValidarCard(c) {
    return '<div class="today-card" onclick="openPanel(' + c.id + ')" style="border-color:var(--aborder)">'
      + '<div class="rev-name" style="font-size:12px">' + c.n + '</div>'
      + '<div class="rev-meta">' + (c.emp||'—') + ' · ' + (c.s||'?') + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">'
      + estB(c.est)
      + '<button class="btn btn-sm" style="font-size:10px;padding:2px 7px;border-color:var(--pborder);color:var(--p2)" onclick="event.stopPropagation();sendNotifToRecruiter(' + c.id + ')" id="notif-btn-' + c.id + '">🔔</button>'
      + '</div></div>';
  }

  var kanbanStages = ['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias'];
  var stageColors  = {'Contactado':'#5b9cf0','Screening':'#9d91f5','Entrevista TR':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#f0a940','Referencias':'#2dd4a0'};

  var kanbanHTML = '';
  kanbanStages.forEach(function(stage) {
    var cards = enProceso.filter(function(c){ return normalizeEst(c.est) === stage; });
    if(!cards.length) return;
    var cardHTML = cards.map(function(c) {
      return '<div class="today-kanban-card' + (isStale(c)?' stale-card-k':'') + '" onclick="openPanel(' + c.id + ')">'
        + '<div style="font-size:12px;font-weight:500">' + c.n + (isStale(c)?' <span style="color:var(--amber)">⚠</span>':'') + '</div>'
        + '<div style="font-size:10px;color:var(--txt3)">' + (c.emp||'—') + ' · ' + (daysInStage(c)||'—') + 'd</div>'
        + '<div style="margin-top:3px">' + chips(c.stack) + '</div>'
        + '</div>';
    }).join('');
    kanbanHTML += '<div class="today-kanban-col">'
      + '<div class="today-kanban-header" style="color:' + (stageColors[stage]||'var(--txt2)') + '">'
      + stage + ' <span class="nb">' + cards.length + '</span>'
      + '</div>' + cardHTML + '</div>';
  });

  var leftBox = '<div class="today-box" style="border-color:var(--pborder)">'
    + '<div class="today-box-title" style="color:var(--p2)">📬 Por contactar <span class="nb live">' + porContactar.length + '</span></div>'
    + (porContactar.length ? porContactar.map(mkContactarCard).join('') : '<div class="today-empty">Sin candidatos por contactar</div>')
    + '</div>';

  var rightBox = '<div class="today-box" style="border-color:var(--aborder)">'
    + '<div class="today-box-title" style="color:var(--amber)">⏳ Pendientes de validación <span class="nb warn">' + porValidar.length + '</span></div>'
    + (porValidar.length ? porValidar.map(mkValidarCard).join('') : '<div class="today-empty">Sin pendientes — ¡al día!</div>')
    + '</div>';

  var bottomBox = '<div class="today-box today-box-wide" style="margin-top:14px">'
    + '<div class="today-box-title">🔄 Mis candidatos en proceso <span class="nb">' + enProceso.length + '</span></div>'
    + (enProceso.length ? '<div class="today-kanban">' + (kanbanHTML || '<div class="today-empty">Sin candidatos en proceso</div>') + '</div>' : '<div class="today-empty">Sin candidatos en proceso aún</div>')
    + '</div>';

  tb.innerHTML = '<div class="today-grid-sourcer">' + leftBox + rightBox + '</div>' + bottomBox;
}

function renderTodayRecruiter(tb) {
  var porValidar = cands.filter(function(c) {
    return canSeeCandidate(c) &&
      (c.sit === 'Por validar' || !c.sit || c.sit === '') &&
      !DISC_S.has(c.est) && c.sit !== 'Rechazado';
  });
  var sinFeedback = getPendingFeedbackCands();
  var enProceso   = cands.filter(function(c) {
    return canSeeCandidate(c) && isActiveInPipeline(c) && c.est !== 'Por contactar' && c.est !== 'En pool';
  });

  var nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = porValidar.length + sinFeedback.length;

  function mkValidarCard(c) {
    return '<div class="today-card" onclick="openPanel(' + c.id + ')">'
      + '<div class="rev-name" style="font-size:12px">' + c.n + '</div>'
      + '<div class="rev-meta">' + (c.emp||'—') + ' · ' + (c.s||'?') + ' · ' + (c.stack||'') + '</div>'
      + '<div style="font-size:10px;color:var(--txt3);margin-top:3px">Sourcer: ' + (c.src||'—') + '</div>'
      + '<div style="display:flex;gap:5px;margin-top:8px" onclick="event.stopPropagation()">'
      + '<button class="btn btn-green btn-sm" style="flex:1;justify-content:center;font-size:10px" onclick="reviewAction(' + c.id + ',\'approve\')">✓ Aprobar</button>'
      + '<button class="btn btn-danger btn-sm" style="font-size:10px" onclick="reviewAction(' + c.id + ',\'reject\')">✕</button>'
      + '</div></div>';
  }

  function mkFeedbackCard(c) {
    return '<div class="today-card" onclick="openPanel(' + c.id + ')" style="border-color:var(--bborder)">'
      + '<div class="rev-name" style="font-size:12px">' + c.n + '</div>'
      + '<div class="rev-meta">' + (c.emp||'—') + ' · ' + (c.s||'?') + '</div>'
      + '<div style="margin-top:4px">' + estB(c.est) + '</div>'
      + '</div>';
  }

  var kanbanStages = ['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias'];
  var stageColors  = {'Contactado':'#5b9cf0','Screening':'#9d91f5','Entrevista TR':'#a78bfa','Entrevista EM':'#e06cc0','Misión':'#f0a940','Referencias':'#2dd4a0'};

  var kanbanHTML = '';
  kanbanStages.forEach(function(stage) {
    var cards = enProceso.filter(function(c){ return normalizeEst(c.est) === stage; });
    if(!cards.length) return;
    var cardHTML = cards.map(function(c) {
      return '<div class="today-kanban-card' + (isStale(c)?' stale-card-k':'') + '" onclick="openPanel(' + c.id + ')">'
        + '<div style="font-size:12px;font-weight:500">' + c.n + '</div>'
        + '<div style="font-size:10px;color:var(--txt3)">' + (c.src||'—') + ' · ' + (daysInStage(c)||'—') + 'd</div>'
        + '</div>';
    }).join('');
    kanbanHTML += '<div class="today-kanban-col">'
      + '<div class="today-kanban-header" style="color:' + (stageColors[stage]||'var(--txt2)') + '">'
      + stage + ' <span class="nb">' + cards.length + '</span>'
      + '</div>' + cardHTML + '</div>';
  });

  var leftBox = '<div class="today-box" style="border-color:var(--aborder)">'
    + '<div class="today-box-title" style="color:var(--amber)">⏳ Por validar <span class="nb warn">' + porValidar.length + '</span></div>'
    + (porValidar.length ? porValidar.map(mkValidarCard).join('') : '<div class="today-empty">Sin perfiles por validar</div>')
    + '</div>';

  var rightBox = '<div class="today-box" style="border-color:var(--bborder)">'
    + '<div class="today-box-title" style="color:var(--blue)">💬 Sin feedback — Entrevista TR <span class="nb" style="background:var(--bbg);color:var(--blue)">' + sinFeedback.length + '</span></div>'
    + '<div style="font-size:10px;color:var(--txt3);margin-bottom:8px">Candidatos en Entrevista TR sin comentarios</div>'
    + (sinFeedback.length ? sinFeedback.map(mkFeedbackCard).join('') : '<div class="today-empty">Sin pendientes de feedback 🎉</div>')
    + '</div>';

  var bottomBox = '<div class="today-box today-box-wide" style="margin-top:14px">'
    + '<div class="today-box-title">🔄 Mis candidatos en proceso <span class="nb">' + enProceso.length + '</span></div>'
    + (enProceso.length ? '<div class="today-kanban">' + (kanbanHTML || '<div class="today-empty">Sin candidatos aún</div>') + '</div>' : '<div class="today-empty">Sin candidatos en proceso aún</div>')
    + '</div>';

  tb.innerHTML = '<div class="today-grid-recruiter">' + leftBox + rightBox + '</div>' + bottomBox;
}

function renderTodayDefault(tb) {
  var all = cands.filter(function(c){ return canSeeCandidate(c); });
  var stale = all.filter(function(c){ return isStale(c); });
  var sinFeedback = getPendingFeedbackCands();
  var porValidar = getReviewCands();
  var nbToday = document.getElementById('nb-today');
  if(nbToday) nbToday.textContent = stale.length + porValidar.length;

  var staleCards = stale.slice(0,5).map(function(c) {
    return '<div class="rev-card" onclick="openPanel(' + c.id + ')" style="cursor:pointer">'
      + '<div class="rev-name">' + c.n + '</div>'
      + '<div class="rev-meta">' + c.est + ' · ' + (daysInStage(c)||'—') + 'd · ' + (c.src||'—') + '</div>'
      + '</div>';
  }).join('');

  tb.innerHTML = '<div class="mg" style="margin-bottom:16px">'
    + '<div class="mc"><div class="mcl">Por validar</div><div class="mcv mv-a">' + porValidar.length + '</div></div>'
    + '<div class="mc"><div class="mcl">Sin feedback TR</div><div class="mcv" style="color:var(--blue)">' + sinFeedback.length + '</div></div>'
    + '<div class="mc"><div class="mcl">Estancados</div><div class="mcv mv-r">' + stale.length + '</div></div>'
    + '<div class="mc"><div class="mcl">En pipeline</div><div class="mcv mv-g">' + all.filter(function(c){return isActiveInPipeline(c);}).length + '</div></div>'
    + '</div>'
    + (stale.length ? '<div class="rev-section"><div class="rev-sec-title" style="color:var(--amber)">⚠ Estancados</div><div class="rev-list">' + staleCards + '</div></div>' : '');
}




// ╔══════════════════════════════════════════════════════════╗
// ║  15. CONFIGURACIÓN                                      ║
// ╚══════════════════════════════════════════════════════════╝
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


// ╔══════════════════════════════════════════════════════════╗
// ║  16. UTILIDADES UI Y ARRANQUE                           ║
// ╚══════════════════════════════════════════════════════════╝
