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
- **World:** an **unbounded, sparse chunked grid** — cells live in a `Map<"x,y", Cell>` (coords may be negative), divided into 16×16 chunks generated on demand and deterministically from `(seed, chunkX, chunkY)`.
- **Build:** Vite (fast dev server, hot reload).
- **Numbers:** use `BigInt` for item/target values from the start to avoid floating-point issues as numbers grow.
- **Persistence:** server-side, per-user JSON saves via a small Express API (`server/`). The versioned save round-trips the sparse cell `Map`, loaded chunks, items, and `BigInt` values so a game resumes on any device. Save format stays versioned for future migrations.
- **Backend:** a single Node + Express server (`server/`) hosts the built frontend and a tiny JSON API for seeded-user auth (bcrypt + cookie-session) and save/resume; ships via Docker Compose. The simulation and rendering still run entirely client-side.

Do not add heavy dependencies or new frameworks without asking first. Prefer small, well-understood libraries.

## Architecture Principles

1. **Separate simulation from rendering.** The game logic must not depend on PixiJS. Rendering reads from simulation state; it never drives it.
2. **Fixed-timestep tick loop.** The simulation advances in discrete ticks (target ~10 ticks/second, configurable). Rendering interpolates/draws between ticks. Simulation must be deterministic given the same inputs and tick count.
3. **Grid-based world.** The world is a 2D grid of cells. Each cell is empty or holds one entity: belt, extractor, operator machine, or target/sink.
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

MVP shipped. Deployable via Docker Compose with seeded-user login (bcrypt + cookie-session) and per-user JSON save/resume. The game runs on an unbounded chunked world (authored 7 + 5 → 12 addition puzzle in the origin chunk, empty buildable land everywhere else), a manual pan/zoom camera that streams chunks into view, a pure fixed-timestep simulation (extract → belt-route → operator → sink/win), belt placement/removal via the HUD, three live-switchable themes, and autosave. Verified end-to-end (43 unit/integration tests, plus a real-browser run: log in, route the puzzle to the win banner, refresh and resume).

Next: procedural number deposits (content model B), difficulty progression (Phases 2–4) as editable data, drag-to-pan/paint input, and render/sim rollups if profiling calls for them.
