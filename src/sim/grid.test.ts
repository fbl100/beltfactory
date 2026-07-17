import { describe, it, expect } from 'vitest';
import {
  cellKey, parseKey, beltAt, setBelt, splitterAt, setSplitter, tunnelAt, setTunnel, nodeAt, itemAt, emptyState,
  DELTA, DIRECTIONS, OPPOSITE, RIGHT_OF, LEFT_OF,
} from './grid';

describe('sparse grid', () => {
  it('keys and parses cells including negatives', () => {
    expect(cellKey(-3, 4)).toBe('-3,4');
    expect(parseKey('-3,4')).toEqual({ x: -3, y: 4 });
  });
  it('sets, reads, and deletes belts at arbitrary coords', () => {
    const s = emptyState(1);
    setBelt(s, -5, 20, { type: 'belt', dir: 'right' });
    expect(beltAt(s, -5, 20)).toEqual({ type: 'belt', dir: 'right' });
    expect(beltAt(s, 0, 0)).toBeUndefined();
    setBelt(s, -5, 20, null);
    expect(beltAt(s, -5, 20)).toBeUndefined();
  });
  it('sets, reads, and deletes splitters', () => {
    const s = emptyState(1);
    setSplitter(s, 3, 4, { type: 'splitter', dir: 'right', next: 0 });
    expect(splitterAt(s, 3, 4)).toEqual({ type: 'splitter', dir: 'right', next: 0 });
    setSplitter(s, 3, 4, null);
    expect(splitterAt(s, 3, 4)).toBeUndefined();
  });
  it('sets, reads, and deletes tunnels', () => {
    const s = emptyState(1);
    setTunnel(s, 3, 4, { type: 'tunnel', dir: 'right', role: 'in' });
    expect(tunnelAt(s, 3, 4)).toEqual({ type: 'tunnel', dir: 'right', role: 'in' });
    setTunnel(s, 3, 4, null);
    expect(tunnelAt(s, 3, 4)).toBeUndefined();
  });
  it('reads a resource node', () => {
    const s = emptyState(1);
    s.nodes.set(cellKey(2, 2), { x: 2, y: 2, value: 7n });
    expect(nodeAt(s, 2, 2)?.value).toBe(7n);
    expect(nodeAt(s, 0, 0)).toBeUndefined();
  });
  it('finds an item at a cell', () => {
    const s = emptyState(1);
    s.items.push({ id: 1, value: 5n, x: 2, y: 2, px: 2, py: 2 });
    expect(itemAt(s, 2, 2)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('builds an empty state with the given seed', () => {
    const s = emptyState(99);
    expect(s.seed).toBe(99);
    expect(s.belts.size).toBe(0);
    expect(s.splitters.size).toBe(0);
    expect(s.tunnels.size).toBe(0);
    expect(s.buildings.size).toBe(0);
    expect(s.nodes.size).toBe(0);
    expect(s.occupancy.size).toBe(0);
    expect(s.delivered).toBe(0);
    expect(s.misses).toBe(0);
    expect(s.version).toBe(2);
    expect(s.status).toBe('playing');
  });
  it('exposes direction algebra', () => {
    expect(DELTA.right).toEqual({ dx: 1, dy: 0 });
    expect(DELTA.up).toEqual({ dx: 0, dy: -1 });
    expect(OPPOSITE.up).toBe('down');
    expect(RIGHT_OF.right).toBe('down');
    expect(LEFT_OF.right).toBe('up');
    expect([...DIRECTIONS]).toEqual(['up', 'right', 'down', 'left']);
  });
});
