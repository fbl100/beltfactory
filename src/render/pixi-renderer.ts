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
