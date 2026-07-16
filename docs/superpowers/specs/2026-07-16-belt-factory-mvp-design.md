# Belt Factory MVP — Design

**Date:** 2026-07-16
**Status:** Approved (design), pending implementation plan
**Context:** ~2-hour hackathon. Goal is a deployable, resumable, minimal-auth webapp built on a settled rendering engine, with a playable single-level slice.

## Goal

A web-based educational belt/factory math game for a 9-year-old. This spec covers the MVP:

- Deployable via `docker-compose up`.
- Minimal multi-user auth (a small seeded user list).
- Log in → create a game → play a minimal level → leave → come back and resume.
- A settled rendering engine (PixiJS) proven out via a live theme switcher.

Game *depth* is intentionally thin for the MVP (one hardcoded level, addition only). Breadth of the shell (deploy + auth + save/resume + engine decision) is the priority.

## Key Decisions

### Rendering engine: PixiJS

Chosen over Canvas 2D and DOM/CSS.

- **Rationale:** Factory-genre games hit rendering limits at high entity counts sooner than expected. PixiJS batches sprite draws (one GPU call for many sprites), raising the ceiling from ~thousands (Canvas 2D per-item draws) to ~tens of thousands. It is also the CLAUDE.md mandate.
- **No art assets required for MVP:** draw entities with `Pixi.Graphics` (procedural rounded rects, circles, lines). Later, promote hot items (moving number tokens) to batched sprites for scaling headroom — an isolated change behind the renderer interface.
- **Cost accepted:** retained-mode scene graph adds some lifecycle boilerplate and makes theme-switching a graph rebuild rather than a param change. One-time, small.

### Renderer interface + Theme config

The renderer is the most swappable part of the system because the simulation is pure. We formalize that boundary:

- `Renderer` interface: `init(theme)`, `draw(simState, alpha)`, `setTheme(theme)`, `resize(w, h)`, `destroy()`.
  - `alpha` is the interpolation factor (0..1) between the previous and current tick, so rendering can smoothly interpolate item positions between discrete ticks.
- A `PixiRenderer` implements it for the MVP. A different renderer (or a batched-sprite optimization) can drop in behind the same interface without touching sim, content, or UI.
- `Theme` config object supplies all colors, shapes, corner radii, fonts, and effect flags. The renderer reads visuals only from the theme; no hardcoded colors in draw code.

### Visual style: pick via a live theme switcher

Rather than throwaway mockups, the "compare look/feels" step is a switcher that flips themes over the *live, running* belt scene. Three candidate themes:

1. **Chunky Toy** — bold rounded shapes, thick belts, bright primary colors, big friendly numbers. (Default bet for a 9-year-old.)
2. **Clean Flat** — soft pastels, thin lines, generous whitespace, modern sans.
3. **Neon Arcade** — dark background, glowing conveyors, punchy accent colors.

Whichever theme is preferred becomes the default `Theme`. Nothing is thrown away; the switcher can remain as a dev/settings toggle.

### Persistence: flat JSON to start

- Each user's game state serialized as **versioned JSON** (per CLAUDE.md), keyed by user id, stored under a mounted `data/` volume.
- Zero native dependencies; trivial to inspect and migrate. SQLite is a deliberate later swap if we outgrow it (isolated in the storage module).
- Save triggers: on tick-boundary (throttled, e.g. every N seconds while dirty) and on explicit save / page unload. Load on login.

### Auth: small seeded user list

- Users seeded from a config file (e.g. you + kid). No self-registration UI.
- Passwords stored bcrypt-hashed. Login verifies, then sets an **httpOnly, signed session cookie**.
- Session store is in-memory for the MVP (acceptable that a server restart forces re-login; game saves are durable on disk regardless).
- Per-user saves: a user only ever sees and resumes their own game.

### Deployment: single Node + Express container via docker-compose

- One service: Express serves the built Vite frontend (static) **and** the JSON API (`/api/*`).
- `docker-compose` chosen over bare `docker run` so a DB service can be added later without restructuring. A named volume backs `data/`.
- `docker-compose up` → open browser → log in → play.

## Architecture

```
src/
  sim/              # pure simulation — NO rendering/DOM/network imports
    grid.ts           # grid + cell model
    entities.ts       # belt, extractor, operator, sink/target definitions
    items.ts          # item + value (BigInt) logic
    tick.ts           # fixed-timestep update (~10 ticks/s, configurable)
    save.ts           # serialize / deserialize game state (versioned)
  render/           # reads sim state, never drives it
    renderer.ts       # Renderer interface + Theme type
    pixi-renderer.ts  # PixiJS implementation (Pixi.Graphics)
    themes.ts         # the three theme configs
  content/          # data-driven content
    levels.ts         # the MVP level (grid layout, available numbers, target)
    operations.ts     # arithmetic ops (addition for MVP)
  ui/               # HUD, login page, theme switcher, controls
  input/            # place/remove entities, interaction
  net/              # API client (login, load, save)
  main.ts           # bootstrap: render loop + fixed-tick loop

server/
  index.ts          # Express: static hosting + /api routes
  auth.ts           # session, bcrypt, seeded users
  storage.ts        # JSON load/save per user (data/ volume)

docker-compose.yml
Dockerfile
```

### Loop model

- **Fixed-timestep simulation:** `tick.ts` advances the sim in discrete steps at ~10 ticks/s. Deterministic given the same inputs and tick count.
- **Decoupled render:** a `requestAnimationFrame` loop calls `renderer.draw(simState, alpha)` where `alpha` interpolates item positions between the last two ticks for smooth motion. Rendering never mutates sim state.
- **Slot-based belts:** each belt segment has discrete slots; an item advances one slot per tick only if the next slot is free.

### Data flow

1. Login → server validates → session cookie → client fetches saved state (or a fresh level from `content/`).
2. Client runs sim (fixed tick) + render (rAF). User places/removes entities via `input/`, mutating sim state.
3. Storage: throttled autosave + save-on-unload POST serialized state to `/api/save`; server writes per-user JSON to `data/`.
4. Resume: next login loads that JSON back into the sim.

### API surface (MVP)

- `POST /api/login` — `{username, password}` → sets session cookie or 401.
- `POST /api/logout` — clears session.
- `GET /api/state` — returns the logged-in user's saved game (or 204/empty if none).
- `POST /api/save` — persists the posted serialized game state for the logged-in user.
- All `/api/*` except login require a valid session.

## The MVP Level

- Roomy grid to leave space for routing — the dimensions are **level data**, not an engine limit. Start around **20×14** and tune to taste; the renderer viewport pans/scales to fit whatever the level declares.
- One or two **extractors** emitting fixed base numbers (addition-phase values, 1–9 range).
- Player places **belts** to route items and one **operator** machine (addition) that takes two inputs → emits `a + b`.
- One **target/sink** with a goal number (5–30 range). Delivering an item equal to the target = success.
- Encouraging, non-punishing feedback ("not yet, try again" — no fail state).
- Level defined as data in `content/levels.ts`.

## Testing

- Unit tests for the tricky pure sim logic: belt slot advancement (blocking when next slot occupied), operator resolution (`a OP b`, BigInt), and save/load round-trip (serialize → deserialize → identical state).
- A tiny headless tick harness to run the sim N ticks and assert item positions/values — no browser needed.
- Renderer, auth, and storage validated by manual run for the MVP (thin, mostly plumbing).

## Save Format (versioned)

```jsonc
{
  "version": 1,
  "levelId": "mvp-1",
  "tick": 1234,
  "grid": { "width": 20, "height": 14, "cells": [ /* entity placements */ ] },
  "items": [ { "value": "7", "cell": [3,4], "slot": 2 } /* BigInt as string */ ]
}
```

- `version` gates future migrations.
- BigInt values serialized as strings (JSON has no BigInt).

## Non-Goals (MVP)

- No self-registration, password reset, or real identity/OAuth.
- No subtraction/multiplication/division yet (data-driven, added later).
- No render/sim rollup or level-of-detail optimizations (isolated behind interfaces; add when profiling demands).
- No SQLite yet.
- No online/multiplayer, analytics, or monetization (permanent non-goals per CLAUDE.md).

## Follow-ups (explicitly deferred)

- Render-side level-of-detail (aggregate flow on dense belts) — behind `Renderer`.
- Sim-side throughput rollups for long saturated belts — in `sim/`.
- SQLite persistence swap — behind `storage.ts`.
- Difficulty progression (Phases 2–4) as editable data.
- Update CLAUDE.md to reflect the settled engine details (PixiJS confirmed; Renderer/Theme abstraction added).
