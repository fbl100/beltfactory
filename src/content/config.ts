// Tunable balance constants (data-driven — edit freely to retune pacing).
// Rates assume the sim runs at 2.5 ticks/s (150 ticks/min); see sim/tick.ts.
// The per-level targets / delivery counts / number deposits live in content/levels.ts.

// Throughput. An adder is 2-in-1-out, so its OUTPUT rate equals its PER-INPUT rate,
// and total input = 2 x output. Balanced set: operator 30/min out (= 30/min from each
// of its 2 inputs = 60/min total), fed by miner belts at 30/min each — a clean 1 belt : 1 input.
export const MINER_EVERY_TICKS = 5;     // 1 emit / 2s per output belt => 30/min per belt
export const OPERATOR_EVERY_TICKS = 5;  // 1 output / 2s => 30/min out (consumes 30/min from each input)

// Underground belt: the exit may sit up to this many cells ahead of the entrance,
// so up to (TUNNEL_REACH - 1) = 4 belts can pass overhead.
export const TUNNEL_REACH = 5;

// ---- golf scoring (endless "puzzle" mode) ----
// Each endless puzzle has a `par` = the fewest operator machines needed to build its target from
// scratch (see content/levels.ts). She earns stars by how close her machine count gets to par:
//   3 = at or UNDER par (a clever, tight solution)   2 = within a little slack   1 = solved at all.
// She always gets at least 1 star for finishing — this is encouragement, never punishment.
// `used` counts operator + squarer machines she built for this puzzle (a fresh board each time).
export function starsFor(used: number, par: number): 1 | 2 | 3 {
  if (used <= par) return 3;
  if (used <= par + Math.max(1, Math.ceil(par / 2))) return 2;
  return 1;
}
