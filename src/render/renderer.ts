import type { GameState, Direction } from '../sim/grid';
import type { BuildingType } from '../sim/buildings';

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
  miner: number;
  operator: number;
  sink: number;        // the target / hub body
  node: number;
  nodeText: number;
  item: number;
  itemText: number;
  arrow: number;
  buildingText: number;
  cornerRadius: number;
  glow: boolean;
}

// A translucent placement preview ("ghost") for the selected building tool.
export interface Preview {
  type: BuildingType;
  ox: number; // anchor (top-left of the bounding box) world x
  oy: number; // anchor world y
  w: number;  // bounding-box size in cells (3x3 miner/target; 1x3 operator, oriented by dir)
  h: number;
  dir: Direction;
  valid: boolean;
}

export interface Renderer {
  init(theme: Theme): Promise<void>;
  setTheme(theme: Theme): void;
  setCamera(cam: Camera): void;
  setPreview(p: Preview | null): void;
  // alpha in [0,1]: interpolate items between previous (px,py) and current (x,y).
  draw(state: GameState, alpha: number): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  visibleChunkRange(): { minCx: number; minCy: number; maxCx: number; maxCy: number };
  // Unpadded world-cell extent of the viewport (for e.g. focusing a newly-granted deposit).
  visibleCellBounds(): { minX: number; maxX: number; minY: number; maxY: number };
  resize(w: number, h: number): void;
  destroy(): void;
}
