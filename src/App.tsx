// src/App.tsx
import React from 'react'
import { supabase } from './data/supabase'
import { Gate } from './auth/Gate'
import RealApp from './App.real'   // ← ta vraie app

export default function App() {
  // … (le reste de ton wrapper peut rester, y compris le fallback “ouvrir la session du jour” si tu l’utilises)
  // Ici, version simple : on enveloppe juste RealApp avec Gate

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff,#dbeafe)' }}>
      <Gate>
        <RealApp />
      </Gate>
    </div>
  )
}
