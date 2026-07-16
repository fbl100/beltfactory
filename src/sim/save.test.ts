import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SAVE_VERSION } from './save';
import { emptyState, setCell, cellAt } from './grid';
import { createItem } from './items';

function sample() {
  const s = emptyState(4242);
  s.tick = 12; s.nextItemId = 3;
  s.loadedChunks.add('0,0');
  setCell(s, 1, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 4, sinceEmit: 1 });
  setCell(s, 8, 6, { type: 'operator', op: 'add', dir: 'right', inputs: [7n] });
  setCell(s, 13, 6, { type: 'sink', target: 30n });
  s.items.push(createItem(1, 9999999999n, 8, 6));
  return s;
}

describe('save', () => {
  it('round-trips sparse state including Map, Set and BigInt', () => {
    const s = sample();
    const r = deserialize(serialize(s));
    expect(r.seed).toBe(4242);
    expect(r.tick).toBe(12);
    expect(r.loadedChunks.has('0,0')).toBe(true);
    expect(cellAt(r, 8, 6)).toBeTruthy();
    expect((cellAt(r, 8, 6) as any).inputs[0]).toBe(7n);
    expect(typeof r.items[0].value).toBe('bigint');
    expect(r.items[0].value).toBe(9999999999n);
    expect(r.cells instanceof Map).toBe(true);
    expect(r.loadedChunks instanceof Set).toBe(true);
  });
  it('stamps the current version', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(SAVE_VERSION);
  });
});
