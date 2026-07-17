// Cross-module integration test for the Beltmatic core loop (sim + buildings + input + content).
// The origin puzzle authors two number nodes (7, 5) and a target-12 hub; the PLAYER places
// miners on the nodes and an + operator, then lays belts to route 7 and 5 through the + into
// the target. We tick to a win, and confirm a mid-game save round-trips (occupancy rebuilt)
// and the resumed game still wins.
import { describe, it, expect } from 'vitest';
import { newGame } from './sim/world';
import { mvpGenerator, TARGET } from './content/worldgen';
import { step } from './sim/tick';
import { paintBeltLine, placeMiner, placeOperator } from './input/place';
import { buildingAt } from './sim/buildings';
import { nodeAt } from './sim/grid';
import type { GameState } from './sim/grid';
import { serialize, deserialize } from './sim/save';

// Place the two miners + operator, then route belts to the target (verified vs. port geometry).
function build(s: GameState): void {
  placeMiner(s, 2, 2, 'right');    // on the 7 node -> out (4,2)
  placeMiner(s, 2, 8, 'right');    // on the 5 node -> out (4,8)
  placeOperator(s, 8, 5, 'right'); // center (8,5); ins (8,4)/(8,6); out (10,5)
  // 7-line: (4,2) across then down into the operator top-in (8,4)
  paintBeltLine(s, 4, 2, 8, 2, 'right');
  paintBeltLine(s, 8, 2, 8, 3, 'down');
  // 5-line: (4,8) across then up into the operator bottom-in (8,6)
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
  it('authors nodes + a target; the machines are player-placed', () => {
    const s = newGame(1, mvpGenerator);
    expect(nodeAt(s, 2, 2)?.value).toBe(7n);
    expect(nodeAt(s, 2, 8)?.value).toBe(5n);
    expect(buildingAt(s, 2, 2)).toBeUndefined(); // no miner until the player places one
    expect(buildingAt(s, 8, 5)).toBeUndefined(); // no operator yet
    const t = buildingAt(s, 13, 5); expect(t?.type).toBe('target'); expect((t as any).target).toBe(TARGET);
  });

  it('places miners + operator, routes belts, and wins', () => {
    const s = newGame(1, mvpGenerator);
    build(s);
    expect(buildingAt(s, 2, 2)?.type).toBe('miner');
    expect((buildingAt(s, 2, 2) as any).value).toBe(7n);
    expect(buildingAt(s, 8, 5)?.type).toBe('operator');
    const ticks = runToWin(s);
    expect(ticks).toBeGreaterThan(0);
    expect(s.status).toBe('won');
    expect(s.misses).toBe(0);
  });

  it('resumes from a mid-game save and still reaches the win', () => {
    const s = newGame(42, mvpGenerator);
    build(s);
    for (let i = 0; i < 12; i++) step(s); // mid-flight (first emit at tick 8, win ~tick 18)
    expect(s.status).toBe('playing');
    expect(s.items.length).toBeGreaterThan(0);

    const r = deserialize(serialize(s));
    expect(r.buildings instanceof Map).toBe(true);
    expect(buildingAt(r, 8, 5)?.type).toBe('operator'); // occupancy rebuilt after load
    expect(buildingAt(r, 2, 2)?.type).toBe('miner');
    expect(r.tick).toBe(s.tick);

    expect(runToWin(r)).toBeGreaterThanOrEqual(0);
    expect(r.status).toBe('won');
  });
});
