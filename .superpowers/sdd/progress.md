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
  Unblocks feeding 2 adders from one miner AND reaching numbers beyond 7+5=12.

Status: 74 tests, tsc clean, vite build, browser-verified (place miners/operator/splitter,
route belts, progress bar advances, resume).

NEXT: multi-target progression (advancing targets + more operators/nodes as you go — now
reachable via splitters); subtraction / × / ÷ as editable content data; procedural deposits
beyond the origin chunk; drag-to-pan; and an adversarial code-review pass over the rework.
