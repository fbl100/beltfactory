// Cross-module integration test for the core game loop (sim + input + content).
// CLAUDE.md asks for tests of tricky simulation logic (belt movement, operator
// resolution) rather than only eyeballing the browser. This builds the authored
// puzzle, routes the 7 and 5 extractors through the + operator into the target-12
// sink by placing belts, ticks the sim to a win, and confirms a mid-game save
// round-trips and the resumed game still reaches the win.
import { describe, it, expect } from 'vitest';
import { newGame } from './sim/world';
import { mvpGenerator, TARGET } from './content/worldgen';
import { step } from './sim/tick';
import { placeBelt } from './input/place';
import { cellAt } from './sim/grid';
import type { GameState } from './sim/grid';
import { serialize, deserialize } from './sim/save';

// Wire the authored puzzle: 7@(1,3) and 5@(1,9) -> +@(8,6) -> sink@(13,6).
function wirePuzzle(s: GameState): void {
  // 7-line: emitted to (2,3); run right to (6,3), down the x=7 column, into the operator.
  for (let x = 2; x <= 6; x++) placeBelt(s, x, 3, 'right');
  placeBelt(s, 7, 3, 'down'); placeBelt(s, 7, 4, 'down'); placeBelt(s, 7, 5, 'down');
  placeBelt(s, 7, 6, 'right'); // merge cell -> feeds operator at (8,6)
  // 5-line: emitted to (2,9); run right to (6,9), up the x=7 column into the same merge cell.
  for (let x = 2; x <= 6; x++) placeBelt(s, x, 9, 'right');
  placeBelt(s, 7, 9, 'up'); placeBelt(s, 7, 8, 'up'); placeBelt(s, 7, 7, 'up');
  // operator output (dir right) -> (9,6); run right into the sink at (13,6).
  for (let x = 9; x <= 12; x++) placeBelt(s, x, 6, 'right');
}

function runToWin(s: GameState, maxTicks = 800): number {
  for (let i = 0; i < maxTicks; i++) {
    if (s.status === 'won') return i;
    step(s);
  }
  return -1;
}

describe('e2e: full puzzle loop', () => {
  it('has the authored origin puzzle', () => {
    const s = newGame(1, mvpGenerator);
    expect(cellAt(s, 1, 3)).toMatchObject({ type: 'extractor', value: 7n });
    expect(cellAt(s, 1, 9)).toMatchObject({ type: 'extractor', value: 5n });
    expect(cellAt(s, 8, 6)).toMatchObject({ type: 'operator', op: 'add' });
    expect(cellAt(s, 13, 6)).toMatchObject({ type: 'sink', target: TARGET });
  });

  it('routes 7 and 5 through + into the sink and wins', () => {
    const s = newGame(1, mvpGenerator);
    wirePuzzle(s);
    const ticks = runToWin(s);
    expect(ticks).toBeGreaterThan(0);
    expect(s.status).toBe('won');
  });

  it('resumes from a mid-game save and still reaches the win', () => {
    const s = newGame(42, mvpGenerator);
    wirePuzzle(s);
    // First extractor emit is at tick 8 and the earliest possible win is ~tick 22,
    // so 10 ticks is safely mid-game: items in flight, nothing won yet.
    for (let i = 0; i < 10; i++) step(s);
    expect(s.status).toBe('playing');
    expect(s.items.length).toBeGreaterThan(0); // items really are in flight

    const restored = deserialize(serialize(s));
    // structural integrity of the resume
    expect(restored.cells instanceof Map).toBe(true);
    expect(restored.loadedChunks instanceof Set).toBe(true);
    expect(cellAt(restored, 8, 6)).toMatchObject({ type: 'operator' });
    expect(restored.tick).toBe(s.tick);

    const ticks = runToWin(restored);
    expect(ticks).toBeGreaterThanOrEqual(0);
    expect(restored.status).toBe('won');
  });
});
