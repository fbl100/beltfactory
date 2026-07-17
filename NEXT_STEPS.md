# Belt Factory — Next Steps

_Handoff as of the latest `feat/mvp` work. Branch: `feat/mvp`, working tree clean, **112 tests** passing, `tsc` + `vite build` clean, all changes committed._

For the full running history see `.superpowers/sdd/progress.md`; for the operator/× design thinking see `docs/design/2026-07-16-making-operators-essential.md`. `CLAUDE.md` (Current Status) is the always-loaded summary.

---

## Where things stand

Shipped this stretch (all browser-verified):

- **Multi-target progression** — filling the bar auto-advances the same factory; save v5.
- **− / × / ÷ operators** as editable, level-gated data (order-independent; no negatives/fractions).
- **Prime Foundry ladder** — deposits are primes, targets are composites you build by multiplying: `6=2×3 → 12=2×2×3 → 21=2×3×3+3 → 30=2×3×5 → 42=2×3×7 → 210=2×3×5×7`. Stays on {2,3} for the first three levels.
- **Miners emit on all 4 sides**; **operators are a 1×3 bar** — `A`/`B` input tips at the two ends (any exposed edge accepts) and the center outputs from either long edge (facing side preferred, the other a fallback).
- **Pan/zoom** — trackpad two-finger scroll pans, pinch zooms; space-drag / middle-drag pan; `+`/`−` zoom; arrows pan. HUD direction buttons removed.
- **Bug fixed** — operator no longer pairs two items from the same belt (was `3×3=9`).

> Note: art is intentionally rudimentary — a separate skin pass will polish visuals. Build concepts, not pixels.

---

## Immediate next step: quotient + remainder divisor

A divisor would be the first **2-output** operator and the first **ordered** one. The 1×3 reshape actually helps: the operator's center already exposes **two output edges** — today they emit the same value (one is a fallback), but a divisor would make them emit **different** values.

**Design (has one real fork — flagged below):**
- Ports: `A` (dividend) and `B` (divisor) input tips at the two ends; **quotient** out one center edge, **remainder** out the other. `operatorOutCells()` already returns both edges — split them by role instead of preferring one.
- Compute: `q = floor(A / B)`, `r = A − q·B` (guard `B = 0`).
- This is **order-dependent** (A÷B ≠ B÷A), unlike today's order-independent ops — so the A/B tip labels finally carry real meaning. `OperatorInput` stores `tip`, so we can read A vs B directly.
- Emit two items per produce: quotient at one output edge, remainder at the other. `produce()` and the port/render model need to support two *distinct* outputs (the `label` field is already in place; give the two `out` ports distinct roles).
- Kid-facing: teaches "how many whole times B fits into A, and what's left over." Pairs with the "remainder crumbs" idea in the design doc — side-orders could ask for the leftovers.

**The fork to confirm before building:** ordered inputs mean the player must route the dividend to `A` and divisor to `B` (getting it backwards gives a different answer). That's a real difficulty bump for a 9-year-old. Options: (a) full ordered divisor as above; (b) keep it gentle and only surface remainder as a bonus output on the existing order-independent ÷. Worth a quick decision first.

---

## Near-term (playtest-driven)

- **Watch her play the new `12` and `21` levels** — 12 = reuse the 2 (feed one miner into both inputs); 21 = 2×3×3 + 3 (× and + together). Tune `required` counts / targets / spacing in `src/content/levels.ts` (pure data) based on how it lands.
- **Skin pass** — hand off the rudimentary art (operator labels, ports, deposits, hub) to the visual agent.

---

## Larger roadmap (see the design doc)

- **Era Islands** — when a new operator/era unlocks, reveal a fresh curated region (procedural deposits beyond the origin chunk) instead of resetting; old islands keep running. This also delivers procedural deposits (already on the roadmap) and gives long belts/tunnels a purpose.
- **Breaker Yard** — a division-focused island (boulders in → pebbles out); natural home for the divisor above.
- **Number Golf pars** — optional "beat it in ≤N machines" gold-gear rewards; celebrates clever × routes without forcing them.
- **Retune / extend the ladder** — more levels, or targets that *require* − / ÷, once × has landed.

---

## Dev quickstart

```bash
npm test            # 112 unit/integration tests (vitest)
npm run build       # tsc --noEmit && vite build
npm run dev         # vite dev server + tsx server (hot reload)
# manual run: DATA_DIR=./data SEED_USERS=kid:apples PORT=3000 npx tsx server/index.ts
#             then open http://localhost:3000  (login kid / apples)
```

Key files: `src/content/levels.ts` (the ladder — tune here most), `src/content/operations.ts` (op semantics), `src/sim/buildings.ts` (per-type geometry: `dimsOf` + `operatorTips`/`operatorOutCells`), `src/sim/tick.ts` (the sim loop), `src/sim/progression.ts` (level advance), `src/render/pixi-renderer.ts` (rendering), `src/ui/hud.ts` (HUD).
