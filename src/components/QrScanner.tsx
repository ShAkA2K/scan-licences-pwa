// src/components/QrScanner.tsx
import React from 'react'

type Props = {
  onDetect: (text: string) => void
  paused?: boolean
  className?: string
  fps?: number
}

export default function QrScanner({ onDetect, paused = false, className, fps = 10 }: Props) {
  const idRef = React.useRef('qr-' + Math.random().toString(36).slice(2))
  const lastRef = React.useRef<{ text: string; t: number } | null>(null)
  const scannerRef = React.useRef<any>(null)

  React.useEffect(() => {
    let active = true
    let Html5QrcodeScanner: any
    let Html5QrcodeSupportedFormats: any
    let Html5QrcodeScanType: any

    ;(async () => {
      try {
        const mod: any = await import('html5-qrcode')
        Html5QrcodeScanner = mod.Html5QrcodeScanner
        Html5QrcodeSupportedFormats = mod.Html5QrcodeSupportedFormats
        Html5QrcodeScanType = mod.Html5QrcodeScanType

        if (!active) return

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
          // anti-duplicate (1.5 s)
          if (last && last.text === decodedText && now - last.t < 1500) return
          lastRef.current = { text: decodedText, t: now }
          onDetect(decodedText)
        }

        const onFailure = (_: any) => { /* ignore */ }

        s.render(onSuccess, onFailure)
      } catch (e) {
        console.error('QR init failed', e)
      }
    })()

    return () => {
      active = false
      try {
        scannerRef.current?.clear?.()
      } catch {}
      scannerRef.current = null
    }
  }, [fps, onDetect])

  // pause/reprise : on détruit/relance si besoin
  React.useEffect(() => {
    if (!scannerRef.current) return
    if (paused) {
      try { scannerRef.current.clear() } catch {}
    } else {
      // rien: la reprise se fait en recréant le composant (piloté par parent)
    }
  }, [paused])

  return (
    <div className={className}>
      <div id={idRef.current} />
    </div>
  )
}
