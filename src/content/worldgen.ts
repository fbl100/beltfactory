import type { ChunkGenerator, AuthoredBuilding } from '../sim/world';
import type { ResourceNode } from '../sim/entities';
import { TARGET, TARGET_COUNT } from './config';

// Content model: the origin chunk is an authored addition puzzle. Two number
// nodes (7 and 5) sit on the ground and a target hub waits on the right — you
// must deliver TARGET_COUNT of the target number. The PLAYER places miners on the
// nodes and an + operator, then lays belts to route 7 and 5 through the + into the
// target. Every other chunk is empty buildable land. Buildings are 3x3 (anchor coords).

const NODES: ResourceNode[] = [
  { x: 2, y: 2, value: 7n },  // place a miner centered here -> out (4,2)
  { x: 2, y: 8, value: 5n },  // place a miner centered here -> out (4,8)
];

const BUILDINGS: AuthoredBuilding[] = [
  { type: 'target', x: 12, y: 4, dir: 'right', target: TARGET, required: TARGET_COUNT }, // center (13,5)
];

export const mvpGenerator: ChunkGenerator = (_seed, cx, cy) =>
  cx === 0 && cy === 0
    ? { nodes: NODES.map((n) => ({ ...n })), buildings: BUILDINGS.map((b) => ({ ...b })) }
    : {};
