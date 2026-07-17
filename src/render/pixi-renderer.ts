import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Renderer, Theme, Camera, Preview } from './renderer';
import type { GameState, Direction } from '../sim/grid';
import { parseKey, DELTA } from '../sim/grid';
import { buildingAt, portsOf, outCell, FOOTPRINT } from '../sim/buildings';
import { CHUNK_SIZE } from '../sim/world';
import { OPERATIONS } from '../content/operations';
import { formatValue, fitSize } from './format';

const WARN = 0xff5555; // "no output belt" indicator

export class PixiRenderer implements Renderer {
  private app = new Application();
  private parent: HTMLElement;
  private theme!: Theme;
  private layer = new Container();
  private cam: Camera = { x: 8, y: 6, zoom: 44 };
  private preview: Preview | null = null;
  private cellG = new Graphics(); // grid + nodes + belts + building bodies + arrows + ghost
  private itemG = new Graphics(); // item circles
  private texts: Text[] = [];

  constructor(parent: HTMLElement) { this.parent = parent; }

  async init(theme: Theme): Promise<void> {
    this.theme = theme;
    await this.app.init({ background: theme.background, resizeTo: this.parent, antialias: true });
    this.parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layer);
    this.layer.addChild(this.cellG);
    this.layer.addChild(this.itemG);
  }
  setTheme(theme: Theme): void { this.theme = theme; this.app.renderer.background.color = theme.background; }
  setCamera(cam: Camera): void { this.cam = cam; }
  setPreview(p: Preview | null): void { this.preview = p; }
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

  // A filled triangle centered on (cxp,cyp) pointing in world `dir`, radius ~size (px).
  private arrow(g: Graphics, cxp: number, cyp: number, size: number, dir: Direction, color: number, alpha = 1) {
    const d = DELTA[dir], px = -d.dy, py = d.dx; // perpendicular
    const tipx = cxp + d.dx * size, tipy = cyp + d.dy * size;
    const bx = cxp - d.dx * size * 0.5, by = cyp - d.dy * size * 0.5;
    g.poly([tipx, tipy, bx + px * size * 0.7, by + py * size * 0.7, bx - px * size * 0.7, by - py * size * 0.7])
      .fill({ color, alpha });
  }

  draw(state: GameState, alpha: number): void {
    const t = this.theme, cs = this.cam.zoom;
    const r = this.visibleCellRange();
    const g = this.cellG;
    g.clear();
    const inRange = (x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

    // grid lines
    for (let x = r.minX; x <= r.maxX; x++) g.rect(this.sx(x), this.sy(r.minY), 1, (r.maxY - r.minY) * cs);
    for (let y = r.minY; y <= r.maxY; y++) g.rect(this.sx(r.minX), this.sy(y), (r.maxX - r.minX) * cs, 1);
    g.fill(t.grid);

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

    // resource nodes (ground) — hidden where a building covers them
    for (const node of state.nodes.values()) {
      if (!inRange(node.x, node.y) || buildingAt(state, node.x, node.y)) continue;
      const px = this.sx(node.x) + 3, py = this.sy(node.y) + 3, sz = cs - 6;
      g.roundRect(px, py, sz, sz, t.cornerRadius).fill({ color: t.node, alpha: 0.9 });
      label(formatValue(node.value), this.sx(node.x) + cs / 2, this.sy(node.y) + cs / 2, t.nodeText, fitSize(formatValue(node.value), cs, Math.round(cs * 0.42)));
    }

    // belts (1x1) + a small direction chevron
    for (const [key, belt] of state.belts) {
      const { x, y } = parseKey(key);
      if (!inRange(x, y)) continue;
      const px = this.sx(x) + 2, py = this.sy(y) + 2, sz = cs - 4;
      g.roundRect(px, py, sz, sz, t.cornerRadius).fill(t.belt);
      g.roundRect(px, py, sz, sz, t.cornerRadius).stroke({ width: 2, color: t.beltEdge });
      this.arrow(g, this.sx(x) + cs / 2, this.sy(y) + cs / 2, cs * 0.2, belt.dir, t.beltEdge);
    }

    // 3x3 buildings: body, port arrows, no-output warning, center label
    for (const b of state.buildings.values()) {
      const ax = b.ax, ay = b.ay;
      if (!(ax + 2 >= r.minX && ax <= r.maxX && ay + 2 >= r.minY && ay <= r.maxY)) continue;
      const px = this.sx(ax) + 2, py = this.sy(ay) + 2, span = FOOTPRINT * cs - 4;
      const body = b.type === 'miner' ? t.miner : b.type === 'operator' ? t.operator : t.sink;
      g.roundRect(px, py, span, span, t.cornerRadius).fill(body);

      const cxWorld = ax + 1, cyWorld = ay + 1;
      const hasOut = b.type === 'target' || this.beltPresent(state, outCell(b));
      for (const port of portsOf(b)) {
        const d = DELTA[port.side];
        const ex = this.sx(cxWorld + d.dx) + cs / 2, ey = this.sy(cyWorld + d.dy) + cs / 2;
        if (port.role === 'out') this.arrow(g, ex, ey, cs * 0.28, port.dir, hasOut ? t.arrow : WARN, hasOut ? 1 : 0.9);
        else this.arrow(g, ex, ey, cs * 0.18, port.dir, t.arrow, 0.55);
      }

      const text = b.type === 'miner' ? formatValue(b.value)
        : b.type === 'operator' ? (OPERATIONS[b.op]?.symbol ?? '?')
        : formatValue(b.target);
      const centerPx = this.sx(cxWorld) + cs / 2, centerPy = this.sy(cyWorld) + cs / 2;
      label(text, centerPx, centerPy, t.buildingText, fitSize(text, FOOTPRINT * cs, Math.round(cs * 0.9)));
    }

    // placement ghost (building tools only)
    if (this.preview) {
      const p = this.preview;
      const px = this.sx(p.ox) + 2, py = this.sy(p.oy) + 2, span = FOOTPRINT * cs - 4;
      const tint = p.valid ? 0x33cc66 : WARN;
      g.roundRect(px, py, span, span, t.cornerRadius).fill({ color: tint, alpha: 0.35 });
      this.arrow(g, this.sx(p.ox + 1 + DELTA[p.dir].dx) + cs / 2, this.sy(p.oy + 1 + DELTA[p.dir].dy) + cs / 2, cs * 0.28, p.dir, tint, 0.8);
    }

    // items (interpolated) under labels
    const ig = this.itemG;
    ig.clear();
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      const px = this.sx(ix) + cs / 2, py = this.sy(iy) + cs / 2, rad = cs * 0.3;
      if (t.glow) ig.circle(px, py, rad + 4).fill({ color: t.item, alpha: 0.25 });
      ig.circle(px, py, rad).fill(t.item);
    }
    for (const it of state.items) {
      const ix = it.px + (it.x - it.px) * alpha, iy = it.py + (it.y - it.py) * alpha;
      const s = formatValue(it.value);
      label(s, this.sx(ix) + cs / 2, this.sy(iy) + cs / 2, t.itemText, fitSize(s, cs, Math.round(cs * 0.4)));
    }

    // hide pooled text not used this frame (kept for reuse, never dropped)
    for (let k = ti; k < this.texts.length; k++) this.texts[k].visible = false;
  }

  private beltPresent(state: GameState, c: { x: number; y: number }): boolean {
    return state.belts.has(`${c.x},${c.y}`);
  }
}

export function createPixiRenderer(parent: HTMLElement): PixiRenderer {
  return new PixiRenderer(parent);
}
