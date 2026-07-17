import { describe, it, expect } from 'vitest';
import { formatValue, fitSize } from './format';

describe('formatValue', () => {
  it('shows full digits for small numbers', () => {
    expect(formatValue(0n)).toBe('0');
    expect(formatValue(12n)).toBe('12');
    expect(formatValue(99999n)).toBe('99999');
  });
  it('abbreviates large numbers with one decimal', () => {
    expect(formatValue(100000n)).toBe('100K');
    expect(formatValue(1500000n)).toBe('1.5M');
    expect(formatValue(2000000000n)).toBe('2B');
  });
  it('handles negatives', () => {
    expect(formatValue(-42n)).toBe('-42');
    expect(formatValue(-1500000n)).toBe('-1.5M');
  });
});

describe('fitSize', () => {
  it('never returns below the floor', () => {
    expect(fitSize('123456789', 20, 24)).toBeGreaterThanOrEqual(8);
  });
  it('caps at the base size for short text', () => {
    expect(fitSize('7', 100, 20)).toBe(20);
  });
});
