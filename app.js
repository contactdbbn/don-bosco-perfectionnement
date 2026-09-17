const SLOT_NAMES = ["Créneau 1","Créneau 2","Créneau 3"];
const MAX = 25;
const QUOTA_MAX = 30;
const seed = [
 ["Alice Martin",1],["Antoine Durand",1],["Camille Bernard",1],["Chloé Petit",1],["Emma Robert",1],
 ["Hugo Morel",1],["Inès Laurent",1],["Jules Simon",1],["Léa Michel",1],["Lucas Garcia",1],
 ["Manon David",1],["Nathan Thomas",1],["Noah Roux",1],["Sarah Vincent",1],["Tom Lefèvre",1],
 ["Zoé Fournier",1],["Arthur Girard",1],["Louise André",1],["Paul Mercier",1],["Clara Blanc",1],
 ["Ethan Faure",1],["Mia Gauthier",1],["Gabriel Chevalier",1],["Nina Perrin",1],["Oscar Robin",1],
 ["Sacha Fontaine",2],["Jade Masson",2],["Lina Boyer",2],["Adam Denis",2],["Rose Lemoine",2],
 ["Léo Marchand",2],["Anna Rey",2],["Mathis Legrand",2],["Eva Colin",2],["Maxime Caron",2],
 ["Élise Besson",2],["Théo Paris",2],["Juliette Renard",2],["Romain Pelletier",2],["Lou-Anne Mathieu",2],
 ["Baptiste Olivier",2],["Alice Dupuis",2],["Martin Garcia",2],["Nora Meyer",2],["Axel Barbier",2],
 ["Yanis Guillon",2],["Maël Le Roux",2],["Lola Benoit",2],["Louis Lambert",2],["Agathe Rolland",2],
 ["Basile Henry",3],["Célia Blanchard",3],["Dorian Renaud",3],["Éva Lecomte",3],["Félix Berger",3],
 ["Gabin Cousin",3],["Hana Aubry",3],["Iris Marchal",3],["Jonas Fleury",3],["Kylian Boucher",3],
 ["Léna Vidal",3],["Malo Cordier",3],["Nelly Gonzalez",3],["Owen Grondin",3],["Pablo Hoarau",3],
 ["Quentin Lebrun",3],["Romy Tessier",3],["Samuel Pichon",3],["Tania Guillot",3],["Ulysse Teixeira",3],
 ["Valentin Dumas",3],["Wendy Humbert",3],["Xavier Meunier",3],["Yasmine Lacroix",3],["Zélie Noël",3]
];

function readStorageJson(key,fallback=null){
  try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; }
  catch(e){ console.warn("Donnée locale illisible:",key,e); return fallback; }
}
function writeStorageJson(key,value){
  try{ localStorage.setItem(key,JSON.stringify(value)); return true; }
  catch(e){ console.error("Impossible d’enregistrer les données:",key,e); toast("Impossible d’enregistrer les données localement."); return false; }
}
function addActionLog(action,details=""){
  if(!db.actionLog) db.actionLog=[];
  const actor=currentActorLabel();
  db.actionLog.push({id:Date.now()+Math.random(),date:new Date().toISOString(),actor,action:String(action),details:String(details||"")});
  if(db.actionLog.length>500) db.actionLog=db.actionLog.slice(-500);
}
function currentActorLabel(){
  if(authState==="admin") return "Administrateur";
  if(authState==="coach") return "Encadrant";
  const m=db?.members?.find(x=>Number(x.id)===Number(currentMemberId));
  return m?.name||"Adhérent";
}

let db = readStorageJson("sportclub-v1",null);
if(!db){
  db={members:seed.map((x,i)=>({id:i+1,name:x[0],slot:x[1],active:true,password:"1234"})),attendance:{},actualAttendance:{},quotas:{1:30,2:30,3:30},moves:[],absencePeriods:[]};
  writeStorageJson("sportclub-v1",db);
}
if(!db.actualAttendance) db.actualAttendance={};
if(!db.quotas) db.quotas={1:30,2:30,3:30};
[1,2,3].forEach(s=>{ if(!Number.isFinite(Number(db.quotas[s]))) db.quotas[s]=30; db.quotas[s]=Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas[s]))); });
if(!db.moves) db.moves=[];
if(!db.absencePeriods) db.absencePeriods=[];
if(!db.statusRequests) db.statusRequests=[];
if(!Array.isArray(db.objectiveComments)) db.objectiveComments=[];
if(!Array.isArray(db.objectiveReactions)) db.objectiveReactions=[];
if(!db.coachNotesByDate || typeof db.coachNotesByDate!=='object') db.coachNotesByDate={};
if(!Array.isArray(db.adminMessages)) db.adminMessages=[];
if(!Array.isArray(db.adminMessageComments)) db.adminMessageComments=[];
if(!Array.isArray(db.adminMessageComments)) db.adminMessageComments=[];
if(!db.notificationPrograms || typeof db.notificationPrograms!=='object') db.notificationPrograms={};
if(!db.manualNotification || typeof db.manualNotification!=='object') db.manualNotification={content:'',recipients:{member:true,coach:true,admin:true}};
if(!db.informationBanner || typeof db.informationBanner!=='object') db.informationBanner={active:false,content:''};
if(!db.adminRequestVisibility || typeof db.adminRequestVisibility!=='object') db.adminRequestVisibility={cancelled:false,rejected:false};
// Migration : compteur de changements effectué par adhérent.
db.members.forEach(m=>{ if(typeof m.changeCount!=="number") m.changeCount=0; if(!m.password) m.password="1234"; if(!m.role) m.role="member"; });
let weekOffset=0;
let selectedSlots=new Set();
let calendarCursor=new Date();
let calendarData=readStorageJson("sportclub-calendar-v1",null)||{weeks:{},events:[]};
if(!calendarData.weeks || typeof calendarData.weeks!=="object") calendarData.weeks={};
if(!Array.isArray(calendarData.events)) calendarData.events=[];
// Période du calendrier : réglable uniquement par l'administrateur.
// Valeur initiale demandée : 01/09/2026 → 31/08/2027.
if(!calendarData.period || typeof calendarData.period!=="object") calendarData.period={start:"2026-09-01",end:"2027-08-31"};
if(!/^\d{4}-\d{2}-\d{2}$/.test(String(calendarData.period.start||""))) calendarData.period.start="2026-09-01";
if(!/^\d{4}-\d{2}-\d{2}$/.test(String(calendarData.period.end||""))) calendarData.period.end="2027-08-31";
function getCalendarPeriod(){ return {start:String(calendarData.period.start),end:String(calendarData.period.end)}; }
function isDateInCalendarPeriod(date){ const d=String(date||"").slice(0,10),p=getCalendarPeriod(); return d>=p.start&&d<=p.end; }
function clampCalendarCursor(){
 const p=getCalendarPeriod(), first=new Date(p.start+"T12:00:00"), last=new Date(p.end+"T12:00:00");
 const min=new Date(first.getFullYear(),first.getMonth(),1), max=new Date(last.getFullYear(),last.getMonth(),1);
 if(calendarCursor<min) calendarCursor=min;
 if(calendarCursor>max) calendarCursor=max;
}
// Initialisation/migration : dans la période du calendrier, chaque lundi est Cours
// par défaut, comme dans le calendrier initial du projet. Une semaine explicitement
// réglée en Libre/Vacances n'est jamais écrasée.
function ensureCalendarCourseMondays(){
 const p=getCalendarPeriod();
 const start=new Date(p.start+"T12:00:00"), end=new Date(p.end+"T12:00:00");
 const d=new Date(start); d.setDate(d.getDate()-((d.getDay()||7)-1));
 let changed=false;
 for(; d<=end; d.setDate(d.getDate()+7)){
   const key=isoDate(d);
   if(key<p.start||key>p.end) continue;
   if(!Object.prototype.hasOwnProperty.call(calendarData.weeks,key)){
     calendarData.weeks[key]={type:"course",label:"Cours"}; changed=true;
   }
 }
 if(changed) saveCalendar();
}
function saveCalendar(){ return writeStorageJson("sportclub-calendar-v1",calendarData); }
let currentRole=localStorage.getItem("sportclub-role") || "member";
let currentMemberId=Number(localStorage.getItem("sportclub-member-id") || 1);
let memberLoggedIn=localStorage.getItem("sportclub-member-auth") === "1";
const ROLE_LABELS={member:"Adhérent",coach:"Encadrant",admin:"Administrateur"};
let authState=localStorage.getItem("sportclub-auth-role") || "";
let staffLoggedIn=localStorage.getItem("sportclub-staff-auth") === "1";
let adminRequestFilter=localStorage.getItem("sportclub-admin-request-filter") || "pending";
let tdbPeriodFilter=localStorage.getItem("sportclub-tdb-period-filter") || "all";
let notificationSettings = readStorageJson("sportclub-notification-settings", null) || {};
const DEFAULT_STAFF_NOTIFICATION_WINDOW={active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"};
if(!notificationSettings.staff_delivery_window) notificationSettings.staff_delivery_window={...DEFAULT_STAFF_NOTIFICATION_WINDOW};
const DEFAULT_NOTIFICATION_SETTINGS={
  attendance_reminder:{active:true,days:[0],start:"18:00",end:"18:05"},
  new_slot_request:{active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"},
  new_status_request:{active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"},
  slot_request_decision:{active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"},
  status_request_decision:{active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"},
  attendance_confirmed:{active:true,days:[1,2,3,4,5,6,0],start:"07:00",end:"23:00"}
};
Object.keys(DEFAULT_NOTIFICATION_SETTINGS).forEach(k=>{if(!notificationSettings[k]) notificationSettings[k]={...DEFAULT_NOTIFICATION_SETTINGS[k]};});
const DEFAULT_NOTIFICATION_PROGRAMS=[1,2,3].map(i=>({id:i,active:false,title:`Notification programmée ${i}`,content:'',mode:'days',days:[],weekTypes:[],recipients:{member:true,coach:false,admin:false},time:'12:00'}));
for(const n of DEFAULT_NOTIFICATION_PROGRAMS){ if(!db.notificationPrograms[n.id]) db.notificationPrograms[n.id]=n; else db.notificationPrograms[n.id]={...n,...db.notificationPrograms[n.id],recipients:{...n.recipients,...(db.notificationPrograms[n.id].recipients||{})}}; }

let appUsers=readStorageJson("sportclub-users-v1",null)||{
  admin:{username:"admin",password:"admin1234",role:"admin"},
  encadrant:{username:"encadrant",password:"1234",role:"coach"}
};
function saveUsers(){writeStorageJson("sportclub-users-v1",appUsers);}
if(!localStorage.getItem("sportclub-users-v1")){ saveUsers(); }
function getMemberRole(m){return m?.role||"member";}
function slotLabel(slot){ const n=Number(slot); return [1,2,3].includes(n) ? SLOT_NAMES[n-1] : "Aucun créneau"; }
function normalizeRole(role){
 const r=String(role||"").trim().toLowerCase();
 if(r==="admin"||r==="administrateur") return "admin";
 if(r==="coach"||r==="encadrant") return "coach";
 return "member";
}
function isAdherent(m){ return m?.active!==false && normalizeRole(m?.role)==="member"; }
function sortByName(list){
 return [...list].sort((a,b)=>String(a?.name||"").localeCompare(String(b?.name||""),"fr-FR",{sensitivity:"base"}));
}
function sortedSlotNumbers(){
 return [1,2,3].sort((a,b)=>slotLabel(a).localeCompare(slotLabel(b),"fr-FR",{numeric:true,sensitivity:"base"}));
}
function getSlotQuota(slot){ const n=Number(slot); return Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas?.[n]??30))); }
function getActiveSlotCount(slot,excludeId=null){ return db.members.filter(x=>isAdherent(x)&&Number(x.slot)===Number(slot)&&(excludeId===null||x.id!==Number(excludeId))).length; }
function setMemberHabitualSlot(id,slot){
 if(!canManageRoles()) return toast("Seul l'administrateur peut gérer les créneaux habituels.");
 const m=db.members.find(x=>x.id===Number(id)); if(!m)return;
 const role=getMemberRole(m);
 if(role==="coach"){ m.slot=null; addActionLog("Créneau supprimé",`${m.name} · rôle Encadrant`); save(); render(); return toast(`${m.name} est un encadrant et reste sans créneau.`); }
 slot=String(slot).trim()==="" ? null : Number(slot);
 if(role==="member" && ![1,2,3].includes(Number(slot))) return toast("Un adhérent doit avoir un créneau.");
 if(role==="admin" && slot!==null && ![1,2,3].includes(slot)) return toast("Créneau invalide.");
 if(slot!==null && slot!==Number(m.slot) && getActiveSlotCount(slot,m.id)>=getSlotQuota(slot)) return toast(`Le ${slotLabel(slot)} a atteint son quota (${getSlotQuota(slot)}).`);
 m.slot=slot; addActionLog("Modification de créneau habituel",`${m.name} → ${slot===null?"Aucun créneau":slotLabel(slot)}`); save(); render(); toast(`Créneau habituel de ${m.name} : ${slot===null?"Aucun":slotLabel(slot)}.`);
}
function canAdmin(){return authState==="admin"&&currentRole==="admin";}
function canCoach(){return authState==="admin"||authState==="coach";}
function canManageEvents(){return authState==="admin";}
function canManageRoles(){return authState==="admin";}


const canEditAttendance = (memberId) => canCoach() || Number(memberId) === currentMemberId;
const isPastWeek = (key=weekKey()) => key < mondayKey(new Date());
const hasResponded = (memberId,key=weekKey()) => Object.prototype.hasOwnProperty.call(db.attendance, key+"_"+memberId) || isMemberAbsentByPeriod(memberId,key);
// Réponse définitive : seuls Présent et Absent permettent de considérer
// qu'un adhérent a répondu pour le traitement forcé de 13h30.
// Une valeur "pending" / "À confirmer" ne suffit pas.
const hasDefinitiveResponse = (memberId,key=weekKey()) => {
  if(isMemberAbsentByPeriod(memberId,key)) return true;
  const status=String(db.attendance?.[key+"_"+memberId]||"").toLowerCase();
  return status==="present" || status==="absent";
};
const getAttendanceEventDates = (key=weekKey()) => calendarData.events.filter(e => {
  const title=String(e.title||"").trim().toLowerCase();
  return (title==="cours" || title==="libre") && mondayKey(new Date(e.date+"T12:00:00"))===key;
}).map(e=>e.date).sort();
const getAttendanceEventDate = (key=weekKey()) => getAttendanceEventDates(key)[0] || null;
const isStatusLockedAt1930 = (memberId,key=weekKey()) => {
  if(canAdmin() || !hasResponded(memberId,key)) return false;
  const today=isoDate(new Date());
  const eventDate=getAttendanceEventDate(key);
  // Une semaine déjà passée est toujours verrouillée pour l'adhérent.
  // Pour la semaine en cours, on se base sur la date réelle de l'événement :
  // - événement passé => verrouillé
  // - événement futur => encore modifiable
  // - le jour de l'événement => verrouillage à 19h30
  if(eventDate){
    if(eventDate < today) return true;
    if(eventDate > today) return false;
  } else {
    // Si aucun événement daté n'est trouvé, la date du lundi sert de référence.
    if(key < today) return true;
    if(key > today) return false;
  }
  const now=new Date();
  return now.getHours()>19 || (now.getHours()===19 && now.getMinutes()>=30);
};
const canEditAttendanceForDate = (memberId,key=weekKey()) => canEditAttendance(memberId) && (currentRole === "admin" || !isPastWeek(key));
const currentMember = () => db.members.find(m => m.id === currentMemberId && m.active);
const weekKey=()=>{let d=new Date(); d.setDate(d.getDate()+weekOffset*7); const day=d.getDay()||7; d.setDate(d.getDate()-day+1); return isoDate(d)};
function save(){ return writeStorageJson("sportclub-v1",db); }
function safeDate(value){
 if(value===null||value===undefined||value==="") return null;
 const d=value instanceof Date?new Date(value.getTime()):new Date(value);
 return Number.isFinite(d.getTime())?d:null;
}
const fmt=d=>{
 const raw=String(d??"").trim();
 const date=safeDate(/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+"T12:00:00":raw);
 return date?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(date):"date non renseignée";
};
const isMemberAbsentByPeriod=(id,key=weekKey())=>db.absencePeriods.some(a=>Number(a.memberId)===Number(id)&&a.start<=key&&a.end>=key);
const getStatus=(id)=>isMemberAbsentByPeriod(id)?"absent":(db.attendance[weekKey()+"_"+id]||"pending");
const getStatusForWeek=(id,key=weekKey())=>isMemberAbsentByPeriod(id,key)?"absent":(db.attendance[key+"_"+id]||"pending");
const getWeekMoves=(key=weekKey())=>db.moves.filter(m=>m.week===key);
const getMoveForMember=(memberId,key=weekKey())=>getWeekMoves(key).filter(m=>m.memberId===Number(memberId)&&(m.status==="pending"||m.status==="approved")).sort((a,b)=>b.id-a.id)[0];
// Dernière demande de changement de créneau de l'adhérent pour la semaine.
// Inclut les demandes traitées afin que l'adhérent puisse voir leur statut
// directement sur Présences et Mon suivi.
const getLatestMoveForMember=(memberId,key=weekKey())=>getWeekMoves(key).filter(m=>Number(m.memberId)===Number(memberId)).sort((a,b)=>Number(b.createdAt||b.id||0)-Number(a.createdAt||a.id||0))[0]||null;
const getVisibleMoveForMember=(memberId,key=weekKey())=>{ const latest=getLatestMoveForMember(memberId,key); return latest&&latest.status!=="cancelled"?latest:null; };
function slotRequestStatusLabel(status){
 if(status==="pending") return "en attente de validation";
 if(status==="approved") return "acceptée";
 if(status==="rejected") return "refusée";
 if(status==="cancelled") return "annulée";
 return String(status||"");
}
const getEffectiveSlot=(memberId,key=weekKey())=>{
 const m=db.members.find(x=>x.id===Number(memberId)); if(!m) return null;
 const move=getWeekMoves(key).filter(x=>x.memberId===Number(memberId)&&x.status==="approved").sort((a,b)=>b.approvedAt-b.approvedAt||b.id-a.id)[0];
 return move?Number(move.to):Number(m.slot);
};
const getControlPresence=(slot,key=weekKey())=>db.members.filter(m=>isAdherent(m)&&getEffectiveSlot(m.id,key)===Number(slot)&&getStatusForWeek(m.id,key)==="present").length;
const getControlAbsent=(slot,key=weekKey())=>db.members.filter(m=>isAdherent(m)&&getEffectiveSlot(m.id,key)===Number(slot)&&getStatus(m.id)==="absent").length;
const getDeclaredPresenceCount=(memberId)=>Object.entries(db.attendance||{}).filter(([key,value])=>key.endsWith("_"+memberId)&&value==="present").length;
const getChangeCount=(memberId)=>Number(db.members.find(m=>m.id===Number(memberId))?.changeCount||0);
const getActualAttendance=(slot)=>Number(db.actualAttendance[weekKey()+"_"+slot] ?? 0);

function getActualAttendanceHistory(){
 const byWeek={};
 Object.entries(db.actualAttendance||{}).forEach(([key,value])=>{
   const m=key.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);
   if(!m) return;
   const week=m[1], slot=Number(m[2]);
   if(slot<1 || slot>SLOT_NAMES.length) return;
   if(!byWeek[week]) byWeek[week]={week};
   byWeek[week][slot]=Number(value)||0;
 });
 return Object.values(byWeek).sort((a,b)=>a.week.localeCompare(b.week));
}
function setQuota(slot,value){
 if(!canAdmin()) return toast("Réservé à l’administrateur.");
 const n=Math.max(0,Math.min(QUOTA_MAX,Number(value)||0));
 db.quotas[slot]=n; save(); render(); toast(`Quota du créneau ${slot} : ${n} personne${n>1?"s":""}.`);
}
function setActualAttendance(slot,value){
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 if(!isAttendanceWeek()) return toast("La présence réelle est à renseigner uniquement les semaines Cours ou Libre.");
 const n=Math.max(0,Math.min(30,Number(value)||0));
 db.actualAttendance[weekKey()+"_"+slot]=n;
 save();
 renderMembers();
 toast(`Présence réelle du créneau ${slot} : ${n} personne${n>1?"s":""}.`);
}
const ABSENCE_PERIOD_MESSAGE="Supprimez ou modifiez la période d’absence avant de changer le statut.";
const setStatusForWeek=(id,status,key)=>{
 if(isMemberAbsentByPeriod(id,key)) return toast(ABSENCE_PERIOD_MESSAGE);
 // L'administrateur peut toujours modifier les statuts, quelle que soit la date.
 if(!canCoach() && !isAttendanceWeek(key)) return toast("Les présences sont demandées uniquement les semaines Cours ou Libre.");
 if(!canCoach() && isPastWeek(key)){ toast("Cette date est passée. Envoyez une demande à l’administrateur pour modifier le statut."); return; }
 if(!canCoach() && isStatusLockedAt1930(id,key)){ toast("Votre réponse est verrouillée après 19h30. Envoyez une demande à l’administrateur pour la modifier."); return; }
 db.attendance[key+"_"+id]=status;
 addActionLog("Modification de présence",`${id} · ${status} · semaine ${key}`);
 save();
 render();
};
const setStatus=(id,status)=>setStatusForWeek(id,status,weekKey());
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function render(){
 const banner=document.getElementById('informationBanner');
 if(banner){ const b=db.informationBanner||{}; banner.innerHTML=b.active&&String(b.content||'').trim()?`<div class="information-banner-inner"><strong>Information</strong><span>${esc(b.content).replace(/\n/g,'<br>')}</span></div>`:''; banner.classList.toggle('hidden',!(b.active&&String(b.content||'').trim())); }
 const memberTab=document.querySelector('.tab[data-view="members"]');
 const moveTab=document.querySelector('.tab[data-view="moves"]');
 memberTab.style.display=canCoach()?"":"none";
 moveTab.style.display=canCoach()?"":"none";
 if(!canCoach() && !document.getElementById("membersView").classList.contains("hidden")){
   document.querySelector('.tab[data-view="dashboard"]').click();
 }
 const visibleMemberMessages=(db.adminMessages||[]).filter(x=>Number(x.memberId)===Number(currentMemberId)&&x.visible!==false); const mb=document.getElementById("messageBadge"); if(mb) mb.textContent=canAdmin()?String((db.adminMessages||[]).filter(x=>x.visible!==false).length||""):String(visibleMemberMessages.length||"");
 document.getElementById("moveBadge").textContent=(db.moves.filter(m=>m.status==="pending").length+(db.statusRequests||[]).filter(m=>m.status==="pending").length)||"";
 renderDashboard(); renderMembers(); renderTdb(); renderCalendar(); renderMoves(); renderMemberHistory(); renderRequestHistory(); renderObjectives(); renderEvents(); renderNotifications(); renderMessages(); renderCoachExportData(); syncTabs();
}
function hideMemberLogin(){ const box=document.getElementById("memberLogin"); if(box) box.classList.add("hidden"); }
let v87LoginDirectory=[];
let v87LoginMode='member';
let v87LoginSlot='all';
let v87LoginProfileId='';

function v87RoleLabel(role){ return role==='admin'?'Administrateur':role==='coach'?'Encadrant':'Adhérent'; }
function v87MaskEmail(email){
 const e=String(email||'').trim();
 if(!e) return '';
 return e.length<=6 ? `${e.slice(0,3)}•••` : `${e.slice(0,3)}••••••${e.slice(-3)}`;
}
function v87LoginGateway(){ return `${window.SUPABASE_CONFIG?.url||''}/functions/v1/auth-gateway`; }
async function v87FetchLoginDirectory(){
 const url=v87LoginGateway();
 if(!url || url.endsWith('/')) throw new Error('Configuration Supabase absente.');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_CONFIG.publishableKey},body:JSON.stringify({action:'directory'})});
 const result=await response.json().catch(()=>null);
 if(!response.ok || !result?.ok) throw new Error(result?.error||'Impossible de charger la liste des comptes.');
 v87LoginDirectory=Array.isArray(result.items)?result.items:[];
 return v87LoginDirectory;
}
function v87LoginItem(){ return v87LoginDirectory.find(x=>String(x.profile_id)===String(v87LoginProfileId))||null; }
function v87FilteredLoginItems(){
 let items=v87LoginDirectory.filter(x=>x.role===v87LoginMode);
 if(v87LoginMode==='member' && v87LoginSlot!=='all') items=items.filter(x=>Number(x.slot)===Number(v87LoginSlot));
 return items;
}
function v87SelectMode(value){
 v87LoginMode=String(value||'member');
 v87LoginProfileId='';
 v87LoginSlot='all';
 renderLoginFields();
}
function v87SelectSlot(value){
 v87LoginSlot=String(value||'all');
 v87LoginProfileId='';
 renderLoginFields();
}
function v87SelectProfile(value){ v87LoginProfileId=String(value||''); renderLoginFields(); }

function showMemberLogin(message='Connectez-vous à votre espace Don Bosco - Perfectionnement.'){
 let box=document.getElementById('memberLogin');
 if(!box){ box=document.createElement('div'); box.id='memberLogin'; document.body.appendChild(box); }
 box.innerHTML=`<div class="login-card login-card-v87"><p class="eyebrow">DON BOSCO - PERFECTIONNEMENT</p><h2>Connexion</h2><p class="muted">${esc(message)}</p><div id="loginFields"><div class="muted">Chargement des comptes…</div></div><button class="primary" onclick="performLogin()">Se connecter</button><div class="login-help">À la première connexion, vous confirmerez votre identité avec l’adresse mail paramétrée puis vous choisirez votre mot de passe personnel. Aux connexions suivantes, le nom et le mot de passe suffisent.</div></div>`;
 box.classList.remove('hidden');
 v87FetchLoginDirectory().then(()=>renderLoginFields()).catch(e=>{console.error(e);document.getElementById('loginFields').innerHTML='<div class="muted">Impossible de charger les comptes.</div>';toast(e.message||'Erreur de connexion.');});
}
function renderLoginFields(){
 const target=document.getElementById('loginFields'); if(!target)return;
 const items=v87FilteredLoginItems();
 const selected=v87LoginItem();
 if(selected && !items.some(x=>String(x.profile_id)===String(selected.profile_id))) v87LoginProfileId='';
 const profile=v87LoginItem();
 const first=!!profile?.first_login;
 target.innerHTML=`
   <div class="login-step"><div class="login-step-title">1 · Mode</div><label>Mode<select id="loginMode" onchange="v87SelectMode(this.value)"><option value="member" ${v87LoginMode==='member'?'selected':''}>Adhérent</option><option value="coach" ${v87LoginMode==='coach'?'selected':''}>Encadrant</option><option value="admin" ${v87LoginMode==='admin'?'selected':''}>Administrateur</option></select></label></div>
   ${v87LoginMode==='member'?`<div class="login-step"><div class="login-step-title">2 · Créneau</div><label>Créneau<select id="loginSlot" onchange="v87SelectSlot(this.value)"><option value="all" ${v87LoginSlot==='all'?'selected':''}>Tous les créneaux</option><option value="1" ${v87LoginSlot==='1'?'selected':''}>Créneau 1</option><option value="2" ${v87LoginSlot==='2'?'selected':''}>Créneau 2</option><option value="3" ${v87LoginSlot==='3'?'selected':''}>Créneau 3</option></select></label></div>`:''}
   <div class="login-step"><div class="login-step-title">${v87LoginMode==='member'?'3':'2'} · Liste ${v87LoginMode==='member'?'des adhérents':'des comptes'}</div><label>${v87LoginMode==='member'?'Adhérent':'Compte'}<select id="loginProfile" onchange="v87SelectProfile(this.value)"><option value="">Sélectionnez votre nom</option>${items.map(x=>`<option value="${esc(String(x.profile_id))}" ${String(x.profile_id)===String(v87LoginProfileId)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div>
   ${profile?`<div class="login-selected"><strong>${esc(profile.name)}</strong><span class="muted">${esc(v87RoleLabel(profile.role))}${profile.slot?` · Créneau ${profile.slot}`:''}</span></div>`:''}
   ${profile&&first?`<div class="login-first"><div class="login-first-title">Première connexion</div><p>Pour confirmer que c’est bien votre compte, saisissez l’adresse mail paramétrée :</p><div class="login-email-hint">${esc(profile.masked_email||'Adresse non renseignée')}</div><label>Adresse mail paramétrée<input id="loginEmail" type="email" autocomplete="username" placeholder="votre adresse mail"></label><label>Mot de passe temporaire<input id="loginPassword" type="password" autocomplete="current-password" placeholder="Mot de passe temporaire"></label></div>`:`${profile?`<div class="login-returning"><div class="login-returning-title">Connexion habituelle</div><p class="muted">Saisissez votre mot de passe personnel.</p><label>Mot de passe<input id="loginPassword" type="password" autocomplete="current-password" placeholder="Mot de passe"></label></div>`:''}`}
 `;
}

performLogin=async function(){
 const sb=v53Client();
 if(!sb) return toast('Supabase n’est pas disponible.');
 const profile=v87LoginItem();
 if(!profile) return toast('Sélectionnez d’abord votre nom.');
 const password=String(document.getElementById('loginPassword')?.value||'');
 if(!password) return toast('Saisissez votre mot de passe.');
 const first=!!profile.first_login;
 const email=String(document.getElementById('loginEmail')?.value||'').trim();
 if(first && !email) return toast('Saisissez l’adresse mail paramétrée.');
 const response=await fetch(v87LoginGateway(),{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_CONFIG.publishableKey},body:JSON.stringify({action:'login',profile_id:profile.profile_id,mode:profile.role,password,email,first_connection:first})});
 const result=await response.json().catch(()=>null);
 if(!response.ok || !result?.ok) return toast(result?.error||'Connexion refusée.');
 try{
   const set=await sb.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});
   if(set.error) throw set.error;
   window.supabaseSession=set.data?.session||result.session;
   await v53LoadRemote();
   hideMemberLogin(); syncRoleSelector(); render(); toast('Connexion réussie');
   if(v53.mustChangePassword || first){ if(first) v53.mustChangePassword=true; setTimeout(()=>v55PromptPasswordChange(true),150); }
 }catch(e){
   try{await sb.auth.signOut({scope:'local'});}catch{}
   v53ResetLocalAuth();
   if(e?.code==='V68_FORCE_LOGOUT'){ showMemberLogin('Cette session a été déconnectée par un administrateur. Reconnectez-vous pour continuer.'); toast('Session déconnectée par un administrateur.'); }
   else { console.error('[V90] échec après authentification:', e); toast(`Connexion impossible : ${e?.message||'erreur technique'}`); showMemberLogin(`La connexion a été refusée : ${e?.message||'erreur technique'}`); }
 }
};
function loginMember(){performLogin();}
async function logoutMember(){ const sb=v53Client(); try{if(sb) await sb.auth.signOut({scope:'local'});}catch(e){console.warn(e);} memberLoggedIn=false; staffLoggedIn=false; authState=''; currentRole='member'; window.supabaseSession=null; v53ResetLocalAuth(); if(window.v53){v53.hydrated=false;v53.role=null;v53.memberId=null;v53.displayName='';v53.mustChangePassword=false;} localStorage.removeItem('sportclub-member-auth'); localStorage.removeItem('sportclub-staff-auth'); localStorage.removeItem('sportclub-auth-role'); localStorage.setItem('sportclub-role','member'); closeProfileMenu(); syncRoleSelector(); showMemberLogin(); render(); }

function getCurrentProfile(){
 const m=currentMember();
 if(memberLoggedIn && m) return {type:"member",name:m.name,role:getMemberRole(m),password:m.password||"1234",ref:m};
 if(authState==='admin') return {type:'staff',name:window.v53?.displayName||'Administrateur',role:'admin',password:appUsers.admin?.password||'',ref:appUsers.admin};
 if(authState==='coach') return {type:'staff',name:window.v53?.displayName||'Encadrant',role:'coach',password:appUsers.encadrant?.password||'',ref:appUsers.encadrant};
 return null;
}
function openProfileMenu(){
 if(!authState) return showMemberLogin();
 let menu=document.getElementById("profileMenu");
 if(!menu){ menu=document.createElement("div"); menu.id="profileMenu"; document.body.appendChild(menu); }
 const profile=getCurrentProfile();
 menu.innerHTML=`<div class="profile-menu-card"><div class="profile-menu-head"><div><div class="eyebrow">MON PROFIL</div><h3>${esc(profile?.name||"")}</h3><div class="muted">${esc(ROLE_LABELS[profile?.role]||"")}</div></div><button class="profile-close" onclick="closeProfileMenu()">×</button></div><div class="profile-menu-actions">${currentRole==="member"?`<button class="secondary" onclick="openAdminMessageModal()">Message pour l’administrateur</button>`:""}${currentRole==="coach"?`<button class="secondary" onclick="openCoachExportModal()">Exporter en PDF</button>`:""}<button class="secondary" onclick="openPasswordModal()">Modifier le mot de passe</button><button class="danger" onclick="logoutMember()">Déconnexion</button></div></div>`;
 menu.classList.add("open");
}
function closeProfileMenu(){ const menu=document.getElementById("profileMenu"); if(menu) menu.classList.remove("open"); }
function openPasswordModal(){
 closeProfileMenu();
 let modal=document.getElementById("passwordModal");
 if(!modal){ modal=document.createElement("div"); modal.id="passwordModal"; document.body.appendChild(modal); }
 modal.innerHTML=`<div class="password-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">MON PROFIL</div><h3>Modifier le mot de passe</h3></div><button class="profile-close" onclick="closePasswordModal()">×</button></div><p class="muted">Saisissez votre mot de passe actuel puis choisissez un nouveau mot de passe.</p><label>Mot de passe actuel<input id="currentPassword" type="password" autocomplete="current-password"></label><label>Nouveau mot de passe<input id="newPassword" type="password" autocomplete="new-password"></label><label>Confirmer le nouveau mot de passe<input id="confirmPassword" type="password" autocomplete="new-password"></label><div class="password-modal-actions"><button class="secondary" onclick="closePasswordModal()">Annuler</button><button class="primary" onclick="saveOwnPassword()">Enregistrer</button></div></div>`;
 modal.classList.add("open");
 setTimeout(()=>document.getElementById("currentPassword")?.focus(),0);
}
function closePasswordModal(){ const modal=document.getElementById("passwordModal"); if(modal) modal.classList.remove("open"); }
function saveOwnPassword(){
 const profile=getCurrentProfile(); if(!profile) return;
 const current=String(document.getElementById("currentPassword")?.value||"");
 const next=String(document.getElementById("newPassword")?.value||"");
 const confirm=String(document.getElementById("confirmPassword")?.value||"");
 if(current!==String(profile.password||"")) return toast("Mot de passe actuel incorrect.");
 if(next.length<4) return toast("Le nouveau mot de passe doit contenir au moins 4 caractères.");
 if(next!==confirm) return toast("Les deux nouveaux mots de passe sont différents.");
 profile.ref.password=next;
 if(profile.type==="staff") saveUsers(); else save();
 closePasswordModal();
 toast("Mot de passe modifié avec succès.");
}
function changeMemberPassword(id){
 if(!canManageRoles()) return toast("Seul l'administrateur peut réinitialiser les codes.");
 const m=db.members.find(x=>x.id===Number(id)); if(!m)return;
 if(!confirm(`Réinitialiser le code d'accès de ${m.name} à 1234 ?`)) return;
 m.password="1234"; addActionLog("Réinitialisation du code",m.name); save(); render(); toast("Code d'accès réinitialisé à 1234.");
}
function syncRoleSelector(){
 const profileBtn=document.getElementById("profileBtn"); if(profileBtn) profileBtn.style.display=(authState?"inline-block":"none");
 const nameEl=document.getElementById('currentUserName');
 if(nameEl){
   const profile=getCurrentProfile();
   const name=profile?.name||window.v53?.displayName||'';
   nameEl.textContent=name?`Connecté : ${name}`:'';
   nameEl.style.display=name?'inline-flex':'none';
 }
 const rs=document.getElementById("roleSelect"); if(!rs)return;
 rs.value=currentRole;
 [...rs.options].forEach(o=>{ o.disabled=(o.value!=="member" && authState!==o.value && authState!=="admin"); });
}
function renderDashboard(){
 const weekHero=`<section class="hero">
   <div>
     <p class="eyebrow">PRÉSENCES</p>
     <h1>Semaine du <span id="weekLabel"></span></h1>
     <p>Confirmez les présences et gérez les changements de créneau.</p>
   </div>
   <div class="week-nav">
     <button id="prevWeek">←</button>
     <button id="todayWeek">Cette semaine</button>
     <button id="nextWeek">→</button>
   </div>
 </section>`;
 const stats=SLOT_NAMES.map((n,i)=>{
   const slot=i+1, p=getControlPresence(slot);
   const pendingTarget=db.moves.filter(m=>m.status==='pending'&&Number(m.to)===slot).length;
   return `<div class="stat"><div class="num">${p}/20</div><div class="label">${n} · ${Math.max(0,20-p)} place(s) disponible(s) pour changement</div><div class="muted">${pendingTarget} demande${pendingTarget>1?'s':''} de changement vers ce créneau</div></div>`;
 }).join("");
 const presenceStats=`<section id="stats" class="stats">${stats}</section>`;
 const filter=`<section class="slot-filter">
   <div class="filter-title">Filtrer les créneaux</div>
   <div class="filter-actions">
     <button class="filter-btn ${selectedSlots.size===0?'active':''}" data-slot-filter="all">Tous</button>
     ${SLOT_NAMES.map((name,i)=>{const n=i+1;return `<button class="filter-btn ${selectedSlots.has(n)?'active':''}" data-slot-filter="${n}">${name}</button>`;}).join("")}
   </div>
   <div class="filter-help">Sélectionnez un ou plusieurs créneaux à afficher.</div>
 </section>`;
 const note=`<div class="card role-note">
   <div class="row"><div><strong>${canAdmin()?"Mode administrateur":(canCoach()?"Mode encadrant":"Mode adhérent")}</strong>
   <div class="muted">${canCoach()
     ?"Vous pouvez gérer les présences et les fonctions d’encadrement autorisées."
     :"Vous pouvez modifier uniquement votre propre présence. Les statuts des autres adhérents sont visibles en lecture seule."}</div>
   ${currentRole==="member"?`<div class="muted">Créneau inscrit : <strong>${esc(slotLabel(currentMember()?.slot))}</strong></div>`:""}
   </div>
   ${currentRole==="member"?`<span class="auth-user">${esc(currentMember()?.name||"")}</span>`:""}
   </div></div>`;

 const courseWeek=isAttendanceWeek();
 const absenceCard=currentRole==="member"?renderAbsencePeriodCard():"";
 const slots=sortedSlotNumbers().map(slotNumber=>{
   const name=slotLabel(slotNumber);
   if(selectedSlots.size && !selectedSlots.has(slotNumber)) return "";
   const list=sortByName(db.members.filter(m=>isAdherent(m)&&getEffectiveSlot(m.id)===slotNumber));
   const realSlot=getControlPresence(slotNumber);
   const quota=Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas?.[slotNumber]??30)));
   const quotaPercent=quota>0 ? Math.min(100,list.length/quota*100) : (list.length>0 ? 100 : 0);
   return `<div class="slot"><div class="slot-head"><div><div class="slot-title">${name}</div><div class="capacity">${list.length}/${quota} adhérents · ${realSlot}/20 présents pour contrôle des changements</div><div class="progress"><div style="width:${quotaPercent}%"></div></div></div>
   ${currentRole==="admin"&&courseWeek?`<button class="primary" onclick="notifySlot(${slotNumber})">Rappeler</button>`:""}</div>
   ${courseWeek?list.map(m=>personHtml(m)).join(""):`<div class="empty">Pas de demande de présence : cette semaine n'est ni Cours ni Libre.</div>`}</div>`;
 }).join("");

 const adminDashboard = currentRole === "admin" ? renderRealDashboard() : "";
 document.getElementById("dashboardView").innerHTML=weekHero+presenceStats+filter+note+absenceCard+adminDashboard+slots;
 document.getElementById("weekLabel").textContent=fmt(weekKey());
 document.getElementById("prevWeek").onclick=()=>{weekOffset--;render()};
 document.getElementById("nextWeek").onclick=()=>{weekOffset++;render()};
 document.getElementById("todayWeek").onclick=()=>{weekOffset=0;render()};
 document.querySelectorAll("#dashboardView .filter-btn").forEach(btn=>btn.addEventListener("click",()=>{
   const n=btn.dataset.slotFilter;
   if(n==="all") selectedSlots.clear();
   else { const num=Number(n); if(selectedSlots.has(num)) selectedSlots.delete(num); else selectedSlots.add(num); }
   render();
 }));

}
function renderRealDashboard(){
 const rows=sortedSlotNumbers().map(slot=>{
   const name=slotLabel(slot);
   const list=sortByName(db.members.filter(m=>isAdherent(m)&&getEffectiveSlot(m.id)===slot));
   const present=list.filter(m=>getStatus(m.id)==="present").length;
   const absent=list.filter(m=>getStatus(m.id)==="absent").length;
   const pending=list.filter(m=>getStatus(m.id)==="pending").length;
   const real=getActualAttendance(slot);
   const gap=real-present;
   const gapText=gap===0?"Concordance parfaite":`${gap>0?"+":""}${gap} vs déclarés présents`;
   const gapClass=gap===0?"neutral":gap>0?"positive":"negative";
   return `<div class="real-dashboard-slot">
     <div class="real-dashboard-head"><div><div class="slot-title">${name}</div><div class="muted">${list.length}/${Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas?.[slot]??30)))} adhérents</div></div><div class="real-count"><span class="real-count-number">${real}</span><span class="real-count-label">réel${real>1?"s":""}</span></div></div>
     <div class="real-dashboard-stats">
       <div><strong>${present}</strong><span>Présents déclarés</span></div>
       <div><strong>${absent}</strong><span>Absents</span></div>
       <div><strong>${pending}</strong><span>Réponses en attente</span></div>
       <div class="${gapClass}"><strong>${gap>0?"+":""}${gap}</strong><span>Écart réel / déclarés</span></div>
     </div>
     <div class="real-dashboard-footer"><span class="${gapClass}">${gapText}</span><span>Sur ${list.length} inscrits</span></div>
   </div>`;
 }).join("");
 const totals=db.members.filter(m=>m.active);
 const totalPresent=totals.filter(m=>getStatus(m.id)==="present").length;
 const totalAbsent=totals.filter(m=>getStatus(m.id)==="absent").length;
 const totalPending=totals.filter(m=>getStatus(m.id)==="pending").length;
 const totalReal=SLOT_NAMES.reduce((sum,_,i)=>sum+getActualAttendance(i+1),0);
 const totalGap=totalReal-totalPresent;
 return `<div class="card real-dashboard">
   <div class="real-dashboard-title"><div><p class="eyebrow">SUIVI ADMINISTRATEUR</p><h2>Présence réelle</h2><div class="muted">Le nombre réellement constaté est mis en avant et comparé aux déclarations des adhérents.</div></div><div class="real-total"><span>${totalReal}</span><small>présents réels</small></div></div>
   <div class="real-global"><div><strong>${totalPresent}</strong><span>Présents déclarés</span></div><div><strong>${totalAbsent}</strong><span>Absents</span></div><div><strong>${totalPending}</strong><span>Réponses en attente</span></div><div class="${totalGap===0?"neutral":totalGap>0?"positive":"negative"}"><strong>${totalGap>0?"+":""}${totalGap}</strong><span>Écart réel / présents</span></div></div>
   ${renderAttendanceEvolution(getActualAttendanceHistory())}
   <div class="real-dashboard-grid">${rows}</div>
 </div>`;
}

function renderAttendanceEvolution(history){
 if(!history.length) return `<div class="real-chart evolution-chart"><div class="real-chart-head"><div><strong>Évolution des présences réelles</strong><div class="muted">Saisissez les présences réelles après chaque cours pour alimenter le suivi.</div></div></div><div class="evolution-empty">Aucune donnée historique enregistrée pour le moment.</div></div>`;
 const width=900,height=300,pad={l:42,r:22,t:28,b:48};
 const innerW=width-pad.l-pad.r,innerH=height-pad.t-pad.b;
 const x=i=>history.length===1?pad.l+innerW/2:pad.l+(i/(history.length-1))*innerW;
 const y=v=>pad.t+innerH-(Math.max(0,Math.min(30,Number(v)||0))/30)*innerH;
 const labels=history.map(h=>fmt(h.week).slice(0,5));
 const colors=["chart-line-1","chart-line-2","chart-line-3"];
 const patterns=["evolution-solid","evolution-dash","evolution-dot"];
 const grid=[0,10,20,30].map(v=>{const yy=y(v);return `<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="evolution-grid-line"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="evolution-axis-label">${v}</text>`}).join("");
 const comfortY=y(20);
 const comfortLine=`<line x1="${pad.l}" y1="${comfortY}" x2="${width-pad.r}" y2="${comfortY}" class="evolution-comfort-line"/><text x="${width-pad.r-4}" y="${comfortY-7}" text-anchor="end" class="evolution-comfort-label">20 — seuil sans attente</text>`;
 const xLabels=history.map((h,i)=>{const show=history.length<=8||i===0||i===history.length-1||i%Math.ceil(history.length/6)===0;return show?`<text x="${x(i)}" y="${height-17}" text-anchor="middle" class="evolution-axis-label">${labels[i]}</text>`:""}).join("");
 const series=SLOT_NAMES.map((name,si)=>{const slot=si+1;const points=history.map((h,i)=>`${x(i)},${y(h[slot]??0)}`).join(" ");const dots=history.map((h,i)=>`<circle cx="${x(i)}" cy="${y(h[slot]??0)}" r="4" class="evolution-point ${colors[si]}"><title>${name} — ${labels[i]} : ${h[slot]??0}</title></circle>`).join("");return `<polyline points="${points}" class="evolution-line ${colors[si]} ${patterns[si]}"/>${dots}`}).join("");
 const legend=SLOT_NAMES.map((name,si)=>`<span><i class="chart-dot ${colors[si]} ${patterns[si]}"></i>${name}</span>`).join("");
 return `<div class="real-chart evolution-chart"><div class="real-chart-head"><div><strong>Évolution des présences réelles</strong><div class="muted">Suivi cours après cours, sur une échelle de 0 à 30 personnes.</div></div><div class="chart-legend">${legend}</div></div><div class="evolution-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution des présences réelles par créneau">${grid}${comfortLine}${series}${xLabels}</svg></div></div>`;
}

function normalizeCalendarType(value){
 const text=String(value??'').trim().toLowerCase();
 if(text.includes('cours annul') || text==='cancelled' || text==='cancelled-course') return 'Cours annulé';
 if(text.includes('vacances')) return 'Vacances';
 if(text.includes('férié')||text.includes('ferie')) return 'Férié';
 if(text==='off'||text==='libre'||text.includes('libre')||text.includes('pas de cours')) return 'Libre';
 if(text==='course'||text==='cours'||text.includes('cours')) return 'Cours';
 return null;
}
function eventTypeOf(e){ return normalizeCalendarType(e?.eventType ?? e?.type ?? e?.title ?? e?.name ?? e?.label); }
function eventDisplayTitle(e){ return eventTypeOf(e) || String(e?.title ?? e?.name ?? e?.label ?? '').trim() || 'Événement'; }
function isSpecialEvent(e){ return ['Vacances','Férié','Cours annulé'].includes(eventTypeOf(e)); }
function eventReportDate(e){ return String(e?.reportDate ?? e?.postponedTo ?? e?.dateReport ?? '').slice(0,10); }
function getMemberFollowUpEvents(){
 const seen=new Set(), items=[];
 const add=(date,type)=>{
   const d=String(date||'').slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!type||!isDateInCalendarPeriod(d))return;
   const t=(type==='Libre'||type==='Cours annulé')?'Libre':'Cours';
   const key=d+'|'+t;
   if(seen.has(key))return;
   seen.add(key);
   items.push({date:d,type:t,week:mondayKey(new Date(d+'T12:00:00'))});
 };
 // 1) Les semaines explicitement enregistrées dans le calendrier.
 const weeks=calendarData && calendarData.weeks && typeof calendarData.weeks==='object' ? calendarData.weeks : {};
 Object.entries(weeks).forEach(([key,info])=>{
   const raw=typeof info==='string' ? info : (info?.type ?? info?.label ?? info?.status ?? info?.name ?? '');
   const type=normalizeCalendarType(raw);
   if(type) add(/^\d{4}-\d{2}-\d{2}$/.test(key)?key:(info?.date||info?.startDate||info?.start),type);
 });
 // 2) Les événements explicites du calendrier.
 const events=Array.isArray(calendarData?.events)?calendarData.events:[];
 events.forEach(e=>{
   const type=normalizeCalendarType(e?.eventType ?? e?.title ?? e?.name ?? e?.label ?? e?.type);
   if(type==='Cours' || type==='Libre' || type==='Cours annulé') add(e?.date ?? e?.startDate ?? e?.start,type);
 });
 // 3) Ne pas dépendre de la période sélectionnée : Mon suivi reprend uniquement
 // les dates réellement configurées dans le calendrier ou portant un événement
 // Cours/Libre. Il ne fabrique pas de dates à partir de la semaine courante.
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
}
function isEventDateLockedForMember(memberId,eventDate,key){
 if(currentRole==='admin' || !hasResponded(memberId,key)) return false;
 const today=isoDate(new Date());
 if(eventDate<today) return true;
 if(eventDate>today) return false;
 const now=new Date();
 return now.getHours()>19 || (now.getHours()===19 && now.getMinutes()>=30);
}
async function requestStatusChangeForEvent(memberId,requestedStatus,eventDate,key){
 if(currentRole!=='member') return toast('Cette demande est réservée aux adhérents.');
 if(Number(memberId)!==Number(currentMemberId)) return toast('Vous ne pouvez modifier que votre propre statut.');
 if(!isAttendanceWeek(key)) return toast('Les présences sont demandées uniquement les semaines Cours ou Libre.');
 const m=db.members.find(x=>x.id===Number(memberId)); if(!m)return;
 if(!hasResponded(memberId,key)) return toast('Vous devez avoir une réponse enregistrée avant de demander une modification.');
 const today=isoDate(new Date());
 if(eventDate>today) return toast('Une demande de modification n’est disponible que pour une date passée ou après 19h30 le jour de l’événement.');
 if(eventDate===today){
   const now=new Date();
   if(now.getHours()<19 || (now.getHours()===19&&now.getMinutes()<30)) return toast('La demande sera disponible à partir de 19h30 le jour de l’événement.');
 }
 if(db.statusRequests.some(r=>Number(r.memberId)===Number(memberId)&&r.week===key&&r.status==='pending')) return toast('Une demande de modification est déjà en attente.');
 db.statusRequests.push({id:Date.now(),memberId:Number(memberId),name:m.name,week:key,eventDate,requestedStatus,status:'pending',createdAt:Date.now()});
 save();
 try{ await v53SyncRemote(); }catch(e){ return; }
 render();toast('Demande de modification envoyée à l’administrateur.');
}
function memberHistoryRow(event,me){
 const {date:eventDate,type,week:weekKey}=event;
 const st=getStatusForWeek(me.id,weekKey);
 const labels={present:'Présent',absent:'Absent',pending:'À confirmer'};
 const today=isoDate(new Date());
 const past=eventDate<today;
 const locked=isEventDateLockedForMember(me.id,eventDate,weekKey);
 const request=(past||locked) && hasResponded(me.id,weekKey);
 const pendingReq=(db.statusRequests||[]).find(r=>Number(r.memberId)===Number(me.id)&&r.week===weekKey&&r.status==='pending');
 const effectiveSlot=getEffectiveSlot(me.id,weekKey);
 const approvedMove=getWeekMoves(weekKey).filter(r=>Number(r.memberId)===Number(me.id)&&r.status==='approved').sort((a,b)=>Number(b.approvedAt||b.createdAt||b.id||0)-Number(a.approvedAt||a.createdAt||a.id||0))[0];
 const latestMove=getVisibleMoveForMember(me.id,weekKey);
 const slotInfo=approvedMove&&effectiveSlot?`<span class="history-slot">Créneau effectif : ${SLOT_NAMES[effectiveSlot-1]}</span>`:'';
 const moveRequestInfo=latestMove?`<div class="request-pending member-slot-request-status">🔄 <strong>Demande de changement de créneau : ${slotRequestStatusLabel(latestMove.status)}</strong> · ${SLOT_NAMES[Number(latestMove.from)-1]||slotLabel(latestMove.from)} → ${SLOT_NAMES[Number(latestMove.to)-1]||slotLabel(latestMove.to)}${latestMove.status==='approved'?` · créneau effectif : ${SLOT_NAMES[effectiveSlot-1]||slotLabel(effectiveSlot)}`:''}</div>`:'';
 const moveOptions=SLOT_NAMES.map((name,i)=>i+1).filter(slot=>slot!==Number(me.slot));
 const moveRequestActions=(!past&&!locked && st==='present' && !latestMove)?`<div class="member-history-slot-change"><span class="member-history-slot-change-label">🔄 Demander un changement de créneau :</span><div class="history-actions member-slot-change-actions">${moveOptions.map(slot=>`<button class="history-slot-choice" onclick="requestSlotForWeek(${me.id},${slot},'${weekKey}')">${SLOT_NAMES[slot-1]}</button>`).join('')}</div></div>`:'';
 const absencePeriod=(db.absencePeriods||[]).find(a=>Number(a.memberId)===Number(me.id)&&a.start<=weekKey&&a.end>=weekKey);
 const absenceIndicator=absencePeriod?`<div class="absence-warning" title="Une période d’absence couvre cette semaine.">⚠️ <strong>Période d’absence active</strong><span> · ${fmt(absencePeriod.start)} → ${fmt(absencePeriod.end)}</span></div>`:'';
 const statusButtons=`<div class="history-actions"><button class="${st==='present'?'primary':''}" onclick="setStatusForWeek(${me.id},'present','${weekKey}')">Présent</button><button class="${st==='absent'?'danger':''}" onclick="setStatusForWeek(${me.id},'absent','${weekKey}')">Absent</button><button class="${st==='pending'?'secondary':''}" onclick="setStatusForWeek(${me.id},'pending','${weekKey}')">À confirmer</button></div>`;
 const requestButtons=`<div class="history-actions"><span class="muted">Demander une modification :</span><button onclick="requestStatusChangeForEvent(${me.id},'present','${eventDate}','${weekKey}')">Présent</button><button onclick="requestStatusChangeForEvent(${me.id},'absent','${eventDate}','${weekKey}')">Absent</button><button onclick="requestStatusChangeForEvent(${me.id},'pending','${eventDate}','${weekKey}')">À confirmer</button></div>`;
 const pendingLabel=pendingReq?`<div class="muted request-pending">⏳ Statut demandé : <strong>${labels[pendingReq.requestedStatus]}</strong> — en attente de validation</div>`:'';
 const controls=(!past&&!locked)?statusButtons:(past?`<div class="muted">Statut historique — modification directe réservée à l’administrateur</div>${request?(pendingReq?pendingLabel:requestButtons):`<div class="muted">Aucune réponse enregistrée : aucune demande de modification à envoyer.</div>`}`:`<div class="muted">Statut verrouillé après 19h30</div>${request?(pendingReq?pendingLabel:requestButtons):``}`);
 const historyControls=controls+moveRequestActions;
 return `<div class="history-row"><div class="history-date"><strong>${fmt(eventDate)}</strong><span class="history-type">${type}</span>${slotInfo}${moveRequestInfo}${absenceIndicator}</div><div class="status ${st}"><span class="dot"></span>${labels[st]}</div><div class="history-control">${historyControls}</div></div>`;
}
if(!db.sessionObjectives||typeof db.sessionObjectives!=='object') db.sessionObjectives={};
function getCourseDates(){
 const seen=new Set(), items=[];
 const add=date=>{
   const d=String(date||'').slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!isDateInCalendarPeriod(d)||seen.has(d))return;
   seen.add(d); items.push(d);
 };
 const weeks=calendarData?.weeks&&typeof calendarData.weeks==='object'?calendarData.weeks:{};
 Object.entries(weeks).forEach(([key,info])=>{
   const raw=typeof info==='string'?info:(info?.type??info?.label??info?.status??info?.name??'');
   if(normalizeCalendarType(raw)==='Cours') add(/^\d{4}-\d{2}-\d{2}$/.test(key)?key:(info?.date||info?.startDate||info?.start));
 });
 const events=Array.isArray(calendarData?.events)?calendarData.events:[];
 events.forEach(e=>{
   const type=normalizeCalendarType(e?.eventType??e?.title??e?.name??e?.label??e?.type);
   if(type==='Cours') add(e?.date??e?.startDate??e?.start);
 });
 return items.sort();
}
function getObjectiveComments(date){
 return (Array.isArray(db.objectiveComments)?db.objectiveComments:[]).filter(c=>c.date===date).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
}
function getObjectiveReactions(date){
 return (Array.isArray(db.objectiveReactions)?db.objectiveReactions:[]).filter(r=>r.date===date);
}
function setObjectiveReaction(date,reaction){
 const me=currentMember();
 if(!me || currentRole!=='member') return toast('Réservé aux adhérents.');
 const objectiveStatus=getStatusForWeek(me.id,mondayKey(new Date(date+'T12:00:00')));
 if(objectiveStatus!=='present') return toast('Vous devez être indiqué Présent pour réagir à l’objectif.');
 if(!['up','down'].includes(reaction)) return;
 if(!Array.isArray(db.objectiveReactions)) db.objectiveReactions=[];
if(!db.coachNotesByDate || typeof db.coachNotesByDate!=='object') db.coachNotesByDate={};
if(!Array.isArray(db.adminMessages)) db.adminMessages=[];
if(!db.notificationPrograms || typeof db.notificationPrograms!=='object') db.notificationPrograms={};
if(!db.manualNotification || typeof db.manualNotification!=='object') db.manualNotification={content:'',recipients:{member:true,coach:true,admin:true}};
if(!db.informationBanner || typeof db.informationBanner!=='object') db.informationBanner={active:false,content:''};
if(!db.adminRequestVisibility || typeof db.adminRequestVisibility!=='object') db.adminRequestVisibility={cancelled:false,rejected:false};
 db.objectiveReactions=db.objectiveReactions.filter(r=>!(r.date===date&&Number(r.memberId)===Number(me.id)));
 db.objectiveReactions.push({date,memberId:me.id,reaction,createdAt:Date.now()});
 save(); renderObjectives();
}
function addObjectiveComment(date){
 const me=currentMember();
 if(!me || currentRole!=='member') return toast("Réservé aux adhérents.");
 const input=document.getElementById("objective-comment-"+date);
 const anon=document.getElementById("objective-anon-"+date);
 const text=String(input?.value||"").trim();
 if(!text) return toast("Écrivez un commentaire.");
 db.objectiveComments.push({id:Date.now(),date,memberId:me.id,memberName:me.name,text,anonymous:!!anon?.checked,createdAt:Date.now()});
 save(); renderObjectives(); toast("Commentaire ajouté.");
}
function setSessionObjective(date,value){
 if(!canCoach())return toast('Réservé à l’encadrement.');
 if(!db.sessionObjectives||typeof db.sessionObjectives!=='object')db.sessionObjectives={};
 db.sessionObjectives[date]=String(value||'').trim();
 save();
 toast('Objectif de séance enregistré.');
}

function renderObjectives(){
 const el=document.getElementById("objectivesView");
 if(!el)return;
 const dates=getCourseDates();
 const objectives=(db.sessionObjectives&&typeof db.sessionObjectives==='object')?db.sessionObjectives:{};
 if(!dates.length){ el.innerHTML=`<div class="card empty">Aucune date de cours dans le calendrier.</div>`; return; }
 if(canCoach() && currentRole==='coach'){
   el.innerHTML=`<div class="card member-history-head"><div><p class="eyebrow">OBJECTIFS</p><h2>Objectifs des séances</h2><div class="muted">Les objectifs saisis dans Mon suivi et les commentaires des adhérents.</div></div><div class="history-summary"><strong>${dates.length}</strong><span>cours</span></div></div><div class="card history-list objective-list">${dates.map(date=>{ const comments=getObjectiveComments(date); const wk=mondayKey(new Date(date+'T12:00:00')); const ac=db.members.filter(m=>m.active); const pc=ac.filter(m=>getStatusForWeek(m.id,wk)==='present').length, ab=ac.filter(m=>getStatusForWeek(m.id,wk)==='absent').length, pe=ac.filter(m=>getStatusForWeek(m.id,wk)==='pending').length; return `<div class="objective-row"><div class="objective-head"><div class="history-date"><strong>${fmt(date)}</strong><span class="history-type">Cours</span></div><div class="objective-presence-summary">Présents ${pc} · Absents ${ab} · À confirmer ${pe}</div></div><div class="objective-text">${objectives[date]?esc(objectives[date]).replace(/\n/g,'<br>'):'<span class="muted">Aucun objectif renseigné.</span>'}</div><div class="objective-reaction-summary">${(()=>{const rr=getObjectiveReactions(date);return `👍 ${rr.filter(r=>r.reaction==='up').length} · 👎 ${rr.filter(r=>r.reaction==='down').length}`;})()}</div><div class="objective-comments"><strong>Commentaires des adhérents (${comments.length})</strong>${comments.length?comments.map(c=>`<div class="objective-comment"><div><strong>${c.anonymous?'Anonyme':esc(c.memberName||'Adhérent')}</strong><span class="muted"> · ${new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(safeDate(c.createdAt||Date.now())||new Date())}</span></div><div>${esc(c.text).replace(/\n/g,'<br>')}</div></div>`).join(''):'<div class="muted">Aucun commentaire.</div>'}</div></div>`; }).join('')}</div>`;
   return;
 }
 if(currentRole!=='member'){el.innerHTML='';return;}
 el.innerHTML=`<div class="card member-history-head"><div><p class="eyebrow">OBJECTIFS</p><h2>Objectifs des séances</h2><div class="muted">Consultez l’objectif de chaque cours et partagez votre retour.</div></div><div class="history-summary"><strong>${dates.length}</strong><span>cours</span></div></div><div class="objective-member-list">${dates.map(date=>{ const comments=getObjectiveComments(date); const objectiveStatus=getStatusForWeek(currentMemberId,mondayKey(new Date(date+'T12:00:00'))); const objectiveStatusLabel={present:'Présent',absent:'Absent',pending:'À confirmer'}[objectiveStatus]; const reactions=getObjectiveReactions(date); const myReaction=reactions.find(r=>Number(r.memberId)===Number(currentMemberId))?.reaction||''; const ups=reactions.filter(r=>r.reaction==='up').length, downs=reactions.filter(r=>r.reaction==='down').length; return `<div class="card objective-card"><div class="objective-card-head"><div class="history-date"><strong>${fmt(date)}</strong><span class="history-type">Cours</span></div><div class="status ${objectiveStatus}"><span class="dot"></span>${objectiveStatusLabel}</div></div><div class="objective-text">${objectives[date]?esc(objectives[date]).replace(/\n/g,'<br>'):'<span class="muted">Objectif pas encore renseigné.</span>'}</div><div class="objective-reactions"><button class="reaction-btn reaction-up ${myReaction==='up'?'selected':''}" ${objectiveStatus!=='present'?'disabled':''} onclick="setObjectiveReaction('${date}','up')" title="${objectiveStatus==='present'?'Pouce levé':'Disponible uniquement si vous êtes Présent'}">👍 <span>${ups}</span></button><button class="reaction-btn reaction-down ${myReaction==='down'?'selected':''}" ${objectiveStatus!=='present'?'disabled':''} onclick="setObjectiveReaction('${date}','down')" title="${objectiveStatus==='present'?'Pouce baissé':'Disponible uniquement si vous êtes Présent'}">👎 <span>${downs}</span></button></div><div class="objective-comments"><strong>Commentaires (${comments.length})</strong>${comments.length?comments.map(c=>`<div class="objective-comment"><div><strong>${c.anonymous?'Anonyme':esc(c.memberName||'Adhérent')}</strong></div><div>${esc(c.text).replace(/\n/g,'<br>')}</div></div>`).join(''):'<div class="muted">Aucun commentaire pour le moment.</div>'}</div><div class="objective-comment-form"><textarea id="objective-comment-${date}" rows="2" placeholder="Votre commentaire..."></textarea><label class="checkbox-line"><input type="checkbox" id="objective-anon-${date}"> Commenter anonymement</label><button class="primary" onclick="addObjectiveComment('${date}')">Ajouter le commentaire</button></div></div>`; }).join('')}</div>`;
}

function setCoachNote(date,value){
 if(!canCoach()||currentRole!=='coach') return toast("Réservé à l'encadrement.");
 if(!db.coachNotesByDate||typeof db.coachNotesByDate!=='object') db.coachNotesByDate={};
 db.coachNotesByDate[String(date)]=String(value||'');
 addActionLog("Modification d'une note privée",String(date));
 save();
}
function renderCoachFollowUp(){
 const el=document.getElementById("member-historyView");
 if(!el)return;
 if(!canCoach()){el.innerHTML="";return;}
 const dates=getCourseDates();
 const notes=db.coachNotesByDate&&typeof db.coachNotesByDate==='object'?db.coachNotesByDate:{};
 const rows=dates.map(date=>{ const objective=db.sessionObjectives?.[date]||''; return `<div class="card coach-followup-date-row"><div class="coach-followup-date-head"><div><p class="eyebrow">${fmt(date)}</p><h3>Objectif de séance</h3></div><span class="muted">Note privée encadrement</span></div><div class="coach-followup-fields"><div><textarea rows="4" placeholder="Objectif de la séance..." onchange="setSessionObjective('${date}',this.value)">${esc(objective)}</textarea></div><div><textarea rows="4" placeholder="Note privée pour l'encadrement..." onchange="setCoachNote('${date}',this.value)">${esc(notes[date]||'')}</textarea><div class="muted private-note-help">Cette note est visible uniquement par l'encadrement.</div></div></div></div>`; }).join('');
 el.innerHTML=`<div class="card"><p class="eyebrow">MON SUIVI</p><h2>Suivi de l'encadrement</h2><div class="muted">Les objectifs et notes sont organisés par date de séance, indépendamment du créneau sélectionné.</div></div>${rows||'<div class="empty">Aucune séance configurée dans le calendrier.</div>'}`;
}

function renderMemberHistory(){
 const el=document.getElementById('member-historyView');
 if(!el)return;
 if(canCoach() && currentRole==='coach'){ renderCoachFollowUp(); return; }
 if(currentRole!=='member'){el.innerHTML='';return;}
 const me=currentMember();
 if(!me){el.innerHTML=`<div class="card empty">Aucun adhérent connecté.</div>`;return;}
 const events=getMemberFollowUpEvents();
 const stats=(type)=>{const a=events.filter(e=>e.type===type);const c={present:0,absent:0,pending:0};a.forEach(e=>c[getStatusForWeek(me.id,e.week)]++);return {...c,total:a.length};};
 const course=stats('Cours'), libre=stats('Libre');
 const statCard=(title,x)=>`<div class="stat-card"><strong>${x.total}</strong><span>${title}</span><div class="stat-mini"><span>Présent <b>${x.present}</b></span><span>Absent <b>${x.absent}</b></span><span>À confirmer <b>${x.pending}</b></span></div></div>`;
 el.innerHTML=`<div class="card member-history-head"><div><p class="eyebrow">MON SUIVI</p><h2>Mes cours et mes présences</h2><div class="muted">Créneau habituel : <strong>${esc(slotLabel(me.slot))}</strong></div><div class="muted">Toutes les dates configurées dans le calendrier avec <strong>Cours</strong> ou <strong>Libre</strong>.</div></div><div class="history-summary"><strong>${events.length}</strong><span>dates</span></div></div>
 <div class="stats-grid">${statCard('Cours',course)}${statCard('Libre',libre)}</div>
 <div class="card history-list"><div class="history-legend"><span><i class="status-dot present"></i> Présent</span><span><i class="status-dot absent"></i> Absent</span><span><i class="status-dot pending"></i> À confirmer</span><span class="muted">Les dates futures sont modifiables directement.</span></div>${events.length?events.map(e=>memberHistoryRow(e,me)).join(''):`<div class="empty">Aucune date Cours ou Libre dans le calendrier.</div>`}</div>`;
}
function renderAbsencePeriodCard(){
 const me=currentMember();
 if(!me) return "";
 const periods=db.absencePeriods.filter(a=>Number(a.memberId)===Number(me.id)).sort((a,b)=>a.start.localeCompare(b.start));
 return `<div class="card absence-card"><div class="row"><div><h2>Absence sur une période</h2><div class="muted">Définissez une période pendant laquelle vous serez absent. Vos présences seront automatiquement indiquées comme absentes sur les semaines concernées.</div></div><button class="primary" onclick="addAbsencePeriod()">+ Définir une période</button></div>${periods.length?`<div class="absence-list">${periods.map(a=>`<div class="absence-item"><span>${fmt(a.start)} → ${fmt(a.end)}</span><button class="danger" onclick="removeAbsencePeriod(${a.id})">Supprimer</button></div>`).join("")}</div>`:`<div class="empty">Aucune période d’absence définie.</div>`}</div>`;
}
function addAbsencePeriod(){
 const me=currentMember(); if(!me)return;
 const start=prompt("Début de l'absence (AAAA-MM-JJ) :",isoDate(new Date())); if(!start)return;
 const end=prompt("Fin de l'absence (AAAA-MM-JJ) :",start); if(!end)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return toast("Période invalide. Utilisez AAAA-MM-JJ avec un début avant la fin.");
 db.absencePeriods.push({id:Date.now(),memberId:me.id,start,end});
 save();render();toast("Période d'absence enregistrée.");
}
function removeAbsencePeriod(id){
 const me=currentMember();
 const a=db.absencePeriods.find(x=>x.id===id&&Number(x.memberId)===Number(me?.id));
 if(!a)return;
 if(confirm(`Supprimer l'absence du ${fmt(a.start)} au ${fmt(a.end)} ?`)){db.absencePeriods=db.absencePeriods.filter(x=>x.id!==id);save();render();toast("Période d'absence supprimée.");}
}

function presenceDisplayName(name){
 const text=String(name||"").trim();
 if(!text) return "";
 const parts=text.split(/\s+/).filter(Boolean);
 if(parts.length===1) return parts[0];
 // Les données peuvent être saisies « Prénom Nom » ou « NOM Prénom ».
 // Dans les deux cas, on affiche uniquement Prénom + initiale du nom.
 let firstName, lastName;
 if(parts[0]===parts[0].toUpperCase() && parts[0]!==parts[0].toLowerCase()){
   lastName=parts[0];
   firstName=parts.slice(1).join(" " );
 }else{
   lastName=parts[parts.length-1];
   firstName=parts.slice(0,-1).join(" " );
 }
 return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
}
function isPresenceAnonymousMode(){
 // Le sélecteur de mode est la source de vérité lorsque l'administrateur
 // ou l'encadrant bascule temporairement en mode Adhérent.
 const selector=document.getElementById("roleSelect");
 return selector ? selector.value==="member" : currentRole==="member";
}
function personHtml(m){
 const key=weekKey();
 const st=getStatus(m.id), labels={present:"Présent",absent:"Absent",pending:"À confirmer"};
 const editable=canEditAttendanceForDate(m.id,key);
 const locked=!canCoach() && isStatusLockedAt1930(m.id,key);
 const move=getMoveForMember(m.id);
 const latestMove=getVisibleMoveForMember(m.id,key);
 const absencePeriod=isMemberAbsentByPeriod(m.id,key);
 const otherSlots=SLOT_NAMES.map((name,i)=>i+1).filter(slot=>slot!==m.slot);
 const moveLabel=latestMove?`<span class="request-pending">🔄 Demande de changement : <strong>${slotRequestStatusLabel(latestMove.status)}</strong> · ${SLOT_NAMES[Number(latestMove.from)-1]||slotLabel(latestMove.from)} → ${SLOT_NAMES[Number(latestMove.to)-1]||slotLabel(latestMove.to)}${latestMove.status==="approved"?` · créneau effectif : ${SLOT_NAMES[getEffectiveSlot(m.id,key)-1]||slotLabel(getEffectiveSlot(m.id,key))}`:""}</span>`:"";
 const absenceIndicator=absencePeriod?`<div class="absence-warning" title="Une période d’absence couvre cette semaine.">⚠️ <strong>Période d’absence active</strong><span> · ${fmt(absencePeriod.start)} → ${fmt(absencePeriod.end)}</span></div>`:"";
 const eventDate=getAttendanceEventDate(key);
 const statusRequest=db.statusRequests.find(r=>Number(r.memberId)===Number(m.id)&&r.week===key&&(!r.eventDate||!eventDate||r.eventDate===eventDate)&&r.status==="pending");
 const staffCanEdit=authState==="admin"||authState==="coach";
 const actions=(staffCanEdit || (editable && isAttendanceWeek() && !locked))
   ? `<div class="actions">
       <button onclick="setStatus(${m.id},'present')">Présent</button>
       <button class="${st==='absent'?'danger':''}" onclick="setStatus(${m.id},'absent')">Absent</button>
       <button onclick="setStatus(${m.id},'pending')">À confirmer</button>
     </div>`
   : (locked
      ? `<div class="muted">Réponse verrouillée après 19h30</div>${statusRequest?`<div class="muted request-pending">⏳ Modification demandée — en attente de validation</div>`:""}`
      : (isPastWeek(key) && hasResponded(m.id,key)
         ? `<div class="muted">Date passée — statut verrouillé</div>${statusRequest?`<div class="muted request-pending">⏳ Modification demandée — en attente de validation</div>`:""}`
         : `<div class="muted">${isPastWeek(key) ? "Date passée — modification directe réservée à l’administrateur" : "Lecture seule"}</div>`));
 const slotActions=(staffCanEdit || (editable && isAttendanceWeek() && !locked))
   && st!=="absent"&&!move
   ? `<div class="slot-request"><span class="muted">Présent mais souhaite jouer sur :</span>${otherSlots.map(slot=>`<button onclick="requestSlot(${m.id},${slot})">${SLOT_NAMES[slot-1]}</button>`).join("")}</div>` : "";
 return `<div class="person">
   <div><div class="name">${esc(isPresenceAnonymousMode()?presenceDisplayName(m.name):m.name)}${Number(m.id)===currentMemberId?' <span class="you">Vous</span>':''}</div><div class="muted">Créneau habituel : ${esc(slotLabel(m.slot))} · vient au créneau ${esc(slotLabel(getEffectiveSlot(m.id)))} cette semaine · ${getChangeCount(m.id)} changement${getChangeCount(m.id)>1?"s":""}</div>${absenceIndicator}</div>
   <div class="status ${st}"><span class="dot"></span>${labels[st]}</div>
   <div class="muted">${moveLabel || (st==="pending"?"À confirmer":"Réponse enregistrée")}</div>
   ${actions}
   ${slotActions}
 </div>`;
}
async function requestStatusChange(memberId,requestedStatus){
 const key=weekKey();
 if(isMemberAbsentByPeriod(memberId,key)) return toast(ABSENCE_PERIOD_MESSAGE);
 if(currentRole!=="member") return toast("Cette demande est réservée aux adhérents.");
 if(!isAttendanceWeek()) return toast("Les présences sont demandées uniquement les semaines Cours ou Libre.");
 const m=db.members.find(x=>x.id===Number(memberId));
 if(!m || Number(memberId)!==currentMemberId) return toast("Vous ne pouvez modifier que votre propre statut.");
 if(!hasResponded(memberId,key)) return toast("Vous devez avoir une réponse enregistrée avant de demander une modification.");

 const eventDate=getAttendanceEventDate(key);
 const today=isoDate(new Date());
 const past=isPastWeek(key);

 // Pour une date passée, la demande reste possible à tout moment.
 // Pour la date du jour, elle n'est possible qu'après 19h30.
 // Une date future ne permet pas d'envoyer une demande de modification.
 if(past){
   // autorisé : le statut sera soumis à validation administrative
 } else {
   if(!eventDate || eventDate!==today) return toast("La demande est disponible le jour de l'événement, après 19h30.");
   const now=new Date();
   if(now.getHours()<19 || (now.getHours()===19 && now.getMinutes()<30)) return toast("La demande sera disponible à partir de 19h30 le jour de l'événement.");
 }

 if(db.statusRequests.some(r=>r.memberId===Number(memberId)&&r.week===key&&r.status==="pending")) return toast("Une demande de modification est déjà en attente.");
 db.statusRequests.push({id:Date.now(),memberId:Number(memberId),name:m.name,week:key,requestedStatus,status:"pending"});
 save();
 try{ await v53SyncRemote(); }catch(e){ return; }
 render();toast("Demande de modification envoyée à l'administrateur.");
}
function requestSlotForWeek(memberId,to,key=weekKey()){
 if(isMemberAbsentByPeriod(memberId,key)) return toast(ABSENCE_PERIOD_MESSAGE);
 if(!isAttendanceWeek(key)) return toast("Les demandes de changement sont disponibles uniquement les semaines Cours ou Libre.");
 const m=db.members.find(x=>x.id===Number(memberId));
 if(!m||!canEditAttendanceForDate(memberId,key)) return toast("Les dates passées ne peuvent plus être modifiées par les adhérents.");
 if(!canCoach() && isStatusLockedAt1930(memberId,key)) return toast("Votre réponse est verrouillée après 19h30. La demande de créneau n'est plus disponible.");
 if(to===Number(m.slot)) return toast("Choisissez un autre créneau.");
 if(getStatusForWeek(memberId,key)==="absent") return toast("Indiquez d’abord que vous êtes présent.");
 if(getMoveForMember(memberId,key)) return toast("Une demande de changement existe déjà pour cette semaine.");
 const occupied=getControlPresence(to,key);
 if(occupied>=20) return toast(`Impossible : ${SLOT_NAMES[to-1]} compte déjà ${occupied} présents.`);
 db.moves.push({id:Date.now(),memberId:Number(memberId),name:m.name,from:m.slot,to,week:key,status:"pending"});
 save();render();toast(`Demande pour ${SLOT_NAMES[to-1]} créée. Elle sera traitée selon la priorité des changements.`);
}
function requestSlot(memberId,to){ return requestSlotForWeek(memberId,to,weekKey()); }

function isoDate(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`} 
ensureCalendarCourseMondays();
function mondayKey(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return isoDate(x)}
function weekInfo(key){return calendarData.weeks[key]||{type:"course",label:"Cours"}}
function hasCalendarEventForWeek(key,title){
 const monday=key;
 return calendarData.events.some(e=>e.title&&e.title.trim().toLowerCase()===title&&mondayKey(new Date(e.date+"T12:00:00"))===monday);
}
function isCourseWeek(key=weekKey()){
 const info=weekInfo(key);
 return info.type==="course" || hasCalendarEventForWeek(key,"cours");
}
function isLibreWeek(key=weekKey()){
 const info=weekInfo(key);
 return info.type==="off" || info.type==="cancelled" || hasCalendarEventForWeek(key,"libre") || hasCalendarEventForWeek(key,"cours annulé");
}
function isAttendanceWeek(key=weekKey()){
 return isCourseWeek(key) || isLibreWeek(key);
}
function renderCalendar(){
 clampCalendarCursor();
 const y=calendarCursor.getFullYear(),mo=calendarCursor.getMonth(),first=new Date(y,mo,1);
 const start=new Date(y,mo,1);start.setDate(start.getDate()-(start.getDay()||7)+1);
 const end=new Date(y,mo+1,0);end.setDate(end.getDate()+(7-(end.getDay()||7)));
 const p=getCalendarPeriod();
 let cells=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(n=>`<div class="cal-head">${n}</div>`).join("");
 for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
   const date=new Date(d),key=isoDate(date);
   if(!isDateInCalendarPeriod(key)) { cells+=`<div class="cal-day period-outside"></div>`; continue; }
   const wk=mondayKey(date),info=weekInfo(wk);
   const events=calendarData.events.filter(e=>e.date===key);
   const cls=(date.getMonth()!==mo?"other ":"")+(key===isoDate(new Date())?"today":"");
   const isMonday=date.getDay()===1;
   const tag=isMonday
     ? (info.type==="holiday"?`<span class="week-tag week-holiday">Vacances</span>`:
        info.type==="public-holiday"?`<span class="week-tag week-public-holiday">Férié</span>`:
        info.type==="off"?`<span class="week-tag week-off">Libre</span>`:
        info.type==="cancelled"?`<span class="week-tag week-cancelled">Cours annulé</span>`:
        `<span class="week-tag week-course">Cours</span>`)
     : "";
   cells+=`<div class="cal-day ${cls}">
     <div class="day-number">${date.getDate()}</div>
     ${tag}
     ${events.map(e=>`<div class="event" title="${esc(eventDisplayTitle(e))}">🔵 ${esc(eventDisplayTitle(e))}${eventTypeOf(e)==='Cours annulé'&&eventReportDate(e)?` → report ${esc(fmt(eventReportDate(e)))}`:''}</div>`).join("")}
   </div>`;
 }
 const minMonth=new Date(p.start+"T12:00:00");
 const maxMonth=new Date(p.end+"T12:00:00");
 const cursorMonth=new Date(y,mo,1);
 const prevDisabled=cursorMonth<=new Date(minMonth.getFullYear(),minMonth.getMonth(),1);
 const nextDisabled=cursorMonth>=new Date(maxMonth.getFullYear(),maxMonth.getMonth(),1);
 document.getElementById("calendarView").innerHTML=`
 <div class="calendar-toolbar"><div><h2>${safeDate(first)?new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(first):"Calendrier"}</h2><div class="muted">Période : <strong>${fmt(p.start)} au ${fmt(p.end)}</strong>. Le statut de la semaine est affiché uniquement le lundi.</div></div><div class="week-nav"><button onclick="calendarPrev()" ${prevDisabled?"disabled":""}>←</button><button onclick="calendarToday()">Aujourd'hui</button><button onclick="calendarNext()" ${nextDisabled?"disabled":""}>→</button></div></div>
 <div class="calendar"><div class="calendar-grid">${cells}</div></div>
 <div class="legend"><span>🟢 Cours</span><span>⚪ Libre</span><span>🟠 Vacances</span><span>🔴 Férié</span><span>🔵 Événement</span></div>`;
}
function saveCalendarPeriod(){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 const start=document.getElementById("calendarPeriodStart")?.value;
 const end=document.getElementById("calendarPeriodEnd")?.value;
 if(!start||!end||start>end) return toast("Période invalide : la date de début doit précéder la date de fin.");
 calendarData.period={start,end};
 ensureCalendarCourseMondays();
 clampCalendarCursor();
 saveCalendar();renderCalendar();renderMemberHistory();
 toast(`Période du calendrier enregistrée : ${fmt(start)} au ${fmt(end)}.`);
}
function addEventFromForm(){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 const title=document.getElementById("calendarEventTitle")?.value?.trim();
 const date=document.getElementById("calendarEventStart")?.value;
 const endDate=document.getElementById("calendarEventEnd")?.value || date;
 const everyOtherWeek=!!document.getElementById("calendarEventAlternate")?.checked;
 if(!title) return toast("Saisissez le nom de l'événement.");
 if(!date||!endDate||date>endDate||!isDateInCalendarPeriod(date)||!isDateInCalendarPeriod(endDate)) return toast("Période invalide ou hors du calendrier.");
 if(everyOtherWeek && date===endDate) return toast("Pour une seule date, décochez « Une semaine sur deux ».");
 const normalized=normalizeCalendarType(title);
 const type=['Cours','Libre','Vacances','Férié','Cours annulé'].includes(normalized) ? normalized : title;
 let created=0;
 const first=new Date(date+"T12:00:00"), last=new Date(endDate+"T12:00:00");
 for(let d=new Date(first), index=0; d<=last; d.setDate(d.getDate()+7), index++){
   if(everyOtherWeek && index%2===1) continue;
   const eventDate=isoDate(d);
   if(!isDateInCalendarPeriod(eventDate)) continue;
   calendarData.events.push({id:Date.now()+created,date:eventDate,eventType:type,title:type,reportDate:null});
   created++;
 }
 if(!created) return toast("Aucun événement n'a pu être ajouté dans la période sélectionnée.");
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();
 document.getElementById("calendarEventTitle").value="";
 document.getElementById("calendarEventStart").value=date;
 document.getElementById("calendarEventEnd").value=date;
 document.getElementById("calendarEventAlternate").checked=false;
 toast(`${created} événement${created>1?'s':''} ajouté${created>1?'s':''}${everyOtherWeek?' (une semaine sur deux)':''}.`);
}
function addEvent(){
 const date=prompt("Date de début de l'événement (AAAA-MM-JJ) :");
 if(!date)return;
 addEventForDate(date,true);
}
function addEventForDate(date,withPeriodPrompt=false){
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!isDateInCalendarPeriod(date))return toast("Date hors de la période du calendrier.");
 let endDate=date;
 let everyOtherWeek=false;
 if(withPeriodPrompt){
   const end=prompt("Date de fin de la période (AAAA-MM-JJ). Pour un seul jour, laissez la date de début :",date);
   if(!end)return;
   endDate=end.trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||!isDateInCalendarPeriod(endDate)||endDate<date)return toast("Période invalide ou hors du calendrier.");
   if(endDate!==date){
     const recurrence=prompt("Récurrence : saisir '1' pour toutes les semaines ou '2' pour une semaine sur deux.","1");
     if(recurrence===null)return;
     if(recurrence.trim()!=="1" && recurrence.trim()!=="2")return toast("Récurrence invalide.");
     everyOtherWeek=recurrence.trim()==="2";
   }
 }
 const raw=prompt("Nom / type de l'événement (libre) : vous pouvez saisir un texte personnalisé.", "");
 if(!raw || !raw.trim())return;
 const label=raw.trim();
 const normalized=normalizeCalendarType(label);
 const type=['Cours','Libre','Vacances','Férié','Cours annulé'].includes(normalized) ? normalized : label;
 let reportDate=null;
 if(type==='Cours annulé'){
   if(endDate!==date){
     toast("Pour une période de plusieurs dates, le report d'un 'Cours annulé' doit être renseigné séparément après création.");
   } else {
     reportDate=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :", "");
     if(reportDate && reportDate.trim().toLowerCase()!=='attente') {
       reportDate=reportDate.trim();
       if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!isDateInCalendarPeriod(reportDate))return toast("Date de report hors de la période du calendrier.");
     } else reportDate=null;
   }
 }
 const first=new Date(date+"T12:00:00");
 const last=new Date(endDate+"T12:00:00");
 let index=0;
 for(let d=new Date(first);d<=last;d.setDate(d.getDate()+7)){ 
   if(everyOtherWeek && index%2===1){ index++; continue; }
   const eventDate=isoDate(d);
   if(!isDateInCalendarPeriod(eventDate)){ index++; continue; }
   calendarData.events.push({id:Date.now()+index,date:eventDate,eventType:type,title:type,reportDate:index===0?reportDate:null});
   index++;
 }
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();
 toast(endDate!==date ? `Événement ajouté sur la période du ${fmt(date)} au ${fmt(endDate)}${everyOtherWeek?' (une semaine sur deux)':''}.` : "Événement ajouté");
}
function editSpecialEvent(id){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 const e=calendarData.events.find(x=>x.id===Number(id)); if(!e)return;
 const type=eventTypeOf(e);
 const newLabel=prompt("Nom / type de l'événement :",eventDisplayTitle(e));
 if(!newLabel || !newLabel.trim())return;
 const normalized=normalizeCalendarType(newLabel.trim());
 const finalType=['Cours','Libre','Vacances','Férié','Cours annulé'].includes(normalized) ? normalized : newLabel.trim();
 const newDate=prompt("Date de l'événement (AAAA-MM-JJ) :",e.date);
 if(!newDate)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(newDate)||!isDateInCalendarPeriod(newDate))return toast("Date invalide ou hors de la période du calendrier.");
 e.date=newDate;
 if(finalType==='Cours annulé'){
   const report=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :",eventReportDate(e)||"");
   if(report && report.trim().toLowerCase()!=='attente') {
     if(!/^\d{4}-\d{2}-\d{2}$/.test(report.trim())||!isDateInCalendarPeriod(report.trim()))return toast("Date de report hors de la période du calendrier.");
     e.reportDate=report.trim();
   } else e.reportDate=null;
 }
 e.eventType=finalType;e.title=finalType;
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast("Événement modifié");
}
function deleteEvent(id){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");if(confirm("Supprimer cet événement ?")){calendarData.events=calendarData.events.filter(e=>e.id!==id);saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast("Événement supprimé")}}
function getSpecialCalendarEvents(){
 const items=[]; const seen=new Set();
 const add=(date,type,reportDate=null,id='')=>{
   const d=String(date||'').slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!['Vacances','Férié','Cours annulé'].includes(type)||!isDateInCalendarPeriod(d))return;
   const key=d+'|'+type+'|'+(reportDate||''); if(seen.has(key))return; seen.add(key);
   items.push({date:d,type,reportDate:reportDate||null,id:String(id)});
 };
 Object.entries(calendarData.weeks||{}).forEach(([key,info])=>{
   const raw=typeof info==='string'?info:(info?.type??info?.label??info?.status??info?.name??'');
   const type=normalizeCalendarType(raw);
   if(type==='Vacances'||type==='Férié'||type==='Cours annulé') add(key,type,info?.reportDate||info?.postponedTo||null,'week:'+key);
 });
 (calendarData.events||[]).forEach(e=>{const type=eventTypeOf(e);if(['Vacances','Férié','Cours annulé'].includes(type))add(e.date,type,eventReportDate(e),e.id);});
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
}
function getManualEventsForEventsTab(){
 const excluded=new Set(['Libre']);
 return (calendarData.events||[]).filter(e=>{
   const type=eventTypeOf(e);
   const label=eventDisplayTitle(e);
   return label && !excluded.has(type) && isDateInCalendarPeriod(String(e.date||'').slice(0,10));
 }).map(e=>({id:e.id,date:String(e.date||'').slice(0,10),type:eventDisplayTitle(e),reportDate:eventReportDate(e)||null}))
   .sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
}
function weekTypeLabel(type){
 return ({course:'Cours',off:'Libre',holiday:'Vacances','public-holiday':'Férié',cancelled:'Cours annulé'})[type]||'Cours';
}
function weekTypeOptions(selected){
 return [['course','Cours'],['off','Libre'],['holiday','Vacances'],['public-holiday','Férié'],['cancelled','Cours annulé']]
   .map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
}
function setWeekTypeFromSelect(key,type){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 if(!['course','off','holiday','public-holiday','cancelled'].includes(type)) return toast("Type de semaine invalide.");
 let reportDate=null;
 if(type==='cancelled'){
   const current=weekInfo(key).reportDate||'';
   const report=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :",current);
   if(report===null)return renderEvents();
   if(report.trim() && report.trim().toLowerCase()!=='attente'){
     reportDate=report.trim();
     if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!isDateInCalendarPeriod(reportDate))return toast("Date de report hors de la période du calendrier.");
   }
 }
 calendarData.weeks[key]={type,label:weekTypeLabel(type),reportDate};
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast(`Semaine du ${fmt(key)} définie : ${weekTypeLabel(type)}.`);
}
function addTypedEvent(type){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 if(!['Férié','Cours annulé','Libre'].includes(type)) return;
 const date=prompt(`Date du ${type.toLowerCase()} (AAAA-MM-JJ) :`,"");
 if(!date)return;
 const clean=date.trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(clean)||!isDateInCalendarPeriod(clean))return toast("Date invalide ou hors de la période du calendrier.");
 let reportDate=null;
 if(type==='Cours annulé'){
   const report=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :","");
   if(report===null)return;
   if(report.trim() && report.trim().toLowerCase()!=='attente'){
     reportDate=report.trim();
     if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!isDateInCalendarPeriod(reportDate))return toast("Date de report invalide ou hors de la période du calendrier.");
   }
 }
 const id=Date.now();
 calendarData.events.push({id,date:clean,eventType:type,title:type,reportDate});
 // Les Libre sont désormais des événements ajoutés manuellement :
 // ils ne modifient jamais le type de semaine dans calendarData.weeks.
 // Les jours fériés et cours annulés restent synchronisés lorsqu'ils tombent un lundi.
 if(type!=='Libre' && new Date(clean+"T12:00:00").getDay()===1){
   const map={'Férié':'public-holiday','Cours annulé':'cancelled'};
   calendarData.weeks[clean]={type:map[type],label:type,reportDate};
 }
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();
 toast(`${type} ajouté pour le ${fmt(clean)}.`);
}
function getWeekTypeRows(){
 return Object.entries(calendarData.weeks||{})
   .filter(([key])=>isDateInCalendarPeriod(key))
   .sort((a,b)=>a[0].localeCompare(b[0]));
}
function getEventsByType(type){
 const out=[];
 const seen=new Set();
 const add=(e,id)=>{
   const date=String(e.date||'').slice(0,10), t=eventTypeOf(e);
   if(t!==type||!isDateInCalendarPeriod(date))return;
   const key=String(id)+'|'+date+'|'+t+'|'+(eventReportDate(e)||'');
   if(seen.has(key))return; seen.add(key); out.push({id,date,type:t,reportDate:eventReportDate(e)||null});
 };
 (calendarData.events||[]).forEach(e=>add(e,e.id));
 if(type!=='Libre'){
   Object.entries(calendarData.weeks||{}).forEach(([date,info])=>{
     const t=weekTypeLabel(info?.type);
     if(t===type) add({date,eventType:t,title:t,reportDate:info?.reportDate||null},'week:'+date);
   });
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
function eventSectionRows(items){
 return items.map(e=>`<div class="special-event-row"><div><strong>${esc(e.type)}</strong><div class="muted">${fmt(e.date)}${e.type==='Cours annulé'?` · Report : <strong>${e.reportDate?fmt(e.reportDate):'En attente'}</strong>`:''}</div></div>${canManageEvents()?`<div class="actions">${String(e.id).startsWith('week:')?`<button onclick="editWeek('${String(e.id).slice(5)}')">Modifier</button>`:`<button onclick="editSpecialEvent(${e.id})">Modifier</button><button class="danger" onclick="deleteEvent(${e.id})">Supprimer</button>`}</div>`:''}</div>`).join('');
}
function renderEvents(){
 const el=document.getElementById('eventsView'); if(!el)return;
 const weeks=getWeekTypeRows();
 const holidays=getEventsByType('Férié');
 const cancelled=getEventsByType('Cours annulé');
 const libre=getEventsByType('Libre');
 const specialVacations=getEventsByType('Vacances');
 const others=(calendarData.events||[]).filter(e=>{
   const type=eventTypeOf(e), date=String(e.date||'').slice(0,10);
   return isDateInCalendarPeriod(date) && !['Libre','Férié','Cours annulé','Vacances'].includes(type);
 }).map(e=>({id:e.id,date,type:eventDisplayTitle(e),reportDate:eventReportDate(e)||null}))
   .sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
 const weekRows=weeks.map(([key,info])=>`<div class="special-event-row"><div><strong>Semaine du ${fmt(key)}</strong><div class="muted">Type actuel : <strong>${esc(weekTypeLabel(info?.type))}</strong></div></div>${canManageEvents()?`<div class="actions"><select class="event-week-type-select" onchange="setWeekTypeFromSelect('${key}',this.value)">${weekTypeOptions(info?.type)}</select></div>`:''}</div>`).join('');
 const holidayRows=eventSectionRows(holidays);
 const cancelledRows=eventSectionRows(cancelled);
 const libreRows=eventSectionRows(libre);
 const otherRows=others.map(e=>`<div class="special-event-row"><div><strong>${esc(e.type)}</strong><div class="muted">${fmt(e.date)}</div></div>${canManageEvents()?`<div class="actions"><button onclick="editSpecialEvent(${e.id})">Modifier</button><button class="danger" onclick="deleteEvent(${e.id})">Supprimer</button></div>`:''}</div>`).join('');
 el.innerHTML=`
 <div class="events-page-intro"><p class="eyebrow">ÉVÉNEMENTS</p><h2>Gestion du calendrier et des événements</h2><div class="muted">Toutes les sections sont repliées par défaut pour faciliter la lecture. Ouvrez uniquement la catégorie à gérer.</div></div>
 <details class="card event-section"><summary><span>Types de semaines</span><span class="event-section-count">(${weeks.length})</span></summary><div class="event-section-body">
   ${canManageEvents()?`<div class="calendar-period-fields"><label>Début<input id="calendarPeriodStart" type="date" value="${getCalendarPeriod().start}"></label><label>Fin<input id="calendarPeriodEnd" type="date" value="${getCalendarPeriod().end}"></label><button class="primary" onclick="saveCalendarPeriod()">Enregistrer la période</button></div>`:''}
   <div class="muted event-help">Les lundis sans réglage explicite sont automatiquement des <strong>Cours</strong>. Utilisez la liste ci-dessous pour définir une semaine en Cours, <strong>Libre</strong>, Vacances, Férié ou Cours annulé. La section « Libre » ci-dessous reste réservée aux événements Libre ajoutés manuellement.</div>
   <div class="special-events-list">${weekRows||'<div class="empty">Aucune semaine dans la période.</div>'}</div>
 </div></details>
 <details class="card event-section"><summary><span>Jours fériés</span><span class="event-section-count">(${holidays.length})</span></summary><div class="event-section-body">
   ${canManageEvents()?`<div class="event-section-actions"><button class="primary" onclick="addTypedEvent('Férié')">+ Définir un jour férié</button></div>`:''}
   <div class="special-events-list">${holidayRows||'<div class="empty">Aucun jour férié défini dans la période.</div>'}</div>
 </div></details>
 <details class="card event-section"><summary><span>Cours annulés</span><span class="event-section-count">(${cancelled.length})</span></summary><div class="event-section-body">
   ${canManageEvents()?`<div class="event-section-actions"><button class="primary" onclick="addTypedEvent('Cours annulé')">+ Définir un cours annulé</button></div>`:''}
   <div class="special-events-list">${cancelledRows||'<div class="empty">Aucun cours annulé dans la période.</div>'}</div>
 </div></details>
 <details class="card event-section"><summary><span>Libre</span><span class="event-section-count">(${libre.length})</span></summary><div class="event-section-body">
   ${canManageEvents()?`<div class="event-section-actions"><button class="primary" onclick="addTypedEvent('Libre')">+ Définir un Libre</button></div>`:''}
   <div class="special-events-list">${libreRows||'<div class="empty">Aucun Libre défini dans la période.</div>'}</div>
 </div></details>
 <details class="card event-section"><summary><span>Autres événements</span><span class="event-section-count">(${others.length})</span></summary><div class="event-section-body">
   ${canManageEvents()?`<div class="calendar-event-admin"><div><strong>Ajouter un événement</strong><div class="muted">Ajoutez un événement sur une date ou sur toute une période, avec possibilité d'une semaine sur deux.</div></div><div class="calendar-period-fields"><label>Nom de l'événement<input id="calendarEventTitle" type="text" placeholder="Ex. Stage, réunion…" autocomplete="off"></label><label>Du<input id="calendarEventStart" type="date" value="${getCalendarPeriod().start}"></label><label>Au<input id="calendarEventEnd" type="date" value="${getCalendarPeriod().start}"></label><label style="flex-direction:row;align-items:center;gap:8px;margin-bottom:10px"><input id="calendarEventAlternate" type="checkbox" style="width:auto"> Une semaine sur deux</label><button class="primary" onclick="addEventFromForm()">+ Ajouter l'événement</button></div></div>`:''}
   <div class="special-events-list">${otherRows||'<div class="empty">Aucun autre événement dans la période.</div>'}</div>
 </div></details>`;
}
function calendarPrev(){const p=getCalendarPeriod(),min=new Date(p.start+"T12:00:00");calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);if(calendarCursor<new Date(min.getFullYear(),min.getMonth(),1))calendarCursor=new Date(min.getFullYear(),min.getMonth(),1);renderCalendar()}
function calendarNext(){const p=getCalendarPeriod(),max=new Date(p.end+"T12:00:00");calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);if(calendarCursor>new Date(max.getFullYear(),max.getMonth(),1))calendarCursor=new Date(max.getFullYear(),max.getMonth(),1);renderCalendar()}
function calendarToday(){const today=isoDate(new Date());calendarCursor=isDateInCalendarPeriod(today)?new Date(today+"T12:00:00"):new Date(getCalendarPeriod().start+"T12:00:00");renderCalendar()}

function editWeek(key){
 if(!canManageEvents()) return toast("Réservé à l’administrateur.");
 const current=weekInfo(key).type;
 const currentLabel=current==='course'?'cours':current==='off'?'libre':current==='public-holiday'?'férié':current==='cancelled'?'cours annulé':'vacances';
 const choice=prompt("Semaine du "+fmt(key)+" — saisir : cours / libre / vacances / férié / cours annulé",currentLabel);
 if(!choice)return;
 const clean=choice.toLowerCase().trim();
 const map={"cours":"course","libre":"off","pas de cours":"off","vacances":"holiday","férié":"public-holiday","ferie":"public-holiday","cours annulé":"cancelled","cours annule":"cancelled"};
 const type=map[clean]; if(!type)return toast("Valeur invalide.");
 let reportDate=null;
 if(type==='cancelled'){
   reportDate=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :",weekInfo(key).reportDate||"");
   if(reportDate && reportDate.trim().toLowerCase()!=='attente') {
     if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate.trim())||!isDateInCalendarPeriod(reportDate.trim()))return toast("Date de report hors de la période du calendrier.");
     reportDate=reportDate.trim();
   } else reportDate=null;
 }
 calendarData.weeks[key]={type,label:choice,reportDate};saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast("Semaine mise à jour");
}

function renderActualAttendanceCard(){
 const courseWeek=isAttendanceWeek();
 const actualCards=SLOT_NAMES.map((name,i)=>{
   const slot=i+1, value=getActualAttendance(slot);
   return `<div class="actual-slot"><div class="row"><div><strong>${name}</strong><div class="muted">Nombre réellement constaté</div></div><output id="actualValue${slot}" class="actual-value">${value}</output></div><input class="actual-range" type="range" min="0" max="30" step="1" value="${value}" ${courseWeek?"":"disabled"} oninput="document.getElementById('actualValue${slot}').value=this.value" onchange="setActualAttendance(${slot},this.value)" aria-label="Nombre réel de personnes présentes au ${esc(name)}"><div class="range-scale"><span>0</span><span>15</span><span>30</span></div></div>`;
 }).join("");
 const weekHero=`<section class="hero tdb-week-hero">
   <div><p class="eyebrow">TABLEAU DE BORD</p><h1>Saisie des présences réelles · <span id="tdbWeekLabel"></span></h1><p>Enregistrez rapidement le nombre réellement présent pour les 3 créneaux.</p></div>
   <div class="week-nav"><button id="tdbPrevWeek">←</button><button id="tdbTodayWeek">Cette semaine</button><button id="tdbNextWeek">→</button></div>
 </section>`;
 return `${weekHero}<div class="card actual-attendance-card"><div class="row"><div><h2>Présence réelle</h2><div class="muted">Saisissez le nombre réel de personnes présentes pour chaque créneau, selon la semaine affichée.</div></div></div><div class="actual-grid">${actualCards}</div><div class="muted actual-help">Jauge de 0 à 30 personnes. ${courseWeek?"La valeur est enregistrée pour la semaine affichée.":"Cette semaine n'est ni une semaine Cours ni une semaine Libre : aucune présence n'est demandée."}</div></div>`;
}

function getTdbFilteredHistory(history){
 const p=getCalendarPeriod();
 if(tdbPeriodFilter==='all') return history.filter(h=>h.week>=p.start&&h.week<=p.end);
 const end=new Date(p.end+"T12:00:00");
 const months=Number(tdbPeriodFilter)||0;
 const start=new Date(end); start.setMonth(start.getMonth()-months);
 const startKey=isoDate(start);
 return history.filter(h=>h.week>=startKey&&h.week<=p.end);
}
function renderTdbCounters(history){
 const filtered=getTdbFilteredHistory(history);
 const totals=SLOT_NAMES.map((name,i)=>{
   const slot=i+1;
   const values=filtered.map(h=>Number(h[slot]||0));
   const total=values.reduce((a,b)=>a+b,0);
   const avg=values.length?Math.round(total/values.length):0;
   return `<div class="stat"><div class="num">${total}</div><div class="label">${name} · présences réelles cumulées</div><div class="muted">${values.length?`Moyenne : ${avg} par séance`:'Aucune donnée sur la période'}</div></div>`;
 }).join('');
 const grand=filtered.reduce((sum,h)=>sum+SLOT_NAMES.reduce((a,_,i)=>a+Number(h[i+1]||0),0),0);
 return `<section class="stats tdb-stats"><div class="stat"><div class="num">${grand}</div><div class="label">Total des présences réelles</div><div class="muted">Sur ${filtered.length} semaine${filtered.length>1?'s':''} enregistrée${filtered.length>1?'s':''}</div></div>${totals}</section>`;
}
function renderPastAttendanceComparisonTable(){
 const today=isoDate(new Date());
 const dates=getCourseDates().filter(d=>d<today).sort().reverse();
 const rows=dates.map(date=>{const key=mondayKey(new Date(date+'T12:00:00'));return `<tr><td>${fmt(date)}</td>${[1,2,3].map(slot=>`<td>${Number(db.actualAttendance?.[key+'_'+slot]??0)}</td>`).join('')}${[1,2,3].map(slot=>`<td>${getControlPresence(slot,key)}</td>`).join('')}</tr>`}).join('');
 return `<div class="card past-attendance-table-card"><div><p class="eyebrow">COMPARAISON</p><h2>Présences réelles et déclarées</h2><div class="muted">Dates de cours passées · Réel = présence constatée · Déclaré = adhérents ayant répondu Présent.</div></div><div class="table-scroll"><table class="attendance-compare-table"><thead><tr><th rowspan="2">Date</th><th colspan="3">Réelles</th><th colspan="3">Déclarées</th></tr><tr><th>C1</th><th>C2</th><th>C3</th><th>C1</th><th>C2</th><th>C3</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Aucune date de cours passée.</td></tr>'}</tbody></table></div></div>`;
}
function renderTdb(){
 if(!canCoach()){ document.getElementById("tdbView").innerHTML=""; return; }
 const history=getActualAttendanceHistory();
 const filteredHistory=getTdbFilteredHistory(history);
 const options=[['all','Toute la période'],['3','3 derniers mois'],['6','6 derniers mois'],['12','12 derniers mois']];
 const period=getCalendarPeriod();
 const toolbar=`<section class="slot-filter tdb-period-filter"><div class="filter-title">Filtrer la période du graphique et des compteurs</div><div class="filter-actions">${options.map(([v,l])=>`<button class="filter-btn ${tdbPeriodFilter===v?'active':''}" onclick="setTdbPeriodFilter('${v}')">${l}</button>`).join('')}</div><div class="filter-help">Période du calendrier : ${fmt(period.start)} au ${fmt(period.end)}.</div></section>`;
 const graphCard=`<div class="card"><div class="row"><div><p class="eyebrow">ÉVOLUTION</p><h2>Évolution des présences réelles</h2><div class="muted">Suivi des présences réellement constatées pour les 3 créneaux. La ligne à 20 correspond au seuil de référence.</div></div></div>${renderAttendanceEvolution(filteredHistory)}${toolbar}${renderTdbCounters(history)}${renderPastAttendanceComparisonTable()}</div>`;
 document.getElementById("tdbView").innerHTML=`${renderActualAttendanceCard()}${graphCard}`;
 document.getElementById("tdbWeekLabel").textContent=fmt(weekKey());
 document.getElementById("tdbPrevWeek").onclick=()=>{weekOffset--;render()};
 document.getElementById("tdbNextWeek").onclick=()=>{weekOffset++;render()};
 document.getElementById("tdbTodayWeek").onclick=()=>{weekOffset=0;render()};
}
function setTdbPeriodFilter(value){ tdbPeriodFilter=String(value||'all'); localStorage.setItem("sportclub-tdb-period-filter",tdbPeriodFilter); renderTdb(); }

let membersSlotFilter=localStorage.getItem("sportclub-members-slot-filter")||"all";
let membersRoleFilter=localStorage.getItem("sportclub-members-role-filter")||"all";
function setMembersSlotFilter(value){membersSlotFilter=String(value||"all");localStorage.setItem("sportclub-members-slot-filter",membersSlotFilter);renderMembers();}
function setMembersRoleFilter(value){membersRoleFilter=String(value||"all");localStorage.setItem("sportclub-members-role-filter",membersRoleFilter);renderMembers();}
function renderMembers(){
 if(!canAdmin()){ document.getElementById("membersView").innerHTML=""; return; }
 const q=String(window.membersSearch||"").trim().toLocaleLowerCase("fr-FR");
 const all=db.members.filter(m=>m.active);
 const filtered=all.filter(m=>{const slotOk=membersSlotFilter==="all"||(membersSlotFilter==="none"&&!m.slot)||String(m.slot||"")===membersSlotFilter;const roleOk=membersRoleFilter==="all"||getMemberRole(m)===membersRoleFilter;return slotOk&&roleOk&&(!q||String(m.name||"").toLocaleLowerCase("fr-FR").includes(q));});
 const memberBySlot={1:0,2:0,3:0};
 const accountBySlot={1:0,2:0,3:0};
 all.forEach(m=>{const slot=Number(m.slot);if(accountBySlot[slot]!=null&&m.authEmail)accountBySlot[slot]++;});
 const countByRole={member:0,coach:0,admin:0};
 all.forEach(m=>{const r=getMemberRole(m);if(countByRole[r]!=null)countByRole[r]++;});
 const stats=`<div class="members-overview"><div class="member-stat"><strong>${all.length}</strong><span>Personnes actives</span></div><div class="member-stat"><strong>${countByRole.member}</strong><span>Adhérents</span></div><div class="member-stat"><strong>${countByRole.coach}</strong><span>Encadrants</span></div><div class="member-stat"><strong>${countByRole.admin}</strong><span>Administrateurs</span></div></div>`;
 const quotaHtml=`<div class="card actual-attendance-card members-quota-card"><div class="row"><div><p class="eyebrow">CAPACITÉS</p><h2>Quotas des créneaux</h2><div class="muted">Définissez le quota permanent et visualisez le nombre d’adhérents affectés à chaque créneau.</div></div></div><div class="actual-grid">${[1,2,3].map(slot=>{const name=SLOT_NAMES[slot-1],value=getSlotQuota(slot),assigned=memberBySlot[slot]||0,accounts=accountBySlot[slot]||0;return `<div class="actual-slot"><div class="row"><div><strong>${name}</strong><div class="muted">${assigned} adhérent${assigned>1?"s":""} affecté${assigned>1?"s":""}</div><div class="muted">${accounts} compte${accounts>1?"s":""} existant${accounts>1?"s":""}</div></div><output id="quotaValue${slot}" class="actual-value">${value}</output></div><input class="actual-range" type="range" min="0" max="30" step="1" value="${value}" oninput="document.getElementById('quotaValue${slot}').value=this.value" onchange="setQuota(${slot},this.value)" aria-label="Quota du ${esc(name)}"><div class="range-scale"><span>0</span><span>15</span><span>30</span></div></div>`}).join("")}</div><div class="muted actual-help">Quota de 0 à 30 personnes par créneau.</div></div>`;
 const listHtml=`<div class="card members-directory-card"><div class="members-directory-head"><div><p class="eyebrow">RÉPERTOIRE</p><h2>Utilisateurs</h2><div class="muted">Tous les utilisateurs sont affichés ensemble, par ordre alphabétique.</div></div><button class="primary" onclick="addMember()">+ Ajouter un adhérent</button></div><div class="members-directory-filters"><div class="members-search"><label for="membersSearchInput">Rechercher</label><input id="membersSearchInput" type="search" value="${esc(window.membersSearch||"")}" placeholder="Nom de l’utilisateur…" oninput="window.membersSearch=this.value;renderMembers()" autocomplete="off"></div><label class="members-slot-filter"><span>Filtrer les créneaux</span><select onchange="setMembersSlotFilter(this.value)"><option value="all" ${membersSlotFilter==="all"?"selected":""}>Tous les créneaux</option><option value="1" ${membersSlotFilter==="1"?"selected":""}>Créneau 1</option><option value="2" ${membersSlotFilter==="2"?"selected":""}>Créneau 2</option><option value="3" ${membersSlotFilter==="3"?"selected":""}>Créneau 3</option><option value="none" ${membersSlotFilter==="none"?"selected":""}>Sans créneau</option></select></label><label class="members-slot-filter"><span>Filtrer les rôles</span><select onchange="setMembersRoleFilter(this.value)"><option value="all" ${membersRoleFilter==="all"?"selected":""}>Tous les rôles</option><option value="member" ${membersRoleFilter==="member"?"selected":""}>Adhérent</option><option value="coach" ${membersRoleFilter==="coach"?"selected":""}>Encadrant</option><option value="admin" ${membersRoleFilter==="admin"?"selected":""}>Administrateur</option></select></label></div><div class="members-directory-list">${filtered.length?sortByName(filtered).map(memberDirectoryCard).join(""):`<div class="empty">Aucun utilisateur ne correspond aux critères.</div>`}</div></div>`;
 document.getElementById("membersView").innerHTML=quotaHtml+stats+listHtml+(canAdmin()?renderAdminTools():"");
}

async function forceUserNotifications(memberId){
 if(!canAdmin()) return;
 const member=db.members.find(x=>Number(x.id)===Number(memberId));
 const profileId=String(member?.profileId||'');
 if(!profileId) return toast("Aucun compte Auth associé à cet utilisateur.");
 const sb=v53Client();
 if(!sb) return toast("Connexion Supabase indisponible.");
 if(!confirm(`Forcer l’activation des notifications pour ${member.name} ?\n\nCette action réactive les abonnements Push déjà enregistrés pour ce compte.`)) return;
 try{
   const {data,error}=await sb.from('push_subscriptions').update({active:true,disabled_by_user:false,updated_at:new Date().toISOString()}).eq('profile_id',profileId).select('id');
   if(error) throw error;
   const count=Array.isArray(data)?data.length:0;
   if(!count){ toast("Aucun abonnement Push enregistré pour cet utilisateur. L’activation doit être faite depuis son appareil."); return; }
   await v53LoadRemote();
   renderMembers();
   toast(`${count} abonnement${count>1?'s':''} Push réactivé${count>1?'s':''}.`);
 }catch(e){ console.error('[V138] activation Push administrateur impossible',e); toast(`Activation impossible : ${e?.message||'erreur inconnue'}`); }
}

function memberDirectoryCard(m){
 const role=getMemberRole(m), roleLabel=ROLE_LABELS[role]||role;
 const account=v63AccountStatus[Number(m.id)]||{};
 const login=account.last_sign_in_at?fmtDateTime(account.last_sign_in_at):"Jamais";
 const passwordState=account.password_changed_at?`Mot de passe modifié le ${esc(fmtDateTime(account.password_changed_at))}`:(account.must_change_password?`Mot de passe temporaire à changer`:(account.user_id?`État du mot de passe non renseigné`:""));
 const credentialEmailState=account.credentials_email_sent_at?`Dernier envoi des identifiants : ${esc(fmtDateTime(account.credentials_email_sent_at))}`:`Aucun envoi des identifiants`;
 const notificationState=m.notificationStatus==='active'?{label:'Actif',className:'active'}:m.notificationStatus==='user_disabled'||m.notificationStatus==='inactive'?{label:'Inactif',className:'inactive'}:{label:'Jamais activé',className:'none'};

 const slotText=role==="admin"?(m.slot?slotLabel(m.slot):"Aucun"):(role==="member"?slotLabel(m.slot):"Aucun");
 const accountActions=canManageRoles()?`${m.authEmail?`<button onclick="manageMemberAccount(${m.id})">Gérer le compte</button><button class="primary" onclick="sendAccountCredentialsEmail(${m.id})">✉ Envoyer les identifiants</button>`:`<button class="primary" onclick="createMemberAccount(${m.id})">Créer le compte</button>`}<button onclick="changeMemberPassword(${m.id})">Réinitialiser le mot de passe</button><button class="danger" onclick="removeMember(${m.id})">Désactiver</button>`:"";
 return `<article class="card member-directory-card-item"><div class="member-directory-main"><div class="member-directory-identity"><strong>${esc(m.name)}</strong><span class="member-role-pill">${esc(roleLabel)}</span></div><div class="member-directory-info"><div><span class="field-label">Rôle</span><strong>${esc(roleLabel)}</strong></div><div><span class="field-label">Créneau habituel</span><strong>${esc(slotText)}</strong></div><div><span class="field-label">Compte adhérent</span><strong>${m.authEmail?"Compte créé":"Compte non créé"}</strong>${m.authEmail?`<span class="muted">${esc(m.authEmail)}</span>`:""}</div><div><span class="field-label">Dernière connexion</span><strong>${esc(login)}</strong>${passwordState?`<span class="muted">${esc(passwordState)}</span>`:""}</div><div><span class="field-label">Email des identifiants</span><strong>${esc(credentialEmailState)}</strong></div><div><span class="field-label">Notifications</span><div class="notification-user-status"><span class="notification-status-btn ${notificationState.className}">${notificationState.label}</span></div></div></div></div><div class="member-directory-actions">${accountActions}</div>${canManageRoles()?`<div class="member-directory-settings"><span class="field-label">Modifier le rôle</span><select onchange="setMemberRole(${m.id},this.value)"><option value="member" ${role==='member'?"selected":""}>Adhérent</option><option value="coach" ${role==='coach'?"selected":""}>Encadrant</option><option value="admin" ${role==='admin'?"selected":""}>Administrateur</option></select><span class="field-label">Créneau habituel</span>${role==='admin'?`<select onchange="setMemberHabitualSlot(${m.id},this.value)"><option value="" ${!m.slot?"selected":""}>Aucun</option><option value="1" ${Number(m.slot)===1?"selected":""}>Créneau 1</option><option value="2" ${Number(m.slot)===2?"selected":""}>Créneau 2</option><option value="3" ${Number(m.slot)===3?"selected":""}>Créneau 3</option></select>`:role==='member'?`<select onchange="setMemberHabitualSlot(${m.id},this.value)"><option value="1" ${Number(m.slot)===1?"selected":""}>Créneau 1</option><option value="2" ${Number(m.slot)===2?"selected":""}>Créneau 2</option><option value="3" ${Number(m.slot)===3?"selected":""}>Créneau 3</option></select>`:`<span class="muted">Sans créneau</span>`}</div>`:""}</article>`;
}

function notificationDayName(d){return ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"][Number(d)]||d;}
const NOTIFICATION_DEFS=[
 {key:"attendance_reminder",title:"Rappel de présence",desc:"Rappelle aux adhérents de confirmer leur présence pour la semaine suivante."},
 {key:"new_slot_request",title:"Nouvelle demande de créneau",desc:"Informe les encadrants et administrateurs d’une nouvelle demande de changement de créneau."},
 {key:"new_status_request",title:"Nouvelle demande de présence",desc:"Informe les encadrants et administrateurs d’une demande de modification de présence."},
 {key:"slot_request_decision",title:"Décision sur une demande de créneau",desc:"Informe l’adhérent lorsqu’une demande de créneau est validée, refusée ou annulée."},
 {key:"status_request_decision",title:"Décision sur une demande de présence",desc:"Informe l’adhérent lorsqu’une demande de présence est validée, refusée ou annulée."},
 {key:"attendance_confirmed",title:"Présence confirmée",desc:"Informe les adhérents ayant répondu Présent avec la date, le créneau effectif et le statut. L’envoi peut être déclenché manuellement ci-dessous."}
];
function saveNotificationSettings(){writeStorageJson("sportclub-notification-settings",notificationSettings);}
function notificationSetting(key){return notificationSettings[key]||DEFAULT_NOTIFICATION_SETTINGS[key];}
async function loadNotificationSettings(){
 if(!canAdmin()) return;
 const sb=v53Client(); if(!sb||!v53User()) return;
 try{const {data,error}=await sb.from("notification_settings").select("notification_type,active,days,start_time,end_time"); if(error) throw error; (data||[]).forEach(r=>{notificationSettings[r.notification_type]={active:r.active!==false,days:Array.isArray(r.days)?r.days.map(Number):[],start:String(r.start_time||"07:00").slice(0,5),end:String(r.end_time||"23:00").slice(0,5)};}); if(!notificationSettings.staff_delivery_window) notificationSettings.staff_delivery_window={...DEFAULT_STAFF_NOTIFICATION_WINDOW}; saveNotificationSettings();}catch(e){console.warn("[V99] paramètres notifications non chargés",e);}
}
function updateNotificationSetting(key,field,value){
 if(!canAdmin()) return toast("Réservé à l’administrateur.");
 const s=notificationSetting(key);
 if(field==="active") s.active=!!value;
 else if(field==="start"||field==="end") s[field]=String(value||"00:00");
 else if(field==="days") s.days=Array.isArray(value)?value.map(Number):[];
 notificationSettings[key]=s; saveNotificationSettings();
 const sb=v53Client(); if(sb&&v53User()){sb.from("notification_settings").upsert({notification_type:key,active:s.active,days:s.days,start_time:s.start,end_time:s.end,updated_at:new Date().toISOString()},{onConflict:"notification_type"}).then(({error})=>{if(error)toast("Paramètre non enregistré : "+error.message);});}
 addActionLog("Paramètre notification",`${key} · ${field}`);
}
async function triggerNotificationAction(action){
 if(!canAdmin()) return toast("Réservé à l’administrateur.");
 const sb=v53Client(); if(!sb||!v53User()) return toast("Connexion Supabase requise.");
 const label=action==="manual_attendance_reminder"?"Rappel de présence":"Présence confirmée";
 if(!confirm(`Déclencher maintenant l’envoi de « ${label} » ?`)) return;
 try{
   const body={action};
   if(action==="manual_attendance_confirmed") body.week=weekKey();
   const {data,error}=await sb.functions.invoke("push-notifications",{body});
   if(error) throw error;
   if(data?.error) throw new Error(data.error);
   const sent=Number(data?.sent||0);
   toast(`${label} : ${sent} notification${sent>1?"s":""} envoyée${sent>1?"s":""}.`);
   addActionLog("Envoi manuel notification",`${label} · semaine ${data?.week||weekKey()} · ${sent} envoi(s)`);
 }catch(e){ console.error("[V107] Envoi notification impossible",e); toast(`Échec de l’envoi : ${e?.message||"erreur inconnue"}`); }
}
window.triggerNotificationAction=triggerNotificationAction;

function programSetting(id){ return db.notificationPrograms[id] || DEFAULT_NOTIFICATION_PROGRAMS[id-1]; }
function saveProgram(id,patch){ if(!canAdmin())return; db.notificationPrograms[id]={...programSetting(id),...patch}; save(); renderNotifications(); }
function updateProgram(id,field,value){ const p={...programSetting(id)}; if(field==='recipients') p.recipients={...p.recipients,...value}; else p[field]=value; saveProgram(id,p); }
function updateProgramDays(id){ const days=[...document.querySelectorAll(`input[data-program-day="${id}"]:checked`)].map(x=>Number(x.value)); updateProgram(id,'days',days); }
function updateProgramWeekTypes(id){ const types=[...document.querySelectorAll(`input[data-program-week="${id}"]:checked`)].map(x=>x.value); updateProgram(id,'weekTypes',types); }
function updateBanner(field,value){ if(!canAdmin())return; db.informationBanner[field]=field==='active'?!!value:String(value||''); save(); render(); }
function updateManualNotification(field,value){ if(!canAdmin())return; if(field==='recipients') db.manualNotification.recipients={...db.manualNotification.recipients,...value}; else db.manualNotification[field]=String(value||''); save(); renderNotifications(); }
async function sendCustomManualNotification(){
 if(!canAdmin()) return toast('Réservé à l’administrateur.');
 const content=String(db.manualNotification?.content||'').trim(); if(!content)return toast('Saisissez le contenu de la notification.');
 const recipients=db.manualNotification.recipients||{}; const targets=Object.entries(recipients).filter(([,v])=>v).map(([k])=>k); if(!targets.length)return toast('Sélectionnez au moins un destinataire.');
 const sb=v53Client(); if(!sb)return toast('Connexion Supabase requise.');
 try{ let result=await sb.functions.invoke('custom-notifications',{body:{action:'manual',title:'Don Bosco - Perfectionnement',body:content,recipients:targets,event_key:`manual-${Date.now()}`}}); if(result.error){ console.warn('[V131] custom-notifications indisponible, tentative push-notifications',result.error); result=await sb.functions.invoke('push-notifications',{body:{action:'custom_manual',title:'Don Bosco - Perfectionnement',body:content,recipients:targets,event_key:`manual-${Date.now()}`}}); } if(result.error)throw result.error; toast(`${Number(result.data?.sent||0)} notification${Number(result.data?.sent||0)>1?'s':''} envoyée${Number(result.data?.sent||0)>1?'s':''}.`); }catch(e){ console.error('[V131] notification manuelle',e); toast(`Échec de l’envoi : ${e?.message||'erreur inconnue'}`); }
}
async function saveBannerRemote(){
 const sb=v53Client(); if(!sb||!v53User()||!canAdmin())return;
 try{await sb.from('information_banner').upsert({id:true,active:!!db.informationBanner.active,content:String(db.informationBanner.content||''),updated_by:v53User().id},{onConflict:'id'});}catch(e){console.warn('[banner]',e);}
}
const notificationRecipientHtml=(id,prefix='program')=>`<div class="notification-recipients"><span class="field-label">Destinataires</span><label><input type="checkbox" ${programSetting(id).recipients.member?'checked':''} onchange="updateProgram(${id},'recipients',{member:this.checked})"> Adhérents</label><label><input type="checkbox" ${programSetting(id).recipients.coach?'checked':''} onchange="updateProgram(${id},'recipients',{coach:this.checked})"> Encadrants</label><label><input type="checkbox" ${programSetting(id).recipients.admin?'checked':''} onchange="updateProgram(${id},'recipients',{admin:this.checked})"> Administrateurs</label></div>`;
let notificationSubpage='members';
function notificationActionSettingsHtml(){
 const defs=NOTIFICATION_DEFS.filter(x=>x.key!=='attendance_confirmed');
 return `<div class="card notification-actions-card"><p class="eyebrow">NOTIFICATIONS LIÉES AUX ACTIONS</p><h2>Notifications automatiques</h2><div class="muted">Ces notifications correspondent aux actions de l’application. Elles restent configurables indépendamment des 3 notifications personnalisées.</div>${defs.map(d=>{const st=notificationSetting(d.key);return `<div class="notification-action-row"><div><strong>${esc(d.title)}</strong><div class="muted">${esc(d.desc)}</div></div><label class="notification-toggle"><input type="checkbox" ${st.active?'checked':''} onchange="updateNotificationSetting('${d.key}','active',this.checked)"><span>${st.active?'Activée':'Désactivée'}</span></label><label>Début<input type="time" value="${esc(st.start)}" onchange="updateNotificationSetting('${d.key}','start',this.value)"></label><label>Fin<input type="time" value="${esc(st.end)}" onchange="updateNotificationSetting('${d.key}','end',this.value)"></label><div class="notification-day-list mini-days">${[1,2,3,4,5,6,0].map(day=>`<label><input type="checkbox" ${st.days.includes(day)?'checked':''} onchange="updateNotificationSetting('${d.key}','days',[...document.querySelectorAll('input[data-action-day=\\'${d.key}\\']:checked')].map(x=>Number(x.value)))" data-action-day="${d.key}" value="${day}">${notificationDayName(day).slice(0,3)}</label>`).join('')}</div></div>`}).join('')}<div class="card notification-action-row"><div><strong>Présence confirmée</strong><div class="muted">Envoi manuel depuis cette page.</div></div><button class="secondary" onclick="triggerNotificationAction('manual_attendance_reminder')">Rappel de présence</button><button class="secondary" onclick="triggerNotificationAction('manual_attendance_confirmed')">Présence confirmée</button></div></div>`;
}
function renderScheduledPrograms(filter){
 return [1,2,3].map(id=>{const p=programSetting(id);const targets=Object.entries(p.recipients||{}).filter(([,v])=>v).map(([k])=>k);const show=filter==='member'?targets.includes('member'):targets.includes('coach')||targets.includes('admin');if(!show)return '';return `<div class="card notification-config-card custom-program"><div class="notification-config-head"><div><p class="eyebrow">NOTIFICATION PROGRAMMÉE ${id}</p><input class="notification-title-input" value="${esc(p.title||'')}" onchange="updateProgram(${id},'title',this.value)" placeholder="Titre de la notification"><div class="muted">Cette notification est visible ici car elle cible ${filter==='member'?'les adhérents':'les encadrants et/ou administrateurs'}.</div></div><label class="notification-toggle"><input type="checkbox" ${p.active?'checked':''} onchange="updateProgram(${id},'active',this.checked)"><span>${p.active?'Activée':'Désactivée'}</span></label></div><label>Contenu<textarea rows="4" onchange="updateProgram(${id},'content',this.value)" placeholder="Contenu de la notification...">${esc(p.content||'')}</textarea></label><div class="notification-config-fields"><label>Heure<input type="time" value="${esc(p.time||'12:00')}" onchange="updateProgram(${id},'time',this.value)"></label><label>Condition d’envoi<select onchange="updateProgram(${id},'mode',this.value)"><option value="days" ${p.mode==='days'?'selected':''}>Jours précis</option><option value="week_types" ${p.mode==='week_types'?'selected':''}>Type de semaine</option></select></label></div>${p.mode==='days'?`<div class="notification-days"><span class="field-label">Jours d’envoi</span><div class="notification-day-list">${[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" data-program-day="${id}" value="${d}" ${p.days.includes(d)?'checked':''} onchange="updateProgramDays(${id})">${notificationDayName(d).slice(0,3)}</label>`).join('')}</div></div>`:`<div class="notification-days"><span class="field-label">Types de semaine</span><div class="notification-day-list notification-week-list">${[['course','Cours'],['off','Libre'],['holiday','Vacances'],['public-holiday','Férié']].map(([v,l])=>`<label><input type="checkbox" data-program-week="${id}" value="${v}" ${p.weekTypes.includes(v)?'checked':''} onchange="updateProgramWeekTypes(${id})">${l}</label>`).join('')}</div></div>`}${notificationRecipientHtml(id)}</div>`;}).join('')||`<div class="empty">Aucune des 3 notifications programmées ne cible cette catégorie. Utilisez les destinataires des notifications pour l’ajouter.</div>`;
}
function staffNotificationWindowHtml(){
 const w=notificationSetting("staff_delivery_window")||DEFAULT_STAFF_NOTIFICATION_WINDOW;
 return `<div class="card notification-config-card staff-window-card"><p class="eyebrow">PÉRIODE GLOBALE D’ENVOI</p><h2>Périodes pendant lesquelles les notifications peuvent être envoyées</h2><div class="muted">Cette période s’applique aux notifications destinées aux encadrants et administrateurs. Elle constitue la plage autorisée globale, en complément de l’activation de chaque notification.</div><label class="notification-toggle"><input type="checkbox" ${w.active?'checked':''} onchange="updateNotificationSetting('staff_delivery_window','active',this.checked)"><span>${w.active?'Activée':'Désactivée'}</span></label><div class="notification-config-fields"><label>Heure de début<input type="time" value="${esc(w.start||'07:00')}" onchange="updateNotificationSetting('staff_delivery_window','start',this.value)"></label><label>Heure de fin<input type="time" value="${esc(w.end||'23:00')}" onchange="updateNotificationSetting('staff_delivery_window','end',this.value)"></label></div><div class="notification-days"><span class="field-label">Jours autorisés</span><div class="notification-day-list">${[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" data-staff-window-day="${d}" value="${d}" ${w.days.includes(d)?'checked':''} onchange="updateStaffNotificationWindowDays()">${notificationDayName(d)}</label>`).join('')}</div></div></div>`;
}
function updateStaffNotificationWindowDays(){
 const days=[...document.querySelectorAll('input[data-staff-window-day]:checked')].map(x=>Number(x.value));
 updateNotificationSetting('staff_delivery_window','days',days);
}
function renderNotifications(){
 const el=document.getElementById('notificationsView');if(!el)return;if(!canAdmin()){el.innerHTML='';return;}
 const tabs=`<div class="notification-subtabs"><button class="tab ${notificationSubpage==='members'?'active':''}" onclick="setNotificationSubpage('members')">Adhérents</button><button class="tab ${notificationSubpage==='staff'?'active':''}" onclick="setNotificationSubpage('staff')">Encadrants et administrateurs</button><button class="tab ${notificationSubpage==='manual'?'active':''}" onclick="setNotificationSubpage('manual')">Bandeau - Push</button></div>`;
 let content='';
 if(notificationSubpage==='members') content=`<section><h2>Notifications envoyées aux adhérents</h2><div class="muted">3 notifications programmées maximum, selon les destinataires sélectionnés.</div>${renderScheduledPrograms('member')}</section>`;
 else if(notificationSubpage==='staff') content=`<section><h2>Notifications envoyées aux encadrants et administrateurs</h2>${staffNotificationWindowHtml()}<div class="muted">3 notifications programmées maximum, selon les destinataires sélectionnés.</div>${renderScheduledPrograms('staff')}${notificationActionSettingsHtml()}</section>`;
 else {const mr=db.manualNotification||{};const manual=`<div class="card notification-config-card"><p class="eyebrow">NOTIFICATION MANUELLE</p><h2>Envoi instantané</h2><label>Contenu<textarea rows="6" onchange="updateManualNotification('content',this.value)" placeholder="Contenu de la notification...">${esc(mr.content||'')}</textarea></label><div class="notification-recipients"><span class="field-label">Destinataires</span>${[['member','Adhérents'],['coach','Encadrants'],['admin','Administrateurs']].map(([k,l])=>`<label><input type="checkbox" ${mr.recipients?.[k]?'checked':''} onchange="updateManualNotification('recipients',{${k}:this.checked})"> ${l}</label>`).join('')}</div><button class="primary" onclick="sendCustomManualNotification()">↗ Envoyer maintenant</button></div>`;const b=db.informationBanner||{};const banner=`<div class="card notification-config-card"><p class="eyebrow">BANDEAU D’INFORMATION</p><h2>Bandeau visible sur toutes les pages</h2><label class="notification-toggle"><input type="checkbox" ${b.active?'checked':''} onchange="updateBanner('active',this.checked);saveBannerRemote()"><span>${b.active?'Activé':'Désactivé'}</span></label><label>Contenu<textarea rows="5" onchange="updateBanner('content',this.value);saveBannerRemote()" placeholder="Message affiché en haut de toutes les pages...">${esc(b.content||'')}</textarea></label></div>`;content=`<section><h2>Notifications manuelles</h2>${manual}${banner}</section>`;}
 el.innerHTML=`<section class="hero"><div><p class="eyebrow">ADMINISTRATION</p><h1>Notifications</h1><p>Les notifications sont réparties par destinataires et par mode d’envoi.</p></div></section>${tabs}${content}`;
}
function setNotificationSubpage(page){notificationSubpage=page;renderNotifications();}

function updateNotificationDays(key){const vals=[...document.querySelectorAll(`input[data-notif-day="${key}"]:checked`)].map(x=>Number(x.value));updateNotificationSetting(key,"days",vals);}
function coachExportData(){
 const dates=getCourseDates().filter(d=>d<isoDate(new Date()));
 return {tdb:document.getElementById('tdbView')?.innerText||'',objectives:document.getElementById('objectivesView')?.innerText||'',followup:document.getElementById('member-historyView')?.innerText||'',dates};
}
function renderCoachExportData(){ }
function openCoachExportModal(){
 if(currentRole!=='coach')return toast('Réservé à l’encadrement.'); closeProfileMenu();
 let modal=document.getElementById('coachExportModal'); if(!modal){modal=document.createElement('div');modal.id='coachExportModal';document.body.appendChild(modal);}
 modal.innerHTML=`<div class="password-modal-card export-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">EXPORT PDF</div><h3>Exporter les pages Encadrant</h3></div><button class="profile-close" onclick="closeCoachExportModal()">×</button></div><p class="muted">Sélectionnez les contenus à inclure dans le PDF.</p><label class="checkbox-line"><input id="exportTdb" type="checkbox" checked> TDB (avec tableau des présences réelles et déclarées)</label><label class="checkbox-line"><input id="exportObjectives" type="checkbox" checked> Objectifs</label><label class="checkbox-line"><input id="exportFollowup" type="checkbox" checked> Mon suivi</label><div class="password-modal-actions"><button class="secondary" onclick="closeCoachExportModal()">Annuler</button><button class="primary" onclick="exportCoachPdf()">Exporter en PDF</button></div></div>`; modal.classList.add('open');
}
function closeCoachExportModal(){document.getElementById('coachExportModal')?.classList.remove('open');}
function exportCoachPdf(){
 const selected=[]; if(document.getElementById('exportTdb')?.checked)selected.push('tdb');if(document.getElementById('exportObjectives')?.checked)selected.push('objectives');if(document.getElementById('exportFollowup')?.checked)selected.push('followup');if(!selected.length)return toast('Sélectionnez au moins une page.');
 const actual=getActualAttendanceHistory().filter(h=>h.week<isoDate(new Date())); const rows=actual.map(h=>{const declared=[1,2,3].map(slot=>getControlPresence(slot,h.week)).join(' / ');const real=[1,2,3].map(slot=>Number(h[slot]||0)).join(' / ');return `<tr><td>${fmt(h.week)}</td><td>${real}</td><td>${declared}</td></tr>`}).join('');
 const sections=[]; if(selected.includes('tdb'))sections.push(`<section><h1>TDB</h1><div class="export-source">Tableau des présences réelles et déclarées pour les dates de cours passées.</div><table><thead><tr><th>Date</th><th>Réelles (C1 / C2 / C3)</th><th>Déclarées (C1 / C2 / C3)</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Aucune donnée.</td></tr>'}</tbody></table></section>`); if(selected.includes('objectives'))sections.push(`<section><h1>Objectifs</h1>${document.getElementById('objectivesView')?.innerHTML||'<p>Aucune donnée.</p>'}</section>`); if(selected.includes('followup'))sections.push(`<section><h1>Mon suivi</h1>${document.getElementById('member-historyView')?.innerHTML||'<p>Aucune donnée.</p>'}</section>`);
 const print=document.createElement('div'); print.id='coachPrintArea'; print.innerHTML=`<div class="print-header"><h1>Don Bosco - Perfectionnement</h1><p>Export Encadrant · ${new Date().toLocaleString('fr-FR')}</p></div>${sections.join('')}`; document.body.appendChild(print); closeCoachExportModal();
 const previousTitle=document.title; document.title='Don Bosco - Perfectionnement — Export Encadrant';
 const cleanup=()=>{print.remove();document.title=previousTitle;window.removeEventListener('afterprint',cleanup);};
 window.addEventListener('afterprint',cleanup); setTimeout(()=>window.print(),100);
}

function openAdminMessageModal(){
 if(currentRole!=='member')return; closeProfileMenu(); let modal=document.getElementById('adminMessageModal');if(!modal){modal=document.createElement('div');modal.id='adminMessageModal';document.body.appendChild(modal);} modal.innerHTML=`<div class="password-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">MESSAGE</div><h3>Message pour l’administrateur</h3></div><button class="profile-close" onclick="closeAdminMessageModal()">×</button></div><p class="muted">Écrivez votre message à l’administrateur.</p><textarea id="adminMessageText" rows="8" placeholder="Écrivez votre message..."></textarea><div class="password-modal-actions"><button class="secondary" onclick="closeAdminMessageModal()">Annuler</button><button class="primary" onclick="sendAdminMessage()">Envoyer</button></div></div>`;modal.classList.add('open');
}
function closeAdminMessageModal(){document.getElementById('adminMessageModal')?.classList.remove('open');}
async function sendAdminMessage(){const me=currentMember();const text=String(document.getElementById('adminMessageText')?.value||'').trim();if(!me||!text)return toast('Écrivez un message.');const now=Date.now();db.adminMessages.push({id:now,memberId:me.id,memberName:me.name,text,senderRole:'member',senderProfileId:v53User()?.id||null,visible:true,createdAt:now,updatedAt:now});save();try{if(v53Session())await v53SyncRemote();}catch(e){console.error(e);toast('Message enregistré localement mais non synchronisé.');}closeAdminMessageModal();render();toast('Message envoyé à l’administrateur.');}
function openNewAdminMessageModal(){
 if(!canAdmin())return; let modal=document.getElementById('newAdminMessageModal');if(!modal){modal=document.createElement('div');modal.id='newAdminMessageModal';document.body.appendChild(modal);}
 const members=(db.members||[]).filter(m=>m.active!==false&&getMemberRole(m)==='member').sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr-FR'));
 modal.innerHTML=`<div class="password-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">NOUVEAU MESSAGE</div><h3>Envoyer un message</h3></div><button class="profile-close" onclick="closeNewAdminMessageModal()">×</button></div><label>Utilisateur<select id="newAdminMessageMember">${members.map(m=>`<option value="${Number(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><label>Message<textarea id="newAdminMessageText" rows="8" placeholder="Écrivez votre message..."></textarea></label><div class="password-modal-actions"><button class="secondary" onclick="closeNewAdminMessageModal()">Annuler</button><button class="primary" onclick="sendAdminToMember()">Envoyer</button></div></div>`;modal.classList.add('open');
}
function closeNewAdminMessageModal(){document.getElementById('newAdminMessageModal')?.classList.remove('open');}
async function sendAdminToMember(){if(!canAdmin())return;const memberId=Number(document.getElementById('newAdminMessageMember')?.value);const text=String(document.getElementById('newAdminMessageText')?.value||'').trim();const me=(db.members||[]).find(m=>Number(m.id)===memberId);if(!me||!text)return toast('Sélectionnez un utilisateur et écrivez un message.');const now=Date.now();db.adminMessages.push({id:now,memberId:me.id,memberName:me.name,text,senderRole:'admin',senderProfileId:v53User()?.id||null,visible:true,createdAt:now,updatedAt:now});save();try{await v53SyncRemote();}catch(e){console.error(e);toast('Message enregistré localement mais non synchronisé.');}closeNewAdminMessageModal();render();toast('Message envoyé.');}
function toggleAdminMessage(id){if(!canAdmin())return;const m=db.adminMessages.find(x=>Number(x.id)===Number(id));if(!m)return;m.visible=m.visible===false;m.updatedAt=Date.now();save();try{v53SyncRemote();}catch(e){}render();}
function messageCommentsFor(messageId){return (db.adminMessageComments||[]).filter(x=>Number(x.messageId)===Number(messageId)).sort((a,b)=>Number(a.createdAt)-Number(b.createdAt));}
async function addAdminMessageComment(messageId){
 const message=(db.adminMessages||[]).find(x=>Number(x.id)===Number(messageId));
 if(!message)return;
 const allowed=currentRole==='member' ? Number(message.memberId)===Number(currentMemberId) && message.visible!==false : canAdmin();
 if(!allowed)return toast('Vous ne pouvez pas commenter ce message.');
 const input=document.getElementById(`messageComment_${messageId}`); const text=String(input?.value||'').trim();
 if(!text)return toast('Écrivez un commentaire.');
 const now=Date.now();
 db.adminMessageComments.push({id:now,messageId:Number(messageId),memberId:Number(message.memberId),text,senderRole:currentRole==='member'?'member':'admin',senderProfileId:v53User()?.id||null,createdAt:now});
 save();
 try{if(v53Session())await v53SyncRemote();}catch(e){console.error(e);toast('Commentaire enregistré localement mais non synchronisé.');}
 render();
}
function messageCommentHtml(message){
 const comments=messageCommentsFor(message.id);
 const canComment=currentRole==='member' ? Number(message.memberId)===Number(currentMemberId)&&message.visible!==false : canAdmin();
 return `<div class="message-comments"><div class="field-label">Commentaires</div>${comments.length?comments.map(c=>`<div class="message-comment"><strong>${c.senderRole==='admin'?'Administrateur':'Adhérent'}</strong><div>${esc(c.text).replace(/\n/g,'<br>')}</div><span>${fmtDateTime(c.createdAt)}</span></div>`).join(''):'<div class="muted">Aucun commentaire.</div>'}${canComment?`<div class="message-comment-compose"><textarea id="messageComment_${message.id}" rows="2" placeholder="Ajouter un commentaire..."></textarea><button class="secondary" onclick="addAdminMessageComment(${message.id})">Commenter</button></div>`:''}</div>`;
}
function renderMessages(){
 const el=document.getElementById('messagesView');if(!el)return;
 if(currentRole==='member'){
   const rows=(db.adminMessages||[]).filter(x=>Number(x.memberId)===Number(currentMemberId)&&x.visible!==false).sort((a,b)=>Number(a.createdAt)-Number(b.createdAt));
   if(!rows.length){el.innerHTML='';return;}
   el.innerHTML=`<section class="hero"><div><p class="eyebrow">MESSAGES</p><h1>Messages</h1><p>Votre discussion avec l’administrateur.</p></div></section><div class="card"><div class="message-thread">${rows.map(x=>`<div class="message-bubble ${x.senderRole==='admin'?'admin':'member'}"><strong>${x.senderRole==='admin'?'Administrateur':'Vous'}</strong><div>${esc(x.text).replace(/\n/g,'<br>')}</div><span>${fmtDateTime(x.createdAt)}</span>${messageCommentHtml(x)}</div>`).join('')}</div></div>`;return;
 }
 if(!canAdmin()){el.innerHTML='';return;}
 const groups={};(db.adminMessages||[]).forEach(x=>{(groups[x.memberId] ||= []).push(x);});
 const cards=Object.values(groups).sort((a,b)=>String(a[0].memberName).localeCompare(String(b[0].memberName),'fr-FR')).map(rows=>`<div class="card message-conversation"><div class="row"><div><strong>${esc(rows[0].memberName||'Adhérent')}</strong><div class="muted">${rows.length} message${rows.length>1?'s':''}</div></div></div>${rows.sort((a,b)=>Number(a.createdAt)-Number(b.createdAt)).map(x=>`<div class="message-bubble ${x.senderRole==='admin'?'admin':'member'}"><strong>${x.senderRole==='admin'?'Administrateur':'Adhérent'}</strong><div>${esc(x.text).replace(/\n/g,'<br>')}</div><span>${fmtDateTime(x.createdAt)}</span><button class="secondary" onclick="toggleAdminMessage(${x.id})">${x.visible===false?'Afficher':'Masquer'}</button>${messageCommentHtml(x)}</div>`).join('')}</div>`).join('');
 el.innerHTML=`<section class="hero"><div><p class="eyebrow">ADMINISTRATION</p><h1>Messages</h1><p>Les échanges avec les adhérents sont regroupés par discussion.</p></div><button class="primary" onclick="openNewAdminMessageModal()">＋ Nouveau message</button></section>${cards||'<div class="empty">Aucun message.</div>'}`;
}

function renderAdminTools(){
 if(!canAdmin()) return "";
 const last=db.actionLog?.length?db.actionLog[db.actionLog.length-1]:null; const lastBackup=readStorageJson("sportclub-last-backup",null);
 return `<div class="card admin-tools-card"><div class="row"><div><p class="eyebrow">SÉCURITÉ & DONNÉES</p><h2>Sauvegarde et restauration</h2><div class="muted">Exportez une copie complète des données avant une modification importante.</div></div><div class="actions"><button class="secondary" onclick="exportBackup()">Exporter les données</button><button class="secondary" onclick="document.getElementById('backupFileInput').click()">Importer une sauvegarde</button></div></div><div class="backup-meta">${lastBackup?`Dernière sauvegarde : ${fmtDateTime(lastBackup)}`:'Aucune sauvegarde locale enregistrée.'}${last?` · Dernière action : ${fmtDateTime(last.date)} · ${esc(last.action)}`:''}</div><input id="backupFileInput" type="file" accept="application/json,.json" hidden onchange="importBackup(this.files[0])"></div>`;
}
function fmtDateTime(value){ try{return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}catch(e){return "";} }
function exportBackup(){
 if(!canAdmin()) return toast("Seul l’administrateur peut exporter les données.");
 const payload={format:"don-bosco-perfectionnement-backup",version:2,schemaVersion:2,exportedAt:new Date().toISOString(),db,calendarData,appUsers};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob); const a=document.createElement("a");
 a.href=url; a.download=`don-bosco-perfectionnement-sauvegarde-${isoDate(new Date())}.json`; a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000); localStorage.setItem("sportclub-last-backup",new Date().toISOString()); addActionLog("Export de sauvegarde"); save(); renderMembers(); toast("Sauvegarde exportée.");
}
function normalizeDb(){
 if(!db||typeof db!=="object") db={};
 if(!Array.isArray(db.members)) db.members=[];
 if(!db.attendance||typeof db.attendance!=="object") db.attendance={};
 if(!db.actualAttendance||typeof db.actualAttendance!=="object") db.actualAttendance={};
 if(!db.quotas||typeof db.quotas!=="object") db.quotas={};
 [1,2,3].forEach(s=>{const n=Number(db.quotas[s]);db.quotas[s]=Number.isFinite(n)?Math.max(0,Math.min(30,n)):30;});
 ["moves","absencePeriods","statusRequests","objectiveComments","objectiveReactions","actionLog"].forEach(k=>{if(!Array.isArray(db[k]))db[k]=[];});
 ["sessionObjectives","coachNotesByDate"].forEach(k=>{if(!db[k]||typeof db[k]!=="object")db[k]={};});
 db.members.forEach((m,i)=>{m.id=Number(m.id)||i+1;m.active=m.active!==false;m.role=normalizeRole(m.role);m.slot=m.role==="member"?[1,2,3].includes(Number(m.slot))?Number(m.slot):1:m.role==="admin"&&[1,2,3].includes(Number(m.slot))?Number(m.slot):null;m.password=String(m.password||"1234");m.changeCount=Number(m.changeCount)||0;m.mustChangePassword=!!m.mustChangePassword;});
}
normalizeDb();

async function importBackup(file){
 if(!canAdmin()||!file)return;
 try{
   const text=await file.text(), payload=JSON.parse(text);
   if(payload?.format!=="don-bosco-perfectionnement-backup" || !payload.db || !payload.calendarData) throw new Error("Format invalide");
   if(!confirm("Importer cette sauvegarde remplacera les données locales actuelles. Continuer ?")) return;
   db=payload.db; calendarData=payload.calendarData; appUsers=payload.appUsers||appUsers;
   normalizeDb();
   if(!calendarData||typeof calendarData!=="object") calendarData={weeks:{},events:[]};
   if(!calendarData.weeks||typeof calendarData.weeks!=="object") calendarData.weeks={};
   if(!Array.isArray(calendarData.events)) calendarData.events=[];
   // Revalider les structures minimales avant écriture.
   if(!Array.isArray(db.members)||!db.attendance||!calendarData.weeks||!Array.isArray(calendarData.events)) throw new Error("Structure de sauvegarde invalide");
   addActionLog("Import de sauvegarde",`Fichier : ${file.name}`);
   save(); saveCalendar(); saveUsers();
   render(); toast("Sauvegarde importée avec succès.");
 }catch(e){ console.error(e); toast("Sauvegarde invalide ou impossible à importer."); }
}

function adminMemberCard(m){
 const role=getMemberRole(m), isStaff=role!=="member", declared=isStaff?0:getDeclaredPresenceCount(m.id), effective=isStaff?null:getEffectiveSlot(m.id), st=isStaff?"pending":getStatus(m.id), labels={present:"Présent",absent:"Absent",pending:"À confirmer"};
 const roleLabel=ROLE_LABELS[role]||role;
 const accountButtons=canManageRoles()?`${m.authEmail?`<button onclick="manageMemberAccount(${m.id})">Gérer le compte</button>`:`<button onclick="createMemberAccount(${m.id})">Créer le compte</button>`}<button onclick="changeMemberPassword(${m.id})">Réinitialiser le mot de passe</button><button class="danger" onclick="removeMember(${m.id})">Désactiver</button>`:"";
 if(isStaff){
   const slotText=role==="admin" ? (m.slot?slotLabel(m.slot):"Sans créneau") : "Sans créneau";
   return `<div class="card admin-member-card"><div class="row"><div><strong>${esc(m.name)}</strong><div class="muted">${roleLabel} · ${slotText}</div></div><div class="status pending"><span class="dot"></span>${roleLabel}</div></div><div class="admin-attendance-controls"><div class="muted">Ce compte n'est pas soumis au suivi de présence des adhérents.</div><div class="actions">${accountButtons}</div>${canManageRoles()?`<div class="habitual-slot-admin"><span class="muted">Créneau habituel :</span>${role==="admin"?`<select onchange="setMemberHabitualSlot(${m.id},this.value)"><option value="" ${!m.slot?"selected":""}>Aucun</option><option value="1" ${Number(m.slot)===1?"selected":""}>Créneau 1</option><option value="2" ${Number(m.slot)===2?"selected":""}>Créneau 2</option><option value="3" ${Number(m.slot)===3?"selected":""}>Créneau 3</option></select>`:`<span class="muted">Aucun créneau pour un encadrant</span>`}</div>`:""}</div></div>`;
 }
 return `<div class="card admin-member-card"><div class="row"><div><strong>${esc(m.name)}</strong><div class="muted">${slotLabel(m.slot)} · ${declared} présence${declared>1?"s":""} déclarée${declared>1?"s":""} au total · vient au ${effective} cette semaine</div></div><div class="status ${st}"><span class="dot"></span>${labels[st]}</div></div><div class="admin-attendance-controls"><span class="muted">Statut pour la semaine du ${fmt(weekKey())} :</span><div class="actions"><button class="${st==='present'?'primary':''}" onclick="setStatus(${m.id},'present')">Présent</button><button class="${st==='absent'?'danger':''}" onclick="setStatus(${m.id},'absent')">Absent</button><button class="${st==='pending'?'secondary':''}" onclick="setStatus(${m.id},'pending')">À confirmer</button><button onclick="changeSlot(${m.id})">Changer de créneau cette semaine</button>${accountButtons}</div>${canManageRoles()?`<div class="habitual-slot-admin"><span class="muted">Créneau habituel :</span><select onchange="setMemberHabitualSlot(${m.id},this.value)"><option value="1" ${Number(m.slot)===1?"selected":""}>Créneau 1</option><option value="2" ${Number(m.slot)===2?"selected":""}>Créneau 2</option><option value="3" ${Number(m.slot)===3?"selected":""}>Créneau 3</option></select></div>`:""}</div></div>`;
}

function requestTypeLabel(type){
 if(type==='slot_change') return 'Changement de créneau';
 if(type==='status_change') return 'Modification de présence';
 if(type==='absence') return 'Période d’absence';
 return 'Demande';
}
function requestStatusLabel(status){
 return status==='approved'?'Acceptée':status==='rejected'?'Refusée':status==='cancelled'?'Annulée':'En attente';
}
function requestDateLabel(ts){
 const d=safeDate(ts);
 if(!d) return 'date non renseignée';
 return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}
function requestWeekKey(r){
 const raw=r?.week||r?.eventDate;
 if(!raw) return '9999-12-31';
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return r?.week?String(raw):mondayKey(new Date(String(raw)+'T12:00:00'));
 return '9999-12-31';
}
function compareRequestWeekAsc(a,b){
 return requestWeekKey(a).localeCompare(requestWeekKey(b)) || Number(a.createdAt||a.id||0)-Number(b.createdAt||b.id||0);
}
function compareRequestWeekDesc(a,b){
 return requestWeekKey(b).localeCompare(requestWeekKey(a)) || Number(b.decidedAt||b.createdAt||b.id||0)-Number(a.decidedAt||a.createdAt||a.id||0);
}
function getAllRequestHistory(){
 const out=[];
 (db.moves||[]).forEach(r=>out.push({type:'slot_change',id:r.id,memberId:r.memberId,name:r.name||db.members.find(m=>Number(m.id)===Number(r.memberId))?.name||'Adhérent',week:r.week,status:r.status,createdAt:r.createdAt,decidedAt:r.approvedAt||r.rejectedAt||r.cancelledAt,from:r.from,to:r.to}));
 (db.statusRequests||[]).forEach(r=>out.push({type:'status_change',id:r.id,memberId:r.memberId,name:r.name||db.members.find(m=>Number(m.id)===Number(r.memberId))?.name||'Adhérent',week:r.week,eventDate:r.eventDate,requestedStatus:r.requestedStatus,status:r.status,createdAt:r.createdAt,decidedAt:r.approvedAt||r.rejectedAt||r.cancelledAt}));
 (db.absencePeriods||[]).forEach(r=>out.push({type:'absence',id:r.id,memberId:r.memberId,name:r.name||db.members.find(m=>Number(m.id)===Number(r.memberId))?.name||'Adhérent',start:r.start,end:r.end,status:r.status||'approved',createdAt:r.createdAt,decidedAt:r.decidedAt}));
 return out.sort((a,b)=>Number(b.createdAt||b.id||0)-Number(a.createdAt||a.id||0));
}
function renderRequestHistory(){
 const el=document.getElementById('request-historyView');
 if(!el)return;
 if(currentRole!=='member'){el.innerHTML='';return;}
 const me=currentMember();
 if(!me){el.innerHTML='<div class="card empty">Aucun adhérent connecté.</div>';return;}
 const requests=getAllRequestHistory().filter(r=>Number(r.memberId)===Number(me.id) && ['slot_change','status_change'].includes(r.type));
 const rows=requests.map(r=>{
   let detail='';
   if(r.type==='slot_change') detail=`Semaine du ${fmt(r.week)} · ${slotLabel(r.from)} → ${slotLabel(r.to)}`;
   else detail=`Séance du ${fmt(r.eventDate||r.week)} · statut demandé : ${({present:'Présent',absent:'Absent',pending:'À confirmer'})[r.requestedStatus]||r.requestedStatus}`;
   let requestAction='';
   if(r.type==='slot_change' && r.status==='approved') requestAction=`<button class="danger" onclick="cancelApprovedMoveAndMarkAbsent(${r.id})">Annuler le changement · Absent</button>`;
   else if(r.type==='slot_change' && r.status==='rejected') requestAction=`<button onclick="reopenRejectedMove(${r.id})">Réouvrir la demande</button>`;
   else if(r.status==='pending') requestAction=`<button class="danger" onclick="cancelMyRequest('${r.type}',${r.id})">Annuler</button>`;
   return `<div class="request-history-row"><div><strong>${requestTypeLabel(r.type)}</strong><div class="muted">${detail}</div><div class="muted">Demandée le ${requestDateLabel(r.createdAt)}${r.decidedAt?` · ${r.status==='cancelled'?'annulée':'traitée'} le ${requestDateLabel(r.decidedAt)}`:''}</div></div><div class="actions"><span class="status ${r.status}"><span class="dot"></span>${requestStatusLabel(r.status)}</span>${requestAction}</div></div>`;
 }).join('');
 el.innerHTML=`<div class="card"><div class="row"><div><p class="eyebrow">DEMANDES</p><h2>Historique de mes demandes</h2><div class="muted">Retrouvez toutes vos demandes de changement de créneau et de modification de présence.</div></div><div class="history-summary"><strong>${requests.length}</strong><span>demandes</span></div></div>${rows?`<div class="request-history-list">${rows}</div>`:`<div class="empty">Aucune demande effectuée.</div>`}</div>`;
}
async function cancelApprovedMoveAndMarkAbsent(id){
 if(currentRole!=='member') return toast('Cette action est réservée aux adhérents.');
 const r=(db.moves||[]).find(x=>Number(x.id)===Number(id));
 const me=currentMember();
 if(!r||r.status!=='approved') return toast('Ce changement n’est plus actif.');
 if(!me||Number(r.memberId)!==Number(me.id)) return toast('Vous ne pouvez modifier que votre propre demande.');
 if(!confirm('Annuler ce changement de créneau et indiquer votre absence pour cette semaine ?')) return;
 const key=r.week||weekKey();
 r.status='cancelled'; r.cancelledAt=Date.now(); r.cancelReason='absence';
 db.attendance[key+'_'+me.id]='absent';
 save();
 try{
   if(window.v53?.enabled && v53Session()) await v53SyncRemote();
   render();
   toast('Changement de créneau annulé : vous êtes indiqué absent.');
 }catch(e){
   r.status='approved'; delete r.cancelledAt; delete r.cancelReason;
   save(); render();
   toast('Impossible d’annuler le changement.');
 }
}
async function reopenRejectedMove(id){
 if(currentRole!=='member') return toast('Cette action est réservée aux adhérents.');
 const r=(db.moves||[]).find(x=>Number(x.id)===Number(id));
 const me=currentMember();
 if(!r||r.status!=='rejected') return toast('Cette demande ne peut plus être réouverte.');
 if(!me||Number(r.memberId)!==Number(me.id)) return toast('Vous ne pouvez modifier que votre propre demande.');
 if(!confirm('Réouvrir cette demande de changement de créneau ? Elle sera de nouveau soumise à validation.')) return;
 r.status='pending'; delete r.rejectedAt; delete r.autoRejected; r.reopenedAt=Date.now();
 save();
 try{
   if(window.v53?.enabled && v53Session()) await v53SyncRemote();
   render();
   toast('Demande réouverte et remise en attente de validation.');
 }catch(e){
   r.status='rejected'; r.rejectedAt=Date.now(); save(); render();
   toast('Impossible de réouvrir la demande.');
 }
}

async function cancelMyRequest(type,id){
 if(currentRole!=='member') return toast('Cette action est réservée aux adhérents.');
 const collection=type==='slot_change'?db.moves: type==='status_change'?db.statusRequests:null;
 if(!collection) return;
 const r=collection.find(x=>Number(x.id)===Number(id));
 if(!r||r.status!=='pending') return toast('Cette demande a déjà été traitée.');
 const me=currentMember();
 if(!me||Number(r.memberId)!==Number(me.id)) return toast('Vous ne pouvez pas annuler cette demande.');
 if(!confirm('Annuler cette demande ?')) return;
 r.status='cancelled'; r.cancelledAt=Date.now();
 save();
 try{
   if(window.v53?.enabled && v53Session()) await v53SyncRemote();
   render();
   toast('Demande annulée.');
 }catch(e){
   r.status='pending'; delete r.cancelledAt; save();
   toast('Impossible d’annuler la demande.');
 }
}

function setAdminRequestFilter(value){
 adminRequestFilter=["pending","processed","all"].includes(value)?value:"pending";
 localStorage.setItem("sportclub-admin-request-filter",adminRequestFilter);
 renderMoves();
}
function setAdminRequestVisibility(type){ if(!canAdmin())return; if(!db.adminRequestVisibility)db.adminRequestVisibility={cancelled:false,rejected:false}; db.adminRequestVisibility[type]=!db.adminRequestVisibility[type]; save(); renderMoves(); }
function renderMoves(){
 const currentWeek=weekKey();
 const pending=db.moves.filter(m=>m.status==='pending').sort((a,b)=>
   requestWeekKey(a).localeCompare(requestWeekKey(b))||
   getChangeCount(a.memberId)-getChangeCount(b.memberId)||
   Number(a.createdAt||a.id||0)-Number(b.createdAt||b.id||0)
 );
 const pendingStatusRequests=(db.statusRequests||[]).filter(r=>r.status==='pending').sort(compareRequestWeekAsc);
 const history=getAllRequestHistory().filter(r=>['slot_change','status_change'].includes(r.type));
 const processed=history.filter(r=>r.status!=='pending' && !((r.status==='cancelled'&&db.adminRequestVisibility?.cancelled)||(r.status==='rejected'&&db.adminRequestVisibility?.rejected))).sort(compareRequestWeekDesc);
 const showPending=adminRequestFilter==='pending'||adminRequestFilter==='all';
 const showProcessed=adminRequestFilter==='processed'||adminRequestFilter==='all';
 const visibilityButtons=`<div class="request-visibility-tools"><button class="secondary" onclick="setAdminRequestVisibility('cancelled')">${db.adminRequestVisibility?.cancelled?'Afficher':'Masquer'} les demandes annulées</button><button class="secondary" onclick="setAdminRequestVisibility('rejected')">${db.adminRequestVisibility?.rejected?'Afficher':'Masquer'} les demandes refusées</button></div>`;
 const historyHtml=showProcessed&&processed.length?processed.map(r=>{
   let detail='';
   if(r.type==='slot_change') detail=`Semaine du ${fmt(r.week)} · ${slotLabel(r.from)} → ${slotLabel(r.to)}`;
   else detail=`Séance du ${fmt(r.eventDate||r.week)} · statut demandé : ${({present:'Présent',absent:'Absent',pending:'À confirmer'})[r.requestedStatus]||r.requestedStatus}`;
   return `<div class="card request-history-admin-row"><div class="row"><div><strong>${esc(r.name)}</strong><div class="muted">${requestTypeLabel(r.type)} · ${detail}</div><div class="muted">Demandée le ${requestDateLabel(r.createdAt)}${r.decidedAt?` · traitée le ${requestDateLabel(r.decidedAt)}`:''}</div></div><div><span class="status ${r.status}"><span class="dot"></span>${requestStatusLabel(r.status)}</span></div></div></div>`;
 }).join(''):'<div class="empty">Aucune demande traitée.</div>';
 const counts=SLOT_NAMES.map((n,i)=>getControlPresence(i+1,currentWeek));
 const targetPending=SLOT_NAMES.map((n,i)=>db.moves.filter(m=>m.status==='pending'&&Number(m.to)===i+1).length);
 const statusRequestHtml=showPending&&pendingStatusRequests.length?pendingStatusRequests.map(r=>{const name=r.name||db.members.find(m=>Number(m.id)===Number(r.memberId))?.name||'Adhérent';return `<div class="card"><div class="row"><div><strong>${esc(name)}</strong><div class="muted">Modification de présence · séance du ${fmt(r.eventDate||r.week)} · souhaité : <strong>${({present:'Présent',absent:'Absent',pending:'À confirmer'})[r.requestedStatus]||r.requestedStatus}</strong></div><div class="muted">Envoyée le ${requestDateLabel(r.createdAt)}</div></div><div class="actions"><button class="primary" onclick="approveStatusRequest(${r.id})">Valider</button><button class="danger" onclick="rejectStatusRequest(${r.id})">Refuser</button></div></div></div>`;}).join(''):'<div class="empty">Aucune demande de modification de présence en cours.</div>';
 const moveHtml=showPending&&pending.length?pending.map((x,index)=>{const name=x.name||db.members.find(m=>Number(m.id)===Number(x.memberId))?.name||'Adhérent';return `<div class="card"><div class="row"><div><strong>${index+1}. ${esc(name)}</strong><div class="muted">Demande de changement · semaine du ${fmt(x.week)} · ${slotLabel(x.from)} → ${slotLabel(x.to)}</div><div class="muted">${getChangeCount(x.memberId)} changement${getChangeCount(x.memberId)>1?'s':''} déjà effectué${getChangeCount(x.memberId)>1?'s':''} · envoyée le ${requestDateLabel(x.createdAt)}</div></div><div class="actions"><button class="primary" onclick="approveMove(${x.id})">Valider</button><button class="danger" onclick="rejectMove(${x.id})">Refuser</button></div></div></div>`;}).join(''):'<div class="empty">Aucune demande de changement de créneau en cours.</div>';
 const pendingTotal=pending.length+pendingStatusRequests.length;
 const processedTotal=processed.length;
 document.getElementById('movesView').innerHTML=`<div class="card"><div class="row"><div><h2>Demandes</h2>${visibilityButtons}<div class="muted">Filtrez les demandes en cours ou déjà traitées.</div></div><button class="primary" onclick="forceValidateMoves()">Lancer le traitement 13h30</button></div><div class="request-filter" role="group" aria-label="Filtrer les demandes"><button class="filter-btn ${adminRequestFilter==='pending'?'active':''}" onclick="setAdminRequestFilter('pending')">En cours (${pendingTotal})</button><button class="filter-btn ${adminRequestFilter==='processed'?'active':''}" onclick="setAdminRequestFilter('processed')">Traitées (${processedTotal})</button><button class="filter-btn ${adminRequestFilter==='all'?'active':''}" onclick="setAdminRequestFilter('all')">Toutes</button></div><div class="move-capacity">${SLOT_NAMES.map((n,i)=>`<span><strong>${n}</strong> ${counts[i]}/20 présents · ${targetPending[i]} demande${targetPending[i]>1?'s':''} en attente vers ce créneau</span>`).join('')}</div></div>${showPending?`<h3 class="request-section-title">Demandes en attente de modification de présence</h3>${statusRequestHtml}<h3 class="request-section-title">Demandes en attente de changement de créneau</h3>${moveHtml}`:''}${showProcessed?`<h3 class="request-section-title">Demandes traitées</h3>${historyHtml}`:''}`;
}
async function setMemberRole(id,role){
 if(!canManageRoles()) return toast("Seul l'administrateur peut gérer les rôles.");
 if(!["member","coach","admin"].includes(role)) return;
 const m=db.members.find(x=>x.id===Number(id)); if(!m)return;
 // La protection contre l'auto-démotion doit comparer l'identité Auth réelle,
 // jamais seulement currentMemberId (qui peut être un ancien identifiant local).
 if(v66IsCurrentAuthenticatedMember(m.id) && authState==="admin" && role!=="admin") return toast("Vous modifiez votre propre compte administrateur. Pour conserver le mode administrateur, modifiez ce rôle depuis un autre compte admin.");
 if(role==="member" && ![1,2,3].includes(Number(m.slot))){
   const requested=Number(prompt("Créneau habituel obligatoire pour un adhérent (1, 2 ou 3) :","1"));
   if(![1,2,3].includes(requested)) return toast("Créneau invalide.");
   if(getActiveSlotCount(requested,m.id)>=getSlotQuota(requested)) return toast(`Le ${slotLabel(requested)} a atteint son quota (${getSlotQuota(requested)}).`);
   m.slot=requested;
 }
 if(role==="coach") m.slot=null;
 // Pour un administrateur, on conserve le créneau existant s'il existe : il est facultatif.
 m.role=role; addActionLog("Modification de rôle",`${m.name} → ${ROLE_LABELS[role]}${role==="coach"?" · sans créneau":role==="admin"?(m.slot?` · ${slotLabel(m.slot)}`:" · sans créneau"): ` · ${slotLabel(m.slot)}`}`); save();
 syncRoleSelector(); render(); toast(`Rôle de ${m.name} : ${ROLE_LABELS[role]}.`);
}

function addMember(){
 if(!canAdmin()) return toast("Seul l’administrateur peut ajouter un adhérent.");
 const name=prompt("Nom et prénom :"); if(!name)return;
 const cleanName=name.trim(); if(!cleanName)return;
 const roleInput=prompt("Rôle : member = Adhérent, coach = Encadrant, admin = Administrateur","member");
 if(roleInput===null)return;
 const role=String(roleInput).trim().toLowerCase();
 if(!["member","coach","admin"].includes(role)) return toast("Rôle invalide. Utilisez member, coach ou admin.");
 let slot=null;
 if(role==="member"){
   slot=Number(prompt("Créneau habituel (1, 2 ou 3) :"));
   if(![1,2,3].includes(slot))return toast("Créneau invalide");
   if(getActiveSlotCount(slot)>=getSlotQuota(slot))return toast("Ce créneau est complet.");
 } else if(role==="admin"){
   const raw=prompt("Créneau habituel pour l'administrateur (1, 2, 3 ou vide pour aucun) :","");
   if(raw===null)return;
   if(String(raw).trim()!==""){ slot=Number(raw); if(![1,2,3].includes(slot))return toast("Créneau invalide"); if(getActiveSlotCount(slot)>=getSlotQuota(slot))return toast("Ce créneau est complet."); }
 }
 const member={id:Date.now(),name:cleanName,slot,active:true,changeCount:0,password:"1234",role};
 db.members.push(member);
 addActionLog("Ajout d’adhérent",`${member.name} · ${ROLE_LABELS[role]}${slot?` · ${slotLabel(slot)}`:" · sans créneau"}`);
 save();
 renderMembers();
 toast(`${ROLE_LABELS[role]} ${member.name} ajouté${slot?` dans ${slotLabel(slot)}`:" sans créneau"}.`);
}

function removeMember(id){if(!canManageRoles()) return toast("Seul l’administrateur peut désactiver un adhérent."); if(confirm("Désactiver cet adhérent ?")){db.members.find(m=>m.id===id).active=false;save();render();}}
function changeSlot(id){
 const m=db.members.find(x=>x.id===id), to=Number(prompt("Nouveau créneau (1, 2 ou 3) :",m.slot));
 if(![1,2,3].includes(to)||to===m.slot)return;
 if(getActiveSlotCount(to)>=getSlotQuota(to))return toast(`Le ${slotLabel(to)} a atteint son quota (${getSlotQuota(to)}).`);
 db.moves.push({id:Date.now(),memberId:id,name:m.name,from:m.slot,to,week:weekKey(),status:"pending",createdAt:Date.now(),adminChange:true}); addActionLog("Demande de changement créée",`${m.name} · ${slotLabel(to)}`); save();render();toast("Demande créée");
}
function approveMove(id,auto=false){
 const x=db.moves.find(m=>m.id===id), member=db.members.find(m=>m.id===x?.memberId);
 if(!x||x.status!=="pending"||!member)return false;
 if(x.week&&x.week!==weekKey())return false;
 const targetWeek=x.week||weekKey();
 const occupied=getControlPresence(x.to,targetWeek);
 const quota=getSlotQuota(x.to);
 // Une demande est validable tant qu'il reste une place dans le quota.
 // À 13h30, le traitement utilise également les absences constatées comme capacité disponible,
 // dans la limite historique de 25 personnes sur le créneau.
 const canByQuota=occupied<quota;
 if(!canByQuota) return false;
 x.status="approved";x.approvedAt=Date.now();x.autoApproved=!!auto;
 member.changeCount=Number(member.changeCount||0)+1;
 save();return true;
}
function getNextAttendanceWeekAndDate(){
 const today=isoDate(new Date());
 const candidates=[];
 const seen=new Set();

 // Une semaine de présence est déterminée par son statut du calendrier :
 // Cours, Libre ou Cours annulé (ce dernier compte comme Libre).
 // Si aucun événement daté n'est présent, le lundi de la semaine est la
 // date de référence. V112 exigeait à tort un événement "Cours/Libre"
 // pour les semaines définies directement dans calendarData.weeks.
 Object.entries(calendarData.weeks||{}).forEach(([key,info])=>{
   if(!isDateInCalendarPeriod(key) || key<today) return;
   const type=info?.type;
   if(type!=='course'&&type!=='off'&&type!=='cancelled') return;
   const dates=getAttendanceEventDates(key);
   const date=dates.find(d=>d>=today)||key;
   if(date>=today && !seen.has(key)){
     seen.add(key);
     candidates.push({week:key,date});
   }
 });

 // Les événements Cours/Libre/Cours annulé ajoutés manuellement peuvent
 // également créer une date de présence dans une semaine.
 calendarData.events.filter(e=>{
   const title=String(e.title||'').trim().toLowerCase();
   return title==='cours'||title==='libre'||title==='cours annulé';
 }).forEach(e=>{
   if(!e.date||e.date<today||!isDateInCalendarPeriod(e.date)) return;
   const key=mondayKey(new Date(e.date+'T12:00:00'));
   if(!seen.has(key)){
     seen.add(key);
     candidates.push({week:key,date:e.date});
   }
 });

 candidates.sort((a,b)=>a.date.localeCompare(b.date)||a.week.localeCompare(b.week));
 return candidates[0]||null;
}

function allMembersRespondedForTargetSlot(key,slot){
 const target=Number(slot);
 if(![1,2,3].includes(target)) return false;
 // En mode forcé, on vérifie uniquement les adhérents du créneau cible
 // de la demande. Il est inutile de bloquer une demande vers le créneau 2
 // parce qu'un adhérent du créneau 1 ou 3 n'a pas encore répondu.
 const members=db.members.filter(m=>isAdherent(m)&&getEffectiveSlot(m.id,key)===target);
 return members.every(m=>hasDefinitiveResponse(m.id,key));
}

function getMovePriorityList(key){
 return getWeekMoves(key).filter(m=>m.status==='pending').sort((a,b)=>
   getChangeCount(a.memberId)-getChangeCount(b.memberId)||
   Number(a.createdAt||a.id||0)-Number(b.createdAt||b.id||0)
 );
}

function autoValidateMoves(mode='automatic'){
 const target=getNextAttendanceWeekAndDate();
 if(!target){
   toast('Aucune prochaine date Cours ou Libre à traiter.');
   return {processed:0,approved:0,rejected:0,remaining:0,week:null,date:null};
 }
 const key=target.week;
 const pending=getMovePriorityList(key);
 if(!pending.length){
   toast(`Aucune demande de changement en attente pour le ${fmt(target.date)}.`);
   return {processed:0,approved:0,rejected:0,remaining:0,week:key,date:target.date};
 }

 // Exécution forcée : pour chaque demande, on vérifie uniquement que
 // tous les adhérents du créneau cible ont répondu Présent ou Absent.
 // Les autres créneaux ne bloquent pas le traitement de cette demande.
 const forcedSlotReady={};
 // Réserve immédiatement les places consommées par les demandes acceptées
 // pendant ce même traitement. Le demandeur peut être encore « À confirmer »
 // et ne doit donc pas apparaître dans getControlPresence(); néanmoins une
 // demande acceptée occupe bien une place pour les suivantes.
 const reservedBySlot={};

 let approved=0,rejected=0;
 pending.forEach(x=>{
   const current=db.moves.find(m=>Number(m.id)===Number(x.id));
   const member=db.members.find(m=>Number(m.id)===Number(x.memberId));
   if(!current||current.status!=='pending'||!member||!member.active) return;

   // En exécution forcée, la demande est traitée uniquement si tous les
   // adhérents du créneau cible ont répondu. Le contrôle est mémorisé par
   // créneau afin de ne pas recalculer inutilement les trois créneaux.
   if(mode==='forced'){
     const targetSlot=Number(current.to);
     if(forcedSlotReady[targetSlot]===undefined){
       forcedSlotReady[targetSlot]=allMembersRespondedForTargetSlot(key,targetSlot);
     }
     if(!forcedSlotReady[targetSlot]) return;
   }

   // Présence de contrôle sur la semaine réellement traitée.
   // Une demande acceptée dans ce traitement réserve une place même si
   // le membre est encore « À confirmer » et n'est donc pas compté par
   // getControlPresence().
   const occupied=getControlPresence(current.to,key) + Number(reservedBySlot[Number(current.to)]||0);
   const canFit=occupied<20;
   if(canFit){
     reservedBySlot[Number(current.to)]=(reservedBySlot[Number(current.to)]||0)+1;
     current.status='approved';
     current.approvedAt=Date.now();
     current.autoApproved=mode==='automatic';
     current.forcedApproved=mode==='forced';
     member.changeCount=Number(member.changeCount||0)+1;
     approved++;
   }else{
     current.status='rejected';
     current.rejectedAt=Date.now();
     current.autoRejected=mode==='automatic';
     current.forcedRejected=mode==='forced';
     rejected++;
   }
 } );

 const remaining=getWeekMoves(key).filter(m=>m.status==='pending').length;
 if(approved||rejected){
   save();
   render();
 }
 const label=mode==='forced'?'forcé':'automatique';
 toast(`${approved} acceptée${approved>1?'s':''}, ${rejected} refusée${rejected>1?'s':''} · ${label} · ${fmt(target.date)}.`);
 return {processed:approved+rejected,approved,rejected,remaining,week:key,date:target.date};
}

function forceValidateMoves(){
 return autoValidateMoves('forced');
}

function scheduleAutoValidation(){
 const now=new Date();
 if(now.getHours()===13&&now.getMinutes()===30){
   const marker=now.getFullYear()+"-"+(now.getMonth()+1)+"-"+now.getDate();
   if(localStorage.getItem("sportclub-auto-validation-date")!==marker){
     localStorage.setItem("sportclub-auto-validation-date",marker);
     autoValidateMoves('automatic');
   }
 }
}

function approveStatusRequest(id){
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 const r=(db.statusRequests||[]).find(x=>x.id===id&&x.status==="pending");
 if(!r)return;
 const m=db.members.find(x=>x.id===Number(r.memberId));
 if(!m)return;
 db.attendance[r.week+"_"+r.memberId]=r.requestedStatus;
 r.status="approved";r.approvedAt=Date.now();
 save();render();toast("Modification de statut validée.");
}
function rejectStatusRequest(id){
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 const r=(db.statusRequests||[]).find(x=>x.id===id&&x.status==="pending");
 if(!r)return;
 r.status="rejected";r.rejectedAt=Date.now();
 save();render();toast("Demande de modification refusée.");
}

function rejectMove(id){const x=db.moves.find(m=>m.id===id);if(!x)return;x.status="rejected";x.rejectedAt=Date.now();save();render();toast("Demande refusée");}
function notifySlot(slot){
 if("Notification" in window && Notification.permission==="granted") new Notification("Don Bosco - Perfectionnement",{body:`Rappel : merci de confirmer votre présence au créneau ${slot}.`});
 else toast("Activez les notifications du navigateur pour envoyer les rappels.");
}
function reorderTabsForRole(){
 const nav=document.querySelector('.top-tabs');
 if(!nav) return;
 const byView=view=>nav.querySelector(`.tab[data-view="${view}"]`);
 const orders={
   member:['dashboard','member-history','request-history','objectives','calendar','events'],
   coach:['tdb','objectives','member-history','dashboard','moves','calendar','events'],
   admin:['members','tdb','dashboard','moves','calendar','events','notifications','messages']
 };
 const order=orders[currentRole]||orders.member;
 // Recompose the navigation from scratch in the exact role-specific order.
 // This also prevents hidden tabs from affecting the visible sequence.
 const fragment=document.createDocumentFragment();
 order.forEach(view=>{ const tab=byView(view); if(tab) fragment.appendChild(tab); });
 nav.appendChild(fragment);
 const presenceTab=byView('dashboard');
 if(presenceTab) presenceTab.firstChild && (presenceTab.childNodes[0].nodeValue='Présences');
}
function syncTabs(){
 reorderTabsForRole();
 const requestHistoryTab=document.getElementById("requestHistoryTab");
 if(requestHistoryTab) requestHistoryTab.style.display=(currentRole==="member")?"":"none";
 const movesTab=document.getElementById("movesTab");
 if(movesTab) movesTab.style.display=canCoach()?"":"none";
 const objectivesTab=document.getElementById("objectivesTab");
 if(objectivesTab) objectivesTab.style.display=(currentRole==="member"||currentRole==="coach")?"":"none";
 const followTab=document.querySelector('.tab[data-view="member-history"]');
 if(followTab) followTab.style.display=(currentRole==="coach"||currentRole==="member")?"":"none";
 const membersTab=document.getElementById("membersTab");
 const tdbTab=document.getElementById("tdbTab");
 if(membersTab) membersTab.style.display=canAdmin()?"":"none";
 if(tdbTab) tdbTab.style.display=canCoach()?"":"none";
 const messagesTab=document.getElementById("messagesTab");
 if(messagesTab){const hasVisibleMemberMessages=(db.adminMessages||[]).some(x=>Number(x.memberId)===Number(currentMemberId)&&x.visible!==false);messagesTab.style.display=canAdmin()?"":(currentRole==="member"&&hasVisibleMemberMessages?"":"none");}
 const notifTab=document.getElementById("notificationsTab");
 if(notifTab) notifTab.style.display=canAdmin()?"":"none";
 const active=document.querySelector(".tab.active");
 if(active && active.style.display==="none"){ const fallback=canCoach()?tdbTab:document.querySelector(".tab[data-view=\"dashboard\"]"); if(fallback) fallback.click(); }
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
 if(b.style.display==="none") return;
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");
 document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));
 document.getElementById(b.dataset.view+"View").classList.remove("hidden");
 if(b.dataset.view==="calendar")renderCalendar();
 if(b.dataset.view==="events")renderEvents();
 if(b.dataset.view==="member-history")renderMemberHistory();
 if(b.dataset.view==="tdb")renderTdb();
 if(b.dataset.view==="objectives")renderObjectives();
 if(b.dataset.view==="notifications")renderNotifications();
 if(b.dataset.view==="messages")renderMessages();
});
document.getElementById("notifyBtn").onclick=async()=>{if(!("Notification" in window))return toast("Notifications non supportées par ce navigateur."); const p=await Notification.requestPermission();toast(p==="granted"?"Notifications activées":"Notifications non activées")};
function toast(t){const x=document.getElementById("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2500)}

const roleSelect=document.getElementById("roleSelect");
function switchMode(mode){
 if(mode==="member"){
   // Un adhérent disposant aussi du rôle Encadrant/Administrateur peut
   // repasser en mode Adhérent pour retrouver l'affichage de son espace personnel.
   if(authState==="coach" || authState==="admin"){
     currentRole="member";
     localStorage.setItem("sportclub-role","member");
     hideMemberLogin();
     syncRoleSelector();
     render();
     return;
   }
   if(authState==="member" || !authState){
     currentRole="member";
     localStorage.setItem("sportclub-role","member");
     showMemberLogin();
   }
   syncRoleSelector(); render(); return;
 }
 if(authState!==mode && authState!=="admin") return;
 currentRole=mode; localStorage.setItem("sportclub-role",mode); syncRoleSelector(); hideMemberLogin(); render();
}
roleSelect.onchange=()=>switchMode(roleSelect.value);
syncRoleSelector();


if(memberLoggedIn && currentMember()){
 currentRole=getMemberRole(currentMember()); authState=currentRole; render(); syncRoleSelector();
} else if(staffLoggedIn && (authState==="admin" || authState==="coach")){
 currentRole=authState; render(); syncRoleSelector();
} else { currentRole="member"; authState=""; staffLoggedIn=false; localStorage.removeItem("sportclub-auth-role"); localStorage.removeItem("sportclub-staff-auth"); render(); showMemberLogin(); syncRoleSelector(); }

setInterval(scheduleAutoValidation, 15000);
scheduleAutoValidation();

// V51 — présence Supabase / préparation à la migration centralisée.
// Aucun secret serveur n'est accepté ici. La migration distante sera activée
// uniquement après configuration de Supabase Auth + RLS.
window.supabaseReady = false;
window.supabaseClient = null;
(function initSupabaseV51(){
  try{
    const cfg=window.SUPABASE_CONFIG||{};
    if(window.supabase && cfg.url && cfg.publishableKey){
      window.supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      window.supabaseReady=true;
      console.info('[V51] Supabase configuré. La migration centrale doit être activée après configuration Auth/RLS.');
    }else{
      console.info('[V51] Mode local : Supabase non configuré.');
    }
  }catch(e){ console.warn('[V51] Initialisation Supabase impossible.',e); }
})();

// V52 — configuration Supabase sécurisée.
// La connexion est initialisée ici uniquement avec la Publishable key.
// Les données métier restent en mode local tant que V53 n'a pas activé Auth + synchronisation.
window.supabaseReady = false;
window.supabaseClient = null;
window.supabaseSession = null;
(async function initSupabaseV52(){
  try{
    const cfg=window.SUPABASE_CONFIG||{};
    if(window.supabase && cfg.url && cfg.publishableKey){
      window.supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      window.supabaseReady=true;
      const {data}=await window.supabaseClient.auth.getSession();
      window.supabaseSession=data?.session||null;
      window.supabaseClient.auth.onAuthStateChange((_event,session)=>{
        window.supabaseSession=session||null;
        document.dispatchEvent(new CustomEvent('supabase-auth-change',{detail:{event:_event,session}}));
      });
      console.info('[V52] Supabase connecté :',cfg.url);
    }else{
      console.info('[V52] Supabase non configuré : mode local.');
    }
  }catch(e){
    console.warn('[V52] Initialisation Supabase impossible.',e);
  }
})();

// ============================================================
// V53 — Supabase Auth + synchronisation PostgreSQL
// ============================================================
// V53 remplace l'authentification locale par Supabase Auth.
// La Publishable key reste côté navigateur ; aucune clé secrète n'est utilisée.
window.v53 = { enabled:false, ready:false, syncing:false, hydrated:false, bootstraping:false, role:null, memberId:null, mustChangePassword:false, displayName:'' };
let v63AccountStatus = {};

function v53Client(){ return window.supabaseClient || null; }
function v53Session(){ return window.supabaseSession || null; }
function v53User(){ return v53Session()?.user || null; }
function v66IsCurrentAuthenticatedMember(memberId){
 const user=v53User();
 const currentUserId=v53User()?.id||'';
 if(!user || !currentUserId) return false;
 const account=v63AccountStatus[Number(memberId)];
 if(account?.user_id) return account.user_id===currentUserId;
 return Number(user.user_metadata?.member_id)===Number(memberId);
}
function v53ToastError(prefix,error){ console.error(prefix,error); toast(`${prefix} ${error?.message||"Erreur inconnue."}`); }

async function v53FetchProfile(){
  const sb=v53Client(), user=v53User();
  if(!sb || !user) return null;
  const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(error) throw error;
  return data||null;
}

function v53ResetLocalAuth(){
  currentRole='member'; authState=''; memberLoggedIn=false; staffLoggedIn=false;
  window.v53.displayName=''; currentMemberId=null;
  localStorage.removeItem('sportclub-member-auth');
  localStorage.removeItem('sportclub-staff-auth');
  localStorage.removeItem('sportclub-auth-role');
  localStorage.setItem('sportclub-role','member');
}

function v53MapWeekType(t){
  const x=String(t||'course');
  return ['course','free','holiday','public-holiday','off','cancelled'].includes(x)?x:'course';
}
function v53MapDbFromRemote(rows){
  const out={members:[],attendance:{},actualAttendance:{},quotas:{1:30,2:30,3:30},moves:[],absencePeriods:[],statusRequests:[],objectiveComments:[],objectiveReactions:[],coachNotesByDate:{},actionLog:[],adminMessages:[],adminMessageComments:[],notificationPrograms:{},manualNotification:{content:'',recipients:{member:true,coach:false,admin:false}}};
  const profiles=rows.profiles||[];
  const roleByMember=new Map(profiles.filter(p=>p.member_id!=null).map(p=>[Number(p.member_id),normalizeRole(p.role)]));
  out.members=(rows.members||[]).map(m=>{const prof=profiles.find(p=>Number(p.member_id)===Number(m.id));return {id:Number(m.id),name:m.name,slot:m.habitual_slot==null?null:Number(m.habitual_slot),active:m.active!==false,changeCount:Number(m.change_count||0),role:normalizeRole(m.role||roleByMember.get(Number(m.id))||'member'),authEmail:prof?.auth_email||'',profileId:prof?.id||'',mustChangePassword:!!prof?.must_change_password,notificationStatus:'none',notificationSubscriptions:0,notificationActiveSubscriptions:0,notificationDisabledByUser:false};});
  const pushByProfile=new Map();
  (rows.push_subscriptions||[]).forEach(sub=>{
    const key=String(sub.profile_id||''); if(!key) return;
    const item=pushByProfile.get(key)||{total:0,active:0,disabledByUser:false};
    item.total++;
    if(sub.active===true) item.active++;
    if(sub.disabled_by_user===true) item.disabledByUser=true;
    pushByProfile.set(key,item);
  });
  const profileIdByMember=new Map(profiles.filter(p=>p.member_id!=null).map(p=>[Number(p.member_id),String(p.id)]));
  out.members.forEach(m=>{
    const st=pushByProfile.get(profileIdByMember.get(Number(m.id))||'')||{total:0,active:0,disabledByUser:false};
    m.notificationSubscriptions=st.total; m.notificationActiveSubscriptions=st.active; m.notificationDisabledByUser=!!st.disabledByUser;
    m.notificationStatus=st.active>0?'active':(st.disabledByUser?'user_disabled':(st.total>0?'inactive':'none'));
  });
  (rows.quotas||[]).forEach(q=>{out.quotas[Number(q.slot)]=Number(q.quota);});
  (rows.attendance||[]).forEach(a=>{out.attendance[`${a.week_start}_${a.member_id}`]=a.status;});
  (rows.actual_attendance||[]).forEach(a=>{out.actualAttendance[`${a.week_start}_${a.slot}`]=Number(a.count||0);});
  out.moves=(rows.slot_change_requests||[]).map(x=>({id:Number(x.id),memberId:Number(x.member_id),name:out.members.find(m=>m.id===Number(x.member_id))?.name||'',from:out.members.find(m=>m.id===Number(x.member_id))?.slot||1,to:Number(x.requested_slot),week:x.week_start,status:x.status,createdAt:new Date(x.created_at).getTime(),approvedAt:x.decided_at?new Date(x.decided_at).getTime():0}));
  out.absencePeriods=(rows.absence_periods||[]).map(x=>({id:Number(x.id),memberId:Number(x.member_id),start:x.start_date,end:x.end_date,reason:x.reason||''}));
  out.statusRequests=(rows.status_change_requests||[]).map(x=>({id:Number(x.id),memberId:Number(x.member_id),name:out.members.find(m=>m.id===Number(x.member_id))?.name||'',week:x.week_start,requestedStatus:x.requested_status,status:x.status,eventDate:x.event_date||null,reason:x.reason||'',createdAt:new Date(x.created_at).getTime(),approvedAt:x.decided_at?new Date(x.decided_at).getTime():0}));
  out.sessionObjectives={};
  (rows.session_objectives||[]).forEach(x=>{out.sessionObjectives[x.session_date]=x.objective||'';});
  out.objectiveComments=(rows.objective_comments||[]).map(x=>({id:Number(x.id),sessionDate:x.session_date,memberId:Number(x.member_id),text:x.text,anonymous:!!x.anonymous,createdAt:new Date(x.created_at).getTime()}));
  out.objectiveReactions=(rows.objective_reactions||[]).map(x=>({sessionDate:x.session_date,memberId:Number(x.member_id),reaction:x.reaction,createdAt:new Date(x.created_at).getTime()}));
  (rows.coach_notes||[]).forEach(x=>{out.coachNotesByDate[x.session_date]=x.note||'';});
  out.adminMessages=(rows.admin_messages||[]).map(x=>({id:Number(x.id),memberId:Number(x.member_id),memberName:out.members.find(m=>m.id===Number(x.member_id))?.name||'Adhérent',text:x.content,visible:x.visible!==false,senderRole:x.sender_role||'member',senderProfileId:x.sender_profile_id||null,createdAt:new Date(x.created_at).getTime(),updatedAt:x.updated_at?new Date(x.updated_at).getTime():0}));
  out.adminMessageComments=(rows.admin_message_comments||[]).map(x=>({id:Number(x.id),messageId:Number(x.message_id),memberId:Number(x.member_id),text:x.content,senderRole:x.sender_role||'member',senderProfileId:x.sender_profile_id||null,createdAt:new Date(x.created_at).getTime()}));
  out.notificationPrograms={}; (rows.custom_notification_programs||[]).forEach(r=>{out.notificationPrograms[r.id]={id:r.id,active:r.active,title:r.title,content:r.content,mode:r.mode,days:r.days||[],weekTypes:r.week_types||[],time:String(r.send_time||'12:00').slice(0,5),recipients:{member:(r.recipients||[]).includes('member'),coach:(r.recipients||[]).includes('coach'),admin:(r.recipients||[]).includes('admin')}}});
  const mc=rows.manual_notification_settings?.[0]; if(mc) out.manualNotification={content:mc.content||'',recipients:{member:(mc.recipients||[]).includes('member'),coach:(mc.recipients||[]).includes('coach'),admin:(mc.recipients||[]).includes('admin')}};
  out.actionLog=(rows.action_log||[]).map(x=>({id:Number(x.id),date:x.created_at,actor:'Supabase',action:x.action,details:x.details||''}));
  return out;
}

function v53HasMeaningfulLocalData(){
  const members=Array.isArray(db?.members)?db.members:[];
  const attendance=Object.keys(db?.attendance||{}).length;
  const moves=Array.isArray(db?.moves)?db.moves.length:0;
  const abs=Array.isArray(db?.absencePeriods)?db.absencePeriods.length:0;
  const actual=Object.keys(db?.actualAttendance||{}).length;
  const status=Array.isArray(db?.statusRequests)?db.statusRequests.length:0;
  const events=Array.isArray(calendarData?.events)?calendarData.events.length:0;
  const weeks=Object.keys(calendarData?.weeks||{}).length;
  return members.length>0 && (attendance||moves||abs||actual||status||events || weeks>1);
}

async function v53LoadRemote(){
  const sb=v53Client(), user=v53User();
  if(!sb || !user) return false;
  const profile=await v53FetchProfile();
  if(!profile){
    throw new Error('Votre compte Supabase existe, mais aucun profil Don Bosco ne lui est associé. Un administrateur doit créer le profil.');
  }
  const forcedAt=profile.force_logout_at?Date.parse(profile.force_logout_at)/1000:0;
  const issuedAt=v68TokenIssuedAt();
  if(forcedAt && issuedAt && forcedAt>issuedAt+1){ const err=new Error('Cette session a été déconnectée par un administrateur.'); err.code='V68_FORCE_LOGOUT'; throw err; }
  v53.role=profile.role; v53.memberId=profile.member_id==null?null:Number(profile.member_id); v53.mustChangePassword=!!profile.must_change_password; v53.displayName=String(profile.display_name||'');
  currentMemberId=v53.memberId;
  authState=profile.role; currentRole=profile.role;
  memberLoggedIn=profile.role==='member'; staffLoggedIn=profile.role!=='member';
  localStorage.setItem('sportclub-role',currentRole);
  localStorage.setItem('sportclub-auth-role',authState);
  localStorage.setItem('sportclub-member-id',String(currentMemberId||''));

  // Première connexion administrateur : si la base est vide et qu'un ancien prototype
  // local contient déjà de vraies données, on le pousse une seule fois avant lecture.
  if(profile.role==='admin') {
    const probe=await sb.from('members').select('id').limit(1);
    if(!probe.error && (!probe.data||probe.data.length===0) && v53HasMeaningfulLocalData()) {
      console.info('[V53] Base vide : migration initiale depuis le prototype local.');
      v53.bootstraping=true;
      try{ await v53SyncRemote(); } finally { v53.bootstraping=false; }
    }
  }

  const names=['members','profiles','quotas','attendance','actual_attendance','slot_change_requests','absence_periods','status_change_requests','calendar_weeks','calendar_events','calendar_settings','session_objectives','objective_comments','objective_reactions','admin_messages','admin_message_comments','information_banner','custom_notification_programs','manual_notification_settings'];
  if(profile.role!=='member') names.push('coach_notes','action_log');
  if(profile.role==='admin') names.push('push_subscriptions');
  const results=await Promise.all(names.map(async table=>{
    const {data,error}=await sb.from(table).select('*');
    if(error) throw new Error(`${table}: ${error.message}`);
    return [table,data||[]];
  }));
  const rows=Object.fromEntries(results);
  const remoteDb=v53MapDbFromRemote(rows);
  // Les données distantes deviennent la source de vérité après connexion.
  db=remoteDb;
  normalizeDb();
  db.members.forEach(m=>{ delete m.password; });
  if(rows.information_banner?.[0]){ const b=rows.information_banner[0]; db.informationBanner={active:b.active!==false,content:b.content||''}; }
  if(rows.calendar_settings?.[0]){
    const c=rows.calendar_settings[0];
    calendarData.period={start:c.start_date,end:c.end_date};
  }
  calendarData.weeks={};
  (rows.calendar_weeks||[]).forEach(w=>{calendarData.weeks[w.week_start]={type:v53MapWeekType(w.week_type),label:w.label||w.week_type,reportDate:w.report_date||null};});
  calendarData.events=(rows.calendar_events||[]).map(e=>({id:Number(e.id),date:e.event_date,eventType:e.event_type,title:e.title,reportDate:e.report_date||null}));
  ensureCalendarCourseMondays();
  if(profile.role==='admin'){ await v63LoadAccountStatus(); await v121LoadCredentialEmailStatus(); await loadNotificationSettings(); try{ const {data:np}=await sb.from('custom_notification_programs').select('*'); (np||[]).forEach(r=>db.notificationPrograms[r.id]={...programSetting(r.id),id:r.id,active:r.active,title:r.title,content:r.content,mode:r.mode,days:r.days||[],weekTypes:r.week_types||[],time:String(r.send_time||'12:00').slice(0,5),recipients:{member:(r.recipients||[]).includes('member'),coach:(r.recipients||[]).includes('coach'),admin:(r.recipients||[]).includes('admin')}}); const {data:mn}=await sb.from('manual_notification_settings').select('*').eq('id',true).maybeSingle(); if(mn)db.manualNotification={content:mn.content||'',recipients:{member:(mn.recipients||[]).includes('member'),coach:(mn.recipients||[]).includes('coach'),admin:(mn.recipients||[]).includes('admin')}}; }catch(e){console.warn('[V130] paramètres personnalisés non chargés',e);} }
  v53.hydrated=true;
  return true;
}

async function v53DeleteInsertOwn(table, memberId, rows){
  const sb=v53Client();
  const {error:delError}=await sb.from(table).delete().eq('member_id',memberId);
  if(delError) throw delError;
  if(rows.length){ const {error}=await sb.from(table).insert(rows); if(error) throw error; }
}

async function v53SyncRemote(){
  const sb=v53Client(), user=v53User();
  if(!sb || !user || (!v53.hydrated && !v53.bootstraping)) return;
  if(v53.syncing) return;
  v53.syncing=true;
  try{
    const role=v53.role, mid=v53.memberId;
    // Tables communes : l'encadrement/admin peut synchroniser la totalité.
    if(role!=='member'){
      const members=(db.members||[]).map(m=>({id:Number(m.id),name:m.name,habitual_slot:[1,2,3].includes(Number(m.slot))?Number(m.slot):null,active:m.active!==false,change_count:Number(m.changeCount||0),role:normalizeRole(m.role)}));
      if(members.length){let r=await sb.from('members').upsert(members,{onConflict:'id'});if(r.error)throw r.error;}
      const profiles=await sb.from('profiles').select('id,member_id,role,active,display_name');
      if(profiles.error) throw profiles.error;
      const profileByMember=new Map((profiles.data||[]).filter(p=>p.member_id!=null).map(p=>[Number(p.member_id),p]));
      // Synchroniser les rôles uniquement pour les profils Auth déjà créés.
      for(const m of (db.members||[])){
        const p=profileByMember.get(Number(m.id));
        if(p && ['member','coach','admin'].includes(m.role) && p.role!==m.role){
          const ur=await sb.from('profiles').update({role:m.role,active:m.active!==false,display_name:m.name}).eq('id',p.id);
          if(ur.error) throw ur.error;
        }
      }
      const quotas=[1,2,3].map(slot=>({slot,quota:getSlotQuota(slot)}));
      let r=await sb.from('quotas').upsert(quotas,{onConflict:'slot'});if(r.error)throw r.error;
      const attendance=Object.entries(db.attendance||{}).map(([key,status])=>{const m=key.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);return m?{week_start:m[1],member_id:Number(m[2]),status,effective_slot:getEffectiveSlot(Number(m[2]),m[1])}:null;}).filter(Boolean);
      if(attendance.length){r=await sb.from('attendance').upsert(attendance,{onConflict:'week_start,member_id'});if(r.error)throw r.error;}
      const actual=Object.entries(db.actualAttendance||{}).map(([key,count])=>{const m=key.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);return m?{week_start:m[1],slot:Number(m[2]),count:Number(count)||0,updated_by:user.id}:null;}).filter(Boolean);
      if(actual.length){r=await sb.from('actual_attendance').upsert(actual,{onConflict:'week_start,slot'});if(r.error)throw r.error;}
      const moves=(db.moves||[]).map(x=>({id:Number(x.id),week_start:x.week,member_id:Number(x.memberId),requested_slot:Number(x.to),status:x.status,decided_at:(x.approvedAt||x.rejectedAt||x.cancelledAt)?new Date(x.approvedAt||x.rejectedAt||x.cancelledAt).toISOString():null,decided_by:user.id}));
      if(moves.length){r=await sb.from('slot_change_requests').upsert(moves,{onConflict:'id'});if(r.error)throw r.error;}
      const statuses=(db.statusRequests||[]).map(x=>({id:Number(x.id),member_id:Number(x.memberId),week_start:x.week,requested_status:x.requestedStatus,event_date:x.eventDate||null,reason:x.reason||null,status:x.status,decided_at:(x.approvedAt||x.rejectedAt||x.cancelledAt)?new Date(x.approvedAt||x.rejectedAt||x.cancelledAt).toISOString():null,decided_by:user.id}));
      if(statuses.length){r=await sb.from('status_change_requests').upsert(statuses,{onConflict:'id'});if(r.error)throw r.error;}
      const abs=(db.absencePeriods||[]).map(x=>({id:Number(x.id),member_id:Number(x.memberId),start_date:x.start,end_date:x.end,reason:x.reason||null}));
      if(abs.length){r=await sb.from('absence_periods').upsert(abs,{onConflict:'id'});if(r.error)throw r.error;}
      const weeks=Object.entries(calendarData.weeks||{}).map(([week_start,w])=>({week_start,week_type:v53MapWeekType(w.type),label:w.label||w.type,report_date:w.reportDate||null,updated_by:user.id}));
      if(weeks.length){r=await sb.from('calendar_weeks').upsert(weeks,{onConflict:'week_start'});if(r.error)throw r.error;}
      const events=(calendarData.events||[]).map(e=>({id:Number(e.id),event_date:e.date,event_type:eventTypeOf(e),title:eventDisplayTitle(e),report_date:eventReportDate(e)||null,created_by:user.id,updated_at:new Date().toISOString()}));
      if(events.length){r=await sb.from('calendar_events').upsert(events,{onConflict:'id'});if(r.error)throw r.error;}
      if(calendarData.period){r=await sb.from('calendar_settings').upsert({id:true,start_date:calendarData.period.start,end_date:calendarData.period.end,updated_by:user.id},{onConflict:'id'});if(r.error)throw r.error;}
      const objectives=(db.sessionObjectives?Object.entries(db.sessionObjectives):[]).map(([session_date,objective])=>({session_date,objective:String(objective||''),updated_by:user.id}));
      if(objectives.length){r=await sb.from('session_objectives').upsert(objectives,{onConflict:'session_date'});if(r.error)throw r.error;}
      const comments=(db.objectiveComments||[]).map(x=>({id:Number(x.id),session_date:x.sessionDate,member_id:Number(x.memberId),text:x.text,anonymous:!!x.anonymous}));
      if(comments.length){r=await sb.from('objective_comments').upsert(comments,{onConflict:'id'});if(r.error)throw r.error;}
      const reactions=(db.objectiveReactions||[]).map(x=>({session_date:x.sessionDate,member_id:Number(x.memberId),reaction:x.reaction}));
      if(reactions.length){r=await sb.from('objective_reactions').upsert(reactions,{onConflict:'session_date,member_id'});if(r.error)throw r.error;}
      const programs=Object.values(db.notificationPrograms||{}).map(p=>({id:Number(p.id),active:!!p.active,title:String(p.title||''),content:String(p.content||''),mode:p.mode==='week_types'?'week_types':'days',days:(p.days||[]).map(Number),week_types:p.weekTypes||[],send_time:String(p.time||'12:00'),recipients:Object.entries(p.recipients||{}).filter(([,v])=>v).map(([k])=>k),updated_by:user.id}));
      if(programs.length){r=await sb.from('custom_notification_programs').upsert(programs,{onConflict:'id'});if(r.error)throw r.error;}
      const manualCfg={id:true,content:String(db.manualNotification?.content||''),recipients:Object.entries(db.manualNotification?.recipients||{}).filter(([,v])=>v).map(([k])=>k),updated_by:user.id};
      r=await sb.from('manual_notification_settings').upsert(manualCfg,{onConflict:'id'});if(r.error)throw r.error;
      const adminMessages=(db.adminMessages||[]).map(x=>({id:Number(x.id),member_id:Number(x.memberId),content:String(x.text||''),visible:x.visible!==false,sender_profile_id:x.senderProfileId||null,sender_role:x.senderRole||'member',updated_at:new Date(x.updatedAt||x.createdAt||Date.now()).toISOString()}));
      if(adminMessages.length){r=await sb.from('admin_messages').upsert(adminMessages,{onConflict:'id'});if(r.error)throw r.error;}
      const adminMessageComments=(db.adminMessageComments||[]).map(x=>({id:Number(x.id),message_id:Number(x.messageId),member_id:Number(x.memberId),content:String(x.text||''),sender_profile_id:x.senderProfileId||null,sender_role:x.senderRole||'member'}));
      if(adminMessageComments.length){r=await sb.from('admin_message_comments').upsert(adminMessageComments,{onConflict:'id'});if(r.error)throw r.error;}
      const notes=Object.entries(db.coachNotesByDate||{}).map(([session_date,note])=>({session_date,note:String(note||''),updated_by:user.id}));
      if(notes.length){r=await sb.from('coach_notes').upsert(notes,{onConflict:'session_date'});if(r.error)throw r.error;}
    } else if(mid!=null){
      // Adhérent : uniquement ses propres données modifiables.
      const attendance=Object.entries(db.attendance||[]).map(([key,status])=>{const m=key.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);return m&&Number(m[2])===Number(mid)?{week_start:m[1],member_id:Number(mid),status,effective_slot:getEffectiveSlot(Number(mid),m[1])}:null;}).filter(Boolean);
      if(attendance.length){const ar=await sb.from('attendance').upsert(attendance,{onConflict:'week_start,member_id'});if(ar.error)throw ar.error;}
      const abs=(db.absencePeriods||[]).filter(x=>Number(x.memberId)===Number(mid)).map(x=>({id:Number(x.id),member_id:Number(mid),start_date:x.start,end_date:x.end,reason:x.reason||null}));
      await v53DeleteInsertOwn('absence_periods',mid,abs);
      const comments=(db.objectiveComments||[]).filter(x=>Number(x.memberId)===Number(mid)).map(x=>({id:Number(x.id),session_date:x.sessionDate,member_id:Number(mid),text:x.text,anonymous:!!x.anonymous}));
      if(comments.length){const r=await sb.from('objective_comments').upsert(comments,{onConflict:'id'});if(r.error)throw r.error;}
      const reactions=(db.objectiveReactions||[]).filter(x=>Number(x.memberId)===Number(mid)).map(x=>({session_date:x.sessionDate,member_id:Number(mid),reaction:x.reaction}));
      if(reactions.length){const r=await sb.from('objective_reactions').upsert(reactions,{onConflict:'session_date,member_id'});if(r.error)throw r.error;}
      const ownMoves=(db.moves||[]).filter(x=>Number(x.memberId)===Number(mid));
      const ownStatuses=(db.statusRequests||[]).filter(x=>Number(x.memberId)===Number(mid));
      // Les demandes créées par l'adhérent sont insérées une seule fois.
      for(const x of ownMoves){const payload={id:Number(x.id),week_start:x.week,member_id:Number(mid),requested_slot:Number(x.to),status:x.status||'pending',decided_at:(x.approvedAt||x.rejectedAt||x.cancelledAt)?new Date(x.approvedAt||x.rejectedAt||x.cancelledAt).toISOString():null,decided_by:user.id};const r=await sb.from('slot_change_requests').upsert(payload,{onConflict:'id'});if(r.error)throw r.error;}
      for(const x of ownStatuses){const payload={id:Number(x.id),member_id:Number(mid),week_start:x.week,requested_status:x.requestedStatus,event_date:x.eventDate||null,reason:x.reason||null,status:x.status||'pending',decided_at:(x.approvedAt||x.rejectedAt||x.cancelledAt)?new Date(x.approvedAt||x.rejectedAt||x.cancelledAt).toISOString():null,decided_by:user.id};const r=await sb.from('status_change_requests').upsert(payload,{onConflict:'id'});if(r.error)throw r.error;}
      const ownMessages=(db.adminMessages||[]).filter(x=>Number(x.memberId)===Number(mid)&&x.senderRole!=='admin').map(x=>({id:Number(x.id),member_id:Number(mid),content:String(x.text||''),visible:x.visible!==false,sender_profile_id:x.senderProfileId||user.id,sender_role:'member',updated_at:new Date(x.updatedAt||x.createdAt||Date.now()).toISOString()}));
      if(ownMessages.length){const r=await sb.from('admin_messages').upsert(ownMessages,{onConflict:'id'});if(r.error)throw r.error;}
      const ownMessageIds=(db.adminMessages||[]).filter(x=>Number(x.memberId)===Number(mid)).map(x=>Number(x.id));
      const ownMessageComments=(db.adminMessageComments||[]).filter(x=>ownMessageIds.includes(Number(x.messageId)) && String(x.senderRole||'member')==='member' && Number(x.memberId)===Number(mid)).map(x=>({id:Number(x.id),message_id:Number(x.messageId),member_id:Number(mid),content:String(x.text||''),sender_profile_id:x.senderProfileId||user.id,sender_role:'member'}));
      if(ownMessageComments.length){const r=await sb.from('admin_message_comments').upsert(ownMessageComments,{onConflict:'id'});if(r.error)throw r.error;}
    }
    console.info('[V53] Synchronisation Supabase terminée.');
  }catch(e){
    v61LastSyncError=e;
    v53ToastError('Synchronisation Supabase impossible.',e);
    if(v61SyncStrict) throw e;
  }finally{ v53.syncing=false; }
}

let v53SyncTimer=null;
function v53QueueSync(){
  if(!window.v53?.enabled || !v53Session()) return;
  clearTimeout(v53SyncTimer);
  v53SyncTimer=setTimeout(()=>v53SyncRemote(),250);
}

// save/saveCalendar sont des fonctions nommées V53 peut donc les envelopper.
const v53LocalSave=save;
save=function(){ const ok=v53LocalSave(); v53QueueSync(); return ok; };
const v53LocalSaveCalendar=saveCalendar;
saveCalendar=function(){ const ok=v53LocalSaveCalendar(); v53QueueSync(); return ok; };

function v53LoginOverlay(message="Connectez-vous à votre espace Don Bosco - Perfectionnement."){ showMemberLogin(message); }

function v55PromptPasswordChange(force=false){
  let modal=document.getElementById('passwordModal');
  if(!modal){ modal=document.createElement('div'); modal.id='passwordModal'; document.body.appendChild(modal); }
  modal.innerHTML=`<div class="password-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">SÉCURITÉ DU COMPTE</div><h3>${force?'Changement de mot de passe obligatoire':'Modifier le mot de passe'}</h3></div>${force?'':'<button class="profile-close" onclick="closePasswordModal()">×</button>'}</div><p class="muted">Votre compte utilise encore le mot de passe temporaire <strong>123456</strong>. Pour continuer, choisissez un nouveau mot de passe personnel d’au moins 6 caractères.</p>${force?'':'<label>Mot de passe actuel<input id="currentPassword" type="password" autocomplete="current-password"></label>'}<label>Nouveau mot de passe<input id="newPassword" type="password" autocomplete="new-password"></label><label>Confirmer le nouveau mot de passe<input id="confirmPassword" type="password" autocomplete="new-password"></label><div class="password-modal-actions">${force?'':'<button class="secondary" onclick="closePasswordModal()">Annuler</button>'}<button class="primary" onclick="saveOwnPassword(${force})">Enregistrer</button></div></div>`;
  modal.classList.add('open');
  if(force) modal.dataset.forced='true'; else delete modal.dataset.forced;
  setTimeout(()=>document.getElementById('newPassword')?.focus(),0);
}

saveOwnPassword=async function(force=false){
  const sb=v53Client(), user=v53User();
  if(!sb||!user) return toast('Vous n’êtes pas connecté.');
  const current=String(document.getElementById('currentPassword')?.value||'');
  const next=String(document.getElementById('newPassword')?.value||'');
  const confirm=String(document.getElementById('confirmPassword')?.value||'');
  if(!force){
    if(current){ const check=await sb.auth.signInWithPassword({email:user.email,password:current}); if(check.error) return toast('Mot de passe actuel incorrect.'); }
  }
  if(next.length<6) return toast('Le nouveau mot de passe doit contenir au moins 6 caractères.');
  if(next==='123456') return toast('Choisissez un mot de passe différent du mot de passe par défaut 123456.');
  if(next!==confirm) return toast('Les deux nouveaux mots de passe sont différents.');
  const session=window.supabaseSession || (await sb.auth.getSession()).data?.session;
  const response=await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/admin-user`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token||''}`,'apikey':window.SUPABASE_CONFIG.publishableKey},body:JSON.stringify({action:'self_change_password',password:next})});
  let result=null; try{result=await response.json();}catch{}
  if(!response.ok || !result?.ok) return toast(result?.error||'Impossible de modifier le mot de passe.');
  v53.mustChangePassword=false;
  if(v53.memberId){ const m=db.members.find(x=>Number(x.id)===Number(v53.memberId)); if(m)m.mustChangePassword=false; }
  closePasswordModal(); toast('Mot de passe modifié avec succès.');
};

function v68TokenIssuedAt(){
  const token=window.supabaseSession?.access_token||'';
  try{ const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); return Number(payload?.iat||0); }catch{return 0;}
}
async function v68CheckForcedLogout(){
  const sb=v53Client(), user=v53User(); if(!sb||!user) return;
  try{
    const {data,error}=await sb.from('profiles').select('force_logout_at').eq('id',user.id).maybeSingle();
    if(error) throw error;
    const forcedAt=data?.force_logout_at?Date.parse(data.force_logout_at)/1000:0, issuedAt=v68TokenIssuedAt();
    if(forcedAt && issuedAt && forcedAt>issuedAt+1){
      await sb.auth.signOut({scope:'local'});
      v59SessionExpired('Votre session a été déconnectée par un administrateur. Reconnectez-vous pour continuer.');
    }
  }catch(e){ console.warn('[V68] Vérification de déconnexion forcée impossible.',e); }
}

let v59SessionCheckBusy=false;
function v59SessionExpired(message="Votre session a expiré ou n’est plus valide. Reconnectez-vous pour continuer."){
  v53ResetLocalAuth();
  v53.hydrated=false; v53.role=null; v53.memberId=null; v53.displayName=''; window.supabaseSession=null;
  closeProfileMenu(); syncRoleSelector();
  v53LoginOverlay(message);
  toast(message.includes('administrateur')?'Session déconnectée par un administrateur.':'Session expirée. Veuillez vous reconnecter.');
}
async function v59CheckSession(){
  if(v59SessionCheckBusy) return;
  const sb=v53Client(); if(!sb) return;
  v59SessionCheckBusy=true;
  try{
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(!data?.session && v53User()) v59SessionExpired();
    else if(data?.session) window.supabaseSession=data.session;
  }catch(e){ console.warn('[V59] Vérification de session impossible.',e); }
  finally{ v59SessionCheckBusy=false; }
}
async function v53Start(){
  const sb=v53Client();
  if(!sb) return;
  window.v53.enabled=true;
  try{
    const {data}=await sb.auth.getSession();
    window.supabaseSession=data?.session||null;
    if(window.supabaseSession){
      await v53LoadRemote();
      hideMemberLogin(); syncRoleSelector(); render();
      if(v53.mustChangePassword) setTimeout(()=>v55PromptPasswordChange(true),150);
    }else{
      v53ResetLocalAuth(); v53LoginOverlay();
    }
  }catch(e){
    v53ResetLocalAuth(); v53LoginOverlay(); v53ToastError('Initialisation Supabase impossible.',e);
  }
  sb.auth.onAuthStateChange(async (_event,session)=>{
    window.supabaseSession=session||null;
    if(!session){
      if(_event==='SIGNED_OUT' && v53User()) v59SessionExpired();
      else {v53ResetLocalAuth();v53LoginOverlay();}
      return;
    }
    if(_event==='TOKEN_REFRESHED') return;
    if(_event==='SIGNED_IN' || _event==='USER_UPDATED'){
      try{await v53LoadRemote();hideMemberLogin();syncRoleSelector();render();if(v53.mustChangePassword)setTimeout(()=>v55PromptPasswordChange(true),150);}catch(e){v53ToastError('Profil Supabase invalide.',e);}
    }
  });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ v59CheckSession(); v68CheckForcedLogout(); } });
  window.addEventListener('focus',()=>{ v59CheckSession(); v68CheckForcedLogout(); });
  setInterval(()=>{ if(v53User()) v68CheckForcedLogout(); },15000);
}

// Le client Supabase V52 est créé plus haut. V53 attend qu'il soit disponible.
setTimeout(()=>v53Start(),0);


// En Auth V53, l'administrateur ne peut pas réinitialiser le mot de passe d'un autre
// utilisateur depuis le navigateur : cette opération nécessite l'API Admin côté serveur.
async function v54AdminFunction(action,payload={}){
  if(!canAdmin()) return toast('Seul l’administrateur peut gérer les comptes.');
  const sb=v53Client(); if(!sb) return toast('Supabase n’est pas disponible.');
  const {data,error}=await sb.functions.invoke('admin-user', {body:{action,...payload}});
  if(error){ console.error(error); return v53ToastError('Opération sur le compte impossible.',error); }
  if(data?.error) return toast(data.error);
  return data;
}

async function v63LoadAccountStatus(){
 if(!canAdmin()) return;
 const sb=v53Client(); if(!sb || !v53User()) return;
 try{
   const {data,error}=await sb.functions.invoke('admin-user',{body:{action:'list_account_status'}});
   if(error) throw error;
   if(data?.error) throw new Error(data.error);
   v63AccountStatus={};
   (data?.accounts||[]).forEach(a=>{v63AccountStatus[Number(a.member_id)]=a;});
 }catch(e){
   console.warn('[V63] Statut des comptes impossible à charger.',e);
   v63AccountStatus={};
 }
}

async function v121LoadCredentialEmailStatus(){
  if(!canAdmin()) return;
  const sb=v53Client(); if(!sb || !v53User()) return;
  try{
    const {data,error}=await sb.functions.invoke('send-account-email',{body:{action:'list_status'}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    (data?.accounts||[]).forEach(a=>{
      const id=Number(a.member_id);
      if(id){
        v63AccountStatus[id]=Object.assign({},v63AccountStatus[id]||{}, {credentials_email_sent_at:a.credentials_email_sent_at||null});
      }
    });
  }catch(e){ console.warn('[V121] Statut des emails impossible à charger.',e); }
}

async function sendAccountCredentialsEmail(id){
  if(!canAdmin()) return toast('Seul l’administrateur peut envoyer les identifiants.');
  const m=db.members.find(x=>Number(x.id)===Number(id)); if(!m)return;
  if(!m.authEmail) return toast('Ce compte n’a pas encore d’adresse email.');
  const email=m.authEmail;
  if(!confirm(`Envoyer les identifiants de connexion à ${m.name} (${email}) ?\n\nLe mot de passe temporaire sera réinitialisé à 123456 et devra être changé à la première connexion.`)) return;
  const sb=v53Client(); if(!sb || !v53User()) return toast('Supabase n’est pas disponible.');
  try{
    const {data,error}=await sb.functions.invoke('send-account-email',{body:{action:'send_credentials',member_id:Number(id)}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    if(!v63AccountStatus[Number(id)]) v63AccountStatus[Number(id)]={};
    v63AccountStatus[Number(id)].credentials_email_sent_at=data.credentials_email_sent_at||new Date().toISOString();
    render();
    toast(`Email envoyé à ${email}.`);
  }catch(e){
    console.error('[V121] Envoi email identifiants impossible.',e);
    v53ToastError('Envoi de l’email impossible.',e);
  }
}

async function createMemberAccount(id){
  const m=db.members.find(x=>Number(x.id)===Number(id)); if(!m)return;
  if(m.authEmail) return manageMemberAccount(id);
  const email=prompt(`Email de ${m.name} :`,''); if(!email)return;
  const clean=email.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(clean)) return toast('Adresse email invalide.');
  const password=prompt('Mot de passe initial temporaire (au moins 6 caractères) :','123456');
  if(password===null)return;
  if(password.length<6)return toast('Le mot de passe initial doit contenir au moins 6 caractères.');
  const data=await v54AdminFunction('create',{member_id:Number(id),email:clean,password,role:m.role||'member'});
  if(!data)return;
  m.authEmail=clean; save();
  await v53LoadRemote(); render();
  toast(`Compte créé pour ${m.name}. Le membre doit changer son mot de passe après sa première connexion.`);
}

async function manageMemberAccount(id){
  const m=db.members.find(x=>Number(x.id)===Number(id)); if(!m)return;
  const choice=prompt(`Compte de ${m.name}\nEmail : ${m.authEmail||'non associé'}\n\nTapez :\n1 = réinitialiser le mot de passe\n2 = forcer la déconnexion de l’application\n3 = désactiver le compte\n4 = réactiver le compte\n5 = changer l’email`, '1');
  if(!choice)return;
  if(choice==='1') return changeMemberPassword(id);
  if(choice==='2') { if(!confirm(`Forcer la déconnexion de ${m.name} sur l’application ?`))return; const data=await v54AdminFunction('force_logout',{member_id:Number(id)}); if(data){await v63LoadAccountStatus();render();toast('Déconnexion forcée demandée.');} return; }
  if(choice==='3') { if(!confirm(`Désactiver le compte de ${m.name} ?`))return; const data=await v54AdminFunction('disable',{member_id:Number(id)}); if(data){await v53LoadRemote();render();toast('Compte désactivé.');} return; }
  if(choice==='4') { const data=await v54AdminFunction('enable',{member_id:Number(id)}); if(data){await v53LoadRemote();render();toast('Compte réactivé.');} return; }
  if(choice==='5') { const email=prompt('Nouvelle adresse email :',m.authEmail||''); if(!email)return; const clean=email.trim().toLowerCase(); if(!/^\S+@\S+\.\S+$/.test(clean))return toast('Adresse email invalide.'); const data=await v54AdminFunction('change_email',{member_id:Number(id),email:clean}); if(data){await v53LoadRemote();render();toast('Email du compte mis à jour.');} }
}

changeMemberPassword=async function(id){
  const m=db.members.find(x=>Number(x.id)===Number(id)); if(!m)return;
  const password=prompt(`Nouveau mot de passe temporaire pour ${m.name} (au moins 6 caractères) :`,'123456');
  if(password===null)return;
  if(password.length<6)return toast('Le mot de passe doit contenir au moins 6 caractères.');
  const data=await v54AdminFunction('reset_password',{member_id:Number(id),password});
  if(data) toast(`Mot de passe réinitialisé pour ${m.name}.`);
};

// V60 — visibilité claire de l'état réseau et resynchronisation manuelle.
let v60SyncBusy=false;
function v60SetConnection(state,message){
  const el=document.getElementById('connectionStatus');
  if(!el)return;
  el.className='connection-status '+(state||'');
  const labels={online:'● En ligne',offline:'● Hors ligne',syncing:'● Synchronisation…',error:'● Erreur de synchronisation'};
  el.textContent=labels[state]||message||labels.online;
  if(message) el.title=message;
}
function v60SetSyncButton(busy){
  const b=document.getElementById('syncNowBtn');
  if(!b)return;
  b.classList.toggle('sync-now-busy',!!busy);
  b.textContent=busy?'↻ Synchronisation…':'↻ Synchroniser';
}
async function v60ManualSync(){
  if(v60SyncBusy)return;
  const sb=v53Client();
  if(!sb || !v53User()) return toast('Connectez-vous pour synchroniser.');
  if(!navigator.onLine) return toast('Vous êtes hors ligne. La synchronisation reprendra dès le retour de la connexion.');
  v60SyncBusy=true; v60SetSyncButton(true); v60SetConnection('syncing');
  try{
    await v53LoadRemote();
    render();
    v60SetConnection('online','Données synchronisées à l’instant.');
    toast('Données synchronisées.');
  }catch(e){
    console.warn('[V60] Synchronisation manuelle impossible.',e);
    v60SetConnection('error',e?.message||'Synchronisation impossible.');
    toast('Synchronisation impossible. Réessayez.');
  }finally{v60SyncBusy=false;v60SetSyncButton(false);}
}
function v60NetworkState(){
  if(navigator.onLine){
    v60SetConnection('online','Connexion réseau disponible.');
  }else{
    v60SetConnection('offline','Aucune connexion réseau. Les données distantes ne peuvent pas être synchronisées.');
  }
}
window.addEventListener('online',()=>{v60NetworkState(); if(v53User()) setTimeout(()=>v60ManualSync(),300);});
window.addEventListener('offline',v60NetworkState);
document.addEventListener('DOMContentLoaded',v60NetworkState);
setTimeout(v60NetworkState,100);



// V61 — synchronisation fiable : pousser les changements locaux avant toute lecture distante,
// mémoriser les erreurs et relancer automatiquement les synchronisations échouées.
let v61SyncStrict=false;
let v61LastSyncError=null;
let v61RetryTimer=null;
let v61RetryDelay=5000;

function v61SetSyncState(state,message){
  const el=document.getElementById('connectionStatus');
  if(!el)return;
  const labels={online:'● En ligne',offline:'● Hors ligne',syncing:'● Synchronisation…',error:'● Synchronisation à vérifier'};
  el.className='connection-status '+(state||'');
  el.textContent=labels[state]||labels.online;
  if(message) el.title=message;
}

function v61ScheduleRetry(){
  clearTimeout(v61RetryTimer);
  if(!v53User() || !navigator.onLine)return;
  const delay=v61RetryDelay;
  v61RetryTimer=setTimeout(async()=>{
    v61RetryTimer=null;
    try{
      await v61PushLocal();
      v61RetryDelay=5000;
    }catch(e){
      v61RetryDelay=Math.min(v61RetryDelay*2,60000);
      v61ScheduleRetry();
    }
  },delay);
}

async function v61PushLocal(){
  if(!v53User()) return false;
  if(!navigator.onLine) throw new Error('Hors ligne.');
  v61SyncStrict=true;
  try{
    await v53SyncRemote();
    v61LastSyncError=null;
    v61SetSyncState('online','Données locales synchronisées avec Supabase.');
    return true;
  }finally{
    v61SyncStrict=false;
  }
}

async function v61SyncNow(){
  if(v60SyncBusy)return;
  const sb=v53Client();
  if(!sb || !v53User()) return toast('Connectez-vous pour synchroniser.');
  if(!navigator.onLine) return toast('Vous êtes hors ligne. La synchronisation reprendra dès le retour de la connexion.');
  v60SyncBusy=true; v60SetSyncButton(true); v61SetSyncState('syncing');
  try{
    // Sécurité V61 : on envoie d'abord les changements locaux pour éviter qu'une lecture
    // distante n'écrase une modification locale encore en attente.
    await v61PushLocal();
    await v53LoadRemote();
    render();
    v61RetryDelay=5000;
    v61SetSyncState('online','Données synchronisées à l’instant.');
    toast('Données synchronisées.');
  }catch(e){
    console.warn('[V61] Synchronisation complète impossible.',e);
    v61LastSyncError=e;
    v61SetSyncState('error',e?.message||'Synchronisation impossible.');
    v61ScheduleRetry();
    toast('Synchronisation impossible. Une nouvelle tentative sera effectuée automatiquement.');
  }finally{v60SyncBusy=false;v60SetSyncButton(false);}
}

// Le bouton V60 appelle encore v60ManualSync : on le redirige vers le flux V61 sûr.
window.v60ManualSync=v61SyncNow;

// Une sauvegarde locale réussie déclenche le mécanisme V61 déjà installé par V53.
// En cas d'échec réseau, on retente avec un délai progressif (5 s → 60 s).
const v61OriginalQueueSync=v53QueueSync;
v53QueueSync=function(){
  v61OriginalQueueSync();
  if(v53User() && navigator.onLine && v61LastSyncError) v61ScheduleRetry();
};

window.addEventListener('online',()=>{
  v61RetryDelay=5000;
  if(v53User()) setTimeout(()=>v61SyncNow(),300);
});
window.addEventListener('offline',()=>{
  clearTimeout(v61RetryTimer);
  v61SetSyncState('offline','Aucune connexion réseau. Les changements seront resynchronisés au retour de la connexion.');
});

/* ========================= V83 — PUSH NOTIFICATIONS ========================= */
(function(){
  const V83_APP_URL='https://contactdbbn.github.io/don-bosco-perfectionnement/';
  let busy=false;
  function cfg(){ return window.SUPABASE_CONFIG||{}; }
  function supports(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!cfg().pushPublicKey; }
  function urlBase64ToUint8Array(base64String){
    const padding='='.repeat((4-(base64String.length%4))%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64); const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
    return out;
  }
  async function registration(){ return await navigator.serviceWorker.ready; }
  function subscriptionRow(sub,userId){
    const json=sub.toJSON();
    return {profile_id:userId,endpoint:json.endpoint,p256dh:json.keys?.p256dh||'',auth:json.keys?.auth||'',user_agent:navigator.userAgent,active:true,updated_at:new Date().toISOString()};
  }
  async function getDbSubscription(sub){
    const sb=v53Client(), user=v53User(); if(!sb||!user||!sub) return null;
    const {data,error}=await sb.from('push_subscriptions').select('id,active').eq('profile_id',user.id).eq('endpoint',sub.endpoint).maybeSingle();
    if(error) throw error; return data||null;
  }
  async function saveSubscription(sub){
    const sb=v53Client(), user=v53User(); if(!sb||!user) throw new Error('Connexion requise.');
    const row=subscriptionRow(sub,user.id);
    if(!row.endpoint||!row.p256dh||!row.auth) throw new Error('Abonnement Push incomplet.');
    row.disabled_by_user=false; const {error}=await sb.from('push_subscriptions').upsert(row,{onConflict:'profile_id,endpoint'});
    if(error) throw error;
  }
  async function deactivateDbSubscription(sub){
    const sb=v53Client(), user=v53User(); if(!sb||!user||!sub) return;
    const {error}=await sb.from('push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('profile_id',user.id).eq('endpoint',sub.endpoint);
    if(error) console.warn('[V83] Désactivation abonnement impossible.',error);
  }
  async function removeSubscription(sub){
    const sb=v53Client(), user=v53User(); if(!sb||!user||!sub) return;
    const {error}=await sb.from('push_subscriptions').update({active:false,disabled_by_user:true,updated_at:new Date().toISOString()}).eq('profile_id',user.id).eq('endpoint',sub.endpoint);
    if(error) console.warn('[V83] Suppression abonnement impossible.',error);
  }
  async function updateButton(){
    const btn=document.getElementById('notifyBtn'); if(!btn) return;
    if(!supports()){ btn.textContent='🔔 Notifications'; btn.disabled=true; btn.title='Notifications Push non supportées par ce navigateur.'; return; }
    if(Notification.permission==='denied'){ btn.textContent='🔕 Notifications bloquées'; btn.disabled=false; btn.title='Autorisez les notifications dans les réglages du navigateur.'; return; }
    try{
      const sub=await (await registration()).pushManager.getSubscription();
      if(Notification.permission==='granted'&&sub){ btn.textContent='🔔 Notifications activées'; btn.disabled=false; btn.title='Notifications Push activées sur cet appareil.'; }
      else { btn.textContent='🔔 Activer les notifications'; btn.disabled=false; btn.title='Activer les notifications Push sur cet appareil.'; }
    }catch(_){ btn.textContent='🔔 Activer les notifications'; btn.disabled=false; }
  }
  async function subscribe(forceNew=false){
    if(busy) return; busy=true;
    try{
      if(!supports()) throw new Error('Les notifications Push ne sont pas supportées par ce navigateur.');
      if(!v53User()) throw new Error('Connectez-vous avant d’activer les notifications.');
      if(!window.isSecureContext) throw new Error('Les notifications Push nécessitent une connexion HTTPS.');
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Permission de notifications non accordée.');
      const reg=await registration();
      let sub=await reg.pushManager.getSubscription();
      if(forceNew && sub){ await removeSubscription(sub).catch(()=>{}); await sub.unsubscribe().catch(()=>{}); sub=null; }
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg().pushPublicKey)});
      await saveSubscription(sub);
      await updateButton();
      toast('Notifications Push activées sur cet appareil.');
      const sb=v53Client();
      if(sb){
        try{
          const {data,error}=await sb.functions.invoke('push-notifications',{body:{action:'test'}});
          if(error) console.warn('[V83] Test Push impossible.',error);
          else if(data?.sent) toast('Notification de test envoyée.');
          else if(data?.error) toast(data.error);
        }catch(e){ console.warn('[V83] Test Push impossible.',e); }
      }
    }catch(e){ console.warn('[V83]',e); toast(e?.message||'Impossible d’activer les notifications.'); }
    finally{ busy=false; await updateButton(); }
  }
  async function unsubscribe(){
    if(busy) return; busy=true;
    try{ const reg=await registration(); const sub=await reg.pushManager.getSubscription(); if(sub){ await removeSubscription(sub); await sub.unsubscribe(); } toast('Notifications désactivées sur cet appareil.'); }
    catch(e){ console.warn('[V83] Désactivation impossible.',e); toast('Impossible de désactiver les notifications.'); }
    finally{ busy=false; await updateButton(); }
  }
  async function syncExisting(){
    if(!supports()||!v53User()||Notification.permission!=='granted') return;
    try{
      const sub=await (await registration()).pushManager.getSubscription();
      if(!sub) return;
      const dbSub=await getDbSubscription(sub);
      if(dbSub && dbSub.active===false){
        console.warn('[V83] Abonnement marqué invalide côté serveur : renouvellement Push.');
        await sub.unsubscribe().catch(()=>{});
        const reg=await registration();
        const fresh=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg().pushPublicKey)});
        await saveSubscription(fresh);
        toast('Abonnement Push renouvelé sur cet appareil.');
      }else if(!dbSub){
        await saveSubscription(sub);
      }
    }catch(e){ console.warn('[V83] Synchronisation abonnement Push impossible.',e); }
    finally{ await updateButton(); }
  }
  async function click(){
    if(Notification.permission==='granted'){ const sub=await (await registration()).pushManager.getSubscription().catch(()=>null); if(sub){ await unsubscribe(); return; } }
    await subscribe(false);
  }
  window.v83PushSubscribe=subscribe;
  window.v83PushUnsubscribe=unsubscribe;
  window.v83PushSync=syncExisting;
  window.v83PushTest=async()=>{
    const sb=v53Client(); if(!sb||!v53User()) return toast('Connectez-vous pour tester les notifications.');
    try{ const {data,error}=await sb.functions.invoke('push-notifications',{body:{action:'test'}}); if(error)throw error; toast(data?.sent?'Notification de test envoyée.':(data?.error||'Aucun appareil Push actif.')); }
    catch(e){ console.warn(e); toast('Test Push impossible. Consultez les logs Supabase.'); }
  };
  window.v83UpdatePushButton=updateButton;
  const btn=document.getElementById('notifyBtn'); if(btn) btn.onclick=click;
  document.addEventListener('supabase-auth-change',()=>{ setTimeout(syncExisting,250); });
  window.addEventListener('focus',()=>{ if(v53User()) syncExisting(); });
  window.addEventListener('pageshow',()=>{ if(v53User()) syncExisting(); });
  setTimeout(()=>{ updateButton(); if(v53User()) syncExisting(); },1200);
})();
