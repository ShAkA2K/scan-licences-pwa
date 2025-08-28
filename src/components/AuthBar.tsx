import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'
import { useAuth } from '../auth/AuthProvider'

export default function AuthBar() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session?.user?.email) {
      setMsg(null)
      setEmail(session.user.email)
      setCode('')
    }
  }, [session])

  async function signInSend() {
    setMsg(null); setLoading(true)
    try {
      // envoie mail avec lien + code OTP
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setMsg('Code envoyé par email. Saisis-le ci-dessous.')
    } catch (e: any) {
      setMsg('Erreur: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  async function signInVerify() {
    setMsg(null); setLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'email', // vérifie le code OTP sans redirection
      })
      if (error) throw error
      setMsg('Connecté ✅')
      setCode('')
    } catch (e: any) {
      setMsg('Code invalide ou expiré.')
    } finally {
      setLoading(false)
    }
  }

  function hardClientLogout() {
    try {
      // purge les clés locales supabase
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k) continue
        if (k.includes('tirclub-auth') || (k.startsWith('sb-') && k.includes('-auth-token'))) {
          localStorage.removeItem(k)
        }
      }
      sessionStorage.clear()
      document.cookie.split(';').forEach(c => {
        const n = c.trim().split('=')[0]
        if (n.startsWith('sb-') && n.includes('-auth-token')) {
          document.cookie = `${n}=; Max-Age=0; path=/; SameSite=Lax`
        }
      })
    } catch {}
  }

  function signOutInstant() {
    if (loading) return
    setLoading(true)
    try { hardClientLogout() } catch {}
    try { supabase.auth.signOut().catch(() => {}) } catch {}
    setTimeout(() => window.location.replace('/'), 50)
  }

  const userEmail = session?.user?.email ?? null

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="votre@email"
            className="w-56 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white placeholder-white/60 outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void signInSend() }}
              disabled={loading || !email}
              className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? '…' : 'Recevoir le code'}
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={e=>setCode(e.target.value)}
              placeholder="Code"
              className="w-24 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white placeholder-white/60 outline-none"
            />
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void signInVerify() }}
              disabled={loading || !email || code.trim().length === 0}
              className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? '…' : 'Valider'}
            </button>
          </div>
          {msg && <span className="text-white/90">{msg}</span>}
        </div>
      )}
    </div>
  )
}
