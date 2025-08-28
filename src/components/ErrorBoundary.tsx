import React from 'react'

type Props = { children: React.ReactNode }
type State = { error: any }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: any) {
    return { error }
  }
  componentDidCatch(error: any, info: any) {
    console.error('Fatal render error:', error, info)
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error)
      return (
        <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-700 grid place-items-center p-4">
          <div className="max-w-lg w-full rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
            <h2 className="text-lg font-semibold text-red-700">Une erreur bloque l’affichage</h2>
            <p className="mt-2 text-sm text-gray-700">
              Détail (console DevTools pour le stack trace) :
            </p>
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-red-50 p-2 text-sm text-red-800 whitespace-pre-wrap">
              {msg}
            </pre>
            <div className="mt-4 text-sm text-gray-600">
              Essaie de <b>rafraîchir</b> ou d’ouvrir <code>/?clear-sw</code> pour vider le cache PWA.
            </div>
          </div>
        </div>
      )
    }
    return this.props.children as any
  }
}
