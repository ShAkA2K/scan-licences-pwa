import { useState } from 'react'
import { addScan } from '../lib/add-scan'
import { Loader2, Plus, QrCode } from 'lucide-react'

export default function AddUrlBox({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function onAdd() {
    if (!url) return
    setBusy(true); setMsg(null)
    try {
      const { duplicated } = await addScan(url, sessionId)
      setMsg(duplicated ? 'Déjà enregistré aujourd’hui ✅' : 'Enregistré ✅')
      setUrl('')
    } catch (e: any) {
      setMsg('Erreur: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">URL du QR (itac.pro)</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
            <QrCode className="h-4 w-4 text-blue-600 shrink-0" />
            <input
              type="url"
              inputMode="url"
              className="w-full outline-none text-sm"
              placeholder="https://itac.pro/F.aspx?N=...&S=...&C=..."
              value={url}
              onChange={e=>setUrl(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={onAdd}
          disabled={busy || !url}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>
      {msg && <div className="text-sm">{msg}</div>}
    </div>
  )
}
