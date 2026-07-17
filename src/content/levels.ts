// Data-driven progression — the "Prime Foundry". Deposits are PRIME numbers, and every target
// is a composite you BUILD by multiplying them: a factor tree made of conveyor belts. This makes
// multiplication finally essential — 15 = 3×5 is one machine, while adding your way there from
// {3,5} needs several adders, and the gap explodes as targets grow (210 = 2×3×5×7 is three ×
// machines; the additive route is dozens of adders). Addition is always still possible, so she
// can never get stuck. This is the surface we retune most — edit targets / required / deposits.
//
// The ladder: 6=2×3 (intro) → 15=3×5 → 35=5×7 (semiprimes; × starts beating +) → 45=3×3×5
// (reuse the 3 — the wide miner feeds both inputs of one ×) → 105=3×5×7 (chain two ×) →
// 210=2×3×5×7 (the primorial finale, all four primes). Targets are mostly odd/factor-rich so a
// belt of doubled 2s can't shortcut them.
//
// grantNodes are CUMULATIVE: each level's deposits are added to the world when that level begins;
// every earlier deposit stays. LEVELS[0].grantNodes are the starting deposits. Later levels grant
// no new prime — the challenge is the bigger target and the longer × chain, using primes on hand.
//
// ops lists the operator types the player may build. × is available from the start (it's the
// point); the last level unlocks the full toolkit to play with. Keep each level's ops a superset
// of the previous, with 'add' always present.

import type { OpId } from './operations';

export interface GrantNode { x: number; y: number; value: bigint }

export interface Level {
  target: bigint;          // the number to produce this level
  required: number;        // correct deliveries to complete the level
  grantNodes: GrantNode[]; // prime deposits that appear when this level begins
  ops: OpId[];             // operator types the player may build on this level
}

// Deposits sit below the origin puzzle's build corridor (hub at y=4..6), spaced so each 3x3 miner
// footprint is disjoint. If a deposit's spot is later buried under the player's factory,
// sim/progression relocates it to clear ground.
const AM: OpId[] = ['add', 'multiply'];
export const LEVELS: Level[] = [
  { target: 6n,   required: 8, grantNodes: [{ x: 2, y: 2, value: 2n }, { x: 2, y: 8, value: 3n }], ops: AM }, // 2 × 3 (intro)
  { target: 15n,  required: 8, grantNodes: [{ x: 6, y: 12, value: 5n }],  ops: AM },                          // 3 × 5   (new prime 5)
  { target: 35n,  required: 8, grantNodes: [{ x: 10, y: 12, value: 7n }], ops: AM },                          // 5 × 7   (new prime 7)
  { target: 45n,  required: 8, grantNodes: [], ops: AM },                                                     // 3 × 3 × 5 (reuse the 3)
  { target: 105n, required: 8, grantNodes: [], ops: AM },                                                     // 3 × 5 × 7 (chain two ×)
  { target: 210n, required: 8, grantNodes: [], ops: ['add', 'multiply', 'subtract', 'divide'] },              // 2 × 3 × 5 × 7 (primorial finale)
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
