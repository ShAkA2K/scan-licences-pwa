// src/hooks/useBeep.ts
import { useCallback } from 'react'

// iOS bloque souvent l’audio si le tel est en mode silencieux.
// On crée/réveille l'AudioContext à la demande (sur geste utilisateur).
function getCtx(): AudioContext | null {
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  const ctx: AudioContext = (getCtx as any)._ctx ?? new Ctx()
  ;(getCtx as any)._ctx = ctx
  if (ctx.state === 'suspended') ctx.resume().catch(()=>{})
  return ctx
}

function tone(freq: number, ms = 120, gain = 0.05) {
  const ctx = getCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.value = 0
  osc.connect(g).connect(ctx.destination)

  const now = ctx.currentTime
  // petite enveloppe pour éviter "click"
  g.gain.linearRampToValueAtTime(gain, now + 0.005)
  g.gain.linearRampToValueAtTime(0.0001, now + ms / 1000)

  osc.start()
  osc.stop(now + ms / 1000 + 0.01)
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern as any) } catch {}
}

export function useBeep() {
  const beepOk = useCallback(() => {
    tone(880, 120, 0.06)            // bip aigu court
    vibrate(25)
  }, [])

  const beepWarn = useCallback(() => {
    // double bip moyen
    tone(660, 90, 0.05)
    setTimeout(() => tone(660, 90, 0.05), 140)
    vibrate([20, 60, 20])
  }, [])

  const beepError = useCallback(() => {
    // bip grave un peu plus long
    tone(330, 180, 0.07)
    vibrate(120)
  }, [])

  return { beepOk, beepWarn, beepError }
}
