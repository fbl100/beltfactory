# Belt Factory — "The Factory Comes Alive" UX Design Pass

_2026-07-17. Design pass covering the 6 requested UX upgrades, produced via a
multi-agent design + critique workflow (7 designers, a 9-year-old-playtest lens,
a tech-lead lens, synthesis). Grounded in the real code; verified load-bearing
facts against `pixi-renderer.ts`, `hud.ts`, `main.ts`, `place.ts`._

> **Status — 2026-07-17:**
> - **Phase A shipped & verified** (tsc + tests + build): animation clock + scrolling
>   belts, per-tool cursors, sound synth + director, palette fix.
> - **Phase B shipped & verified** (140 tests, tsc, vite build): F2 bottom hotbar +
>   slim top bar + gear menu + one keymap, P3 single level-up event source, F6
>   celebration (confetti + banner, no modal, ~800ms freeze), F3 dead-end belt
>   warnings (shared `acceptKindAt`, placement grace), and the juice tier (hub fill
>   meter, item spawn-pop, hover outline, miner breathe). New files: `input/cursors.ts`,
>   `audio/sfx.ts`, `audio/director.ts`, `ui/celebrate.ts`. Applied via the spec/review
>   workflow build order F2 → P3/F6 → F3 → Juice. Still needs a real-browser/tablet
>   playtest pass (see "manual browser checks" below).
> - **Phase C** (copy/paste) remains deliberately deferred.

## The vision: how it should FEEL to her after this pass

Right now the game is _correct_ but _quiet_. She builds, then waits, and the only
thing that moves is a dot. The machine doesn't look "on," mistakes are invisible,
and her biggest win — filling the bar — is a small blue toast she often misses.

After this pass, **the factory is alive and it talks back — wordlessly, kindly,
instantly.** Every reaction happens on-canvas, at the spot she's looking, in one
shared visual language: **motion = "working," a warm color/sound = "yes!", a soft
neutral cue = "not yet."** Nothing punishes. Nothing needs to be read.

- Finish a belt line → it **scrolls like a real conveyor.** A belt running into
  nothing goes dim and grows a gentle red cap — so she sees _that_ cell is the
  problem, without reading.
- Every action makes a sound: belts click like soft rain, operators land with a
  thunk, and **each correct delivery climbs a happy pentatonic ladder** (the
  Mario-coin effect) so waiting becomes _anticipation_.
- Her cursor **becomes the tool she's holding** — chevron for belts, a live
  `+ − × ÷` glyph for operators, an unmistakable **pink eraser** for Erase.
- Tools live in a **big, glowing, bottom-center hotbar** she already understands
  from Minecraft; exactly one slot is ever lit, and "Start Over" hides behind a gear.
- Fill the bar → **confetti made of her own number bursts from the hub she fed**,
  the machine freezes for a photo-finish beat, a big "You made 12!" cheers, then it
  clears on any click and she's into the next goal.

---

## "Build once" shared plumbing (do these first — everything rides on them)

Six of the seven features quietly depend on the same pieces. Build them once, up
front. This is the difference between one coherent game and six colliding mods.

- **P1 — One renderer animation clock.** `draw(state, alpha)`
  (`pixi-renderer.ts:81`) has _no_ time source today. **Two clocks, two jobs:**
  belt/tread motion is **tick-synced** — `phase = ((state.tick + alpha) % N) / N`
  (belts scroll at exactly item speed; both values already in `draw()`); ephemeral
  effects (pops, rings, pulses) use a renderer-owned `performance.now()` captured
  once per frame.
- **P2 — Marching belt chevrons.** Replace the single static chevron in the belt
  loop (`~pixi-renderer.ts:121`, reusing the `arrow()` poly helper) with two
  phase-offset scrolling chevrons on P1. F3 does **not** rebuild this — it only
  adds the dead-end/frozen state on top.
- **P3 — One level-up / state-delta event source in `main.ts`.** There are already
  ~2 level-up detectors (`hud.ts:143–149`; the camera-nudge check) and more were
  proposed. Collapse to **one** point in the frame loop that fires callbacks
  (camera nudge, sound fanfare, celebration, `hud.announceGoal()`). Positive deltas
  only; re-seed prev-values on the first frame after load (mirror the `lastLevel =
  -1` guard) so a resumed save never false-celebrates.
- **P4 — A decoupled sound director.** `createSoundDirector(sfx, state).frame(state,
  now)` is the one place that turns state deltas (`delivered`, `misses`,
  `levelIndex`, `status`) into sound. Reads state, never mutates; sim never imports
  audio. This is also the hook the celebration's fanfare plugs into.
- Two small shared helpers: **`worldToScreen(wx,wy)`** on the `Renderer` interface
  (inverse of `screenToWorld`, ~6 lines) to anchor DOM confetti to the hub; and a
  **pure `acceptsItemAt(state,x,y)`** in `sim/buildings.ts` that `advanceBeltItem`
  (`tick.ts`) also calls — so dead-end warnings and the sim's real acceptance rule
  **physically cannot drift** (if they diverge, warnings lie and a kid's trust
  evaporates).

---

## The six requested features (post-critique designs)

### F1 — Per-tool cursors · **S**
New `src/input/cursors.ts` exporting `cursorFor(tool, op)` → a full CSS cursor
value (inline-SVG data-URI via `encodeURIComponent` + integer hotspot + keyword
fallback). Chevron (belt), Y-fork (splitter), dive-arrow (tunnel), **live `+ − × ÷`
glyph** (operator), **pink tilted eraser** (hotspot at the rubbing corner). In
`main.ts`, replace the four scattered `canvas.style.cursor` writes
(116/157/185/200) with **one `updateCursor()` authority**: panning → `grabbing`;
space armed → `grab`; right-drag erasing → eraser; else `cursorFor(tool, op)`.
Right-drag erase shows the eraser too. Bake a dark outline into every SVG so
cursors stay legible across all three themes (cursors don't inherit the theme).
- **Simplified:** non-directional cursors (drop R-rotates-the-cursor — both lenses
  flagged "did the belt change or just my mouse?"). Keep the live op glyph but
  watch her play once to confirm she notices it.
- **Decision:** eraser color — hot pink (recommended, pops on neon) vs pastel.

### F2 — Bottom hotbar + slim status bar · **M+**
Rewrite `hud.ts` around three containers: **(a)** slim **top bar** with one fused
goal card (`Lv 3/6 · MAKE 21 · ▓▓▓░ 4/6`, `MAKE 21` the biggest string in the
game) + a single **⚙ gear** holding Theme, Clear Map, Start Over (each with a
one-line explanation; keep the existing `confirm()`); **(b)** a fixed **toast
layer** (top-center) so celebrations stop reflowing the button row; **(c)** a fixed
**bottom-center hotbar** — Logistics (Belt/Split/Tunnel) | Math (`+ − × ÷`, gated
ops hidden) | Erase (tinted red, far end). 56px slots, glyph + name + hotkey badge.
- **Key fix:** replace independent `paintTools` + `paintOps` (`hud.ts:60/75`) with
  **one `paintSelection()`** over a unified slot list, so Belt and `×` can never
  both look lit. Add `setOp(op)`. Move CSS to one injected `<style>` block.
- **Non-negotiable:** `preventDefault`/`blur` on every button + the `<select>` so
  Space-to-pan doesn't re-fire the last-clicked button (worst case: Start Over).
  The manual verify must exercise "Space-pan right after clicking a button."
- **F2 owns the final hotkey map:** `1` Belt, `2` Split, `3` Tunnel, `4–7` `+ − × ÷`,
  `0` Erase. Badges are the docs; hint line shrinks to `R = rotate · space-drag =
  pan · right-drag = erase`.
- **Decisions:** (a) is a **tablet** a real target? (drives coarse-pointer sizing +
  `touch-action`); (b) add an on-screen **↻ Rotate** button? (recommend yes);
  (c) heads-up — this renumbers hotkeys she may know, so don't ship it the same
  week as F1.

### F3 — Living belts: dead-end warnings · **S** _(only because P2 builds the chevrons)_
A belt is a **dead-end** if the cell it points into fails `acceptsItemAt` (P4).
Dead-end belts **dim to ~0.45 alpha, freeze their treads, grow a soft red cap**
(throbbing on the `performance.now()` pulse) + a small `!`. Operator input tips fed
by nothing throb their `A`/`B` label red. "Moving = good, frozen = fix me."
- **Simplified (in v1, not a follow-up):** **placement grace** — suppress the red
  on any cell painted in the last ~1s or under the placement ghost. Without this,
  painting a normal line flashes red at every growing tip and reads as "you're
  doing it wrong." This is the difference between helpful and naggy.
- **Decision:** belts-only first (recommended) vs also tunnels/splitters now.

### F4 — Copy/paste (marquee stamp) · **L → CUT/DEFER**
**Both lenses ranked this last.** It's an adult power-user solve (marquee, Ctrl/Cmd
chords, all-or-nothing red ghosts, R-rotating a whole stamp — four unfamiliar
concepts stacked) for a "repetition is tedious" complaint **she hasn't made.** At
her factory sizes, she gets satisfaction _from_ redrawing the little motif.
- **If it ever returns** (only after she complains about repetition): ship the
  buttons-only version (no chords), operators included, **no rotation** (rotation
  is the true L delta and the biggest confusion sink). Save format untouched.

### F5 — Sound effects (Web Audio synth) · **M**
Two new files, strict decoupling. `src/audio/sfx.ts` — a zero-dependency synth
(lazy `AudioContext` unlocked on first gesture, master `GainNode`, per-name
throttle, `localStorage`-persisted mute). `src/audio/director.ts` — **this is P4**,
the delta-watcher. Palette: soft click per new belt cell (±6% pitch wobble → drag
sounds like rain, not a machine gun), chunky thunk for operators, pop for erase, a
**rising pentatonic combo ladder** for deliveries (1 chime/frame, caps at step 7,
resets after ~2.5s idle or level-up), a warm two-note **"boop"** for misses
(throttled + suppressed during post-level-up grace), and a level-up fanfare.
- **Simplified:** mute-only (no volume slider) in v1; **no ambient hum** (the #1
  parent-mute trigger); no invalid-placement sound (the red ghost is the "no").
  Mute is a 🔊/🔇 button (absorbed into F2's HUD) + `M`, in `localStorage`.
  `paintBeltLine`/`eraseLine` gain **count-returning signatures** (non-breaking) so
  sound fires only when something changed.
- **Decision:** budget a real listening/tuning pass **with her ears**; test on the
  actual iPad if it's a target (Safari re-suspends the AudioContext).

### F6 — Level-up celebration · **M → S after simplification**
Keep the emotional payoff, **drop the modal.** On level-up (via P3): the sim
catch-up loop breaks at the winning tick (**photo-finish freeze**), **confetti made
of her number bursts from the hub** (DOM overlay, `pointer-events:none`, anchored
via `worldToScreen`, respects `prefers-reduced-motion`), P4's fanfare fires, a big
**"You made 12!"** banner scales in. **Auto-dismisses on any click/keypress or
after ~3s**, defaulting to Keep. On close: unpause, `hud.announceGoal("Now make
30")` (starts the miss-grace window), run the deferred camera-nudge, autosave.
- **Why drop the Keep/Clear modal (both lenses agreed):** in the prime ladder Keep
  is essentially _always_ right, so she'd pick it ~100% of the time — not agency, a
  click-tax that pauses the machine at its coolest moment. And "Clear & Start Fresh"
  one careless click below "Keep" is a build-wiping landmine. **Clear Map already
  exists** (moving behind F2's gear). Re-add the button only if keep/clear friction
  actually shows up in her play.
- **F6 owns the level-up moment** — F7's confetti/shake does _not_ also fire here.
- **Decision:** the pause + input-guard must cover **every** handler (mousedown,
  mousemove-paint, wheel, contextmenu, all keydown branches) — the backdrop blocks
  pointer events but keyboard leaks through otherwise. **No sim changes.**

---

## Bonus tier — visual juice (F7, duplicates removed)

F7 as a standalone feature was ~60% redundant (it re-specs chevrons and level-up
confetti with different mechanisms). Its unique, high-value bits, folded in:

- **Hub fill meter** _(high joy):_ the target's 3×3 body fills bottom-up with
  `delivered/required` — progress on the machine she's watching. One clipped
  `roundRect` in the building loop.
- **Palette fix** _(fixes a real confusion bug):_ items (`0xfff200`) and deposits
  (`0xffea00`) are nearly identical yellows. Nodes → amber `0xffb300` ("ore in the
  ground"); items stay electric yellow. Belt fill `0x2d1b69` → `0x352080` so paths
  read when zoomed out. **This alters the look she already approved — show her.**
- **Item spawn-pop / squash** _(nice-to-have):_ newborns scale `0→1.15→1.0`; items
  shrink as a machine "eats" them. ~15 lines on the `performance.now()` clock.
- **`setHover(cell)`** _(nice-to-have):_ soft outline on the hovered cell/footprint;
  `main.ts` already tracks `hover`.
- **Miner "breathe"** _(garnish):_ brighten the miner body by `sinceEmit/everyTicks`.

Deferred: idle bob (too subtle at this art level); F7's duplicate confetti/shake.

---

## Phased roadmap

Sequenced so shared plumbing lands before its consumers, and so she never relearns
two systems in one week.

### Phase A — "It moves and it talks" (highest joy-per-hour)
1. **P1 clock + P2 marching chevrons** (foundation) — the biggest "is this a real
   game?" win.
2. **F1 cursors** (S) — pure charm; installs the `updateCursor()` authority.
3. **F5 sound + P4 director** (M) — the combo ladder is the biggest raw delight; the
   director is also the event bus Phase C needs.

Ship A as one increment: belts scroll, the cursor becomes the tool, the factory
finds its voice. Give her a heads-up F1/F5 are new.

### Phase B — "It reacts and it celebrates"
4. **F2 hotbar + status bar** (M+) — front-loaded (most invasive `hud.ts` rewrite;
   owns the final hotkey map). F5's mute button + F6's `announceGoal` land _on_ the
   new structure. One-week gap after Phase A so hotkey relearning doesn't stack on
   cursor relearning.
5. **P3 event source + F6 celebration (simplified, no modal)** (S–M).
6. **F3 dead-end warnings** (S) — dim/frozen/red-cap + placement grace in v1.
7. **Bonus tier:** hub fill meter, palette fix (A/B with her), spawn-pop,
   `setHover`, miner breathe — in joy order.

### Phase C — Heavy / speculative (defer)
8. **F4 copy/paste — cut for now.** Revisit only if she complains about repetition;
   then buttons-only, no-rotation, operators-included v1.
9. F7 idle bob; tablet-specific sizing (only if confirmed); a styled in-game dialog
   to replace browser-native `confirm()`.

**Explicitly cut/deferred:** F4 entirely; F6's Keep/Clear modal; F1 directional
cursors; F5 volume slider + ambient hum; F7's duplicate confetti/shake.

---

## Open questions for the uncle

**Resolved 2026-07-17:**
- **(1) Tablet/iPad a real target? → YES.** F2 uses coarse-pointer sizing +
  `touch-action`; F5 handles Safari's AudioContext re-suspend (resume on gesture +
  `visibilitychange`). Follow-up flagged: touch **drag** for belt-painting needs
  Pointer Events (the game is mouse-event-only today) — tracked separately.
- **(2) Palette change → INCLUDE, show her.** Amber deposits (`0xffb300`) vs
  electric-yellow items ship as part of the juice tier; show her the before/after.
- **(3) Proceed → BUILD PHASE A NOW**, keeping this doc in place.

**Still open:**
1. **Hotkey renumber + F1/F2 timing:** OK to change the number keys she may know,
   and to _not_ ship F1 and F2 the same week?
4. **Sound tuning with her:** can we get a short listening pass with her before
   finalizing gains/throttles? (The one part tests can't verify.)
5. **Eraser cursor color:** hot pink (recommended) or pastel?
6. **Confirm the F4 cut:** defer copy/paste until she asks for it?

**Files that change, at a glance:** `src/input/cursors.ts` (new), `src/audio/sfx.ts`
+ `director.ts` (new), `src/ui/celebrate.ts` (new), `src/render/fx.ts` (new, bonus);
edits to `src/ui/hud.ts`, `src/main.ts`, `src/render/pixi-renderer.ts` +
`renderer.ts`, `src/sim/buildings.ts` + `tick.ts`, `src/input/place.ts`.
**No save-format changes in any phase.**
