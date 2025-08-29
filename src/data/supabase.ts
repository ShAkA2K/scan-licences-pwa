import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  console.error(
    '[Supabase] Variables manquantes. ' +
    'Définis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans Vercel.'
  )
}

export const supabase = createClient(url || 'https://invalid.supabase.co', anon || 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
