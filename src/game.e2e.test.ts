// Cross-module integration test for the Beltmatic core loop (sim + buildings + input + content).
// The origin puzzle authors level-0 number deposits (7, 5) and a target-12 hub; the PLAYER
// places miners on the deposits and an + operator, then lays belts to route 7 and 5 through
// the + into the target. Filling the bar ADVANCES the same factory to the next level (bigger
// target + a new deposit). We build the level-0 factory, tick until it advances, and confirm a
// mid-game save round-trips (occupancy rebuilt) and the resumed game still advances.
import { describe, it, expect } from 'vitest';
import { newGame } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { LEVELS } from './content/levels';
import { step } from './sim/tick';
import { paintBeltLine, placeMiner, placeOperator } from './input/place';
import { buildingAt } from './sim/buildings';
import { nodeAt } from './sim/grid';
import type { GameState } from './sim/grid';
import { serialize, deserialize } from './sim/save';

// Place the two miners + operator, then route belts to the target (verified vs. port geometry).
// This factory makes 12 (=7+5): it can complete level 0 and advance once to level 1.
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

function runUntilLevel(s: GameState, level: number, maxTicks = 2000): number {
  for (let i = 0; i < maxTicks; i++) {
    if (s.levelIndex >= level) return i;
    step(s);
  }
  return -1;
}

describe('e2e: beltmatic puzzle loop', () => {
  it('authors level-0 deposits + a target; the machines are player-placed', () => {
    const s = newGame(1, mvpGenerator);
    expect(nodeAt(s, 2, 2)?.value).toBe(7n);
    expect(nodeAt(s, 2, 8)?.value).toBe(5n);
    expect(buildingAt(s, 2, 2)).toBeUndefined(); // no miner until the player places one
    expect(buildingAt(s, 8, 5)).toBeUndefined(); // no operator yet
    const t = buildingAt(s, 13, 5);
    expect(t?.type).toBe('target');
    expect((t as any).target).toBe(LEVELS[0].target);
    expect((t as any).required).toBe(LEVELS[0].required);
    expect(s.levelIndex).toBe(0);
  });

  it('places miners + operator, routes belts, and advances to the next level after the required count', () => {
    const s = newGame(1, mvpGenerator);
    build(s);
    expect(buildingAt(s, 2, 2)?.type).toBe('miner');
    expect((buildingAt(s, 2, 2) as any).value).toBe(7n);
    expect(buildingAt(s, 8, 5)?.type).toBe('operator');

    const ticks = runUntilLevel(s, 1);
    expect(ticks).toBeGreaterThan(0);
    expect(s.levelIndex).toBe(1);
    expect(s.status).toBe('playing');   // advanced, not won (this is not the final level)
    expect(s.delivered).toBe(0);        // bar reset for the new level
    expect(s.misses).toBe(0);           // every level-0 delivery was a correct 12

    const hub = buildingAt(s, 13, 5) as any;
    expect(hub.target).toBe(LEVELS[1].target);     // goal advanced (12 -> 20)
    expect(hub.required).toBe(LEVELS[1].required);
    // a new number deposit was granted for level 1
    const values = [...s.nodes.values()].map((n) => n.value);
    expect(values).toContain(LEVELS[1].grantNodes[0].value);
  });

  it('resumes from a mid-game save and still advances', () => {
    const s = newGame(42, mvpGenerator);
    build(s);
    for (let i = 0; i < 12; i++) step(s); // mid-flight, still on level 0
    expect(s.status).toBe('playing');
    expect(s.items.length).toBeGreaterThan(0);

    const r = deserialize(serialize(s));
    expect(r.buildings instanceof Map).toBe(true);
    expect(buildingAt(r, 8, 5)?.type).toBe('operator'); // occupancy rebuilt after load
    expect(buildingAt(r, 2, 2)?.type).toBe('miner');
    expect(r.tick).toBe(s.tick);
    expect(r.levelIndex).toBe(s.levelIndex);           // progress preserved across the save

    expect(runUntilLevel(r, 1)).toBeGreaterThanOrEqual(0);
    expect(r.levelIndex).toBe(1);
  });
});
