// Pure-model tests for the hotbar (node environment — no DOM needed): the selection rule that
// guarantees exactly ONE slot ever glows, and the hotkey maps main.ts consumes.
import { describe, expect, it } from 'vitest';
import { SLOTS, TOOL_HOTKEYS, OP_HOTKEYS, slotIsSelected } from './hud';
import type { Tool } from './hud';
import { ALL_OPS } from '../content/operations';

const NON_OP_TOOLS: Tool[] = ['belt', 'splitter', 'tunnel', 'eraser'];

describe('hotbar selection model', () => {
  it('lights exactly one slot for every (tool, op) combination', () => {
    const tools: Tool[] = [...NON_OP_TOOLS, 'operator'];
    for (const tool of tools) {
      for (const op of ALL_OPS) {
        const lit = SLOTS.filter((s) => slotIsSelected(s, tool, op));
        expect(lit).toHaveLength(1);
      }
    }
  });

  it('never lights an op slot while a plain tool is active (the Belt-and-× bug)', () => {
    // Regression: with belt active and multiply remembered as the op, only Belt may glow.
    const lit = SLOTS.filter((s) => slotIsSelected(s, 'belt', 'multiply'));
    expect(lit).toHaveLength(1);
    expect(lit[0]).toMatchObject({ kind: 'tool', tool: 'belt' });
  });

  it('lights the chosen op slot (and only it) while the operator tool is active', () => {
    const lit = SLOTS.filter((s) => slotIsSelected(s, 'operator', 'divide'));
    expect(lit).toHaveLength(1);
    expect(lit[0]).toMatchObject({ kind: 'op', op: 'divide' });
  });
});

describe('hotkey maps (F2 owns the keymap)', () => {
  it('maps 1/2/3/0 to belt/split/tunnel/erase', () => {
    expect(TOOL_HOTKEYS['1']).toBe('belt');
    expect(TOOL_HOTKEYS['2']).toBe('splitter');
    expect(TOOL_HOTKEYS['3']).toBe('tunnel');
    expect(TOOL_HOTKEYS['0']).toBe('eraser');
  });

  it('maps 4/5/6/7 to + − × ÷ in ALL_OPS order', () => {
    expect(OP_HOTKEYS['4']).toBe('add');
    expect(OP_HOTKEYS['5']).toBe('subtract');
    expect(OP_HOTKEYS['6']).toBe('multiply');
    expect(OP_HOTKEYS['7']).toBe('divide');
  });

  it('has no overlap and covers every slot', () => {
    const keys = SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(SLOTS.length);
    for (const s of SLOTS) {
      if (s.kind === 'tool') expect(TOOL_HOTKEYS[s.key]).toBe(s.tool);
      else expect(OP_HOTKEYS[s.key]).toBe(s.op);
    }
  });
});
