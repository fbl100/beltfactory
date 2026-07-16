# Belt Factory MVP — progress ledger

Branch: feat/mvp
Plan: docs/superpowers/plans/2026-07-16-belt-factory-mvp.md

Base commit (branch start): ec5eb8c
Task 1: complete (39143c3) — scaffold Vite+TS+Vitest
Task 2: complete (2ebf585) — sparse Map world state + directions
Task 3: complete (ea90fa6) — item model + BigInt
Task 4: complete (076b671) — entity cell types + accept rules
Task 5: complete (d2ba71c) — addition operation
Task 6: complete (9306267) — chunk machinery + MVP world generator
Task 7: complete (9d62002) — fixed-timestep tick (emit/move/produce/win)
Task 8: complete (7772984) — versioned save/load (Map/Set/BigInt)
Task 9: complete (f1dbf02) — Renderer interface, Camera + three themes
Task 10: complete (f5afb40) — PixiJS renderer (camera, interpolation, theming)
Task 11: complete (b707f34) — place/remove belts input
Task 12: complete (c495622) — seeded users + bcrypt (added @types/bcryptjs, dev)
Task 13: complete (3059598) — per-user JSON save storage
Task 14: complete (8294647) — Express static host + auth/session/save API
Task 15: complete (d0017fd) — client wiring (login, loops, camera, streaming, autosave, themes)
Task 16: complete (10c6008) — docker-compose deployment with persistent volume
Task 17: in progress — full verification + CLAUDE.md update.

Verification performed:
- Full suite: 43/43 passing across 13 files (40 planned + 3 e2e integration).
- tsc --noEmit clean; vite build succeeds.
- Server API smoke (curl): login/me/state/save/logout status codes + save round-trip.
- Docker: `docker-compose up --build` serves the built app + API; state persists across
  `down`/`up` via the named volume.
- Real-browser e2e (Playwright + system Chrome): login -> Target:12 puzzle -> place 21 belts by
  clicking the canvas + HUD direction buttons -> WIN banner -> reload -> WIN banner returns (resume).
- Added src/game.e2e.test.ts: cross-module integration test (route puzzle to win + mid-game
  save/resume), per CLAUDE.md's ask for sim integration tests.

Known note (pre-existing, task 7, not changed): src/sim/tick.ts imports applyOp/OpId from
src/content/operations — a sim->content import. content/operations is itself pure (no DOM/Node/
framework), so determinism/testability hold; flagged for a future DI cleanup if strict purity wanted.

NEXT (post-MVP): procedural number deposits (content model B), difficulty Phases 2-4 as data,
drag-to-pan/paint input, resume-from-corrupt-save hardening.
