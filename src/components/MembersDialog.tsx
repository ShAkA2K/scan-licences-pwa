import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../data/supabase'
import { X, Search } from 'lucide-react'

type Member = {
  licence_no: string
  last_name: string | null
  first_name: string | null
  photo_url: string | null
}

const PAGE = 50
const withTimeout = <T,>(p: Promise<T>, ms = 10000) =>
  Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]) as Promise<T>

export default function MembersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const photoFromBucket = (lic: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(`members/${lic}.jpg`)
    return data.publicUrl
  }

  const displayRows = useMemo(() => {
    return rows
      .filter(m => (m.last_name && m.last_name.trim()) || (m.first_name && m.first_name.trim()))
      .map(m => ({ ...m, _photo: m.photo_url || photoFromBucket(m.licence_no) }))
  }, [rows])

  async function load(reset = false) {
    if (!open) return
    setLoading(true); setError(null)
    try {
      const from = reset ? 0 : page * PAGE
      const to = from + PAGE - 1

      let qy = supabase
        .from('members')
        .select('licence_no, last_name, first_name, photo_url', { count: 'exact' })
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .range(from, to)

      if (q.trim()) {
        const s = q.trim()
        qy = qy.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%,licence_no.ilike.%${s}%`)
      }

      const res = await withTimeout(qy.throwOnError(), 10000)
      const newRows = (res.data || []) as Member[]
      const count = res.count ?? 0

      if (reset) {
        setRows(newRows); setPage(1); setHasMore(count > newRows.length)
      } else {
        setRows(prev => [...prev, ...newRows]); setPage(prev => prev + 1)
        setHasMore(count > (rows.length + newRows.length))
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) { setRows([]); setPage(0); setHasMore(true); load(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setRows([]); setPage(0); setHasMore(true); load(true)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-auto sm:max-w-3xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Membres</h3>
          <button className="rounded-lg p-1 hover:bg-gray-100" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto">
          <form onSubmit={onSearch} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
              <Search className="h-4 w-4 text-blue-600 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (nom, prénom, licence)"
                className="w-full outline-none text-sm"
              />
            </div>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Chercher</button>
          </form>

          {/* Cartes mobile */}
          <div className="grid sm:hidden grid-cols-1 gap-3">
            {error && <div className="rounded-xl border bg-white px-3 py-4 text-red-600">Erreur: {error}</div>}
            {!error && displayRows.length === 0 && !loading && (
              <div className="rounded-xl border bg-white px-3 py-4">Aucun membre.</div>
            )}
            {displayRows.map(m => {
              const full = `${m.last_name ?? ''} ${m.first_name ?? ''}`.trim()
              return (
                <div key={m.licence_no} className="rounded-xl border bg-white p-3 flex items-center gap-3">
                  <img
                    src={(m as any)._photo}
                    alt={full || m.licence_no}
                    className="h-12 w-12 rounded-full object-cover ring-1 ring-black/5"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{full || '—'}</div>
                    <div className="text-xs text-gray-500">{m.licence_no}</div>
                  </div>
                </div>
              )
            })}
            {loading && <div className="rounded-xl border bg-white px-3 py-4">Chargement…</div>}
          </div>

          {/* Table desktop */}
          <div className="hidden sm:block overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-blue-900">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Photo</th>
                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                  <th className="px-3 py-2 text-left font-medium">Prénom</th>
                  <th className="px-3 py-2 text-left font-medium">Licence</th>
                </tr>
              </thead>
              <tbody>
                {error && <tr><td className="px-3 py-4 text-red-600" colSpan={4}>Erreur: {error}</td></tr>}
                {!error && displayRows.length === 0 && !loading && (
                  <tr><td className="px-3 py-4" colSpan={4}>Aucun membre.</td></tr>
                )}
                {displayRows.map(m => {
                  const full = `${m.last_name ?? ''} ${m.first_name ?? ''}`.trim()
                  return (
                    <tr key={m.licence_no} className="border-t">
                      <td className="px-3 py-2">
                        <img
                          src={(m as any)._photo}
                          alt={full || m.licence_no}
                          className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      </td>
                      <td className="px-3 py-2">{m.last_name || '—'}</td>
                      <td className="px-3 py-2">{m.first_name || '—'}</td>
                      <td className="px-3 py-2 font-mono">{m.licence_no}</td>
                    </tr>
                  )
                })}
                {loading && <tr><td className="px-3 py-3" colSpan={4}>Chargement…</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => load(false)}
              disabled={!hasMore || loading}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? '...' : hasMore ? 'Charger plus' : 'Fin de liste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
