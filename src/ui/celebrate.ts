// F6 celebration overlay: DOM confetti made of the just-completed number bursting from the hub, plus
// a big auto-dismissing "You made N!" banner. The overlay is pointer-events:none so the frozen board
// shows through and (once the brief sim-pause ends) play resumes underneath. NO sim state is touched
// here — this is pure presentation, driven by the single level-up event source in main.ts.
//
// Respects prefers-reduced-motion (no particle burst, no banner pop). This is the ONLY place confetti
// is created; the juice tier must not also spawn confetti on level-up.

const STYLE_ID = 'bf-celebrate-style';

// One injected <style> (idempotent). Particle motion is a single keyframe parameterised per-particle
// via CSS custom properties (--dx/--dy/--rot) so we animate on the compositor, not per-frame in JS.
const CSS = `
.bf-celebrate { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden;
  font-family: system-ui, sans-serif; }
.bf-confetti { position: fixed; font-weight: 900; will-change: transform, opacity;
  transform: translate(-50%, -50%);
  animation: bf-burst 1100ms cubic-bezier(.15,.6,.3,1) forwards; }
@keyframes bf-burst {
  0%   { transform: translate(-50%, -50%) rotate(0deg) scale(.4); opacity: 0; }
  15%  { opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)) scale(1);
         opacity: 0; }
}
.bf-banner { position: fixed; left: 50%; top: 22%; transform: translate(-50%, -50%);
  background: #2e7d32; color: #fff; padding: 16px 30px; border-radius: 18px; font-weight: 900;
  font-size: clamp(28px, 6vw, 60px); box-shadow: 0 10px 40px #0007; white-space: nowrap;
  text-align: center; animation: bf-pop 320ms cubic-bezier(.2,1.3,.4,1) forwards; }
.bf-stars { margin-top: 8px; font-size: clamp(24px, 5vw, 46px); line-height: 1; letter-spacing: 4px;
  animation: bf-stars-pop 500ms 260ms cubic-bezier(.2,1.3,.4,1) both; }
.bf-star-off { opacity: .28; }
@keyframes bf-stars-pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes bf-pop {
  0%   { transform: translate(-50%, -50%) scale(.5); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(1);  opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .bf-confetti { animation-duration: 1ms; }
  .bf-banner   { animation: none; }
  .bf-stars    { animation: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const COLORS = ['#ffd54f', '#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#fff176', '#f06292'];

// Fire a celebration anchored at viewport pixel (x,y) — the hub's screen center. `text` is the number
// she just made (e.g. "12"); it becomes both the confetti glyph and the "You made 12!" banner.
// `stars` (1-3, optional) shows the golf rating for this puzzle under the banner.
export function celebrate(opts: { text: string; x: number; y: number; stars?: number }): void {
  ensureStyle();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only one celebration on screen at a time (rapid double level-ups shouldn't stack overlays).
  for (const old of Array.from(document.querySelectorAll('.bf-celebrate'))) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'bf-celebrate';
  document.body.appendChild(overlay);

  const count = reduce ? 0 : 26;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'bf-confetti';
    p.textContent = opts.text;
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 90 + Math.random() * 170;
    p.style.left = `${opts.x}px`;
    p.style.top = `${opts.y}px`;
    p.style.color = COLORS[i % COLORS.length];
    p.style.fontSize = `${16 + Math.random() * 22}px`;
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist + 40}px`); // slight downward (gravity) bias
    p.style.setProperty('--rot', `${(Math.random() * 2 - 1) * 240}deg`);
    p.style.animationDelay = `${Math.random() * 80}ms`;
    overlay.appendChild(p);
  }

  const banner = document.createElement('div');
  banner.className = 'bf-banner';
  const line = document.createElement('div');
  line.textContent = `You made ${opts.text}!`;
  banner.appendChild(line);
  // A 1-3 star golf rating (3 = at/under par). Filled stars are gold; unearned ones dim so she can
  // see there's a better score to chase — the "beat par next time" hook.
  const stars = Math.max(0, Math.min(3, Math.round(opts.stars ?? 0)));
  if (stars > 0) {
    const row = document.createElement('div');
    row.className = 'bf-stars';
    row.textContent = '★★★';
    // dim the unearned tail without losing the three-slot layout
    row.innerHTML = '★'.repeat(stars) + `<span class="bf-star-off">${'★'.repeat(3 - stars)}</span>`;
    banner.appendChild(row);
  }
  overlay.appendChild(banner);

  // Auto-dismiss after ~3s, or on the first click / keypress. Capture-phase window listeners so the
  // dismiss fires even though the overlay is pointer-events:none and game handlers may consume events.
  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('pointerdown', dismiss, true);
    window.removeEventListener('keydown', dismiss, true);
    overlay.remove();
  };
  const timer = window.setTimeout(dismiss, 3000);
  window.addEventListener('pointerdown', dismiss, true);
  window.addEventListener('keydown', dismiss, true);
}
