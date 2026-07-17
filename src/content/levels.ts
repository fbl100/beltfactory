// Data-driven progression: an ordered ladder of targets. Filling a level's delivery
// bar advances the SAME factory to the next (bigger, still-reachable) target and drops
// a new number deposit into the world. This is the surface we retune most for her actual
// pace — edit targets / required / grantNodes freely.
//
// Design (a "mix" curve): levels 1-3 are GENTLE — each obvious solution is "add the newly
// granted number to what you already make" (12=7+5, 20=12+8, 30=20+10). Levels 4-5 are
// BOLD — "double the newly granted number" (50=25+25, 100=50+50), a natural fit for the
// wide miner, which can feed both inputs of a single adder from its own two output belts.
//
// grantNodes are CUMULATIVE: each level's deposits are added to the world when that level
// begins; every earlier deposit stays. LEVELS[0].grantNodes are the starting deposits.

export interface GrantNode { x: number; y: number; value: bigint }

export interface Level {
  target: bigint;          // the number to produce this level
  required: number;        // correct deliveries to complete the level
  grantNodes: GrantNode[]; // deposits that appear when this level begins
}

// Deposits sit below the origin puzzle's build corridor (start nodes at y=2/y=8, hub at
// y=4..6), spaced so each 3x3 miner footprint is disjoint. If a deposit's spot is later
// buried under the player's factory, sim/progression relocates it to clear ground.
export const LEVELS: Level[] = [
  { target: 12n,  required: 10, grantNodes: [{ x: 2, y: 2, value: 7n }, { x: 2, y: 8, value: 5n }] }, // 7 + 5
  { target: 20n,  required: 10, grantNodes: [{ x: 6, y: 12, value: 8n }] },   // 12 + 8   (gentle)
  { target: 30n,  required: 10, grantNodes: [{ x: 10, y: 12, value: 10n }] }, // 20 + 10  (gentle)
  { target: 50n,  required: 10, grantNodes: [{ x: 2, y: 12, value: 25n }] },  // 25 + 25  (bold: double it)
  { target: 100n, required: 10, grantNodes: [{ x: 14, y: 12, value: 50n }] }, // 50 + 50  (bold finale)
];

// Clamp an arbitrary (possibly out-of-range / migrated) index into the valid range.
export function clampLevelIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), LEVELS.length - 1));
}
