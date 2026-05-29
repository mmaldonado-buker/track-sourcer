// SourcerTrack — Panel de candidatos: formularios y acciones
// Depende de: config.js, api.js, utils.js

function openPanel(id){
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
