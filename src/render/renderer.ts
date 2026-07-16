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
