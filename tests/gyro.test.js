'use strict';
// Run with: node tests/gyro.test.js
// Simulates a wrist moving a phone and checks calibration + gesture detection are pose-independent.
const assert = require('assert');
const G = require('../src/gyro.js');

const D2R = Math.PI / 180;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ang = (a, b) => (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// A "player": a start pose in the world and the three body axes their wrist actually moves around.
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

// keyframes: [[t, angleDeg], ...] per body axis -> device quaternion at time t
function poseAt(p, motion, t) {
  let q = p.q0;
  for (const [axis, keys] of motion) {
    let a = 0;
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, a0] = keys[i],
        [t1, a1] = keys[i + 1];
      if (t >= t0 && t <= t1) a = a0 + (a1 - a0) * smooth((t - t0) / (t1 - t0));
      else if (t > t1) a = a1;
    }
    q = G.qmul(q, G.qaxis(axis, a * D2R));
  }
  // sensor noise ~0.3 deg
  const n = G.qaxis(norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), (rnd() - 0.5) * 0.6 * D2R);
  return G.qmul(q, n);
}
function run(p, motion, t0, t1, opts = {}) {
  const got = [];
  G.st.onGesture = (g) => got.push(Object.assign({at: curT}, g));
  let curT = t0;
  for (; curT <= t1; curT += 1 / 60) {
    if (opts.each) opts.each(curT);
    G.feed(poseAt(p, motion, curT), curT);
  }
  return got;
}
const kf = (...pts) => pts; // readability

// --- calibration -------------------------------------------------------------------------------------------
function calibrate(p, lag = 0.25) {
  G.resetCal();
  const beat = (axisName, signs, ampDeg) => {
    G.calBegin();
    // continuous alternating swing, each beat the phone goes from one extreme to the other
    const keys = [[0, 0]];
    let cur = 0,
      t = 0;
    signs.forEach((s, i) => {
      const tgt = s * ampDeg;
      t += 1.0;
      keys.push([i === 0 ? lag + 0.45 : t + lag, tgt]);
      cur = tgt;
    });
    // beats are announced at t = 0,1,2.. ; the player reacts `lag` seconds later
    const motion = [[p[axisName], keys]];
    let curT = 0;
    const fake = [];
    signs.forEach((s, i) => G.calBeat(s, i * 1.0));
    for (curT = 0; curT < signs.length + 0.05; curT += 1 / 60) G.feed(poseAt(p, motion, curT), curT);
    return G.calSolve(signs.length);
  };
  const a = beat('t', [1, -1, 1, -1, 1, -1], 38);
  const b = beat('f', [1, -1, 1, -1, 1, -1], 22);
  return {a, b};
}

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

console.log('math');
test('fromEuler maps device x (right) to world north for alpha=90', () => {
  const q = G.fromEuler(90, 0, 0);
  const r = G.rotvec(q);
  assert(Math.abs(r[2] - Math.PI / 2) < 1e-6 && Math.abs(r[0]) < 1e-6);
});

for (const p of [STAND, BED, BED2]) {
  console.log('\n' + p.name);
  test('calibration recovers the wrist axes and their sign', () => {
    const {a, b} = calibrate(p);
    assert(a.ok, 'turn solve failed: ' + JSON.stringify(a));
    assert(b.ok, 'lift solve failed: ' + JSON.stringify(b));
    const dt = ang(a.axis, p.t),
      df = ang(b.axis, p.f);
    assert(dt < 7, 'turn axis off by ' + dt.toFixed(1) + ' deg');
    assert(df < 7, 'lift axis off by ' + df.toFixed(1) + ' deg');
    const sgn = a.axis[0] * p.t[0] + a.axis[1] * p.t[1] + a.axis[2] * p.t[2];
    assert(sgn > 0, 'turn axis sign flipped');
    const sgf = b.axis[0] * p.f[0] + b.axis[1] * p.f[1] + b.axis[2] * p.f[2];
    assert(sgf > 0, 'lift axis sign flipped');
    assert(a.amp > 25 && a.amp < 50, 'amp ' + a.amp.toFixed(1));
  });

  // calibrate once, then play
  const {a, b} = calibrate(p);
  G.setCal(a.axis, b.axis, a.amp);
  G.cfg.sens = 1;
  G.cfg.cornerNear = false;
  G.st.active = true;
  const play = (motion, t0 = 0, t1 = 3) => {
    G.neutral();
    G.st.liftLock = 0;
    return run(p, motion, t0, t1);
  };

  test('left snap = one turn(+1), and the swing back is ignored', () => {
    const got = play([[p.t, kf([0.3, 0], [0.5, 42], [0.9, 42], [1.3, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t + (g.dir || '')), ['turn1'], JSON.stringify(got));
  });
  test('right snap = one turn(-1)', () => {
    const got = play([[p.t, kf([0.3, 0], [0.5, -42], [0.9, -42], [1.3, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t + (g.dir || '')), ['turn-1'], JSON.stringify(got));
  });
  test('violent whip out and back is still one turn', () => {
    const got = play([[p.t, kf([0.3, 0], [0.45, 90], [0.6, 90], [0.8, 0])]]);
    assert.strictEqual(got.length, 1, JSON.stringify(got));
  });
  test('flick up = jump, flick down = slide', () => {
    let got = play([[p.f, kf([0.3, 0], [0.45, 20], [0.8, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t), ['jump'], JSON.stringify(got));
    got = play([[p.f, kf([0.3, 0], [0.45, -20], [0.8, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t), ['slide'], JSON.stringify(got));
  });
  test('tilt like a key = dash with direction', () => {
    let got = play([[p.d, kf([0.3, 0], [0.45, -24], [0.9, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t + g.dir), ['dash1'], JSON.stringify(got));
    got = play([[p.d, kf([0.3, 0], [0.45, 24], [0.9, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t + g.dir), ['dash-1'], JSON.stringify(got));
  });
  test('zig-zag: dash right, back, dash left 0.45s later gives two dashes', () => {
    const got = play([[p.d, kf([0.3, 0], [0.42, -24], [0.62, 0], [0.75, 0], [0.87, 24], [1.2, 0])]]);
    assert.deepStrictEqual(got.map((g) => g.t + g.dir), ['dash1', 'dash-1'], JSON.stringify(got));
  });
  test('slow steer to 20 deg fires nothing and reads as 20 deg', () => {
    let last = 0;
    G.neutral();
    G.st.liftLock = 0;
    const got = run(p, [[p.t, kf([0.2, 0], [1.6, 20])]], 0, 2.0, {each: (t) => (last = G.steerDeg(t))});
    assert.strictEqual(got.length, 0, JSON.stringify(got));
    assert(Math.abs(last - 20) < 2, 'steer ' + last);
  });
  test('four left snaps in a row that STAY rotated all fire - never run out of wrist', () => {
    // each snap rotates 60 deg and the player holds there: with the old world-yaw scheme this needs a full spin
    const keys = [[0.3, 0]];
    for (let i = 0; i < 4; i++) keys.push([0.5 + i * 2.2, 60 * (i + 1)], [2.3 + i * 2.2, 60 * (i + 1)]);
    // after each re-zero the next snap is another +60 relative to where they are
    const got = play([[p.t, keys.map(([t, a], i) => [t, a])]], 0, 10.5);
    assert.strictEqual(got.length, 4, 'got ' + got.length + ' ' + JSON.stringify(got.map((g) => g.t + g.dir)));
    assert(got.every((g) => g.t === 'turn' && g.dir === 1));
  });
  test('after a turn the phone settles with steer back at zero (re-zeroed)', () => {
    let last = 99;
    G.neutral();
    run(p, [[p.t, kf([0.3, 0], [0.5, 60], [3, 60])]], 0, 2.6, {each: (t) => (last = G.steerDeg(t))});
    assert(Math.abs(last) < 3, 'steer after settling ' + last);
  });
  test('hand tremor and a wobbly hold fire nothing', () => {
    const got = play([[p.t, kf([0, 0], [0.5, 4], [1, -3], [1.5, 5], [2, -2])], [p.f, kf([0, 0], [0.7, 3], [1.4, -2])]], 0, 2.5);
    assert.strictEqual(got.length, 0, JSON.stringify(got));
  });
  test('a smaller wrist (amp 20) still triggers on small flicks', () => {
    G.setCal(a.axis, b.axis, 20);
    const got = play([[p.t, kf([0.3, 0], [0.5, 20], [0.9, 20], [1.3, 0])]]);
    assert.strictEqual(got.length, 1, JSON.stringify(got));
    G.setCal(a.axis, b.axis, a.amp);
  });
}

console.log('\ncalibration quality gates');
test('refuses a calibration where the player barely moved', () => {
  G.resetCal();
  G.calBegin();
  for (let i = 0; i < 6; i++) G.calBeat(i % 2 ? -1 : 1, i);
  for (let t = 0; t < 6; t += 1 / 60) G.feed(poseAt(STAND, [[STAND.t, [[0, 0], [6, 3]]]], t), t);
  const r = G.calSolve(6);
  assert(!r.ok, 'should have failed');
});
test('refuses random thrashing', () => {
  G.resetCal();
  G.calBegin();
  for (let i = 0; i < 6; i++) G.calBeat(i % 2 ? -1 : 1, i);
  for (let t = 0; t < 6; t += 1 / 60) {
    const q = G.qmul(G.qmul(G.qaxis([1, 0, 0], Math.sin(t * 7) * 0.8), G.qaxis([0, 1, 0], Math.cos(t * 5.3) * 0.8)), G.qaxis([0, 0, 1], Math.sin(t * 3.1) * 0.8));
    G.feed(q, t);
  }
  const r = G.calSolve(6);
  assert(!r.ok, 'should have failed: ' + JSON.stringify(r));
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
