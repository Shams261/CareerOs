'use client';
/**
 * Ambient sound for Focus (WI-035, a Version 2 Phase 4 hypothesis): rain or brown noise,
 * synthesised with Web Audio on the page's one AudioContext (no files, works offline). Off by
 * default; it plays only after a gesture, fades in and out, and stays quiet under the chime.
 * The noise generators are pure and covered by tests/focus-sound.test.ts.
 */
import type { Sound } from '@/features/execution/focus-domain';
import { audioContext } from './sound';

/** About −18 dB: a bed under thinking, not a soundtrack. */
export const AMBIENT_GAIN = 0.12;
const FADE = 1.2;
const SECONDS = 8;
/** Samples blended across the loop point, so the buffer repeats without a click. */
const SEAM = 4096;

/** Brown noise: a leaky random walk. `random` is injectable for tests. */
export function brownNoise(length: number, random = Math.random) {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last;
  }
  return out;
}

/** Pink noise (Paul Kellet's filter), the base of the rain. */
export function pinkNoise(length: number, random = Math.random) {
  const out = new Float32Array(length);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return out;
}

/**
 * A loop of `length` samples from `samples` (at least `length + seam` long): the first `seam`
 * samples are blended with the ones just past the end, so the last sample runs into the first
 * the way it ran into the next one. Scaled so the loudest sample is 0.9.
 */
export function seamlessLoop(
  samples: Float32Array,
  length: number,
  seam = SEAM,
) {
  const out = samples.slice(0, length);
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    out[i] = samples[length + i] * (1 - t) + samples[i] * t;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] *= 0.9 / peak;
  return out;
}

const buffers = new Map<Sound, AudioBuffer>();
function buffer(ctx: AudioContext, sound: Sound) {
  const kept = buffers.get(sound);
  if (kept) return kept;
  const length = Math.round(ctx.sampleRate * SECONDS);
  const noise = (sound === 'brown' ? brownNoise : pinkNoise)(length + SEAM);
  const made = ctx.createBuffer(1, length, ctx.sampleRate);
  made.getChannelData(0).set(seamlessLoop(noise, length));
  buffers.set(sound, made);
  return made;
}

let current: {
  sound: Sound;
  out: GainNode;
  sources: AudioScheduledSourceNode[];
} | null = null;

/** Fades the chosen sound in (crossfading from another one). Silent without Web Audio. */
export function playAmbient(sound: Sound) {
  if (current?.sound === sound) return;
  const ctx = audioContext();
  if (!ctx) return;
  stopAmbient();
  const at = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(AMBIENT_GAIN, at + FADE);
  out.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = buffer(ctx, sound);
  source.loop = true;
  const sources: AudioScheduledSourceNode[] = [source];
  if (sound === 'brown') {
    source.connect(out);
  } else {
    // Rain: pink noise without its rumble or its sharpest hiss, swelling slowly.
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 450;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 6500;
    const swell = ctx.createGain();
    swell.gain.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth).connect(swell.gain);
    source.connect(high).connect(low).connect(swell).connect(out);
    lfo.start(at);
    sources.push(lfo);
  }
  source.start(at);
  current = { sound, out, sources };
}

/** Fades out whatever is playing. */
export function stopAmbient() {
  if (!current) return;
  const { out, sources } = current;
  current = null;
  const ctx = out.context;
  const at = ctx.currentTime;
  out.gain.cancelScheduledValues(at);
  out.gain.setValueAtTime(out.gain.value, at);
  out.gain.linearRampToValueAtTime(0, at + FADE);
  for (const s of sources) s.stop(at + FADE + 0.05);
  sources[0].onended = () => out.disconnect();
}
