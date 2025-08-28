import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../data/supabase'
import { formatParisDateTime } from '../lib/season'
import { RefreshCw, Trash2, User2, ExternalLink } from 'lucide-react'

type EntryRow = { licence_no: string; recorded_at: string; source_url: string | null }
type Member = {
  licence_no: string
  last_name: string | null
  first_name: string | null
  photo_url: string | null
  valid_flag: boolean | null
}

function todayParisISODate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function hhmm(parisDateTime: string) {
  return parisDateTime.split(' ')[1] || parisDateTime
}
const withTimeout = <T,>(p: Promise<T>, ms = 10000) =>
  Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]) as Promise<T>

export default function TodayEntries({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<Array<EntryRow & { member?: Member }>>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const count = rows.length
  const today = useMemo(() => todayParisISODate(), [])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const q1 = supabase
        .from('entries')
        .select('licence_no, recorded_at:timestamp, entry_day, source_url')
        .eq('session_id', sessionId)
        .eq('entry_day', today)
        .order('timestamp', { ascending: true })
      const res1 = await withTimeout(q1.throwOnError(), 10000)
      const E = (res1.data || []) as (EntryRow & { entry_day: string })[]

      const licences = Array.from(new Set(E.map(x => x.licence_no))).filter(Boolean)
      let M = new Map<string, Member>()
      if (licences.length) {
        const q2 = supabase
          .from('members')
          .select('licence_no, last_name, first_name, photo_url, valid_flag')
          .in('licence_no', licences)
        const res2 = await withTimeout(q2.throwOnError(), 10000)
        for (const m of (res2.data || []) as Member[]) M.set(m.licence_no, m)
      }

      setRows(
        E.map(e => ({
          ...e,
          recorded_at: formatParisDateTime(e.recorded_at),
          member: M.get(e.licence_no) || undefined,
        }))
      )
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  async function remove(licence_no: string) {
    if (!confirm(`Supprimer l'enregistrement de ${licence_no} ?`)) return
    setBusyId(licence_no)
    try {
      const q = supabase.from('entries')
        .delete()
        .eq('session_id', sessionId)
        .eq('licence_no', licence_no)
        .eq('entry_day', today)
      await withTimeout(q.throwOnError(), 10000)
      await load()
    } catch (e: any) {
      alert('Suppression impossible: ' + (e?.message || String(e)))
    } finally {
      setBusyId(null)
    }
  }

  function openSource(url?: string | null) {
    if (!url) return
    try { window.open(url, '_blank', 'noopener,noreferrer') }
    catch { location.href = url }
  }

  // -------- UI
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Entrées du jour</h3>
          <p className="text-sm text-gray-500">Présences enregistrées aujourd’hui</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
            <User2 className="h-4 w-4" /> {count}
          </span>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Rafraîchir
          </button>
        </div>
      </div>

      {/* Cartes (mobile) */}
      <div className="grid sm:hidden grid-cols-1 gap-3">
        {loading && <div className="rounded-xl border bg-white px-3 py-4">Chargement…</div>}
        {!loading && err && <div className="rounded-xl border bg-white px-3 py-4 text-red-600">Erreur: {err}</div>}
        {!loading && !err && rows.length === 0 && <div className="rounded-xl border bg-white px-3 py-4">Aucune entrée aujourd’hui.</div>}

        {!loading && !err && rows.map(r => {
          const full = `${r.member?.last_name || ''} ${r.member?.first_name || ''}`.trim()
          const badge = typeof r.member?.valid_flag === 'boolean'
            ? (r.member.valid_flag ? 'bg-emerald-500' : 'bg-red-500')
            : 'bg-gray-300'
          const badgeTitle = typeof r.member?.valid_flag === 'boolean'
            ? (r.member.valid_flag ? 'Licence valide' : 'Licence invalide')
            : 'Validité inconnue'
          return (
            <div key={`${r.licence_no}-${r.recorded_at}`} className="rounded-xl border bg-white p-3">
              <div className="flex items-center gap-3">
                {r.member?.photo_url ? (
                  <img src={r.member.photo_url} alt={full || r.licence_no} className="h-12 w-12 rounded-full object-cover ring-1 ring-black/5" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-200 ring-1 ring-black/5 flex items-center justify-center text-sm">
                    {(r.member?.last_name?.[0] || r.licence_no[0] || '').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${badge}`} title={badgeTitle}/>
                    <div className="font-medium text-gray-900 truncate">{full || '—'}</div>
                  </div>
                  <div className="text-xs text-gray-500">{r.licence_no}</div>
                </div>
                <div className="ml-auto text-sm font-medium">{hhmm(r.recorded_at)}</div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => openSource(r.source_url || undefined)}
                  disabled={!r.source_url}
                  title="Ouvrir la page licence"
                >
                  <ExternalLink className="h-4 w-4" /> Ouvrir
                </button>
                <button
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => remove(r.licence_no)}
                  disabled={busyId === r.licence_no}
                  title="Supprimer l'entrée"
                >
                  <Trash2 className="h-4 w-4 text-red-600" /> Supprimer
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Table (>= sm) */}
      <div className="hidden sm:block overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 text-blue-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tireur</th>
                <th className="px-3 py-2 text-left font-medium">Licence</th>
                <th className="px-3 py-2 text-left font-medium">Validité</th>
                <th className="px-3 py-2 text-left font-medium">Heure</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-3 py-4" colSpan={5}>Chargement…</td></tr>}
              {!loading && err && <tr><td className="px-3 py-4 text-red-600" colSpan={5}>Erreur: {err}</td></tr>}
              {!loading && !err && rows.length === 0 && <tr><td className="px-3 py-4" colSpan={5}>Aucune entrée aujourd’hui.</td></tr>}

              {rows.map(r => {
                const full = `${r.member?.last_name || ''} ${r.member?.first_name || ''}`.trim()
                const canOpen = !!r.source_url
                const badge = typeof r.member?.valid_flag === 'boolean'
                  ? (r.member.valid_flag ? 'bg-emerald-500' : 'bg-red-500')
                  : 'bg-gray-300'
                const label = typeof r.member?.valid_flag === 'boolean'
                  ? (r.member.valid_flag ? 'Valide' : 'Invalide')
                  : 'Inconnue'
                return (
                  <tr key={`${r.licence_no}-${r.recorded_at}`} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {r.member?.photo_url ? (
                          <img src={r.member.photo_url} alt={full || r.licence_no} className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gray-200 ring-1 ring-black/5 flex items-center justify-center text-xs">
                            {(r.member?.last_name?.[0] || r.licence_no[0] || '').toUpperCase()}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${badge}`} title={`Licence ${label}`}/>
                          <div>
                            <div className="font-medium text-gray-900">{full || '—'}</div>
                            <div className="text-xs text-gray-500">{r.licence_no}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.licence_no}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${label==='Valide'?'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-800'}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-3 py-2">{hhmm(r.recorded_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => openSource(r.source_url || undefined)}
                          disabled={!canOpen}
                        >
                          <ExternalLink className="h-4 w-4" /> Ouvrir
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => remove(r.licence_no)}
                          disabled={busyId === r.licence_no}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
