// src/App.tsx
import { useState } from 'react'
import { supabase } from './data/supabase'
// import AddUrlBox from './components/AddUrlBox'
import QrScanBox from './components/QrScanBox'
import SessionsTable from './components/SessionsTable'
import TodayEntries from './components/TodayEntries'
import MembersDialog from './components/MembersDialog'
import { CalendarDays, QrCode, Users } from 'lucide-react'
import AuthBar from './components/AuthBar'

function todayInParisISODate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const CLUB = (import.meta.env.VITE_CLUB_NAME || 'TirClub').trim()

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)

  async function openSessionDuJour() {
  setBusy(true); setMsg(null)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setMsg('Veuillez vous connecter avant d’ouvrir la session.')
      return
    }
    const date = todayInParisISODate()
    const { data, error } = await supabase
      .from('sessions')
      .upsert({ date }, { onConflict: 'date' })
      .select('id')
      .single()
    if (error) throw error
    setSessionId(data!.id)
    setMsg('Session ouverte ✅')
  } catch (e:any) {
    setMsg('Erreur ouverture session: ' + (e?.message || String(e)))
  } finally {
    setBusy(false)
  }
}


  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{CLUB} – Enregistrement</h1>
              <p className="text-xs text-white/80">Scan / export des présences</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMembersOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
              title="Voir la liste des membres"
            >
              <Users className="h-4 w-4" /> Membres
            </button>
			<AuthBar />
            <div className="hidden sm:flex items-center gap-2 text-white/90">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs">
                {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(new Date())}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-8">
        {/* Carte session */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Session du jour</h2>
                <p className="text-sm text-gray-600">Ouvrir la session puis scanner le QR de la licence.</p>
              </div>
              {!sessionId && (
                <button
                  onClick={openSessionDuJour}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-50"
                >
                  <CalendarDays className="h-4 w-4" />
                  {busy ? '...' : 'Ouvrir la session'}
                </button>
              )}
            </div>

            {msg && !sessionId && <div className="text-sm">{msg}</div>}

            {sessionId && (
			  <div className="space-y-6">
				<div className="text-sm text-gray-700">
				  <span className="font-medium">ID session&nbsp;:</span> <span className="font-mono">{sessionId}</span>
				</div>

				{/* 👉 Scanner QR à la place du collage d’URL */}
				<QrScanBox sessionId={sessionId} />

				{/* Liste du jour */}
				<TodayEntries sessionId={sessionId} />
			  </div>
			)}
          </div>
        </section>

        {/* Historique & exports */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="p-4 sm:p-6">
            <SessionsTable />
          </div>
        </section>
      </main>

      {/* Modal Membres */}
      <MembersDialog open={membersOpen} onClose={() => setMembersOpen(false)} />
    </div>
  )
}
