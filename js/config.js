// USERS & DATA STRUCTURE
const USERS = [
  {id:'JQ', name:'Jonathan Quiroz',    role:'supervisor', team:'A', color:'#7c6ef0', email:'jquiroz@buk.mx'},
  {id:'CP', name:'Catalina Poblete',   role:'owner',      team:'B', color:'#a78bfa', email:'cpoblete@buk.cl'},
  // ... (resto de usuarios)
];

const SQUADS = [
  {id:'A', name:'Squad A', owners:['Jonathan Quiroz'],  recruiters:['Paula Mahecha'],    sourcers:['Catalina León','María José Menares']},
  // ... (resto de squads)
];

const DEFAULT_POOLS = [
  {id:1, name:'Software Engineers',    desc:'Pool general de ingenieros de software', color:'#5b9cf0'},
  // ... (resto de pools)
];

const DEFAULT_THRESHOLDS = { 'Contactado':7, 'Screening':7, 'Entrevista Inicial':10, 'Entrevista EM':10, 'Misión':14 };
const STAGES   = ['Contactado','Screening','Entrevista Inicial','Entrevista EM','Misión'];
const ACTIVE_S = new Set(['Entrevista Inicial','Entrevista EM','Misión']);
const DISC_S   = new Set(['Descartado','No interesado']);
const SCREEN_S = new Set(['Screening','Entrevista Inicial','Entrevista EM','Misión']);

// Helpers de fecha para el SEED
const today_d = new Date();
function daysAgo(n){ const d=new Date(today_d); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

const SEED = [
  {id:1,pid:2,n:'Brian Guadron', /* ... resto del objeto ... */ },
  // ... (resto de la semilla)
];

// STATE GLOBALS (Definidas usando 'let' para que app.js pueda modificarlas)
let CU = null, HAT = '', API_KEY = '';
let pools = [], cands = [];
let currentPool = null, pipeStageF = '';
let thresholds = {}, emailMap = {};
let selUserId = null, hatChoice = '';
