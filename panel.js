// SourcerTrack — Panel de candidatos: formularios y acciones
// Depende de: config.js, api.js, utils.js

  const c=cands.find(x=>x.id===id); if(!c||!canSeeCandidate(c)) return;
  const init=c.n.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const salOk=SCREEN_S.has(c.est)||!!c.sal;
  const disc=DISC_S.has(c.est), editable=canEdit(c), fullEdit=canEditFull(c), stale=isStale(c);
  const timelineHTML=`<div class="timeline">${STAGES.map(s=>{
    const d=c.dates?.[s], days=daysSince(d), thresh=thresholds[s]||10;
    const isCur=c.est===s, isDone=STAGES.indexOf(s)<STAGES.indexOf(c.est)||disc;
    return `<div class="tl-item"><div class="tl-dot ${isCur?'cur':isDone?'done':'empty'}"></div>
      <div style="flex:1"><span class="tl-stage">${s}</span> ${d?'<span class="tl-date">' + fmtDate(d) + '</span>':''} ${isCur&&days!==null?daysLabel(days,thresh):''}</div></div>`;
  }).join('')}${disc?'<div class="tl-item"><div class="tl-dot" style="background:var(--red)"></div><div><span class="tl-stage" style="color:var(--red)">' + c.est + '</span> <span class="tl-date">' + fmtDate(c.dates?.[c.est]) + '</span></div></div>':''}</div>`;
  
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
      ${c.l ? '<a href="' + c.l + '" target="_blank" class="btn btn-sm btn-ghost" style="font-size:11px;text-decoration:none">↗ LinkedIn</a>' : ''}
      ${c.cv ? '<a href="' + c.cv + '" target="_blank" class="btn btn-sm" style="font-size:11px;text-decoration:none;background:var(--gbg);border-color:var(--gborder);color:var(--green)">📄 Ver CV</a>' : ''}
    </div>` : ''}
    ${stale?'<div style="background:var(--abg);border:1px solid var(--aborder);border-radius:var(--r);padding:8px 11px;margin-bottom:12px;font-size:12px;color:var(--amber)">⚠ <strong>Candidato estancado</strong> — ' + daysInStage(c) + ' días en ' + c.est + ' (umbral: ' + thresholds[c.est]||10 + 'd)<br><button class="btn btn-amber btn-sm" style="margin-top:6px" onclick="openEmailModal(' + c.id + ')">📧 Generar notificación</button></div>':''}
    <div class="psec"><div class="pst">Pipeline</div>${pSteps(c)}<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${sitB(c.sit)} ${estB(c.est)}${c.mo?' <span class="badge" style="background:var(--bg4);color:var(--txt3)">' + c.mo + '</span>':''}</div></div>
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
    ${c.fb?'<div class="psec"><div class="pst">Feedback</div><div class="pfb">"' + c.fb + '"</div></div>':''}
    ${editHTML}
    ${API_KEY?'<div class="aib"><div class="ait">✦ Análisis IA (Gemini)</div><div id="aio-' + c.id + '" class="aio" style="color:var(--txt3)">Haz clic para analizar con Google Gemini.</div><button class="btn btn-sm" style="margin-top:7px;width:100%;justify-content:center;border-color:var(--pborder);color:var(--p2)" onclick="aiCand(' + c.id + ')">✦ Analizar</button></div>':''}`;
  document.getElementById('panel').classList.add('open');
}
function closePanel(){ document.getElementById('panel').classList.remove('open'); }

function ownerForm(c,salOk,disc){
  const poolOptions = pools.map(p => `<option value="${p.id}" ${p.id == c.pid ? 'selected' : ''}>${p.name}</option>`).join('');
  return `<div class="psec"><div class="pst">Actualizar (Owner/Supervisor)</div><div class="uf">
    <label style="color:var(--p2); font-weight:600;">Pool / Categoría del Candidato</label>
    <select id="u-po" style="margin-bottom:12px; border-color:var(--pborder); background:var(--bg3);">${poolOptions}</select>
    <label>Estado pipeline</label>
    <select id="u-est">${[...STAGES,'Descartado','No interesado'].map(s=>'<option ' + s===c.est?'selected':'' + '>' + s + '</option>').join('')}</select>
    <label>Situación</label>
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>'<option ' + s===c.sit?'selected':'' + '>' + s + '</option>').join('')}</select>
    <label>Equipo sugerido (texto libre)</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?'<label>Rango salarial</label><input type="text" id="u-sal" value="' + c.sal||'' + '" placeholder="Expectativa salarial">':
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
      ${!disc?'<button class="btn btn-danger btn-sm" onclick="discardC(' + c.id + ')">Descartar</button>':''}
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
    <select id="u-sit">${['Aprobado','Por revisar','Rechazado'].map(s=>'<option ' + s===c.sit?'selected':'' + '>' + s + '</option>').join('')}</select>
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
      ${stagesAllowed.map(s=>'<option ' + s===c.est?'selected':'' + '>' + s + '</option>').join('')}
    </select>
    ${needsApproval?'<div style="font-size:10px;color:var(--txt3);margin-top:-4px;margin-bottom:8px">El estado cambia cuando el recruiter apruebe o se desactive la ZDP.</div>':''}
    <label>Equipo sugerido</label>
    <input type="text" id="u-eq" value="${c.eq||''}" placeholder="DevOps, DevEx AI...">
    ${salOk?'<label>Rango salarial</label><input type="text" id="u-sal" value="' + c.sal||'' + '" placeholder="Expectativa salarial">':
    `<div class="ro">Rango salarial — desde Screening</div>`}
    <label>Feedback / Notas</label><textarea id="u-fb">${c.fb||''}</textarea>
    <label>Link CV <span style="color:var(--txt3);font-weight:400">(Google Drive)</span></label>
    <input type="url" id="u-cv" value="${c.cv||''}" placeholder="https://drive.google.com/file/d/...">
    <div style="display:flex;gap:6px;flex-direction:column">
      <button class="btn btn-p btn-sm" style="justify-content:center" onclick="saveUpdate(${c.id},'sourcer')">Guardar notas / CV</button>
      ${isReadyToCall?'<button class="btn btn-sm" style="justify-content:center;border-color:var(--p);color:var(--p2)" onclick="marcarContactado(' + c.id + ')">📬 Marcar como Contactado</button>':''}
      ${needsApproval?'<button class="btn btn-sm" style="justify-content:center;border-color:var(--pborder);color:var(--p2)" onclick="sendNotifToRecruiter(' + c.id + ')" id="notif-btn-' + c.id + '">🔔 Notificar al recruiter</button>':''}
    </div>
  </div></div>`;
}

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


// ╔══════════════════════════════════════════════════════════╗
// ║  12. ACCIONES: CREAR, GUARDAR, DESCARTAR, ELIMINAR      ║
// ╚══════════════════════════════════════════════════════════╝
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

// ╔══════════════════════════════════════════════════════════╗
// ║  13. MÉTRICAS Y ANALYTICS                               ║
// ╚══════════════════════════════════════════════════════════╝
