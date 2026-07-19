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

// Difficulty mode. 'normal' is the full ×-based Prime Foundry campaign + endless. 'easy' (for a
// ~6-year-old) is addition & subtraction only, tiny numbers, deposits {1,2,3}. Easy reuses the ENTIRE
// endless golf engine (par, stars, fresh boards, the ⭐ screen): an easy game simply STARTS in the
// endless range (levelIndex >= ENDLESS_START, see startIndexForMode) with the gentler profile below,
// so every "is this a scored puzzle" check (index >= ENDLESS_START) keeps working unchanged.
export type Mode = 'normal' | 'easy';

export interface Level {
  target: bigint;          // the number to produce this level
  required: number;        // correct deliveries to complete the level
  grantNodes: GrantNode[]; // prime deposits that appear when this level begins (cumulative)
  ops: OpId[];             // operator types the player may build (ALL_OPS everywhere now)
  par: number;             // golf par: fewest operator machines to build `target` from the sources
}

// ---- the authored campaign (levels 0..ENDLESS_START-1) ----
// Authored pars are the fewest operator machines to build each target from the sources revealed by
// that point: 6=2×3 (1); 12=2×2×3 (2); 21 needs three combines from just {2,3} (3); 30=6×5, 42=6×7
// (2 each, reusing 6); 210=2×3×5×7 (3 multiplies). These are hand-set so the campaign's par never
// depends on the generic solver.
export const LEVELS: Level[] = [
  { target: 6n,   required: 8, grantNodes: [{ x: 2, y: 2, value: 2n }, { x: 2, y: 12, value: 3n }], ops: ALL_OPS, par: 1 }, // 2 × 3
  { target: 12n,  required: 8, grantNodes: [], ops: ALL_OPS, par: 2 },                                                      // 2 × 2 × 3 (reuse the 2)
  { target: 21n,  required: 8, grantNodes: [], ops: ALL_OPS, par: 3 },                                                      // 2 × 3 × 3 + 3 (× and +)
  { target: 30n,  required: 8, grantNodes: [{ x: 20, y: 2,  value: 5n }], ops: ALL_OPS, par: 2 },                           // 2 × 3 × 5 (5, right of the hub)
  { target: 42n,  required: 8, grantNodes: [{ x: 20, y: 12, value: 7n }], ops: ALL_OPS, par: 2 },                           // 2 × 3 × 7 (7, right of the hub)
  { target: 210n, required: 8, grantNodes: [], ops: ALL_OPS, par: 3 },                                                      // 2 × 3 × 5 × 7 (campaign finale)
];

// Where endless mode begins (the first generated level index).
export const ENDLESS_START = LEVELS.length;

// ---- endless-mode tuning (all editable data) ----
const DEPOSIT_VALUES = [2, 3, 5, 7]; // the fixed prime deposit VALUES; endless "drips" are extra copies of these
const GEN_CAP = 999;                 // hard ceiling on targets (and on solution intermediates)
const MIN_TARGET = 10;               // never a single-digit goal (keeps the numbers readable)
const STAGE_SIZE = 20;               // difficulty steps up every N endless puzzles (Angry-Birds style)
const DRIP_EVERY = 4;                // grant one extra deposit copy every Nth endless level...
const MAX_DRIPS = 6;                 // ...capped, so the map never re-clutters

// ---- EASY mode (addition & subtraction, for a ~6-year-old; all editable data) ----
// Each puzzle deals a FRESH little HAND of source numbers from a pool that widens as she levels, and
// the target is chosen so it can be built at least a couple of ways (she's never stuck). Subtraction is
// locked at first, then unlocks; afterward some boards are "take-away" shapes where − is the cheaper
// hero move (an addition route always still exists). The hand — and thus the deposits — CHANGES every
// puzzle (progression.advanceLevel swaps them). Golf/stars/fresh-board plumbing is all shared.
const EASY_HAND_SLOTS = [                 // where a hand's sources sit, spread around the hub (13,5)
  { x: 2, y: 2 }, { x: 22, y: 2 }, { x: 2, y: 12 }, { x: 22, y: 12 },
];
const EASY_CAP = 15;                      // targets stay small and readable for a 6-year-old
const EASY_MIN_TARGET = 4;                // smallest goal worth building
const EASY_REQUIRED = 5;                  // deliveries per puzzle (unchanged — variety, not fewer deliveries, is the fix)
const EASY_STAGE = 10;                    // difficulty + source pool step up every N puzzles
export const EASY_SUB_UNLOCK = 15;        // puzzle (0-based) at which the Take-Away (−) machine unlocks
export const EASY_TAKEAWAY_INTRO = 3;     // the first N puzzles AFTER the unlock are guaranteed take-away boards
const EASY_TAKEAWAY_CHANCE = 0.33;        // afterward, roughly this share of boards are take-away shapes
const EASY_FULL_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // intro take-away puzzles deal from the full pool so − can strictly beat +

// Which level index a fresh game of this mode begins at. Easy skips the (×-based) campaign entirely
// and starts straight in the endless range, so it inherits all the golf/stars/fresh-board plumbing.
export function startIndexForMode(mode: Mode): number {
  return mode === 'easy' ? ENDLESS_START : 0;
}

// The ops a given easy puzzle allows: addition always; subtraction once it has unlocked.
export function easyOpsAt(index: number): OpId[] {
  return index - ENDLESS_START >= EASY_SUB_UNLOCK ? ['add', 'subtract'] : ['add'];
}

// Staged ladder: the source POOL widens first ({1..4} → {1..9}), then par is allowed to climb; the
// target size barely moves. `handSize` grows from 3 to 4 late so there are always a few ways in.
function easyStage(index: number): { pool: number[]; handSize: number; minPar: number; maxPar: number; magCap: number } {
  const stage = Math.floor(Math.max(0, index - ENDLESS_START) / EASY_STAGE);
  // Once subtraction is in play, the pool jumps to bigger numbers so − (big minus small) is genuinely
  // useful — small numbers alone make subtraction no cheaper than addition, so take-away boards vanish.
  const poolMax = Math.min((index - ENDLESS_START >= EASY_SUB_UNLOCK ? 6 : 4) + stage, 9);
  const pool: number[] = [];
  for (let v = 1; v <= poolMax; v++) pool.push(v);
  return {
    pool,
    handSize: Math.min(stage >= 4 ? 4 : 3, EASY_HAND_SLOTS.length),
    minPar: Math.min(1 + Math.floor(stage / 3), 2),
    maxPar: Math.min(2 + Math.floor(stage / 2), 4),
    magCap: Math.min(9 + stage * 2, EASY_CAP), // targets creep up gently, topping out at EASY_CAP
  };
}

// Deal `size` distinct values from `pool` with the seeded rng (partial Fisher–Yates). ALWAYS keeps a
// small "anchor" (≤3) in the hand: without one, an all-big hand can't ADD up to a small target, which
// would strand her (violating never-stuck) — the anchor guarantees an addition route always exists.
function dealHand(pool: number[], size: number, rng: () => number): number[] {
  const a = [...pool];
  const n = Math.min(size, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const hand = a.slice(0, n);
  const smalls = pool.filter((v) => v <= 3);
  if (smalls.length && !hand.some((v) => v <= 3)) {
    const s = smalls[Math.floor(rng() * smalls.length)]; // s ∉ hand (hand had no ≤3), so still distinct
    let maxAt = 0;
    for (let i = 1; i < hand.length; i++) if (hand[i] > hand[maxAt]) maxAt = i;
    hand[maxAt] = s; // swap the biggest value out for a small anchor
  }
  return hand.sort((x, y) => x - y);
}

// How many ways `target` is an unordered sum of `hand` values (unlimited reuse) — coin-change count.
// >=2 means she has a few different ADDITION routes, so she's never stuck.
function additiveWays(hand: number[], target: number): number {
  const ways = new Array(target + 1).fill(0); ways[0] = 1;
  for (const c of hand) for (let j = c; j <= target; j++) ways[j] += ways[j - c];
  return ways[target];
}

// Fewest machines to build `target` from `values` with `ops` (undefined if unreachable ≤ EASY_CAP).
// Exported for tests to check the "take-away is strictly cheaper" property.
export function minOpsToBuild(values: number[], ops: OpId[], target: number): number | undefined {
  return minOpsTable(values, ops, EASY_CAP).get(target);
}

// Build the sorted candidate-target pool for a hand + take-away preference, with graceful relaxation.
// Returns the pool plus whether a genuine take-away target (− strictly cheaper than +) was available.
function easyTargetPool(hand: number[], ops: OpId[], st: ReturnType<typeof easyStage>, wantTakeAway: boolean): { pool: number[]; isTakeAway: boolean } {
  const fullCost = minOpsTable(hand, ops, EASY_CAP);      // par with the ops she has
  const addCost = minOpsTable(hand, ['add'], EASY_CAP);   // par using addition alone (the fallback route)
  const inBand = (v: number, cap: number): boolean => {
    const p = fullCost.get(v);
    return p !== undefined && v >= EASY_MIN_TARGET && v <= cap && p >= st.minPar && p <= st.maxPar;
  };
  // Every board must be addition-reachable (a guaranteed fallback → never stuck). A take-away board
  // additionally needs − to be strictly cheaper (its hero move + a distinct 2nd route); a plain board
  // needs >=2 addition routes so there's always "a few ways to get there".
  const ok = (v: number, cap: number): boolean => {
    if (!inBand(v, cap)) return false;
    const add = addCost.get(v);
    if (add === undefined) return false; // must be buildable by addition too
    return wantTakeAway ? fullCost.get(v)! < add : additiveWays(hand, v) >= 2;
  };
  const addReachable = (v: number) => addCost.get(v) !== undefined; // the never-stuck fallback
  const primary = valuesWhere(fullCost, (v) => ok(v, st.magCap));
  let pool = primary;
  // Relax the "few ways / take-away" rule BEFORE widening the numbers, so a thin band never leaks a
  // too-big target — small-and-solvable beats big-and-clever for a 6-year-old.
  if (pool.length === 0) pool = valuesWhere(fullCost, (v) => inBand(v, st.magCap) && addReachable(v)); // drop few-ways, keep it small
  if (pool.length === 0) pool = valuesWhere(fullCost, (v) => ok(v, EASY_CAP));                          // then allow bigger, few-ways
  if (pool.length === 0) pool = valuesWhere(fullCost, (v) => inBand(v, EASY_CAP) && addReachable(v));
  // Last resort: drop the par band too, but NEVER the addition route (she must be able to add her way
  // there) and never a trivial 0-machine source target. The anchor in dealHand guarantees one exists.
  if (pool.length === 0) pool = valuesWhere(fullCost, (v) => v >= EASY_MIN_TARGET && v <= EASY_CAP && addReachable(v) && (fullCost.get(v) ?? 0) >= 1);
  pool.sort((a, b) => a - b);
  return { pool, isTakeAway: wantTakeAway && primary.length > 0 };
}

// An easy puzzle: a fresh hand of sources and a target buildable a few ways (and, on take-away boards,
// cheapest via −). PURE in (index, seed) — no cross-index look-back — so reconcile/display always
// reproduce the same puzzle. Repetition is killed by the fresh HAND: "make 8" from {2,3,4} plays
// nothing like "make 8" from {1,3,4}, so the same goal number never means the same puzzle.
function easyLevel(index: number, seed: number): Level {
  const rng = mulberry32(hash2((seed >>> 0) ^ 0x0ea51357, index)); // distinct stream from normal mode
  const st = easyStage(index);
  const ops = easyOpsAt(index);
  const easyN = index - ENDLESS_START;
  // The first few puzzles AFTER the − unlock are guaranteed take-away boards — a tutorial for the new
  // machine — dealt from the full {1..9} pool so − can strictly beat +. Bounded re-deal finds a hand
  // that actually supports one; determinism holds (rng is consumed in a fixed order).
  const forceTakeAway = ops.includes('subtract') && easyN >= EASY_SUB_UNLOCK && easyN < EASY_SUB_UNLOCK + EASY_TAKEAWAY_INTRO;

  let hand: number[] = [];
  let res: { pool: number[]; isTakeAway: boolean } = { pool: [], isTakeAway: false };
  const tries = forceTakeAway ? 24 : 1;
  for (let t = 0; t < tries; t++) {
    hand = dealHand(forceTakeAway ? EASY_FULL_POOL : st.pool, st.handSize, rng);
    const roll = rng(); // consumed every try so rng flow is fixed whether or not we force take-away
    const wantTakeAway = forceTakeAway || (ops.includes('subtract') && roll < EASY_TAKEAWAY_CHANCE);
    res = easyTargetPool(hand, ops, st, wantTakeAway);
    if (!forceTakeAway || res.isTakeAway) break; // random: first deal; forced: first deal that IS a take-away
  }

  const fullCost = minOpsTable(hand, ops, EASY_CAP);
  const target = res.pool[Math.floor(rng() * res.pool.length)];
  return {
    target: BigInt(target), required: EASY_REQUIRED, ops,
    grantNodes: hand.map((value, i) => ({ x: EASY_HAND_SLOTS[i].x, y: EASY_HAND_SLOTS[i].y, value: BigInt(value) })),
    par: fullCost.get(target) ?? DEFAULT_PAR,
  };
}

// Difficulty is driven by PAR (machines the target requires), not raw magnitude — a big CLEAN number
// can be easier than a small awkward one, so par is the honest knob. It steps up every STAGE_SIZE
// puzzles: the par band climbs/widens and a magnitude cap relaxes so the numbers grow too. Stage 0 is
// gentle (par 1–2, ≤60); it asymptotes to par 3–6 near the 999 ceiling. minPar floors at 3 so late
// stages still sprinkle in a few "breather" puzzles rather than being wall-to-wall par-6.
function difficultyBand(endlessN: number): { minPar: number; maxPar: number; magCap: number } {
  const stage = Math.floor(Math.max(0, endlessN) / STAGE_SIZE);
  return {
    minPar: Math.min(1 + stage, 3),
    maxPar: Math.min(2 + stage, 6),
    magCap: Math.min(60 + stage * 90, GEN_CAP),
  };
}

// The operator types the player may build. Easy mode exposes + (and − once it unlocks, per easyOpsAt);
// normal exposes all four (the ladder still *wants* × but the full toolkit is open).
export function opsForLevel(index: number, mode: Mode = 'normal'): OpId[] {
  return mode === 'easy' ? easyOpsAt(index) : ALL_OPS;
}

// Clamp an arbitrary index into the AUTHORED campaign range. Still used for campaign-relative lookups
// (e.g. opsForLevel tests); endless-aware code uses levelAt, which does NOT clamp the upper bound.
export function clampLevelIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), LEVELS.length - 1));
}

// THE source of truth for any level index: authored campaign for 0..ENDLESS_START-1, deterministically
// generated (from seed + index) beyond. Deterministic so a mid-endless reload reproduces the same goal.
export function levelAt(index: number, seed: number, mode: Mode = 'normal'): Level {
  const i = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  if (mode === 'easy') return easyLevel(i, seed >>> 0); // easy is generated at every level (no campaign)
  if (i < LEVELS.length) return LEVELS[i];
  return generatedLevel(i, seed >>> 0);
}

function generatedLevel(index: number, seed: number): Level {
  const endlessN = index - ENDLESS_START; // 0, 1, 2, ...
  const rng = mulberry32(hash2(seed, index));
  const cost = minOpsTable(DEPOSIT_VALUES, ALL_OPS, GEN_CAP); // value -> par (fewest machines to build it)
  const { minPar, maxPar, magCap } = difficultyBand(endlessN);

  // Candidate targets: reachable values whose PAR is in this stage's band and whose size is within the
  // stage's magnitude cap. Relax gracefully (drop the size cap, then the par band) if a band is thin.
  const inBand = (v: number, p: number, cap: number) => v >= MIN_TARGET && v <= cap && p >= minPar && p <= maxPar;
  let pool = valuesWhere(cost, (v, p) => inBand(v, p, magCap));
  if (pool.length === 0) pool = valuesWhere(cost, (v, p) => inBand(v, p, GEN_CAP)); // ignore the size cap
  if (pool.length === 0) pool = valuesWhere(cost, (v) => v >= MIN_TARGET);          // last resort: anything buildable
  pool.sort((a, b) => a - b); // stable order so the seeded rng pick is deterministic

  // Mix primes in (no × route → they force + / −); their share ramps toward ~50% over a long run.
  const primes = pool.filter(isPrimeNum);
  const composites = pool.filter((v) => !isPrimeNum(v));
  const wantPrime = rng() < primeChance(endlessN);
  const chosen = wantPrime && primes.length ? primes : composites.length ? composites : pool;
  const target = BigInt(chosen[Math.floor(rng() * chosen.length)]);

  return { target, required: 8, grantNodes: dripDeposit(index), ops: ALL_OPS, par: cost.get(Number(target)) ?? DEFAULT_PAR };
}

// Collect every value in the par/cost table matching a predicate (value, par).
function valuesWhere(cost: Map<number, number>, pred: (v: number, p: number) => boolean): number[] {
  const out: number[] = [];
  for (const [v, p] of cost) if (pred(v, p)) out.push(v);
  return out;
}

// Golf par for an endless target: the fewest operator machines to build it from the source primes.
// Deposits are the four single-digit primes in endless mode, but this reads DEPOSIT_VALUES/ALL_OPS
// as data, so generated source sets or division-first ("break down") puzzles will get a correct par
// for free later. Guaranteed reachable (the generator only picks reachable targets), so the table
// hit is expected; DEFAULT_PAR is a harmless floor for any theoretical miss.
const DEFAULT_PAR = 3;
export function parFor(target: bigint): number {
  return minOpsTable(DEPOSIT_VALUES, ALL_OPS, GEN_CAP).get(Number(target)) ?? DEFAULT_PAR;
}

// Minimum operator machines to build each value from `values`, as an expression TREE — subtrees are
// costed independently (no reuse of a shared intermediate). It searches ALL ops for the cheapest
// route (e.g. 36 = 3×(5+7) in 2, not 6×6 in 3), giving a fair, tight par. It's tree cost, not DAG
// cost, on purpose: on the rare target where splitting one belt into both inputs of an operator beats
// the independent tree, she simply comes in UNDER par — a bonus, never a penalty. Least-fixpoint
// relaxation: costs only fall and are bounded below by 0, so it converges. Memoized per (sources, ops).
const parTableCache = new Map<string, Map<number, number>>();
function minOpsTable(values: number[], ops: OpId[], cap: number): Map<number, number> {
  const key = [...values].sort((a, b) => a - b).join(',') + '|' + [...ops].sort().join(',') + '|' + cap;
  const cached = parTableCache.get(key);
  if (cached) return cached;
  const cost = new Map<number, number>();
  for (const v of values) if (v >= 1 && v <= cap) cost.set(v, 0);
  let changed = true;
  while (changed) {
    changed = false;
    const known = [...cost.keys()];
    for (const a of known) {
      const ca = cost.get(a)!;
      for (const b of known) {
        const base = ca + cost.get(b)! + 1;
        for (const op of ops) {
          const v = applyOpNum(op, a, b);
          if (v <= 0 || v > cap) continue;
          const prev = cost.get(v);
          if (prev === undefined || base < prev) { cost.set(v, base); changed = true; }
        }
      }
    }
  }
  parTableCache.set(key, cost);
  return cost;
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

// ---- number helpers (par table + target classification) ----

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
