import { createClient } from 'npm:@supabase/supabase-js@2'
import { deserializeVapidKeys, sendPushNotification } from 'npm:web-push-browser@1.4.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'https://contactdbbn.github.io/don-bosco-perfectionnement/'
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') || ''
const APP_URL = 'https://contactdbbn.github.io/don-bosco-perfectionnement/'
const DEFAULT_SETTINGS: Record<string, {active:boolean,days:number[],start:string,end:string}> = {
  attendance_reminder:{active:true,days:[0],start:'18:00',end:'18:05'},
  new_slot_request:{active:true,days:[0,1,2,3,4,5,6],start:'07:00',end:'23:00'},
  new_status_request:{active:true,days:[0,1,2,3,4,5,6],start:'07:00',end:'23:00'},
  slot_request_decision:{active:true,days:[0,1,2,3,4,5,6],start:'07:00',end:'23:00'},
  status_request_decision:{active:true,days:[0,1,2,3,4,5,6],start:'07:00',end:'23:00'},
  attendance_confirmed:{active:true,days:[0,1,2,3,4,5,6],start:'07:00',end:'23:00'}
}
async function loadNotificationSettings(){
  const {data,error}=await admin.from('notification_settings').select('notification_type,active,days,start_time,end_time')
  if(error){ console.warn('[push] paramètres notifications indisponibles, valeurs par défaut utilisées',error); return DEFAULT_SETTINGS }
  const out={...DEFAULT_SETTINGS}
  for(const row of data||[]) out[row.notification_type]={active:row.active!==false,days:Array.isArray(row.days)?row.days.map(Number):[],start:String(row.start_time||'07:00').slice(0,5),end:String(row.end_time||'23:00').slice(0,5)}
  return out
}
function weekdayFromDate(dateString:string){
  return new Date(`${dateString}T12:00:00Z`).getUTCDay()
}

function addDays(dateString:string, days:number){
  const d=new Date(`${dateString}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()+days)
  return d.toISOString().slice(0,10)
}

function withinWindow(now:{date:string,hour:number,minute:number},setting:{active:boolean,days:number[],start:string,end:string}){
  if(!setting.active || !setting.days.includes(weekdayFromDate(now.date))) return false
  const cur=now.hour*60+now.minute, start=Number(setting.start.slice(0,2))*60+Number(setting.start.slice(3,5)), end=Number(setting.end.slice(0,2))*60+Number(setting.end.slice(3,5))
  return start<=end ? cur>=start&&cur<=end : cur>=start||cur<=end
}


const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })
const authClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() })
}

function parisNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
}

function mondayKey(dateString: string) {
  const d = new Date(`${dateString}T12:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().slice(0, 10)
}

function isoWeekMonday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  return mondayKey(`${p.year}-${p.month}-${p.day}`)
}

async function sendToProfile(profileId: string, title: string, body: string, data: Record<string, unknown> = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys not configured.')
  console.log(`[push] envoi demandé profile=${profileId} title="${title}"`)
  const keys = await deserializeVapidKeys({ publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY })
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)
    .eq('active', true)
  if (error) throw error

  console.log(`[push] abonnements actifs profile=${profileId}: ${(subscriptions || []).length}`)
  if (!subscriptions?.length) return 0

  let sent = 0
  for (const sub of subscriptions || []) {
    const endpointHint = String(sub.endpoint || '').slice(0, 70)
    try {
      console.log(`[push] tentative endpoint=${endpointHint}`)
      const response = await sendPushNotification(
        keys,
        { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
        VAPID_SUBJECT,
        JSON.stringify({ title, body, data: { ...data, url: APP_URL } }),
      )
      console.log(`[push] réponse endpoint=${endpointHint} status=${response.status} ok=${response.ok}`)
      if (response.ok) {
        sent++
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
        console.log(`[push] envoi réussi subscription=${sub.id}`)
      } else if (response.status === 404 || response.status === 410) {
        await admin.from('push_subscriptions').update({ active: false }).eq('id', sub.id)
        console.warn(`[push] abonnement désactivé status=${response.status} subscription=${sub.id}`)
      } else {
        let detail = ''
        try { detail = (await response.text()).slice(0, 500) } catch (_) {}
        console.warn(`[push] envoi refusé status=${response.status} subscription=${sub.id}${detail ? ` detail=${detail}` : ''}`)
        if (response.status === 403) {
          await admin.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', sub.id)
          console.warn(`[push] abonnement désactivé après 403 subscription=${sub.id}; renouvellement requis côté navigateur`)
        }
      }
    } catch (e) {
      const status = Number((e as any)?.statusCode || (e as any)?.status || 0)
      console.error(`[push] erreur endpoint=${endpointHint} status=${status}`, e)
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').update({ active: false }).eq('id', sub.id)
        console.warn(`[push] abonnement désactivé après erreur status=${status} subscription=${sub.id}`)
      }
    }
  }
  console.log(`[push] résultat profile=${profileId}: ${sent}/${subscriptions.length} envoi(s) réussi(s)`)
  return sent
}

async function claimNotification(profileId:string, type:string, eventKey:string, title:string, body:string){
  // Réservation atomique : la contrainte UNIQUE(profile_id, notification_type, event_key)
  // empêche deux invocations Cron simultanées d'envoyer deux fois le même événement.
  const { data, error } = await admin
    .from('push_notification_log')
    .insert({ profile_id: profileId, notification_type: type, event_key: eventKey, title, body })
    .select('id')
    .maybeSingle()
  if(error){
    if(String(error.code)==='23505'){
      console.log(`[push][dedupe] déjà traité/réservé profile=${profileId} type=${type} event=${eventKey}`)
      return false
    }
    throw error
  }
  return !!data
}

async function releaseNotification(profileId:string, type:string, eventKey:string){
  const { error } = await admin
    .from('push_notification_log')
    .delete()
    .eq('profile_id',profileId)
    .eq('notification_type',type)
    .eq('event_key',eventKey)
  if(error) console.warn(`[push][dedupe] libération impossible profile=${profileId} type=${type} event=${eventKey}: ${error.message}`)
}

async function deliverOnce(profileId:string, type:string, eventKey:string, title:string, body:string, data:Record<string,unknown>={}){
  const claimed=await claimNotification(profileId,type,eventKey,title,body)
  if(!claimed) return 0
  try{
    const delivered=await sendToProfile(profileId,title,body,data)
    if(delivered>0) return delivered
    // Aucun abonnement actif : on retire la réservation pour permettre une nouvelle
    // tentative pendant la fenêtre configurée.
    await releaseNotification(profileId,type,eventKey)
    return 0
  }catch(e){
    // En cas d'échec d'envoi, le prochain passage Cron pourra retenter.
    await releaseNotification(profileId,type,eventKey)
    throw e
  }
}


async function authenticateAdmin(req: Request) {
  const user = await authenticateUser(req)
  if (!user) return null
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,role,active')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!profile?.active || profile.role !== 'admin') return null
  return profile
}

function slotLabel(slot: number) {
  return [1, 2, 3].includes(Number(slot)) ? `Créneau ${Number(slot)}` : 'Aucun créneau'
}

function formatDateFr(dateString: string) {
  return new Date(`${dateString}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}

async function getAttendanceEventDate(weekStart: string) {
  const end = addDays(weekStart, 7)
  const { data, error } = await admin
    .from('calendar_events')
    .select('event_date,event_type,title')
    .gte('event_date', weekStart)
    .lt('event_date', end)
    .in('title', ['Cours', 'Libre'])
    .order('event_date', { ascending: true })
    .limit(1)
  if (error) throw error
  return data?.[0]?.event_date || weekStart
}

async function sendManualAttendanceReminder() {
  const currentWeek = isoWeekMonday()
  const nextWeek = addDays(currentWeek, 7)
  console.log(`[push][manual_attendance_reminder] recherche semaine suivante=${nextWeek}`)

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id,member_id,role,display_name')
    .eq('role', 'member')
    .eq('active', true)
    .not('member_id', 'is', null)
  if (profilesError) throw profilesError

  const ids = (profiles || []).map(p => Number(p.member_id)).filter(Number.isFinite)
  const { data: members, error: membersError } = ids.length
    ? await admin.from('members').select('id,name,habitual_slot,active').in('id', ids)
    : { data: [], error: null }
  if (membersError) throw membersError
  const memberById = new Map((members || []).map(m => [Number(m.id), m]))

  let eligible = 0, pending = 0, sentProfiles = 0, sent = 0, noSubscription = 0, already = 0
  for (const p of profiles || []) {
    const member = memberById.get(Number(p.member_id))
    if (!member || member.active === false || ![1,2,3].includes(Number(member.habitual_slot))) continue
    eligible++
    const { data: attendance, error } = await admin.from('attendance')
      .select('status').eq('week_start', nextWeek).eq('member_id', p.member_id).maybeSingle()
    if (error) throw error
    if (attendance?.status && String(attendance.status).trim()) {
      if (String(attendance.status).toLowerCase() === 'pending' || String(attendance.status).toLowerCase() === 'a_confirmer' || String(attendance.status).toLowerCase() === 'à confirmer') {
        pending++
      } else {
        already++
      }
      continue
    }
    // Si aucune ligne n'existe, l'adhérent est également dans l'état À confirmer.
    pending++
    const title = 'Rappel de présence'
    const body = `Merci de confirmer votre présence pour la semaine du ${formatDateFr(nextWeek)}.`
    try {
      const delivered = await deliverOnce(p.id, 'attendance_reminder', `manual:${nextWeek}`, title, body, {
        type: 'attendance_reminder', week: nextWeek, slot: Number(member.habitual_slot), manual: true
      })
      if (delivered > 0) { sent += delivered; sentProfiles++ } else noSubscription++
    } catch (e) {
      console.error(`[push][manual_attendance_reminder] échec profile=${p.id}`, e)
    }
  }
  console.log(`[push][manual_attendance_reminder] BILAN semaine=${nextWeek} éligibles=${eligible} à_confirmer=${pending} autres_réponses=${already} profils_envoyés=${sentProfiles} appareils_envoyés=${sent} sans_abonnement=${noSubscription}`)
  return { ok: true, type: 'attendance_reminder', week: nextWeek, eligible, pending, alreadyAnswered: already, sentProfiles, sent, noSubscription }
}

async function sendManualAttendanceConfirmed(requestedWeek?: string) {
  const week = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? mondayKey(requestedWeek) : isoWeekMonday()
  console.log(`[push][manual_attendance_confirmed] recherche semaine=${week}`)
  const eventDate = await getAttendanceEventDate(week)

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id,member_id,role,display_name')
    .eq('role', 'member')
    .eq('active', true)
    .not('member_id', 'is', null)
  if (profilesError) throw profilesError

  const ids = (profiles || []).map(p => Number(p.member_id)).filter(Number.isFinite)
  const { data: members, error: membersError } = ids.length
    ? await admin.from('members').select('id,name,habitual_slot,active').in('id', ids)
    : { data: [], error: null }
  if (membersError) throw membersError
  const memberById = new Map((members || []).map(m => [Number(m.id), m]))

  let eligible = 0, present = 0, sentProfiles = 0, sent = 0, noSubscription = 0
  for (const p of profiles || []) {
    const member = memberById.get(Number(p.member_id))
    if (!member || member.active === false) continue
    eligible++
    const { data: attendance, error } = await admin.from('attendance')
      .select('status').eq('week_start', week).eq('member_id', p.member_id).maybeSingle()
    if (error) throw error
    if (String(attendance?.status || '').toLowerCase() !== 'present') continue
    present++

    let effectiveSlot = Number(member.habitual_slot)
    const { data: move, error: moveError } = await admin.from('slot_change_requests')
      .select('requested_slot,decided_at')
      .eq('member_id', p.member_id)
      .eq('week_start', week)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (moveError) throw moveError
    if (move?.requested_slot && [1,2,3].includes(Number(move.requested_slot))) effectiveSlot = Number(move.requested_slot)

    const title = 'Présence confirmée'
    const body = `${formatDateFr(eventDate)} · ${slotLabel(effectiveSlot)} · Présent`
    const eventKey = `${week}:${eventDate}:${p.member_id}:present:${effectiveSlot}`
    try {
      const delivered = await deliverOnce(p.id, 'attendance_confirmed', eventKey, title, body, {
        type: 'attendance_confirmed', week, date: eventDate, slot: effectiveSlot, status: 'present'
      })
      if (delivered > 0) { sent += delivered; sentProfiles++ } else noSubscription++
    } catch (e) {
      console.error(`[push][manual_attendance_confirmed] échec profile=${p.id}`, e)
    }
  }
  console.log(`[push][manual_attendance_confirmed] BILAN semaine=${week} date=${eventDate} profils_éligibles=${eligible} présents=${present} profils_envoyés=${sentProfiles} appareils_envoyés=${sent} sans_abonnement=${noSubscription}`)
  return { ok: true, type: 'attendance_confirmed', week, date: eventDate, eligible, present, sentProfiles, sent, noSubscription }
}

async function dispatch() {
  const now = parisNow()
  console.log(`[push][dispatch] démarrage date=${now.date} heure=${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} jour=${weekdayFromDate(now.date)}`)
  const week = isoWeekMonday()
  let sent = 0
  const settings = await loadNotificationSettings()

  // 1) Rappel de présence. Le jour et l'heure sont entièrement pilotés par
  // l'administration. Quel que soit le jour choisi, le rappel concerne la
  // semaine suivante (lundi suivant), jamais la semaine en cours.
  if (withinWindow(now, settings.attendance_reminder)) {
    const nextWeek = addDays(week, 7)
    console.log(`[push][attendance_reminder] fenêtre ACTIVE date=${now.date} ${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} jour=${weekdayFromDate(now.date)} semaine_actuelle=${week} semaine_suivante=${nextWeek}`)

    const { data: cal, error: calError } = await admin
      .from('calendar_weeks')
      .select('week_type')
      .eq('week_start', nextWeek)
      .maybeSingle()
    if(calError) throw calError

    const attendanceWeek = !cal || ['course','free','off','cancelled'].includes(cal.week_type)
    console.log(`[push][attendance_reminder] calendrier semaine=${nextWeek} type=${cal?.week_type||'absent'} éligible=${attendanceWeek}`)

    if(attendanceWeek){
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id,member_id,role,display_name')
        .in('role',['member','admin'])
        .eq('active',true)
        .not('member_id','is',null)
      if(profilesError) throw profilesError

      const memberIds=[...(profiles||[])].map(p=>Number(p.member_id)).filter(Number.isFinite)
      let members:any[]=[]
      if(memberIds.length){
        const { data, error } = await admin
          .from('members')
          .select('id,name,habitual_slot,active')
          .in('id',memberIds)
        if(error) throw error
        members=data||[]
      }
      const memberById=new Map(members.map(m=>[Number(m.id),m]))

      let eligible=0, alreadyAnswered=0, noSlot=0, sentProfiles=0
      for(const p of profiles||[]){
        const member=memberById.get(Number(p.member_id))
        const role=String(p.role||'member')
        // Adhérents : tous les comptes actifs avec un créneau.
        // Administrateurs : uniquement ceux affectés à un créneau.
        // Encadrants : volontairement exclus du rappel de présence.
        if(!member || member.active===false || ![1,2,3].includes(Number(member.habitual_slot))){
          noSlot++
          console.log(`[push][attendance_reminder] IGNORÉ profile=${p.id} role=${role} member_id=${p.member_id} motif=créneau_invalide_ou_membre_inactif`)
          continue
        }
        eligible++

        const { data: attendance, error: attendanceError } = await admin
          .from('attendance')
          .select('status')
          .eq('week_start',nextWeek)
          .eq('member_id',p.member_id)
          .maybeSingle()
        if(attendanceError) throw attendanceError

        // Toute réponse enregistrée (Présent, Absent ou À confirmer) est
        // considérée comme une réponse : aucun rappel n'est envoyé.
        const hasAnswered=attendance?.status!==undefined && attendance?.status!==null && String(attendance.status).trim()!==''
        if(hasAnswered){
          alreadyAnswered++
          console.log(`[push][attendance_reminder] DÉJÀ RÉPONDU profile=${p.id} role=${role} créneau=${member.habitual_slot} statut=${attendance.status}`)
          continue
        }

        const title='Rappel de présence'
        const body=`Merci de confirmer votre présence pour la semaine du ${new Date(`${nextWeek}T12:00:00Z`).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}.`
        try{
          const delivered=await deliverOnce(p.id,'attendance_reminder',nextWeek,title,body,{type:'attendance_reminder',week:nextWeek,slot:Number(member.habitual_slot)})
          if(delivered>0){
            sent+=delivered
            sentProfiles++
            console.log(`[push][attendance_reminder] ENVOYÉ profile=${p.id} role=${role} créneau=${member.habitual_slot} appareils=${delivered}`)
          }else{
            console.log(`[push][attendance_reminder] NON ENVOYÉ profile=${p.id} role=${role} créneau=${member.habitual_slot} motif=aucun_abonnement_push_actif_ou_déjà_traité`)
          }
        }catch(e){
          console.error(`[push][attendance_reminder] ÉCHEC profile=${p.id} role=${role} créneau=${member.habitual_slot}`,e)
        }
      }
      console.log(`[push][attendance_reminder] BILAN profils=${profiles?.length||0} éligibles=${eligible} déjà_répondu=${alreadyAnswered} sans_créneau=${noSlot} profils_envoyés=${sentProfiles}`)
    }
  } else {
    console.log(`[push][attendance_reminder] fenêtre INACTIVE date=${now.date} ${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} jour=${weekdayFromDate(now.date)}`)
  }

  // 2) Nouvelles demandes : notification aux encadrants/admins.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: newMoves } = await admin.from('slot_change_requests').select('id, member_id, week_start, requested_slot').eq('status','pending').gte('created_at', since)
  const { data: newStatuses } = await admin.from('status_change_requests').select('id, member_id, week_start, requested_status').eq('status','pending').gte('created_at', since)
  const { data: staff } = await admin.from('profiles').select('id').in('role',['admin','coach']).eq('active',true)
  if (withinWindow(now, settings.new_slot_request)) for (const req of newMoves || []) {
    const title = 'Nouvelle demande de créneau'
    const body = `Une demande de changement de créneau concerne la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    for (const s of staff || []) {
      const delivered = await deliverOnce(s.id, 'new_slot_request', String(req.id), title, body, { type:'slot_request', requestId:req.id })
      if (delivered > 0) sent += delivered
    }
  }
  if (withinWindow(now, settings.new_status_request)) for (const req of newStatuses || []) {
    const title = 'Nouvelle demande de présence'
    const body = `Une demande de modification de présence est en attente pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    for (const s of staff || []) {
      const delivered = await deliverOnce(s.id, 'new_status_request', String(req.id), title, body, { type:'status_request', requestId:req.id })
      if (delivered > 0) sent += delivered
    }
  }

  // 3) Décisions récentes : notification à l'adhérent concerné.
  const { data: decidedMoves } = await admin.from('slot_change_requests').select('id, member_id, status, week_start').in('status',['approved','rejected','cancelled']).gte('decided_at', since)
  const { data: decidedStatuses } = await admin.from('status_change_requests').select('id, member_id, status, week_start').in('status',['approved','rejected','cancelled']).gte('decided_at', since)
  if (withinWindow(now, settings.slot_request_decision)) for (const req of decidedMoves || []) {
    const { data: profile } = await admin.from('profiles').select('id').eq('member_id', req.member_id).maybeSingle()
    if (!profile) continue
    const title = 'Demande de créneau'
    const label = req.status === 'approved' ? 'validée' : req.status === 'rejected' ? 'refusée' : 'annulée'
    const body = `Votre demande de changement de créneau a été ${label} pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    const delivered = await deliverOnce(profile.id, 'slot_request_decision', String(req.id), title, body, { type:'slot_request_decision', requestId:req.id, status:req.status }); if (delivered > 0) sent += delivered
  }
  if (withinWindow(now, settings.status_request_decision)) for (const req of decidedStatuses || []) {
    const { data: profile } = await admin.from('profiles').select('id').eq('member_id', req.member_id).maybeSingle()
    if (!profile) continue
    const title = 'Demande de présence'
    const label = req.status === 'approved' ? 'validée' : req.status === 'rejected' ? 'refusée' : 'annulée'
    const body = `Votre demande de modification de présence a été ${label} pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    const delivered = await deliverOnce(profile.id, 'status_request_decision', String(req.id), title, body, { type:'status_request_decision', requestId:req.id, status:req.status }); if (delivered > 0) sent += delivered
  }

  return { ok: true, sent, week, now }
}

async function authenticateUser(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (req.method !== 'POST') return json({ error: 'POST requis.' }, 405)
    try {
      const body = await req.json().catch(() => ({}))
      const action = body?.action || 'dispatch'
      if (action === 'dispatch') {
        const cronSecret = req.headers.get('x-cron-secret') || ''
        if (!CRON_SECRET || cronSecret !== CRON_SECRET) return json({ error: 'Non autorisé.' }, 401)
        return json(await dispatch())
      }
      if (action === 'test') {
        const user = await authenticateUser(req)
        if (!user) return json({ error: 'Connexion requise.' }, 401)
        const { data: profile } = await admin.from('profiles').select('id,active').eq('id', user.id).maybeSingle()
        if (!profile?.active) return json({ error: 'Compte inactif.' }, 403)
        const title = 'Don Bosco - Perfectionnement'
        const message = 'Les notifications Push sont correctement configurées sur cet appareil.'
        const sent = await sendToProfile(user.id, title, message, { type:'test' })
        return json({ ok:true, sent })
      }
      if (action === 'manual_attendance_reminder') {
        if (!await authenticateAdmin(req)) return json({ error: 'Réservé à l’administrateur.' }, 403)
        return json(await sendManualAttendanceReminder())
      }
      if (action === 'manual_attendance_confirmed') {
        if (!await authenticateAdmin(req)) return json({ error: 'Réservé à l’administrateur.' }, 403)
        return json(await sendManualAttendanceConfirmed(body?.week))
      }
      return json({ error: 'Action inconnue.' }, 400)
    } catch (e) {
      console.error('[V106 push-notifications]', e)
      return json({ error: String((e as any)?.message || e) }, 500)
    }
  }
}
