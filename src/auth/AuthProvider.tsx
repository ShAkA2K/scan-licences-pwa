import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'

type Ctx = { ready: boolean; session: Session | null }
const AuthCtx = createContext<Ctx>({ ready: false, session: null })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthCtx.Provider value={{ ready, session }}>{children}</AuthCtx.Provider>
}

export function useAuth() { return useContext(AuthCtx) }
