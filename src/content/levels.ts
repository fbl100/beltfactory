// Data-driven progression: an authored "Prime Foundry" campaign (levels 0–5), then an ENDLESS mode
// that keeps generating goals forever. Deposits are PRIME numbers; targets are numbers you BUILD by
// combining them, so multiplication stays the heart of the game.
//
// Campaign ladder (deposits spread AROUND the hub at center (13,5) so belts arrive from multiple
// sides and the middle stays open to build in — 2/3 on the left, 5/7 on the right):
//   6  = 2×3            (intro — one × machine)
//   12 = 2×2×3          (reuse the 2)
//   21 = 2×3×3 + 3      (× and + together)
//   30 = 2×3×5          (5 appears, right side)
//   42 = 2×3×7          (7 appears, right side)
//   210 = 2×3×5×7       (the primorial — clearing it flips into endless mode)
//
// Endless mode (index ≥ ENDLESS_START): deposits stay the four single-digit primes {2,3,5,7} (all
// already revealed by the campaign). Each level generates a target that is provably buildable from
// those primes within a small machine budget — a mix of composites (a clean × route) and primes
// (which can't be reached by ×, so they nudge toward + / −). The first EASE_LEVELS stay 2-digit
// (≤ 99) to ease her in; after that magnitude ramps up toward the 999 ceiling, and prime-chance
// climbs too. A few EXTRA copies of {2,3,5,7} drip in farther out over time (capped) so
// a growing factory has fresh, well-placed sources instead of re-congesting the origin. ÷ is always
// available as a tool but goals are never built around it (dividing to a target is more work than
// building it). ops are ALL_OPS at every level — the full toolkit is open from the start.

import type { OpId } from './operations';
import { ALL_OPS } from './operations';

export interface GrantNode { x: number; y: number; value: bigint }

export interface Level {
  target: bigint;          // the number to produce this level
  required: number;        // correct deliveries to complete the level
  grantNodes: GrantNode[]; // prime deposits that appear when this level begins (cumulative)
  ops: OpId[];             // operator types the player may build (ALL_OPS everywhere now)
}

// ---- the authored campaign (levels 0..ENDLESS_START-1) ----
export const LEVELS: Level[] = [
  { target: 6n,   required: 8, grantNodes: [{ x: 2, y: 2, value: 2n }, { x: 2, y: 12, value: 3n }], ops: ALL_OPS }, // 2 × 3
  { target: 12n,  required: 8, grantNodes: [], ops: ALL_OPS },                                                      // 2 × 2 × 3 (reuse the 2)
  { target: 21n,  required: 8, grantNodes: [], ops: ALL_OPS },                                                      // 2 × 3 × 3 + 3 (× and +)
  { target: 30n,  required: 8, grantNodes: [{ x: 20, y: 2,  value: 5n }], ops: ALL_OPS },                           // 2 × 3 × 5 (5, right of the hub)
  { target: 42n,  required: 8, grantNodes: [{ x: 20, y: 12, value: 7n }], ops: ALL_OPS },                           // 2 × 3 × 7 (7, right of the hub)
  { target: 210n, required: 8, grantNodes: [], ops: ALL_OPS },                                                      // 2 × 3 × 5 × 7 (campaign finale)
];

// Where endless mode begins (the first generated level index).
export const ENDLESS_START = LEVELS.length;

// ---- endless-mode tuning (all editable data) ----
const DEPOSIT_VALUES = [2, 3, 5, 7]; // the fixed prime deposit VALUES; endless "drips" are extra copies of these
const GEN_CAP = 999;                 // hard ceiling on targets (and on solution intermediates)
const GEN_BUDGET = 4;                // expression depth for the "short solution exists" reachability guarantee
const EASE_LEVELS = 10;              // first N endless levels stay 2-digit (10–99) to ease her in
const DRIP_EVERY = 4;                // grant one extra deposit copy every Nth endless level...
const MAX_DRIPS = 6;                 // ...capped, so the map never re-clutters

// The [lo,hi] target range for an endless level. The first EASE_LEVELS stay 2-digit (≤ 99); after
// that it ramps into 3-digit territory, climbing toward the 999 ceiling.
function targetWindow(endlessN: number): { lo: number; hi: number } {
  if (endlessN < EASE_LEVELS) return { lo: 10, hi: Math.min(35 + endlessN * 7, 99) };
  const n = endlessN - EASE_LEVELS; // levels since the ease-in ended
  return { lo: Math.min(40 + n * 12, GEN_CAP - 100), hi: Math.min(120 + n * 45, GEN_CAP) };
}

// The operator types the player may build. All four are available at every level now (the ladder
// still *wants* × but the full toolkit is open); index/seed are irrelevant — kept for the signature.
export function opsForLevel(_index: number): OpId[] {
  return ALL_OPS;
}

// Clamp an arbitrary index into the AUTHORED campaign range. Still used for campaign-relative lookups
// (e.g. opsForLevel tests); endless-aware code uses levelAt, which does NOT clamp the upper bound.
export function clampLevelIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), LEVELS.length - 1));
}

// THE source of truth for any level index: authored campaign for 0..ENDLESS_START-1, deterministically
// generated (from seed + index) beyond. Deterministic so a mid-endless reload reproduces the same goal.
export function levelAt(index: number, seed: number): Level {
  const i = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  if (i < LEVELS.length) return LEVELS[i];
  return generatedLevel(i, seed >>> 0);
}

function generatedLevel(index: number, seed: number): Level {
  const endlessN = index - ENDLESS_START; // 0, 1, 2, ...
  const rng = mulberry32(hash2(seed, index));
  const reach = endlessReachable(); // values buildable from {2,3,5,7} within GEN_BUDGET machines, ≤ 999

  // Difficulty window grows with the level: 2-digit while easing in, then up toward 999.
  const { lo, hi } = targetWindow(endlessN);
  let pool = [...reach].filter((v) => v >= Math.max(8, lo) && v <= hi);
  if (pool.length === 0) pool = [...reach].filter((v) => v >= 8 && v <= GEN_CAP); // safety net

  // Sometimes deliberately pick a PRIME target (no × route → forces + / −); otherwise a composite.
  const primes = pool.filter(isPrimeNum);
  const composites = pool.filter((v) => !isPrimeNum(v));
  const wantPrime = rng() < primeChance(endlessN);
  const chosen = wantPrime && primes.length ? primes : composites.length ? composites : pool;
  const target = BigInt(chosen[Math.floor(rng() * chosen.length)]);

  return { target, required: 8, grantNodes: dripDeposit(index), ops: ALL_OPS };
}

// Prime-target frequency ramps from ~25% up to a 50% ceiling as the player advances.
function primeChance(endlessN: number): number {
  return Math.min(0.25 + endlessN * 0.02, 0.5);
}

// Every DRIP_EVERY endless levels, drop one more copy of a small prime farther out (cycling the
// primes, capped at MAX_DRIPS). Placement is an expanding golden-angle spiral around the hub so the
// copies fan out without clustering; grantNode() relocates if a spot is buried under the factory.
function dripDeposit(index: number): GrantNode[] {
  const endlessN = index - ENDLESS_START;
  if (endlessN < 0 || endlessN % DRIP_EVERY !== 0) return [];
  const ordinal = endlessN / DRIP_EVERY; // 0, 1, 2, ...
  if (ordinal >= MAX_DRIPS) return [];
  const value = BigInt(DEPOSIT_VALUES[ordinal % DEPOSIT_VALUES.length]);
  const spot = ringSpot(ordinal);
  return [{ x: spot.x, y: spot.y, value }];
}

function ringSpot(ordinal: number): { x: number; y: number } {
  const r = 16 + ordinal * 6;
  const ang = ordinal * 2.399963; // ~137.5° golden angle → even spread, no two on the same ray
  return { x: Math.round(13 + r * Math.cos(ang)), y: Math.round(5 + r * Math.sin(ang)) };
}

// ---- reachability (the guarantee that every generated target has a short solution) ----

function isPrimeNum(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

// Order-independent op semantics on Numbers (mirror of content/operations, safe since targets ≤ 999).
function applyOpNum(op: OpId, a: number, b: number): number {
  if (op === 'add') return a + b;
  if (op === 'subtract') return Math.abs(a - b);
  if (op === 'multiply') return a * b;
  const hi = Math.max(a, b), lo = Math.min(a, b); // divide: whole part, ÷0 → 0
  return lo === 0 ? 0 : Math.floor(hi / lo);
}

// The set of values reachable from {2,3,5,7} within GEN_BUDGET combine-rounds, capped at 999.
// Fixed (no seed), so compute it once and memoize.
let cachedReach: Set<number> | null = null;
function endlessReachable(): Set<number> {
  if (!cachedReach) cachedReach = reachableValues(DEPOSIT_VALUES, ALL_OPS, GEN_BUDGET, GEN_CAP);
  return cachedReach;
}
export function reachableValues(values: number[], ops: OpId[], budget: number, cap: number): Set<number> {
  let reach = new Set<number>(values);
  for (let step = 0; step < budget; step++) {
    const arr = [...reach];
    const next = new Set(reach);
    for (const a of arr) for (const b of arr) for (const op of ops) {
      const v = applyOpNum(op, a, b);
      if (v > 0 && v <= cap) next.add(v);
    }
    if (next.size === reach.size) break; // saturated
    reach = next;
  }
  return reach;
}

// ---- deterministic PRNG (seeded by the game seed + level index) ----

function hash2(a: number, b: number): number {
  let h = ((a >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
