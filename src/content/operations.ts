export type OpId = 'add' | 'subtract' | 'multiply' | 'divide';

export interface Operation {
  id: OpId;
  symbol: string;   // drawn on the operator body
  label: string;    // HUD button text
  apply: (a: bigint, b: bigint) => bigint;
}

// All operations are ORDER-INDEPENDENT so the operator machine (which takes its two inputs from
// any of its three sides, in arrival order) needs no notion of "first" vs "second" operand — and
// so a 9-year-old never meets negative numbers or fractions:
//   +  a + b
//   −  |a − b|                          (absolute difference; never negative)
//   ×  a × b
//   ÷  bigger ÷ smaller, whole part only ("how many whole times the smaller fits"); ÷0 -> 0
export const OPERATIONS: Record<OpId, Operation> = {
  add:      { id: 'add',      symbol: '+', label: '+ Add', apply: (a, b) => a + b },
  subtract: { id: 'subtract', symbol: '−', label: '− Sub', apply: (a, b) => (a > b ? a - b : b - a) },
  multiply: { id: 'multiply', symbol: '×', label: '× Mul', apply: (a, b) => a * b },
  divide:   { id: 'divide',   symbol: '÷', label: '÷ Div', apply: (a, b) => {
    const hi = a > b ? a : b, lo = a > b ? b : a;
    return lo === 0n ? 0n : hi / lo;
  } },
};

// Canonical order (also the HUD button order). Data references ops by id; this is the full set.
export const ALL_OPS: OpId[] = ['add', 'subtract', 'multiply', 'divide'];

export function applyOp(op: OpId, a: bigint, b: bigint): bigint {
  return OPERATIONS[op].apply(a, b);
}
