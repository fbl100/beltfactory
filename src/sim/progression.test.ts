import { describe, it, expect } from 'vitest';
import { emptyState, setBelt } from './grid';
import type { GameState } from './grid';
import { addBuilding, buildingAt, countMachines } from './buildings';
import type { OperatorBuilding } from './buildings';
import { advanceLevel, reconcileLevel, syncTargetToLevel, targetHub, pruneBestStars, startReplay, skipTutorial } from './progression';
import { newGame, resetGame } from './world';
import { mvpGenerator, makeGenerator } from '../content/worldgen';
import { LEVELS, ENDLESS_START, levelAt, opsForLevel } from '../content/levels';

const LAST = LEVELS.length - 1;
// First level after 0 that grants a new deposit (not every level does).
const GRANT_LEVEL = LEVELS.findIndex((l, i) => i > 0 && l.grantNodes.length > 0);

// A minimal world: a single target hub (like worldgen authors) at the given level.
function withHub(levelIndex: number, delivered = 0, status: 'playing' | 'won' = 'playing'): GameState {
  const s = emptyState(1);
  s.levelIndex = levelIndex;
  s.delivered = delivered;
  s.status = status;
  const lvl = LEVELS[levelIndex] ?? LEVELS[0];
  addBuilding(s, { type: 'target', ax: 12, ay: 4, dir: 'right', target: lvl.target, required: lvl.required , par: 0});
  return s;
}

describe('progression: advanceLevel', () => {
  it('advances a non-final level: bumps the goal and resets the bar', () => {
    const s = withHub(0, LEVELS[0].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.levelIndex).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.delivered).toBe(0);
    expect((hub as any).target).toBe(LEVELS[1].target);
    expect((hub as any).required).toBe(LEVELS[1].required);
  });

  it('grants the new deposit on a level that introduces one', () => {
    const s = withHub(GRANT_LEVEL - 1, LEVELS[GRANT_LEVEL - 1].required);
    advanceLevel(s, targetHub(s)!);
    expect(s.levelIndex).toBe(GRANT_LEVEL);
    const granted = LEVELS[GRANT_LEVEL].grantNodes[0].value;
    expect([...s.nodes.values()].some((n) => n.value === granted)).toBe(true);
  });

  it('advances the last campaign level into endless mode (never wins) and keeps going', () => {
    const s = withHub(LAST, LEVELS[LAST].required);
    const hub = targetHub(s)!;
    advanceLevel(s, hub);
    expect(s.status).toBe('playing');                               // endless: no win state
    expect(s.levelIndex).toBe(LAST + 1);                            // advanced past the campaign
    expect(s.delivered).toBe(0);
    expect((hub as any).target).toBe(levelAt(LAST + 1, s.seed).target); // hub points at the generated goal
    // A further completion advances again — endless just keeps going.
    advanceLevel(s, hub);
    expect(s.levelIndex).toBe(LAST + 2);
    expect((hub as any).target).toBe(levelAt(LAST + 2, s.seed).target);
  });

  it('relocates a granted deposit when its authored spot is buried under the factory', () => {
    const s = withHub(GRANT_LEVEL - 1, LEVELS[GRANT_LEVEL - 1].required);
    const spot = LEVELS[GRANT_LEVEL].grantNodes[0]; // authored cell for the next granted deposit
    setBelt(s, spot.x, spot.y, { type: 'belt', dir: 'right' }); // bury the miner spot
    advanceLevel(s, targetHub(s)!);
    const node = [...s.nodes.values()].find((n) => n.value === spot.value);
    expect(node).toBeDefined();
    expect(node!.x === spot.x && node!.y === spot.y).toBe(false); // moved off the buried cell
    expect(buildingAt(s, node!.x, node!.y)?.type).toBe('miner');  // and got its automatic miner
  });
});

describe('progression: golf par + stars', () => {
  // A hub whose par is synced from its level (as the real boot path does), on a clean board.
  function syncedHub(levelIndex: number): GameState {
    const s = emptyState(1);
    s.levelIndex = levelIndex;
    const lvl = levelAt(levelIndex, s.seed);
    addBuilding(s, { type: 'target', ax: 12, ay: 4, dir: 'right', target: lvl.target, required: lvl.required, par: 0 });
    syncTargetToLevel(s); // sets hub.par from the level
    return s;
  }
  // Drop N operator machines on clear rows away from the hub (each a 1x3 horizontal bar).
  function addOperators(s: GameState, n: number): void {
    for (let i = 0; i < n; i++) {
      const op: OperatorBuilding = { type: 'operator', ax: 0, ay: i * 2, dir: 'up', op: 'multiply', inputs: [], everyTicks: 5, sinceProduce: 0 };
      if (!addBuilding(s, op)) throw new Error(`operator ${i} failed to place`);
    }
  }
  const slack = (par: number) => Math.max(1, Math.ceil(par / 2));

  it('awards 3 stars for an at/under-par endless solution', () => {
    const s = syncedHub(ENDLESS_START);
    const hub = targetHub(s)! as any;
    addOperators(s, hub.par); // exactly par
    advanceLevel(s, hub);
    expect(s.lastStars).toBe(3);
    expect(s.bestStars.get(ENDLESS_START)).toBe(3);
  });

  it('awards only 1 star for a wasteful (over-par) endless solution', () => {
    const s = syncedHub(ENDLESS_START);
    const hub = targetHub(s)! as any;
    addOperators(s, hub.par + slack(hub.par) + 1); // just past the 2-star band
    advanceLevel(s, hub);
    expect(s.lastStars).toBe(1);
    expect(s.bestStars.get(ENDLESS_START)).toBe(1);
  });

  it('keeps the BEST stars across attempts (never downgrades a past achievement)', () => {
    const s = syncedHub(ENDLESS_START);
    const hub = targetHub(s)! as any;
    s.bestStars.set(ENDLESS_START, 3);            // already three-starred earlier
    addOperators(s, hub.par + slack(hub.par) + 1); // a sloppy re-clear worth only 1
    advanceLevel(s, hub);
    expect(s.bestStars.get(ENDLESS_START)).toBe(3); // stays at the best
    expect(s.lastStars).toBe(1);                    // but this attempt's rating is honest
  });

  it('does NOT golf-score campaign levels (stars are an endless-mode feature)', () => {
    const s = syncedHub(0); // level 0, campaign
    addOperators(s, 5);     // wasteful vs the level-0 par of 1
    advanceLevel(s, targetHub(s)!);
    expect(s.lastStars).toBe(0);        // no rating on campaign completions
    expect(s.bestStars.has(0)).toBe(false);
  });

  it('reload cannot inflate the score: used = machine count, with no resettable baseline', () => {
    // Simulate a mid-puzzle refresh: build a wasteful factory, then reconcile (as boot does).
    const s = syncedHub(ENDLESS_START);
    const hub = targetHub(s)! as any;
    addOperators(s, hub.par + slack(hub.par) + 1); // wasteful
    reconcileLevel(s);                              // the load path — must NOT zero the cost
    advanceLevel(s, targetHub(s)!);
    expect(s.lastStars).toBe(1); // honest despite the "reload"
  });

  it('endless advance wipes the board so the next puzzle starts fresh', () => {
    const s = syncedHub(ENDLESS_START);
    setBelt(s, 5, 5, { type: 'belt', dir: 'right' });
    addOperators(s, 2);
    advanceLevel(s, targetHub(s)!);
    expect(s.belts.size).toBe(0);     // belts wiped
    expect(countMachines(s)).toBe(0); // operators wiped (miners don't count)
  });

  it('campaign advance is cumulative — the built factory is kept', () => {
    const s = syncedHub(1); // a campaign level (< ENDLESS_START)
    setBelt(s, 5, 5, { type: 'belt', dir: 'right' });
    addOperators(s, 1);
    advanceLevel(s, targetHub(s)!);
    expect(s.belts.size).toBe(1);     // belt survives
    expect(countMachines(s)).toBe(1); // operator survives (reuse-the-factory design)
  });

  it('bounds bestStars so an endless marathon cannot bloat the save', () => {
    const s = emptyState(1);
    s.bestStars.set(0, 3); s.bestStars.set(3, 2); // campaign entries must be kept
    for (let i = 0; i < 500; i++) s.bestStars.set(ENDLESS_START + i, 3);
    pruneBestStars(s);
    expect(s.bestStars.size).toBeLessThanOrEqual(300);
    expect(s.bestStars.get(0)).toBe(3); // campaign preserved
    expect(s.bestStars.get(3)).toBe(2);
    expect(s.bestStars.get(ENDLESS_START + 499)).toBe(3); // most-recent endless kept
  });

  // ---- replay: re-attempt a past endless puzzle to beat your star score ----
  const HOME = ENDLESS_START + 5;
  const PAST = ENDLESS_START + 2;

  it('startReplay jumps to the past puzzle on a fresh board and remembers home', () => {
    const s = syncedHub(HOME);
    setBelt(s, 5, 5, { type: 'belt', dir: 'right' });
    addOperators(s, 2);
    startReplay(s, PAST);
    expect(s.replayReturn).toBe(HOME);                                   // remembers where to return
    expect(s.levelIndex).toBe(PAST);
    expect((targetHub(s)! as any).target).toBe(levelAt(PAST, s.seed).target); // hub points at the past goal
    expect(s.belts.size).toBe(0);                                        // fresh board
    expect(countMachines(s)).toBe(0);
  });

  it('finishing a replay records the star and returns home (does not advance the ladder)', () => {
    const s = syncedHub(HOME);
    s.bestStars.set(PAST, 1);              // previously a sloppy 1-star
    startReplay(s, PAST);
    const hub = targetHub(s)! as any;
    addOperators(s, hub.par);              // now a tidy at-par solve
    advanceLevel(s, hub);
    expect(s.bestStars.get(PAST)).toBe(3); // improved to 3 and kept
    expect(s.replayReturn).toBeNull();     // replay is over
    expect(s.levelIndex).toBe(HOME);       // back home, ladder not advanced past it
    expect(hub.target).toBe(levelAt(HOME, s.seed).target);
  });

  it('a mid-replay reload cancels the replay and returns home with a fresh board', () => {
    const s = syncedHub(HOME);
    startReplay(s, PAST);
    setBelt(s, 6, 6, { type: 'belt', dir: 'right' }); // some replay-attempt build
    reconcileLevel(s);                                 // the boot/load path
    expect(s.replayReturn).toBeNull();
    expect(s.levelIndex).toBe(HOME);
    expect(s.belts.size).toBe(0);
    expect((targetHub(s)! as any).target).toBe(levelAt(HOME, s.seed).target);
  });

  it('startReplay ignores campaign (non-golf) indices', () => {
    const s = syncedHub(HOME);
    startReplay(s, 1); // a campaign level — not replayable
    expect(s.replayReturn).toBeNull();
    expect(s.levelIndex).toBe(HOME);
  });

  it('lifetime counters track solves, stars, and perfects across normal play and replays', () => {
    const s = syncedHub(ENDLESS_START);
    const hub = targetHub(s)! as any;
    // First solve, wasteful (1 star).
    addOperators(s, hub.par + slack(hub.par) + 1);
    advanceLevel(s, hub);
    expect(s.solvedCount).toBe(1);
    expect(s.starsTotal).toBe(1);
    expect(s.perfectCount).toBe(0);
    // Replay that same puzzle perfectly (par) — no new solve, +2 stars, +1 perfect.
    startReplay(s, ENDLESS_START);
    addOperators(s, (targetHub(s)! as any).par);
    advanceLevel(s, targetHub(s)!);
    expect(s.solvedCount).toBe(1);   // not double-counted
    expect(s.starsTotal).toBe(3);    // 1 -> 3
    expect(s.perfectCount).toBe(1);
  });

  it('Start Over mid-replay resets cleanly to level 0 (does NOT resurrect the old level)', () => {
    // Reproduces the reviewer's HIGH finding: resetGame must clear replayReturn so reconcile can't
    // abort-replay back to the stale home level.
    const s = syncedHub(HOME);
    startReplay(s, PAST);
    expect(s.replayReturn).toBe(HOME);
    resetGame(s, 1, mvpGenerator); // "Start Over"
    reconcileLevel(s);             // main.ts runs this right after
    expect(s.replayReturn).toBeNull();
    expect(s.levelIndex).toBe(0);  // truly back to Level 1, not teleported to HOME
    expect(s.solvedCount).toBe(0);
    expect(s.starsTotal).toBe(0);
  });

  it('reconcileLevel backfills lifetime counters from a pre-counter (v6) save', () => {
    const s = syncedHub(HOME);
    s.bestStars.set(ENDLESS_START + 1, 3);
    s.bestStars.set(ENDLESS_START + 2, 2);
    s.solvedCount = 0; s.starsTotal = 0; s.perfectCount = 0; // as an old save deserializes
    reconcileLevel(s);
    expect(s.solvedCount).toBe(2);
    expect(s.starsTotal).toBe(5);
    expect(s.perfectCount).toBe(1);
  });
});

describe('progression: skipTutorial', () => {
  it('jumps to endless with all of {2,3,5,7} present and a fresh board', () => {
    const s = newGame(1, mvpGenerator); // fresh game: campaign level 0, only {2,3} deposits
    reconcileLevel(s);
    expect(s.levelIndex).toBeLessThan(ENDLESS_START);
    skipTutorial(s);
    expect(s.levelIndex).toBe(ENDLESS_START);
    const values = new Set([...s.nodes.values()].map((n) => n.value));
    for (const v of [2n, 3n, 5n, 7n]) expect(values.has(v)).toBe(true); // endless needs all four
    expect(countMachines(s)).toBe(0); // fresh board
    expect((targetHub(s)! as any).target).toBe(levelAt(ENDLESS_START, s.seed).target);
  });

  it('is a no-op once already in endless', () => {
    const s = newGame(1, mvpGenerator);
    reconcileLevel(s);
    skipTutorial(s);                 // now in endless
    const before = s.levelIndex;
    skipTutorial(s);                 // second call must do nothing
    expect(s.levelIndex).toBe(before);
  });
});

describe('progression: easy mode (+ / −)', () => {
  // The sources placed on the board must equal the puzzle's dealt hand (worldgen/levelAt agree).
  const handOf = (s: GameState) => levelAt(s.levelIndex, s.seed, 'easy').grantNodes.map((n) => n.value).sort();
  const nodeVals = (s: GameState) => [...s.nodes.values()].map((n) => n.value).sort();

  it('a fresh easy game starts in the endless range with its dealt hand and addition-only ops', () => {
    const s = newGame(1, makeGenerator('easy'), 'easy');
    reconcileLevel(s); // boot does this — syncs the hub par + target for the easy level
    expect(s.mode).toBe('easy');
    expect(s.levelIndex).toBe(ENDLESS_START);        // easy is golf-scored from the very first puzzle
    expect(nodeVals(s)).toEqual(handOf(s));          // the placed deposits ARE the puzzle's hand
    expect([...s.nodes.values()].length).toBeGreaterThanOrEqual(3);
    expect(opsForLevel(s.levelIndex, s.mode)).toEqual(['add']); // subtraction not yet unlocked
    const hub = targetHub(s)! as any;
    expect(hub.target).toBe(levelAt(ENDLESS_START, s.seed, 'easy').target);
    expect(hub.par).toBeGreaterThanOrEqual(1);
  });

  it('advancing swaps the source hand for the next puzzle', () => {
    const s = newGame(1, makeGenerator('easy'), 'easy');
    reconcileLevel(s);
    const before = nodeVals(s);
    // fill the bar and advance
    const hub = targetHub(s)!;
    (hub as any).required = 0; // force completion
    advanceLevel(s, hub);
    expect(nodeVals(s)).toEqual(handOf(s));   // deposits now match the NEW puzzle's hand
    // and they usually differ from the previous puzzle (fresh hand)
    expect(s.levelIndex).toBe(ENDLESS_START + 1);
    void before;
  });

  it('switching modes via resetGame rebuilds the world for the new mode', () => {
    const s = newGame(1, mvpGenerator);       // normal
    reconcileLevel(s);
    expect(s.levelIndex).toBe(0);
    resetGame(s, 1, makeGenerator('easy'), 'easy'); // "Switch to Easy"
    reconcileLevel(s);
    expect(s.mode).toBe('easy');
    expect(s.levelIndex).toBe(ENDLESS_START);
    expect(nodeVals(s)).toEqual(handOf(s));
  });
});

describe('progression: reconcileLevel (load/migration consistency)', () => {
  it('re-points the hub at LEVELS[levelIndex] (single source of truth)', () => {
    const s = withHub(0);
    s.levelIndex = 2;
    const hub = syncTargetToLevel(s)!;
    expect((hub as any).target).toBe(LEVELS[2].target);
    expect((hub as any).required).toBe(LEVELS[2].required);
  });

  it('keeps a large (endless) index and generates its goal — no upper clamp', () => {
    const s = withHub(0);
    s.levelIndex = 999;
    reconcileLevel(s);
    expect(s.levelIndex).toBe(999); // endless: not clamped to the campaign length
    expect((targetHub(s) as any).target).toBe(levelAt(999, s.seed).target);
  });

  it("rolls a pre-progression 'won' save (won at a non-final level) back into play", () => {
    const s = withHub(0, 20, 'won'); // e.g. an old v3 save that had won the single target
    reconcileLevel(s);
    expect(s.status).toBe('playing');
    expect(s.levelIndex).toBe(0);
    expect(s.delivered).toBe(0);
    expect((targetHub(s) as any).required).toBe(LEVELS[0].required);
  });

  it("rolls any 'won' save back into play (endless mode never wins)", () => {
    const s = withHub(LAST, LEVELS[LAST].required, 'won');
    reconcileLevel(s);
    expect(s.status).toBe('playing');
    expect(s.levelIndex).toBe(LAST);
  });

  it('snaps an over-full delivered count (old higher required) back to zero', () => {
    const s = withHub(0, 15, 'playing'); // 15 delivered but new required is smaller
    reconcileLevel(s);
    expect(s.delivered).toBe(0);
  });

  it('snaps an exactly-full bar to zero so a migrated save does not instant-advance on load', () => {
    const s = withHub(0, LEVELS[0].required, 'playing'); // exactly full for the new level
    reconcileLevel(s);
    expect(s.delivered).toBe(0);
  });

  it('defaults a missing/garbage level index to 0', () => {
    const s = withHub(0);
    (s as any).levelIndex = undefined;
    reconcileLevel(s);
    expect(s.levelIndex).toBe(0);
  });
});
