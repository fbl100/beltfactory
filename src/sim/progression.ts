import type { GameState } from './grid';
import { cellKey } from './grid';
import type { Building, TargetBuilding } from './buildings';
import { isBlocked, countMachines } from './buildings';
import { ensureMiners, clearBuild, resetDeposits } from './world';
import { levelAt, ENDLESS_START, LEVELS } from '../content/levels';
import type { GrantNode } from '../content/levels';
import { starsFor } from '../content/config';

// Progression is pure sim state: levelAt(state.levelIndex, state.seed, state.mode) is the single source of truth
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
  for (let i = Math.max(0, idx - 15); i < idx; i++) if (levelAt(i, state.seed, state.mode).target === value) return true;
  return false;
}

// Point the target hub at the current level's goal. levelAt is authored for the campaign and
// deterministically generated in endless mode — NO upper clamp, so levels grow without bound.
export function syncTargetToLevel(state: GameState): Building | undefined {
  if (!Number.isFinite(state.levelIndex) || state.levelIndex < 0) state.levelIndex = 0;
  state.levelIndex = Math.trunc(state.levelIndex);
  const lvl = levelAt(state.levelIndex, state.seed, state.mode);
  const hub = targetHub(state);
  if (hub && hub.type === 'target') { hub.target = lvl.target; hub.required = lvl.required; hub.par = lvl.par; }
  return hub;
}

// Make a loaded/migrated save internally consistent. Re-derive the hub goal from levelAt (which
// reproduces the same generated target given seed + index). Endless mode never "wins", so an old
// save stuck at 'won' rolls back into play at its level (its built factory is kept). A save carrying
// more deliveries than the level needs snaps back to a clean 0.
export function reconcileLevel(state: GameState): void {
  // A save captured MID-REPLAY: cancel the replay and return to her real position (home). No progress
  // is lost — endless boards are disposable and her stars are saved. We clearBuild below for a fresh
  // home board (the persisted build was the replay attempt).
  const abortingReplay = typeof state.replayReturn === 'number';
  if (abortingReplay) state.levelIndex = state.replayReturn as number;
  state.replayReturn = null;

  if (typeof state.delivered !== 'number' || state.delivered < 0) state.delivered = 0;
  const hub = syncTargetToLevel(state); // re-points the hub at levelAt(levelIndex, seed)
  if (state.status === 'won') state.status = 'playing';
  // A migrated/edited save can carry a full-or-over bar; snap it to a clean start so it doesn't
  // instant-advance on the first tick (checkLevel advances at >=).
  if (hub && hub.type === 'target' && state.delivered >= hub.required) state.delivered = 0;
  ensureMiners(state); // backfill an automatic miner on every deposit (incl. old saves without one)
  if (!(state.bestStars instanceof Map)) state.bestStars = new Map();
  state.lastStars = 0;
  // Migrate a pre-counter (v6) save: derive the lifetime tallies from whatever bestStars we have.
  // Guarded on solvedCount===0 so it runs at most once and never clobbers real counts.
  if (state.solvedCount === 0 && state.bestStars.size > 0) {
    let solved = 0, stars = 0, perfect = 0;
    for (const [idx, v] of state.bestStars) if (idx >= ENDLESS_START) { solved++; stars += v; if (v === 3) perfect++; }
    state.solvedCount = solved; state.starsTotal = stars; state.perfectCount = perfect;
  }
  if (abortingReplay) clearBuild(state); // fresh board for the level she returns to
  if (state.mode === 'easy') ensureEasyDeposits(state); // deposits must match this puzzle's dealt hand
}

// Easy deals a fresh hand each puzzle. On load, the saved deposits normally already ARE this level's
// hand (deterministic) — leave them, so a reload keeps her in-progress board. Only if they mismatch
// (e.g. a save from before a generator change) do we rebuild the board to the correct hand.
function ensureEasyDeposits(state: GameState): void {
  const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
  const want = levelAt(state.levelIndex, state.seed, state.mode).grantNodes;
  const wantVals = want.map((n) => n.value).sort(cmp);
  const haveVals = [...state.nodes.values()].map((n) => n.value).sort(cmp);
  const match = wantVals.length === haveVals.length && wantVals.every((v, i) => v === haveVals[i]);
  if (match) return;
  clearBuild(state);
  resetDeposits(state);
  for (const n of want) grantNode(state, n);
  ensureMiners(state);
}

// Golf stars only apply to ENDLESS puzzles: each starts from a cleared board, so the machine count
// at completion IS the from-scratch cost we compare to par. The authored campaign is a cumulative
// "reuse the 2" factory, so a from-scratch par can't be scored against it fairly — it isn't golfed.
export function isGolfLevel(index: number): boolean {
  return index >= ENDLESS_START;
}

// Endless runs forever, so cap the per-level star record: keep every campaign entry plus the most
// recent endless solves, so a marathon session can't bloat the save unboundedly.
const MAX_TRACKED_STARS = 300;
export function pruneBestStars(state: GameState): void {
  if (state.bestStars.size <= MAX_TRACKED_STARS) return;
  const endlessKeys = [...state.bestStars.keys()].filter((k) => k >= ENDLESS_START).sort((a, b) => a - b);
  let over = state.bestStars.size - MAX_TRACKED_STARS;
  for (const k of endlessKeys) { if (over <= 0) break; state.bestStars.delete(k); over--; }
}

// Called once per tick (AFTER move() settles) when the delivery bar is full. Advances the SAME
// factory to the next level — bumps the goal, resets the count, drops any new deposit. Endless:
// there is always a next level (levelAt generates one), so the game never "wins", it just keeps
// going. Kept out of the move loop so the target value stays stable for the whole tick.
export function advanceLevel(state: GameState, hub: Building): void {
  if (hub.type !== 'target') return;

  // Score the endless puzzle she just cleared BEFORE mutating anything. It began on a cleared board,
  // so the current machine count IS this puzzle's from-scratch cost — compare it straight to par.
  // (Campaign levels aren't golfed; see isGolfLevel.)
  const completedIndex = state.levelIndex;
  if (isGolfLevel(completedIndex)) {
    const earned = starsFor(countMachines(state), hub.par);
    state.lastStars = earned;
    const prevBest = state.bestStars.get(completedIndex) ?? 0; // 0 = never solved (stars are 1-3)
    if (prevBest === 0) state.solvedCount++;                    // first solve of this puzzle (normal play)
    if (earned > prevBest) {                                    // a new best (first solve, or a better replay)
      state.starsTotal += earned - prevBest;
      if (earned === 3 && prevBest !== 3) state.perfectCount++;
      state.bestStars.set(completedIndex, earned);
    }
    pruneBestStars(state); // trims the LIST map; the lifetime tallies above are unaffected
  } else {
    state.lastStars = 0; // no star row on the campaign celebration
  }

  // Finishing a REPLAY: don't advance the ladder — return to where she was (home), on a fresh board.
  // (Her best stars for the replayed puzzle were already recorded above.)
  if (state.replayReturn !== null) { returnFromReplay(state, hub); return; }

  state.levelIndex++;
  const next = levelAt(state.levelIndex, state.seed, state.mode);
  hub.target = next.target;
  hub.required = next.required;
  hub.par = next.par;
  state.delivered = 0;
  // Endless puzzles start FRESH: wipe the built factory so each target is a self-contained golf
  // puzzle scored from an empty board. (The campaign stays cumulative — its "reuse the 2" design.)
  // clearBuild keeps the deposits + hub and restores the automatic miners.
  if (isGolfLevel(state.levelIndex)) clearBuild(state);
  // Easy deals a new hand of sources each puzzle, so swap the deposits before granting the new ones.
  if (state.mode === 'easy') resetDeposits(state);
  for (const n of next.grantNodes) grantNode(state, n);
  ensureMiners(state); // a newly-granted deposit gets its automatic miner right away
}

// Point the hub at level `index` on a fresh board without advancing the ladder. Shared by
// startReplay (go to a past puzzle) and returnFromReplay (come back home). Endless levels are always
// golf levels, so clearBuild always applies here; no grantNodes (those deposits already exist).
function gotoLevelFresh(state: GameState, hub: TargetBuilding, index: number): void {
  state.levelIndex = index;
  const lvl = levelAt(index, state.seed, state.mode);
  hub.target = lvl.target;
  hub.required = lvl.required;
  hub.par = lvl.par;
  state.delivered = 0;
  clearBuild(state); // fresh board (also resets delivered/misses and restores miners)
  // Easy: this level's sources differ from the current board's, so lay down ITS hand (replaying a
  // past easy puzzle must restore that puzzle's deposits, not keep the ones we're leaving).
  if (state.mode === 'easy') {
    resetDeposits(state);
    for (const n of lvl.grantNodes) grantNode(state, n);
    ensureMiners(state);
  }
}

// Jump past the authored tutorial straight into endless mode. First ensure every deposit the campaign
// would have introduced exists (endless puzzles need all of {2,3,5,7}; a fresh game only has {2,3}),
// then point the hub at the first endless puzzle on a fresh board. No-op if already in endless.
export function skipTutorial(state: GameState): void {
  if (state.levelIndex >= ENDLESS_START) return;
  const have = new Set<bigint>([...state.nodes.values()].map((n) => n.value));
  for (let i = 0; i < ENDLESS_START; i++)
    for (const n of LEVELS[i].grantNodes)
      if (!have.has(n.value)) { grantNode(state, n); have.add(n.value); } // grant each missing deposit once
  state.levelIndex = ENDLESS_START;
  syncTargetToLevel(state); // hub -> first endless goal + par
  clearBuild(state);        // fresh board (also restores a miner on every deposit)
}

// Begin replaying a past endless puzzle to beat her star score. Remembers where she was (home) so
// finishing the replay returns her there. Only endless (golf) puzzles are replayable.
export function startReplay(state: GameState, index: number): void {
  if (!isGolfLevel(index)) return;
  const hub = targetHub(state);
  if (!hub || hub.type !== 'target') return;
  if (state.replayReturn === null) state.replayReturn = state.levelIndex; // keep the TRUE home across replay-to-replay
  gotoLevelFresh(state, hub, index);
}

function returnFromReplay(state: GameState, hub: TargetBuilding): void {
  const home = state.replayReturn ?? state.levelIndex;
  state.replayReturn = null;
  gotoLevelFresh(state, hub, home);
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
