import { describe, it, expect } from 'vitest';
import { createSoundDirector } from './director';
import type { Sfx } from './sfx';
import type { GameState } from '../sim/grid';
import { ENDLESS_START } from '../content/levels';

// A recording stand-in for the synth: the director must never touch a real AudioContext, and we
// assert on the sequence of calls it makes in response to state deltas.
function recorder() {
  const calls: string[] = [];
  const sfx: Sfx = {
    unlock() {}, isMuted() { return false; }, setMuted() {}, toggleMuted() { return false; },
    beltPlace() { calls.push('belt'); },
    built() { calls.push('built'); },
    erase() { calls.push('erase'); },
    deliver(step) { calls.push(`deliver:${step}`); },
    miss() { calls.push('miss'); },
    levelUp(big) { calls.push(`levelUp:${big}`); },
  };
  return { calls, sfx };
}

// The director only reads delivered/misses/levelIndex; a minimal shape is enough.
function fakeState(over: Partial<GameState> = {}): GameState {
  return { delivered: 0, misses: 0, levelIndex: 0, ...over } as GameState;
}

describe('sound director', () => {
  it('does not fire sounds on the first (seeding) frame after load', () => {
    const { calls, sfx } = recorder();
    const d = createSoundDirector(sfx);
    d.frame(fakeState({ delivered: 5, misses: 2, levelIndex: 3 })); // resumed save
    expect(calls).toEqual([]);
  });

  it('plays a rising combo chime for each correct delivery, capping is handled by sfx', () => {
    const { calls, sfx } = recorder();
    const d = createSoundDirector(sfx);
    const s = fakeState();
    d.frame(s);                 // seed
    s.delivered = 1; d.frame(s);
    s.delivered = 2; d.frame(s);
    s.delivered = 3; d.frame(s);
    expect(calls).toEqual(['deliver:0', 'deliver:1', 'deliver:2']);
  });

  it('a miss plays a boop and resets the combo streak', () => {
    const { calls, sfx } = recorder();
    const d = createSoundDirector(sfx);
    const s = fakeState();
    d.frame(s);                             // seed
    s.delivered = 1; d.frame(s);            // deliver:0
    s.delivered = 2; d.frame(s);            // deliver:1
    s.misses = 1; d.frame(s);              // miss, combo -> 0
    s.delivered = 3; d.frame(s);           // deliver:0 again (streak reset)
    expect(calls).toEqual(['deliver:0', 'deliver:1', 'miss', 'deliver:0']);
  });

  it('fires the fanfare on level-up and resets the combo (endless boundary = big)', () => {
    const { calls, sfx } = recorder();
    const d = createSoundDirector(sfx);
    const s = fakeState();
    d.frame(s);                                    // seed
    s.levelIndex = 1; d.frame(s);                  // campaign level-up
    s.levelIndex = ENDLESS_START; d.frame(s);      // into endless
    expect(calls).toEqual(['levelUp:false', `levelUp:true`]);
  });

  it('reports place/erase actions straight through', () => {
    const { calls, sfx } = recorder();
    const d = createSoundDirector(sfx);
    d.belt(); d.built(); d.erased();
    expect(calls).toEqual(['belt', 'built', 'erase']);
  });
});
