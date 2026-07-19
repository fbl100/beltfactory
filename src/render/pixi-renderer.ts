import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Renderer, Theme, Camera, Preview } from './renderer';
import type { GameState, Direction } from '../sim/grid';
import { parseKey, DELTA, DIRECTIONS, OPPOSITE } from '../sim/grid';
import { buildingAt, portsOf, operatorOutCells, operatorTips, minerOutputs, dimsOf, centerOf, FOOTPRINT, acceptsItemAt, squareCells, squareOutCell, feedsCell, assertNever } from '../sim/buildings';
import type { Building, MinerBuilding, OperatorBuilding, TargetBuilding, SquareBuilding } from '../sim/buildings';
import { CHUNK_SIZE } from '../sim/world';
import { OPERATIONS } from '../content/operations';
import { formatValue, fitSize } from './format';

const WARN = 0xff5555; // "no output belt" indicator

// The pooled label drawer created fresh each draw() (captures the per-frame text-pool cursor).
// Passed into the per-building helpers so they can stamp centered numbers/symbols.
type LabelFn = (text: string, cxp: number, cyp: number, fill: number, size: number) => void;

// Item birth animation: pop in from nothing (~120ms) with a gentle overshoot to 1.15x that
// settles back to 1.0 by ~200ms. Pure function of the item's age in ms.
const POP_MS = 200;
function spawnScale(ageMs: number): number {
  if (ageMs >= POP_MS) return 1;
  const grow = Math.min(1, ageMs / 120);                        // 0..1: pop up from nothing
  const overshoot = 0.15 * Math.sin(Math.min(1, ageMs / POP_MS) * Math.PI); // peak +15% mid-flight
  return grow * (1 + overshoot);
}

export class PixiRenderer implements Renderer {
  private app = new Application();
  private parent: HTMLElement;
  private theme!: Theme;
  private layer = new Container();
  private cam: Camera = { x: 8, y: 6, zoom: 44 };
  private preview: Preview | null = null;
  private pathPreview: { x: number; y: number; dir: Direction }[] | null = null; // belt-route ghost between two clicks
  // Cells the dead-end warning must NOT flag (set by main each session; defaults to "flag nothing suppressed").
  private graced: (x: number, y: number) => boolean = () => false;
  private hover: { x: number; y: number } | null = null;
  // Item birth times for the spawn-pop. Keyed by item id; the sim never stores render state. Each
  // entry records first-seen ms + the draw frame it was last seen, so we can prune vanished items
  // without allocating a Set of live ids every frame.
  private itemBirth = new Map<number, { first: number; frame: number }>();
  private drawFrame = 0;
  // Static geometry (grid + node bodies + belt bodies) — direction-agnostic, unanimated. Rebuilt only
  // when the layout/camera/theme change (tracked by a cheap hash), NOT every frame, so watching a
  // mostly-idle factory run stops churning Graphics geometry (that per-frame rebuild was driving the
  // GC pauses that made item motion visibly stutter). Sits BELOW cellG so animated treads draw on top.
  private staticG = new Graphics();
  private lastStaticHash = -1;
  private cellG = new Graphics(); // per-frame: treads, dead-end dim/throb, splitters, tunnels, buildings, ghost, labels
  private itemG = new Graphics(); // item circles
  private texts: Text[] = [];

  constructor(parent: HTMLElement) { this.parent = parent; }

  async init(theme: Theme): Promise<void> {
    this.theme = theme;
    await this.app.init({ background: theme.background, resizeTo: this.parent, antialias: true });
    this.parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layer);
    this.layer.addChild(this.staticG); // bottom: cached grid + belt/node bodies
    this.layer.addChild(this.cellG);
    this.layer.addChild(this.itemG);
  }
  setTheme(theme: Theme): void { this.theme = theme; this.app.renderer.background.color = theme.background; }
  setCamera(cam: Camera): void { this.cam = cam; }
  setPreview(p: Preview | null): void { this.preview = p; }
  setPathPreview(cells: { x: number; y: number; dir: Direction }[] | null): void { this.pathPreview = cells; }
  setDeadEndGrace(isGraced: (x: number, y: number) => boolean): void { this.graced = isGraced; }
  setHover(c: { x: number; y: number } | null): void { this.hover = c; }
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

  // Exact inverse of sx()/sy() (no flooring) so callers get sub-cell precision for anchoring DOM.
  worldToScreen(wx: number, wy: number) {
    return { x: this.sx(wx), y: this.sy(wy) };
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

  visibleCellBounds() {
    const halfW = this.vw / 2 / this.cam.zoom, halfH = this.vh / 2 / this.cam.zoom;
    return { minX: this.cam.x - halfW, maxX: this.cam.x + halfW, minY: this.cam.y - halfH, maxY: this.cam.y + halfH };
  }

  // A filled triangle centered on (cxp,cyp) pointing in world `dir`, radius ~size (px).
  private arrow(g: Graphics, cxp: number, cyp: number, size: number, dir: Direction, color: number, alpha = 1) {
    const d = DELTA[dir], px = -d.dy, py = d.dx; // perpendicular
    const tipx = cxp + d.dx * size, tipy = cyp + d.dy * size;
    const bx = cxp - d.dx * size * 0.5, by = cyp - d.dy * size * 0.5;
    g.poly([tipx, tipy, bx + px * size * 0.7, by + py * size * 0.7, bx - px * size * 0.7, by - py * size * 0.7])
      .fill({ color, alpha });
  }

  // Marching conveyor treads: TREADS chevrons scrolling in `dir` across the cell so a belt
  // visibly reads as "on". `phase` (0..1) is tick-synced (= interpolation alpha), so treads
  // travel one cell per tick — exactly item speed, so belts and items move together. Chevrons
  // fade at the cell edges so the loop point isn't a visible pop.
  private static readonly TREADS = 2;
  private beltTreads(g: Graphics, ccx: number, ccy: number, cs: number, dir: Direction, phase: number, color: number) {
    const d = DELTA[dir], span = cs * 0.9, size = cs * 0.17;
    for (let i = 0; i < PixiRenderer.TREADS; i++) {
      const f = (i / PixiRenderer.TREADS + phase) % 1;       // 0..1 position along the travel axis
      const o = (f - 0.5) * span;                            // pixels ahead/behind center
      const edgeFade = Math.min(1, (0.5 - Math.abs(f - 0.5)) * 4); // dim near the two ends
      this.arrow(g, ccx + d.dx * o, ccy + d.dy * o, size, dir, color, 0.35 + 0.5 * edgeFade);
    }
  }

  // Rebuild the cached static layer: grid lines + resource-node bodies + belt bodies — all
  // direction-agnostic and unanimated. Called from draw() ONLY when the static hash changes, so the
  // ~belt-count roundRects + grid rects stop being re-emitted every frame.
  private drawStatic(state: GameState, r: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const t = this.theme, cs = this.cam.zoom, sg = this.staticG;
    sg.clear();
    const inRange = (x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
    // grid lines
    for (let x = r.minX; x <= r.maxX; x++) sg.rect(this.sx(x), this.sy(r.minY), 1, (r.maxY - r.minY) * cs);
    for (let y = r.minY; y <= r.maxY; y++) sg.rect(this.sx(r.minX), this.sy(y), (r.maxX - r.minX) * cs, 1);
    sg.fill(t.grid);
    // resource node bodies (labels are drawn per-frame in draw()) — hidden where a building covers them
    for (const node of state.nodes.values()) {
      if (!inRange(node.x, node.y) || buildingAt(state, node.x, node.y)) continue;
      const px = this.sx(node.x) + 3, py = this.sy(node.y) + 3, sz = cs - 6;
      sg.roundRect(px, py, sz, sz, t.cornerRadius).fill({ color: t.node, alpha: 0.9 });
    }
    // belt bodies (full alpha; dead-end dim + treads are animated per-frame in draw())
    for (const key of state.belts.keys()) {
      const { x, y } = parseKey(key);
      if (!inRange(x, y)) continue;
      const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
      sg.roundRect(px, py, sz, sz, t.cornerRadius).fill(t.belt);
      sg.roundRect(px, py, sz, sz, t.cornerRadius).stroke({ width: 2, color: t.beltEdge });
    }
  }

  draw(state: GameState, alpha: number): void {
    const t = this.theme, cs = this.cam.zoom;
    const r = this.visibleCellRange();
    const g = this.cellG;
    g.clear();
    // Tick-synced animation phase (0..1): items advance one cell per tick and interpolate over
    // `alpha`, so belt treads scrolling by this phase stay locked to item speed.
    const beltPhase = ((state.tick + alpha) % 1 + 1) % 1;
    this.drawFrame++;
    // Wall-clock pulse (ms) driving ephemeral warning throbs; NOT tick-synced (throbs pulse smoothly
    // even while the sim is paused during a celebration).
    const nowMs = performance.now();
    const inRange = (x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

    // Cached static layer (grid + node/belt bodies): rebuild only when the view or layout changes.
    // The hash is cheap (map sizes + camera + theme) and allocates nothing, so idle frames skip the
    // rebuild entirely — that per-frame geometry churn was the GC source behind the motion stutter.
    const staticHash = ((Math.round(this.cam.x * 64) * 0x9e3779b1) ^ (Math.round(this.cam.y * 64) * 0x85ebca77)
      ^ (Math.round(cs * 16) * 0xc2b2ae3d) ^ (Math.round(this.vw) * 0x27d4eb2f) ^ (Math.round(this.vh) * 0x165667b1)
      ^ (state.belts.size * 0x9e3779b1) ^ (state.nodes.size * 0x85ebca77) ^ (state.buildings.size * 0xc2b2ae3d) ^ t.background) >>> 0;
    if (staticHash !== this.lastStaticHash) { this.drawStatic(state, r); this.lastStaticHash = staticHash; }

    // pooled label helper (numbers/symbols on top of everything)
    let ti = 0;
    const label = (text: string, cxp: number, cyp: number, fill: number, size: number) => {
      let txt = this.texts[ti];
      if (!txt) { txt = new Text({ text: '' }); this.texts[ti] = txt; this.layer.addChild(txt); }
      ti++;
      txt.visible = true;
      txt.text = text;
      txt.anchor.set(0.5);
      txt.x = cxp; txt.y = cyp;
      txt.style = { fill, fontSize: size, fontFamily: 'system-ui', fontWeight: 'bold' } as any;
    };

    // resource node labels (bodies live in the cached static layer) — hidden where a building covers them
    for (const node of state.nodes.values()) {
      if (!inRange(node.x, node.y) || buildingAt(state, node.x, node.y)) continue;
      label(formatValue(node.value), this.sx(node.x) + cs / 2, this.sy(node.y) + cs / 2, t.nodeText, fitSize(formatValue(node.value), cs, Math.round(cs * 0.42)));
    }

    // belts (1x1): bodies are in the cached static layer; here we draw only the ANIMATED parts —
    // marching conveyor treads, and for a DEAD END (downstream can't accept) a dim overlay + frozen
    // treads + a throbbing red cap with "!". this.graced suppresses the warning on cells the player is
    // actively working on, so painting a normal line never flashes red at every head.
    for (const [key, belt] of state.belts) {
      const { x, y } = parseKey(key);
      if (!inRange(x, y)) continue;
      const d = DELTA[belt.dir];
      const deadEnd = !acceptsItemAt(state, x + d.dx, y + d.dy) && !this.graced(x, y);
      const ccx = this.sx(x) + cs / 2, ccy = this.sy(y) + cs / 2;
      // dead-end dim: background @0.55 over the full-alpha static body == the old bodyAlpha=0.45 look
      if (deadEnd) {
        const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
        g.roundRect(px, py, sz, sz, t.cornerRadius).fill({ color: t.background, alpha: 0.55 });
      }
      // frozen treads (fixed centered phase) read as "stopped"; live tick-synced phase otherwise
      this.beltTreads(g, ccx, ccy, cs, belt.dir, deadEnd ? 0.5 : beltPhase, t.beltEdge);
      if (deadEnd) {
        const ex = ccx + d.dx * cs * 0.42, ey = ccy + d.dy * cs * 0.42; // leading-edge midpoint
        const perpx = -d.dy, perpy = d.dx, half = cs * 0.34;
        const throb = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(nowMs / 220)); // ~0.5..0.9 pulse
        g.moveTo(ex + perpx * half, ey + perpy * half)
          .lineTo(ex - perpx * half, ey - perpy * half)
          .stroke({ width: cs * 0.16, color: WARN, alpha: throb, cap: 'round' }); // soft red cap
        label('!', ccx + d.dx * cs * 0.26, ccy + d.dy * cs * 0.26, WARN, Math.round(cs * 0.5));
      }
    }

    // splitters (1x1): body + a chevron toward each active output + a hub dot
    for (const key of state.splitters.keys()) {
      const { x, y } = parseKey(key);
      if (!inRange(x, y)) continue;
      const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
      g.roundRect(px, py, sz, sz, t.cornerRadius).fill(t.belt);
      g.roundRect(px, py, sz, sz, t.cornerRadius).stroke({ width: 3, color: t.arrow });
      const ccx = this.sx(x) + cs / 2, ccy = this.sy(y) + cs / 2;
      for (const d of DIRECTIONS) {
        const nk = `${x + DELTA[d].dx},${y + DELTA[d].dy}`;
        const nb = state.belts.get(nk);
        const isOut = (nb !== undefined && nb.dir !== OPPOSITE[d]) || state.splitters.has(nk);
        if (isOut) this.arrow(g, ccx + DELTA[d].dx * cs * 0.28, ccy + DELTA[d].dy * cs * 0.28, cs * 0.16, d, t.arrow);
      }
      g.circle(ccx, ccy, cs * 0.1).fill(t.arrow);
    }

    // tunnels (1x1): body + a center marker (dark = entrance/down, bright = exit/up) + dir arrow
    for (const [key, tun] of state.tunnels) {
      const { x, y } = parseKey(key);
      if (!inRange(x, y)) continue;
      const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
      g.roundRect(px, py, sz, sz, t.cornerRadius).fill(t.belt);
      g.roundRect(px, py, sz, sz, t.cornerRadius).stroke({ width: 2, color: t.beltEdge });
      const ccx = this.sx(x) + cs / 2, ccy = this.sy(y) + cs / 2;
      if (tun.role === 'in') g.circle(ccx, ccy, cs * 0.2).fill({ color: 0x000000, alpha: 0.55 });
      else g.circle(ccx, ccy, cs * 0.2).fill({ color: t.item, alpha: 0.95 });
      this.arrow(g, ccx, ccy, cs * 0.2, tun.dir, t.arrow, 1);
    }

    // buildings (miner/target 3x3, operator 1x3): body, port arrows, no-output warning, center label
    for (const b of state.buildings.values()) {
      const ax = b.ax, ay = b.ay;
      const { w, h } = dimsOf(b);
      if (!(ax + w - 1 >= r.minX && ax <= r.maxX && ay + h - 1 >= r.minY && ay <= r.maxY)) continue;
      const px = this.sx(ax) + 2, py = this.sy(ay) + 2;
      const body = t.building[b.type];
      g.roundRect(px, py, w * cs - 4, h * cs - 4, t.cornerRadius).fill(body);
      // JUICE — hub fill meter: the target's body fills bottom-up with delivered/required, so she
      // watches the goal 'charge' with every correct number. (state.delivered is the level's count.)
      if (b.type === 'target' && b.required > 0) {
        const frac = Math.max(0, Math.min(1, state.delivered / b.required));
        if (frac > 0) {
          const bw = w * cs - 4, bh = h * cs - 4, fh = bh * frac;
          g.roundRect(px, py + (bh - fh), bw, fh, t.cornerRadius).fill({ color: t.item, alpha: 0.35 });
        }
      }
      // JUICE — miner breathe: brighten as the miner charges toward its next emit, then it resets
      // on emit (sinceEmit -> 0). +alpha makes the glow ramp smoothly between ticks.
      if (b.type === 'miner') {
        const charge = Math.min(1, (b.sinceEmit + alpha) / b.everyTicks);
        g.roundRect(px, py, w * cs - 4, h * cs - 4, t.cornerRadius).fill({ color: 0xffffff, alpha: 0.05 + 0.22 * charge });
      }

      // Per-type foreground: ports/output arrows, dead-end throbs, and the center label. Each helper
      // owns its full drawing (and its own center label — the squarer draws 'x²' itself).
      switch (b.type) {
        case 'miner': this.drawMiner(b, state, g, label); break;
        case 'square': this.drawSquare(b, state, g, nowMs, label); break;
        case 'operator': this.drawOperator(b, state, g, nowMs, label); break;
        case 'target': this.drawTarget(b, g, label); break;
        default: assertNever(b);
      }
    }

    // JUICE — hover outline: a soft pulsing highlight on the cell under the cursor (or the whole
    // building it belongs to). Read-only; setHover is fed each frame from main.ts.
    if (this.hover) {
      const hb = buildingAt(state, this.hover.x, this.hover.y);
      let ox = this.hover.x, oy = this.hover.y, hw = 1, hh = 1;
      if (hb) { const d = dimsOf(hb); ox = hb.ax; oy = hb.ay; hw = d.w; hh = d.h; }
      if (inRange(ox, oy) || inRange(ox + hw - 1, oy + hh - 1)) {
        const pulse = 0.45 + 0.25 * Math.sin(nowMs / 350);
        g.roundRect(this.sx(ox) + 1, this.sy(oy) + 1, hw * cs - 2, hh * cs - 2, t.cornerRadius)
          .stroke({ width: 2, color: t.arrow, alpha: pulse });
      }
    }

    // placement ghost (building tools only)
    if (this.preview) {
      const p = this.preview;
      const px = this.sx(p.ox) + 2, py = this.sy(p.oy) + 2;
      const tint = p.valid ? 0x33cc66 : WARN;
      g.roundRect(px, py, p.w * cs - 4, p.h * cs - 4, t.cornerRadius).fill({ color: tint, alpha: 0.35 });
      const gcx = p.ox + (p.w - 1) / 2, gcy = p.oy + (p.h - 1) / 2; // bounding-box center
      this.arrow(g, this.sx(gcx + DELTA[p.dir].dx) + cs / 2, this.sy(gcy + DELTA[p.dir].dy) + cs / 2, cs * 0.28, p.dir, tint, 0.8);
    }

    // belt-route ghost (click-start -> hover): translucent bodies + flow arrows, exactly the run a
    // second click will commit. Cells overlapping a building/splitter/tunnel are skipped by the router
    // and simply aren't in this list, so the ghost shows real gaps rather than lying about coverage.
    if (this.pathPreview) {
      for (const c of this.pathPreview) {
        if (!inRange(c.x, c.y)) continue;
        const px = this.sx(c.x) + 2, py = this.sy(c.y) + 2, sz = cs - 4;
        g.roundRect(px, py, sz, sz, t.cornerRadius).fill({ color: t.belt, alpha: 0.4 });
        this.arrow(g, this.sx(c.x) + cs / 2, this.sy(c.y) + cs / 2, cs * 0.24, c.dir, t.item, 0.75);
      }
    }

    // items (interpolated) under labels
    const ig = this.itemG;
    ig.clear();
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      // JUICE — spawn-pop: stamp first-seen ms on birth, refresh the frame marker every draw.
      let rec = this.itemBirth.get(it.id);
      if (rec) rec.frame = this.drawFrame;
      else { rec = { first: nowMs, frame: this.drawFrame }; this.itemBirth.set(it.id, rec); }
      const rad = cs * 0.3 * spawnScale(nowMs - rec.first);
      const px = this.sx(ix) + cs / 2, py = this.sy(iy) + cs / 2;
      if (t.glow) ig.circle(px, py, rad + 4).fill({ color: t.item, alpha: 0.25 });
      ig.circle(px, py, rad).fill(t.item);
    }
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      const s = formatValue(it.value);
      label(s, this.sx(ix) + cs / 2, this.sy(iy) + cs / 2, t.itemText, fitSize(s, cs, Math.round(cs * 0.4)));
    }

    // JUICE — prune birth records for items that no longer exist (consumed or delivered).
    for (const [id, rec] of this.itemBirth) if (rec.frame !== this.drawFrame) this.itemBirth.delete(id);

    // hide pooled text not used this frame (kept for reuse, never dropped)
    for (let k = ti; k < this.texts.length; k++) this.texts[k].visible = false;
  }

  private carrierPresent(state: GameState, c: { x: number; y: number }): boolean {
    const k = `${c.x},${c.y}`;
    return state.belts.has(k) || state.splitters.has(k) || state.tunnels.has(k);
  }

  // Miner (3x3, wide source): an arrow at each connected output cell, a faint pip at the rest,
  // plus the mined value centered.
  private drawMiner(b: MinerBuilding, state: GameState, g: Graphics, label: LabelFn): void {
    const t = this.theme, cs = this.cam.zoom;
    // wide output: an arrow at each connected output cell, a faint pip at the rest
    for (const o of minerOutputs(b)) {
      if (this.carrierPresent(state, o)) this.arrow(g, this.sx(o.x) + cs / 2, this.sy(o.y) + cs / 2, cs * 0.2, o.dir, t.arrow, 1);
      else g.circle(this.sx(o.x) + cs / 2, this.sy(o.y) + cs / 2, cs * 0.06).fill({ color: t.arrow, alpha: 0.3 });
    }
    const c = centerOf(b), text = formatValue(b.value);
    label(text, this.sx(c.x) + cs / 2, this.sy(c.y) + cs / 2, t.buildingText, fitSize(text, FOOTPRINT * cs, Math.round(cs * 0.9)));
  }

  // Squarer (1x2): a number enters the input end and leaves the output end squared. Draw an
  // input arrow + an output arrow (WARN if nothing receives it), throb the input if unfed, and
  // draw its own 'x²' label (so the shared center-label path skips it).
  private drawSquare(b: SquareBuilding, state: GameState, g: Graphics, nowMs: number, label: LabelFn): void {
    const t = this.theme, cs = this.cam.zoom;
    const { w, h } = dimsOf(b);
    const { input } = squareCells(b);
    const oc = squareOutCell(b);
    const hasOut = this.carrierPresent(state, oc);
    this.arrow(g, this.sx(oc.x) + cs / 2, this.sy(oc.y) + cs / 2, cs * 0.28, b.dir, hasOut ? t.arrow : WARN, hasOut ? 1 : 0.9);
    this.arrow(g, this.sx(input.x) + cs / 2, this.sy(input.y) + cs / 2, cs * 0.18, b.dir, t.arrow, 0.55);
    if (!feedsCell(state, input.x, input.y) && !this.graced(input.x, input.y)) {
      const throb = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(nowMs / 220)); // ~0.4..0.8 pulse
      g.circle(this.sx(input.x) + cs / 2, this.sy(input.y) + cs / 2, cs * 0.42).stroke({ width: cs * 0.09, color: WARN, alpha: throb });
    }
    // 'x²' label centered on the 1x2 bounding box
    label('x²', this.sx(b.ax) + w * cs / 2, this.sy(b.ay) + h * cs / 2, t.buildingText, Math.round(cs * 0.5));
  }

  // Operator (1x3 bar): input tips + two output edges (either can feed a belt); warn only if NEITHER
  // does. Ports drawn via the shared helper; each unfed tip throbs red. Center shows the op symbol.
  private drawOperator(b: OperatorBuilding, state: GameState, g: Graphics, nowMs: number, label: LabelFn): void {
    const t = this.theme, cs = this.cam.zoom;
    const c = centerOf(b);
    const hasOut = operatorOutCells(b).some((o) => this.carrierPresent(state, o));
    this.drawPorts(b, c.x, c.y, g, hasOut, label);
    // dead-end warning: an operator input tip fed by nothing throbs red (unless just placed / graced)
    const tips = operatorTips(b);
    const throb = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(nowMs / 220)); // ~0.4..0.8 pulse
    for (const tip of [tips.A, tips.B]) {
      if (feedsCell(state, tip.x, tip.y) || this.graced(tip.x, tip.y)) continue;
      g.circle(this.sx(tip.x) + cs / 2, this.sy(tip.y) + cs / 2, cs * 0.42)
        .stroke({ width: cs * 0.09, color: WARN, alpha: throb });
    }
    const text = OPERATIONS[b.op]?.symbol ?? '?';
    label(text, this.sx(c.x) + cs / 2, this.sy(c.y) + cs / 2, t.buildingText, fitSize(text, 1 * cs, Math.round(cs * 0.9)));
  }

  // Target hub (3x3): input ports only (it consumes, so ports never warn). Center shows the goal value.
  private drawTarget(b: TargetBuilding, g: Graphics, label: LabelFn): void {
    const t = this.theme, cs = this.cam.zoom;
    const c = centerOf(b);
    this.drawPorts(b, c.x, c.y, g, true, label); // hasOut=true: target has no output port, never warns
    const text = formatValue(b.target);
    label(text, this.sx(c.x) + cs / 2, this.sy(c.y) + cs / 2, t.buildingText, fitSize(text, FOOTPRINT * cs, Math.round(cs * 0.9)));
  }

  // Shared port arrows (operator & target): an out arrow (WARN when unfed via hasOut) or a faint in
  // arrow per port, plus any port label (operator A / B input tips) nudged toward the body.
  private drawPorts(b: Building, cxWorld: number, cyWorld: number, g: Graphics, hasOut: boolean, label: LabelFn): void {
    const t = this.theme, cs = this.cam.zoom;
    for (const port of portsOf(b)) {
      const d = DELTA[port.side];
      const ex = this.sx(cxWorld + d.dx) + cs / 2, ey = this.sy(cyWorld + d.dy) + cs / 2;
      if (port.role === 'out') this.arrow(g, ex, ey, cs * 0.28, port.dir, hasOut ? t.arrow : WARN, hasOut ? 1 : 0.9);
      else this.arrow(g, ex, ey, cs * 0.18, port.dir, t.arrow, 0.55);
      // labeled ports (operator A / B input tips) — nudged toward the body so the label
      // doesn't sit on the port arrow. (Rudimentary; a skin pass can lay this out nicely.)
      if (port.label) label(port.label, ex - d.dx * cs * 0.3, ey - d.dy * cs * 0.3, t.buildingText, Math.max(8, Math.round(cs * 0.22)));
    }
  }
}

export function createPixiRenderer(parent: HTMLElement): PixiRenderer {
  return new PixiRenderer(parent);
}
