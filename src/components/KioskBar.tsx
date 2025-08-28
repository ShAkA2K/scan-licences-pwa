import { useEffect, useState } from 'react'
import { Maximize, Minimize, Zap, Repeat } from 'lucide-react'
import { useWakeLock } from '../hooks/useWakeLock'

export default function KioskBar({
  continuous, onToggleContinuous,
}: { continuous: boolean; onToggleContinuous: () => void }) {
  const [kiosk, setKiosk] = useState(false)
  const wake = useWakeLock(kiosk)

  useEffect(() => {
    function onChange() { setKiosk(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggleFS() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
      else await document.exitFullscreen()
    } catch {}
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      <button onClick={toggleFS} className="inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-1.5 text-sm hover:bg-white">
        {kiosk ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />} Mode kiosque
      </button>
      <button onClick={onToggleContinuous} className="inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-1.5 text-sm hover:bg-white">
        <Repeat className="h-4 w-4" /> Scan continu: <b className="ml-1">{continuous ? 'ON' : 'OFF'}</b>
      </button>
      <span className="inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-1.5 text-sm">
        <Zap className="h-4 w-4 text-amber-600" /> WakeLock: {kiosk ? (wake ? 'actif' : 'n/a') : 'off'}
      </span>
    </div>
  )
}
