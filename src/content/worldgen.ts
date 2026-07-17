import type { ChunkGenerator, AuthoredBuilding } from '../sim/world';
import type { ResourceNode } from '../sim/entities';
import { LEVELS } from './levels';

// Content model: the origin chunk is the level-0 puzzle. Level 0's number deposits sit on
// the ground and a target hub waits on the right — you must deliver the target number the
// required number of times. The PLAYER places miners on the deposits and an + operator, then
// lays belts to route the numbers through the + into the target. Filling the bar advances to
// the next level (bigger target + a new deposit) via sim/progression — the same factory
// carries over. Every other chunk is empty buildable land. Buildings are 3x3 (anchor coords).

const TARGET_ANCHOR = { x: 12, y: 4 }; // center (13,5)

export const mvpGenerator: ChunkGenerator = (_seed, cx, cy) => {
  if (cx !== 0 || cy !== 0) return {};
  const lvl0 = LEVELS[0];
  const nodes: ResourceNode[] = lvl0.grantNodes.map((n) => ({ x: n.x, y: n.y, value: n.value }));
  const buildings: AuthoredBuilding[] = [
    { type: 'target', x: TARGET_ANCHOR.x, y: TARGET_ANCHOR.y, dir: 'right', target: lvl0.target, required: lvl0.required },
  ];
  return { nodes, buildings };
};
