import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  // On logge clairement en prod
  console.error(
    '[Supabase] Variables manquantes. ' +
    'Définis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les env Vercel.'
  )
}

// On crée quand même un client “inerte” pour éviter de casser le rendu.
// Les appels échoueront avec une 401/404 bien visible dans la console, mais l’UI s’affiche.
export const supabase = createClient(url || 'https://invalid.supabase.co', anon || 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
