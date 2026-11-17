// Short synthesized cues. No audio files. Browsers stay silent until the first click.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
  const audio = ac();
  if (!audio) return;
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number): void {
  const audio = ac();
  if (!audio) return;
  const n = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audio.createBufferSource();
  const g = audio.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g);
  g.connect(audio.destination);
  src.start();
}

export function sfxUnlock(): void {
  ac();
}

export function sfxOrder(): void {
  tone(740, 0.06, 'square', 0.04);
}

export function sfxShot(): void {
  noise(0.05, 0.08);
  tone(1800, 0.04, 'square', 0.03);
}

export function sfxBoom(): void {
  noise(0.18, 0.12);
  tone(110, 0.22, 'sine', 0.08);
}

export function sfxBuilt(): void {
  tone(523, 0.08, 'triangle', 0.05);
  tone(784, 0.12, 'triangle', 0.05, 0.09);
}
