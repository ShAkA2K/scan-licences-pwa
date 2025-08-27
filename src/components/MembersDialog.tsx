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

export default function MembersDialog({
  open,
  onClose,
}: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  // Fallback builder for photo from public bucket
  const photoFromBucket = (lic: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(`members/${lic}.jpg`)
    return data.publicUrl
  }

  // Rows affichés = filtrés (pas de membres “vides”) + photo fallback
  const displayRows = useMemo(() => {
    return rows
      .filter(m => (m.last_name && m.last_name.trim()) || (m.first_name && m.first_name.trim()))
      .map(m => ({
        ...m,
        _photo: m.photo_url || photoFromBucket(m.licence_no),
      }))
  }, [rows])

  async function load(reset = false) {
    if (!open) return
    setLoading(true); setError(null)
    try {
      const from = reset ? 0 : page * PAGE
      const to = from + PAGE - 1

      let query = supabase
        .from('members')
        .select('licence_no, last_name, first_name, photo_url', { count: 'exact' })
        .order('last_name', { ascending: true, nullsFirst: false })
        .order('first_name', { ascending: true, nullsFirst: false })
        .range(from, to)

      if (q.trim()) {
        const s = q.trim()
        query = query.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%,licence_no.ilike.%${s}%`)
      }

      const { data, error, count } = await query
      if (error) throw error

      const newRows = (data || []) as Member[]
      if (reset) {
        setRows(newRows)
        setPage(1)
        setHasMore((count ?? 0) > newRows.length)
      } else {
        setRows(prev => [...prev, ...newRows])
        setPage(prev => prev + 1)
        setHasMore((count ?? 0) > (rows.length + newRows.length))
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setRows([]); setPage(0); setHasMore(true)
      load(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setRows([]); setPage(0); setHasMore(true)
    load(true)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Membres</h3>
          <button className="rounded-lg p-1 hover:bg-gray-100" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
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

          <div className="overflow-hidden rounded-xl border">
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
