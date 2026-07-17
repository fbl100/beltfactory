import type { GameState } from './grid';
import { cellKey } from './grid';
import type { Building } from './buildings';
import { isBlocked } from './buildings';
import { levelAt } from '../content/levels';
import type { GrantNode } from '../content/levels';

// Progression is pure sim state: levelAt(state.levelIndex, state.seed) is the single source of truth
// for the current goal (authored for the campaign, deterministically generated in endless mode), and
// the target building's target/required are kept in sync with it. No rendering deps. Deterministic.

export function targetHub(state: GameState): Building | undefined {
  for (const b of state.buildings.values()) if (b.type === 'target') return b;
  return undefined;
}

// A delivered value that was a valid target on an EARLIER level is stale leftover output from
// the pre-advance factory (e.g. still making 12 after the goal became 20) — not a mistake, so
// it shouldn't trip the "Not yet" feedback. A genuinely wrong number still counts as a miss.
// Only a recent window of past levels matters (older leftovers have long since drained).
export function isStaleTargetValue(state: GameState, value: bigint): boolean {
  const idx = Math.max(0, Math.trunc(state.levelIndex));
  for (let i = Math.max(0, idx - 15); i < idx; i++) if (levelAt(i, state.seed).target === value) return true;
  return false;
}

// Point the target hub at the current level's goal. levelAt is authored for the campaign and
// deterministically generated in endless mode — NO upper clamp, so levels grow without bound.
export function syncTargetToLevel(state: GameState): Building | undefined {
  if (!Number.isFinite(state.levelIndex) || state.levelIndex < 0) state.levelIndex = 0;
  state.levelIndex = Math.trunc(state.levelIndex);
  const lvl = levelAt(state.levelIndex, state.seed);
  const hub = targetHub(state);
  if (hub && hub.type === 'target') { hub.target = lvl.target; hub.required = lvl.required; }
  return hub;
}

// Make a loaded/migrated save internally consistent. Re-derive the hub goal from levelAt (which
// reproduces the same generated target given seed + index). Endless mode never "wins", so an old
// save stuck at 'won' rolls back into play at its level (its built factory is kept). A save carrying
// more deliveries than the level needs snaps back to a clean 0.
export function reconcileLevel(state: GameState): void {
  if (typeof state.delivered !== 'number' || state.delivered < 0) state.delivered = 0;
  const hub = syncTargetToLevel(state); // re-points the hub at levelAt(levelIndex, seed)
  if (state.status === 'won') state.status = 'playing';
  // A migrated/edited save can carry a full-or-over bar; snap it to a clean start so it doesn't
  // instant-advance on the first tick (checkLevel advances at >=).
  if (hub && hub.type === 'target' && state.delivered >= hub.required) state.delivered = 0;
}

// Called once per tick (AFTER move() settles) when the delivery bar is full. Advances the SAME
// factory to the next level — bumps the goal, resets the count, drops any new deposit. Endless:
// there is always a next level (levelAt generates one), so the game never "wins", it just keeps
// going. Kept out of the move loop so the target value stays stable for the whole tick.
export function advanceLevel(state: GameState, hub: Building): void {
  if (hub.type !== 'target') return;
  state.levelIndex++;
  const next = levelAt(state.levelIndex, state.seed);
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
