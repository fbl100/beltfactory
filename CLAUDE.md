# CLAUDE.md

## Project

A web-based, educational factory/belt puzzle game inspired by the *mechanics* of belt-automation number games (extract numbers, route them on conveyor belts, combine them with arithmetic operators to reach target numbers). Built for private family use — specifically as a fun math game for a 9-year-old.

This is an original project. It reuses the **genre mechanics** but none of the art, name, text, sound, progression, or code of any existing commercial game.

## Goals

- **Educational:** reinforce arithmetic (start with addition, add subtraction/multiplication/division as difficulty ramps).
- **Approachable for a 9-year-old:** gentle difficulty curve, small starting numbers, clear visual feedback, forgiving UX.
- **Fun:** the satisfying "watch the machine run" loop of belt games.
- **Iterative:** we expect to evolve the engine and mechanics over many sessions. Keep things modular and easy to change.

## Tech Stack

- **Language:** TypeScript.
- **Rendering:** PixiJS (WebGL) for the grid, belts, and moving items — accessed through a `Renderer` interface (`src/render/renderer.ts`) with a swappable `Theme` config and a manual pan/zoom `Camera`. The renderer owns the camera and streams only visible cells; sim state is read, never mutated. Three built-in themes with a live switcher.
- **World:** an **unbounded, sparse chunked grid** (coords may be negative), divided into 16×16 chunks generated deterministically from `(seed, chunkX, chunkY)`. State is three sparse maps — 1×1 `belts`, `buildings` (**3×3** miner/target + **1×3** operator, keyed by their top-left anchor), and passive `nodes` (number deposits) — plus a derived `occupancy` index. `src/sim/buildings.ts` owns all footprint/edge-port/rotation geometry (per-type footprint via `dimsOf`).
- **Build:** Vite (fast dev server, hot reload).
- **Numbers:** use `BigInt` for item/target values from the start to avoid floating-point issues as numbers grow.
- **Persistence:** server-side, per-user JSON saves via a small Express API (`server/`). The versioned save round-trips the sparse cell `Map`, loaded chunks, items, and `BigInt` values so a game resumes on any device. Save format stays versioned for future migrations.
- **Backend:** a single Node + Express server (`server/`) hosts the built frontend and a tiny JSON API for seeded-user auth (bcrypt + cookie-session) and save/resume; ships via Docker Compose. The simulation and rendering still run entirely client-side.

Do not add heavy dependencies or new frameworks without asking first. Prefer small, well-understood libraries.

## Architecture Principles

1. **Separate simulation from rendering.** The game logic must not depend on PixiJS. Rendering reads from simulation state; it never drives it.
2. **Fixed-timestep tick loop.** The simulation advances in discrete ticks (target ~10 ticks/second, configurable). Rendering interpolates/draws between ticks. Simulation must be deterministic given the same inputs and tick count.
3. **Grid-based world (Beltmatic-style).** 1×1 belts and a resource-node ground layer coexist with rotatable buildings (**3×3** miner/target, **1×3** operator). Belts route items between building edge ports; a miner mines the node under it, an operator combines two tip inputs into a center output, the target wins on an exact match.
4. **Slot-based belts.** Each belt segment has discrete slots; an item advances to the next slot each tick only if that slot is free. This keeps movement correct and easy to reason about (prefer this over continuous float positions unless we deliberately change it later).
5. **Items carry a value.** Each item on a belt is a `BigInt`. Operator machines take two inputs and emit one output = `a OP b`.
6. **Data-driven content.** Levels, targets, unlock costs, and available operations live in plain data/config files, NOT hardcoded in logic. This is what we'll tune most often, so make it trivial to edit.

## Suggested Structure

```
src/
  sim/          # pure simulation, no rendering imports
    grid.ts       # grid + cell model
    entities.ts   # belt, extractor, operator, sink definitions
    tick.ts       # the fixed-timestep update
    items.ts      # item + value (BigInt) logic
    save.ts       # serialize / deserialize (versioned)
  render/       # PixiJS rendering, reads sim state
    stage.ts
    sprites.ts
  content/      # data-driven levels & progression
    levels.ts
    operations.ts
    unlocks.ts
  ui/           # HUD, menus, controls
  input/        # placing/removing entities, drag, etc.
  main.ts
```

Adjust as needed, but keep the `sim` / `render` / `content` separation.

## Coding Conventions

- TypeScript strict mode on.
- Small, focused modules. Prefer pure functions in `sim/`.
- Name things for a reader who is not the author (this is a hobby project we'll return to intermittently).
- Comment the *why*, not the *what*, especially in the tick loop and belt-movement logic.
- Keep the tick loop allocation-light (avoid creating garbage every tick where it's easy not to).

## How We'll Work Together

- We are **iterating** on engine and mechanics. Expect to revisit and refactor. Favor clarity and changeability over cleverness or premature optimization.
- When adding a mechanic, first update or propose the **data model** (in `content/` or `sim/`), then the simulation, then rendering.
- When something is ambiguous or has multiple reasonable designs, briefly lay out the options and give a recommendation before writing a lot of code.
- Keep each change reviewable. Prefer small, working increments (get one belt moving one item before building the whole factory).
- Write a quick test or a tiny debug harness for tricky simulation logic (belt movement, operator resolution) rather than only testing by eye in the browser.

## Difficulty / Educational Tuning (design intent)

- **Phase 1:** addition only, targets in the 5–30 range, 2–3 base numbers available.
- **Phase 2:** introduce subtraction, slightly larger targets.
- **Phase 3:** multiplication, unlockable, targets grow.
- **Phase 4:** division and larger numbers.
- Always keep at least one obvious solution reachable so she never gets stuck; puzzle depth is optional, not required.
- Prefer positive, encouraging feedback. No fail states that punish — just "not yet, try again."

Keep this progression as editable data so we can retune it for her actual pace.

## Constraints / Non-Goals

- No *public* online features, third-party accounts, cloud services, or multiplayer. A single self-hosted server with a small seeded family-user list (for login + cross-device save/resume) is in scope; nothing is exposed beyond the household deployment.
- No copyrighted assets, names, or text from any existing game. Original art and naming only. (Working title is a placeholder — pick a fun original name.)
- No monetization, ads, or analytics.
- Don't over-engineer. This is a learning-and-fun project, not a shipping product.

## Current Status

Beltmatic-style game on `feat/mvp` (plan: `docs/superpowers/plans/2026-07-16-beltmatic-rework.md`; running notes: `.superpowers/sdd/progress.md`). Full mechanic set shipped and browser-verified:

- **World layers (all sparse Maps in `GameState`):** 1×1 `belts`, 1×1 `splitters`, 1×1 `tunnels`, `buildings` (**3×3** miner/target, **1×3** operator, keyed by anchor) over a `nodes` ground layer + a derived `occupancy` index. `src/sim/buildings.ts` owns per-type geometry (footprint via `dimsOf`, ports, rotation, `minerOutputs`, `operatorTips`/`operatorOutCells`).
- **Machines:** miner is a wide source (emits from all 4 sides, 12 cells); operator is a **1×3 bar** — its two end cells are labeled input tips (**A**, **B**; any exposed edge accepts) and its center outputs **A op B** from either of its two long edges (the facing side preferred, the other a fallback); target hub needs the level's delivery count (progress bar), wins on exact value, flashes "Not yet" on a wrong one.
- **Belts/logistics:** belts (drag-paint **or** click-start/click-end, auto-oriented), splitters (round-robin), tunnels (Factorio-style underground; exit ≤5 cells ahead, up to 4 belts overhead).
- **Rates (`src/content/config.ts`, tunable):** 2.5 ticks/s; miner 30/min per belt; operator 30/min out (30/min per input); level count 20; tunnel reach 5.
- **UX:** tools Belt/Split/Tunnel/Miner/+Op (hotkeys 1–5), R rotate, right-drag erase, placement ghost, **Clear Map** button (wipes this level's build — belts/miners/operators/items — but keeps the level, target hub, and revealed deposits; `clearBuild` in `world.ts`) + **Start Over** button (full restart to level 1; `resetGame`); save is **v3** (belts/splitters/tunnels/buildings/nodes/delivered) and self-heals old/partial saves; Docker Compose, seeded-user login, per-user JSON save/resume, pan/zoom + chunk streaming, 3 live themes, autosave.

- **Multi-target progression + endless mode (shipped):** filling a level's delivery bar auto-advances the *same* factory to a bigger target (and, on some levels, grants a new deposit). After the 6 authored campaign levels it flips into **endless mode** — it never "wins", it keeps generating goals forever. `levelAt(index, seed)` in `src/content/levels.ts` is the single source of truth: authored `LEVELS[0..5]`, then deterministically **generated** levels (seeded by `seed`+`index`, so a mid-endless reload reproduces the same goal). `src/sim/progression.ts` owns `advanceLevel` (run after `move()` each tick; never sets `won`), `reconcileLevel` (re-derives the hub from `levelAt`, no upper clamp, rolls any legacy `won` save back to playing), buried-deposit relocation, and stale-value handling. `GameState.levelIndex` + `seed`; save **v5** (v3/v4 still load). HUD shows "Level N/M" in the campaign and "Level N · ∞" in endless, plus an auto-advance toast (a special "Endless mode!" one at the boundary).
- **Prime Foundry ladder (shipped, playtested):** the campaign is a prime-factorization curve — deposits are **primes**, targets are composites you build by multiplying them. It stays on {2,3} for a while — 6=2×3 → 12=2×2×3 (reuse the 2) → 21=2×3×3+3 (× and + together) — then adds one prime at a time: 30=2×3×5 → 42=2×3×7 → 210=2×3×5×7 (finale). Deposits are spread **around** the hub (2/3 on the left, 5/7 on the right) so belts arrive from multiple sides and the middle stays open. **Endless generator:** deposits stay {2,3,5,7}; each level picks a target from the set of values buildable from those primes within a small machine budget (`reachableValues`, `GEN_BUDGET`), mixing composites (clean × route) and primes (which force + / −). First `EASE_LEVELS` (10) stay 2-digit, then magnitude + prime-chance ramp toward the 999 cap; a few extra {2,3,5,7} copies drip in farther out over time (capped, `MAX_DRIPS`) to keep a growing factory decongested. `÷` is a tool, never a goal driver. Property tests guard the invariants (targets in range + reachable, deterministic, prime & composite both appear, drips prime/spaced/capped, magnitude ramps).

- **Operators − / × / ÷ (shipped):** `src/content/operations.ts` has add/subtract/multiply/divide, all *order-independent* (− = |a−b|, × = a·b, ÷ = bigger÷smaller whole part, ÷0→0) so the two-input operator machine needs no operand ordering and a 9-year-old never meets negatives or fractions. `Level.ops` gates which the player may build; all four (+ − × ÷) are currently available from the start (× is still the *intended* factor-tree route, but the full toolkit is open for free experimentation), and the HUD op-type selector shows whatever the level unlocks. The operator is a **1×3 bar** (`src/sim/buildings.ts`: `operatorTips()`, `operatorOutCells()`): its two end cells are labeled input tips **A** and **B** — any exposed edge of a tip accepts input — and its center emits **A op B** from either of its two long edges (facing side preferred, the other a fallback), so a receiving belt can sit on either side. It renders the op symbol on the center with `A`/`B` at the tips. It holds at most **one pending input per tip** (`OperatorInput{tip,value}`), so two items from the *same* belt can't pair (that had produced e.g. 3×3=9 instead of 2×3=6). `dir` sets the bar orientation (bar is perpendicular to it) and the preferred output side; `R` rotates through all four. Pending inputs are transient (reset on load).

Verified: **108 unit/integration tests**, `tsc`, `vite build`, and multiple real-browser runs (build via tools, route to win/advance, reload/resume; splitters, tunnels, reset, click-belts, level-up→toast→new-deposit, and op-gating + × placement each proven). Progression and operators were each designed/reviewed via adversarial workflows (findings fixed).

Controls: drag-to-pan shipped — trackpad two-finger scroll pans, pinch (ctrl+wheel) zooms; space-drag/middle-drag also pan; `+`/`−` keys zoom; arrow keys still pan; `R` rotates.

Next (Prime Foundry landed well with the kid): **Era Islands** (per-operator islands + procedural deposits beyond the origin chunk — old islands persist), a division-focused **Breaker Yard** island, and optional **Number Golf** pars. See `docs/design/2026-07-16-making-operators-essential.md`.
