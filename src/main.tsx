// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'

// IMPORTANT : pas besoin d'importer ./data/supabase ici
// le client est importé là où on en a besoin (AuthProvider, AuthBar, etc.)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
