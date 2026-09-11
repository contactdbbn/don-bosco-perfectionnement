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
  const d = new Date(`${dateString}T12:00:00+02:00`)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
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
        console.warn(`[push] envoi refusé status=${response.status} subscription=${sub.id}`)
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

async function logOnce(profileId: string, type: string, eventKey: string, title: string, body: string) {
  const { data: existing, error: existingError } = await admin
    .from('push_notification_log')
    .select('id')
    .eq('profile_id', profileId)
    .eq('notification_type', type)
    .eq('event_key', eventKey)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return false
  return true
}

async function markLogged(profileId: string, type: string, eventKey: string, title: string, body: string) {
  const { data, error } = await admin
    .from('push_notification_log')
    .insert({ profile_id: profileId, notification_type: type, event_key: eventKey, title, body })
    .select('id')
    .maybeSingle()
  if (error) {
    if (String(error.code) === '23505') return false
    throw error
  }
  return !!data
}

async function dispatch() {
  const now = parisNow()
  const week = isoWeekMonday()
  let sent = 0

  // 1) Rappel de présence le dimanche à 18h pour la semaine suivante.
  const tomorrow = new Date(`${now.date}T12:00:00+02:00`)
  const tomorrowDay = tomorrow.getDay()
  if (tomorrowDay === 0 && now.hour === 18 && now.minute < 5) {
    const next = new Date(tomorrow); next.setDate(next.getDate() + 1)
    const nextWeek = mondayKey(next.toISOString().slice(0, 10))
    const { data: cal } = await admin.from('calendar_weeks').select('week_type').eq('week_start', nextWeek).maybeSingle()
    const attendanceWeek = !cal || ['course','free','off','cancelled'].includes(cal.week_type)
    if (attendanceWeek) {
      const { data: profiles } = await admin.from('profiles').select('id,member_id').eq('role','member').eq('active',true).not('member_id','is',null)
      for (const p of profiles || []) {
        const { data: attendance } = await admin.from('attendance').select('status').eq('week_start', nextWeek).eq('member_id', p.member_id).maybeSingle()
        if (attendance?.status) continue
        const title = 'Rappel de présence'
        const body = `Merci de confirmer votre présence pour la semaine du ${new Date(`${nextWeek}T12:00:00`).toLocaleDateString('fr-FR')}.`
        if (await logOnce(p.id, 'attendance_reminder', nextWeek, title, body)) { const delivered = await sendToProfile(p.id, title, body, { type: 'attendance_reminder', week: nextWeek }); if (delivered > 0) { await markLogged(p.id, 'attendance_reminder', nextWeek, title, body); sent += delivered } }
      }
    }
  }

  // 2) Nouvelles demandes : notification aux encadrants/admins.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: newMoves } = await admin.from('slot_change_requests').select('id, member_id, week_start, requested_slot').eq('status','pending').gte('created_at', since)
  const { data: newStatuses } = await admin.from('status_change_requests').select('id, member_id, week_start, requested_status').eq('status','pending').gte('created_at', since)
  const { data: staff } = await admin.from('profiles').select('id').in('role',['admin','coach']).eq('active',true)
  for (const req of newMoves || []) {
    const title = 'Nouvelle demande de créneau'
    const body = `Une demande de changement de créneau concerne la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    for (const s of staff || []) if (await logOnce(s.id, 'new_slot_request', String(req.id), title, body)) { const delivered = await sendToProfile(s.id, title, body, { type:'slot_request', requestId:req.id }); if (delivered > 0) { await markLogged(s.id, 'new_slot_request', String(req.id), title, body); sent += delivered } }
  }
  for (const req of newStatuses || []) {
    const title = 'Nouvelle demande de présence'
    const body = `Une demande de modification de présence est en attente pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    for (const s of staff || []) if (await logOnce(s.id, 'new_status_request', String(req.id), title, body)) { const delivered = await sendToProfile(s.id, title, body, { type:'status_request', requestId:req.id }); if (delivered > 0) { await markLogged(s.id, 'new_status_request', String(req.id), title, body); sent += delivered } }
  }

  // 3) Décisions récentes : notification à l'adhérent concerné.
  const { data: decidedMoves } = await admin.from('slot_change_requests').select('id, member_id, status, week_start').in('status',['approved','rejected','cancelled']).gte('decided_at', since)
  const { data: decidedStatuses } = await admin.from('status_change_requests').select('id, member_id, status, week_start').in('status',['approved','rejected','cancelled']).gte('decided_at', since)
  for (const req of decidedMoves || []) {
    const { data: profile } = await admin.from('profiles').select('id').eq('member_id', req.member_id).maybeSingle()
    if (!profile) continue
    const title = 'Demande de créneau'
    const label = req.status === 'approved' ? 'validée' : req.status === 'rejected' ? 'refusée' : 'annulée'
    const body = `Votre demande de changement de créneau a été ${label} pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    if (await logOnce(profile.id, 'slot_request_decision', String(req.id), title, body)) { const delivered = await sendToProfile(profile.id, title, body, { type:'slot_request_decision', requestId:req.id, status:req.status }); if (delivered > 0) { await markLogged(profile.id, 'slot_request_decision', String(req.id), title, body); sent += delivered } }
  }
  for (const req of decidedStatuses || []) {
    const { data: profile } = await admin.from('profiles').select('id').eq('member_id', req.member_id).maybeSingle()
    if (!profile) continue
    const title = 'Demande de présence'
    const label = req.status === 'approved' ? 'validée' : req.status === 'rejected' ? 'refusée' : 'annulée'
    const body = `Votre demande de modification de présence a été ${label} pour la semaine du ${new Date(`${req.week_start}T12:00:00`).toLocaleDateString('fr-FR')}.`
    if (await logOnce(profile.id, 'status_request_decision', String(req.id), title, body)) { const delivered = await sendToProfile(profile.id, title, body, { type:'status_request_decision', requestId:req.id, status:req.status }); if (delivered > 0) { await markLogged(profile.id, 'status_request_decision', String(req.id), title, body); sent += delivered } }
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
      return json({ error: 'Action inconnue.' }, 400)
    } catch (e) {
      console.error('[V82 push-notifications]', e)
      return json({ error: String((e as any)?.message || e) }, 500)
    }
  }
}
