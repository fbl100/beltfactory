export interface Item {
  id: number;
  value: bigint;
  x: number;
  y: number;
  px: number; // previous-tick cell x, for render interpolation
  py: number; // previous-tick cell y
}

export function createItem(id: number, value: bigint, x: number, y: number): Item {
  return { id, value, x, y, px: x, py: y };
}
