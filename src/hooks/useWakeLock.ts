import { useEffect, useRef, useState } from 'react'

export function useWakeLock(active: boolean) {
  const [supported, setSupported] = useState(false)
  const lockRef = useRef<any>(null)

  useEffect(() => { setSupported('wakeLock' in navigator) }, [])
  useEffect(() => {
    let mounted = true
    async function request() {
      try {
        // @ts-ignore
        const lk = await (navigator as any).wakeLock.request('screen')
        if (!mounted) { try { lk.release() } catch {} ; return }
        lockRef.current = lk
        lk.addEventListener?.('release', () => { lockRef.current = null })
      } catch {}
    }
    if (active && supported) request()
    return () => { mounted = false; try { lockRef.current?.release?.() } catch {} }
  }, [active, supported])

  return supported
}
