import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || ''
const APP_URL = Deno.env.get('APP_URL') || 'https://contactdbbn.github.io/don-bosco-perfectionnement/'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false, autoRefreshToken:false } })
const authClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE, { auth: { persistSession:false, autoRefreshToken:false } })

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
}
function json(data:unknown,status=200){ return new Response(JSON.stringify(data),{status,headers:cors}) }
function clean(v:unknown){ return String(v||'').trim() }

async function getCaller(req:Request){
  const auth = req.headers.get('Authorization') || ''
  if(!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const {data,error}=await authClient.auth.getUser(token)
  if(error || !data.user) return null
  return data.user
}

async function requireAdmin(req:Request){
  const user=await getCaller(req)
  if(!user) throw new Error('Utilisateur non authentifié.')
  const {data,error}=await admin.from('profiles').select('id,role,active').eq('id',user.id).maybeSingle()
  if(error) throw error
  if(!data || data.active===false || data.role!=='admin') throw new Error('Seul l’administrateur peut effectuer cette opération.')
  return user
}

async function listStatus(){
  const {data,error}=await admin.from('profiles').select('member_id,credentials_email_sent_at').not('member_id','is',null)
  if(error) throw error
  return {accounts:(data||[]).map((x:any)=>({member_id:Number(x.member_id),credentials_email_sent_at:x.credentials_email_sent_at||null}))}
}

function html(name:string){
  const safeName=name.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
  const safeUrl=APP_URL.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><h2>Don Bosco - Perfectionnement</h2><p>Bonjour ${safeName},</p><p>Votre compte pour l’application <strong>Don Bosco - Perfectionnement</strong> est prêt.</p><p><strong>Lien vers l’application :</strong><br><a href="${safeUrl}">${safeUrl}</a></p><p><strong>Mot de passe temporaire :</strong><br><span style="font-size:18px"><code>123456</code></span></p><p>Lors de votre première connexion, vous devrez choisir un mot de passe personnel.</p><p>Si vous n’êtes pas à l’origine de cette demande, contactez l’administrateur.</p><p>Cordialement,<br>Don Bosco - Perfectionnement</p></body></html>`
}

async function sendCredentials(memberId:number){
  if(!RESEND_API_KEY || !EMAIL_FROM) throw new Error('Configuration email incomplète : RESEND_API_KEY et EMAIL_FROM sont requis.')
  const {data:member,error:memberError}=await admin.from('members').select('id,name,active').eq('id',memberId).maybeSingle()
  if(memberError) throw memberError
  if(!member || member.active===false) throw new Error('Utilisateur introuvable ou inactif.')
  const {data:profile,error:profileError}=await admin.from('profiles').select('id,member_id,role,active,auth_email').eq('member_id',memberId).maybeSingle()
  if(profileError) throw profileError
  if(!profile || profile.active===false) throw new Error('Compte utilisateur introuvable ou inactif.')
  const email=clean(profile.auth_email).toLowerCase()
  if(!email) throw new Error('Aucune adresse email n’est associée à ce compte.')

  const reset=await admin.auth.admin.updateUserById(String(profile.id),{password:'123456',user_metadata:{must_change_password:true}})
  if(reset.error) throw reset.error
  const mark=await admin.from('profiles').update({must_change_password:true,credentials_email_sent_at:new Date().toISOString()}).eq('id',profile.id)
  if(mark.error) throw mark.error

  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[email],subject:'Don Bosco - Perfectionnement — vos identifiants de connexion',html:html(String(member.name||'adhérent'))})})
  const result=await response.json().catch(()=>({}))
  if(!response.ok){
    // Do not leave a misleading send date when the provider rejected the email.
    await admin.from('profiles').update({credentials_email_sent_at:null}).eq('id',profile.id)
    throw new Error(result?.message || result?.error || `Erreur du service email (${response.status}).`)
  }
  const sentAt=new Date().toISOString()
  await admin.from('profiles').update({credentials_email_sent_at:sentAt}).eq('id',profile.id)
  return {ok:true,member_id:memberId,email,credentials_email_sent_at:sentAt,id:result?.id||null}
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  try{
    await requireAdmin(req)
    const body=await req.json().catch(()=>({}))
    const action=clean(body?.action)
    if(action==='list_status') return json(await listStatus())
    if(action==='send_credentials'){
      const memberId=Number(body?.member_id)
      if(!Number.isFinite(memberId) || memberId<=0) return json({error:'Utilisateur invalide.'},400)
      return json(await sendCredentials(memberId))
    }
    return json({error:'Action inconnue.'},400)
  }catch(e){
    console.error('[send-account-email]',e)
    return json({error:e instanceof Error?e.message:String(e)},400)
  }
})
