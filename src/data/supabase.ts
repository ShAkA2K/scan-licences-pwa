import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anon) {
  console.error('[supabase] Variables manquantes: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anon)

// Debug pratique en DEV: expose le client dans la console
if (import.meta.env.DEV) {
  // @ts-ignore
  window.supabase = supabase
}
