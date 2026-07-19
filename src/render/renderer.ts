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
  // Per-building-type color. Keys are exactly 'miner' | 'operator' | 'target' | 'square'.
  // ('sink' from the old scalar field is now 'target' — the target/hub body color.)
  building: Record<BuildingType, number>;
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
  // Render-only hint for the dead-end warning: return true for cells the warning must NOT flag
  // (recently painted/placed, or under the cursor). Set from main; the sim never sees it.
  setDeadEndGrace(isGraced: (x: number, y: number) => boolean): void;
  // Cell under the cursor (or the building it belongs to), for a soft highlight; null clears it.
  setHover(cell: { x: number; y: number } | null): void;
  // alpha in [0,1]: interpolate items between previous (px,py) and current (x,y).
  draw(state: GameState, alpha: number): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  // Inverse of screenToWorld: world coords -> canvas-relative CSS px (add getBoundingClientRect() to
  // reach viewport px). Pass cell-CENTER coords (cellX + 0.5) to anchor to a cell's middle.
  worldToScreen(wx: number, wy: number): { x: number; y: number };
  visibleChunkRange(): { minCx: number; minCy: number; maxCx: number; maxCy: number };
  // Unpadded world-cell extent of the viewport (for e.g. focusing a newly-granted deposit).
  visibleCellBounds(): { minX: number; maxX: number; minY: number; maxY: number };
  resize(w: number, h: number): void;
  destroy(): void;
}
