# Belt Factory — Beltmatic Rework Implementation Plan

**Overview.** This plan converts the current one-entity-per-cell world into a Beltmatic-style model: 1×1 directional belts stay as they are, while miners, operators, and the target become **3×3 rotatable buildings** with edge ports, sitting on a new **ground layer of resource nodes**. The single source of truth for building geometry (footprint, ports, rotation) is one pure module, `sim/buildings.ts`, that the tick, placement, and renderer all import — this is the deliberate de-risking of the one novel algorithm the whole item-flow depends on. World state splits into three stores (`belts`, `buildings`, `nodes`) plus one derived spatial index (`occupancy`); the sim stays pure, deterministic, and BigInt-valued. We land the sim engine and its tests first, then save/worldgen/placement, then the renderer, then HUD/main wiring, then a full end-to-end pass. Old saves start fresh (`SAVE_VERSION = 2`).

**Key design decisions** (these reconcile the five specs against the critique — lock them before coding):

- **One storage model.** `belts: Map<key, BeltCell>` (1×1) + `buildings: Map<anchorKey, Building>` (anchor = top-left of the 3×3) + `nodes: Map<key, ResourceNode>` (ground) + `occupancy: Map<key, anchorKey>` (derived, rebuilt on load). The `OccupiedCell`-filler model is rejected.
- **No building ids.** A building's anchor cell is its unique, immutable key. Drop `nextBuildingId`/`maxId` bookkeeping.
- **One derived index, not two.** An in-port edge cell *is* a footprint cell, so a single `occupancy` map answers placement-overlap, node-cover suppression, and the tick's "which building did I step into." No separate `footprint`/`inPorts`.
- **One geometry module.** `sim/buildings.ts` owns `centerOf`/`footprintOf`/`coversCell`/`portsOf` (cold paths) and a non-allocating `inPortSlot` matcher + inline out-cell math (hot path). No facet re-derives ports. Rotation tables live once in `grid.ts`.
- **Miner value cached, center-only node.** Value is read from the node under the footprint **center** at placement and stored; the tick never dereferences a node (rejects the live-read crash). Centered-on-cursor placement makes "click the node" line the center up.
- **Target accepts all 4 sides** (forgiving, always solvable). `target.dir` is vestigial/decorative.
- **Discriminated union** `type: 'miner' | 'operator' | 'target'`; render narrows on `type`, no optional-field interface.
- **Silent-failure feedback (critique Gap B), minimal:** the renderer flags a building whose output cell has no belt (pure read, dim/red output arrow); a `misses` counter drives a non-punishing "Not yet — try again!" HUD flash when a wrong value hits the target.
- **Buildings emit only onto belts;** building→building never hands off directly (route with a belt). `applyOp`/`OpId` stay imported from `content/` (`sim → content` is allowed, cycle-free).

---

## Global constraints (unchanged from the MVP plan, restated)

- TS strict. `src/sim/` imports nothing from `render/`/`ui/`/`net/`/PixiJS/DOM/Node. `sim → content` (for `OpId`/`applyOp`) is allowed; `content → sim` (types) is allowed; no cycle.
- Rendering reads sim state, never mutates it. Sim is deterministic given inputs + tick count; worldgen deterministic from `(seed, cx, cy)`.
- Values are `BigInt`, serialized as `{ "__big": "<decimal>" }`. Fixed 10 ticks/s; render interpolates via `alpha`.
- Save is versioned; `occupancy` is derived and never serialized. Keep the tick allocation-light.

## Contract lock (shared shapes every task imports)

```ts
// sim/grid.ts — direction algebra (single home; y-down screen ⇒ CW = up→right→down→left)
export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];
export const DELTA:    Record<Direction, { dx: number; dy: number }>; // unchanged
export const OPPOSITE: Record<Direction, Direction> = { up:'down', down:'up', left:'right', right:'left' };
export const RIGHT_OF: Record<Direction, Direction> = { up:'right', right:'down', down:'left', left:'up' };
export const LEFT_OF:  Record<Direction, Direction> = { up:'left', left:'down', down:'right', right:'up' };

// sim/entities.ts — belts + nodes only (Cell union + accepts() deleted)
export interface BeltCell { type: 'belt'; dir: Direction }
export interface ResourceNode { x: number; y: number; value: bigint }

// sim/buildings.ts — buildings (anchor = top-left of 3×3; center = (ax+1, ay+1))
export type BuildingType = 'miner' | 'operator' | 'target';
interface Base { ax: number; ay: number; dir: Direction }
export interface MinerBuilding    extends Base { type: 'miner';    value: bigint; everyTicks: number; sinceEmit: number }
export interface OperatorBuilding extends Base { type: 'operator'; op: OpId; inputs: bigint[] }   // ≤2; slot0=LEFT_OF side, slot1=RIGHT_OF side
export interface TargetBuilding   extends Base { type: 'target';   target: bigint }               // dir vestigial (4-side input)
export type Building = MinerBuilding | OperatorBuilding | TargetBuilding;
export const FOOTPRINT = 3;

// sim/grid.ts — GameState
export interface GameState {
  version: number; seed: number; tick: number;
  belts:      Map<string, BeltCell>;    // 1×1
  buildings:  Map<string, Building>;    // key = cellKey(ax, ay)
  nodes:      Map<string, ResourceNode>;
  occupancy:  Map<string, string>;      // DERIVED: any footprint cell → anchor key; not serialized
  loadedChunks: Set<string>;
  items: Item[]; nextItemId: number;
  misses: number;                       // wrong-value-at-target count (feedback; not serialized)
  status: 'playing' | 'won';
}
```

Module dependency check: `grid.ts` type-imports `BeltCell`/`ResourceNode` (entities) and `Building` (buildings); `buildings.ts` value-imports `DELTA`/rotation tables/`cellKey`/`GameState` from grid and type-imports `OpId` from content. Only type-only edges close any loop — same safe pattern as today's `grid ↔ entities`.

## File map (this rework)

```
src/sim/grid.ts        # rotation tables, reshaped GameState, beltAt/setBelt/itemAt/emptyState   (rewrite)
src/sim/entities.ts    # BeltCell + ResourceNode; delete Cell union + accepts()                  (rewrite)
src/sim/buildings.ts   # NEW: Building union, geometry, occupancy + add/remove helpers
src/sim/tick.ts        # mine/produce/move on the new stores                                     (rewrite)
src/sim/save.ts        # SAVE_VERSION=2, three-store round-trip, rebuildOccupancy                (rewrite)
src/sim/world.ts       # ChunkContent, three-collection ensureChunk, instantiateBuilding         (rewrite)
src/content/worldgen.ts# AuthoredBuilding origin puzzle → ChunkContent                           (rewrite)
src/content/operations.ts # unchanged
src/input/place.ts     # footprint-aware belt paint, placeMiner/Operator, eraseAt/eraseLine      (rewrite)
src/render/renderer.ts # Theme fields, Preview + setPreview                                       (edit)
src/render/themes.ts   # miner/node/nodeText/arrow/buildingText per theme                         (edit)
src/render/format.ts   # NEW: formatValue (pure)
src/render/pixi-renderer.ts # layered draw, drawBelt/Node/Building/Ghost/arrow, no-belt warning   (rewrite)
src/ui/hud.ts          # tool selector, target from buildings, "Not yet" flash                    (edit)
src/main.ts            # tool state, R rotate, mousedown/move routing, ghost, loadOrNewGame guard (edit)
+ matching *.test.ts rewrites; new buildings.test.ts; rewritten game.e2e.test.ts
```

---

## Phase A — Sim engine + tests

### Task 1: Reshape state & direction algebra
**Files:** rewrite `src/sim/grid.ts`, `src/sim/entities.ts`; update `src/sim/grid.test.ts`, `src/sim/entities.test.ts`.
**Consumes:** nothing new. **Produces:** the contract-lock `grid.ts`/`entities.ts` shapes above, plus:
`cellKey`/`parseKey` (unchanged), `beltAt(s,x,y)`, `setBelt(s,x,y,cell|null)`, `itemAt` (unchanged), `emptyState(seed)` (inits the three maps + `occupancy`/`misses`, `version:2`).

- [ ] **Step 1 — rewrite `entities.ts`:** delete `Cell`, `ExtractorCell`, `OperatorCell`, `SinkCell`, `OpId`, `accepts()`. Export `BeltCell` and `ResourceNode` only.
- [ ] **Step 2 — rewrite `grid.ts`:** add `DIRECTIONS`, `OPPOSITE`, `RIGHT_OF`, `LEFT_OF`; keep `DELTA`. Replace `cells` field with `belts`/`buildings`/`nodes`/`occupancy`; add `misses`. Rename `cellAt`→`beltAt`, `setCell`→`setBelt` (belts map only). `emptyState` returns all four maps empty, `misses:0`, `version:2`.
- [ ] **Step 3 — tests:** update `grid.test.ts` for `beltAt`/`setBelt`/`emptyState` (assert `belts/buildings/nodes/occupancy` empty). Rewrite `entities.test.ts` to just assert the two interfaces compile / trivially construct (delete the `accepts` suite). Add rotation-table assertions: `RIGHT_OF.right==='down'`, `OPPOSITE.up==='down'`, `LEFT_OF.right==='up'`.
- **Verify:** `npx vitest run src/sim/grid.test.ts src/sim/entities.test.ts` PASS.

### Task 2: Building geometry module (the de-risk)
**Files:** create `src/sim/buildings.ts`, `src/sim/buildings.test.ts`.
**Consumes:** `Direction`/`DELTA`/`DIRECTIONS`/`OPPOSITE`/`RIGHT_OF`/`LEFT_OF`/`GameState`/`cellKey`/`beltAt` from grid; `OpId` from `content/operations`.
**Produces:**

```ts
export function centerOf(b: Building): { x: number; y: number };            // (ax+1, ay+1)
export function footprintOf(b: Building): { x: number; y: number }[];       // 9 cells (cold path)
export function coversCell(b: Building, x: number, y: number): boolean;     // inline range test
export function outCell(b: Building): { x: number; y: number };             // O_front = center + 2·DELTA[dir]

export interface Port { role: 'in' | 'out'; slot: number; side: Direction; dir: Direction }
export function portsOf(b: Building): Port[];        // cold: render draws arrows from this
export function inPortSlot(b: Building, x: number, y: number): number;      // hot: slot ≥0 if (x,y) is an in-EDGE cell, else -1

// occupancy + state mutation (sim-owned; input calls these, never writes the layout itself)
export function buildingAt(s: GameState, x: number, y: number): Building | undefined;   // occupancy → buildings
export function isBlocked(s: GameState, x: number, y: number): boolean;                 // belt OR building (NOT node)
export function addBuilding(s: GameState, b: Building): boolean;    // rejects if any footprint cell isBlocked; indexes occupancy
export function removeBuildingAt(s: GameState, x: number, y: number): boolean;          // deindex + delete by occupancy hit
export function rebuildOccupancy(s: GameState): void;              // clear + reindex all buildings (call after deserialize)
```

Geometry rules (encode exactly): center `c=(ax+1,ay+1)`. Edge cell on absolute side `s` is `c+DELTA[s]`; external belt cell is `c+2·DELTA[s]`. Ports: **miner** → one `out` on `dir`; **operator** → `out` on `dir`, `in` slot 0 on `LEFT_OF[dir]`, `in` slot 1 on `RIGHT_OF[dir]`; **target** → `in` on all four `DIRECTIONS` (slot 0). `Port.dir` = travel-through-port direction (out: `side`; in: `OPPOSITE[side]`). `inPortSlot` computes the ≤4 in-edge cells inline (no array allocation beyond the module-const `DIRECTIONS`) and returns the matching slot or `-1` (miner always `-1`; front out-edge, back, corners, center all `-1`).

- [ ] **Step 1 — write geometry + occupancy helpers** per the rules above. `addBuilding` iterates the 9 `footprintOf` cells, returns `false` if any `isBlocked`, else sets `buildings.set(anchorKey,b)` and `occupancy.set(cellKey,anchorKey)` for all 9. `removeBuildingAt` resolves the anchor via `occupancy`, deletes all 9 occupancy keys + the building.
- [ ] **Step 2 — geometry unit test** (the mandated harness): for each of the 4 facings × each type, assert `outCell` and the in-edge cells. Concrete anchor `(0,0)`, facing `right`: `outCell==={x:3,y:1}`; operator `inPortSlot(op,1,0)===0` (top/left-of) and `inPortSlot(op,1,2)===1` (bottom); `inPortSlot(op,2,1)===-1` (front out-edge not an in-port); target `inPortSlot(tg, 0,1)`/`(2,1)`/`(1,0)`/`(1,2)` all `===0`, corner `(0,0)===-1`. Add an `addBuilding` overlap-rejection test (two overlapping 3×3 → second returns `false`) and a `rebuildOccupancy` test (clear, reindex, `buildingAt` resolves every footprint cell).
- **Verify:** `npx vitest run src/sim/buildings.test.ts` PASS.

### Task 3: The tick — mine / produce / move
**Files:** rewrite `src/sim/tick.ts`, `src/sim/tick.test.ts`.
**Consumes:** `GameState`/`DELTA`/`beltAt`/`cellKey` (grid); `Building`/`centerOf`/`outCell`/`inPortSlot`/`buildingAt` (buildings); `createItem` (items); `applyOp` (content). **Produces:** `TICKS_PER_SECOND`, `step(state)`.

Preserve today's proven shape and the produce-before-move "settle" comment; only the source/consume sites change.

- [ ] **Step 1 — `step`:** `for it: it.px=it.x; it.py=it.y` → `mine` → `produce` → `move` → `tick++`.
- [ ] **Step 2 — `mine`:** iterate `buildings.values()`; skip non-`miner`; `sinceEmit++`; when `>=everyTicks`, compute `outCell(b)`; if a belt is there and `!occupied`, push `createItem(nextItemId++, b.value, ox, oy)` and reset `sinceEmit`. (Mirror of today's `emit`, from the out cell; `canEmitOnto = beltAt(...) && !occupied(...)`.)
- [ ] **Step 3 — `produce`:** iterate `buildings.values()`; operators with `inputs.length>=2`; if out-cell belt free, push `applyOp(b.op, inputs[0], inputs[1])` there and `inputs.splice(0,2)`.
- [ ] **Step 4 — `move`:** keep the `while(progressed)` downstream-first loop. For an item on `beltAt(it.x,it.y)` (else `moved.add`), target `(tx,ty)=it+DELTA[belt.dir]`, `key=cellKey(tx,ty)`:
  1. `beltAt(key)` → advance iff `!occupied(state,tx,ty,removed)` (today's rule; else leave unmarked to retry).
  2. else `buildingAt(state,tx,ty)`: `slot=inPortSlot(b,tx,ty)`. If `b.type==='operator' && slot>=0`: `inputs.length<2 ? (push, removed.add, progressed) : moved.add` (back-pressure). If `b.type==='target' && slot>=0`: `it.value===b.target ? status='won' : state.misses++`; `removed.add; progressed`. If `slot<0` → `moved.add` (non-port footprint / miner face → stop, harmless).
  3. else (empty / node-only ground / edge) → `moved.add`.
  Rebuild `items` once from `removed` at the end. `occupied()` unchanged.
- [ ] **Step 5 — tests:** port today's `tick.test.ts` to the new model. Belt movement/train/interpolation tests carry over verbatim (belts unchanged). Rewrite the machine tests to place buildings via `addBuilding` and feeder belts at the ports: miner emits onto its out belt every N ticks; operator consumes both side inputs and emits the sum on the front out belt after the one-tick settle; target wins on exact match and `misses++` (status stays `playing`) on mismatch. Add a regression: an item stepping onto a **non-port footprint cell** stops (no crash, no consume).
- **Verify:** `npx vitest run src/sim/tick.test.ts` PASS.

---

## Phase B — Save, worldgen, placement

### Task 4: Save v2
**Files:** rewrite `src/sim/save.ts`, `src/sim/save.test.ts`.
**Consumes:** `GameState` (grid), `rebuildOccupancy` (buildings). **Produces:** `SAVE_VERSION=2`, `serialize`, `deserialize`.

- [ ] **Step 1 — serialize:** keep the `__big` replacer/reviver verbatim. Emit `{ version:2, seed, tick, status, nextItemId, items, belts:[...entries], buildings:[...entries], nodes:[...entries], chunks:[...loadedChunks] }`. Omit `occupancy` and `misses`.
- [ ] **Step 2 — deserialize:** parse; **if `version !== 2` throw** (old/unknown → caught by `loadOrNewGame` → fresh). Rebuild `belts`/`buildings`/`nodes` from entries, `occupancy=new Map()`, `misses:0`, then `rebuildOccupancy(state)`. Return.
- [ ] **Step 3 — tests:** round-trip a state with belts + one miner (cached `value`) + operator (`inputs:[7n]`) + target + a node + a big-BigInt item; assert maps reconstruct, `value`/`inputs`/`target`/node `value`/item `value` are `bigint`, `occupancy` is rebuilt (`buildingAt` resolves a footprint cell), version stamped 2, and a `{version:1,...}` string throws.
- **Verify:** `npx vitest run src/sim/save.test.ts` PASS.

### Task 5: Worldgen + chunk merge
**Files:** rewrite `src/sim/world.ts`, `src/content/worldgen.ts`; update `src/sim/world.test.ts`, `src/content/worldgen.test.ts`.
**Consumes:** `GameState`/`cellKey`/`beltAt`/`setBelt`/`emptyState` (grid); `ResourceNode` (entities); `Building`/`isBlocked`/`addBuilding`/`coversCell` (buildings); `OpId` (operations). **Produces:**

```ts
// world.ts
export interface ChunkContent {
  belts?:     { x: number; y: number; dir: Direction }[];
  nodes?:     ResourceNode[];
  buildings?: AuthoredBuilding[];        // anchor coords, no runtime state
}
export type ChunkGenerator = (seed: number, cx: number, cy: number) => ChunkContent;
export function ensureChunk(state, gen, cx, cy): void;    // three-collection, non-destructive
export function ensureChunksInRange(...): void;           // unchanged loop
export function newGame(seed, gen): GameState;            // empty + origin chunk
```

- [ ] **Step 1 — `ensureChunk`:** keep once-per-chunk + non-destructive guarantee, **nodes → buildings → belts** order. Add each node only if its key is absent. For each authored building call `instantiateBuilding` (below). Add each belt only if `!isBlocked` (no belt, no building) at that cell.
- [ ] **Step 2 — `instantiateBuilding(state, ab)`:** anchor `(ab.x,ab.y)`; build the runtime object (`inputs:[]`/`sinceEmit:0`); for a **miner**, read `nodes.get(cellKey(ax+1,ay+1))` (center) — if absent, **skip** (never author a nodeless miner); set `value=node.value`. Call `addBuilding` (which rejects on footprint conflict, keeping resume non-destructive). Fabricates a fresh object each call (replaces `cloneCell`).
- [ ] **Step 3 — `worldgen.ts`:** author the origin puzzle as data (anchors), map to `ChunkContent`; non-origin → `{}`. Layout (verified solvable under 4-side target + center-node miners):

```ts
export const TARGET = 12n; const EVERY = 8;
type AuthoredBuilding =
  | { type:'miner';    x:number; y:number; dir:Direction }
  | { type:'operator'; x:number; y:number; dir:Direction; op:OpId }
  | { type:'target';   x:number; y:number; dir:Direction; target:bigint };
const ORIGIN = {
  nodes: [ {x:2,y:2,value:7n}, {x:2,y:8,value:5n},  /* optional loose practice node: */ {x:6,y:12,value:3n} ],
  buildings: [
    { type:'miner',    x:1,  y:1, dir:'right' },              // center (2,2)=7  → out (4,2)
    { type:'miner',    x:1,  y:7, dir:'right' },              // center (2,8)=5  → out (4,8)
    { type:'operator', x:7,  y:4, dir:'right', op:'add' },    // center (8,5); ins (8,4)top/(8,6)bot; out (10,5)
    { type:'target',   x:12, y:4, dir:'right', target:TARGET }, // center (13,5); in on left edge (12,5)
  ],
};
export const mvpGenerator: ChunkGenerator = (_s,cx,cy)=> cx===0&&cy===0 ? {nodes:ORIGIN.nodes, buildings:ORIGIN.buildings} : {};
```

- [ ] **Step 4 — tests:** `world.test.ts`: chunk math unchanged; `ensureChunk` places nodes+buildings once, non-destructive on re-run, a miner over a node caches its value, an authored building whose footprint is pre-occupied is skipped. `worldgen.test.ts`: origin has 2 nodes (7,5) + miner/operator/target authored inside `0..13`; non-origin returns `{}`; two generator calls yield independent mutable `inputs`.
- **Verify:** `npx vitest run src/sim/world.test.ts src/content/worldgen.test.ts` PASS.

### Task 6: Placement + input helpers
**Files:** rewrite `src/input/place.ts`, `src/input/place.test.ts`.
**Consumes:** `GameState`/`Direction`/`beltAt`/`setBelt`/`cellKey`/`RIGHT_OF` (grid); `nodeAt` (grid: `nodes.get`); `Building`/`isBlocked`/`buildingAt`/`addBuilding`/`removeBuildingAt` (buildings); `OpId` (operations). **Produces:**

```ts
export const ROTATE_CW = RIGHT_OF;                        // R cycles right→down→left→up (shared with facing)
export function footprintCells(cx: number, cy: number): {x:number;y:number}[];   // 9 cells centered on (cx,cy)
export function footprintClear(state, cx, cy): boolean;   // every cell !isBlocked (nodes ignored — separate layer)
export function canPlaceMiner(state, cx, cy): boolean;    // footprintClear && node at CENTER (cx,cy)
export function canPlaceOperator(state, cx, cy): boolean; // footprintClear
export function placeMiner(state, cx, cy, dir, everyTicks=8): boolean;   // center cx,cy → anchor (cx-1,cy-1)
export function placeOperator(state, cx, cy, dir, op:OpId='add'): boolean;
export function eraseAt(state, x, y): boolean;            // belt OR whole building; target protected; never nodes
export function eraseLine(state, ax, ay, bx, by): void;   // Manhattan, footprint-aware, idempotent
// belt fns kept but footprint-aware:
export function paintBeltLine(state, ax, ay, bx, by, endDir): void;      // placeOrOrientBelt skips isBlocked-by-building cells
export function removeCell(state, x, y): boolean;         // belt only; drops stranded item (unchanged)
```

- [ ] **Step 1 — belts:** keep the Manhattan paint/`placeOrOrientBelt`/`dirBetween` logic; the only change is `placeOrOrientBelt` no-ops on any cell where `buildingAt` is set (belts can't overlap buildings). Belts *may* sit over a node (nodes are a separate layer).
- [ ] **Step 2 — buildings:** `placeMiner` requires `footprintClear` **and** a node under center; builds the miner (value from center node) and calls `addBuilding` at anchor `(cx-1,cy-1)`. `placeOperator` requires `footprintClear`. Center-on-cursor throughout.
- [ ] **Step 3 — erase:** `eraseAt` → belt via `removeCell`; else `buildingAt` → `removeBuildingAt` **unless** it's a `target` (protected so a 9-year-old can't delete the goal); never touches nodes. `eraseLine` walks the Manhattan path calling `eraseAt` (idempotent on recross).
- [ ] **Step 4 — tests:** rewrite `place.test.ts` to the new semantics: belt paints around a building footprint without overwriting; `footprintClear` false when any cell overlaps a belt/building, true over bare nodes; `canPlaceMiner` requires the center node; `placeMiner` rejects when no center node; `placeOperator` rejects on overlap; `eraseAt` from a non-anchor footprint cell removes the whole building; `eraseAt` refuses a target; `removeCell` still drops a stranded item.
- **Verify:** `npx vitest run src/input/place.test.ts` PASS; then `npm test` — all Phase A/B suites green.

---

## Phase C — Render

### Task 7: Theme fields, format helper, renderer interface
**Files:** edit `src/render/renderer.ts`, `src/render/themes.ts`; create `src/render/format.ts`.

- [ ] **Step 1 — `renderer.ts` `Theme`:** drop `extractor`; keep `operator`/`sink` (sink = target/hub body); add `miner`, `node`, `nodeText`, `arrow`, `buildingText`. Add `interface Preview { type: BuildingType; ox: number; oy: number; dir: Direction; valid: boolean }` and `setPreview(p: Preview | null): void` to `Renderer`.
- [ ] **Step 2 — `themes.ts`:** fill the new fields per theme (chunkyToy miner `0x757575`/node `0xd4a017`/nodeText `0x3e2723`/arrow `0xffffff`/buildingText `0xffffff`; cleanFlat miner `0x90a4ae`/node `0xcbb26a`/nodeText `0x4e342e`/arrow `0x334155`/buildingText `0x1f2937`; neonArcade miner `0x7c4dff`/node `0xffea00`/nodeText `0x0d0221`/arrow `0x00e5ff`/buildingText `0xffffff`). Remove `extractor` keys.
- [ ] **Step 3 — `format.ts`:** pure `fitSize(text, boxPx, base)` (clamp label to a 3-cell box) and `formatValue(v: bigint): string` (full digits under 100000, else K/M/B/T; early game returns full — this is cheap polish, not a gate).
- **Verify:** `npx tsc --noEmit` clean (render not yet using the fields is fine).

### Task 8: PixiRenderer for buildings/nodes/arrows
**Files:** rewrite `src/render/pixi-renderer.ts`.
**Consumes:** `beltAt`/`buildingAt`/`DELTA`/`OPPOSITE` (sim), `Building`/`portsOf`/`outCell`/`FOOTPRINT` (buildings), `CHUNK_SIZE` (world), `formatValue`/`fitSize` (format). Keep the pooled two-`Graphics` + `Text[]` design (no per-frame allocation), `visibleCellRange`/`visibleChunkRange`/`screenToWorld`/interpolation untouched.

- [ ] **Step 1 — layered `draw(state, alpha)`** in `cellG` call-order: grid lines → nodes → belts(+chevron) → building bodies(+arrows+labels) → preview ghost; `itemG` unchanged; labels pooled on top.
- [ ] **Step 2 — routines:** `drawNode` (rounded ground patch; suppressed when `buildingAt(x,y)`); `drawBelt` (today's rounded square + small centered chevron via a reusable `arrow` triangle helper); `drawBuilding` — iterate `state.buildings.values()`, cull by footprint∩range; body color by `type` (`miner`/`operator`/`sink`); from `portsOf(b)` draw a **bold out-arrow** per `out` port pointing `dir` and a **small in-chevron** per `in` port pointing `OPPOSITE[side]`; center label via `fitSize` (miner→`formatValue(value)`, operator→`OPERATIONS[op].symbol`, target→`formatValue(target)`), fill `buildingText`.
- [ ] **Step 3 — no-output feedback (Gap B):** in `drawBuilding`, for miner/operator, if `beltAt(outCell(b))` is undefined, render the out-arrow dim/red (warning) so a butted-up dead factory is visible. Pure read; no sim change.
- [ ] **Step 4 — `setPreview`/`drawGhost`:** translucent body + facing arrow tinted green (`valid`) / red (invalid).
- **Verify:** `npx tsc --noEmit` clean; visual check deferred to Task 10's browser run.

---

## Phase D — HUD + main wiring

### Task 9: Tool selector, rotate, ghost, loader guard
**Files:** edit `src/ui/hud.ts`, `src/main.ts`.

- [ ] **Step 1 — `hud.ts`:** add a `[Belt][Miner][Operator]` button group mirroring the dir buttons (highlight active), an `onTool` callback, and `setDir`/`setTool` setters so keyboard stays in sync. `update()` reads the goal by scanning `state.buildings.values()` for `type==='target'` → `target`. Add a transient "Not yet — try again!" banner that flashes when `state.misses` increases (track last-seen `misses`; show ~1.5s), separate from the green win banner.
- [ ] **Step 2 — `main.ts` state:** `type Tool='belt'|'miner'|'operator'`; `tool='belt'`; shared `placeDir='right'` (belt end-dir *and* building facing); `hover` cell. `createHud(parent, onTheme, onDir=(d)=>placeDir=d, onTool=(t)=>tool=t)`.
- [ ] **Step 3 — input routing:** `mousedown` → right button = erase (`eraseLine`, any tool); left+belt = `paintBeltLine` (drag paint); left+miner/operator = single centered `placeMiner`/`placeOperator`, `paintMode=null` (no building drag). `mousemove` → track `hover`; if painting, belt drag / right-drag erase only. `keydown` → `r/R` = `placeDir=ROTATE_CW[placeDir]` + `hud.setDir`; `1/2/3` = tool select + `hud.setTool`; arrow-pan unchanged.
- [ ] **Step 4 — ghost:** each `frame()`, compute `ok = tool==='belt' ? true : tool==='miner' ? canPlaceMiner(state,hover) : canPlaceOperator(state,hover)`; `renderer.setPreview(hover ? { type:tool==='miner'?'miner':'operator', ox:hover.x-1, oy:hover.y-1, dir:placeDir, valid:ok } : null)` (belt tool → `null`).
- [ ] **Step 5 — loader guard:** update `loadOrNewGame` to `Array.isArray(s.items) && s.belts instanceof Map && s.buildings instanceof Map && s.nodes instanceof Map && s.loadedChunks instanceof Set` (v1 saves throw in `deserialize` → fresh game). Keep autosave/beacon as-is.
- **Verify:** `npx tsc --noEmit` clean; `npm run build` succeeds.

---

## Phase E — End-to-end

### Task 10: e2e integration + browser verification
**Files:** rewrite `src/game.e2e.test.ts`; run the full suite + a real browser pass.

- [ ] **Step 1 — puzzle build test:** `newGame(1, mvpGenerator)`; assert `buildingAt(2,2)` is a miner with `value===7n`, `buildingAt(2,8)` miner `5n`, an `operator` at center (8,5), a `target` at center (13,5) with `target===12n`, and nodes 7/5 present.
- [ ] **Step 2 — route-to-win test:** paint the verified belt runs and `step` to `status==='won'`:
  - 7-line: `(4,2)r,(5,2)r,(6,2)r,(7,2)r,(8,2)down,(8,3)down` → operator top-in `(8,4)`.
  - 5-line: `(4,8)r,(5,8)r,(6,8)r,(7,8)r,(8,8)up,(8,7)up` → operator bottom-in `(8,6)`.
  - product: `(10,5)r,(11,5)r` → target left-in `(12,5)`.
  Assert a win within a tick budget and that `misses===0`.
- [ ] **Step 3 — resume test:** run ~10 ticks mid-flight (`status==='playing'`, items in flight), `deserialize(serialize(s))`, assert maps/`occupancy` rebuilt (`buildingAt` resolves), `tick` preserved, then run to win.
- [ ] **Step 4 — silent-failure regression (Gap B):** place a miner whose `outCell` has no belt (or is butted against a building) and `step` many ticks: assert no throw, no item spawns, and — with a belt+target added and a wrong value delivered — `state.misses` increments while `status` stays `playing`.
- [ ] **Step 5 — full verify:** `npm test` (all suites green). Then browser: `npm run dev`, log in, select Miner/Operator tools, `R` to rotate, place over the nodes, drag-paint belts to the ports, watch it run to the win banner; refresh and confirm resume; delete a belt and rebuild; confirm the target can't be erased and the "no output belt" arrow warning shows on an unconnected building.
- **Verify:** full `npm test` PASS + the browser checklist above.

---

**Cut per the critique:** numeric building ids / `nextBuildingId` / `maxId`; the second spatial index (`footprint`+`inPorts` → single `occupancy`); per-item `Port[]` allocation in `move` (→ `inPortSlot`); the `OccupiedCell` 9-cell smear (→ dedicated `buildings` map); the render "miner with no node" dead branch (placement/worldgen guarantee a concrete `value`); duplicate rotation helpers (→ one set in `grid.ts`); single-front target (→ 4-side, which also makes the origin puzzle solvable). `formatValue` is kept but ungated (early numbers render full).