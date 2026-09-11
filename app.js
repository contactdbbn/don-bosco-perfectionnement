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
let appUsers=readStorageJson("sportclub-users-v1",null)||{
  admin:{username:"admin",password:"admin1234",role:"admin"},
  encadrant:{username:"encadrant",password:"1234",role:"coach"}
};
function saveUsers(){writeStorageJson("sportclub-users-v1",appUsers);}
if(!localStorage.getItem("sportclub-users-v1")){ saveUsers(); }
function getMemberRole(m){return m?.role||"member";}
function slotLabel(slot){ const n=Number(slot); return [1,2,3].includes(n) ? SLOT_NAMES[n-1] : "Aucun créneau"; }
function getSlotQuota(slot){ const n=Number(slot); return Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas?.[n]??30))); }
function getActiveSlotCount(slot,excludeId=null){ return db.members.filter(x=>x.active&&getMemberRole(x)==="member"&&Number(x.slot)===Number(slot)&&(excludeId===null||x.id!==Number(excludeId))).length; }
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
function canManageRoles(){return authState==="admin";}


const canEditAttendance = (memberId) => canCoach() || Number(memberId) === currentMemberId;
const isPastWeek = (key=weekKey()) => key < mondayKey(new Date());
const hasResponded = (memberId,key=weekKey()) => Object.prototype.hasOwnProperty.call(db.attendance, key+"_"+memberId) || isMemberAbsentByPeriod(memberId,key);
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
const fmt=d=>new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(d+"T12:00:00"));
const isMemberAbsentByPeriod=(id,key=weekKey())=>db.absencePeriods.some(a=>Number(a.memberId)===Number(id)&&a.start<=key&&a.end>=key);
const getStatus=(id)=>isMemberAbsentByPeriod(id)?"absent":(db.attendance[weekKey()+"_"+id]||"pending");
const getStatusForWeek=(id,key=weekKey())=>isMemberAbsentByPeriod(id,key)?"absent":(db.attendance[key+"_"+id]||"pending");
const getWeekMoves=(key=weekKey())=>db.moves.filter(m=>m.week===key);
const getMoveForMember=(memberId,key=weekKey())=>getWeekMoves(key).filter(m=>m.memberId===Number(memberId)&&(m.status==="pending"||m.status==="approved")).sort((a,b)=>b.id-a.id)[0];
const getEffectiveSlot=(memberId,key=weekKey())=>{
 const m=db.members.find(x=>x.id===Number(memberId)); if(!m) return null;
 const move=getWeekMoves(key).filter(x=>x.memberId===Number(memberId)&&x.status==="approved").sort((a,b)=>b.approvedAt-b.approvedAt||b.id-a.id)[0];
 return move?Number(move.to):Number(m.slot);
};
const getControlPresence=(slot,key=weekKey())=>db.members.filter(m=>m.active&&getEffectiveSlot(m.id,key)===Number(slot)&&getStatus(m.id)==="present").length;
const getControlAbsent=(slot,key=weekKey())=>db.members.filter(m=>m.active&&getEffectiveSlot(m.id,key)===Number(slot)&&getStatus(m.id)==="absent").length;
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
const setStatusForWeek=(id,status,key)=>{
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
 document.getElementById("weekLabel").textContent=fmt(weekKey());
 const memberTab=document.querySelector('.tab[data-view="members"]');
 const moveTab=document.querySelector('.tab[data-view="moves"]');
 memberTab.style.display=canCoach()?"":"none";
 moveTab.style.display=canCoach()?"":"none";
 if(!canCoach() && !document.getElementById("membersView").classList.contains("hidden")){
   document.querySelector('.tab[data-view="dashboard"]').click();
 }
 const active=db.members.filter(m=>m.active);
 const stats=SLOT_NAMES.map((n,i)=>{
   const slot=i+1, p=getControlPresence(slot);
   const pendingTarget=db.moves.filter(m=>m.status==='pending'&&Number(m.to)===slot).length;
   return `<div class="stat"><div class="num">${p}/20</div><div class="label">${n} · ${Math.max(0,20-p)} place(s) disponible(s) pour changement</div><div class="muted">${pendingTarget} demande${pendingTarget>1?'s':''} de changement vers ce créneau</div></div>`;
 }).join("");
 document.getElementById("stats").innerHTML=stats;
 document.getElementById("moveBadge").textContent=(db.moves.filter(m=>m.status==="pending").length+(db.statusRequests||[]).filter(m=>m.status==="pending").length)||"";
 document.querySelectorAll(".filter-btn").forEach(btn=>{
   const n=btn.dataset.slotFilter;
   btn.classList.toggle("active", n==="all" ? selectedSlots.size===0 : selectedSlots.has(Number(n)));
 });
 renderDashboard(); renderMembers(); renderTdb(); renderCalendar(); renderMoves(); renderMemberHistory(); renderRequestHistory(); renderObjectives(); renderEvents(); syncTabs();
}
function hideMemberLogin(){ const box=document.getElementById("memberLogin"); if(box) box.classList.add("hidden"); }
function showMemberLogin(){
 window.loginSlotFilter="all";
 const active=db.members.filter(m=>m.active);
 let box=document.getElementById("memberLogin");
 if(!box){ box=document.createElement("div"); box.id="memberLogin"; document.body.appendChild(box); }
 box.innerHTML=`<div class="login-card"><p class="eyebrow">SPORTCLUB</p><h2>Connexion</h2><p class="muted">Choisissez votre compte et saisissez votre code d'accès.</p><label>Compte<select id="loginAccount" onchange="renderLoginFields()"><option value="member">Adhérent</option><option value="admin">Administrateur</option><option value="coach">Encadrant</option></select></label><div id="loginFields"></div><button class="primary" onclick="performLogin()">Se connecter</button><div class="login-help">Comptes initiaux : <strong>admin</strong> / <strong>admin1234</strong> · <strong>encadrant</strong> / <strong>1234</strong> · adhérents : code <strong>1234</strong>.</div></div>`;
 box.classList.remove("hidden"); renderLoginFields();
}
function renderLoginFields(){
 const type=document.getElementById("loginAccount")?.value||"member", target=document.getElementById("loginFields"); if(!target)return;
 if(type==="member"){
   const active=db.members.filter(m=>m.active);
   const loginSlot=window.loginSlotFilter||"all";
   const filtered=loginSlot==="all"?active:active.filter(m=>Number(m.slot)===Number(loginSlot));
   target.innerHTML=`<label>Créneau<select id="loginSlotFilter" onchange="window.loginSlotFilter=this.value;renderLoginFields()"><option value="all" ${loginSlot==="all"?"selected":""}>Tous les adhérents</option><option value="1" ${loginSlot==="1"?"selected":""}>Créneau 1</option><option value="2" ${loginSlot==="2"?"selected":""}>Créneau 2</option><option value="3" ${loginSlot==="3"?"selected":""}>Créneau 3</option></select></label><label>Adhérent<select id="loginMember">${filtered.map(m=>`<option value="${m.id}" ${m.id===currentMemberId?"selected":""}>${esc(m.name)}</option>`).join("")}</select></label><label>Code d'accès<input id="loginPassword" type="password" placeholder="Code d'accès" autocomplete="current-password"></label>`;
 } else {
   target.innerHTML=`<label>Identifiant<input id="loginUsername" value="${type==="admin"?"admin":"encadrant"}" autocomplete="username"></label><label>Code d'accès<input id="loginPassword" type="password" placeholder="Code d'accès" autocomplete="current-password"></label>`;
 }
}
function performLogin(){
 const type=document.getElementById("loginAccount")?.value||"member", pass=String(document.getElementById("loginPassword")?.value||"");
 if(type==="member"){
   const id=Number(document.getElementById("loginMember")?.value), m=db.members.find(x=>x.id===id&&x.active);
   if(!m || pass!==String(m.password||"1234")) return toast("Adhérent ou code d'accès incorrect.");
   currentMemberId=id; currentRole=getMemberRole(m); authState=currentRole; memberLoggedIn=true;
   localStorage.setItem("sportclub-member-id",String(id)); localStorage.setItem("sportclub-member-auth","1"); localStorage.removeItem("sportclub-staff-auth"); localStorage.setItem("sportclub-role",currentRole); localStorage.setItem("sportclub-auth-role",authState);
 } else {
   const username=String(document.getElementById("loginUsername")?.value||"").trim().toLowerCase(), u=appUsers[username];
   if(!u || u.role!==type || pass!==String(u.password)) return toast("Identifiant ou code d'accès incorrect.");
   currentRole=type; authState=type; memberLoggedIn=false;
   localStorage.setItem("sportclub-role",type); localStorage.setItem("sportclub-auth-role",type); localStorage.removeItem("sportclub-member-auth");
 }
 hideMemberLogin(); syncRoleSelector(); render(); toast("Connexion réussie");
}
function loginMember(){performLogin();}
function logoutMember(){ memberLoggedIn=false; staffLoggedIn=false; authState=""; currentRole="member"; localStorage.removeItem("sportclub-member-auth"); localStorage.removeItem("sportclub-staff-auth"); localStorage.removeItem("sportclub-auth-role"); localStorage.setItem("sportclub-role","member"); closeProfileMenu(); syncRoleSelector(); showMemberLogin(); render(); }
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
 menu.innerHTML=`<div class="profile-menu-card"><div class="profile-menu-head"><div><div class="eyebrow">MON PROFIL</div><h3>${esc(profile?.name||"")}</h3><div class="muted">${esc(ROLE_LABELS[profile?.role]||"")}</div></div><button class="profile-close" onclick="closeProfileMenu()">×</button></div><div class="profile-menu-actions"><button class="secondary" onclick="openPasswordModal()">Modifier le mot de passe</button><button class="danger" onclick="logoutMember()">Déconnexion</button></div></div>`;
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
 const note=`<div class="card role-note">
   <div class="row"><div><strong>${canAdmin()?"Mode administrateur":(canCoach()?"Mode encadrant":"Mode adhérent")}</strong>
   <div class="muted">${canCoach()
     ?"Vous pouvez gérer les présences et les fonctions d’encadrement autorisées."
     :"Vous pouvez modifier uniquement votre propre présence. Les statuts des autres adhérents sont visibles en lecture seule."}</div></div>
   ${currentRole==="member"?`<span class="auth-user">${esc(currentMember()?.name||"")}</span>`:""}
   </div></div>`;

 const courseWeek=isAttendanceWeek();
 const absenceCard=currentRole==="member"?renderAbsencePeriodCard():"";
 const slots=SLOT_NAMES.map((name,si)=>{
   const slotNumber=si+1;
   if(selectedSlots.size && !selectedSlots.has(slotNumber)) return "";
   const list=db.members.filter(m=>m.active&&getEffectiveSlot(m.id)===slotNumber);
   const realSlot=getControlPresence(slotNumber);
   const quota=Math.max(0,Math.min(QUOTA_MAX,Number(db.quotas?.[slotNumber]??30)));
   const quotaPercent=quota>0 ? Math.min(100,list.length/quota*100) : (list.length>0 ? 100 : 0);
   return `<div class="slot"><div class="slot-head"><div><div class="slot-title">${name}</div><div class="capacity">${list.length}/${quota} adhérents · ${realSlot}/20 présents pour contrôle des changements</div><div class="progress"><div style="width:${quotaPercent}%"></div></div></div>
   ${currentRole==="admin"&&courseWeek?`<button class="primary" onclick="notifySlot(${slotNumber})">Rappeler</button>`:""}</div>
   ${courseWeek?list.map(m=>personHtml(m)).join(""):`<div class="empty">Pas de demande de présence : cette semaine n'est ni Cours ni Libre.</div>`}</div>`;
 }).join("");

 const adminDashboard = currentRole === "admin" ? renderRealDashboard() : "";
 document.getElementById("dashboardView").innerHTML=note+absenceCard+adminDashboard+slots;

}
function renderRealDashboard(){
 const rows=SLOT_NAMES.map((name,si)=>{
   const slot=si+1;
   const list=db.members.filter(m=>m.active&&getEffectiveSlot(m.id)===slot);
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
 const approvedMove=getWeekMoves(weekKey).find(r=>Number(r.memberId)===Number(me.id)&&r.status==='approved');
 const slotInfo=approvedMove&&effectiveSlot?`<span class="history-slot">Créneau effectif : ${SLOT_NAMES[effectiveSlot-1]}</span>`:'';
 const statusButtons=`<div class="history-actions"><button class="${st==='present'?'primary':''}" onclick="setStatusForWeek(${me.id},'present','${weekKey}')">Présent</button><button class="${st==='absent'?'danger':''}" onclick="setStatusForWeek(${me.id},'absent','${weekKey}')">Absent</button><button class="${st==='pending'?'secondary':''}" onclick="setStatusForWeek(${me.id},'pending','${weekKey}')">À confirmer</button></div>`;
 const requestButtons=`<div class="history-actions"><span class="muted">Demander une modification :</span><button onclick="requestStatusChangeForEvent(${me.id},'present','${eventDate}','${weekKey}')">Présent</button><button onclick="requestStatusChangeForEvent(${me.id},'absent','${eventDate}','${weekKey}')">Absent</button><button onclick="requestStatusChangeForEvent(${me.id},'pending','${eventDate}','${weekKey}')">À confirmer</button></div>`;
 const pendingLabel=pendingReq?`<div class="muted request-pending">⏳ Statut demandé : <strong>${labels[pendingReq.requestedStatus]}</strong> — en attente de validation</div>`:'';
 const controls=(!past&&!locked)?statusButtons:(past?`<div class="muted">Statut historique — modification directe réservée à l’administrateur</div>${request?(pendingReq?pendingLabel:requestButtons):`<div class="muted">Aucune réponse enregistrée : aucune demande de modification à envoyer.</div>`}`:`<div class="muted">Statut verrouillé après 19h30</div>${request?(pendingReq?pendingLabel:requestButtons):``}`);
 return `<div class="history-row"><div class="history-date"><strong>${fmt(eventDate)}</strong><span class="history-type">${type}</span>${slotInfo}</div><div class="status ${st}"><span class="dot"></span>${labels[st]}</div><div class="history-control">${controls}</div></div>`;
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
   el.innerHTML=`<div class="card member-history-head"><div><p class="eyebrow">OBJECTIFS</p><h2>Objectifs des séances</h2><div class="muted">Les objectifs saisis dans Mon suivi et les commentaires des adhérents.</div></div><div class="history-summary"><strong>${dates.length}</strong><span>cours</span></div></div><div class="card history-list objective-list">${dates.map(date=>{ const comments=getObjectiveComments(date); const wk=mondayKey(new Date(date+'T12:00:00')); const ac=db.members.filter(m=>m.active); const pc=ac.filter(m=>getStatusForWeek(m.id,wk)==='present').length, ab=ac.filter(m=>getStatusForWeek(m.id,wk)==='absent').length, pe=ac.filter(m=>getStatusForWeek(m.id,wk)==='pending').length; return `<div class="objective-row"><div class="objective-head"><div class="history-date"><strong>${fmt(date)}</strong><span class="history-type">Cours</span></div><div class="objective-presence-summary">Présents ${pc} · Absents ${ab} · À confirmer ${pe}</div></div><div class="objective-text">${objectives[date]?esc(objectives[date]).replace(/\n/g,'<br>'):'<span class="muted">Aucun objectif renseigné.</span>'}</div><div class="objective-reaction-summary">${(()=>{const rr=getObjectiveReactions(date);return `👍 ${rr.filter(r=>r.reaction==='up').length} · 👎 ${rr.filter(r=>r.reaction==='down').length}`;})()}</div><div class="objective-comments"><strong>Commentaires des adhérents (${comments.length})</strong>${comments.length?comments.map(c=>`<div class="objective-comment"><div><strong>${c.anonymous?'Anonyme':esc(c.memberName||'Adhérent')}</strong><span class="muted"> · ${new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(c.createdAt||Date.now()))}</span></div><div>${esc(c.text).replace(/\n/g,'<br>')}</div></div>`).join(''):'<div class="muted">Aucun commentaire.</div>'}</div></div>`; }).join('')}</div>`;
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
 el.innerHTML=`<div class="card member-history-head"><div><p class="eyebrow">MON SUIVI</p><h2>Mes cours et mes présences</h2><div class="muted">Toutes les dates configurées dans le calendrier avec <strong>Cours</strong> ou <strong>Libre</strong>.</div></div><div class="history-summary"><strong>${events.length}</strong><span>dates</span></div></div>
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

function personHtml(m){
 const key=weekKey();
 const st=getStatus(m.id), labels={present:"Présent",absent:"Absent",pending:"À confirmer"};
 const editable=canEditAttendanceForDate(m.id,key);
 const locked=!canCoach() && isStatusLockedAt1930(m.id,key);
 const move=getMoveForMember(m.id);
 const otherSlots=SLOT_NAMES.map((name,i)=>i+1).filter(slot=>slot!==m.slot);
 const moveLabel=move?(move.status==="approved"?`Créneau demandé : ${move.to} ✓`:`Demande en attente : créneau ${move.to}`):"";
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
   <div><div class="name">${esc(m.name)}${Number(m.id)===currentMemberId?' <span class="you">Vous</span>':''}</div><div class="muted">Créneau habituel ${m.slot} · vient au créneau ${getEffectiveSlot(m.id)} cette semaine · ${getChangeCount(m.id)} changement${getChangeCount(m.id)>1?"s":""}</div></div>
   <div class="status ${st}"><span class="dot"></span>${labels[st]}</div>
   <div class="muted">${moveLabel || (st==="pending"?"À confirmer":"Réponse enregistrée")}</div>
   ${actions}
   ${slotActions}
 </div>`;
}
async function requestStatusChange(memberId,requestedStatus){
 const key=weekKey();
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
function requestSlot(memberId,to){
 const key=weekKey();
 if(!isAttendanceWeek()) return toast("Les demandes de changement sont disponibles uniquement les semaines Cours ou Libre.");
 const m=db.members.find(x=>x.id===Number(memberId));
 if(!m||!canEditAttendanceForDate(memberId,key)) return toast("Les dates passées ne peuvent plus être modifiées par les adhérents.");
 if(!canCoach() && isStatusLockedAt1930(memberId,key)) return toast("Votre réponse est verrouillée après 19h30. La demande de créneau n'est plus disponible.");
 if(to===m.slot) return toast("Choisissez un autre créneau.");
 if(getStatus(memberId)==="absent") return toast("Indiquez d’abord que vous êtes présent.");
 if(getMoveForMember(memberId)) return toast("Une demande de changement existe déjà pour cette semaine.");
 const occupied=getControlPresence(to);
 if(occupied>=20) return toast(`Impossible : ${SLOT_NAMES[to-1]} compte déjà ${occupied} présents.`);
 db.moves.push({id:Date.now(),memberId:Number(memberId),name:m.name,from:m.slot,to,week:key,status:"pending"});
 save();render();toast(`Demande pour ${SLOT_NAMES[to-1]} créée. Elle sera traitée selon la priorité des changements.`);
}

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
        info.type==="off"?`<span class="week-tag week-off">Pas de cours</span>`:
        info.type==="cancelled"?`<span class="week-tag week-cancelled">Cours annulé</span>`:
        `<span class="week-tag week-course">Cours</span>`)
     : "";
   cells+=`<div class="cal-day ${cls}">
     <div class="day-number">${date.getDate()}</div>
     ${tag}
     ${events.map(e=>`<div class="event" title="${esc(eventDisplayTitle(e))}">🔵 ${esc(eventDisplayTitle(e))}${eventTypeOf(e)==='Cours annulé'&&eventReportDate(e)?` → report ${esc(fmt(eventReportDate(e)))}`:''}</div>`).join("")}
     ${canCoach()
       ? `<div class="cal-admin"><button onclick="addEventForDate('${key}')">+ Événement</button>${isMonday?`<br><button onclick="editWeek('${wk}')">Modifier semaine</button>`:""}</div>`
       : ""}
   </div>`;
 }
 const upcoming=calendarData.events.filter(e=>isDateInCalendarPeriod(e.date)&&e.date>=isoDate(new Date())).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
 const minMonth=new Date(p.start+"T12:00:00");
 const maxMonth=new Date(p.end+"T12:00:00");
 const cursorMonth=new Date(y,mo,1);
 const prevDisabled=cursorMonth<=new Date(minMonth.getFullYear(),minMonth.getMonth(),1);
 const nextDisabled=cursorMonth>=new Date(maxMonth.getFullYear(),maxMonth.getMonth(),1);
 document.getElementById("calendarView").innerHTML=`
 <div class="calendar-toolbar"><div><h2>${new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(first)}</h2><div class="muted">Période du calendrier : <strong>${fmt(p.start)} au ${fmt(p.end)}</strong>. Le statut de la semaine est affiché uniquement le lundi.</div></div><div class="week-nav"><button onclick="calendarPrev()" ${prevDisabled?"disabled":""}>←</button><button onclick="calendarToday()">Aujourd'hui</button><button onclick="calendarNext()" ${nextDisabled?"disabled":""}>→</button></div></div>
 <div class="calendar"><div class="calendar-grid">${cells}</div></div>
 <div class="legend"><span>🟢 Cours</span><span>⚪ Pas de cours</span><span>🟠 Vacances</span><span>🔴 Férié</span><span>🔵 Événement</span></div>
 ${canCoach()?`<div class="card calendar-period-admin" style="margin-top:16px"><div class="row"><div><strong>Période du calendrier</strong><div class="muted">Le calendrier est limité à cette période. Les lundis sans réglage explicite sont automatiquement considérés comme Cours.</div></div></div><div class="calendar-period-fields"><label>Début<input id="calendarPeriodStart" type="date" value="${p.start}"></label><label>Fin<input id="calendarPeriodEnd" type="date" value="${p.end}"></label><button class="primary" onclick="saveCalendarPeriod()">Enregistrer la période</button></div></div>`:""}
 ${canCoach()?`<div class="card" style="margin-top:16px"><div class="row"><div><strong>Ajouter un événement</strong><div class="muted">Choisissez n'importe quelle date dans la période du calendrier.</div></div><button class="primary" onclick="addEvent()">+ Ajouter</button></div></div>`:""}
 <div class="card"><strong>Événements à venir</strong>${upcoming.map(e=>`<div class="row" style="margin-top:10px"><div><strong>${esc(e.title)}</strong><div class="muted">${fmt(e.date)}</div></div>${canCoach()?`<button class="danger" onclick="deleteEvent(${e.id})">Supprimer</button>`:""}</div>`).join("")||`<div class="empty">Aucun événement à venir.</div>`}</div>`;
}
function saveCalendarPeriod(){
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
function addEvent(){
 const date=prompt("Date de l'événement (AAAA-MM-JJ) :");if(!date)return;
 addEventForDate(date);
}
function addEventForDate(date){
 if(!canCoach()) return toast("Réservé à l’encadrement.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!isDateInCalendarPeriod(date))return toast("Date hors de la période du calendrier.");
 const raw=prompt("Nom / type de l'événement (libre) : vous pouvez saisir un texte personnalisé.", "");
 if(!raw || !raw.trim())return;
 const label=raw.trim();
 const normalized=normalizeCalendarType(label);
 const type=['Cours','Libre','Vacances','Férié','Cours annulé'].includes(normalized) ? normalized : label;
 let reportDate=null;
 if(type==='Cours annulé'){
   reportDate=prompt("Date de report (AAAA-MM-JJ). Laissez vide si le report est en attente :", "");
   if(reportDate && reportDate.trim().toLowerCase()!=='attente') {
     reportDate=reportDate.trim();
     if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!isDateInCalendarPeriod(reportDate))return toast("Date de report hors de la période du calendrier.");
   } else reportDate=null;
 }
 calendarData.events.push({id:Date.now(),date,eventType:type,title:type,reportDate});
 saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast("Événement ajouté");
}
function editSpecialEvent(id){
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
function deleteEvent(id){if(confirm("Supprimer cet événement ?")){calendarData.events=calendarData.events.filter(e=>e.id!==id);saveCalendar();renderCalendar();renderEvents();renderMemberHistory();toast("Événement supprimé")}}
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
function renderEvents(){
 const el=document.getElementById('eventsView'); if(!el)return;
 const special=getSpecialCalendarEvents();
 const manual=getManualEventsForEventsTab();
 const specialRows=special.map(e=>{const report=e.reportDate;return `<div class="special-event-row"><div><strong>${esc(e.type)}</strong><div class="muted">${fmt(e.date)}${e.type==='Cours annulé'?` · Report : <strong>${report?fmt(report):'En attente'}</strong>`:''}</div></div>${currentRole==='admin'?`<div class="actions">${e.id.startsWith('week:')?`<button onclick="editWeek('${e.id.slice(5)}')">Modifier</button>`:`<button onclick="editSpecialEvent(${e.id})">Modifier</button><button class="danger" onclick="deleteEvent(${e.id})">Supprimer</button>`}</div>`:''}</div>`}).join('');
 const manualRows=manual.map(e=>`<div class="special-event-row"><div><strong>${esc(e.type)}</strong><div class="muted">${fmt(e.date)}${e.type==='Cours annulé'?` · Report : <strong>${e.reportDate?fmt(e.reportDate):'En attente'}</strong>`:''}</div></div>${currentRole==='admin'?`<div class="actions"><button onclick="editSpecialEvent(${e.id})">Modifier</button><button class="danger" onclick="deleteEvent(${e.id})">Supprimer</button></div>`:''}</div>`).join('');
 el.innerHTML=`
 <div class="card"><div class="row"><div><p class="eyebrow">ÉVÉNEMENTS</p><h2>Vacances, fériés et cours annulés</h2><div class="muted">Liste des semaines configurées et des événements particuliers. Les cours annulés sont considérés comme Libre pour la présence.</div></div><div class="history-summary"><strong>${special.length}</strong><span>événements</span></div></div></div>
 <div class="card special-events-list">${special.length?specialRows:`<div class="empty">Aucun événement Vacances, Férié ou Cours annulé dans la période du calendrier.</div>`}</div>
 <div class="card"><div class="row"><div><p class="eyebrow">ÉVÉNEMENTS AJOUTÉS</p><h2>Autres événements manuels</h2><div class="muted">Tous les événements ajoutés manuellement sont listés ici, sauf les événements « Libre ». Les cours du lundi créés automatiquement ne sont pas concernés.</div></div><div class="history-summary"><strong>${manual.length}</strong><span>événements</span></div></div></div>
 <div class="card special-events-list">${manual.length?manualRows:`<div class="empty">Aucun autre événement manuel dans la période.</div>`}</div>`;
}
function calendarPrev(){const p=getCalendarPeriod(),min=new Date(p.start+"T12:00:00");calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);if(calendarCursor<new Date(min.getFullYear(),min.getMonth(),1))calendarCursor=new Date(min.getFullYear(),min.getMonth(),1);renderCalendar()}
function calendarNext(){const p=getCalendarPeriod(),max=new Date(p.end+"T12:00:00");calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);if(calendarCursor>new Date(max.getFullYear(),max.getMonth(),1))calendarCursor=new Date(max.getFullYear(),max.getMonth(),1);renderCalendar()}
function calendarToday(){const today=isoDate(new Date());calendarCursor=isDateInCalendarPeriod(today)?new Date(today+"T12:00:00"):new Date(getCalendarPeriod().start+"T12:00:00");renderCalendar()}

function editWeek(key){
 const current=weekInfo(key).type;
 const currentLabel=current==='course'?'cours':current==='off'?'pas de cours':current==='public-holiday'?'férié':current==='cancelled'?'cours annulé':'vacances';
 const choice=prompt("Semaine du "+fmt(key)+" — saisir : cours / pas de cours / vacances / férié / cours annulé",currentLabel);
 if(!choice)return;
 const clean=choice.toLowerCase().trim();
 const map={"cours":"course","pas de cours":"off","vacances":"holiday","férié":"public-holiday","ferie":"public-holiday","cours annulé":"cancelled","cours annule":"cancelled"};
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
 const visibleSlots=selectedSlots.size?[...selectedSlots].sort((a,b)=>a-b):[1,2,3];
 const actualCards=visibleSlots.map(slot=>{
   const name=SLOT_NAMES[slot-1], value=getActualAttendance(slot);
   return `<div class="actual-slot"><div class="row"><div><strong>${name}</strong><div class="muted">Nombre réellement constaté</div></div><output id="actualValue${slot}" class="actual-value">${value}</output></div><input class="actual-range" type="range" min="0" max="30" step="1" value="${value}" ${courseWeek?"":"disabled"} oninput="document.getElementById('actualValue${slot}').value=this.value" onchange="setActualAttendance(${slot},this.value)" aria-label="Nombre réel de personnes présentes au ${esc(name)}"><div class="range-scale"><span>0</span><span>15</span><span>30</span></div></div>`;
 }).join("");
 return `<div class="card actual-attendance-card"><div class="row"><div><h2>Présence réelle</h2><div class="muted">Saisissez le nombre réel de personnes présentes pour chaque créneau, selon la semaine du calendrier.</div></div></div><div class="actual-grid">${actualCards}</div><div class="muted actual-help">Jauge de 0 à 30 personnes. ${courseWeek?"La valeur est enregistrée pour la semaine affichée.":"Cette semaine n'est ni une semaine Cours ni une semaine Libre : aucune présence n'est demandée."}</div></div>`;
}

function renderTdb(){
 if(!canCoach()){ document.getElementById("tdbView").innerHTML=""; return; }
 const history=getActualAttendanceHistory();
 document.getElementById("tdbView").innerHTML=`<div class="card"><div class="row"><div><p class="eyebrow">TABLEAU DE BORD</p><h2>Évolution des présences réelles</h2><div class="muted">Suivi des présences réellement constatées pour les 3 créneaux. La ligne à 20 correspond au seuil de référence.</div></div></div>${renderAttendanceEvolution(history)}</div>${renderActualAttendanceCard()}`;
}

function renderMembers(){
 if(!canAdmin()){ document.getElementById("membersView").innerHTML=""; return; }
 const visibleSlots = selectedSlots.size ? [...selectedSlots].sort((a,b)=>a-b) : [1,2,3];
 const groups=visibleSlots.map(slot=>{
   const name=SLOT_NAMES[slot-1], members=db.members.filter(m=>m.active&&getMemberRole(m)==="member"&&Number(m.slot)===slot);
   return `<div class="member-group"><div class="member-group-head"><h3>${name}</h3><span>${members.length}/${getSlotQuota(slot)} adhérents</span></div>${members.length?members.map(m=>adminMemberCard(m)).join("") : '<div class="empty">Aucun adhérent dans ce créneau.</div>'}</div>`;
 }).join("");
 const staff=db.members.filter(m=>m.active&&getMemberRole(m)!=="member");
 const staffWithSlot=staff.filter(m=>getMemberRole(m)==="admin"&&[1,2,3].includes(Number(m.slot))).length;
 const staffHtml=`<div class="member-group"><div class="member-group-head"><h3>Encadrants / Administrateurs</h3><span>${staff.length} compte${staff.length>1?"s":""} · ${staffWithSlot} admin${staffWithSlot>1?"s":""} avec créneau</span></div>${staff.length?staff.map(m=>adminMemberCard(m)).join(""):'<div class="empty">Aucun encadrant ou administrateur.</div>'}</div>`;
 document.getElementById("membersView").innerHTML=`${canAdmin()?`<div class="card actual-attendance-card"><div class="row"><div><h2>Quotas des créneaux</h2><div class="muted">Définissez le quota de chaque créneau. Ce réglage est permanent et indépendant du calendrier.</div></div></div><div class="actual-grid">${visibleSlots.map(slot=>{const name=SLOT_NAMES[slot-1],value=getSlotQuota(slot);return `<div class="actual-slot"><div class="row"><div><strong>${name}</strong><div class="muted">Quota du créneau, indépendant du calendrier</div></div><output id="quotaValue${slot}" class="actual-value">${value}</output></div><input class="actual-range" type="range" min="0" max="30" step="1" value="${value}" oninput="document.getElementById('quotaValue${slot}').value=this.value" onchange="setQuota(${slot},this.value)" aria-label="Quota du ${esc(name)}"><div class="range-scale"><span>0</span><span>15</span><span>30</span></div></div>`}).join("")}</div><div class="muted actual-help">Quota de 0 à 30 personnes par créneau.</div></div>`:""}`+
 `<div class="card"><div class="row"><div><h2>Adhérents par créneau</h2><div class="muted">Un adhérent doit avoir un créneau habituel. Un encadrant ou administrateur peut être créé sans créneau.</div></div><button class="primary" onclick="addMember()">+ Ajouter</button></div></div>`+
 (canManageRoles()?`<div class="card"><div class="row"><div><h2>Gestion des rôles</h2><div class="muted">Adhérent = créneau obligatoire · Encadrant = sans créneau · Administrateur = créneau facultatif.</div></div></div><div class="role-grid"><div class="role-header"><span>Personne</span><span>Rôle</span><span>Créneau habituel</span></div>${db.members.filter(m=>m.active&&(!selectedSlots.size||getMemberRole(m)!=="member"||selectedSlots.has(Number(m.slot)))).map(m=>{const r=getMemberRole(m), admin=r==="admin", member=r==="member";return `<div class="role-item"><div class="role-person"><strong>${esc(m.name)}</strong></div><div class="role-field"><span class="role-field-label">Rôle</span><select onchange="setMemberRole(${m.id},this.value)"><option value="member" ${member?"selected":""}>Adhérent</option><option value="coach" ${r==="coach"?"selected":""}>Encadrant</option><option value="admin" ${admin?"selected":""}>Administrateur</option></select></div><div class="role-field"><span class="role-field-label">Créneau</span>${admin?`<select onchange="setMemberHabitualSlot(${m.id},this.value)"><option value="" ${!m.slot?"selected":""}>Aucun</option><option value="1" ${Number(m.slot)===1?"selected":""}>Créneau 1</option><option value="2" ${Number(m.slot)===2?"selected":""}>Créneau 2</option><option value="3" ${Number(m.slot)===3?"selected":""}>Créneau 3</option></select>`:member?`<span class="role-slot-value">${slotLabel(m.slot)}</span>`:`<span class="role-slot-value">Aucun</span>`}</div></div>`}).join("")}</div></div>`:"" )+groups+staffHtml+(canAdmin()?renderAdminTools():"");
}

function renderAdminTools(){
 if(!canAdmin()) return "";
 const last=db.actionLog?.length?db.actionLog[db.actionLog.length-1]:null; const lastBackup=readStorageJson("sportclub-last-backup",null);
 return `<div class="card admin-tools-card"><div class="row"><div><p class="eyebrow">COMPTES</p><h2>Comptes adhérents</h2><div class="muted">Les comptes sont créés via une fonction serveur sécurisée. La clé secrète Supabase ne quitte jamais le serveur.</div></div></div><div class="account-admin-list">${db.members.filter(m=>m.active&&(getMemberRole(m)!=="member"||!selectedSlots.size||selectedSlots.has(Number(m.slot)))).map(m=>{const a=v63AccountStatus[Number(m.id)]||{};const passwordState=a.password_changed_at?`<span class="account-security-ok">● Mot de passe modifié</span><span class="muted">${fmtDateTime(a.password_changed_at)}</span>`:(a.must_change_password?`<span class="account-security-warning">● Mot de passe temporaire à changer</span>`:(a.user_id?`<span class="account-security-unknown">● Modification non renseignée</span>`:''));const login=a.last_sign_in_at?fmtDateTime(a.last_sign_in_at):'Jamais';return `<div class="account-admin-row"><div><strong>${esc(m.name)}</strong><div class="muted">${m.authEmail?`Compte : ${esc(m.authEmail)}`:'Aucun compte Auth associé'}</div>${m.authEmail?`<div class="account-security"><span>Dernière connexion : <strong>${esc(login)}</strong></span>${passwordState}</div>`:''}</div><div class="actions">${m.authEmail?`<button onclick="manageMemberAccount(${m.id})">Gérer</button>`:`<button class="primary" onclick="createMemberAccount(${m.id})">Créer</button>`}</div></div>`}).join('')}</div></div>`+
 `<div class="card admin-tools-card"><div class="row"><div><p class="eyebrow">SÉCURITÉ & DONNÉES</p><h2>Sauvegarde et restauration</h2><div class="muted">Exportez une copie complète des données avant une modification importante. La sauvegarde inclut membres, présences, calendrier, objectifs, notes et réglages.</div></div><div class="actions"><button class="secondary" onclick="exportBackup()">Exporter les données</button><button class="secondary" onclick="document.getElementById('backupFileInput').click()">Importer une sauvegarde</button></div></div><div class="backup-meta">${lastBackup?`Dernière sauvegarde : ${fmtDateTime(lastBackup)}`:'Aucune sauvegarde locale enregistrée.'}${last?` · Dernière action : ${fmtDateTime(last.date)} · ${esc(last.action)}`:''}</div><input id="backupFileInput" type="file" accept="application/json,.json" hidden onchange="importBackup(this.files[0])"></div>`;
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
 db.members.forEach((m,i)=>{m.id=Number(m.id)||i+1;m.active=m.active!==false;m.role=["member","coach","admin"].includes(m.role)?m.role:"member";m.slot=m.role==="member"?[1,2,3].includes(Number(m.slot))?Number(m.slot):1:m.role==="admin"&&[1,2,3].includes(Number(m.slot))?Number(m.slot):null;m.password=String(m.password||"1234");m.changeCount=Number(m.changeCount)||0;m.mustChangePassword=!!m.mustChangePassword;});
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
 return status==='approved'?'Validée':status==='rejected'?'Refusée':status==='cancelled'?'Annulée':'En attente';
}
function requestDateLabel(ts){
 if(!ts) return 'date non renseignée';
 return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ts));
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
function renderMoves(){
 const currentWeek=weekKey();
 const pending=db.moves.filter(m=>m.status==='pending').sort((a,b)=>
   requestWeekKey(a).localeCompare(requestWeekKey(b))||
   getChangeCount(a.memberId)-getChangeCount(b.memberId)||
   Number(a.createdAt||a.id||0)-Number(b.createdAt||b.id||0)
 );
 const pendingStatusRequests=(db.statusRequests||[]).filter(r=>r.status==='pending').sort(compareRequestWeekAsc);
 const history=getAllRequestHistory().filter(r=>['slot_change','status_change'].includes(r.type));
 const processed=history.filter(r=>r.status!=='pending').sort(compareRequestWeekDesc);
 const showPending=adminRequestFilter==='pending'||adminRequestFilter==='all';
 const showProcessed=adminRequestFilter==='processed'||adminRequestFilter==='all';
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
 document.getElementById('movesView').innerHTML=`<div class="card"><div class="row"><div><h2>Demandes</h2><div class="muted">Filtrez les demandes en cours ou déjà traitées.</div></div><button class="primary" onclick="autoValidateMoves()">Lancer le traitement 13h30</button></div><div class="request-filter" role="group" aria-label="Filtrer les demandes"><button class="filter-btn ${adminRequestFilter==='pending'?'active':''}" onclick="setAdminRequestFilter('pending')">En cours (${pendingTotal})</button><button class="filter-btn ${adminRequestFilter==='processed'?'active':''}" onclick="setAdminRequestFilter('processed')">Traitées (${processedTotal})</button><button class="filter-btn ${adminRequestFilter==='all'?'active':''}" onclick="setAdminRequestFilter('all')">Toutes</button></div><div class="move-capacity">${SLOT_NAMES.map((n,i)=>`<span><strong>${n}</strong> ${counts[i]}/20 présents · ${targetPending[i]} demande${targetPending[i]>1?'s':''} en attente vers ce créneau</span>`).join('')}</div></div>${showPending?`<h3 class="request-section-title">Demandes en attente de modification de présence</h3>${statusRequestHtml}<h3 class="request-section-title">Demandes en attente de changement de créneau</h3>${moveHtml}`:''}${showProcessed?`<h3 class="request-section-title">Demandes traitées</h3>${historyHtml}`:''}`;
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
function autoValidateMoves(){
 if(!isAttendanceWeek()) return {processed:0,approved:0,rejected:0,remaining:0};
 const key=weekKey();
 const pending=getWeekMoves(key).filter(m=>m.status==='pending').sort((a,b)=>getChangeCount(a.memberId)-getChangeCount(b.memberId)||Number(a.createdAt||a.id||0)-Number(b.createdAt||b.id||0));
 let approved=0,rejected=0;
 pending.forEach(x=>{
   const ok=approveMove(x.id,true);
   if(ok) approved++;
   else {
     const current=db.moves.find(m=>Number(m.id)===Number(x.id));
     if(current&&current.status==='pending'){
       current.status='rejected'; current.rejectedAt=Date.now(); current.autoRejected=true; rejected++;
     }
   }
 });
 const remaining=getWeekMoves(key).filter(m=>m.status==='pending').length;
 if(approved||rejected){save();render();toast(`${approved} validée${approved>1?'s':''}, ${rejected} refusée${rejected>1?'s':''} automatiquement à 13h30.`);}
 return {processed:pending.length,approved,rejected,remaining};
}

function scheduleAutoValidation(){
 const now=new Date();
 if(now.getHours()===13&&now.getMinutes()===30){
   const marker=now.getFullYear()+"-"+(now.getMonth()+1)+"-"+now.getDate();
   if(localStorage.getItem("sportclub-auto-validation-date")!==marker){
     localStorage.setItem("sportclub-auto-validation-date",marker);
     autoValidateMoves();
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
function syncTabs(){
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
});
document.getElementById("prevWeek").onclick=()=>{weekOffset--;render()};
document.getElementById("nextWeek").onclick=()=>{weekOffset++;render()};
document.getElementById("todayWeek").onclick=()=>{weekOffset=0;render()};
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

document.querySelectorAll(".filter-btn").forEach(btn=>btn.addEventListener("click",()=>{
 const n=btn.dataset.slotFilter;
 if(n==="all") selectedSlots.clear();
 else {
   const num=Number(n);
   if(selectedSlots.has(num)) selectedSlots.delete(num); else selectedSlots.add(num);
 }
 render();
}));

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
  const out={members:[],attendance:{},actualAttendance:{},quotas:{1:30,2:30,3:30},moves:[],absencePeriods:[],statusRequests:[],objectiveComments:[],objectiveReactions:[],coachNotesByDate:{},actionLog:[]};
  const profiles=rows.profiles||[];
  const roleByMember=new Map(profiles.filter(p=>p.member_id!=null).map(p=>[Number(p.member_id),p.role]));
  out.members=(rows.members||[]).map(m=>{const prof=profiles.find(p=>Number(p.member_id)===Number(m.id));return {id:Number(m.id),name:m.name,slot:m.habitual_slot==null?null:Number(m.habitual_slot),active:m.active!==false,changeCount:Number(m.change_count||0),role:roleByMember.get(Number(m.id))||'member',authEmail:prof?.auth_email||'',mustChangePassword:!!prof?.must_change_password};});
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

  const names=['members','profiles','quotas','attendance','actual_attendance','slot_change_requests','absence_periods','status_change_requests','calendar_weeks','calendar_events','calendar_settings','session_objectives','objective_comments','objective_reactions'];
  if(profile.role!=='member') names.push('coach_notes','action_log');
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
  if(rows.calendar_settings?.[0]){
    const c=rows.calendar_settings[0];
    calendarData.period={start:c.start_date,end:c.end_date};
  }
  calendarData.weeks={};
  (rows.calendar_weeks||[]).forEach(w=>{calendarData.weeks[w.week_start]={type:v53MapWeekType(w.week_type),label:w.label||w.week_type,reportDate:w.report_date||null};});
  calendarData.events=(rows.calendar_events||[]).map(e=>({id:Number(e.id),date:e.event_date,eventType:e.event_type,title:e.title,reportDate:e.report_date||null}));
  ensureCalendarCourseMondays();
  if(profile.role==='admin') await v63LoadAccountStatus();
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
      const members=(db.members||[]).map(m=>({id:Number(m.id),name:m.name,habitual_slot:[1,2,3].includes(Number(m.slot))?Number(m.slot):null,active:m.active!==false,change_count:Number(m.changeCount||0)}));
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

function v53LoginOverlay(message="Connectez-vous avec votre compte sécurisé."){
  let box=document.getElementById('memberLogin');
  if(!box){box=document.createElement('div');box.id='memberLogin';document.body.appendChild(box);}
  box.innerHTML=`<div class="login-card"><p class="eyebrow">DON BOSCO - PERFECTIONNEMENT</p><h2>Connexion</h2><p class="muted">${esc(message)}</p><label>Email<input id="loginEmail" type="email" autocomplete="username" placeholder="prenom.nom@exemple.fr"></label><label>Mot de passe<input id="loginPassword" type="password" autocomplete="current-password" placeholder="Mot de passe"></label><button class="primary" onclick="performLogin()">Se connecter</button><div class="login-help">Les comptes sont gérés par Supabase Auth. Aucun mot de passe n'est stocké dans l'application.</div></div>`;
  box.classList.remove('hidden');
}

function v55PromptPasswordChange(force=false){
  let modal=document.getElementById('passwordModal');
  if(!modal){ modal=document.createElement('div'); modal.id='passwordModal'; document.body.appendChild(modal); }
  modal.innerHTML=`<div class="password-modal-card"><div class="profile-menu-head"><div><div class="eyebrow">SÉCURITÉ DU COMPTE</div><h3>${force?'Changement de mot de passe obligatoire':'Modifier le mot de passe'}</h3></div>${force?'':'<button class="profile-close" onclick="closePasswordModal()">×</button>'}</div><p class="muted">Votre compte utilise encore le mot de passe temporaire <strong>123456</strong>. Pour continuer, choisissez un nouveau mot de passe personnel d’au moins 6 caractères.</p>${force?'':'<label>Mot de passe actuel<input id="currentPassword" type="password" autocomplete="current-password"></label>'}<label>Nouveau mot de passe<input id="newPassword" type="password" autocomplete="new-password"></label><label>Confirmer le nouveau mot de passe<input id="confirmPassword" type="password" autocomplete="new-password"></label><div class="password-modal-actions">${force?'':'<button class="secondary" onclick="closePasswordModal()">Annuler</button>'}<button class="primary" onclick="saveOwnPassword(${force})">Enregistrer</button></div></div>`;
  modal.classList.add('open');
  if(force) modal.dataset.forced='true'; else delete modal.dataset.forced;
  setTimeout(()=>document.getElementById('newPassword')?.focus(),0);
}

performLogin=async function(){
  const sb=v53Client();
  if(!sb) return toast('Supabase n’est pas disponible.');
  const email=String(document.getElementById('loginEmail')?.value||'').trim();
  const password=String(document.getElementById('loginPassword')?.value||'');
  if(!email||!password) return toast('Saisissez votre email et votre mot de passe.');
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error) return v53ToastError('Connexion refusée.',error);
  window.supabaseSession=data.session;
  try{ await v53LoadRemote(); hideMemberLogin(); syncRoleSelector(); render(); toast('Connexion réussie'); if(v53.mustChangePassword || password==='123456') { if(password==='123456') v53.mustChangePassword=true; setTimeout(()=>v55PromptPasswordChange(true),150); } }
  catch(e){
    await sb.auth.signOut({scope:'local'}); v53ResetLocalAuth();
    if(e?.code==='V68_FORCE_LOGOUT'){ v53LoginOverlay('Cette session a été déconnectée par un administrateur. Reconnectez-vous pour continuer.'); toast('Session déconnectée par un administrateur.'); }
    else { v53ToastError('Compte non configuré.',e); v53LoginOverlay(); }
  }
};

logoutMember=async function(){
  const sb=v53Client();
  try{if(sb) await sb.auth.signOut();}catch(e){console.warn(e);}
  v53ResetLocalAuth(); v53.hydrated=false; v53.role=null; v53.memberId=null; v53.displayName=''; closeProfileMenu(); syncRoleSelector(); v53LoginOverlay();
};

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

/* ========================= V79 — PUSH NOTIFICATIONS ========================= */
(function(){
  const V79_APP_URL='https://contactdbbn.github.io/don-bosco-perfectionnement/';
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
    return {
      profile_id:userId,
      endpoint:json.endpoint,
      p256dh:json.keys?.p256dh||'',
      auth:json.keys?.auth||'',
      user_agent:navigator.userAgent,
      active:true,
      updated_at:new Date().toISOString()
    };
  }
  async function saveSubscription(sub){
    const sb=v53Client(), user=v53User();
    if(!sb||!user) throw new Error('Connexion requise.');
    const row=subscriptionRow(sub,user.id);
    if(!row.endpoint||!row.p256dh||!row.auth) throw new Error('Abonnement Push incomplet.');
    const {error}=await sb.from('push_subscriptions').upsert(row,{onConflict:'profile_id,endpoint'});
    if(error) throw error;
  }
  async function removeSubscription(sub){
    const sb=v53Client(), user=v53User();
    if(!sb||!user||!sub) return;
    const endpoint=sub.endpoint;
    const {error}=await sb.from('push_subscriptions').delete().eq('profile_id',user.id).eq('endpoint',endpoint);
    if(error) console.warn('[V79] Suppression abonnement impossible.',error);
  }
  async function updateButton(){
    const btn=document.getElementById('notifyBtn'); if(!btn) return;
    if(!supports()){ btn.textContent='🔔 Notifications'; btn.disabled=true; btn.title='Notifications Push non supportées par ce navigateur.'; return; }
    const permission=Notification.permission;
    if(permission==='denied'){ btn.textContent='🔕 Notifications bloquées'; btn.disabled=false; btn.title='Autorisez les notifications dans les réglages du navigateur.'; return; }
    try{
      const sub=await (await registration()).pushManager.getSubscription();
      if(permission==='granted' && sub){ btn.textContent='🔔 Notifications activées'; btn.disabled=false; btn.title='Notifications Push activées sur cet appareil.'; }
      else { btn.textContent='🔔 Activer les notifications'; btn.disabled=false; btn.title='Activer les notifications Push sur cet appareil.'; }
    }catch(_){ btn.textContent='🔔 Activer les notifications'; btn.disabled=false; }
  }
  async function subscribe(){
    if(busy) return; busy=true;
    try{
      if(!supports()) throw new Error('Les notifications Push ne sont pas supportées par ce navigateur.');
      if(!v53User()) throw new Error('Connectez-vous avant d’activer les notifications.');
      if(!window.isSecureContext) throw new Error('Les notifications Push nécessitent une connexion HTTPS.');
      const permission=Notification.permission==='granted'? 'granted' : await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Permission de notifications non accordée.');
      const reg=await registration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub){
        sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg().pushPublicKey)});
      }
      await saveSubscription(sub);
      await updateButton();
      toast('Notifications Push activées sur cet appareil.');
      // Envoie une notification de test pour valider immédiatement la chaîne complète.
      const sb=v53Client();
      if(sb){
        try{
          const {data,error}=await sb.functions.invoke('push-notifications',{body:{action:'test'}});
          if(error) console.warn('[V79] Test Push impossible.',error);
          else if(data?.sent) toast('Notification de test envoyée.');
        }catch(e){ console.warn('[V79] Test Push impossible.',e); }
      }
    }catch(e){ console.warn('[V79]',e); toast(e?.message||'Impossible d’activer les notifications.'); }
    finally{ busy=false; await updateButton(); }
  }
  async function unsubscribe(){
    if(busy) return; busy=true;
    try{
      const reg=await registration(); const sub=await reg.pushManager.getSubscription();
      if(sub){ await removeSubscription(sub); await sub.unsubscribe(); }
      toast('Notifications désactivées sur cet appareil.');
    }catch(e){ console.warn('[V79] Désactivation impossible.',e); toast('Impossible de désactiver les notifications.'); }
    finally{ busy=false; await updateButton(); }
  }
  async function syncExisting(){
    if(!supports()||!v53User()||Notification.permission!=='granted') return;
    try{
      const sub=await (await registration()).pushManager.getSubscription();
      if(sub) await saveSubscription(sub);
    }catch(e){ console.warn('[V79] Synchronisation abonnement Push impossible.',e); }
    finally{ await updateButton(); }
  }
  async function click(){
    if(Notification.permission==='granted'){
      const sub=await (await registration()).pushManager.getSubscription().catch(()=>null);
      if(sub){
        await unsubscribe();
        return;
      }
    }
    await subscribe();
  }
  window.v79PushSubscribe=subscribe;
  window.v79PushUnsubscribe=unsubscribe;
  window.v79PushSync=syncExisting;
  window.v79PushTest=async()=>{
    const sb=v53Client(); if(!sb||!v53User()) return toast('Connectez-vous pour tester les notifications.');
    try{ const {data,error}=await sb.functions.invoke('push-notifications',{body:{action:'test'}}); if(error)throw error; toast(data?.sent?'Notification de test envoyée.':'Aucun appareil Push actif.'); }catch(e){ console.warn(e); toast('Test Push impossible. Vérifiez le déploiement Supabase V79.'); }
  };
  window.v79UpdatePushButton=updateButton;
  const btn=document.getElementById('notifyBtn');
  if(btn){ btn.onclick=click; }
  document.addEventListener('supabase-auth-change',()=>{ setTimeout(syncExisting,250); });
  window.addEventListener('focus',()=>{ if(v53User()) syncExisting(); });
  window.addEventListener('pageshow',()=>{ if(v53User()) syncExisting(); });
  setTimeout(()=>{ updateButton(); if(v53User()) syncExisting(); },1200);
})();
