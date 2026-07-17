# Belt Factory — progress ledger

Branch: feat/mvp

## MVP (plan: docs/superpowers/plans/2026-07-16-belt-factory-mvp.md) — COMPLETE
Tasks 1–17 shipped: pure sim, PixiJS renderer + camera, seeded-user auth, per-user JSON
save/resume, docker-compose. Then post-playtest fixes: drag-to-paint belts, corrupt-save
recovery, tick accumulator clamp, renderer leak fix, resilient fetch, server hardening.

## Beltmatic rework (plan: docs/superpowers/plans/2026-07-16-beltmatic-rework.md) — Phases A–E DONE
Reworked the one-entity-per-cell world into Beltmatic-style: 1×1 belts + 3×3 rotatable
buildings (miner/operator/target) over a resource-node ground layer.

- Phase A (a5334a2): sim/grid reshaped (belts/buildings/nodes/occupancy), sim/buildings.ts
  geometry + occupancy, tick mine/produce/move/win. 26 sim tests.
- Phase B (a5334a2): save v2 (three-store round-trip, rebuildOccupancy, old saves rejected),
  world ChunkContent + instantiateBuilding, worldgen (nodes + target authored), placement
  (footprint-aware belt paint, placeMiner/placeOperator, erase with target protected).
- Phase C–E (257ef16): renderer draws nodes/belts(chevron)/3×3 bodies+arrows/ghost/no-belt
  warning; new format.ts; HUD tool selector + rotation + "Not yet" flash; main.ts tool routing
  (belt drag-paint, building single-click, right-drag erase), R rotate, 1/2/3 hotkeys, ghost,
  v2 loader guard. Origin puzzle authors only nodes(7,5)+target; player places the machines.

Verified: 68 unit/integration tests, tsc clean, vite build, and a real-browser run
(place 2 miners on nodes + operator via tools, drag belts, win, reload → resume wins).

## Post-rework iteration (feat/mvp)
- Belts slowed to 2.5 ticks/s (80b6e4b).
- Throughput rates + count-based level with a progress bar (b7b0c34): miners ~30/min,
  operators throttled ~7.5/min; target needs TARGET_COUNT deliveries; save v3.
- Splitters (ce3b5ef): 1x1 round-robin belt junctions (own layer); "Split" tool (hotkey 4).
- Wide miner + 3-side operator (501de1b): miner emits from its 3 open sides (9 cells);
  operator takes inputs on 3 non-front sides, outputs front-center.
- Rate tuning (9350b9e): operator 30/min out (30/min per input), miner 30/min per belt,
  level count 20 (2-in-1-out halving accounted for).
- Reset button + save heal (1c59295): Reset clears/regenerates the level; old saves heal so
  the count can't be undefined.
- Belt tunnels (e38bd5b): Factorio-style underground belts (own layer); "Tunnel" tool
  (hotkey 5); exit up to 5 cells ahead => up to 4 belts overhead. Completes the core mechanics.

- Multi-target progression: filling a level's delivery bar AUTO-ADVANCES the same factory to a
  bigger target + grants a new number deposit (machine keeps running); final level wins.
  - Data: `src/content/levels.ts` — editable ladder (12→20→30→50→100, required 10 each;
    gentle "add the new number" for L1-3, bold "double the new number" for L4/5: 50=25+25,
    100=50+50 via the wide miner). `LEVELS` is the single source of truth; `clampLevelIndex`.
  - Logic: `src/sim/progression.ts` — `advanceLevel` (after move() in tick, one/​tick),
    `reconcileLevel`/`syncTargetToLevel` (LEVELS drives the hub on load; migrates saves),
    `grantNode` relocates a buried deposit to clear ground, `isStaleTargetValue` (leftover
    old-target output isn't punished with "Not yet").
  - `GameState.levelIndex`; save **v4** (round-trips levelIndex; accepts+migrates v3 in place so
    the family factory survives, even a previously-"won" save). HUD: "Level N/M" + auto-advance
    toast + grace on the flash. Camera nudges to a newly-revealed deposit if off-screen.
  - Designed via an adversarial 5-lens design panel; reviewed via an adversarial code-review
    workflow (5 confirmed findings all fixed: save-snap boundary, stale-value flash, dead code,
    redundant clamp). Browser-verified: build→advance→toast→new deposit→resume, no "Not yet" spam.

- Operators − / × / ÷ (editable data): `src/content/operations.ts` now has add/subtract/
  multiply/divide, all ORDER-INDEPENDENT (− = |a−b|, ÷ = bigger/smaller whole part, ÷0→0) so the
  operator machine needs no operand ports and a kid never sees negatives/fractions. `Level.ops`
  gates which the player may build (cumulative: add → +− → +× → +÷); `opsForLevel(i)`. HUD gains a
  level-gated op-type selector (getOp); main.ts places `currentOp()`. Renderer already drew the
  symbol; save already round-trips `op` (no version bump). Reviewed via an adversarial workflow
  (0 confirmed findings). Browser-verified: only + at L1, all four at L5, placing a × operator
  renders/persists as multiply.

- Pan/zoom controls (main.ts): drag-to-pan shipped — trackpad two-finger scroll pans + pinch
  (ctrl+wheel) zooms (Mac-native); space-drag and middle-drag also pan; +/− keys zoom; arrow
  keys still pan. Removed the HUD ▲▼◀▶ direction buttons (rotate with R). Browser-verified.
- Design brainstorm for making − / × / ÷ essential: docs/design/2026-07-16-making-operators-essential.md
  (recommendation: "Prime Foundry" — curate prime deposits + composite targets so × is the tidy
  route; stage as per-op "islands"; addition stays possible so never-stuck holds).

Status: 108 tests, tsc clean, vite build, browser-verified (advance-through-levels + resume; op
gating + × placement; pan/zoom).

NEXT: **Prime Foundry** experiment (retune LEVELS to prime deposits + composite targets so × is
essential — a pure-data change per the design doc); then procedural deposits beyond the origin
chunk; retune/extend the ladder.
