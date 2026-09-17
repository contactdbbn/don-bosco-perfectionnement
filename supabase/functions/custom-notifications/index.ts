import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret"};
const url=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret=Deno.env.get('PUSH_CRON_SECRET')||'';
const vapidSubject=Deno.env.get('VAPID_SUBJECT')||'mailto:contact@donboscobadminton.fr';
const vapidPublic=Deno.env.get('VAPID_PUBLIC_KEY')||'';
const vapidPrivate=Deno.env.get('VAPID_PRIVATE_KEY')||'';

function cleanSecret(value:string){return String(value||'').trim().replace(/^['"]|['"]$/g,'').replace(/\s+/g,'')}
function decodeBase64(value:string){const normalized=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);const raw=atob(normalized);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function encodeBase64Url(bytes:Uint8Array){let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
async function normalizeVapidPrivateKey(value:string){let key=cleanSecret(value);if(!key)return '';const pem=key.replace(/\\n/g,'\n');if(pem.includes('BEGIN PRIVATE KEY'))key=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');try{const bytes=decodeBase64(key);if(bytes.length===32)return encodeBase64Url(bytes);const cryptoKey=await crypto.subtle.importKey('pkcs8',bytes,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const jwk=await crypto.subtle.exportKey('jwk',cryptoKey) as JsonWebKey;if(!jwk.d)throw new Error('JWK privé sans paramètre d');const raw=decodeBase64(String(jwk.d));if(raw.length!==32)throw new Error(`clé privée décodée à ${raw.length} octets au lieu de 32`);return encodeBase64Url(raw)}catch(e){if(/^[0-9a-fA-F]{64}$/.test(key))return encodeBase64Url(Uint8Array.from(key.match(/../g)!.map(x=>parseInt(x,16))));throw new Error(`VAPID_PRIVATE_KEY invalide : ${String((e as any)?.message||e)}`)}}
function normalizeVapidPublicKey(value:string){const key=cleanSecret(value).replace(/\\n/g,'');if(!key)return '';try{const bytes=decodeBase64(key);if(bytes.length===65)return encodeBase64Url(bytes)}catch(_){}return key}

const sb=createClient(url,service);
let vapidReady=false
async function ensureVapid(){if(vapidReady)return;if(!vapidPublic||!vapidPrivate)throw new Error('VAPID keys missing');webpush.setVapidDetails(vapidSubject,normalizeVapidPublicKey(vapidPublic),await normalizeVapidPrivateKey(vapidPrivate));vapidReady=true}

const roleMap={member:'member',coach:'coach',admin:'admin'} as const;
function parisParts(d=new Date()){const f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});const x=f.formatToParts(d);const get=(t:string)=>x.find(p=>p.type===t)?.value||'';const js=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'].indexOf(get('weekday'));return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour')),minute:Number(get('minute')),day:js};}
function inWindow(time:string, now:{hour:number,minute:number}){const [h,m]=String(time||'00:00').split(':').map(Number);return now.hour===h && now.minute>=m && now.minute<m+5;}
async function isAdmin(req:Request){const auth=req.headers.get('authorization')||'';const token=auth.replace(/^Bearer\s+/i,'');if(!token)return false;const {data:{user}}=await sb.auth.getUser(token);if(!user)return false;const {data:p}=await sb.from('profiles').select('role,active').eq('id',user.id).maybeSingle();return p?.active!==false&&p?.role==='admin';}
async function recipients(roles:string[]){const {data:profiles,error}=await sb.from('profiles').select('id,role,active').in('role',roles).eq('active',true);if(error)throw error;return profiles||[];}
async function sendToProfile(profile:any,title:string,body:string,type:string,eventKey:string){await ensureVapid();const {data:subs,error}=await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('profile_id',profile.id).eq('active',true);if(error)throw error;let sent=0;for(const sub of subs||[]){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title,body,data:{url:Deno.env.get('APP_URL')||''}}));sent++;await sb.from('push_subscriptions').update({last_used_at:new Date().toISOString()}).eq('id',sub.id);}catch(e){const status=(e as any)?.statusCode;if(status===404||status===410)await sb.from('push_subscriptions').update({active:false}).eq('id',sub.id);}} if(sent){await sb.from('push_notification_log').upsert({profile_id:profile.id,notification_type:type,event_key:eventKey,title,body},{onConflict:'profile_id,notification_type,event_key'});} return sent;}
async function dispatch(){
 if(!vapidPublic||!vapidPrivate) throw new Error('VAPID keys missing');
 const now=parisParts();
 const {data:programs,error}=await sb.from('custom_notification_programs').select('*').eq('active',true);if(error)throw error;
 const {data:week}=await sb.from('calendar_weeks').select('week_type,label').eq('week_start',now.date).maybeSingle();
 // Calendar weeks are Mondays; resolve current Monday when necessary.
 const dt=new Date(`${now.date}T12:00:00`);const monday=new Date(dt);const day=monday.getDay()||7;monday.setDate(monday.getDate()-day+1);const mondayKey=monday.toISOString().slice(0,10);
 const {data:wi}=await sb.from('calendar_weeks').select('week_type,label').eq('week_start',mondayKey).maybeSingle();
 let total=0;
 for(const p of programs||[]){
   if(!inWindow(p.send_time,now)) continue;
   const ok=p.mode==='week_types'?(p.week_types||[]).includes(wi?.week_type||''):(p.days||[]).map(Number).includes(now.day);
   if(!ok||!String(p.content||'').trim())continue;
   const roles=(p.recipients||[]).filter((r:string)=>roleMap[r as keyof typeof roleMap]);if(!roles.length)continue;
   const profiles=await recipients(roles);for(const profile of profiles)total+=await sendToProfile(profile,p.title||'Don Bosco - Perfectionnement',p.content,'custom_program_'+p.id,`${now.date}-${p.id}`);
 }
 return {ok:true,sent:total,date:now.date};
}
async function manual(body:any){
 if(!await isAdmin(body.req)) throw new Error('Administrateur requis');
 const roles=(body.recipients||[]).filter((r:string)=>roleMap[r as keyof typeof roleMap]);if(!roles.length)throw new Error('Aucun destinataire');
 const profiles=await recipients(roles);let total=0;const key=String(body.event_key||`manual-${Date.now()}`);for(const p of profiles)total+=await sendToProfile(p,String(body.title||'Don Bosco - Perfectionnement'),String(body.body||''),'custom_manual',key);return {ok:true,sent:total};
}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{const body=await req.json().catch(()=>({}));const secret=req.headers.get('x-cron-secret')||'';if(body.action==='dispatch'&&cronSecret&&secret===cronSecret)return Response.json(await dispatch(),{headers:cors});if(body.action==='manual')return Response.json(await manual({...body,req}),{headers:cors});return Response.json({ok:false,error:'Action non autorisée'},{status:400,headers:cors});}catch(e){console.error('[custom-notifications]',e);return Response.json({ok:false,error:String((e as any)?.message||e)},{status:500,headers:cors});}});
