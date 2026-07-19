import type { ChunkGenerator, AuthoredBuilding } from '../sim/world';
import type { ResourceNode } from '../sim/entities';
import { levelAt, startIndexForMode } from './levels';
import type { Mode } from './levels';

// Content model: the origin chunk is the level-0 puzzle. Level 0's number deposits sit on
// the ground and a target hub waits on the right — you must deliver the target number the
// required number of times. The PLAYER places miners on the deposits and an + operator, then
// lays belts to route the numbers through the + into the target. Filling the bar advances to
// the next level (bigger target + a new deposit) via sim/progression — the same factory
// carries over. Every other chunk is empty buildable land. Buildings are 3x3 (anchor coords).

const TARGET_ANCHOR = { x: 12, y: 4 }; // center (13,5)

// The origin chunk is the starting puzzle for the given mode: its number deposits + the target hub.
// normal → level 0 of the Prime Foundry campaign; easy → the first easy (+/−) puzzle. Both read from
// levelAt(startIndexForMode(mode)), so the deposits/target always match where newGame sets levelIndex.
export function makeGenerator(mode: Mode): ChunkGenerator {
  return (seed, cx, cy) => {
    if (cx !== 0 || cy !== 0) return {};
    const lvl = levelAt(startIndexForMode(mode), seed, mode);
    const nodes: ResourceNode[] = lvl.grantNodes.map((n) => ({ x: n.x, y: n.y, value: n.value }));
    const buildings: AuthoredBuilding[] = [
      { type: 'target', x: TARGET_ANCHOR.x, y: TARGET_ANCHOR.y, dir: 'right', target: lvl.target, required: lvl.required },
    ];
    return { nodes, buildings };
  };
}

// Back-compat default (normal mode) — used by the boot path and every existing caller/test.
export const mvpGenerator: ChunkGenerator = makeGenerator('normal');
