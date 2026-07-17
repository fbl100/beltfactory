// Tunable balance constants (data-driven — edit freely to retune pacing).
// Rates assume the sim runs at 2.5 ticks/s (150 ticks/min); see sim/tick.ts.

export const TARGET = 12n;        // the number to produce this level (7 + 5)
export const TARGET_COUNT = 6;    // how many of the target to deliver to complete the level

// Throughput: items advance 1 cell/tick, so a belt carries up to 150/min.
export const MINER_EVERY_TICKS = 5;      // 1 emit / 2s  => ~30/min per miner
export const OPERATOR_EVERY_TICKS = 20;  // 1 output / 8s => ~7.5/min out per adder (the throughput cap)
