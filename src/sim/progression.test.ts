import { describe, it, expect } from 'vitest';
import { emptyState, setBelt } from './grid';
import type { GameState } from './grid';
import { addBuilding } from './buildings';
import { advanceLevel, reconcileLevel, syncTargetToLevel, targetHub } from './progression';
import { canPlaceMiner } from '../input/place';
import { LEVELS, levelAt } from '../content/levels';

const LAST = LEVELS.length - 1;
// First level after 0 that grants a new deposit (not every level does).
const GRANT_LEVEL = LEVELS.findIndex((l, i) => i > 0 && l.grantNodes.length > 0);

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
  it('advances a non-final level: bumps the goal and resets the bar', () => {
    const s = withHub(0, LEVELS[0].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.levelIndex).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.delivered).toBe(0);
    expect((hub as any).target).toBe(LEVELS[1].target);
    expect((hub as any).required).toBe(LEVELS[1].required);
  });

  it('grants the new deposit on a level that introduces one', () => {
    const s = withHub(GRANT_LEVEL - 1, LEVELS[GRANT_LEVEL - 1].required);
    advanceLevel(s, targetHub(s)!);
    expect(s.levelIndex).toBe(GRANT_LEVEL);
    const granted = LEVELS[GRANT_LEVEL].grantNodes[0].value;
    expect([...s.nodes.values()].some((n) => n.value === granted)).toBe(true);
  });

  it('advances the last campaign level into endless mode (never wins) and keeps going', () => {
    const s = withHub(LAST, LEVELS[LAST].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.status).toBe('playing');                               // endless: no win state
    expect(s.levelIndex).toBe(LAST + 1);                            // advanced past the campaign
    expect(s.delivered).toBe(0);
    expect((hub as any).target).toBe(levelAt(LAST + 1, s.seed).target); // hub points at the generated goal
    // A further completion advances again — endless just keeps going.
    advanceLevel(s, hub);
    expect(s.levelIndex).toBe(LAST + 2);
    expect((hub as any).target).toBe(levelAt(LAST + 2, s.seed).target);
  });

  it('relocates a granted deposit when its authored spot is buried under the factory', () => {
    const s = withHub(GRANT_LEVEL - 1, LEVELS[GRANT_LEVEL - 1].required);
    const spot = LEVELS[GRANT_LEVEL].grantNodes[0]; // authored cell for the next granted deposit
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

  it('keeps a large (endless) index and generates its goal — no upper clamp', () => {
    const s = withHub(0);
    s.levelIndex = 999;
    reconcileLevel(s);
    expect(s.levelIndex).toBe(999); // endless: not clamped to the campaign length
    expect((targetHub(s) as any).target).toBe(levelAt(999, s.seed).target);
  });

  it("rolls a pre-progression 'won' save (won at a non-final level) back into play", () => {
    const s = withHub(0, 20, 'won'); // e.g. an old v3 save that had won the single target
    reconcileLevel(s);
    expect(s.status).toBe('playing');
    expect(s.levelIndex).toBe(0);
    expect(s.delivered).toBe(0);
    expect((targetHub(s) as any).required).toBe(LEVELS[0].required);
  });

  it("rolls any 'won' save back into play (endless mode never wins)", () => {
    const s = withHub(LAST, LEVELS[LAST].required, 'won');
    reconcileLevel(s);
    expect(s.status).toBe('playing');
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
