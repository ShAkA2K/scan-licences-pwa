import { useEffect, useRef, useState } from 'react'
import { addScan } from '../lib/add-scan'
import { Camera, CameraOff, CheckCircle2, Flashlight, Loader2, RefreshCw, RotateCw } from 'lucide-react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

type Props = { sessionId: string }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

export default function QrScanBox({ sessionId }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)

  const rafId = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const zxingControls = useRef<IScannerControls | null>(null)

  async function enumerateCameras() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter(d => d.kind === 'videoinput')
      setDevices(cams)
      const back = cams.find(d => /back|environment/i.test(d.label))
      setDeviceId(back?.deviceId || cams[0]?.deviceId || null)
    } catch {}
  }
  useEffect(() => { enumerateCameras() }, [])

  function cleanup() {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    if (zxingControls.current) { zxingControls.current.stop(); zxingControls.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }
  function stop() { cleanup(); setActive(false); setTorchOn(false) }

  async function handleDecoded(text: string) {
    try {
      setBusy(true); setMsg(null)
      const { duplicated } = await addScan(text, sessionId)
      if (canVibrate) navigator.vibrate?.(duplicated ? 60 : [30, 40, 30])
      setMsg(duplicated ? 'Déjà enregistré aujourd’hui ✅' : 'Enregistré ✅')
    } catch (e: any) {
      setMsg('Erreur: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
      stop()
      await sleep(700)
    }
  }

  async function start() {
    setError(null); setMsg(null)
    cleanup()
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } as any },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    } catch {
      setError('Accès caméra refusé ou indisponible.')
      return
    }

    // Native API si dispo
    const BD: any = (window as any).BarcodeDetector
    if (BD) {
      try {
        const detector = new BD({ formats: ['qr_code'] })
        setActive(true)
        const loop = async () => {
          if (!videoRef.current || !active) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes && codes.length > 0) {
              const raw = (codes[0].rawValue || '').toString()
              if (raw) { await handleDecoded(raw); return }
            }
          } catch {}
          rafId.current = requestAnimationFrame(loop)
        }
        rafId.current = requestAnimationFrame(loop)
        return
      } catch {}
    }

    // Fallback ZXing
    try {
      const reader = new BrowserMultiFormatReader()
      setActive(true)
      zxingControls.current = await reader.decodeFromVideoDevice(
        deviceId || undefined,
        videoRef.current!,
        (result) => {
          if (result) {
            const txt = result.getText()
            if (txt) handleDecoded(txt)
          }
        }
      )
    } catch {
      setError('Impossible de démarrer le décodage.')
      stop()
    }
  }

  async function toggleTorch() {
    try {
      const track = streamRef.current?.getVideoTracks?.()[0]
      // @ts-ignore
      const supportsTorch = track && track.getCapabilities && track.getCapabilities().torch
      if (!supportsTorch) return
      // @ts-ignore
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] })
      setTorchOn(v => !v)
    } catch {}
  }

  useEffect(() => () => cleanup(), [])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Scanner le QR</h3>
          <p className="text-sm text-gray-500">Pointe l’appareil vers le QR de la licence.</p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {devices.length > 1 && (
            <select
              className="rounded-xl border px-2 py-2 text-sm"
              value={deviceId ?? ''}
              onChange={e => setDeviceId(e.target.value || null)}
              disabled={active}
              title="Choisir la caméra"
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Caméra'}</option>
              ))}
            </select>
          )}
          {!active ? (
            <button
              onClick={start}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:translate-y-[1px]"
            >
              <Camera className="h-4 w-4" /> Démarrer
            </button>
          ) : (
            <button
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50"
            >
              <CameraOff className="h-4 w-4" /> Arrêter
            </button>
          )}
        </div>
      </div>

      {/* Preview vidéo — plein écran mobile */}
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video
          ref={videoRef}
          className="w-full h-[54vh] sm:h-[48vh] object-cover"
          muted
          playsInline
        />
        {/* Cadre de visée */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 sm:h-56 sm:w-56 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
        </div>
        {/* Actions overlay en bas à droite */}
        {active && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              onClick={toggleTorch}
              className="inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-1.5 text-sm hover:bg-white"
              title="Lampe"
            >
              <Flashlight className={`h-4 w-4 ${torchOn ? 'text-amber-600' : ''}`} /> Lampe
            </button>
            <button
              onClick={() => { stop(); start() }}
              className="inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-1.5 text-sm hover:bg-white"
              title="Relancer"
            >
              <RefreshCw className="h-4 w-4" /> Relancer
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      {busy && <div className="inline-flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Traitement…
      </div>}
      {msg && <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> {msg}
      </div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!active && !busy && (
        <button
          onClick={start}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50"
          title="Scanner un autre QR"
        >
          <RotateCw className="h-4 w-4" /> Scanner un autre QR
        </button>
      )}
    </div>
  )
}
