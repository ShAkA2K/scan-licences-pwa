import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession()
      .then(({ data }) => { if (mounted) { setSession(data.session); setLoading(false) } })
      .catch(e => { if (mounted) { setErr(String(e?.message||e)); setLoading(false) } })
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess))
    return () => { data?.subscription?.unsubscribe?.(); mounted = false }
  }, [])

  if (loading) return <p className="p-4">Chargement…</p>
  if (err) return <div className="p-4 text-red-600">Erreur auth: {err}</div>
  if (!session) return <LoginForm />

  return (
    <div className="min-h-screen">
      <TopBar email={session.user?.email} />
      <div style={{paddingTop: '3.5rem'}}>{children}</div>
    </div>
  )
}

function TopBar({ email }: { email?: string }) {
  async function logout() { await supabase.auth.signOut() }
  return (
    <div style={{position:'fixed',top:0,left:0,right:0,height:'3.5rem',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 1rem',background:'#fff',borderBottom:'1px solid #eee'}}>
      <div style={{fontSize:12,color:'#555'}}>Connecté{email ? ` : ${email}` : ''}</div>
      <button onClick={logout} style={{fontSize:12,padding:'6px 10px',background:'#eee',borderRadius:8}}>Se déconnecter</button>
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function sendLinkAndCode() {
    setErr(null); setInfo(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true }
    })
    if (error) { setErr(error.message); return }
    setSent(true)
    setInfo("Email envoyé : lien magique OU code OTP selon votre template.")
  }

  async function verifyCode() {
    setErr(null); setInfo(null)
    if (!code || code.trim().length < 4) { setErr('Code invalide'); return }
    const { error } = await supabase.auth.verifyOtp({ email, type:'email', token: code.trim() })
    if (error) { setErr(error.message); return }
    setInfo('Connecté !')
  }

  return (
    <div style={{maxWidth:380, margin:'3rem auto', padding:16, border:'1px solid #eee', borderRadius:12, background:'#fff'}}>
      <h2 style={{fontSize:20,fontWeight:600,marginBottom:8}}>Connexion opérateur</h2>
      <input placeholder='email@club.fr' value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:10,border:'1px solid #ddd',borderRadius:8}} />
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button onClick={sendLinkAndCode} style={{padding:'10px 12px',borderRadius:8,background:'#111',color:'#fff'}}>Recevoir lien / code</button>
      </div>
      <div style={{marginTop:16}}>
        <label style={{fontSize:12,color:'#666'}}>J'ai un code OTP</label>
        <input placeholder='123456' value={code} onChange={e=>setCode(e.target.value)} style={{width:'100%',padding:10,border:'1px solid #ddd',borderRadius:8,letterSpacing:2,textAlign:'center'}} />
        <button onClick={verifyCode} style={{marginTop:8,padding:'10px 12px',borderRadius:8,background:'#2563eb',color:'#fff'}}>Valider le code</button>
      </div>
      {err && <p style={{color:'#c00',fontSize:12,marginTop:10}}>{err}</p>}
      {sent && <p style={{color:'#b45309',fontSize:12,marginTop:10}}>Email envoyé à {email}. Ouvrez le lien DANS CE NAVIGATEUR, ou utilisez le code.</p>}
      {info && <p style={{color:'#047857',fontSize:12,marginTop:10}}>{info}</p>}
      <div style={{marginTop:10,fontSize:11,color:'#666'}}>Origine: <code>{window.location.origin}</code></div>
    </div>
  )
}
