import type { Direction } from './grid';

// The 1x1 layer. Belts carry items; resource nodes are a passive ground layer
// that miners sit on. Buildings (miner/operator/target) live in ./buildings.
export interface BeltCell { type: 'belt'; dir: Direction }
export interface ResourceNode { x: number; y: number; value: bigint }
