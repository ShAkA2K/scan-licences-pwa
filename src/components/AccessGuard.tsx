import { useEffect, useState } from 'react'
import { isAllowed } from '../lib/admin'
import { supabase } from '../data/supabase'

export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let mounted = true
    async function run() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { setReady(true); setOk(false); return }
      const allow = await isAllowed()
      if (!mounted) return
      setOk(allow); setReady(true)
    }
    run()
    const { data: sub } = supabase.auth.onAuthStateChange(() => run())
    return () => { sub.subscription.unsubscribe(); mounted = false }
  }, [])

  if (!ready) return <div className="min-h-screen grid place-items-center text-white">Chargement…</div>
  if (!ok) return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="max-w-md text-center space-y-3">
        <h2 className="text-2xl font-semibold text-white">Accès restreint</h2>
        <p className="text-white/80">Ton email n’est pas autorisé. Contacte l’administrateur du club.</p>
      </div>
    </div>
  )
  return <>{children}</>
}
