// The sound director turns observable GameState deltas into sound each frame. It READS state and
// never mutates it, so the simulation stays pure and unaware of audio. Input actions that aren't
// visible as state deltas (placing a belt, erasing) are reported to it directly from the input layer.
import type { GameState } from '../sim/grid';
import { ENDLESS_START } from '../content/levels';
import type { Sfx } from './sfx';

export interface SoundDirector {
  frame(state: GameState): void; // call once per rendered frame
  belt(): void;                  // a belt cell was painted
  built(): void;                 // a splitter/tunnel/operator was placed
  erased(): void;                // something was erased
}

const COMBO_RESET_MS = 2500; // a delivery streak lapses after this idle gap

export function createSoundDirector(sfx: Sfx): SoundDirector {
  // -1 = "not seeded yet"; the first frame after load captures baselines without firing sounds,
  // so a resumed save doesn't replay a burst of deliveries/level-ups.
  let prevDelivered = -1;
  let prevMisses = 0;
  let prevLevel = 0;
  let combo = 0;
  let lastDeliverAt = 0;

  return {
    frame(state) {
      if (prevDelivered < 0) {
        prevDelivered = state.delivered; prevMisses = state.misses; prevLevel = state.levelIndex;
        return;
      }

      // Level-up first (it also resets delivered to 0 in advanceLevel, so handle it before the
      // delivery check to avoid reading the reset as a "delivery went down").
      if (state.levelIndex > prevLevel) {
        sfx.levelUp(state.levelIndex >= ENDLESS_START);
        combo = 0;
      }

      // A correct delivery this frame → one rising chime at the next combo step. Coalesced to a
      // single chime per frame even if several items landed, so it never machine-guns.
      if (state.delivered > prevDelivered) {
        const now = performance.now();
        if (now - lastDeliverAt > COMBO_RESET_MS) combo = 0;
        sfx.deliver(combo);
        combo = combo + 1;
        lastDeliverAt = now;
      }

      // A wrong number breaks the streak and gives a gentle "not quite" boop. (tick.ts already
      // excludes stale old-target leftovers from `misses`, so this only fires on real mistakes.)
      if (state.misses > prevMisses) {
        sfx.miss();
        combo = 0;
      }

      prevDelivered = state.delivered;
      prevMisses = state.misses;
      prevLevel = state.levelIndex;
    },
    belt() { sfx.beltPlace(); },
    built() { sfx.built(); },
    erased() { sfx.erase(); },
  };
}
