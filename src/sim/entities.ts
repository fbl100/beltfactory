import type { Direction } from './grid';

// The 1x1 layer. Belts carry items; splitters round-robin an incoming stream
// across their connected outgoing belts; resource nodes are a passive ground
// layer that miners sit on. Buildings (miner/operator/target) live in ./buildings.
export interface BeltCell { type: 'belt'; dir: Direction }
// `dir` is cosmetic (icon facing); `next` is the round-robin output pointer (0..3).
export interface SplitterCell { type: 'splitter'; dir: Direction; next: number }
export interface ResourceNode { x: number; y: number; value: bigint }
