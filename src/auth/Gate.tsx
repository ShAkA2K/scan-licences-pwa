// src/auth/Gate.tsx
import React from 'react'
import { supabase } from '../data/supabase'

type Props = { children: React.ReactNode }

export function Gate({ children }: Props) {
  const [state, setState] = React.useState<'loading'|'allowed'|'denied'>('loading')
  const [detail, setDetail] = React.useState<string>('')

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email?.toLowerCase()
        if (!email) {
          setState('denied'); setDetail('Non connecté.')
          return
        }
        const { data, error } = await supabase
          .from('allowed_users')
          .select('role')
          .eq('email', email)
          .maybeSingle()

        if (error) {
          setState('denied')
          setDetail(`Erreur d'accès à allowed_users: ${error.message}${(error as any).code ? ' (code ' + (error as any).code + ')' : ''}`)
          return
        }
        if (!data) {
          setState('denied')
          setDetail('Ton email n’est pas dans la liste des membres autorisés.')
          return
        }
        setState('allowed')
      } catch (e: any) {
        setState('denied'); setDetail(e?.message || String(e))
      }
    })()
    return () => { alive = false }
  }, [])

  if (state === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-b from-blue-600 to-blue-700 p-4">
        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <div className="font-semibold">Vérification de l’accès…</div>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-b from-blue-600 to-blue-700 p-4">
        <div className="max-w-lg w-full rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <h2 className="text-lg font-semibold text-red-700">Accès restreint</h2>
          <p className="mt-2 text-sm text-gray-700">
            Ton email n’est pas autorisé. Contacte l’administrateur du club.
          </p>
          {detail && (
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-red-50 p-2 text-sm text-red-800 whitespace-pre-wrap">
              {detail}
            </pre>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
