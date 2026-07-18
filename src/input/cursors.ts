// Per-tool mouse cursors — the pointer visibly becomes the tool you're holding, so a young
// player knows what a click will do without reading the toolbar. Pure SVG data-URIs: no asset
// pipeline, no new deps, and no render/sim imports (just the Tool + OpId string types).
//
// Every cursor bakes in a dark outline + light fill so it stays legible over ALL themes
// (the dark Neon Arcade default AND the two light themes) — cursors don't inherit the theme.
// A later skinning pass can restyle every glyph here in one place.
import type { Tool } from '../ui/hud';
import type { OpId } from '../content/operations';

// Built-in keywords for panning — universally understood, no reason to reinvent.
export const PAN = 'grab';
export const PANNING = 'grabbing';

const OP_GLYPH: Record<OpId, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
const ERASER_PINK = '#ff5ea8';

// Wrap an SVG string as a CSS cursor value with an integer hotspot and a keyword fallback.
// encodeURIComponent is required: raw '#' in hex colors and spaces/quotes otherwise break the URI.
function cursorValue(svg: string, hotX: number, hotY: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

// 32x32 canvas. `body` is the glyph markup; a dark stroke keeps it readable on light themes.
function svg32(body: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`;
}

function chevronCursor(): string {
  // A bold right-pointing chevron = "flow / belt". Always points right (non-directional): a
  // cursor that rotated with R made players unsure whether the belt or just the mouse changed.
  const body = `<path d='M11 7 L21 16 L11 25' fill='none' stroke='#0b132b' stroke-width='7'
    stroke-linecap='round' stroke-linejoin='round'/><path d='M11 7 L21 16 L11 25' fill='none'
    stroke='#ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/>`;
  return cursorValue(svg32(body), 16, 16, 'crosshair');
}

function splitterCursor(): string {
  // A Y-fork: one stem splitting into two.
  const outline = `stroke='#0b132b' stroke-width='7' fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const inner = `stroke='#ffffff' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const path = `M16 26 L16 17 M16 17 L8 8 M16 17 L24 8`;
  return cursorValue(svg32(`<path d='${path}' ${outline}/><path d='${path}' ${inner}/>`), 16, 16, 'crosshair');
}

function tunnelCursor(): string {
  // A down-arrow diving under a short ground line = "underground belt".
  const outline = `stroke='#0b132b' stroke-width='7' fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const inner = `stroke='#ffffff' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const ground = `M7 9 L25 9`;
  const arrow = `M16 12 L16 25 M10 19 L16 25 L22 19`;
  return cursorValue(
    svg32(`<path d='${ground}${arrow}' ${outline}/><path d='${ground}${arrow}' ${inner}/>`),
    16, 16, 'crosshair',
  );
}

function operatorCursor(op: OpId): string {
  // The LIVE op glyph in a soft circle — doubles as a reminder of which operator you'll drop.
  const g = OP_GLYPH[op] ?? '?';
  const body = `<circle cx='16' cy='16' r='11' fill='#0b132b'/><circle cx='16' cy='16' r='9'
    fill='#ffffff'/><text x='16' y='17' text-anchor='middle' dominant-baseline='central'
    font-family='system-ui,sans-serif' font-size='16' font-weight='700' fill='#0b132b'>${g}</text>`;
  return cursorValue(svg32(body), 16, 16, 'crosshair');
}

function eraserCursor(): string {
  // The hero: a tilted pink rubber eraser. Hotspot at the rubbing corner (bottom-left) so it
  // feels like you erase where the tip touches.
  const body = `<g transform='rotate(-35 16 16)'>
    <rect x='8' y='9' width='16' height='11' rx='2.5' fill='#0b132b'/>
    <rect x='9.3' y='10.3' width='13.4' height='8.4' rx='1.6' fill='${ERASER_PINK}'/>
    <rect x='9.3' y='15' width='13.4' height='3.7' rx='1.6' fill='#ffd9ec'/>
  </g>`;
  return cursorValue(svg32(body), 5, 27, 'crosshair');
}

// Memoize built strings — they're pure functions of tool+op, so repeated calls are free.
const cache: Record<string, string> = {};
function memo(key: string, build: () => string): string {
  return (cache[key] ??= build());
}

// The full CSS cursor value for the current tool (operator also keys off the selected op glyph).
export function cursorFor(tool: Tool, op: OpId): string {
  switch (tool) {
    case 'belt': return memo('belt', chevronCursor);
    case 'splitter': return memo('splitter', splitterCursor);
    case 'tunnel': return memo('tunnel', tunnelCursor);
    case 'operator': return memo(`op:${op}`, () => operatorCursor(op));
    case 'eraser': return memo('eraser', eraserCursor);
    default: return 'crosshair';
  }
}
