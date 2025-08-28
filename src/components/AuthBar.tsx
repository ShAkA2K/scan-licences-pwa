import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'

export default function AuthBar() {
  const [email, setEmail] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const { data } = await supabase.auth.getSession()
    setUserEmail(data.session?.user?.email ?? null)
  }

  useEffect(() => {
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh())
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn() {
    setMsg(null); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      })
      if (error) throw error
      setMsg('Email envoyé. Clique le lien de connexion.')
      setEmail('')
    } catch (e:any) {
      setMsg('Erreur connexion: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    setLoading(true)
    await supabase.auth.signOut()
    setLoading(false)
  }

  return (
    <div className="rounded-xl bg-white/10 px-3 py-2 text-sm">
      {userEmail ? (
        <div className="flex items-center gap-2">
          <span className="text-white/90">Connecté: <b>{userEmail}</b></span>
          <button onClick={signOut} className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20">Se déconnecter</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="votre@email"
            className="w-48 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white placeholder-white/60 outline-none"
          />
          <button
            onClick={signIn}
            disabled={loading || !email}
            className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? '...' : 'Se connecter'}
          </button>
          {msg && <span className="ml-2 text-white/90">{msg}</span>}
        </div>
      )}
    </div>
  )
}
