# Belt Factory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable, resumable, minimal-auth web belt-factory math game with a PixiJS renderer proven out via a live theme switcher and a fully-tested pure simulation.

**Architecture:** A pure, deterministic, fixed-timestep simulation in `src/sim/` (no rendering/DOM/network imports) drives everything. A `Renderer` interface in `src/render/` reads sim state and draws it with PixiJS, styled entirely from a swappable `Theme`. A single Node + Express server hosts the built frontend and a tiny JSON API for seeded-user auth and per-user save/resume. Ships via `docker-compose`.

**Tech Stack:** TypeScript (strict), Vite, PixiJS v8, Vitest, Express, bcryptjs, cookie-session, tsx, Docker Compose.

## Global Constraints

- TypeScript strict mode ON.
- `src/sim/` MUST NOT import from `render/`, `ui/`, `net/`, PixiJS, or any DOM/Node API. Pure functions and plain data only.
- Rendering reads sim state; it NEVER mutates it.
- Simulation is deterministic given the same inputs and tick count.
- Item/target values are `BigInt`. Serialized as strings (JSON has no BigInt).
- Fixed-timestep sim at ~10 ticks/s (configurable constant). Render loop is separate (rAF) and interpolates between ticks.
- Grid dimensions are level data, never hardcoded engine limits.
- Save format is versioned (`version` field gates migrations).
- No heavy deps beyond the stack above without asking. No native-build deps (use `bcryptjs`, not `bcrypt`).
- No online features, accounts beyond the seeded list, analytics, or monetization.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
Dockerfile, docker-compose.yml, .dockerignore, .gitignore, .env.example

src/
  sim/
    grid.ts          # GameState type, cell indexing, bounds, direction deltas
    grid.test.ts
    items.ts         # Item type, createItem, BigInt value helpers
    items.test.ts
    entities.ts      # Cell union: belt/extractor/operator/sink + accept rules
    entities.test.ts
    tick.ts          # step(state): fixed-timestep update (emit/move/produce)
    tick.test.ts
    save.ts          # serialize/deserialize, versioned, BigInt-as-string
    save.test.ts
  content/
    operations.ts    # OpId, OPERATIONS map (addition for MVP)
    operations.test.ts
    levels.ts        # LevelDef, MVP_LEVEL (~20x14), buildInitialState
    levels.test.ts
  render/
    renderer.ts      # Renderer interface + Theme type
    themes.ts        # THEMES: chunkyToy / cleanFlat / neonArcade
    pixi-renderer.ts # PixiJS implementation (Pixi.Graphics)
  input/
    place.ts         # place/remove belts on the grid (mutates sim state)
  net/
    api.ts           # apiLogin/apiLogout/apiGetState/apiSaveState
  ui/
    login.ts         # login form overlay
    hud.ts           # target readout, theme switcher, win banner
  main.ts            # bootstrap: login gate, fixed-tick + rAF loops, wiring

server/
  users.ts           # seeded USERS (username -> bcrypt hash), verifyUser
  storage.ts         # per-user JSON load/save under data/
  index.ts           # Express: static hosting + /api routes + session
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev`, `npm run build`, `npm test` toolchain. Vite dev server proxies `/api` → `http://localhost:3000`.

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
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { outDir: 'dist' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
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

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Install and verify**

Run: `npm install && npm test`
Expected: install succeeds; test run PASSES (1 test).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Grid model & directions

**Files:**
- Create: `src/sim/grid.ts`, `src/sim/grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Direction = 'up' | 'down' | 'left' | 'right'`
  - `const DELTA: Record<Direction, { dx: number; dy: number }>`
  - `interface GameState { version: number; levelId: string; tick: number; width: number; height: number; cells: (Cell | null)[]; items: Item[]; nextItemId: number; status: 'playing' | 'won'; }` (imports `Cell` from `./entities`, `Item` from `./items`)
  - `function idx(width: number, x: number, y: number): number`
  - `function inBounds(state: GameState, x: number, y: number): boolean`
  - `function cellAt(state: GameState, x: number, y: number): Cell | null`
  - `function setCell(state: GameState, x: number, y: number, cell: Cell | null): void`
  - `function itemAt(state: GameState, x: number, y: number): Item | undefined`

- [ ] **Step 1: Write the failing test** — `src/sim/grid.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { idx, inBounds, cellAt, setCell, itemAt, DELTA, GameState } from './grid';

function blankState(w = 3, h = 3): GameState {
  return { version: 1, levelId: 't', tick: 0, width: w, height: h,
    cells: new Array(w * h).fill(null), items: [], nextItemId: 1, status: 'playing' };
}

describe('grid', () => {
  it('indexes row-major', () => {
    expect(idx(4, 2, 1)).toBe(6);
  });
  it('bounds-checks', () => {
    const s = blankState();
    expect(inBounds(s, 0, 0)).toBe(true);
    expect(inBounds(s, -1, 0)).toBe(false);
    expect(inBounds(s, 3, 0)).toBe(false);
  });
  it('sets and reads a cell', () => {
    const s = blankState();
    const belt = { type: 'belt', dir: 'right' } as const;
    setCell(s, 1, 1, belt);
    expect(cellAt(s, 1, 1)).toEqual(belt);
    expect(cellAt(s, 0, 0)).toBeNull();
    expect(cellAt(s, 9, 9)).toBeNull();
  });
  it('finds an item at a cell', () => {
    const s = blankState();
    s.items.push({ id: 1, value: 5n, x: 2, y: 2, px: 2, py: 2 });
    expect(itemAt(s, 2, 2)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
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

- [ ] **Step 3: Write minimal implementation** — `src/sim/grid.ts`

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
  levelId: string;
  tick: number;
  width: number;
  height: number;
  cells: (Cell | null)[];
  items: Item[];
  nextItemId: number;
  status: 'playing' | 'won';
}

export function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function cellAt(state: GameState, x: number, y: number): Cell | null {
  if (!inBounds(state, x, y)) return null;
  return state.cells[idx(state.width, x, y)];
}

export function setCell(state: GameState, x: number, y: number, cell: Cell | null): void {
  if (!inBounds(state, x, y)) return;
  state.cells[idx(state.width, x, y)] = cell;
}

export function itemAt(state: GameState, x: number, y: number): Item | undefined {
  return state.items.find((it) => it.x === x && it.y === y);
}
```

- [ ] **Step 4: Create stub `src/sim/entities.ts` and `src/sim/items.ts` so imports resolve** (fleshed out in Tasks 3–4)

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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/sim/grid.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sim/grid.ts src/sim/grid.test.ts src/sim/items.ts src/sim/entities.ts
git commit -m "feat(sim): grid model, indexing, directions"
```

---

## Task 3: Items & BigInt values

**Files:**
- Modify: `src/sim/items.ts`
- Create: `src/sim/items.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Item { id: number; value: bigint; x: number; y: number; px: number; py: number; }` (already stubbed — keep identical)
  - `function createItem(id: number, value: bigint, x: number, y: number): Item` (sets `px=x`, `py=y`)

- [ ] **Step 1: Write the failing test** — `src/sim/items.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createItem } from './items';

describe('items', () => {
  it('creates an item with previous position equal to current', () => {
    const it = createItem(7, 42n, 3, 4);
    expect(it).toEqual({ id: 7, value: 42n, x: 3, y: 4, px: 3, py: 4 });
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
- Consumes: `Direction` from `./grid`; `OpId` from `../content/operations` (stub the import path — Task 7 fills it; for now define `OpId` locally re-exported).
- Produces:
  - `type OpId = string` (temporary; Task 7 narrows it — keep as `string` here to avoid a cross-task cycle)
  - `interface BeltCell { type: 'belt'; dir: Direction }`
  - `interface ExtractorCell { type: 'extractor'; dir: Direction; value: bigint; everyTicks: number; sinceEmit: number }`
  - `interface OperatorCell { type: 'operator'; op: OpId; dir: Direction; inputs: bigint[] }`
  - `interface SinkCell { type: 'sink'; target: bigint }`
  - `type Cell = BeltCell | ExtractorCell | OperatorCell | SinkCell`
  - `function accepts(cell: Cell | null, incomingCount: number): boolean` — can a cell receive an item moving into it right now? belt: yes if no item there (caller checks occupancy; this returns cell-type capability), operator: `inputs.length + incomingCount < 2`, sink: always, extractor: never, null: never.

  Note: occupancy of belts is checked by the tick mover, not here. `accepts` answers "does this cell type take an item, given its own buffer state".

- [ ] **Step 1: Write the failing test** — `src/sim/entities.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { accepts, Cell } from './entities';

describe('entities.accepts', () => {
  it('belt accepts', () => {
    expect(accepts({ type: 'belt', dir: 'right' }, 0)).toBe(true);
  });
  it('sink always accepts', () => {
    expect(accepts({ type: 'sink', target: 10n }, 0)).toBe(true);
  });
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
  it('null accepts nothing', () => {
    expect(accepts(null, 0)).toBe(false);
  });
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

export function accepts(cell: Cell | null, incomingCount: number): boolean {
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
  - `type OpId = 'add'` (MVP; widen later)
  - `interface Operation { id: OpId; symbol: string; apply: (a: bigint, b: bigint) => bigint }`
  - `const OPERATIONS: Record<OpId, Operation>`
  - `function applyOp(op: OpId, a: bigint, b: bigint): bigint`

- [ ] **Step 1: Write the failing test** — `src/content/operations.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyOp, OPERATIONS } from './operations';

describe('operations', () => {
  it('adds with BigInt', () => {
    expect(applyOp('add', 7n, 5n)).toBe(12n);
  });
  it('exposes a display symbol', () => {
    expect(OPERATIONS.add.symbol).toBe('+');
  });
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

## Task 6: The tick — emit, move, produce, win

This is the core simulation. `step(state)` mutates state in place (allocation-light per CLAUDE.md).

**Files:**
- Create: `src/sim/tick.ts`, `src/sim/tick.test.ts`

**Interfaces:**
- Consumes: `GameState`, `DELTA`, `cellAt`, `itemAt`, `inBounds`, `idx` from `./grid`; `Cell`, `accepts` from `./entities`; `createItem` from `./items`; `applyOp` from `../content/operations`.
- Produces:
  - `const TICKS_PER_SECOND = 10`
  - `function step(state: GameState): void` — advances exactly one tick.

**Tick order (documented in code — the *why* matters):**
1. **Emit:** each extractor increments `sinceEmit`; when `>= everyTicks`, if the cell in front is empty of items AND `accepts(...)`, spawn an item there and reset `sinceEmit`.
2. **Move:** each item's next cell = its current cell's belt direction (items only self-propel while on a belt). Resolve downstream-first: repeatedly move any item whose target cell is a valid, currently-unoccupied destination, until no more move this tick. Moving into an operator absorbs the item into `inputs` (item removed); moving into a sink consumes it and, if `value === target`, sets `status='won'`.
3. **Produce:** each operator with `inputs.length >= 2` whose output cell (its `dir`) is empty of items and `accepts` emits `applyOp(op, inputs[0], inputs[1])` there and drops those two inputs.
4. `state.tick++`.

Interpolation bookkeeping: at the start of `step`, set every item's `px,py = x,y`. Newly spawned/produced items get `px,py` = their spawn cell (via `createItem`).

- [ ] **Step 1: Write the failing tests** — `src/sim/tick.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { step } from './tick';
import { GameState, setCell, itemAt } from './grid';
import { createItem } from './items';
import type { Cell } from './entities';

function state(w: number, h: number): GameState {
  return { version: 1, levelId: 't', tick: 0, width: w, height: h,
    cells: new Array(w * h).fill(null), items: [], nextItemId: 1, status: 'playing' };
}
const belt = (dir: any): Cell => ({ type: 'belt', dir });

describe('tick: movement', () => {
  it('advances an item one cell along a belt', () => {
    const s = state(4, 1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });

  it('records previous position for interpolation', () => {
    const s = state(4, 1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    const it = itemAt(s, 1, 0)!;
    expect([it.px, it.py]).toEqual([0, 0]);
  });

  it('does not advance into an occupied cell that stays put', () => {
    const s = state(3, 1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, belt('right')); // no cell at (2,0): item at (1,0) cannot move
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    // item 1 blocked (edge), so item 2 blocked behind it
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)?.id).toBe(2);
  });

  it('advances a train downstream-first in one tick', () => {
    const s = state(4, 1);
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
    const s = state(3, 1);
    setCell(s, 0, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 2, sinceEmit: 0 });
    setCell(s, 1, 0, belt('right'));
    step(s); // sinceEmit 0->1, no emit
    expect(itemAt(s, 1, 0)).toBeUndefined();
    step(s); // sinceEmit 1->2 == everyTicks, emit
    expect(itemAt(s, 1, 0)?.value).toBe(5n);
  });
});

describe('tick: operator', () => {
  it('combines two inputs into a OP b on the output cell', () => {
    const s = state(3, 3);
    // operator at (1,1) outputs right to (2,1)
    setCell(s, 1, 1, { type: 'operator', op: 'add', dir: 'right', inputs: [] });
    setCell(s, 2, 1, belt('right'));
    // two belts feeding into the operator cell
    setCell(s, 0, 1, belt('right'));
    setCell(s, 1, 0, belt('down'));
    s.items.push(createItem(1, 7n, 0, 1)); // will move right into (1,1)
    s.items.push(createItem(2, 4n, 1, 0)); // will move down into (1,1)
    step(s); // both absorbed into operator inputs; item list emptied
    expect(s.items.length).toBe(0);
    step(s); // operator has 2 inputs -> produce 11 at (2,1)
    expect(itemAt(s, 2, 1)?.value).toBe(11n);
  });
});

describe('tick: sink / win', () => {
  it('consumes an item and wins when it equals the target', () => {
    const s = state(2, 1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, { type: 'sink', target: 9n });
    s.items.push(createItem(1, 9n, 0, 0));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('won');
  });

  it('consumes without winning when value != target', () => {
    const s = state(2, 1);
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
import { GameState, DELTA, cellAt, itemAt, inBounds } from './grid';
import type { Cell, OperatorCell, ExtractorCell } from './entities';
import { accepts } from './entities';
import { createItem } from './items';
import { applyOp } from '../content/operations';
import type { OpId } from '../content/operations';

export const TICKS_PER_SECOND = 10;

// One deterministic simulation step. Order — emit, move, produce — is chosen so
// freshly-emitted items don't also move in the same tick (predictable pacing),
// and operator outputs appear before they start moving next tick.
export function step(state: GameState): void {
  // Interpolation bookkeeping: remember where each item was this tick.
  for (const it of state.items) { it.px = it.x; it.py = it.y; }

  emit(state);
  move(state);
  produce(state);

  state.tick++;
}

function emit(state: GameState): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = cellAt(state, x, y);
      if (cell?.type !== 'extractor') continue;
      const ex = cell as ExtractorCell;
      ex.sinceEmit++;
      if (ex.sinceEmit < ex.everyTicks) continue;
      const { dx, dy } = DELTA[ex.dir];
      const tx = x + dx, ty = y + dy;
      const target = cellAt(state, tx, ty);
      if (accepts(target, 0) && !itemAt(state, tx, ty)) {
        state.items.push(createItem(state.nextItemId++, ex.value, tx, ty));
        ex.sinceEmit = 0;
      }
    }
  }
}

function move(state: GameState): void {
  // Downstream-first resolution: keep moving any item whose target is a valid,
  // currently-free destination until nothing else can move this tick. This lets
  // a packed belt advance as a train (the front leaves, freeing the next slot).
  const moved = new Set<number>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const it of state.items) {
      if (moved.has(it.id)) continue;
      const cell = cellAt(state, it.x, it.y);
      if (cell?.type !== 'belt') continue; // only belts self-propel
      const { dx, dy } = DELTA[cell.dir];
      const tx = it.x + dx, ty = it.y + dy;
      if (!inBounds(state, tx, ty)) { moved.add(it.id); continue; }
      const target = cellAt(state, tx, ty);
      if (!target) { moved.add(it.id); continue; }

      if (target.type === 'operator') {
        const op = target as OperatorCell;
        if (op.inputs.length < 2) { op.inputs.push(it.value); removeItem(state, it.id); progressed = true; }
        else { moved.add(it.id); }
        continue;
      }
      if (target.type === 'sink') {
        if (it.value === target.target) state.status = 'won';
        removeItem(state, it.id);
        progressed = true;
        continue;
      }
      if (target.type === 'belt') {
        if (!itemAt(state, tx, ty)) { it.x = tx; it.y = ty; moved.add(it.id); progressed = true; }
        // else: blocked this pass; may free up as downstream items move, so leave unmarked
        continue;
      }
      moved.add(it.id); // extractor or other: cannot enter
    }
  }
}

function produce(state: GameState): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = cellAt(state, x, y);
      if (cell?.type !== 'operator') continue;
      const op = cell as OperatorCell;
      if (op.inputs.length < 2) continue;
      const { dx, dy } = DELTA[op.dir];
      const tx = x + dx, ty = y + dy;
      const target = cellAt(state, tx, ty);
      if (accepts(target, 0) && !itemAt(state, tx, ty)) {
        const result = applyOp(op.op as OpId, op.inputs[0], op.inputs[1]);
        state.items.push(createItem(state.nextItemId++, result, tx, ty));
        op.inputs.splice(0, 2);
      }
    }
  }
}

function removeItem(state: GameState, id: number): void {
  const i = state.items.findIndex((it) => it.id === id);
  if (i >= 0) state.items.splice(i, 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/tick.test.ts`
Expected: PASS (all tests). If the "train" test flakes, confirm the `while (progressed)` loop is present — that is what advances the train in one tick.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat(sim): fixed-timestep tick (emit/move/produce/win)"
```

---

## Task 7: Save format (versioned, round-trip)

**Files:**
- Create: `src/sim/save.ts`, `src/sim/save.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./grid`.
- Produces:
  - `const SAVE_VERSION = 1`
  - `function serialize(state: GameState): string`
  - `function deserialize(json: string): GameState`
  - BigInt values (item `value`, extractor `value`, operator `inputs`, sink `target`) round-trip via string encoding.

- [ ] **Step 1: Write the failing test** — `src/sim/save.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SAVE_VERSION } from './save';
import { GameState, setCell } from './grid';
import { createItem } from './items';

function sample(): GameState {
  const s: GameState = { version: SAVE_VERSION, levelId: 'mvp-1', tick: 12, width: 3, height: 2,
    cells: new Array(6).fill(null), items: [], nextItemId: 3, status: 'playing' };
  setCell(s, 0, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 4, sinceEmit: 1 });
  setCell(s, 1, 0, { type: 'operator', op: 'add', dir: 'right', inputs: [7n] });
  setCell(s, 2, 0, { type: 'sink', target: 30n });
  s.items.push(createItem(1, 9999999999n, 1, 0));
  return s;
}

describe('save', () => {
  it('round-trips state including BigInt values', () => {
    const s = sample();
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
    // spot-check BigInt survived as BigInt, not string/number
    expect(typeof restored.items[0].value).toBe('bigint');
    expect(restored.items[0].value).toBe(9999999999n);
    const op = restored.cells[1] as any;
    expect(op.inputs[0]).toBe(7n);
  });

  it('stamps the current version', () => {
    const json = JSON.parse(serialize(sample()));
    expect(json.version).toBe(SAVE_VERSION);
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

// JSON has no BigInt. Encode every bigint as { __big: "<decimal>" } and decode
// on the way back so values survive a round-trip as real BigInt.
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { __big: value.toString() } : value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__big' in (value as any)) {
    return BigInt((value as any).__big);
  }
  return value;
}

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, version: SAVE_VERSION }, replacer);
}

export function deserialize(json: string): GameState {
  return JSON.parse(json, reviver) as GameState;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/save.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/save.ts src/sim/save.test.ts
git commit -m "feat(sim): versioned save/load with BigInt round-trip"
```

---

## Task 8: MVP level & initial state builder

**Files:**
- Create: `src/content/levels.ts`, `src/content/levels.test.ts`

**Interfaces:**
- Consumes: `GameState`, `setCell` from `../sim/grid`; `Cell` from `../sim/entities`; `SAVE_VERSION` from `../sim/save`.
- Produces:
  - `interface LevelDef { id: string; width: number; height: number; target: bigint; place: { x: number; y: number; cell: Cell }[] }`
  - `const MVP_LEVEL: LevelDef` (~20×14; two extractors, some pre-placed belts optional, one operator, one sink at the target). The player will add belts to complete routing.
  - `function buildInitialState(level: LevelDef): GameState`

- [ ] **Step 1: Write the failing test** — `src/content/levels.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { MVP_LEVEL, buildInitialState } from './levels';
import { cellAt } from '../sim/grid';

describe('MVP level', () => {
  it('is roomy and declares its own dimensions', () => {
    expect(MVP_LEVEL.width).toBeGreaterThanOrEqual(20);
    expect(MVP_LEVEL.height).toBeGreaterThanOrEqual(12);
  });
  it('builds an initial state with the declared entities placed', () => {
    const s = buildInitialState(MVP_LEVEL);
    expect(s.width).toBe(MVP_LEVEL.width);
    expect(s.status).toBe('playing');
    // at least one extractor and one sink exist
    const types = s.cells.filter(Boolean).map((c) => c!.type);
    expect(types).toContain('extractor');
    expect(types).toContain('sink');
  });
  it('has an obvious reachable solution (target within small-number reach)', () => {
    expect(MVP_LEVEL.target).toBeGreaterThan(0n);
    expect(MVP_LEVEL.target).toBeLessThanOrEqual(30n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/levels.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/content/levels.ts`

```ts
import { GameState, setCell } from '../sim/grid';
import type { Cell } from '../sim/entities';
import { SAVE_VERSION } from '../sim/save';

export interface LevelDef {
  id: string;
  width: number;
  height: number;
  target: bigint;
  place: { x: number; y: number; cell: Cell }[];
}

// Phase 1: addition only, small numbers, target in the 5–30 range, and always
// an obvious solution (7 + 5 = 12). Grid is deliberately roomy for routing.
export const MVP_LEVEL: LevelDef = {
  id: 'mvp-1',
  width: 20,
  height: 14,
  target: 12n,
  place: [
    { x: 2, y: 4, cell: { type: 'extractor', dir: 'right', value: 7n, everyTicks: 8, sinceEmit: 0 } },
    { x: 2, y: 9, cell: { type: 'extractor', dir: 'right', value: 5n, everyTicks: 8, sinceEmit: 0 } },
    { x: 10, y: 6, cell: { type: 'operator', op: 'add', dir: 'right', inputs: [] } },
    { x: 17, y: 6, cell: { type: 'sink', target: 12n } },
  ],
};

export function buildInitialState(level: LevelDef): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    levelId: level.id,
    tick: 0,
    width: level.width,
    height: level.height,
    cells: new Array(level.width * level.height).fill(null),
    items: [],
    nextItemId: 1,
    status: 'playing',
  };
  for (const p of level.place) setCell(s, p.x, p.y, structuredCloneCell(p.cell));
  return s;
}

// Clone so the mutable level template (operator.inputs, extractor.sinceEmit)
// is never shared between a level def and a live game state.
function structuredCloneCell(cell: Cell): Cell {
  return JSON.parse(JSON.stringify(cell, (_k, v) => (typeof v === 'bigint' ? { __big: v.toString() } : v)),
    (_k, v) => (v && typeof v === 'object' && '__big' in v ? BigInt(v.__big) : v));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/content/levels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full sim regression + commit**

Run: `npm test`
Expected: ALL sim/content tests PASS.

```bash
git add src/content/levels.ts src/content/levels.test.ts
git commit -m "feat(content): MVP addition level + initial-state builder"
```

---

## Task 9: Renderer interface & themes

**Files:**
- Create: `src/render/renderer.ts`, `src/render/themes.ts`

**Interfaces:**
- Consumes: `GameState` from `../sim/grid`.
- Produces:
  - `interface Theme { id: string; name: string; background: number; grid: number; belt: number; beltEdge: number; extractor: number; operator: number; sink: number; item: number; itemText: number; font: string; cornerRadius: number; glow: boolean }` (colors are PixiJS numeric hex, e.g. `0xff8800`)
  - `interface Renderer { init(theme: Theme): Promise<void>; setTheme(theme: Theme): void; draw(state: GameState, alpha: number): void; resize(w: number, h: number): void; destroy(): void }`
  - `const THEMES: Theme[]` (chunkyToy, cleanFlat, neonArcade) and `const DEFAULT_THEME: Theme`.

- [ ] **Step 1: Create `src/render/renderer.ts`**

```ts
import type { GameState } from '../sim/grid';

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
  font: string;
  cornerRadius: number;
  glow: boolean;
}

export interface Renderer {
  init(theme: Theme): Promise<void>;
  setTheme(theme: Theme): void;
  // alpha in [0,1]: interpolation between the previous tick (px,py) and current (x,y).
  draw(state: GameState, alpha: number): void;
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
    item: 0xffee58, itemText: 0x3e2723,
    font: '900 22px system-ui', cornerRadius: 10, glow: false,
  },
  {
    id: 'cleanFlat', name: 'Clean Flat',
    background: 0xf7f9fc, grid: 0xe3e8ef,
    belt: 0xcfd8e3, beltEdge: 0xb0bcca,
    extractor: 0x7cc4a4, operator: 0xf2b880, sink: 0x8aa9d6,
    item: 0xffffff, itemText: 0x334155,
    font: '600 20px system-ui', cornerRadius: 6, glow: false,
  },
  {
    id: 'neonArcade', name: 'Neon Arcade',
    background: 0x0d0221, grid: 0x1b1040,
    belt: 0x2d1b69, beltEdge: 0x00e5ff,
    extractor: 0x00ff9c, operator: 0xff2e97, sink: 0x00b3ff,
    item: 0xfff200, itemText: 0x0d0221,
    font: '800 20px monospace', cornerRadius: 4, glow: true,
  },
];

export const DEFAULT_THEME: Theme = THEMES[0];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/render/renderer.ts src/render/themes.ts
git commit -m "feat(render): Renderer interface + three themes"
```

---

## Task 10: PixiJS renderer

**Files:**
- Create: `src/render/pixi-renderer.ts`

**Interfaces:**
- Consumes: `Renderer`, `Theme` from `./renderer`; `GameState`, `cellAt` from `../sim/grid`; PixiJS.
- Produces: `class PixiRenderer implements Renderer` and `function createPixiRenderer(parent: HTMLElement): PixiRenderer`.

**Notes:** Retained-mode. Draw grid + cells once per theme/level into a static `Graphics`; redraw items every frame into a dynamic `Graphics` + a small pool of `Text` objects. Compute a `cellSize` that fits the grid into the viewport and center it. On `setTheme`, clear and rebuild static layer.

- [ ] **Step 1: Implement `src/render/pixi-renderer.ts`**

```ts
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Renderer, Theme } from './renderer';
import type { GameState } from '../sim/grid';
import { cellAt } from '../sim/grid';

export class PixiRenderer implements Renderer {
  private app = new Application();
  private parent: HTMLElement;
  private theme!: Theme;
  private staticLayer = new Container();
  private itemLayer = new Container();
  private cellSize = 32;
  private offsetX = 0;
  private offsetY = 0;
  private lastState: GameState | null = null;
  private textPool: Text[] = [];

  constructor(parent: HTMLElement) { this.parent = parent; }

  async init(theme: Theme): Promise<void> {
    this.theme = theme;
    await this.app.init({ background: theme.background, resizeTo: this.parent, antialias: true });
    this.parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.staticLayer);
    this.app.stage.addChild(this.itemLayer);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.app.renderer.background.color = theme.background;
    if (this.lastState) this.rebuildStatic(this.lastState);
  }

  resize(_w: number, _h: number): void {
    if (this.lastState) this.rebuildStatic(this.lastState);
  }

  private computeLayout(state: GameState): void {
    const vw = this.app.renderer.width;
    const vh = this.app.renderer.height;
    this.cellSize = Math.floor(Math.min(vw / state.width, vh / state.height));
    this.offsetX = Math.floor((vw - this.cellSize * state.width) / 2);
    this.offsetY = Math.floor((vh - this.cellSize * state.height) / 2);
  }

  private cx(x: number): number { return this.offsetX + x * this.cellSize; }
  private cy(y: number): number { return this.offsetY + y * this.cellSize; }

  private rebuildStatic(state: GameState): void {
    this.computeLayout(state);
    this.staticLayer.removeChildren();
    const t = this.theme, cs = this.cellSize, r = t.cornerRadius;
    const g = new Graphics();
    // grid lines
    for (let x = 0; x <= state.width; x++) g.rect(this.cx(x), this.cy(0), 1, cs * state.height);
    for (let y = 0; y <= state.height; y++) g.rect(this.cx(0), this.cy(y), cs * state.width, 1);
    g.fill(t.grid);
    // cells
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = cellAt(state, x, y);
        if (!cell) continue;
        const px = this.cx(x) + 2, py = this.cy(y) + 2, sz = cs - 4;
        const color = cell.type === 'belt' ? t.belt
          : cell.type === 'extractor' ? t.extractor
          : cell.type === 'operator' ? t.operator : t.sink;
        g.roundRect(px, py, sz, sz, r).fill(color);
        if (cell.type === 'belt') g.roundRect(px, py, sz, sz, r).stroke({ width: 2, color: t.beltEdge });
        if (cell.type === 'sink') {
          const label = new Text({ text: String(cell.target), style: { fill: 0xffffff, fontSize: 16, fontFamily: 'system-ui' } });
          label.x = px + 4; label.y = py + 4; this.staticLayer.addChild(label);
        }
      }
    }
    this.staticLayer.addChild(g);
  }

  draw(state: GameState, alpha: number): void {
    if (state !== this.lastState) { this.lastState = state; this.rebuildStatic(state); }
    const t = this.theme, cs = this.cellSize;
    this.itemLayer.removeChildren();
    const g = new Graphics();
    let ti = 0;
    for (const it of state.items) {
      const ix = (it.px + (it.x - it.px) * alpha);
      const iy = (it.py + (it.y - it.py) * alpha);
      const px = this.cx(ix) + cs / 2, py = this.cy(iy) + cs / 2, rad = cs * 0.32;
      if (t.glow) g.circle(px, py, rad + 4).fill({ color: t.item, alpha: 0.25 });
      g.circle(px, py, rad).fill(t.item);
      const label = this.textPool[ti] ?? new Text({ text: '', style: { fill: t.itemText, fontSize: 16, fontFamily: 'system-ui', fontWeight: 'bold' } });
      this.textPool[ti] = label;
      label.text = String(it.value);
      label.anchor.set(0.5);
      label.x = px; label.y = py;
      label.style.fill = t.itemText;
      this.itemLayer.addChild(label);
      ti++;
    }
    this.itemLayer.addChildAt(g, 0);
  }

  destroy(): void { this.app.destroy(true, { children: true }); }
}

export function createPixiRenderer(parent: HTMLElement): PixiRenderer {
  return new PixiRenderer(parent);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If PixiJS v8 API names differ in the installed version, adjust `Graphics` fluent calls per the installed types — the shape stays: rounded rects for cells, circles for items, `Text` for numbers.)

- [ ] **Step 3: Commit**

```bash
git add src/render/pixi-renderer.ts
git commit -m "feat(render): PixiJS renderer with interpolation and theming"
```

---

## Task 11: Input — place & remove belts

**Files:**
- Create: `src/input/place.ts`

**Interfaces:**
- Consumes: `GameState`, `cellAt`, `setCell`, `inBounds` from `../sim/grid`; `Direction` from `../sim/grid`.
- Produces:
  - `function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean` — places a belt only on an empty in-bounds cell; returns success.
  - `function removeCell(state: GameState, x: number, y: number): boolean` — removes a belt (only belts are player-removable); returns success.
  - `function screenToCell(px: number, py: number, offsetX: number, offsetY: number, cellSize: number): { x: number; y: number }`

- [ ] **Step 1: Write the failing test** — `src/input/place.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { placeBelt, removeCell, screenToCell } from './place';
import { GameState, cellAt, setCell } from '../sim/grid';

function state(w = 4, h = 4): GameState {
  return { version: 1, levelId: 't', tick: 0, width: w, height: h,
    cells: new Array(w * h).fill(null), items: [], nextItemId: 1, status: 'playing' };
}

describe('input.place', () => {
  it('places a belt on an empty cell', () => {
    const s = state();
    expect(placeBelt(s, 1, 1, 'right')).toBe(true);
    expect(cellAt(s, 1, 1)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('refuses to overwrite a non-empty cell', () => {
    const s = state();
    setCell(s, 1, 1, { type: 'sink', target: 5n });
    expect(placeBelt(s, 1, 1, 'right')).toBe(false);
  });
  it('removes only belts', () => {
    const s = state();
    placeBelt(s, 0, 0, 'up');
    setCell(s, 1, 0, { type: 'sink', target: 5n });
    expect(removeCell(s, 0, 0)).toBe(true);
    expect(cellAt(s, 0, 0)).toBeNull();
    expect(removeCell(s, 1, 0)).toBe(false);
  });
  it('maps screen coordinates to cells', () => {
    expect(screenToCell(70, 40, 10, 10, 30)).toEqual({ x: 2, y: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/place.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `src/input/place.ts`

```ts
import { GameState, cellAt, setCell, inBounds } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean {
  if (!inBounds(state, x, y) || cellAt(state, x, y)) return false;
  setCell(state, x, y, { type: 'belt', dir });
  return true;
}

export function removeCell(state: GameState, x: number, y: number): boolean {
  const cell = cellAt(state, x, y);
  if (cell?.type !== 'belt') return false;
  setCell(state, x, y, null);
  return true;
}

export function screenToCell(px: number, py: number, offsetX: number, offsetY: number, cellSize: number) {
  return { x: Math.floor((px - offsetX) / cellSize), y: Math.floor((py - offsetY) / cellSize) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/place.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/input/place.ts src/input/place.test.ts
git commit -m "feat(input): place/remove belts + screen-to-cell mapping"
```

---

## Task 12: Server — seeded users & auth helpers

**Files:**
- Create: `server/users.ts`, `server/users.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `bcryptjs`.
- Produces:
  - `interface User { username: string; hash: string }`
  - `function loadUsers(): User[]` — reads `SEED_USERS` env (`user:plainOrHash` comma list) OR falls back to a built-in dev pair; hashes any plaintext at load.
  - `function verifyUser(users: User[], username: string, password: string): boolean`

  For MVP simplicity, `SEED_USERS` accepts `username:password` pairs and hashes them at startup (fine for a private family app; documented in `.env.example`).

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
  if (!u) return false;
  return bcrypt.compareSync(password, u.hash);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/users.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

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
  - `function saveState(dataDir: string, username: string, json: string): void` — writes `<dataDir>/<safeUser>.json`.
  - `function loadState(dataDir: string, username: string): string | null` — returns saved JSON string or null.
  - Username sanitized to `[a-z0-9_-]` for the filename.

- [ ] **Step 1: Write the failing test** — `server/storage.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveState, loadState } from './storage';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bf-')); });

describe('storage', () => {
  it('returns null when no save exists', () => {
    expect(loadState(dir, 'kid')).toBeNull();
  });
  it('round-trips a saved state for a user', () => {
    saveState(dir, 'kid', '{"hello":1}');
    expect(loadState(dir, 'kid')).toBe('{"hello":1}');
  });
  it('keeps users separate and sanitizes names', () => {
    saveState(dir, 'kid', 'A');
    saveState(dir, 'dad', 'B');
    expect(loadState(dir, 'kid')).toBe('A');
    expect(loadState(dir, '../evil')).toBe(null); // sanitized to a safe name, no save yet
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/storage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/storage.test.ts
git commit -m "feat(server): per-user JSON save storage"
```

---

## Task 14: Server — Express app (static + API + session)

**Files:**
- Create: `server/index.ts`

**Interfaces:**
- Consumes: `express`, `cookie-session`, `loadUsers`/`verifyUser` from `./users`, `loadState`/`saveState` from `./storage`.
- Produces: an HTTP server on `PORT` (default 3000) with:
  - `POST /api/login` `{username, password}` → 200 + session cookie, or 401.
  - `POST /api/logout` → 200, clears session.
  - `GET /api/me` → `{username}` or 401.
  - `GET /api/state` → saved JSON (as `application/json`) or 204 if none (401 if not logged in).
  - `POST /api/save` (raw JSON body, logged-in) → 200.
  - Static: serves `dist/` for everything else.

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

app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'bf',
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

function requireUser(req: express.Request, res: express.Response): string | null {
  const u = req.session?.username as string | undefined;
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
  const u = req.session?.username as string | undefined;
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

- [ ] **Step 2: Add a session type augmentation so TS accepts `req.session.username`**

Create `server/express-session.d.ts`:
```ts
import 'cookie-session';
declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject { username?: string }
  }
}
```

- [ ] **Step 3: Manual smoke test the API (no frontend yet)**

Run in one terminal: `SEED_USERS=kid:apples npm start`
In another:
```bash
curl -s -c /tmp/j -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"username":"kid","password":"apples"}'
curl -s -b /tmp/j -X POST localhost:3000/api/save -H 'content-type: application/json' -d '{"tick":1}'
curl -s -b /tmp/j localhost:3000/api/state
```
Expected: login returns `{"username":"kid"}`; state returns `{"tick":1}`.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts server/express-session.d.ts
git commit -m "feat(server): express static host + auth/session/save API"
```

---

## Task 15: Client API + login + main loop wiring

**Files:**
- Create: `src/net/api.ts`, `src/ui/login.ts`, `src/ui/hud.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a running game: login gate → build/load state → fixed-tick sim loop + rAF render loop → place belts with mouse → autosave → theme switcher → win banner.

- [ ] **Step 1: Create `src/net/api.ts`**

```ts
export async function apiLogin(username: string, password: string): Promise<boolean> {
  const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }) });
  return r.ok;
}
export async function apiMe(): Promise<string | null> {
  const r = await fetch('/api/me');
  return r.ok ? (await r.json()).username as string : null;
}
export async function apiLogout(): Promise<void> { await fetch('/api/logout', { method: 'POST' }); }
export async function apiGetState(): Promise<string | null> {
  const r = await fetch('/api/state');
  if (r.status === 204) return null;
  if (!r.ok) return null;
  return await r.text();
}
export async function apiSaveState(json: string): Promise<void> {
  await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json });
}
```

- [ ] **Step 2: Create `src/ui/login.ts`**

```ts
import { apiLogin } from '../net/api';

// Renders a simple centered login form; resolves once login succeeds.
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

export function createHud(parent: HTMLElement, onTheme: (t: Theme) => void) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;font-family:system-ui;z-index:5';
  const target = document.createElement('div');
  target.style.cssText = 'background:#000a;color:#fff;padding:6px 12px;border-radius:8px;font-weight:700';
  const sel = document.createElement('select');
  sel.style.cssText = 'padding:6px;border-radius:8px';
  for (const t of THEMES) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); }
  sel.addEventListener('change', () => { const t = THEMES.find((x) => x.id === sel.value)!; onTheme(t); });
  const banner = document.createElement('div');
  banner.style.cssText = 'margin-left:auto;background:#2e7d32;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  banner.textContent = '🎉 You did it!';
  bar.append(target, sel, banner);
  parent.appendChild(bar);
  return {
    update(state: GameState) {
      const sink = state.cells.find((c) => c?.type === 'sink') as any;
      target.textContent = `Target: ${sink ? sink.target : '?'}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';
    },
  };
}
```

- [ ] **Step 4: Rewrite `src/main.ts` to wire everything**

```ts
import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme } from './render/renderer';
import { MVP_LEVEL, buildInitialState } from './content/levels';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import type { GameState } from './sim/grid';
import { placeBelt, removeCell, screenToCell } from './input/place';
import { showLogin } from './ui/login';
import { createHud } from './ui/hud';
import { apiMe, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

async function boot() {
  if (!(await apiMe())) await showLogin(parent);

  const saved = await apiGetState();
  const state: GameState = saved ? deserialize(saved) : buildInitialState(MVP_LEVEL);

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);
  const hud = createHud(parent, (t) => { theme = t; renderer.setTheme(t); });

  // --- input: click to place a belt, right-click to remove ---
  // Renderer owns layout; recompute here to map clicks. Kept in sync via draw().
  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  function pickCell(ev: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    const cs = renderer['cellSize'], ox = renderer['offsetX'], oy = renderer['offsetY'];
    return screenToCell(ev.clientX - r.left, ev.clientY - r.top, ox, oy, cs);
  }
  let placeDir: 'up' | 'down' | 'left' | 'right' = 'right';
  window.addEventListener('keydown', (e) => {
    const m: Record<string, typeof placeDir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (m[e.key]) placeDir = m[e.key];
  });
  canvas.addEventListener('mousedown', (e) => {
    const { x, y } = pickCell(e);
    if (e.button === 2) removeCell(state, x, y);
    else placeBelt(state, x, y, placeDir);
    e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- fixed-timestep sim loop ---
  const tickMs = 1000 / TICKS_PER_SECOND;
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc += now - last; last = now;
    while (acc >= tickMs) { step(state); acc -= tickMs; dirty = true; }
    const alpha = Math.min(acc / tickMs, 1);
    renderer.draw(state, alpha);
    hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- autosave: every 3s if changed, and on exit ---
  setInterval(() => { if (dirty) { apiSaveState(serialize(state)); dirty = false; } }, 3000);
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon('/api/save', new Blob([serialize(state)], { type: 'application/json' }));
  });
}

boot();
```

> Note: `frame` uses `performance.now()`; the very first call receives the rAF timestamp. `last` is seeded before the loop so the first delta is ~0.

- [ ] **Step 5: Typecheck + run the whole app**

Run: `npx tsc --noEmit` → no errors.
Run: `SEED_USERS=kid:apples npm run dev`
Open the Vite URL. Expected: login form → after login, a grid with two extractors, an operator, and a target sink appears; numbers emit and sit on cells; clicking lays belts (arrow keys change direction); routing 7 and 5 into the operator and its output into the sink flips the win banner; theme dropdown restyles live.

- [ ] **Step 6: Commit**

```bash
git add src/net/api.ts src/ui/login.ts src/ui/hud.ts src/main.ts
git commit -m "feat: wire login, game loop, input, autosave, theme switcher"
```

---

## Task 16: Docker Compose deployment

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Interfaces:**
- Consumes: the built app + server.
- Produces: `docker-compose up` serves the game on a host port with a persistent `data/` volume.

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

Run: `docker compose up --build -d`
Open `http://localhost:8080`.
Expected: login with a seeded user works; play, place belts, win; refresh the page — game resumes from the saved state; `docker compose down && docker compose up -d` — state persists via the volume.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: docker-compose deployment with persistent data volume"
```

---

## Task 17: Full verification & CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (Current Status + engine note)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests PASS across sim, content, input, server.

- [ ] **Step 2: Update `CLAUDE.md`**

- Under **Tech Stack / Rendering**: note PixiJS is confirmed and rendering goes through a `Renderer` interface + `Theme` config so the engine is swappable and themable.
- Replace **Current Status** with: MVP shipped — dockerized, seeded-user login, single addition level, save/resume, three themes with a live switcher. Next: difficulty progression (Phases 2–4) as data, and render/sim rollups when profiling calls for them.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — engine settled, MVP status"
```

---

## Self-Review Notes (author checklist — done)

- **Spec coverage:** PixiJS engine (T9–10), Renderer interface + Theme (T9), three themes + live switcher (T9, T15), flat-JSON per-user persistence (T13–14), seeded multi-user auth + bcrypt + session cookie (T12, T14), create/play/resume loop (T15), docker-compose + volume (T16), pure sim with fixed tick + BigInt + slot movement + operator + win (T2–8), versioned save round-trip (T7), grid as level data ~20×14 (T8), interpolation alpha (T6, T10), tests for tricky sim logic (T2–8, T11–13). All spec sections map to tasks.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** `GameState`, `Item{px,py}`, `Cell` union, `accepts`, `step`, `serialize/deserialize`, `Renderer`/`Theme`, `OPERATIONS/applyOp`, `MVP_LEVEL/buildInitialState`, `placeBelt/removeCell/screenToCell`, `loadUsers/verifyUser`, `loadState/saveState`, `apiLogin/apiMe/apiGetState/apiSaveState` — names used consistently across producing and consuming tasks. `OpId` is `string` in `entities.ts` (to avoid a sim→content cycle) and narrowed to `'add'` in `content/operations.ts`; `tick.ts` casts `op.op as OpId` at the call site — intentional and documented.
```
