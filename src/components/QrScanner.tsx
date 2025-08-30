// src/components/QrScanner.tsx
import React from 'react'

type Props = {
  onDetect: (text: string) => void
  paused?: boolean
  className?: string
  fps?: number
}

async function loadHtml5QrCode(): Promise<any> {
  try {
    return await import('html5-qrcode')
  } catch {
    // Fallback CDN (utile sur certains mobiles)
    const src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/minified/html5-qrcode.min.js'
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('CDN load failed'))
      document.head.appendChild(s)
    })
    const g: any = window
    if (g.Html5Qrcode && g.Html5QrcodeSupportedFormats) {
      return {
        Html5Qrcode: g.Html5Qrcode,
        Html5QrcodeSupportedFormats: g.Html5QrcodeSupportedFormats
      }
    }
    throw new Error('CDN globals not found')
  }
}

export default function QrScanner({ onDetect, paused = false, className, fps = 10 }: Props) {
  const boxId = React.useRef('qr-' + Math.random().toString(36).slice(2))
  const instRef = React.useRef<any>(null)
  const lastRef = React.useRef<{ text: string; t: number } | null>(null)
  const trackRef = React.useRef<MediaStreamTrack | null>(null)

  const [err, setErr] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [cameras, setCameras] = React.useState<{ id: string; label?: string }[]>([])
  const [camId, setCamId] = React.useState<string | null>(null)

  const [torchSupported, setTorchSupported] = React.useState(false)
  const [torchOn, setTorchOn] = React.useState(false)

  // Pré-checks
  React.useEffect(() => {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setErr('Scanner indisponible (HTTPS requis).')
    } else if (!(navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices)) {
      setErr('Caméra non disponible sur ce navigateur.')
    }
  }, [])

  // Pause -> stop
  React.useEffect(() => {
    if (!instRef.current) return
    if (paused && running) stop().catch(()=>{})
  }, [paused, running])

  async function start() {
    try {
      setErr(null)
      setStarting(true)

      const mod: any = await loadHtml5QrCode()
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod

      // Récup liste caméras (geste utilisateur requis)
      const list = await Html5Qrcode.getCameras()
      const cams = (list ?? []).map((c: any) => ({ id: c.id, label: c.label }))
      setCameras(cams)

      // Choisir la dorsale si possible
      const byLabel = cams.find(c => (c.label || '').toLowerCase().includes('back')) || cams[0]
      const chosenId = camId || byLabel?.id || cams[0]?.id || null
      if (!chosenId) throw new Error('Aucune caméra disponible')

      const html5 = new Html5Qrcode(boxId.current)
      instRef.current = html5

      const qrbox = (vw: number, vh: number) => {
        const size = Math.floor(Math.min(vw, vh) * 0.75)
        return { width: size, height: size }
      }

      const onSuccess = (decodedText: string) => {
        const now = Date.now()
        const last = lastRef.current
        if (last && last.text === decodedText && now - last.t < 1500) return
        lastRef.current = { text: decodedText, t: now }
        onDetect(decodedText)
      }

      await html5.start(
        { deviceId: { exact: chosenId } },
        { fps, qrbox, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] },
        onSuccess,
        (_: any) => {} // ignore failures
      )

      setCamId(chosenId)
      setRunning(true)

      // Récupérer la piste vidéo pour la torche
      const box = document.getElementById(boxId.current)!
      const video = box.querySelector('video') as HTMLVideoElement | null
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0] || null
      trackRef.current = track || null

      const caps: any = track?.getCapabilities?.()
      const torchOk = !!(caps && 'torch' in caps && caps.torch)
      setTorchSupported(torchOk)
      setTorchOn(false)
    } catch (e: any) {
      console.error('QR start fail', e)
      if (e?.name === 'NotAllowedError') setErr('Permission caméra refusée. Autorise la caméra dans les paramètres du site.')
      else if (e?.name === 'NotFoundError') setErr('Aucune caméra détectée.')
      else setErr(e?.message || 'Erreur au démarrage du scanner.')
      setRunning(false)
      try { await stop() } catch {}
    } finally {
      setStarting(false)
    }
  }

  async function stop() {
    try {
      await setTorch(false)
    } catch {}
    const inst = instRef.current
    if (!inst) return
    try {
      await inst.stop()
      await inst.clear()
    } catch {}
    instRef.current = null
    trackRef.current = null
    setRunning(false)
    setTorchSupported(false)
    setTorchOn(false)
  }

  async function setTorch(on: boolean) {
    const t = trackRef.current
    if (!t) return
    // @ts-ignore
    if (t.applyConstraints) {
      try {
        // @ts-ignore
        await t.applyConstraints({ advanced: [{ torch: on }] })
        setTorchOn(on)
      } catch {
        // ignore
      }
    }
  }

  React.useEffect(() => {
    return () => { stop().catch(()=>{}) }
  }, [])

  return (
    <div className={className}>
      <div id={boxId.current} className="overflow-hidden rounded-xl ring-1 ring-black/5 min-h-[200px] grid place-items-center bg-black/2" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!running ? (
          <button disabled={!!err || starting} onClick={start}
                  className="rounded-lg bg-blue-600 text-white px-3 py-1.5 disabled:opacity-50">
            {starting ? '…' : 'Démarrer la caméra'}
          </button>
        ) : (
          <>
            <button onClick={stop} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">Arrêter</button>
            {torchSupported && (
              <button onClick={() => setTorch(!torchOn)}
                      className={["rounded-lg px-3 py-1.5 ring-1", torchOn ? "bg-amber-500 text-white ring-amber-500" : "bg-white ring-slate-200 hover:bg-slate-50"].join(' ')}>
                🔦 Torche {torchOn ? 'ON' : 'OFF'}
              </button>
            )}
            {cameras.length > 1 && (
              <select value={camId ?? ''} onChange={e => { setCamId(e.target.value); stop().then(() => start()) }}
                      className="rounded-lg border border-slate-300 px-2 py-1.5">
                {cameras.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      {err && <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 text-sm">{err}</div>}
    </div>
  )
}
