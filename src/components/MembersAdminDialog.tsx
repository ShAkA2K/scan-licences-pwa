import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'
import { X, Save, Upload, Trash2 } from 'lucide-react'
import { uploadMemberPhoto } from '../lib/upload'
import { isAdmin } from '../lib/admin'

type Member = { licence_no: string; last_name: string|null; first_name: string|null; photo_url: string|null }

export default function MembersAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true); setErr(null)
      try {
        setAdmin(await isAdmin())
        const { data, error } = await supabase.from('members').select('licence_no,last_name,first_name,photo_url').order('last_name', { ascending: true }).limit(200)
        if (error) throw error
        setRows((data||[]) as Member[])
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    if (open) load()
  }, [open])

  async function save(m: Member) {
    try {
      const { error } = await supabase.from('members').update({ first_name: m.first_name, last_name: m.last_name, photo_url: m.photo_url }).eq('licence_no', m.licence_no)
      if (error) throw error
      alert('Enregistré')
    } catch (e:any) {
      alert('Erreur: ' + (e?.message || String(e)))
    }
  }

  async function onUpload(licence_no: string, file?: File | null) {
    if (!file) return
    try {
      const url = await uploadMemberPhoto(licence_no, file)
      setRows(prev => prev.map(m => m.licence_no === licence_no ? { ...m, photo_url: url } : m))
    } catch (e:any) {
      alert('Upload: ' + (e?.message || String(e)))
    }
  }

  if (!open) return null
  if (!admin) return (
    <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-white p-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Admin requis</h3>
          <button onClick={onClose}><X className="h-4 w-4"/></button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Seuls les administrateurs peuvent modifier les membres.</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-[80vh] sm:max-w-3xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Administration membres</h3>
          <button className="rounded-lg p-1 hover:bg-gray-100" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto">
          {loading && <div>Chargement…</div>}
          {err && <div className="text-red-600">Erreur: {err}</div>}

          <div className="space-y-3">
            {rows.map(m => (
              <div key={m.licence_no} className="rounded-xl border p-3 flex items-start gap-3">
                <img src={m.photo_url || ''} onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none'}} className="h-12 w-12 rounded-full object-cover ring-1 ring-black/5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">{m.licence_no}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input value={m.last_name ?? ''} onChange={e=>setRows(prev=>prev.map(x=>x.licence_no===m.licence_no?{...x,last_name:e.target.value}:x))} placeholder="Nom" className="rounded-lg border px-2 py-1" />
                    <input value={m.first_name ?? ''} onChange={e=>setRows(prev=>prev.map(x=>x.licence_no===m.licence_no?{...x,first_name:e.target.value}:x))} placeholder="Prénom" className="rounded-lg border px-2 py-1" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                      <Upload className="h-4 w-4" /> Photo…
                      <input type="file" accept="image/*" className="hidden" onChange={e=>onUpload(m.licence_no, e.target.files?.[0])}/>
                    </label>
                    <button onClick={()=>save(m)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
                      <Save className="h-4 w-4" /> Enregistrer
                    </button>
                    <button onClick={()=>{ if(confirm('Supprimer la photo ?')) setRows(prev=>prev.map(x=>x.licence_no===m.licence_no?{...x,photo_url:null}:x)) }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
                      <Trash2 className="h-4 w-4 text-red-600" /> Enlever la photo
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
