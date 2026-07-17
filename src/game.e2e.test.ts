// Cross-module integration test for the Beltmatic core loop (sim + buildings + input + content).
// The origin puzzle authors two miners (on the 7 and 5 nodes), an + operator, and a target-12
// hub; the player lays belts to route 7 and 5 through the + into the target. We tick to a win,
// and confirm a mid-game save round-trips (occupancy rebuilt) and the resumed game still wins.
import { describe, it, expect } from 'vitest';
import { newGame } from './sim/world';
import { mvpGenerator, TARGET } from './content/worldgen';
import { step } from './sim/tick';
import { paintBeltLine } from './input/place';
import { buildingAt } from './sim/buildings';
import { nodeAt } from './sim/grid';
import type { GameState } from './sim/grid';
import { serialize, deserialize } from './sim/save';

// Route both miners through the operator into the target (verified against the port geometry).
function wire(s: GameState): void {
  // 7-line: miner out (4,2) -> across -> down into the operator top-in (8,4)
  paintBeltLine(s, 4, 2, 8, 2, 'right');
  paintBeltLine(s, 8, 2, 8, 3, 'down');
  // 5-line: miner out (4,8) -> across -> up into the operator bottom-in (8,6)
  paintBeltLine(s, 4, 8, 8, 8, 'right');
  paintBeltLine(s, 8, 8, 8, 7, 'up');
  // product: operator out (10,5) -> target left-in (12,5)
  paintBeltLine(s, 10, 5, 11, 5, 'right');
}

function runToWin(s: GameState, maxTicks = 400): number {
  for (let i = 0; i < maxTicks; i++) {
    if (s.status === 'won') return i;
    step(s);
  }
  return -1;
}

describe('e2e: beltmatic puzzle loop', () => {
  it('authors the origin puzzle (nodes + 3x3 buildings)', () => {
    const s = newGame(1, mvpGenerator);
    expect(nodeAt(s, 2, 2)?.value).toBe(7n);
    expect(nodeAt(s, 2, 8)?.value).toBe(5n);
    const m1 = buildingAt(s, 2, 2); expect(m1?.type).toBe('miner'); expect((m1 as any).value).toBe(7n);
    const m2 = buildingAt(s, 2, 8); expect(m2?.type).toBe('miner'); expect((m2 as any).value).toBe(5n);
    expect(buildingAt(s, 8, 5)?.type).toBe('operator'); // operator center
    const t = buildingAt(s, 13, 5); expect(t?.type).toBe('target'); expect((t as any).target).toBe(TARGET);
  });

  it('routes 7 and 5 through + into the target and wins', () => {
    const s = newGame(1, mvpGenerator);
    wire(s);
    const ticks = runToWin(s);
    expect(ticks).toBeGreaterThan(0);
    expect(s.status).toBe('won');
    expect(s.misses).toBe(0);
  });

  it('resumes from a mid-game save and still reaches the win', () => {
    const s = newGame(42, mvpGenerator);
    wire(s);
    for (let i = 0; i < 12; i++) step(s); // mid-flight (first emit at tick 8, win ~tick 18)
    expect(s.status).toBe('playing');
    expect(s.items.length).toBeGreaterThan(0);

    const r = deserialize(serialize(s));
    expect(r.buildings instanceof Map).toBe(true);
    expect(buildingAt(r, 8, 5)?.type).toBe('operator'); // occupancy rebuilt after load
    expect(r.tick).toBe(s.tick);

    expect(runToWin(r)).toBeGreaterThanOrEqual(0);
    expect(r.status).toBe('won');
  });
});
