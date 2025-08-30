// src/data/outbox.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type OutboxItem = {
  id: string
  session_id: string
  url: string
  ts: number
  tries: number
}

const KEY = 'outbox_v1'
const EVT = 'outbox:change'

function read(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(EVT))
}
export function outboxCount(): number {
  return read().length
}
export function onOutboxChange(cb: () => void) {
  const h = () => cb()
  window.addEventListener(EVT, h)
  return () => window.removeEventListener(EVT, h)
}
export function addToOutbox(session_id: string, url: string) {
  const items = read()
  items.push({ id: crypto.randomUUID(), session_id, url, ts: Date.now(), tries: 0 })
  write(items)
}
function removeById(id: string) {
  const items = read().filter(x => x.id !== id)
  write(items)
}

export async function flushOutbox(supabase: SupabaseClient) {
  if (!navigator.onLine) return
  let items = read()
  for (const item of items) {
    try {
      // 1) Appel edge function
      const res = await supabase.functions.invoke('itac_profile_store', { body: { url: item.url } })
      if (res.error) throw res.error
      const payload: any = res.data
      if (!payload?.ok) throw new Error(payload?.error || 'Edge function non-OK')

      // 2) Insert entry
      const ins = await supabase.from('entries').insert({
        session_id: item.session_id,
        licence_no: payload.licence_no,
        source_url: payload.source_url ?? item.url
      }).select('id').single()

      if (ins.error) {
        // Doublon => on supprime de l’outbox
        if ((ins.error as any).code === '23505') {
          removeById(item.id)
          continue
        }
        throw ins.error
      }

      // Succès => on retire
      removeById(item.id)
    } catch (_e) {
      // Echec: on garde, mais on borne le nombre d’essais
      item.tries = (item.tries || 0) + 1
      if (item.tries > 25) {
        // On abandonne après trop d’essais
        removeById(item.id)
      } else {
        // Réécrit l’état avec l’item mis à jour
        const rest = read().filter(x => x.id !== item.id)
        write([...rest, item])
      }
    }
  }
}

// bootstrap: flush quand on revient en ligne
let _timer: number | null = null
export function startOutboxAutoFlush(supabase: SupabaseClient) {
  const onOnline = () => { flushOutbox(supabase).catch(()=>{}) }
  window.addEventListener('online', onOnline)
  if (_timer) window.clearInterval(_timer)
  _timer = window.setInterval(() => { if (navigator.onLine) flushOutbox(supabase).catch(()=>{}) }, 15000)
  // déclenche une première fois
  setTimeout(() => { if (navigator.onLine) flushOutbox(supabase).catch(()=>{}) }, 1000)
  return () => {
    window.removeEventListener('online', onOnline)
    if (_timer) window.clearInterval(_timer)
    _timer = null
  }
}
