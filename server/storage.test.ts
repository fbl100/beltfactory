import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveState, loadState } from './storage';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bf-')); });

describe('storage', () => {
  it('returns null when no save exists', () => { expect(loadState(dir, 'kid')).toBeNull(); });
  it('round-trips a saved state for a user', () => {
    saveState(dir, 'kid', '{"hello":1}');
    expect(loadState(dir, 'kid')).toBe('{"hello":1}');
  });
  it('keeps users separate and sanitizes names', () => {
    saveState(dir, 'kid', 'A'); saveState(dir, 'dad', 'B');
    expect(loadState(dir, 'kid')).toBe('A');
    expect(loadState(dir, '../evil')).toBeNull();
  });
});
