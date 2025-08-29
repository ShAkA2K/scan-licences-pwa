// src/App.tsx (wrapper minimal conseillé)
import React from 'react'
import RealApp from './App.real'
import { Gate } from './auth/Gate'

export default function App() {
  return (
    <Gate>
      <RealApp />
    </Gate>
  )
}
