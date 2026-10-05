'use strict';
// Run with: node tests/look.test.js
// The VR side of gyro play: slow motion is looking (the view follows the phone 1:1, on time, without tremor), fast
// motion is a move (the view never tips, rolls or swings with a flick), you run where you look, and you take a corner
// by looking into it.
const assert = require('assert');
const G = require('../src/gyro.js');
const CORE = require('../src/core.js');

const D2R = Math.PI / 180,
  R2D = 180 / Math.PI;
let seed = 4242;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function player(name, q0, tAx, fAx) {
  const t = norm(tAx);
  let f = norm(fAx);
  const dd = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
  f = norm(f.map((x, i) => x - dd * t[i]));
  return {name, q0, t, f, d: norm(cross(f, t))};
}
const STAND = player('standing', G.fromEuler(0, 90, 0), [0, 1, 0], [1, 0, 0]);
const BED = player('lying in bed', G.fromEuler(215, 25, -20), [0.35, 0.78, 0.52], [0.9, -0.3, -0.2]);
const BED2 = player('on side', G.fromEuler(80, -60, 35), [0.6, 0.2, 0.77], [-0.2, 0.95, 0.2]);
function keyAt(keys, t) {
  let a = keys.length ? keys[0][1] : 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a0] = keys[i],
      [t1, a1] = keys[i + 1];
    if (t >= t0 && t <= t1) return a0 + (a1 - a0) * smooth((t - t0) / (t1 - t0));
    if (t > t1) a = a1;
  }
  return a;
}
const pose = (p, angs) => {
  let q = p.q0;
  for (const [axis, a] of angs) q = G.qmul(q, G.qaxis(axis, a * D2R));
  return q;
};
const noisy = (q, deg) => G.qmul(q, G.qaxis(norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), (rnd() - 0.5) * deg * D2R));

let clock = 0;
function fresh(p) {
  G.resetTel();
  Object.assign(G.cfg, {sens: 1, steer: 1, auto: 1, cornerNear: false, corner: 0});
  G.setCal(p.t, p.f, 38);
  G.st.active = true;
  G.st.liftLock = 0;
  G.st.qLast = G.st.qn = G.st.qPrev = null;
  G.neutral();
  clock += 20;
}
// 60 Hz sensor samples, each followed by a rendered frame 8 ms later. motion: [[axis, keys], ...] or fn(t) -> angles.
// Returns the gestures; out(t, frame) sees every rendered frame.
function run(p, motion, dur, o = {}) {
  const T = clock,
    got = [],
    h = 1 / 60;
  G.st.onGesture = (g) => got.push(Object.assign({at: +(cur - T).toFixed(3)}, g));
  let cur = T;
  for (let s = 0; s <= Math.round(dur / h); s++) {
    const tl = s * h;
    cur = T + tl;
    const angs = typeof motion === 'function' ? motion(tl) : motion.map(([ax, keys]) => [ax, keyAt(keys, tl)]);
    G.feed(noisy(pose(p, angs), o.noise == null ? 0.3 : o.noise), cur);
    const fr = G.frame(cur + 0.008, h, o.ctx || {});
    if (o.out) o.out(tl, fr, angs);
  }
  clock = cur + 1;
  return got;
}
const kf = (...pts) => pts;
const flick = (t, amp, hold = 0.1) => [
  [t, 0],
  [t + 0.15, amp],
  [t + 0.15 + hold, amp],
  [t + 0.4 + hold, 0],
];
const names = (got) => got.map((g) => g.t + (g.dir == null ? '' : g.dir));

let fails = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok   ' + name);
  } catch (e) {
    fails++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}
const peak = () => ({y: 0, p: 0, r: 0, s: 0});
const watch = (m) => (t, fr) => {
  m.y = Math.max(m.y, Math.abs(fr.yaw));
  m.p = Math.max(m.p, Math.abs(fr.pitch));
  m.r = Math.max(m.r, Math.abs(fr.roll));
  m.s = Math.max(m.s, Math.abs(fr.steer));
};

for (const p of [STAND, BED, BED2]) {
  console.log('\n' + p.name + ': a move never moves the view');
  test('a leap (20 deg flick up) tips the view less than 3 deg, and does not steer', () => {
    fresh(p);
    const m = peak(),
      got = run(p, [[p.f, flick(0.3, 20)]], 1.4, {out: watch(m)});
    assert.deepStrictEqual(names(got), ['jump']);
    assert(m.p < 3 && m.y < 2 && m.r < 2, 'view moved ' + JSON.stringify(m));
    assert(m.s < 0.05, 'steer ' + m.s.toFixed(2));
  });
  test('a slide, likewise', () => {
    fresh(p);
    const m = peak(),
      got = run(p, [[p.f, flick(0.3, -20)]], 1.4, {out: watch(m)});
    assert.deepStrictEqual(names(got), ['slide']);
    assert(m.p < 3 && m.y < 2, 'view moved ' + JSON.stringify(m));
  });
  test('a dash (24 deg tilt) rolls the view less than 3 deg', () => {
    fresh(p);
    const m = peak(),
      got = run(p, [[p.d, flick(0.3, -24)]], 1.4, {out: watch(m)});
    assert.deepStrictEqual(names(got), ['dash1']);
    assert(m.r < 3 && m.y < 2 && m.p < 2, 'view moved ' + JSON.stringify(m));
  });
  test('a turn snap out and back swings the view less than 4 deg and never steers', () => {
    fresh(p);
    const m = peak(),
      got = run(p, [[p.t, flick(0.3, 42, 0.2)]], 1.6, {out: watch(m)});
    assert.deepStrictEqual(names(got), ['turn1']);
    assert(m.y < 4, 'view swung ' + m.y.toFixed(1));
    assert(m.s < 0.15, 'steer ' + m.s.toFixed(2));
  });

  console.log(p.name + ': a look is the phone');
  test('a slow look follows the phone 1:1 and on time', () => {
    fresh(p);
    let moving = 0,
      held = 0;
    run(p, [[p.t, kf([0.3, 0], [1.3, 20], [2.4, 20])]], 2.4, {
      out: (t, fr, angs) => {
        // the frame is 8 ms after the sample, so the true twist is where the hand is then
        const truth = keyAt([[0.3, 0], [1.3, 20]], t + 0.008),
          e = Math.abs(fr.yaw - truth);
        if (t > 0.4 && t < 1.3) moving = Math.max(moving, e);
        if (t > 1.5 && t < 1.8) held = Math.max(held, e); // (a look held well past a second starts to count as stance)
      },
    });
    assert(moving < 1.2, 'lags by up to ' + moving.toFixed(2) + ' deg while turning');
    assert(held < 0.5, 'off by ' + held.toFixed(2) + ' deg once still');
  });
  test('a steady hand holds a steady view (tremor filtered)', () => {
    fresh(p);
    const ys = [];
    run(p, (t) => [[p.t, 0.25 * Math.sin(t * 2 * Math.PI * 9)], [p.f, 0.2 * Math.sin(t * 2 * Math.PI * 7 + 1)]], 3, {
      out: (t, fr) => {
        if (t > 1) ys.push(fr.yaw);
      },
    });
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length,
      sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    assert(sd < 0.08, 'view jitter ' + sd.toFixed(3) + ' deg rms (hand 0.18)');
  });
}

console.log('\nyou run where you look');
test('a held 10 deg look sends the runner 10 deg off straight ahead', () => {
  fresh(STAND);
  const C = new CORE.Course(11),
    P = CORE.newPlayer(C.chunks[0].cp);
  P.speed = P.speedT = 17;
  let x0 = null;
  run(STAND, [[STAND.t, kf([0.1, 0], [0.4, 10], [2, 10])]], 1.2, {
    ctx: {speed: 17, latmax: CORE.LATMAX},
    out: (t, fr) => {
      P.steer = fr.steer;
      CORE.stepP(C, P, 1 / 60);
      if (t >= 0.8 && !x0) x0 = [P.x, P.z];
    },
  });
  const dir = Math.atan2(P.x - x0[0], -(P.z - x0[1])) * R2D; // heading 0 runs toward -z, +x is right
  assert(Math.abs(-dir - 10) < 1.5, 'travelling ' + -dir.toFixed(1) + ' deg left of straight');
});

console.log('\ntaking corners by looking into them');
// A whole run: the player looks a little toward the middle of the path, looks into each bend as it comes up, and once
// the run has turned brings the phone back to their natural hold, slowly, the way people actually do.
function cornerRun(p, seedC, {snap = false} = {}) {
  fresh(p);
  const C = new CORE.Course(seedC);
  C.script = ['run', 'corner', 'run', 'corner', 'run', 'corner', 'run', 'run'];
  for (let i = 0; i < 8; i++) C.next();
  const P = CORE.newPlayer(C.chunks[0].cp);
  P.speed = P.speedT = 18;
  const h = 1 / 60,
    T = clock,
    ev = [],
    gest = [],
    fired = [];
  G.st.onGesture = (g) => (gest.push(g), fired.push(g.t + (g.dir == null ? '' : g.dir)));
  let tw = 0, // where the hand twists the phone, degrees from its natural hold
    plan = 0,
    lastTurn = -9,
    snapAt = null,
    steerAfter = 0;
  for (let s = 0; s < 60 * 40; s++) {
    const t = s * h,
      now = T + t;
    // the next bend, the way the game sees it
    let cc = null;
    const hv = CORE.hv(P.H);
    for (let k = P.ci - 1; k <= P.ci + 1 && !cc; k++) {
      const ch = C.get(k),
        co = ch && ch.corner;
      if (!co || co.used || CORE.mod4(co.H) !== CORE.mod4(P.H)) continue;
      const f = (P.x - co.tx) * hv[0] + (P.z - co.tz) * hv[1];
      cc = {id: co, dir: co.dir, f, S: co.S, eta: -f / Math.max(P.speed, 1)};
    }
    // the player: into the bend when it is close, otherwise back to their natural hold, a touch toward the middle
    const gs = CORE.groundSpan(C, P, 6);
    let want = gs ? clamp(-Math.atan2(gs.off, 8) * R2D, -6, 6) : 0;
    if (cc && cc.eta < 0.6 && !snap) want = 32 * cc.dir;
    if (snap && cc && cc.f > 2 && snapAt == null) snapAt = t;
    let rate = 70; // deg/s: looking, not flicking
    if (snap && snapAt != null && t - snapAt < 0.35) {
      want = (t - snapAt < 0.15 ? 45 : 0) * cc.dir;
      rate = 400;
    }
    tw += clamp(want - tw, -rate * h, rate * h);
    G.feed(noisy(pose(p, [[p.t, tw]]), 0.3), now);
    const fr = G.frame(now + 0.008, h, {gain: 1, speed: P.speed, latmax: CORE.LATMAX, corner: cc});
    for (const g of gest.splice(0)) P.q.push(g);
    P.steer = CORE.aimAssist(C, P, fr.steer, 0.85);
    CORE.stepP(C, P, h);
    for (const e of P.ev) {
      ev.push(e.t + (e.dir == null ? '' : e.dir));
      if (e.t === 'turn') {
        G.turnApplied(now);
        lastTurn = t;
        snapAt = null;
      }
    }
    // the way back after a turn must not steer you off the path
    if (t - lastTurn > 0.6 && t - lastTurn < 1.6) steerAfter = Math.max(steerAfter, Math.abs(fr.steer));
    if (!P.alive) return {ok: false, ev, why: 'died at ' + t.toFixed(2)};
    if (ev.filter((e) => e.startsWith('turn')).length >= 3 && t - lastTurn > 2) break;
  }
  return {ok: true, ev, steerAfter, fired};
}
const clamp = CORE.clamp;
for (const p of [STAND, BED])
  for (const sd of [3, 8, 21])
    test(p.name + ', course ' + sd + ': three corners taken by looking, nothing else fires', () => {
      const r = cornerRun(p, sd);
      assert(r.ok, r.why + ' ' + JSON.stringify(r.ev));
      const turns = r.ev.filter((e) => e.startsWith('turn'));
      assert.strictEqual(turns.length, 3, JSON.stringify(r.ev));
      assert(turns.every((e) => e === 'turn1' || e === 'turn-1'), 'missed or wrong: ' + JSON.stringify(r.ev));
      assert.deepStrictEqual(r.fired, turns, 'the gyro fired ' + JSON.stringify(r.fired));
      assert(r.steerAfter < 0.25, 'bringing the phone back steered ' + r.steerAfter.toFixed(2));
    });
for (const p of [STAND, BED2])
  test(p.name + ': a snap at the corner instead of a look also works, and its spring back does nothing', () => {
    const r = cornerRun(p, 8, {snap: true});
    assert(r.ok, r.why + ' ' + JSON.stringify(r.ev));
    const turns = r.ev.filter((e) => e.startsWith('turn'));
    assert.strictEqual(turns.length, 3, JSON.stringify(r.ev));
    assert(turns.every((e) => e === 'turn1' || e === 'turn-1'), JSON.stringify(r.ev));
    assert.deepStrictEqual(r.fired, turns, 'the gyro fired ' + JSON.stringify(r.fired));
    assert(r.steerAfter < 0.25, 'the spring back steered ' + r.steerAfter.toFixed(2));
  });
test('after the run turns, the view starts from straight ahead (the old look went into the swing)', () => {
  fresh(STAND);
  run(STAND, [[STAND.t, kf([0.1, 0], [0.5, 25], [2, 25])]], 0.8);
  const before = G.frame(clock, 1 / 60, {}).yaw;
  G.lookTurn(1, clock);
  G.turnApplied(clock);
  const after = G.frame(clock + 0.016, 1 / 60, {}).yaw;
  assert(before > 20 && Math.abs(after) < 0.5, 'before ' + before.toFixed(1) + ', after ' + after.toFixed(1));
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
