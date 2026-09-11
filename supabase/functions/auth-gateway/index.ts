import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })
const authClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: corsHeaders() }) }
function normalizeEmail(v: unknown) { return String(v || '').trim().toLowerCase() }
function maskEmail(email: string) {
  const e = normalizeEmail(email)
  if (!e) return ''
  if (e.length <= 6) return e.slice(0, 3) + '•••'
  return e.slice(0, 3) + '••••••' + e.slice(-3)
}
function roleLabel(role: string) { return role === 'admin' ? 'Administrateur' : role === 'coach' ? 'Encadrant' : 'Adhérent' }

async function directory() {
  const [profilesRes, membersRes] = await Promise.all([
    admin.from('profiles').select('id,member_id,role,active,display_name,auth_email,must_change_password'),
    admin.from('members').select('id,name,habitual_slot,active'),
  ])
  if (profilesRes.error) throw profilesRes.error
  if (membersRes.error) throw membersRes.error
  const members = new Map((membersRes.data || []).map(m => [Number(m.id), m]))
  const items: any[] = (profilesRes.data || []).filter(p => p.active !== false).map((p: any) => {
    const m = p.member_id == null ? null : members.get(Number(p.member_id))
    if (p.member_id != null && (!m || m.active === false)) return null
    const role = ['member', 'coach', 'admin'].includes(String(p.role)) ? String(p.role) : 'member'
    const name = String(m?.name || p.display_name || roleLabel(role)).trim()
    return {
      profile_id: p.id,
      member_id: p.member_id == null ? null : Number(p.member_id),
      name,
      slot: m?.habitual_slot == null ? null : Number(m.habitual_slot),
      role,
      first_login: !!p.must_change_password,
      masked_email: maskEmail(String(p.auth_email || '')),
    }
  }).filter(Boolean)
  items.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  return items
}

async function login(body: any) {
  const profileId = String(body?.profile_id || '').trim()
  const mode = String(body?.mode || 'member')
  const password = String(body?.password || '')
  const email = normalizeEmail(body?.email)
  if (!profileId || !password) return json({ ok: false, error: 'Compte ou mot de passe manquant.' }, 400)
  if (!['member', 'coach', 'admin'].includes(mode)) return json({ ok: false, error: 'Mode de connexion invalide.' }, 400)

  const { data: profile, error } = await admin.from('profiles').select('id,member_id,role,active,auth_email,must_change_password').eq('id', profileId).maybeSingle()
  if (error) throw error
  if (!profile || profile.active === false || profile.role !== mode) return json({ ok: false, error: 'Compte indisponible.' }, 403)

  if (mode === 'member') {
    if (profile.member_id == null) return json({ ok: false, error: 'Compte adhérent non configuré.' }, 403)
    const member = await admin.from('members').select('id,active').eq('id', profile.member_id).maybeSingle()
    if (member.error) throw member.error
    if (!member.data || member.data.active === false) return json({ ok: false, error: 'Adhérent inactif.' }, 403)
  }

  const configuredEmail = normalizeEmail(profile.auth_email)
  if (!configuredEmail) return json({ ok: false, error: 'Adresse email du compte non configurée.' }, 403)
  if (body?.first_connection === true && email !== configuredEmail) {
    return json({ ok: false, error: 'L’adresse email ne correspond pas à celle paramétrée pour ce compte.' }, 401)
  }

  // Les comptes sont créés par l'administrateur dans Supabase Auth : ils ne
  // doivent pas dépendre d'un email de confirmation envoyé par Supabase.
  // On s'assure côté serveur que l'utilisateur Auth est confirmé avant le login.
  const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersRes.error) throw usersRes.error
  const authUser = (usersRes.data?.users || []).find((u: any) => normalizeEmail(u.email) === configuredEmail)
  if (!authUser) return json({ ok: false, error: 'Compte Auth introuvable pour cette adresse email.' }, 403)
  if (!authUser.email_confirmed_at) {
    const confirmed = await admin.auth.admin.updateUserById(authUser.id, { email_confirm: true })
    if (confirmed.error) throw confirmed.error
  }

  const auth = await authClient.auth.signInWithPassword({ email: configuredEmail, password })
  if (auth.error || !auth.data?.session) return json({ ok: false, error: auth.error?.message || 'Mot de passe incorrect.' }, 401)
  return json({ ok: true, session: auth.data.session, user: auth.data.user, first_login: !!profile.must_change_password })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée.' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.action === 'directory') return json({ ok: true, items: await directory() })
    if (body?.action === 'login') return await login(body)
    return json({ ok: false, error: 'Action inconnue.' }, 400)
  } catch (e) {
    console.error('[auth-gateway]', e)
    return json({ ok: false, error: e?.message || 'Erreur serveur.' }, 500)
  }
})
