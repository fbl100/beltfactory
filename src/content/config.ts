// Tunable balance constants (data-driven — edit freely to retune pacing).
// Rates assume the sim runs at 2.5 ticks/s (150 ticks/min); see sim/tick.ts.

export const TARGET = 12n;        // the number to produce this level (7 + 5)
export const TARGET_COUNT = 20;   // deliveries to complete the level (big enough that adding adders saves real time)

// Throughput. An adder is 2-in-1-out, so its OUTPUT rate equals its PER-INPUT rate,
// and total input = 2 x output. Balanced set: operator 30/min out (= 30/min from each
// of its 2 inputs = 60/min total), fed by miner belts at 30/min each — a clean 1 belt : 1 input.
export const MINER_EVERY_TICKS = 5;     // 1 emit / 2s per output belt => 30/min per belt
export const OPERATOR_EVERY_TICKS = 5;  // 1 output / 2s => 30/min out (consumes 30/min from each input)
