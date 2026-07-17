// Data-driven progression — the "Prime Foundry". Deposits are PRIME numbers, and every target is
// a composite you BUILD by multiplying them (with the odd + for a remainder): a factor tree made
// of conveyor belts. This makes multiplication finally essential — 12 = 2×2×3 is two tidy
// machines, while adding your way there needs a pile of adders, and the gap explodes as targets
// grow (210 = 2×3×5×7 is three × machines; the additive route is dozens of adders). Addition is
// always still possible, so she can never get stuck. This is the surface we retune most.
//
// The ladder stays on {2,3} for a while so she gets fluent before new numbers arrive:
//   6  = 2×3            (intro — one × machine)
//   12 = 2×2×3          (reuse the 2 — feed the 2-miner into both inputs of a ×)
//   21 = 2×3×3 + 3      (reuse the 3, then add a remainder — × and + together)
// THEN new primes arrive, one at a time (not every level):
//   30 = 2×3×5          (+ prime 5)
//   42 = 2×3×7          (+ prime 7)
//   210 = 2×3×5×7       (the primorial finale — multiply all four)
//
// grantNodes are CUMULATIVE: a level's deposits appear when it begins; earlier ones stay. Most
// levels grant nothing (the challenge is the bigger target / longer chain). Deposits are spread
// out — 2 top-left, 3 bottom-left (10 apart), 5 and 7 across the bottom — to leave the middle
// open for building and keep belts from turning into spaghetti.
//
// ops: × is available from the start (it's the point); the finale unlocks the full toolkit. Keep
// each level's ops a superset of the previous, with 'add' always present.

import type { OpId } from './operations';

export interface GrantNode { x: number; y: number; value: bigint }

export interface Level {
  target: bigint;          // the number to produce this level
  required: number;        // correct deliveries to complete the level
  grantNodes: GrantNode[]; // prime deposits that appear when this level begins
  ops: OpId[];             // operator types the player may build on this level
}

const AM: OpId[] = ['add', 'multiply'];
export const LEVELS: Level[] = [
  { target: 6n,   required: 8, grantNodes: [{ x: 2, y: 2, value: 2n }, { x: 2, y: 12, value: 3n }], ops: AM }, // 2 × 3
  { target: 12n,  required: 8, grantNodes: [], ops: AM },                                                      // 2 × 2 × 3 (reuse the 2)
  { target: 21n,  required: 8, grantNodes: [], ops: AM },                                                      // 2 × 3 × 3 + 3 (× and +)
  { target: 30n,  required: 8, grantNodes: [{ x: 8, y: 13, value: 5n }],  ops: AM },                           // 2 × 3 × 5 (new prime 5)
  { target: 42n,  required: 8, grantNodes: [{ x: 13, y: 13, value: 7n }], ops: AM },                           // 2 × 3 × 7 (new prime 7)
  { target: 210n, required: 8, grantNodes: [], ops: ['add', 'multiply', 'subtract', 'divide'] },               // 2 × 3 × 5 × 7 (finale)
];

// The operator types the player may build at a given (clamped) level index.
export function opsForLevel(index: number): OpId[] {
  return LEVELS[clampLevelIndex(index)].ops;
}

// Clamp an arbitrary (possibly out-of-range / migrated) index into the valid range.
export function clampLevelIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), LEVELS.length - 1));
}
