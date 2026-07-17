import type { GameState } from './grid';
import { cellKey } from './grid';
import type { Building } from './buildings';
import { isBlocked } from './buildings';
import { LEVELS, clampLevelIndex } from '../content/levels';
import type { GrantNode } from '../content/levels';

// Progression is pure sim state: LEVELS[state.levelIndex] is the single source of truth for
// the current goal, and the target building's target/required are kept in sync with it. No
// rendering deps. Deterministic given the same inputs.

export function targetHub(state: GameState): Building | undefined {
  for (const b of state.buildings.values()) if (b.type === 'target') return b;
  return undefined;
}

// A delivered value that was a valid target on an EARLIER level is stale leftover output from
// the pre-advance factory (e.g. still making 12 after the goal became 20) — not a mistake, so
// it shouldn't trip the "Not yet" feedback. A genuinely wrong number still counts as a miss.
export function isStaleTargetValue(state: GameState, value: bigint): boolean {
  const upto = Math.min(state.levelIndex, LEVELS.length);
  for (let i = 0; i < upto; i++) if (LEVELS[i].target === value) return true;
  return false;
}

// Point the target hub at LEVELS[levelIndex] (clamping the index first). Returns the hub.
export function syncTargetToLevel(state: GameState): Building | undefined {
  state.levelIndex = clampLevelIndex(state.levelIndex);
  const lvl = LEVELS[state.levelIndex];
  const hub = targetHub(state);
  if (hub && hub.type === 'target') { hub.target = lvl.target; hub.required = lvl.required; }
  return hub;
}

// Make a loaded/migrated save internally consistent with the current LEVELS data. LEVELS is
// the source of truth: clamp the index, re-derive the hub goal, and enforce the invariant
// that 'won' is only valid once the FINAL level is cleared — an older/pre-progression save
// that was 'won' at an earlier level rolls into that level as playing (the built factory is
// kept). A save carrying more deliveries than the new level needs snaps back to a clean 0.
export function reconcileLevel(state: GameState): void {
  if (typeof state.delivered !== 'number' || state.delivered < 0) state.delivered = 0;
  const hub = syncTargetToLevel(state); // clamps levelIndex and re-points the hub at LEVELS[levelIndex]
  const isFinal = state.levelIndex >= LEVELS.length - 1;
  if (state.status === 'won' && !isFinal) { state.status = 'playing'; state.delivered = 0; }
  // A migrated/edited save can carry a full-or-over bar for the new (smaller) level; snap it to a
  // clean start so it doesn't instant-advance on the first tick (checkLevel advances at >=).
  if (hub && hub.type === 'target' && state.status === 'playing' && state.delivered >= hub.required) {
    state.delivered = 0;
  }
}

// Called once per tick (AFTER move() settles) when the delivery bar is full. Advances the
// SAME factory to the next level — bumps the goal, resets the count, drops the next number
// deposit — or, on the final level, wins the whole game (idempotent). Kept out of the move
// loop so the target value stays stable for the whole tick (no mid-pass mis-crediting).
export function advanceLevel(state: GameState, hub: Building): void {
  if (state.status === 'won' || hub.type !== 'target') return;
  const next = LEVELS[state.levelIndex + 1];
  if (!next) {                          // final level cleared -> the whole game is won
    state.delivered = hub.required;     // hold the bar at 100%
    state.status = 'won';
    return;
  }
  state.levelIndex++;
  hub.target = next.target;
  hub.required = next.required;
  state.delivered = 0;
  for (const n of next.grantNodes) grantNode(state, n);
}

// Drop a deposit into the world. Nodes never block, but a miner needs a clear 3x3 centered
// on the node, so if the authored spot is buried under the player's factory we relocate the
// deposit to the nearest cell whose footprint is clear and node-free — the new number is
// then always minable. If somehow nothing is clear, fall back to the authored cell.
function grantNode(state: GameState, n: GrantNode): void {
  const spot = clearCenterNear(state, n.x, n.y);
  state.nodes.set(cellKey(spot.x, spot.y), { x: spot.x, y: spot.y, value: n.value });
}

// A good miner center: no node already there, and its whole 3x3 footprint is unblocked.
function isGoodCenter(state: GameState, cx: number, cy: number): boolean {
  if (state.nodes.has(cellKey(cx, cy))) return false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (isBlocked(state, cx + dx, cy + dy)) return false;
  return true;
}

// Deterministic outward (Chebyshev-ring) search for a good miner center near (cx,cy).
function clearCenterNear(state: GameState, cx: number, cy: number): { x: number; y: number } {
  if (isGoodCenter(state, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= 24; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // only the ring at radius r
        const x = cx + dx, y = cy + dy;
        if (isGoodCenter(state, x, y)) return { x, y };
      }
  }
  return { x: cx, y: cy }; // extremely unlikely; keep the deposit rather than drop it
}
