'use client';
/**
 * Ambient sound for Focus (WI-035, a Version 2 Phase 4 hypothesis): rain or brown noise,
 * synthesised with Web Audio on the page's one AudioContext (no files, works offline). Off by
 * default; it plays only after a gesture, fades in and out, and stays quiet under the chime.
 * Since WI-069 both are stereo loops built once, offline, from pure generators: rain is a
 * soft bed with thousands of small drops, brown noise a deep, slow rumble. The generators are
 * pure and covered by tests/focus-sound.test.ts.
 */
import type { Sound } from '@/features/execution/focus-domain';
import { audioContext } from './sound';

/** About −18 dB: a bed under thinking, not a soundtrack. */
export const AMBIENT_GAIN = 0.12;
/** Each sound at its own level under the gain: brown noise carries more energy than rain. */
export const LEVEL: Record<Sound, number> = { rain: 2.2, brown: 0.8 };
const FADE = 1.2;
const SECONDS = 10;
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

/** A one-pole low-pass over `samples`, in place; `hz` is the cutoff at `rate` samples/s. */
export function lowpass(samples: Float32Array, hz: number, rate: number) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += a * (samples[i] - y);
    samples[i] = y;
  }
  return samples;
}

/** A one-pole high-pass over `samples`, in place: the signal less its low-pass. */
export function highpass(samples: Float32Array, hz: number, rate: number) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += a * (samples[i] - y);
    samples[i] -= y;
  }
  return samples;
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

/** Drops a second, over both channels: a dense patter, with a louder plink now and then. */
const DROPS_PER_SECOND = 160;

/**
 * Rain (WI-069): on each channel a faint bed of pink noise kept between 500 Hz and 2.5 kHz, and
 * a dense patter of drops: short bursts of noise, 2–14 ms, each with its own brightness,
 * loudness and place in the stereo field, one in fifty a louder plink, so the loop reads as
 * rain on a window rather than static.
 * Returns the two channels, each `length + seam` samples, ready for `seamlessLoop`.
 */
export function rain(
  length: number,
  rate: number,
  random = Math.random,
  seam = SEAM,
): [Float32Array, Float32Array] {
  const total = length + seam;
  const channels = [0, 1].map(() => {
    const bed = pinkNoise(total, random);
    highpass(bed, 500, rate);
    lowpass(bed, 2500, rate);
    for (let i = 0; i < total; i++) bed[i] *= 0.06;
    return bed;
  }) as [Float32Array, Float32Array];
  const drops = Math.round((total / rate) * DROPS_PER_SECOND);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(random() * total);
    const ms = 2 + random() * 12;
    const n = Math.max(8, Math.round((ms / 1000) * rate));
    const tau = n / 4;
    const bright = 1500 + random() * 5500;
    const loud = random() < 0.02 ? 0.8 + random() * 0.4 : 0.12 + random() * 0.5;
    const burst = new Float32Array(n);
    for (let i = 0; i < n; i++)
      burst[i] = (random() * 2 - 1) * Math.exp(-i / tau);
    highpass(burst, 900, rate);
    lowpass(burst, bright, rate);
    // Constant-power pan: a drop lands somewhere between the ears.
    const angle = (random() * Math.PI) / 2;
    const gains = [Math.cos(angle), Math.sin(angle)];
    for (const [c, gain] of gains.entries())
      for (let i = 0; i < n && at + i < total; i++)
        channels[c][at + i] += burst[i] * loud * gain;
  }
  return channels;
}

/**
 * Brown noise (WI-069): a random walk kept under 180 Hz, with the drift below 25 Hz removed,
 * on two independent channels, so it reads as a deep, wide, steady rumble rather than a hiss.
 */
export function brown(
  length: number,
  rate: number,
  random = Math.random,
  seam = SEAM,
): [Float32Array, Float32Array] {
  return [0, 1].map(() => {
    const walk = brownNoise(length + seam, random);
    lowpass(walk, 180, rate);
    lowpass(walk, 180, rate);
    highpass(walk, 25, rate);
    return walk;
  }) as [Float32Array, Float32Array];
}

const buffers = new Map<Sound, AudioBuffer>();
function buffer(ctx: AudioContext, sound: Sound) {
  const kept = buffers.get(sound);
  if (kept) return kept;
  const length = Math.round(ctx.sampleRate * SECONDS);
  const channels = (sound === 'brown' ? brown : rain)(length, ctx.sampleRate);
  const made = ctx.createBuffer(2, length, ctx.sampleRate);
  for (const [c, samples] of channels.entries())
    made.getChannelData(c).set(seamlessLoop(samples, length));
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
  out.gain.linearRampToValueAtTime(AMBIENT_GAIN * LEVEL[sound], at + FADE);
  out.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = buffer(ctx, sound);
  source.loop = true;
  // A slow swell, so a long session hears weather rather than a loop.
  const swell = ctx.createGain();
  swell.gain.value = 0.85;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = sound === 'rain' ? 0.05 : 0.03;
  const depth = ctx.createGain();
  depth.gain.value = 0.15;
  lfo.connect(depth).connect(swell.gain);
  source.connect(swell).connect(out);
  lfo.start(at);
  source.start(at);
  current = { sound, out, sources: [source, lfo] };
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
