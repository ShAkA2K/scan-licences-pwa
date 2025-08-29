// src/hooks/useWakeLock.ts
import { useEffect, useRef } from 'react'

export function useWakeLock(enabled: boolean) {
  const ref = useRef<any>(null)
  useEffect(() => {
    let cancelled = false
    async function lock() {
      try {
        // @ts-ignore - types pas toujours présents
        const wl = await (navigator as any)?.wakeLock?.request?.('screen')
        if (!wl) return
        ref.current = wl
        wl.addEventListener?.('release', () => {
          if (!cancelled && enabled) {
            lock().catch(() => {})
          }
        })
      } catch {
        // pas supporté / refusé
      }
    }
    if (enabled && document.visibilityState === 'visible') lock()
    const onVis = () => {
      if (enabled && document.visibilityState === 'visible') lock().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      try { ref.current?.release?.() } catch {}
      ref.current = null
    }
  }, [enabled])
}
