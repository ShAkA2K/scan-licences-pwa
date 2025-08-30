// src/components/QrScanner.tsx
import React from 'react'

type Props = {
  onDetect: (text: string) => void
  paused?: boolean
  className?: string
  fps?: number
}

async function loadHtml5QrCodeViaCdn(): Promise<any> {
  // Fallback: charge la lib depuis un CDN si l'import bundlé échoue
  const src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/minified/html5-qrcode.min.js'
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('CDN load failed'))
    document.head.appendChild(s)
  })
  // @ts-ignore
  const g: any = window
  if (g.Html5QrcodeScanner && g.Html5QrcodeSupportedFormats && g.Html5QrcodeScanType) {
    return {
      Html5QrcodeScanner: g.Html5QrcodeScanner,
      Html5QrcodeSupportedFormats: g.Html5QrcodeSupportedFormats,
      Html5QrcodeScanType: g.Html5QrcodeScanType,
    }
  }
  throw new Error('CDN globals not found')
}

export default function QrScanner({ onDetect, paused = false, className, fps = 10 }: Props) {
  const idRef = React.useRef('qr-' + Math.random().toString(36).slice(2))
  const lastRef = React.useRef<{ text: string; t: number } | null>(null)
  const scannerRef = React.useRef<any>(null)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    async function start() {
      try {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
          setErr('Scanner indisponible (HTTPS requis).'); return
        }
        if (!(navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices)) {
          setErr('Caméra non disponible sur ce navigateur.'); return
        }

        let mod: any = null
        try {
          mod = await import('html5-qrcode') // chemin normal (bundle)
        } catch {
          // fallback CDN si import échoue
          mod = await loadHtml5QrCodeViaCdn()
        }
        if (!active) return
        const { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScanType } = mod

        const config = {
          fps,
          rememberLastUsedCamera: true,
          qrbox: (vw: number, vh: number) => {
            const size = Math.floor(Math.min(vw, vh) * 0.75)
            return { width: size, height: size }
          },
          aspectRatio: 1.7778,
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        }

        const s = new Html5QrcodeScanner(idRef.current, config, false)
        scannerRef.current = s

        const onSuccess = (decodedText: string) => {
          const now = Date.now()
          const last = lastRef.current
          if (last && last.text === decodedText && now - last.t < 1500) return
          lastRef.current = { text: decodedText, t: now }
          onDetect(decodedText)
        }
        const onFailure = (_: any) => {}

        s.render(onSuccess, onFailure)
      } catch (e: any) {
        console.error('QR init fail', e)
        setErr('Scanner indisponible (' + (e?.message || 'erreur') + ').')
      }
    }

    start()
    return () => {
      active = false
      try { scannerRef.current?.clear?.() } catch {}
      scannerRef.current = null
    }
  }, [fps, onDetect])

  React.useEffect(() => {
    if (!scannerRef.current) return
    if (paused) { try { scannerRef.current.clear() } catch {} }
  }, [paused])

  return (
    <div className={className}>
      {err ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          {err}<br/>Tu peux continuer en collant l’URL du QR ci-dessous.
        </div>
      ) : (
        <div id={idRef.current} />
      )}
    </div>
  )
}
