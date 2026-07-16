import type { Theme } from './renderer';

export const THEMES: Theme[] = [
  {
    id: 'chunkyToy', name: 'Chunky Toy',
    background: 0xfdf6e3, grid: 0xe8dcc0,
    belt: 0x8d6e63, beltEdge: 0x5d4037,
    extractor: 0x43a047, operator: 0xfb8c00, sink: 0x1e88e5,
    item: 0xffee58, itemText: 0x3e2723, cornerRadius: 10, glow: false,
  },
  {
    id: 'cleanFlat', name: 'Clean Flat',
    background: 0xf7f9fc, grid: 0xe3e8ef,
    belt: 0xcfd8e3, beltEdge: 0xb0bcca,
    extractor: 0x7cc4a4, operator: 0xf2b880, sink: 0x8aa9d6,
    item: 0xffffff, itemText: 0x334155, cornerRadius: 6, glow: false,
  },
  {
    id: 'neonArcade', name: 'Neon Arcade',
    background: 0x0d0221, grid: 0x1b1040,
    belt: 0x2d1b69, beltEdge: 0x00e5ff,
    extractor: 0x00ff9c, operator: 0xff2e97, sink: 0x00b3ff,
    item: 0xfff200, itemText: 0x0d0221, cornerRadius: 4, glow: true,
  },
];

export const DEFAULT_THEME: Theme = THEMES[0];
