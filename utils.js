// SourcerTrack — Utilidades: normalización, permisos, ZDP, recontactar
// Depende de: config.js, api.js

function normalizeSit(sit) {
  if (sit === 'Por revisar') return 'Aprobado';  // legacy válido
  if (!sit || sit === '')    return 'Por validar'; // pendiente
  return sit; // 'Aprobado' | 'Rechazado' | 'Por validar'
}

// Indica si un candidato está pendiente de validación humana
function isPendingValidation(c) {
  return !c.sit || c.sit === '' || c.sit === 'Por validar';
}
// ─────────────────────────────────────────────────────────────

// ─── COMPATIBILIDAD ETAPAS ───────────────────────────────────
function normalizeEst(est) {
  if (est === 'Entrevista Inicial') return 'Entrevista TR';
  return est;
}
// ─────────────────────────────────────────────────────────────

// Un candidato está activo en pipeline si:
// - No está descartado/rechazado
// - Está en "Por contactar" (aprobado, esperando contacto del sourcer)
// - O ya avanzó a Contactado o más adelante
function isActiveInPipeline(c) {
  const est = normalizeEst(c.est);
  if (est === 'En pool') return false;           // etapa cero
  if (DISC_S.has(est)) return false;
  if (HIRED_S.has(est)) return false;
  if (c.sit === 'Rechazado') return false;
  if (isPendingValidation(c)) return false;      // Por validar: no entra al pipeline
  // 'Por contactar' solo con aprobación real (Aprobado o Por revisar legacy)
  if (est === 'Por contactar') {
    return c.sit === 'Aprobado' || c.sit === 'Por revisar';
  }
  return new Set(['Contactado','Screening','Entrevista TR','Entrevista EM','Misión','Referencias']).has(est);
}

const today_d = new Date();
function daysAgo(n){ const d=new Date(today_d); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
const SEED = [
  {id:1,pid:2,n:'Brian Guadron',    l:'https://linkedin.com/in/brianguadron',      s:'L2',stack:'JavaScript',  emp:'LifeMiles',      sit:'Aprobado',   est:'Entrevista Inicial',mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Buen candidato pasado dev + devops',         eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(25),Screening:daysAgo(18),'Entrevista Inicial':daysAgo(12)},dt:daysAgo(25)},
  {id:2,pid:2,n:'Michael Salgado',  l:'https://linkedin.com/in/michael-salgado',   s:'L2',stack:'Javascript',  emp:'UPRA',           sit:'Aprobado',   est:'Screening',         mo:'',src:'Valentina Larenas', rec:'Paula Mahecha',  fb:'Me gusta, experiencia orientada a producto', eq:'DevOps',     sal:'',       dates:{Contactado:daysAgo(14),Screening:daysAgo(5)},dt:daysAgo(14)},
  {id:3,pid:1,n:'Daniel Amaya',     l:'https://linkedin.com/in/amayabdaniel',       s:'L3',stack:'RoR, TS',     emp:'Furnished Finder',sit:'Aprobado',  est:'Contactado',        mo:'',src:'Catalina León',    rec:'Gaspar Jaramillo',fb:'Me gustó mucho, hagamos outreach',          eq:'Backend',    sal:'',       dates:{Contactado:daysAgo(3)},dt:daysAgo(3)},
];

let CU = null, HAT = '', API_KEY = '';
let pools = [], cands = [];
let currentPool = null, pipeStageF = '';
let thresholds = {}, emailMap = {};
let selUserId = null;

// ── Fecha y hora en zona horaria de Chile ───────────────────
// Siempre usa America/Santiago independiente del computador del usuario.
// Devuelve 'YYYY-MM-DD' para guardar en la BD.
function todayCL() {
  // Método robusto que funciona en todos los browsers
  try {
    const d = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Santiago'}));
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  } catch(e) {
    // Fallback: UTC
    return new Date().toISOString().slice(0,10);
  }
}
// ────────────────────────────────────────────────────────────


// ╔══════════════════════════════════════════════════════════╗
// ║  4. CONFIGURACIÓN LOCAL Y SEED DATA                     ║
// ╚══════════════════════════════════════════════════════════╝
function loadLocalConfig() {
  const st = localStorage.getItem('st4_thresh');
  thresholds = st ? JSON.parse(st) : {...DEFAULT_THRESHOLDS};
  USERS.forEach(u => { emailMap[u.name] = u.email; });
  API_KEY = localStorage.getItem('st4_key') || '';
  let sp = localStorage.getItem('st4_pools');
  if (sp && (sp.includes('Software Engineers') || sp.includes('Tribu Plataforma'))) {
      sp = null; localStorage.removeItem('st4_pools');
  }
  pools = sp ? JSON.parse(sp) : JSON.parse(JSON.stringify(DEFAULT_POOLS));
  const sc = localStorage.getItem('st4_cands');
  cands = sc ? JSON.parse(sc) : JSON.parse(JSON.stringify(SEED));
}
function saveLocal() { localStorage.setItem('st4_thresh', JSON.stringify(thresholds)); }

function daysSince(dateStr){ if(!dateStr) return null; return Math.floor((new Date()-new Date(dateStr))/(86400000)); }
function daysInStage(c){ return daysSince(c.dates?.[c.est]); }
// ── Zona de Desarrollo Próximo (ZDP) ────────────────────────
// Cuando ZDP está ACTIVO para un sourcer, necesita aprobación del recruiter
// para mover candidatos. Cuando está INACTIVO, puede moverlos libremente.
// Estado por sourcer: { 'Matías Maldonado': true, ... }

// ╔══════════════════════════════════════════════════════════╗
// ║  3. ESTADO GLOBAL Y FEATURES (ZDP, RECONTACT, THEME)    ║
