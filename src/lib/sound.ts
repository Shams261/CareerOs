'use client';
/**
 * Focus sounds, synthesised with Web Audio (no files, works offline): the WI-027 end chime and,
 * through `src/lib/ambient.ts`, the WI-035 ambient sound. Browsers only allow audio after a
 * user gesture, so `unlockAudio()` runs on the owner's first tap in Focus and sound can play
 * later.
 */
type AudioCtor = typeof AudioContext;
let context: AudioContext | null = null;

/** The page's one AudioContext, created on first use. */
export function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** True once a gesture has let audio play; never creates the context (no autoplay warning). */
export const audioRunning = () => context?.state === 'running';

/** Called from a tap: lets a later chime play (and keeps iOS from muting it as ambient). */
export function unlockAudio() {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const session = (
      navigator as unknown as { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // Older browsers have no audio session; the chime may follow the silent switch there.
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** Two soft sine notes, about −24 dB, half a second in all. Silent when audio is unavailable. */
export function playChime() {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime + 0.02;
  for (const [i, frequency] of [659.25, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = start + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.06, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }
}
