import type { Theme } from './renderer';

export const THEMES: Theme[] = [
  {
    id: 'chunkyToy', name: 'Chunky Toy',
    background: 0xfdf6e3, grid: 0xe8dcc0,
    belt: 0x8d6e63, beltEdge: 0x5d4037,
    building: { miner: 0x757575, operator: 0xfb8c00, target: 0x1e88e5, square: 0x43a047 },
    node: 0xd4a017, nodeText: 0x3e2723,
    item: 0xffee58, itemText: 0x3e2723,
    arrow: 0xffffff, buildingText: 0xffffff,
    cornerRadius: 10, glow: false,
  },
  {
    id: 'cleanFlat', name: 'Clean Flat',
    background: 0xf7f9fc, grid: 0xe3e8ef,
    belt: 0xcfd8e3, beltEdge: 0xb0bcca,
    building: { miner: 0x90a4ae, operator: 0xf2b880, target: 0x8aa9d6, square: 0x9c7fd4 },
    node: 0xcbb26a, nodeText: 0x4e342e,
    item: 0xffffff, itemText: 0x334155,
    arrow: 0x334155, buildingText: 0x1f2937,
    cornerRadius: 6, glow: false,
  },
  {
    id: 'neonArcade', name: 'Neon Arcade',
    background: 0x0d0221, grid: 0x1b1040,
    // Belt fill lightened (0x2d1b69 -> 0x352080) so belt paths read as figures when zoomed out
    // and the scrolling treads pop against them.
    belt: 0x352080, beltEdge: 0x00e5ff,
    building: { miner: 0x7c4dff, operator: 0xff2e97, target: 0x00b3ff, square: 0x39ff14 },
    // Deposits are amber ("ore in the ground"); live items stay electric yellow. Previously both
    // were near-identical yellows (0xffea00 vs 0xfff200), which read as the same thing to a kid.
    node: 0xffb300, nodeText: 0x0d0221,
    item: 0xfff200, itemText: 0x0d0221,
    arrow: 0x00e5ff, buildingText: 0xffffff,
    cornerRadius: 4, glow: true,
  },
];

export const DEFAULT_THEME: Theme = THEMES[2]; // Neon Arcade (playtester's pick)
