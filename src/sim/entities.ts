import type { Direction } from './grid';

// The 1x1 layer. Belts carry items; splitters round-robin an incoming stream
// across their connected outgoing belts; resource nodes are a passive ground
// layer that miners sit on. Buildings (miner/operator/target) live in ./buildings.
export interface BeltCell { type: 'belt'; dir: Direction }
// `dir` is cosmetic (icon facing); `next` is the round-robin output pointer (0..3).
export interface SplitterCell { type: 'splitter'; dir: Direction; next: number }
// Underground belt: an 'in' entrance and an 'out' exit (same dir) form a pair. An
// item dives at the entrance and emerges at the nearest matching exit ahead, so a
// surface belt line can cross overhead.
export interface TunnelCell { type: 'tunnel'; dir: Direction; role: 'in' | 'out' }
export interface ResourceNode { x: number; y: number; value: bigint }
