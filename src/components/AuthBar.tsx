import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'

export default function AuthBar() {
  const [email, setEmail] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh() {
    try {
      const { data } = await supabase.auth.getSession()
      setUserEmail(data.session?.user?.email ?? null)
    } catch { setUserEmail(null) }
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
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setMsg('Email envoyé. Clique le lien pour te connecter.')
      setEmail('')
    } catch (e:any) {
      setMsg('Erreur connexion: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  // Nettoyage immédiat côté client
  function hardClientLogout() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k) continue
        if (k.startsWith('sb-') && k.includes('-auth-token')) localStorage.removeItem(k)
      }
      sessionStorage.clear()
      // cookie de supabase-js (au cas où)
      document.cookie.split(';').forEach(c => {
        const name = c.trim().split('=')[0]
        if (name.startsWith('sb-') && name.includes('-auth-token')) {
          document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
        }
      })
    } catch {}
  }

  function signOutInstant() {
    if (loading) return
    setLoading(true)
    // on n'attend PAS le réseau : purge locale + reload immédiat
    try { hardClientLogout() } catch {}
    try { supabase.auth.signOut().catch(() => {}) } catch {}
    // petit délai pour laisser le DOM refléter l'état, puis reload
    setTimeout(() => window.location.replace('/'), 50)
  }

  return (
    <div className="rounded-xl bg-white/10 px-3 py-2 text-sm">
      {userEmail ? (
        <div className="flex items-center gap-2">
          <span className="text-white/90">Connecté: <b>{userEmail}</b></span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); signOutInstant() }}
            className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20"
          >
            {loading ? '…' : 'Se déconnecter'}
          </button>
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
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void signIn() }}
            disabled={loading || !email}
            className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? '…' : 'Se connecter'}
          </button>
          {msg && <span className="ml-2 text-white/90">{msg}</span>}
        </div>
      )}
    </div>
  )
}
