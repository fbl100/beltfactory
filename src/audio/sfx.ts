// Web Audio sound synth — zero dependencies, no audio assets. Synthesizes short enveloped tones
// for game feedback. No sim/render imports. The AudioContext is created lazily and only after the
// first user gesture (browsers block autoplay); on iPad Safari it re-suspends when backgrounded, so
// we resume() opportunistically. Mute is persisted PER-DEVICE in localStorage (parents will want a
// quick mute), which is separate from the server-side game save.

const MUTE_KEY = 'bf_muted';

// C-major pentatonic ladder (Hz), ascending — the "collect coin" combo climbs this as she delivers.
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export interface Sfx {
  unlock(): void;                 // create/resume the AudioContext on a user gesture
  isMuted(): boolean;
  setMuted(m: boolean): void;
  toggleMuted(): boolean;         // returns the new muted state
  beltPlace(): void;
  built(): void;                  // splitter/tunnel/operator dropped (chunky thunk)
  erase(): void;
  deliver(step: number): void;    // correct delivery; step (0..) raises the pitch for combos
  miss(): void;                   // wrong number — gentle, never a harsh buzzer
  levelUp(big: boolean): void;    // level advanced; `big` = the endless-mode boundary fanfare
}

interface NoteOpts { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number; }

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = readMuted();
  const lastAt: Record<string, number> = {}; // per-name throttle timestamps (ms)

  function readMuted(): boolean {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  }
  function persistMuted(): void {
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  }

  // Ensure a live, running context. Returns null when muted or Web Audio is unavailable, so every
  // sound method can early-out on a null context.
  function ensure(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32; // gentle overall level for a kid's room
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume(); // Safari suspends on backgrounding
    return ctx;
  }

  // True if `name` fired within `ms` — used to keep rapid actions (belt drag, deliveries) from
  // machine-gunning the speakers.
  function throttled(name: string, ms: number): boolean {
    const now = performance.now();
    if (lastAt[name] !== undefined && now - lastAt[name] < ms) return true;
    lastAt[name] = now;
    return false;
  }

  // One short enveloped oscillator note (fast attack, exponential decay).
  function note(freq: number, dur: number, o: NoteOpts = {}): void {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    const peak = o.gain ?? 0.6;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    isMuted() { return muted; },
    setMuted(m: boolean) {
      muted = m; persistMuted();
      if (m && ctx && ctx.state === 'running') void ctx.suspend();
      else if (!m) ensure();
    },
    toggleMuted() { this.setMuted(!muted); return muted; },

    // Soft high click with a little pitch wobble so a fast drag sounds like rain, not a machine gun.
    beltPlace() {
      if (throttled('belt', 28)) return;
      const wobble = 1 + (Math.random() - 0.5) * 0.12; // ±6%
      note(1650 * wobble, 0.05, { type: 'triangle', gain: 0.18 });
    },
    // Chunky thunk for a placed machine.
    built() {
      note(180, 0.12, { type: 'square', gain: 0.22, slideTo: 90 });
      note(320, 0.09, { type: 'triangle', gain: 0.12 });
    },
    // Quick descending pop for erase.
    erase() {
      if (throttled('erase', 24)) return;
      note(520, 0.07, { type: 'triangle', gain: 0.16, slideTo: 240 });
    },
    // Rising pentatonic chime; higher combo step = higher note. Caps at the top of the ladder.
    deliver(step: number) {
      const f = PENTATONIC[Math.min(step, PENTATONIC.length - 1)];
      note(f, 0.16, { type: 'sine', gain: 0.5 });
      note(f * 2, 0.12, { type: 'sine', gain: 0.14 }); // soft octave sparkle
    },
    // Wrong number: a warm two-note "boop" that falls gently. Deliberately not a buzzer — the game
    // never punishes; it just says "not quite".
    miss() {
      if (throttled('miss', 200)) return;
      note(392, 0.14, { type: 'sine', gain: 0.22 });
      note(311, 0.18, { type: 'sine', gain: 0.22, delay: 0.11 });
    },
    // Little ascending fanfare; the endless-boundary variant is longer and brighter.
    levelUp(big: boolean) {
      const seq = big ? [523.25, 659.25, 783.99, 1046.5, 1318.51] : [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => note(f, 0.22, { type: 'triangle', gain: 0.34, delay: i * 0.1 }));
    },
  };
}
