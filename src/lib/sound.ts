// Tiny Web Audio "ding" used for live notification feedback.
// No asset dependency: synthesised on demand, single shared AudioContext,
// silent no-op when running in a non-browser env or when audio is blocked.

let cachedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (cachedCtx) return cachedCtx
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    cachedCtx = new Ctor()
  } catch {
    cachedCtx = null
  }
  return cachedCtx
}

export function playNotificationDing() {
  const ctx = getCtx()
  if (!ctx) return
  // Browsers suspend the AudioContext until a user gesture. Try to resume;
  // if that fails (no gesture yet), the call simply does nothing audible.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(0.09, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.42)
}
