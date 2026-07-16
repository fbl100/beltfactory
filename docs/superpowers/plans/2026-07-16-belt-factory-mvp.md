# Belt Factory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable, resumable, minimal-auth web belt-factory math game on an **unbounded chunked world** with a manual pan/zoom camera, a PixiJS renderer proven out via a live theme switcher, and a fully-tested pure simulation.

**Architecture:** A pure, deterministic, fixed-timestep simulation in `src/sim/` (no rendering/DOM/network imports) drives everything. The world is a **sparse `Map`-based grid** with no fixed size, divided into 16×16 **chunks** generated on demand by a pure generator (origin chunk = authored puzzle; all else = empty buildable land for the MVP). A `Renderer` interface in `src/render/` owns a **camera** and draws only visible cells with PixiJS, styled entirely from a swappable `Theme`. A single Node + Express server hosts the built frontend and a tiny JSON API for seeded-user auth and per-user save/resume. Ships via `docker-compose`.

**Tech Stack:** TypeScript (strict), Vite, PixiJS v8, Vitest, Express, bcryptjs, cookie-session, tsx, Docker Compose.

## Global Constraints

- TypeScript strict mode ON.
- `src/sim/` MUST NOT import from `render/`, `ui/`, `net/`, `content/`, PixiJS, or any DOM/Node API. Pure functions and plain data only. (`content/` MAY import types from `sim/`; `sim/` never imports `content/`.)
- Rendering reads sim state; it NEVER mutates it.
- Simulation is deterministic given the same inputs and tick count. World generation is deterministic from `(seed, chunkX, chunkY)` — never `Math.random`.
- The world is **unbounded and sparse**: cells in a `Map<"x,y", Cell>`, coordinates may be negative. No `width`/`height`.
- Item/target values are `BigInt`. Serialized as `{ "__big": "<decimal>" }`.
- Fixed-timestep sim at ~10 ticks/s (constant). Render loop is separate (rAF) and interpolates between ticks via an `alpha` in [0,1].
- Save format is versioned (`version` field gates migrations); it stores the full cell `Map`, `loadedChunks`, items, `nextItemId`, `tick`, `status`, and `seed`.
- No heavy deps beyond the stack above. No native-build deps (use `bcryptjs`, not `bcrypt`).
- No online features, accounts beyond the seeded list, analytics, or monetization.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
Dockerfile, docker-compose.yml, .dockerignore, .gitignore, .env.example

src/
  sim/
    grid.ts          # sparse GameState, cell keys, cellAt/setCell, directions
    grid.test.ts
    items.ts         # Item type, createItem, BigInt value
    items.test.ts
    entities.ts      # Cell union: belt/extractor/operator/sink + accept rules
    entities.test.ts
    world.ts         # CHUNK_SIZE, chunk math, ChunkGenerator, ensureChunk, newGame
    world.test.ts
    tick.ts          # step(state): emit/move/produce/win (Map iteration)
    tick.test.ts
    save.ts          # serialize/deserialize (Map/Set/BigInt, versioned)
    save.test.ts
  content/
    operations.ts    # OpId, OPERATIONS (addition)
    operations.test.ts
    worldgen.ts      # ChunkGenerator: origin puzzle now, deposits later
    worldgen.test.ts
  render/
    renderer.ts      # Renderer interface + Theme + Camera types
    themes.ts        # THEMES: chunkyToy / cleanFlat / neonArcade
    pixi-renderer.ts # PixiJS implementation with camera + interpolation
  input/
    place.ts         # placeBelt/removeCell on the sparse world
    place.test.ts
  net/
    api.ts           # apiLogin/apiMe/apiLogout/apiGetState/apiSaveState
  ui/
    login.ts         # login form overlay
    hud.ts           # target readout, theme switcher, belt-direction buttons, win banner
  main.ts            # bootstrap: login, fixed-tick + rAF loops, camera, chunk streaming

server/
  users.ts           # seeded USERS (bcrypt), verifyUser
  users.test.ts
  storage.ts         # per-user JSON load/save under data/
  storage.test.ts
  index.ts           # Express: static hosting + /api routes + session
  express-session.d.ts
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: working `npm run dev` / `npm run build` / `npm test`. Vite dev server proxies `/api` → `http://localhost:3000`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "belt-factory",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"vite\" \"tsx watch server/index.ts\"",
    "build": "tsc --noEmit && vite build",
    "start": "tsx server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cookie-session": "^2.1.0",
    "express": "^4.19.2",
    "pixi.js": "^8.2.0"
  },
  "devDependencies": {
    "@types/cookie-session": "^2.0.49",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "concurrently": "^8.2.2",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "server"]
}
```

- [ ] **Step 3: Create `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node' } });
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Belt Factory</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
      #app { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
data
.env
```

- [ ] **Step 4: Create placeholder `src/main.ts` and `src/smoke.test.ts`**

`src/main.ts`:
```ts
const app = document.getElementById('app')!;
app.textContent = 'Belt Factory — booting…';
```

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => { it('runs vitest', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 5: Install and verify**

Run: `npm install && npm test`
Expected: install succeeds; 1 test PASSES.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Sparse world state & directions

**Files:**
- Create: `src/sim/grid.ts`, `src/sim/grid.test.ts`
- Create stubs: `src/sim/items.ts`, `src/sim/entities.ts` (fleshed out in Tasks 3–4)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Direction = 'up' | 'down' | 'left' | 'right'`
  - `const DELTA: Record<Direction, { dx: number; dy: number }>`
  - `interface GameState { version: number; seed: number; tick: number; cells: Map<string, Cell>; loadedChunks: Set<string>; items: Item[]; nextItemId: number; status: 'playing' | 'won'; }`
  - `function cellKey(x: number, y: number): string` → `"x,y"`
  - `function parseKey(key: string): { x: number; y: number }` (handles negatives)
  - `function cellAt(state: GameState, x: number, y: number): Cell | undefined`
  - `function setCell(state: GameState, x: number, y: number, cell: Cell | null): void` (null deletes)
  - `function itemAt(state: GameState, x: number, y: number): Item | undefined`
  - `function emptyState(seed: number): GameState`

- [ ] **Step 1: Write the failing test** — `src/sim/grid.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { cellKey, parseKey, cellAt, setCell, itemAt, emptyState, DELTA } from './grid';

describe('sparse grid', () => {
  it('keys and parses cells including negatives', () => {
    expect(cellKey(-3, 4)).toBe('-3,4');
    expect(parseKey('-3,4')).toEqual({ x: -3, y: 4 });
  });
  it('sets, reads, and deletes cells at arbitrary coords', () => {
    const s = emptyState(1);
    setCell(s, -5, 20, { type: 'belt', dir: 'right' });
    expect(cellAt(s, -5, 20)).toEqual({ type: 'belt', dir: 'right' });
    expect(cellAt(s, 0, 0)).toBeUndefined();
    setCell(s, -5, 20, null);
    expect(cellAt(s, -5, 20)).toBeUndefined();
  });
  it('finds an item at a cell', () => {
    const s = emptyState(1);
    s.items.push({ id: 1, value: 5n, x: 2, y: 2, px: 2, py: 2 });
    expect(itemAt(s, 2, 2)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('builds an empty state with the given seed', () => {
    const s = emptyState(99);
    expect(s.seed).toBe(99);
    expect(s.cells.size).toBe(0);
    expect(s.status).toBe('playing');
  });
  it('exposes direction deltas', () => {
    expect(DELTA.right).toEqual({ dx: 1, dy: 0 });
    expect(DELTA.up).toEqual({ dx: 0, dy: -1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/grid.test.ts`
Expected: FAIL (module `./grid` / `./entities` / `./items` not found).

- [ ] **Step 3: Create stubs so imports resolve**

`src/sim/items.ts` (stub):
```ts
export interface Item {
  id: number;
  value: bigint;
  x: number;
  y: number;
  px: number; // previous-tick cell x, for render interpolation
  py: number; // previous-tick cell y
}
```

`src/sim/entities.ts` (stub):
```ts
export type Cell = { type: 'belt'; dir: import('./grid').Direction };
```

- [ ] **Step 4: Write minimal implementation** — `src/sim/grid.ts`

```ts
import type { Cell } from './entities';
import type { Item } from './items';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export interface GameState {
  version: number;
  seed: number;
  tick: number;
  cells: Map<string, Cell>;
  loadedChunks: Set<string>;
  items: Item[];
  nextItemId: number;
  status: 'playing' | 'won';
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(key: string): { x: number; y: number } {
  const c = key.indexOf(',');
  return { x: Number(key.slice(0, c)), y: Number(key.slice(c + 1)) };
}

export function cellAt(state: GameState, x: number, y: number): Cell | undefined {
  return state.cells.get(cellKey(x, y));
}

export function setCell(state: GameState, x: number, y: number, cell: Cell | null): void {
  const k = cellKey(x, y);
  if (cell) state.cells.set(k, cell);
  else state.cells.delete(k);
}

export function itemAt(state: GameState, x: number, y: number): Item | undefined {
  return state.items.find((it) => it.x === x && it.y === y);
}

export function emptyState(seed: number): GameState {
  return {
    version: 1, seed, tick: 0,
    cells: new Map(), loadedChunks: new Set(),
    items: [], nextItemId: 1, status: 'playing',
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/sim/grid.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sim/grid.ts src/sim/grid.test.ts src/sim/items.ts src/sim/entities.ts
git commit -m "feat(sim): sparse Map-based world state + directions"
```

---

## Task 3: Items & BigInt values

**Files:**
- Modify: `src/sim/items.ts`
- Create: `src/sim/items.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Item { id: number; value: bigint; x: number; y: number; px: number; py: number; }` (keep identical to the stub)
  - `function createItem(id: number, value: bigint, x: number, y: number): Item` (sets `px=x`, `py=y`)

- [ ] **Step 1: Write the failing test** — `src/sim/items.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createItem } from './items';

describe('items', () => {
  it('creates an item with previous position equal to current', () => {
    expect(createItem(7, 42n, 3, 4)).toEqual({ id: 7, value: 42n, x: 3, y: 4, px: 3, py: 4 });
  });
  it('preserves large BigInt values exactly', () => {
    const big = 123456789012345678901234567890n;
    expect(createItem(1, big, 0, 0).value).toBe(big);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/items.test.ts`
Expected: FAIL (`createItem` not exported).

- [ ] **Step 3: Write minimal implementation** — replace `src/sim/items.ts`

```ts
export interface Item {
  id: number;
  value: bigint;
  x: number;
  y: number;
  px: number; // previous-tick cell x, for render interpolation
  py: number; // previous-tick cell y
}

export function createItem(id: number, value: bigint, x: number, y: number): Item {
  return { id, value, x, y, px: x, py: y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/items.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/items.test.ts
git commit -m "feat(sim): item model with BigInt value"
```

---

## Task 4: Entities & accept rules

**Files:**
- Modify: `src/sim/entities.ts`
- Create: `src/sim/entities.test.ts`

**Interfaces:**
- Consumes: `Direction` from `./grid`.
- Produces:
  - `type OpId = string` (kept as `string` here to avoid a sim→content cycle; narrowed in `content/operations.ts`)
  - `interface BeltCell { type: 'belt'; dir: Direction }`
  - `interface ExtractorCell { type: 'extractor'; dir: Direction; value: bigint; everyTicks: number; sinceEmit: number }`
  - `interface OperatorCell { type: 'operator'; op: OpId; dir: Direction; inputs: bigint[] }`
  - `interface SinkCell { type: 'sink'; target: bigint }`
  - `type Cell = BeltCell | ExtractorCell | OperatorCell | SinkCell`
  - `function accepts(cell: Cell | undefined, incomingCount: number): boolean` — belt: true; sink: true; extractor: false; operator: `inputs.length + incomingCount < 2`; undefined: false.

- [ ] **Step 1: Write the failing test** — `src/sim/entities.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { accepts, Cell } from './entities';

describe('entities.accepts', () => {
  it('belt accepts', () => { expect(accepts({ type: 'belt', dir: 'right' }, 0)).toBe(true); });
  it('sink always accepts', () => { expect(accepts({ type: 'sink', target: 10n }, 0)).toBe(true); });
  it('extractor never accepts', () => {
    expect(accepts({ type: 'extractor', dir: 'right', value: 1n, everyTicks: 5, sinceEmit: 0 }, 0)).toBe(false);
  });
  it('operator accepts until it holds two inputs', () => {
    const op: Cell = { type: 'operator', op: 'add', dir: 'right', inputs: [] };
    expect(accepts(op, 0)).toBe(true);
    (op as any).inputs = [3n];
    expect(accepts(op, 0)).toBe(true);
    (op as any).inputs = [3n, 4n];
    expect(accepts(op, 0)).toBe(false);
  });
  it('undefined accepts nothing', () => { expect(accepts(undefined, 0)).toBe(false); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/entities.test.ts`
Expected: FAIL (`accepts` not exported).

- [ ] **Step 3: Write minimal implementation** — replace `src/sim/entities.ts`

```ts
import type { Direction } from './grid';

export type OpId = string;

export interface BeltCell { type: 'belt'; dir: Direction }
export interface ExtractorCell {
  type: 'extractor';
  dir: Direction;
  value: bigint;
  everyTicks: number;
  sinceEmit: number;
}
export interface OperatorCell { type: 'operator'; op: OpId; dir: Direction; inputs: bigint[] }
export interface SinkCell { type: 'sink'; target: bigint }

export type Cell = BeltCell | ExtractorCell | OperatorCell | SinkCell;

export function accepts(cell: Cell | undefined, incomingCount: number): boolean {
  if (!cell) return false;
  switch (cell.type) {
    case 'belt': return true;
    case 'sink': return true;
    case 'extractor': return false;
    case 'operator': return cell.inputs.length + incomingCount < 2;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/entities.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/entities.ts src/sim/entities.test.ts
git commit -m "feat(sim): entity cell types and accept rules"
```

---

## Task 5: Operations (addition)

**Files:**
- Create: `src/content/operations.ts`, `src/content/operations.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OpId = 'add'`
  - `interface Operation { id: OpId; symbol: string; apply: (a: bigint, b: bigint) => bigint }`
  - `const OPERATIONS: Record<OpId, Operation>`
  - `function applyOp(op: OpId, a: bigint, b: bigint): bigint`

- [ ] **Step 1: Write the failing test** — `src/content/operations.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyOp, OPERATIONS } from './operations';

describe('operations', () => {
  it('adds with BigInt', () => { expect(applyOp('add', 7n, 5n)).toBe(12n); });
  it('exposes a display symbol', () => { expect(OPERATIONS.add.symbol).toBe('+'); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/operations.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/content/operations.ts`

```ts
export type OpId = 'add';

export interface Operation {
  id: OpId;
  symbol: string;
  apply: (a: bigint, b: bigint) => bigint;
}

export const OPERATIONS: Record<OpId, Operation> = {
  add: { id: 'add', symbol: '+', apply: (a, b) => a + b },
};

export function applyOp(op: OpId, a: bigint, b: bigint): bigint {
  return OPERATIONS[op].apply(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/content/operations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/operations.ts src/content/operations.test.ts
git commit -m "feat(content): addition operation"
```

---

## Task 6: Chunks, generation & new-game

The world is generated in 16×16 chunks. `sim/world.ts` holds the generic (content-free) chunk machinery; `content/worldgen.ts` supplies the actual content (origin puzzle now, deposits later).

**Files:**
- Create: `src/sim/world.ts`, `src/sim/world.test.ts`
- Create: `src/content/worldgen.ts`, `src/content/worldgen.test.ts`

**Interfaces:**
- Consumes: `GameState`, `cellKey`, `cellAt`, `emptyState` from `./grid`; `Cell` from `./entities`.
- Produces (`world.ts`):
  - `const CHUNK_SIZE = 16`
  - `interface Placement { x: number; y: number; cell: Cell }`
  - `type ChunkGenerator = (seed: number, cx: number, cy: number) => Placement[]`
  - `function chunkKey(cx: number, cy: number): string`
  - `function chunkOfCell(x: number, y: number): { cx: number; cy: number }`
  - `function ensureChunk(state: GameState, gen: ChunkGenerator, cx: number, cy: number): void` — runs the generator once per chunk, non-destructively (never overwrites an existing cell), marks it loaded.
  - `function ensureChunksInRange(state, gen, minCx, minCy, maxCx, maxCy): void`
  - `function newGame(seed: number, gen: ChunkGenerator): GameState` — empty state + origin chunk ensured.
- Produces (`worldgen.ts`):
  - `const TARGET: bigint`
  - `const mvpGenerator: ChunkGenerator` — origin chunk → the authored puzzle; all others → `[]`.

- [ ] **Step 1: Write the failing test** — `src/sim/world.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, chunkOfCell, chunkKey, ensureChunk, newGame, ChunkGenerator } from './world';
import { emptyState, cellAt } from './grid';

const genAt = (px: number, py: number): ChunkGenerator =>
  (_seed, cx, cy) => (cx === 0 && cy === 0 ? [{ x: px, y: py, cell: { type: 'belt', dir: 'right' } }] : []);

describe('chunks', () => {
  it('maps cells to chunks, including negatives', () => {
    expect(chunkOfCell(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOfCell(CHUNK_SIZE, 0)).toEqual({ cx: 1, cy: 0 });
    expect(chunkOfCell(-1, -1)).toEqual({ cx: -1, cy: -1 });
  });
  it('generates a chunk once and marks it loaded', () => {
    const s = emptyState(1);
    ensureChunk(s, genAt(2, 3), 0, 0);
    expect(cellAt(s, 2, 3)).toEqual({ type: 'belt', dir: 'right' });
    expect(s.loadedChunks.has(chunkKey(0, 0))).toBe(true);
  });
  it('never regenerates or overwrites an already-loaded chunk', () => {
    const s = emptyState(1);
    ensureChunk(s, genAt(2, 3), 0, 0);
    s.cells.set('2,3', { type: 'belt', dir: 'up' }); // simulate a player edit
    ensureChunk(s, genAt(2, 3), 0, 0);               // must be a no-op
    expect(cellAt(s, 2, 3)).toEqual({ type: 'belt', dir: 'up' });
  });
  it('newGame ensures the origin chunk', () => {
    const s = newGame(7, genAt(1, 1));
    expect(s.seed).toBe(7);
    expect(cellAt(s, 1, 1)).toEqual({ type: 'belt', dir: 'right' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/world.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/sim/world.ts`

```ts
import type { GameState } from './grid';
import { cellKey, emptyState } from './grid';
import type { Cell } from './entities';

export const CHUNK_SIZE = 16;

export interface Placement { x: number; y: number; cell: Cell }
export type ChunkGenerator = (seed: number, cx: number, cy: number) => Placement[];

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function chunkOfCell(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}

// Generate a chunk at most once. Non-destructive: an existing cell (a player edit,
// or a cell from an overlapping restore) is never overwritten. This makes resume
// robust regardless of which chunks were marked loaded.
export function ensureChunk(state: GameState, gen: ChunkGenerator, cx: number, cy: number): void {
  const k = chunkKey(cx, cy);
  if (state.loadedChunks.has(k)) return;
  state.loadedChunks.add(k);
  for (const p of gen(state.seed, cx, cy)) {
    const ck = cellKey(p.x, p.y);
    if (!state.cells.has(ck)) state.cells.set(ck, p.cell);
  }
}

export function ensureChunksInRange(
  state: GameState, gen: ChunkGenerator,
  minCx: number, minCy: number, maxCx: number, maxCy: number,
): void {
  for (let cy = minCy; cy <= maxCy; cy++)
    for (let cx = minCx; cx <= maxCx; cx++)
      ensureChunk(state, gen, cx, cy);
}

export function newGame(seed: number, gen: ChunkGenerator): GameState {
  const s = emptyState(seed);
  ensureChunk(s, gen, 0, 0); // origin chunk holds the starting puzzle
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/world.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test** — `src/content/worldgen.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mvpGenerator, TARGET } from './worldgen';

describe('mvp world generation', () => {
  it('places the authored puzzle in the origin chunk', () => {
    const p = mvpGenerator(0, 0, 0);
    const types = p.map((x) => x.cell.type);
    expect(types).toContain('extractor');
    expect(types).toContain('operator');
    expect(types).toContain('sink');
    // all placements are inside the origin chunk (0..15)
    for (const pl of p) { expect(pl.x).toBeGreaterThanOrEqual(0); expect(pl.x).toBeLessThan(16); }
  });
  it('generates empty land for every non-origin chunk', () => {
    expect(mvpGenerator(0, 1, 0)).toEqual([]);
    expect(mvpGenerator(0, -2, 5)).toEqual([]);
  });
  it('has a reachable small-number target', () => {
    expect(TARGET).toBeGreaterThan(0n);
    expect(TARGET).toBeLessThanOrEqual(30n);
  });
  it('returns fresh mutable cells each call (no shared inputs buffer)', () => {
    const a = mvpGenerator(0, 0, 0).find((p) => p.cell.type === 'operator')!.cell as any;
    const b = mvpGenerator(0, 0, 0).find((p) => p.cell.type === 'operator')!.cell as any;
    a.inputs.push(1n);
    expect(b.inputs.length).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/content/worldgen.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Write minimal implementation** — `src/content/worldgen.ts`

```ts
import type { ChunkGenerator, Placement } from '../sim/world';
import type { Cell } from '../sim/entities';

// Content model (A): the origin chunk holds an authored addition puzzle
// (7 + 5 -> target 12); every other chunk is empty buildable land. Content
// model (B) later replaces the non-origin branch with procedural deposits.
export const TARGET = 12n;

const STARTER: Placement[] = [
  { x: 1, y: 3, cell: { type: 'extractor', dir: 'right', value: 7n, everyTicks: 8, sinceEmit: 0 } },
  { x: 1, y: 9, cell: { type: 'extractor', dir: 'right', value: 5n, everyTicks: 8, sinceEmit: 0 } },
  { x: 8, y: 6, cell: { type: 'operator', op: 'add', dir: 'right', inputs: [] } },
  { x: 13, y: 6, cell: { type: 'sink', target: TARGET } },
];

export const mvpGenerator: ChunkGenerator = (_seed, cx, cy) =>
  cx === 0 && cy === 0 ? STARTER.map((p) => ({ x: p.x, y: p.y, cell: cloneCell(p.cell) })) : [];

// Deep-clone a cell so live runtime state (operator.inputs, extractor.sinceEmit)
// is never shared between the static template and a live game.
function cloneCell(cell: Cell): Cell {
  return JSON.parse(
    JSON.stringify(cell, (_k, v) => (typeof v === 'bigint' ? { __big: v.toString() } : v)),
    (_k, v) => (v && typeof v === 'object' && '__big' in v ? BigInt((v as any).__big) : v),
  );
}
```

- [ ] **Step 8: Run test to verify it passes + commit**

Run: `npx vitest run src/sim/world.test.ts src/content/worldgen.test.ts`
Expected: PASS (8 tests).

```bash
git add src/sim/world.ts src/sim/world.test.ts src/content/worldgen.ts src/content/worldgen.test.ts
git commit -m "feat(sim,content): chunk machinery + MVP world generator"
```

---

## Task 7: The tick — emit, move, produce, win

Core simulation. `step(state)` mutates state in place (allocation-light per CLAUDE.md).

**Files:**
- Create: `src/sim/tick.ts`, `src/sim/tick.test.ts`

**Interfaces:**
- Consumes: `GameState`, `DELTA`, `cellAt`, `parseKey` from `./grid`; `OperatorCell`, `ExtractorCell` from `./entities`; `accepts` from `./entities`; `createItem` from `./items`; `applyOp`, `OpId` from `../content/operations`.
- Produces:
  - `const TICKS_PER_SECOND = 10`
  - `function step(state: GameState): void`

**Tick order (why):** emit → move → produce, so freshly-emitted items don't also move the same tick (predictable pacing) and operator outputs appear before they start moving next tick.

Movement uses **downstream-first resolution**: repeatedly move any item whose target cell is a valid, currently-free destination until nothing else can move, so a packed belt advances as a train in one tick. Items are only removed/relocated via local sets during the pass, then the item array is rebuilt once — never spliced mid-iteration.

- [ ] **Step 1: Write the failing tests** — `src/sim/tick.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { step } from './tick';
import { emptyState, setCell, itemAt } from './grid';
import { createItem } from './items';
import type { Cell } from './entities';

const belt = (dir: any): Cell => ({ type: 'belt', dir });

describe('tick: movement', () => {
  it('advances an item one cell along a belt', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('records previous position for interpolation', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    const it = itemAt(s, 1, 0)!;
    expect([it.px, it.py]).toEqual([0, 0]);
  });
  it('does not advance off the end of a belt', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right')); // nothing at (2,0)
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)?.id).toBe(2);
  });
  it('advances a train downstream-first in one tick', () => {
    const s = emptyState(1);
    for (let x = 0; x < 4; x++) setCell(s, x, 0, belt('right'));
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 2, 0)?.id).toBe(1);
    expect(itemAt(s, 1, 0)?.id).toBe(2);
  });
});

describe('tick: extractor', () => {
  it('emits every N ticks onto the belt in front', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 2, sinceEmit: 0 });
    setCell(s, 1, 0, belt('right'));
    step(s);
    expect(itemAt(s, 1, 0)).toBeUndefined();
    step(s);
    expect(itemAt(s, 1, 0)?.value).toBe(5n);
  });
});

describe('tick: operator', () => {
  it('combines two inputs into a OP b on the output cell', () => {
    const s = emptyState(1);
    setCell(s, 1, 1, { type: 'operator', op: 'add', dir: 'right', inputs: [] });
    setCell(s, 2, 1, belt('right'));
    setCell(s, 0, 1, belt('right'));
    setCell(s, 1, 0, belt('down'));
    s.items.push(createItem(1, 7n, 0, 1));
    s.items.push(createItem(2, 4n, 1, 0));
    step(s);
    expect(s.items.length).toBe(0);
    step(s);
    expect(itemAt(s, 2, 1)?.value).toBe(11n);
  });
});

describe('tick: sink / win', () => {
  it('consumes an item and wins when it equals the target', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, { type: 'sink', target: 9n });
    s.items.push(createItem(1, 9n, 0, 0));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('won');
  });
  it('consumes without winning when value != target', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, { type: 'sink', target: 9n });
    s.items.push(createItem(1, 8n, 0, 0));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('playing');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/tick.test.ts`
Expected: FAIL (`step` not exported).

- [ ] **Step 3: Write minimal implementation** — `src/sim/tick.ts`

```ts
import { GameState, DELTA, cellAt, parseKey } from './grid';
import type { OperatorCell, ExtractorCell } from './entities';
import { accepts } from './entities';
import { createItem } from './items';
import { applyOp } from '../content/operations';
import type { OpId } from '../content/operations';

export const TICKS_PER_SECOND = 10;

export function step(state: GameState): void {
  for (const it of state.items) { it.px = it.x; it.py = it.y; }
  emit(state);
  move(state);
  produce(state);
  state.tick++;
}

function emit(state: GameState): void {
  for (const [key, cell] of state.cells) {
    if (cell.type !== 'extractor') continue;
    const ex = cell as ExtractorCell;
    ex.sinceEmit++;
    if (ex.sinceEmit < ex.everyTicks) continue;
    const { x, y } = parseKey(key);
    const { dx, dy } = DELTA[ex.dir];
    const tx = x + dx, ty = y + dy;
    const target = cellAt(state, tx, ty);
    if (accepts(target, 0) && !occupied(state, tx, ty, null)) {
      state.items.push(createItem(state.nextItemId++, ex.value, tx, ty));
      ex.sinceEmit = 0;
    }
  }
}

function move(state: GameState): void {
  const moved = new Set<number>();
  const removed = new Set<number>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const it of state.items) {
      if (moved.has(it.id) || removed.has(it.id)) continue;
      const cell = cellAt(state, it.x, it.y);
      if (cell?.type !== 'belt') { moved.add(it.id); continue; } // only belts self-propel
      const { dx, dy } = DELTA[cell.dir];
      const tx = it.x + dx, ty = it.y + dy;
      const target = cellAt(state, tx, ty);
      if (!target) { moved.add(it.id); continue; }             // edge of built world

      if (target.type === 'operator') {
        const op = target as OperatorCell;
        if (op.inputs.length < 2) { op.inputs.push(it.value); removed.add(it.id); progressed = true; }
        else moved.add(it.id);
        continue;
      }
      if (target.type === 'sink') {
        if (it.value === target.target) state.status = 'won';
        removed.add(it.id); progressed = true;
        continue;
      }
      if (target.type === 'belt') {
        if (!occupied(state, tx, ty, removed)) { it.x = tx; it.y = ty; moved.add(it.id); progressed = true; }
        // else blocked this pass; leave unmarked so it retries as downstream frees
        continue;
      }
      moved.add(it.id); // extractor: cannot enter
    }
  }
  if (removed.size) state.items = state.items.filter((it) => !removed.has(it.id));
}

function produce(state: GameState): void {
  for (const [key, cell] of state.cells) {
    if (cell.type !== 'operator') continue;
    const op = cell as OperatorCell;
    if (op.inputs.length < 2) continue;
    const { x, y } = parseKey(key);
    const { dx, dy } = DELTA[op.dir];
    const tx = x + dx, ty = y + dy;
    const target = cellAt(state, tx, ty);
    if (accepts(target, 0) && !occupied(state, tx, ty, null)) {
      state.items.push(createItem(state.nextItemId++, applyOp(op.op as OpId, op.inputs[0], op.inputs[1]), tx, ty));
      op.inputs.splice(0, 2);
    }
  }
}

// True if a live (non-removed) item occupies (x,y).
function occupied(state: GameState, x: number, y: number, removed: Set<number> | null): boolean {
  return state.items.some((o) => (!removed || !removed.has(o.id)) && o.x === x && o.y === y);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/tick.test.ts`
Expected: PASS (all). If "train" fails, confirm the `while (progressed)` loop and that blocked belt-movers are left unmarked.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat(sim): fixed-timestep tick (emit/move/produce/win)"
```

---

## Task 8: Save format (versioned, Map/Set/BigInt round-trip)

**Files:**
- Create: `src/sim/save.ts`, `src/sim/save.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./grid`.
- Produces:
  - `const SAVE_VERSION = 1`
  - `function serialize(state: GameState): string`
  - `function deserialize(json: string): GameState`
  - `Map` → entries array, `Set` → array, BigInt → `{__big}`; all reconstructed on load.

- [ ] **Step 1: Write the failing test** — `src/sim/save.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SAVE_VERSION } from './save';
import { emptyState, setCell, cellAt } from './grid';
import { createItem } from './items';

function sample() {
  const s = emptyState(4242);
  s.tick = 12; s.nextItemId = 3;
  s.loadedChunks.add('0,0');
  setCell(s, 1, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 4, sinceEmit: 1 });
  setCell(s, 8, 6, { type: 'operator', op: 'add', dir: 'right', inputs: [7n] });
  setCell(s, 13, 6, { type: 'sink', target: 30n });
  s.items.push(createItem(1, 9999999999n, 8, 6));
  return s;
}

describe('save', () => {
  it('round-trips sparse state including Map, Set and BigInt', () => {
    const s = sample();
    const r = deserialize(serialize(s));
    expect(r.seed).toBe(4242);
    expect(r.tick).toBe(12);
    expect(r.loadedChunks.has('0,0')).toBe(true);
    expect(cellAt(r, 8, 6)).toBeTruthy();
    expect((cellAt(r, 8, 6) as any).inputs[0]).toBe(7n);
    expect(typeof r.items[0].value).toBe('bigint');
    expect(r.items[0].value).toBe(9999999999n);
    expect(r.cells instanceof Map).toBe(true);
    expect(r.loadedChunks instanceof Set).toBe(true);
  });
  it('stamps the current version', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(SAVE_VERSION);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/save.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/sim/save.ts`

```ts
import type { GameState } from './grid';

export const SAVE_VERSION = 1;

// JSON has no BigInt: encode as { __big: "<decimal>" } and revive on load.
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { __big: value.toString() } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__big' in (value as any)) return BigInt((value as any).__big);
  return value;
}

export function serialize(state: GameState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: state.seed,
    tick: state.tick,
    status: state.status,
    nextItemId: state.nextItemId,
    items: state.items,
    cells: [...state.cells.entries()],   // Map -> [key, cell][]
    chunks: [...state.loadedChunks],     // Set -> string[]
  }, replacer);
}

export function deserialize(json: string): GameState {
  const o = JSON.parse(json, reviver);
  return {
    version: o.version,
    seed: o.seed,
    tick: o.tick,
    status: o.status,
    nextItemId: o.nextItemId,
    items: o.items,
    cells: new Map(o.cells),
    loadedChunks: new Set(o.chunks),
  };
}
```

- [ ] **Step 4: Run test to verify it passes + full sim regression**

Run: `npx vitest run src/sim/save.test.ts` → PASS (2 tests).
Run: `npm test` → ALL sim/content tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/save.ts src/sim/save.test.ts
git commit -m "feat(sim): versioned save/load (Map/Set/BigInt round-trip)"
```

---

## Task 9: Renderer interface, camera & themes

**Files:**
- Create: `src/render/renderer.ts`, `src/render/themes.ts`

**Interfaces:**
- Consumes: `GameState` from `../sim/grid`.
- Produces:
  - `interface Camera { x: number; y: number; zoom: number }` — `x,y` = world-cell coords at viewport center; `zoom` = pixels per cell.
  - `interface Theme { id: string; name: string; background: number; grid: number; belt: number; beltEdge: number; extractor: number; operator: number; sink: number; item: number; itemText: number; cornerRadius: number; glow: boolean }` (colors are PixiJS numeric hex)
  - `interface Renderer { init(theme): Promise<void>; setTheme(theme): void; setCamera(cam): void; draw(state, alpha): void; screenToWorld(px, py): { x: number; y: number }; visibleChunkRange(): { minCx: number; minCy: number; maxCx: number; maxCy: number }; resize(w, h): void; destroy(): void }`
  - `const THEMES: Theme[]`, `const DEFAULT_THEME: Theme`.

- [ ] **Step 1: Create `src/render/renderer.ts`**

```ts
import type { GameState } from '../sim/grid';

export interface Camera {
  x: number;    // world-cell coordinate at viewport center
  y: number;
  zoom: number; // pixels per cell
}

export interface Theme {
  id: string;
  name: string;
  background: number;
  grid: number;
  belt: number;
  beltEdge: number;
  extractor: number;
  operator: number;
  sink: number;
  item: number;
  itemText: number;
  cornerRadius: number;
  glow: boolean;
}

export interface Renderer {
  init(theme: Theme): Promise<void>;
  setTheme(theme: Theme): void;
  setCamera(cam: Camera): void;
  // alpha in [0,1]: interpolate items between previous (px,py) and current (x,y).
  draw(state: GameState, alpha: number): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  visibleChunkRange(): { minCx: number; minCy: number; maxCx: number; maxCy: number };
  resize(w: number, h: number): void;
  destroy(): void;
}
```

- [ ] **Step 2: Create `src/render/themes.ts`**

```ts
import type { Theme } from './renderer';

export const THEMES: Theme[] = [
  {
    id: 'chunkyToy', name: 'Chunky Toy',
    background: 0xfdf6e3, grid: 0xe8dcc0,
    belt: 0x8d6e63, beltEdge: 0x5d4037,
    extractor: 0x43a047, operator: 0xfb8c00, sink: 0x1e88e5,
    item: 0xffee58, itemText: 0x3e2723, cornerRadius: 10, glow: false,
  },
  {
    id: 'cleanFlat', name: 'Clean Flat',
    background: 0xf7f9fc, grid: 0xe3e8ef,
    belt: 0xcfd8e3, beltEdge: 0xb0bcca,
    extractor: 0x7cc4a4, operator: 0xf2b880, sink: 0x8aa9d6,
    item: 0xffffff, itemText: 0x334155, cornerRadius: 6, glow: false,
  },
  {
    id: 'neonArcade', name: 'Neon Arcade',
    background: 0x0d0221, grid: 0x1b1040,
    belt: 0x2d1b69, beltEdge: 0x00e5ff,
    extractor: 0x00ff9c, operator: 0xff2e97, sink: 0x00b3ff,
    item: 0xfff200, itemText: 0x0d0221, cornerRadius: 4, glow: true,
  },
];

export const DEFAULT_THEME: Theme = THEMES[0];
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/render/renderer.ts src/render/themes.ts
git commit -m "feat(render): Renderer interface, Camera + three themes"
```

---

## Task 10: PixiJS renderer with camera

**Files:**
- Create: `src/render/pixi-renderer.ts`

**Interfaces:**
- Consumes: `Renderer`, `Theme`, `Camera` from `./renderer`; `GameState`, `cellAt` from `../sim/grid`; `CHUNK_SIZE` from `../sim/world`; PixiJS.
- Produces: `class PixiRenderer implements Renderer` and `function createPixiRenderer(parent: HTMLElement): PixiRenderer`.

**Notes:** With a moving camera nothing is truly static, so redraw each frame — for the MVP's handful of cells that's cheap. Draw order: grid lines → cell squares → item circles → all number labels (machines + items) on top, so numbers are never hidden by the circles. Text objects are pooled and reused across frames.

- [ ] **Step 1: Implement `src/render/pixi-renderer.ts`**

```ts
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Renderer, Theme, Camera } from './renderer';
import type { GameState } from '../sim/grid';
import { cellAt } from '../sim/grid';
import { CHUNK_SIZE } from '../sim/world';

export class PixiRenderer implements Renderer {
  private app = new Application();
  private parent: HTMLElement;
  private theme!: Theme;
  private layer = new Container();
  private cam: Camera = { x: 8, y: 6, zoom: 44 };
  private texts: Text[] = [];

  constructor(parent: HTMLElement) { this.parent = parent; }

  async init(theme: Theme): Promise<void> {
    this.theme = theme;
    await this.app.init({ background: theme.background, resizeTo: this.parent, antialias: true });
    this.parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layer);
  }
  setTheme(theme: Theme): void { this.theme = theme; this.app.renderer.background.color = theme.background; }
  setCamera(cam: Camera): void { this.cam = cam; }
  resize(): void { /* Application resizeTo handles the canvas; draw() recomputes from live size */ }
  destroy(): void { this.app.destroy(true, { children: true }); }

  private get vw() { return this.app.renderer.width; }
  private get vh() { return this.app.renderer.height; }
  private sx(worldX: number) { return (worldX - this.cam.x) * this.cam.zoom + this.vw / 2; }
  private sy(worldY: number) { return (worldY - this.cam.y) * this.cam.zoom + this.vh / 2; }

  screenToWorld(px: number, py: number) {
    return {
      x: Math.floor((px - this.vw / 2) / this.cam.zoom + this.cam.x),
      y: Math.floor((py - this.vh / 2) / this.cam.zoom + this.cam.y),
    };
  }

  private visibleCellRange() {
    const halfW = this.vw / 2 / this.cam.zoom, halfH = this.vh / 2 / this.cam.zoom;
    return {
      minX: Math.floor(this.cam.x - halfW) - 1, maxX: Math.ceil(this.cam.x + halfW) + 1,
      minY: Math.floor(this.cam.y - halfH) - 1, maxY: Math.ceil(this.cam.y + halfH) + 1,
    };
  }

  visibleChunkRange() {
    const r = this.visibleCellRange();
    return {
      minCx: Math.floor(r.minX / CHUNK_SIZE), maxCx: Math.floor(r.maxX / CHUNK_SIZE),
      minCy: Math.floor(r.minY / CHUNK_SIZE), maxCy: Math.floor(r.maxY / CHUNK_SIZE),
    };
  }

  draw(state: GameState, alpha: number): void {
    const t = this.theme, cs = this.cam.zoom;
    this.layer.removeChildren();
    const r = this.visibleCellRange();

    // grid lines
    const g = new Graphics();
    for (let x = r.minX; x <= r.maxX; x++) g.rect(this.sx(x), this.sy(r.minY), 1, (r.maxY - r.minY) * cs);
    for (let y = r.minY; y <= r.maxY; y++) g.rect(this.sx(r.minX), this.sy(y), (r.maxX - r.minX) * cs, 1);
    g.fill(t.grid);

    // cell squares (visible only)
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = r.minX; x <= r.maxX; x++) {
        const cell = cellAt(state, x, y);
        if (!cell) continue;
        const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
        const color = cell.type === 'belt' ? t.belt : cell.type === 'extractor' ? t.extractor
          : cell.type === 'operator' ? t.operator : t.sink;
        g.roundRect(px, py, sz, sz, t.cornerRadius).fill(color);
        if (cell.type === 'belt') g.roundRect(px, py, sz, sz, t.cornerRadius).stroke({ width: 2, color: t.beltEdge });
      }
    }
    this.layer.addChild(g);

    // item circles (under labels)
    const ig = new Graphics();
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      const px = this.sx(ix) + cs / 2, py = this.sy(iy) + cs / 2, rad = cs * 0.32;
      if (t.glow) ig.circle(px, py, rad + 4).fill({ color: t.item, alpha: 0.25 });
      ig.circle(px, py, rad).fill(t.item);
    }
    this.layer.addChild(ig);

    // labels on top (pooled text): machine values + item values
    let ti = 0;
    const size = Math.max(10, Math.round(cs * 0.4));
    const label = (text: string, cxp: number, cyp: number, fill: number) => {
      const txt = this.texts[ti] ?? new Text({ text: '' });
      this.texts[ti] = txt; ti++;
      txt.text = text;
      txt.anchor.set(0.5);
      txt.x = cxp; txt.y = cyp;
      txt.style = { fill, fontSize: size, fontFamily: 'system-ui', fontWeight: 'bold' } as any;
      this.layer.addChild(txt);
    };
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = r.minX; x <= r.maxX; x++) {
        const cell = cellAt(state, x, y);
        if (cell?.type === 'sink') label(String(cell.target), this.sx(x) + cs / 2, this.sy(y) + cs / 2, 0xffffff);
        else if (cell?.type === 'extractor') label(String(cell.value), this.sx(x) + cs / 2, this.sy(y) + cs / 2, 0xffffff);
        else if (cell?.type === 'operator') label('+', this.sx(x) + cs / 2, this.sy(y) + cs / 2, 0xffffff);
      }
    }
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      label(String(it.value), this.sx(ix) + cs / 2, this.sy(iy) + cs / 2, t.itemText);
    }
    // drop any pooled text beyond what we used this frame
    this.texts.length = ti;
  }
}

export function createPixiRenderer(parent: HTMLElement): PixiRenderer {
  return new PixiRenderer(parent);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. (If the installed PixiJS v8 minor differs on `Graphics`/`Text` fluent calls, adjust to the installed types — the shapes stay: rounded rects for cells, circles for items, `Text` for numbers.)

```bash
git add src/render/pixi-renderer.ts
git commit -m "feat(render): PixiJS renderer with camera, interpolation, theming"
```

---

## Task 11: Input — place & remove belts

**Files:**
- Create: `src/input/place.ts`, `src/input/place.test.ts`

**Interfaces:**
- Consumes: `GameState`, `cellAt`, `setCell` from `../sim/grid`; `Direction` from `../sim/grid`.
- Produces:
  - `function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean` — places on an empty cell only; returns success.
  - `function removeCell(state: GameState, x: number, y: number): boolean` — removes belts only; returns success.

  (Screen→cell mapping lives on the renderer's `screenToWorld`, since it owns the camera.)

- [ ] **Step 1: Write the failing test** — `src/input/place.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { placeBelt, removeCell } from './place';
import { emptyState, cellAt, setCell } from '../sim/grid';

describe('input.place', () => {
  it('places a belt on an empty cell (any coordinate)', () => {
    const s = emptyState(1);
    expect(placeBelt(s, -4, 20, 'right')).toBe(true);
    expect(cellAt(s, -4, 20)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('refuses to overwrite a non-empty cell', () => {
    const s = emptyState(1);
    setCell(s, 1, 1, { type: 'sink', target: 5n });
    expect(placeBelt(s, 1, 1, 'right')).toBe(false);
  });
  it('removes only belts', () => {
    const s = emptyState(1);
    placeBelt(s, 0, 0, 'up');
    setCell(s, 1, 0, { type: 'sink', target: 5n });
    expect(removeCell(s, 0, 0)).toBe(true);
    expect(cellAt(s, 0, 0)).toBeUndefined();
    expect(removeCell(s, 1, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/place.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/input/place.ts`

```ts
import { GameState, cellAt, setCell } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean {
  if (cellAt(state, x, y)) return false;
  setCell(state, x, y, { type: 'belt', dir });
  return true;
}

export function removeCell(state: GameState, x: number, y: number): boolean {
  const cell = cellAt(state, x, y);
  if (cell?.type !== 'belt') return false;
  setCell(state, x, y, null);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

Run: `npx vitest run src/input/place.test.ts` → PASS (3 tests).

```bash
git add src/input/place.ts src/input/place.test.ts
git commit -m "feat(input): place/remove belts on the sparse world"
```

---

## Task 12: Server — seeded users & auth helpers

**Files:**
- Create: `server/users.ts`, `server/users.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `bcryptjs`.
- Produces:
  - `interface User { username: string; hash: string }`
  - `function loadUsers(): User[]` — reads `SEED_USERS` (`user:password` comma list), hashes at startup; falls back to a dev pair.
  - `function verifyUser(users: User[], username: string, password: string): boolean`

- [ ] **Step 1: Write the failing test** — `server/users.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyUser, User } from './users';

describe('users', () => {
  it('verifies a correct password against a hash', () => {
    const users: User[] = [{ username: 'kid', hash: bcrypt.hashSync('apples', 8) }];
    expect(verifyUser(users, 'kid', 'apples')).toBe(true);
    expect(verifyUser(users, 'kid', 'wrong')).toBe(false);
    expect(verifyUser(users, 'ghost', 'apples')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/users.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `server/users.ts`

```ts
import bcrypt from 'bcryptjs';

export interface User { username: string; hash: string }

// SEED_USERS format: "dad:secret1,kid:apples" — plaintext, hashed at startup.
// Private family app; keep it simple. Change via .env.
export function loadUsers(): User[] {
  const raw = process.env.SEED_USERS ?? 'dad:changeme,kid:apples';
  return raw.split(',').map((pair) => {
    const [username, password] = pair.split(':');
    return { username: username.trim(), hash: bcrypt.hashSync((password ?? '').trim(), 8) };
  });
}

export function verifyUser(users: User[], username: string, password: string): boolean {
  const u = users.find((x) => x.username === username);
  return u ? bcrypt.compareSync(password, u.hash) : false;
}
```

`.env.example`:
```
# Comma-separated username:password pairs (hashed at startup)
SEED_USERS=dad:changeme,kid:apples
# Secret used to sign the session cookie
SESSION_SECRET=change-this-to-a-long-random-string
PORT=3000
```

- [ ] **Step 4: Run test to verify it passes + commit**

Run: `npx vitest run server/users.test.ts` → PASS (1 test).

```bash
git add server/users.ts server/users.test.ts .env.example
git commit -m "feat(server): seeded users + bcrypt verification"
```

---

## Task 13: Server — per-user JSON storage

**Files:**
- Create: `server/storage.ts`, `server/storage.test.ts`

**Interfaces:**
- Consumes: Node `fs`, `path`.
- Produces:
  - `function saveState(dataDir: string, username: string, json: string): void`
  - `function loadState(dataDir: string, username: string): string | null`
  - Username sanitized to `[a-z0-9_-]` for the filename.

- [ ] **Step 1: Write the failing test** — `server/storage.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveState, loadState } from './storage';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bf-')); });

describe('storage', () => {
  it('returns null when no save exists', () => { expect(loadState(dir, 'kid')).toBeNull(); });
  it('round-trips a saved state for a user', () => {
    saveState(dir, 'kid', '{"hello":1}');
    expect(loadState(dir, 'kid')).toBe('{"hello":1}');
  });
  it('keeps users separate and sanitizes names', () => {
    saveState(dir, 'kid', 'A'); saveState(dir, 'dad', 'B');
    expect(loadState(dir, 'kid')).toBe('A');
    expect(loadState(dir, '../evil')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/storage.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `server/storage.ts`

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function safe(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
function file(dataDir: string, username: string): string {
  return join(dataDir, `${safe(username)}.json`);
}

export function saveState(dataDir: string, username: string, json: string): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir, username), json, 'utf8');
}

export function loadState(dataDir: string, username: string): string | null {
  const f = file(dataDir, username);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

Run: `npx vitest run server/storage.test.ts` → PASS (3 tests).

```bash
git add server/storage.ts server/storage.test.ts
git commit -m "feat(server): per-user JSON save storage"
```

---

## Task 14: Server — Express app (static + API + session)

**Files:**
- Create: `server/index.ts`, `server/express-session.d.ts`

**Interfaces:**
- Consumes: `express`, `cookie-session`, `loadUsers`/`verifyUser`, `loadState`/`saveState`.
- Produces: HTTP server on `PORT` (default 3000):
  - `POST /api/login` `{username, password}` → 200 + cookie, or 401.
  - `POST /api/logout` → 200, clears session.
  - `GET /api/me` → `{username}` or 401.
  - `GET /api/state` → saved JSON or 204 (401 if not logged in).
  - `POST /api/save` (JSON body, logged-in) → 200.
  - Static: serves `dist/`, SPA fallback to `index.html`.

- [ ] **Step 1: Implement `server/index.ts`**

```ts
import express from 'express';
import cookieSession from 'cookie-session';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUsers, verifyUser } from './users';
import { loadState, saveState } from './storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '..', 'data');
const DIST_DIR = join(__dirname, '..', 'dist');

const users = loadUsers();
const app = express();

app.use(express.json({ limit: '4mb' }));
app.use(cookieSession({
  name: 'bf',
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

function requireUser(req: express.Request, res: express.Response): string | null {
  const u = req.session?.username;
  if (!u) { res.status(401).json({ error: 'not logged in' }); return null; }
  return u;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !verifyUser(users, username, password)) {
    return res.status(401).json({ error: 'bad credentials' });
  }
  req.session!.username = username;
  res.json({ username });
});

app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

app.get('/api/me', (req, res) => {
  const u = req.session?.username;
  if (!u) return res.status(401).json({ error: 'not logged in' });
  res.json({ username: u });
});

app.get('/api/state', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  const json = loadState(DATA_DIR, u);
  if (!json) return res.status(204).end();
  res.type('application/json').send(json);
});

app.post('/api/save', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  saveState(DATA_DIR, u, JSON.stringify(req.body));
  res.json({ ok: true });
});

app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => res.sendFile(join(DIST_DIR, 'index.html')));

app.listen(PORT, () => console.log(`Belt Factory on http://localhost:${PORT}`));
```

- [ ] **Step 2: Create `server/express-session.d.ts`**

```ts
import 'cookie-session';
declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject { username?: string }
  }
}
```

- [ ] **Step 3: Manual smoke test the API**

One terminal: `SEED_USERS=kid:apples npm start`
Another:
```bash
curl -s -c /tmp/j -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"username":"kid","password":"apples"}'
curl -s -b /tmp/j -X POST localhost:3000/api/save -H 'content-type: application/json' -d '{"tick":1}'
curl -s -b /tmp/j localhost:3000/api/state
```
Expected: login → `{"username":"kid"}`; state → `{"tick":1}`.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts server/express-session.d.ts
git commit -m "feat(server): express static host + auth/session/save API"
```

---

## Task 15: Client wiring — login, loops, camera, chunk streaming

**Files:**
- Create: `src/net/api.ts`, `src/ui/login.ts`, `src/ui/hud.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a running game — login gate → new/loaded state → fixed-tick + rAF loops → pan/zoom camera streaming chunks into view → click to place belts (direction via HUD) → autosave → live theme switcher → win banner.

- [ ] **Step 1: Create `src/net/api.ts`**

```ts
export async function apiLogin(username: string, password: string): Promise<boolean> {
  const r = await fetch('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.ok;
}
export async function apiMe(): Promise<string | null> {
  const r = await fetch('/api/me');
  return r.ok ? ((await r.json()).username as string) : null;
}
export async function apiLogout(): Promise<void> { await fetch('/api/logout', { method: 'POST' }); }
export async function apiGetState(): Promise<string | null> {
  const r = await fetch('/api/state');
  if (r.status === 204 || !r.ok) return null;
  return await r.text();
}
export async function apiSaveState(json: string): Promise<void> {
  await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json });
}
```

- [ ] **Step 2: Create `src/ui/login.ts`**

```ts
import { apiLogin } from '../net/api';

// Centered login form; resolves once login succeeds.
export function showLogin(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#1118;z-index:10';
    overlay.innerHTML = `
      <form style="background:#fff;padding:24px;border-radius:12px;display:grid;gap:10px;min-width:260px;font-family:system-ui">
        <h2 style="margin:0">Belt Factory</h2>
        <input name="u" placeholder="username" autocomplete="username" style="padding:8px" />
        <input name="p" type="password" placeholder="password" autocomplete="current-password" style="padding:8px" />
        <button style="padding:8px;font-weight:700">Play</button>
        <div class="err" style="color:#c00;font-size:13px;min-height:16px"></div>
      </form>`;
    parent.appendChild(overlay);
    const form = overlay.querySelector('form')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = (form.elements.namedItem('u') as HTMLInputElement).value;
      const p = (form.elements.namedItem('p') as HTMLInputElement).value;
      if (await apiLogin(u, p)) { overlay.remove(); resolve(); }
      else overlay.querySelector('.err')!.textContent = 'Wrong username or password';
    });
  });
}
```

- [ ] **Step 3: Create `src/ui/hud.ts`**

```ts
import type { Theme } from '../render/renderer';
import { THEMES } from '../render/themes';
import type { GameState } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function createHud(
  parent: HTMLElement,
  onTheme: (t: Theme) => void,
  onDir: (d: Direction) => void,
) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;font-family:system-ui;z-index:5';

  const target = document.createElement('div');
  target.style.cssText = 'background:#000a;color:#fff;padding:6px 12px;border-radius:8px;font-weight:700';

  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  const glyph: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
  const dirWrap = document.createElement('div');
  dirWrap.style.cssText = 'display:flex;gap:4px';
  let active: Direction = 'right';
  const btns: Record<string, HTMLButtonElement> = {};
  for (const d of dirs) {
    const b = document.createElement('button');
    b.textContent = glyph[d];
    b.style.cssText = 'padding:6px 10px;border-radius:8px;border:2px solid transparent;cursor:pointer';
    b.addEventListener('click', () => { active = d; onDir(d); paint(); });
    btns[d] = b; dirWrap.appendChild(b);
  }
  const paint = () => dirs.forEach((d) => { btns[d].style.borderColor = d === active ? '#1e88e5' : 'transparent'; });
  paint();

  const sel = document.createElement('select');
  sel.style.cssText = 'padding:6px;border-radius:8px';
  for (const t of THEMES) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); }
  sel.addEventListener('change', () => onTheme(THEMES.find((x) => x.id === sel.value)!));

  const banner = document.createElement('div');
  banner.style.cssText = 'margin-left:auto;background:#2e7d32;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  banner.textContent = '🎉 You did it!';

  bar.append(target, dirWrap, sel, banner);
  parent.appendChild(bar);

  return {
    update(state: GameState) {
      let goal = '?';
      for (const c of state.cells.values()) if (c.type === 'sink') { goal = String(c.target); break; }
      target.textContent = `Target: ${goal}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';
    },
  };
}
```

- [ ] **Step 4: Rewrite `src/main.ts`**

```ts
import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, ensureChunksInRange } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import type { GameState } from './sim/grid';
import type { Direction } from './sim/grid';
import { placeBelt, removeCell } from './input/place';
import { showLogin } from './ui/login';
import { createHud } from './ui/hud';
import { apiMe, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

async function boot() {
  if (!(await apiMe())) await showLogin(parent);

  const saved = await apiGetState();
  // A new game seeds from the current clock; resumed games keep their saved seed.
  const state: GameState = saved ? deserialize(saved) : newGame(Date.now() >>> 0, mvpGenerator);

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);

  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  let placeDir: Direction = 'right';
  const hud = createHud(parent, (t) => { theme = t; renderer.setTheme(t); }, (d) => { placeDir = d; });

  // --- input: place/remove belts, pan (arrows), zoom (wheel) ---
  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    if (e.button === 2) removeCell(state, x, y);
    else placeBelt(state, x, y, placeDir);
    dirty = true;
    e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    cam.zoom = Math.max(12, Math.min(96, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    renderer.setCamera(cam); e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const pan: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const d = pan[e.key];
    if (d) { cam.x += d[0]; cam.y += d[1]; renderer.setCamera(cam); }
  });

  // --- fixed-timestep sim loop + rAF render ---
  const tickMs = 1000 / TICKS_PER_SECOND;
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc += now - last; last = now;
    while (acc >= tickMs) { step(state); acc -= tickMs; dirty = true; }
    // stream in any chunks the camera can now see (empty land for MVP)
    const cr = renderer.visibleChunkRange();
    ensureChunksInRange(state, mvpGenerator, cr.minCx, cr.minCy, cr.maxCx, cr.maxCy);
    renderer.draw(state, Math.min(acc / tickMs, 1));
    hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- autosave every 3s if changed, and on exit ---
  setInterval(() => { if (dirty) { apiSaveState(serialize(state)); dirty = false; } }, 3000);
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon('/api/save', new Blob([serialize(state)], { type: 'application/json' }));
  });
}

boot();
```

- [ ] **Step 5: Typecheck + run the whole app**

Run: `npx tsc --noEmit` → no errors.
Run: `SEED_USERS=kid:apples npm run dev`, open the Vite URL.
Expected: login → grid with two extractors (7, 5), an operator (+), and a target (12); numbers emit and sit; left-click lays belts in the HUD-selected direction, right-click removes; arrow keys pan, wheel zooms; panning reveals empty buildable land (chunks stream in); routing 7 and 5 into the operator and its output into the sink flips the win banner; theme dropdown restyles live.

- [ ] **Step 6: Commit**

```bash
git add src/net/api.ts src/ui/login.ts src/ui/hud.ts src/main.ts
git commit -m "feat: wire login, game loop, camera, chunk streaming, autosave, themes"
```

---

## Task 16: Docker Compose deployment

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
dist
data
.git
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  belt-factory:
    build: .
    ports:
      - "8080:3000"
    environment:
      - SEED_USERS=${SEED_USERS:-dad:changeme,kid:apples}
      - SESSION_SECRET=${SESSION_SECRET:-please-change-this}
      - DATA_DIR=/app/data
    volumes:
      - bf-data:/app/data
    restart: unless-stopped

volumes:
  bf-data:
```

- [ ] **Step 4: Build and run end-to-end**

Run: `docker compose up --build -d`, open `http://localhost:8080`.
Expected: login with a seeded user works; play, place belts, win; refresh — resumes from saved state; `docker compose down && docker compose up -d` — state persists via the volume.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: docker-compose deployment with persistent data volume"
```

---

## Task 17: Full verification & CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (Tech Stack + Current Status)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests PASS across sim, content, input, server.

- [ ] **Step 2: Update `CLAUDE.md`**

- **Tech Stack / Rendering:** PixiJS confirmed; rendering goes through a `Renderer` interface + `Theme` config (swappable, themable) and owns a camera. The world is an **unbounded sparse chunked grid** (16×16 chunks, deterministic generation from a seed).
- **Current Status:** MVP shipped — dockerized, seeded-user login, infinite chunked world (origin puzzle + buildable land), pan/zoom camera, addition puzzle, save/resume, three themes with a live switcher. Next: procedural number deposits (content model B), difficulty progression (Phases 2–4) as data, drag-to-pan/paint, and render/sim rollups when profiling calls for them.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — chunked world engine settled, MVP status"
```

---

## Self-Review Notes (author checklist — done)

- **Spec coverage:** PixiJS engine + camera (T9–10); Renderer interface + Theme + Camera (T9); three themes + live switcher (T9, T15); unbounded sparse world (T2); chunks + deterministic generation + newGame (T6); origin-puzzle-now / deposits-later content model (T6 worldgen); pure fixed-timestep tick with BigInt, slot movement, operator, win (T7); versioned Map/Set/BigInt save round-trip (T8); flat-JSON per-user persistence (T13–14); seeded multi-user auth + bcrypt + session cookie (T12, T14); create/play/resume loop with chunk streaming (T15); docker-compose + volume (T16); tests for all tricky sim/content/input/server logic (T2–8, T11–13). All spec sections map to tasks.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** `GameState` (sparse: `cells:Map`, `loadedChunks:Set`, `seed`), `emptyState`, `cellKey/parseKey/cellAt/setCell/itemAt`, `Item{px,py}`/`createItem`, `Cell` union + `accepts`, `CHUNK_SIZE`/`chunkOfCell`/`chunkKey`/`ensureChunk`/`ensureChunksInRange`/`newGame`/`ChunkGenerator`/`Placement`, `mvpGenerator`/`TARGET`, `step`/`TICKS_PER_SECOND`, `serialize/deserialize/SAVE_VERSION`, `Renderer`/`Theme`/`Camera` + `screenToWorld`/`visibleChunkRange`/`setCamera`, `OPERATIONS`/`applyOp`/`OpId`, `placeBelt`/`removeCell`, `loadUsers`/`verifyUser`, `loadState`/`saveState`, `apiLogin/apiMe/apiGetState/apiSaveState` — names used consistently across producing and consuming tasks. `OpId` is `string` in `entities.ts` (avoids a sim→content cycle) and narrowed to `'add'` in `content/operations.ts`; `tick.ts` casts `op.op as OpId` at the call site — intentional and documented.
```
