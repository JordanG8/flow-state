'use strict';
// Run with: node tests/assist.test.js
// Drives the real course + physics through corners with deliberately bad steering right after each turn
// (full lock to one side, like a wobbly wrist) and checks what aim assist does about it.
const assert = require('assert');
const CORE = require('../src/core.js');

function scenario(seed, level, badFrom, badLen) {
  const C = new CORE.Course(seed);
  C.script = ['run', 'corner', 'run', 'corner', 'run', 'corner', 'run', 'run'];
  for (let i = 0; i < 8; i++) C.next(); // exactly the scripted chunks: no random obstacle ahead
  const P = CORE.newPlayer(C.chunks[0].cp);
  P.speed = P.speedT = 17;
  const queued = new Set();
  let turns = 0,
    sign = seed % 2 ? 1 : -1;
  const dt = 1 / 60;
  for (let t = 0; t < 45; t += dt) {
    // buffer a turn just before each corner, like a player who snaps in time
    for (let i = P.ci - 1; i <= P.ci + 1; i++) {
      const ch = C.get(i);
      if (!ch || !ch.corner || ch.corner.used || queued.has(ch.corner)) continue;
      const h = CORE.hv(P.H),
        f = (P.x - ch.corner.tx) * h[0] + (P.z - ch.corner.tz) * h[1];
      if (f > -4) {
        queued.add(ch.corner);
        P.q.push({t: 'turn', dir: ch.corner.dir});
      }
    }
    const bad = P.sinceTurn >= badFrom && P.sinceTurn < badFrom + badLen;
    P.steer = CORE.aimAssist(C, P, bad ? sign : 0, level);
    CORE.stepP(C, P, dt);
    for (const e of P.ev) if (e.t === 'turn') (turns++, (sign = -sign));
    if (!P.alive) return {ok: false, turns};
    if (turns >= 3 && P.sinceTurn > 1.2) return {ok: true, turns};
  }
  return {ok: false, turns};
}
function rate(level, badFrom, badLen, n = 60) {
  let ok = 0;
  for (let s = 1; s <= n; s++) if (scenario(s, level, badFrom, badLen).ok) ok++;
  return ok / n;
}

let fails = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log('  ok   ' + name);
  } catch (e) {
    fails++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
};

console.log('groundSpan');
test('finds the middle of the platform ahead', () => {
  const C = new CORE.Course(3);
  const P = CORE.newPlayer(C.chunks[0].cp);
  P.speed = 17;
  const g = CORE.groundSpan(C, P, 3);
  assert(g && Math.abs(g.off) < 0.01 && g.half > 4, JSON.stringify(g));
  P.x += 2; // drifted 2 m to the right of centre
  assert(Math.abs(CORE.groundSpan(C, P, 3).off + 2) < 0.01);
});

console.log('\nsurviving 3 corners when the steering goes bad right after each turn');
// "bad" starts once the game's own 0.34 s steer lock ends, which is when a wobbly wrist takes over
const cases = [
  [0.34, 0.15],
  [0.34, 0.3],
  [0.34, 0.5],
];
for (const [from, len] of cases) {
  const off = rate(0, from, len),
    on = rate(0.85, from, len);
  console.log('       bad steering for ' + len + ' s: without assist ' + Math.round(off * 100) + '%, with assist ' + Math.round(on * 100) + '%');
  test('assist is never worse (' + len + ' s of full-lock)', () => assert(on >= off, on + ' < ' + off));
}
test('assist survives a quarter second of full-lock every time', () => {
  assert.strictEqual(rate(0.85, 0.34, 0.15), 1);
});
test('assist off changes nothing about normal play (zero steer)', () => {
  assert.strictEqual(rate(0.85, 99, 0), rate(0, 99, 0));
});
test('assist does not fight a deliberate lean on a wide path', () => {
  const C = new CORE.Course(5);
  const P = CORE.newPlayer(C.chunks[0].cp);
  P.speed = 17;
  P.x += 0.8; // a little off centre, mid-platform
  const s = CORE.aimAssist(C, P, 0.5, 0.85);
  assert(s > 0.3, 'steer was changed to ' + s);
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
