import { describe, it, expect } from 'vitest';
import { emptyState, setBelt } from './grid';
import type { GameState } from './grid';
import { addBuilding } from './buildings';
import { advanceLevel, reconcileLevel, syncTargetToLevel, targetHub } from './progression';
import { canPlaceMiner } from '../input/place';
import { LEVELS } from '../content/levels';

const LAST = LEVELS.length - 1;

// A minimal world: a single target hub (like worldgen authors) at the given level.
function withHub(levelIndex: number, delivered = 0, status: 'playing' | 'won' = 'playing'): GameState {
  const s = emptyState(1);
  s.levelIndex = levelIndex;
  s.delivered = delivered;
  s.status = status;
  const lvl = LEVELS[levelIndex] ?? LEVELS[0];
  addBuilding(s, { type: 'target', ax: 12, ay: 4, dir: 'right', target: lvl.target, required: lvl.required });
  return s;
}

describe('progression: advanceLevel', () => {
  it('advances a non-final level: bumps the goal, resets the bar, grants the next deposit', () => {
    const s = withHub(0, LEVELS[0].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.levelIndex).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.delivered).toBe(0);
    expect((hub as any).target).toBe(LEVELS[1].target);
    expect((hub as any).required).toBe(LEVELS[1].required);
    const granted = LEVELS[1].grantNodes[0].value;
    expect([...s.nodes.values()].some((n) => n.value === granted)).toBe(true);
  });

  it('wins the whole game on the final level and is idempotent afterward', () => {
    const s = withHub(LAST, LEVELS[LAST].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.status).toBe('won');
    expect(s.levelIndex).toBe(LAST);            // does not run off the end
    expect(s.delivered).toBe((hub as any).required); // bar held at 100%
    // A second call (a stray extra delivery) changes nothing.
    advanceLevel(s, hub);
    expect(s.status).toBe('won');
    expect(s.levelIndex).toBe(LAST);
  });

  it('relocates a granted deposit when its authored spot is buried under the factory', () => {
    const s = withHub(0, LEVELS[0].required);
    const spot = LEVELS[1].grantNodes[0]; // authored cell for the level-1 deposit
    setBelt(s, spot.x, spot.y, { type: 'belt', dir: 'right' }); // bury the miner spot
    advanceLevel(s, targetHub(s)!);
    const node = [...s.nodes.values()].find((n) => n.value === spot.value);
    expect(node).toBeDefined();
    expect(node!.x === spot.x && node!.y === spot.y).toBe(false); // moved off the buried cell
    expect(canPlaceMiner(s, node!.x, node!.y)).toBe(true);        // and a miner fits there
  });
});

describe('progression: reconcileLevel (load/migration consistency)', () => {
  it('re-points the hub at LEVELS[levelIndex] (single source of truth)', () => {
    const s = withHub(0);
    s.levelIndex = 2;
    const hub = syncTargetToLevel(s)!;
    expect((hub as any).target).toBe(LEVELS[2].target);
    expect((hub as any).required).toBe(LEVELS[2].required);
  });

  it('clamps an out-of-range index and syncs the hub', () => {
    const s = withHub(0);
    s.levelIndex = 999;
    reconcileLevel(s);
    expect(s.levelIndex).toBe(LAST);
    expect((targetHub(s) as any).target).toBe(LEVELS[LAST].target);
  });

  it("rolls a pre-progression 'won' save (won at a non-final level) back into play", () => {
    const s = withHub(0, 20, 'won'); // e.g. an old v3 save that had won the single target
    reconcileLevel(s);
    expect(s.status).toBe('playing');
    expect(s.levelIndex).toBe(0);
    expect(s.delivered).toBe(0);
    expect((targetHub(s) as any).required).toBe(LEVELS[0].required);
  });

  it("keeps a genuine final-level 'won' save won", () => {
    const s = withHub(LAST, LEVELS[LAST].required, 'won');
    reconcileLevel(s);
    expect(s.status).toBe('won');
    expect(s.levelIndex).toBe(LAST);
  });

  it('snaps an over-full delivered count (old higher required) back to zero', () => {
    const s = withHub(0, 15, 'playing'); // 15 delivered but new required is smaller
    reconcileLevel(s);
    expect(s.delivered).toBe(0);
  });

  it('snaps an exactly-full bar to zero so a migrated save does not instant-advance on load', () => {
    const s = withHub(0, LEVELS[0].required, 'playing'); // exactly full for the new level
    reconcileLevel(s);
    expect(s.delivered).toBe(0);
  });

  it('defaults a missing/garbage level index to 0', () => {
    const s = withHub(0);
    (s as any).levelIndex = undefined;
    reconcileLevel(s);
    expect(s.levelIndex).toBe(0);
  });
});
