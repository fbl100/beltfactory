export type OpId = 'add';

export interface Operation {
  id: OpId;
  symbol: string;
  apply: (a: bigint, b: bigint) => bigint;
}

export const OPERATIONS: Record<OpId, Operation> = {
  add: { id: 'add', symbol: '+', apply: (a, b) => a + b },
};

export function applyOp(op: OpId, a: bigint, b: bigint): bigint {
  return OPERATIONS[op].apply(a, b);
}
