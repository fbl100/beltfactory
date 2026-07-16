import type { Direction } from './grid';

export type OpId = string;

export interface BeltCell { type: 'belt'; dir: Direction }
export interface ExtractorCell {
  type: 'extractor';
  dir: Direction;
  value: bigint;
  everyTicks: number;
  sinceEmit: number;
}
export interface OperatorCell { type: 'operator'; op: OpId; dir: Direction; inputs: bigint[] }
export interface SinkCell { type: 'sink'; target: bigint }

export type Cell = BeltCell | ExtractorCell | OperatorCell | SinkCell;

export function accepts(cell: Cell | undefined, incomingCount: number): boolean {
  if (!cell) return false;
  switch (cell.type) {
    case 'belt': return true;
    case 'sink': return true;
    case 'extractor': return false;
    case 'operator': return cell.inputs.length + incomingCount < 2;
  }
}
