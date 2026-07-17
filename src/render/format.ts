// Pure label helpers (no rendering deps).

// Shrink a label so it fits inside a box of `boxPx` pixels, capped at `base`.
export function fitSize(text: string, boxPx: number, base: number): number {
  const maxByWidth = (boxPx * 0.9) / Math.max(1, text.length * 0.6);
  return Math.max(8, Math.min(base, Math.floor(maxByWidth)));
}

// Full digits below 100000; K/M/B/T with one decimal above (early game stays full).
export function formatValue(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  if (abs < 100000n) return v.toString();
  const units: [bigint, string][] = [
    [1000000000000n, 'T'], [1000000000n, 'B'], [1000000n, 'M'], [1000n, 'K'],
  ];
  for (const [div, suf] of units) {
    if (abs >= div) {
      const whole = abs / div;
      const tenth = (abs % div) * 10n / div;
      const body = tenth === 0n ? `${whole}` : `${whole}.${tenth}`;
      return (neg ? '-' : '') + body + suf;
    }
  }
  return v.toString();
}
