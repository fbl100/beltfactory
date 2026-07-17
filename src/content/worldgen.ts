import type { ChunkGenerator, AuthoredBuilding } from '../sim/world';
import type { ResourceNode } from '../sim/entities';

// Content model: the origin chunk is an authored addition puzzle — two number
// nodes (7 and 5) already fitted with miners, an add operator, and a target-12
// hub. The player lays belts to route 7 and 5 through the + into the target.
// Every other chunk is empty buildable land. Buildings are 3x3 (anchor coords).
export const TARGET = 12n;

const NODES: ResourceNode[] = [
  { x: 2, y: 2, value: 7n },
  { x: 2, y: 8, value: 5n },
];

const BUILDINGS: AuthoredBuilding[] = [
  { type: 'miner', x: 1, y: 1, dir: 'right' },                  // center (2,2)=7  -> out (4,2)
  { type: 'miner', x: 1, y: 7, dir: 'right' },                  // center (2,8)=5  -> out (4,8)
  { type: 'operator', x: 7, y: 4, dir: 'right', op: 'add' },    // center (8,5); ins (8,4)/(8,6); out (10,5)
  { type: 'target', x: 12, y: 4, dir: 'right', target: TARGET }, // center (13,5); left-in (12,5)
];

export const mvpGenerator: ChunkGenerator = (_seed, cx, cy) =>
  cx === 0 && cy === 0
    ? { nodes: NODES.map((n) => ({ ...n })), buildings: BUILDINGS.map((b) => ({ ...b })) }
    : {};
