'use strict';
// Run with: node tests/stance.test.js
// The centre follows the player's stance, and every sensor stream ends up as one consistent motion signal.
// Simulates a wrist holding a phone (standing, lying back, on its side) whose natural hold wanders, returns lazily
// after moves, and a phone that reports through deviceorientation, devicemotion (gyro + accelerometer) or both.
const assert = require('assert');
const G = require('../src/gyro.js');

const D2R = Math.PI / 180,
  R2D = 180 / Math.PI;
let seed = 777;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.4;
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const vrot = (q, v) => {
  const r = G.qmul(G.qmul(q, [v[0], v[1], v[2], 0]), G.qconj(q));
  return [r[0], r[1], r[2]];
};

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

// keyframes per body axis -> device quaternion (no sensor noise)
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
function poseAt(p, motion, t) {
  let q = p.q0;
  for (const [axis, keys] of motion) q = G.qmul(q, G.qaxis(axis, keyAt(keys, t) * D2R));
  return q;
}
const noisy = (q, deg) => G.qmul(q, G.qaxis(norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), (rnd() - 0.5) * deg * D2R));

// Start every scenario from a clean engine, later on a clock that never runs backwards.
let clock = 0;
function fresh(p, cal) {
  G.resetTel();
  G.cfg.sens = 1;
  G.cfg.steer = 1;
  G.cfg.auto = 1;
  G.cfg.cornerNear = false;
  if (cal) G.setCal(p.t, p.f, 38);
  G.st.active = true;
  G.st.liftLock = 0;
  G.st.qLast = null;
  G.st.qn = null;
  G.neutral();
  clock += 20;
  return clock;
}
// Play a motion through the chosen streams. Returns the gestures, each with its time relative to T.
//   orient: deviceorientation   gyro: devicemotion.rotationRate   accel: accelerationIncludingGravity
//   unit: reported gyro unit in deg/s (57.3 = a rad/s browser)   perm: remap gyro axes   bias: gyro bias deg/s
//   oJump(t): extra world rotation the orientation stream adds (compass correction)   lin(t): body acceleration
//   gyroUntil: gyro stream stops after this time   each(t): called every frame
function play(p, motion, dur, o = {}) {
  const T = clock,
    got = [],
    h = 1 / 60,
    useO = o.orient !== false,
    useG = !!o.gyro,
    unit = o.unit || 1;
  G.st.onGesture = (g) => got.push(Object.assign({at: +(cur - T).toFixed(3)}, g));
  let cur = T,
    prev = poseAt(p, motion, -h);
  G.neutral();
  for (let s = 0; s <= Math.round(dur / h); s++) {
    const tl = s * h;
    cur = T + tl;
    const q = poseAt(p, motion, tl);
    if (useG && !(o.gyroUntil < tl)) {
      let w = G.rotvec(G.qmul(G.qconj(prev), q)).map((x, i) => (x * R2D) / h + gauss() * 0.4 + (o.bias ? o.bias[i] : 0));
      if (o.perm) w = o.perm(w);
      let g = null,
        lin = null;
      if (o.accel) {
        const la = o.lin ? o.lin(tl) : [0, 0, 0];
        g = vrot(G.qconj(q), [0, 0, 9.81]).map((x, i) => x + la[i] + gauss() * 0.05);
        lin = o.noLin ? null : la;
      }
      G.motion(
        w.map((x) => x / unit),
        lin,
        g,
        cur,
      );
    }
    if (useO) {
      let qo = noisy(q, 0.6);
      if (o.oJump) qo = G.qmul(G.qaxis([0, 0, 1], o.oJump(tl) * D2R), qo);
      if (useG) G.orient(qo, cur + 0.002);
      else G.feed(qo, cur + 0.002);
    }
    if (o.each) o.each(tl);
    prev = q;
  }
  clock = cur + 1;
  return got;
}
const names = (got) => got.map((g) => g.t + (g.dir == null ? '' : g.dir));
const kf = (...pts) => pts;
// one out-and-back flick on a body axis, with where the hand ends up (res) and how long it stays out
function flick(t, amp, {hold = 0.1, res = 0, base = 0} = {}) {
  return [
    [t, base],
    [t + 0.15, base + amp],
    [t + 0.15 + hold, base + amp],
    [t + 0.4 + hold, base + res],
  ];
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

for (const p of [STAND, BED, BED2]) {
  console.log('\n' + p.name + ': the centre follows your stance');
  test('the hold wandering 18 deg in twist and sagging 20 deg over 8 s: no moves, still centred', () => {
    fresh(p, true);
    let last = 99;
    const got = play(p, [[p.t, kf([0.5, 0], [8.5, 18])], [p.f, kf([0.5, 0], [8.5, -20])]], 11, {each: (t) => (last = G.steerDeg(t))});
    assert.strictEqual(got.length, 0, JSON.stringify(got));
    assert(Math.abs(last) < 3, 'steer ' + last.toFixed(1));
    assert(Math.abs(G.st.ang[1]) < 3, 'lift offset ' + G.st.ang[1].toFixed(1));
  });
  test('auto-centre off leaves the same wander in place', () => {
    fresh(p, true);
    G.cfg.auto = 0;
    let last = 0;
    play(p, [[p.t, kf([0.5, 0], [8.5, 18])]], 9, {each: (t) => (last = G.steerDeg(t))});
    assert(last > 15, 'steer ' + last.toFixed(1));
  });
  test('a deliberate 15 deg lean held for a second is left alone', () => {
    fresh(p, true);
    let last = 0;
    play(p, [[p.t, kf([0.5, 0], [0.8, 15])]], 1.8, {each: (t) => (last = G.steerDeg(t))});
    assert(last > 13.5, 'steer ' + last.toFixed(1));
  });
  test('snap left, hold it a second, come back: one turn, centred where you were', () => {
    fresh(p, true);
    let last = 99;
    const got = play(p, [[p.t, kf([0.3, 0], [0.5, 42], [1.6, 42], [2.0, 0])]], 3.2, {each: (t) => (last = G.steerDeg(t))});
    assert.deepStrictEqual(names(got), ['turn1'], JSON.stringify(got));
    assert(Math.abs(last) < 3, 'steer ' + last.toFixed(1));
  });
  test('flick up and hold, then lower it: one leap, no slide', () => {
    fresh(p, true);
    const got = play(p, [[p.f, kf([0.3, 0], [0.45, 20], [1.4, 20], [1.75, 0])]], 3);
    assert.deepStrictEqual(names(got), ['jump'], JSON.stringify(got));
    assert(Math.abs(G.st.ang[1]) < 3, 'lift offset ' + G.st.ang[1].toFixed(1));
  });
  test('flick down and hold, then raise it: one slide, no leap', () => {
    fresh(p, true);
    const got = play(p, [[p.f, kf([0.3, 0], [0.45, -20], [1.4, -20], [1.75, 0])]], 3);
    assert.deepStrictEqual(names(got), ['slide'], JSON.stringify(got));
  });
  test('flick up and hold, then a real flick down past where you started: leap, then slide', () => {
    fresh(p, true);
    const got = play(p, [[p.f, kf([0.3, 0], [0.45, 20], [1.4, 20], [1.6, -20], [2.0, 0])]], 3);
    assert.deepStrictEqual(names(got), ['jump', 'slide'], JSON.stringify(got));
  });
  test('two leaps in a row with no rest between both fire', () => {
    fresh(p, true);
    const got = play(p, [[p.f, kf([0.3, 0], [0.45, 20], [0.7, 2], [0.9, 22], [1.15, 0])]], 2);
    assert.deepStrictEqual(names(got), ['jump', 'jump'], JSON.stringify(got));
  });
  test('a turn with a lazy return re-zeroes where the hand stops', () => {
    fresh(p, true);
    let last = 99;
    const got = play(p, [[p.t, flick(0.3, 42, {res: 14})]], 2.2, {each: (t) => (last = G.steerDeg(t))});
    assert.deepStrictEqual(names(got), ['turn1'], JSON.stringify(got));
    assert(Math.abs(last) < 3, 'steer ' + last.toFixed(1));
  });
  test('...and drifting back to where it was afterwards is still centred', () => {
    fresh(p, true);
    let last = 99;
    const keys = flick(0.3, 42, {res: 14}).concat([[1.6, 14], [2.6, 0]]);
    const got = play(p, [[p.t, keys]], 3.4, {each: (t) => (last = G.steerDeg(t))});
    assert.deepStrictEqual(names(got), ['turn1'], JSON.stringify(got));
    assert(Math.abs(last) < 3, 'steer ' + last.toFixed(1));
  });
  test('a leap that drags the twist along leaves the steer where it was', () => {
    fresh(p, true);
    let last = 99;
    // steering 10 deg left, flick up; the hand comes back 6 deg further round
    const got = play(p, [[p.t, kf([0.2, 0], [0.4, 10], [1.0, 10], [1.3, 16])], [p.f, flick(1.0, 20)]], 2, {each: (t) => (last = G.steerDeg(t))});
    assert.deepStrictEqual(names(got), ['jump'], JSON.stringify(got));
    assert(Math.abs(last - 10) < 2.5, 'steer ' + last.toFixed(1));
  });
  test('twelve obstacles with sloppy returns and a drifting body: every move once, centred at the end', () => {
    fresh(p, true);
    seed = 99 + p.name.length;
    const tk = [[0, 0]],
      fk = [[0, 0]],
      dk = [[0, 0]],
      want = [];
    let bt = 0,
      bf = 0,
      bd = 0,
      t = 0.8;
    const plan = ['jump', 'dash1', 'turn1', 'slide', 'dash-1', 'jump', 'turn-1', 'slide', 'jump', 'dash1', 'turn1', 'jump'];
    for (const mv of plan) {
      const hold = 0.08 + rnd() * 0.6,
        relax = rnd() < 0.5;
      let keys, base, amp;
      if (mv.startsWith('turn')) (keys = tk), (base = bt), (amp = mv === 'turn1' ? 42 : -42);
      else if (mv === 'jump' || mv === 'slide') (keys = fk), (base = bf), (amp = mv === 'jump' ? 20 : -20);
      else (keys = dk), (base = bd), (amp = mv === 'dash1' ? -24 : 24);
      const res = amp * (rnd() * 0.6 - 0.3);
      for (const k of flick(t, amp, {hold, res, base})) keys.push(k);
      const end = t + 0.4 + hold;
      if (relax) keys.push([end + 0.3, base + res], [end + 1.2, base]);
      else if (keys === tk) bt += res;
      else if (keys === fk) bf += res;
      else bd += res;
      want.push(mv);
      t = end + 1.4;
    }
    let last = 99;
    // the body turns 15 deg and the arms sag 12 deg over the whole run, under all of that
    const motion = [[p.t, kf([0, 0], [t, 15])], [p.f, kf([0, 0], [t, -12])], [p.t, tk], [p.f, fk], [p.d, dk]];
    const got = play(p, motion, t + 3, {each: (x) => (last = G.steerDeg(x))});
    assert.deepStrictEqual(names(got), want, JSON.stringify(got.map((g) => g.t + (g.dir || '') + '@' + g.at)));
    assert(Math.abs(last) < 3, 'steer ' + last.toFixed(1));
    assert(Math.abs(G.st.ang[1]) < 4 && Math.abs(G.st.ang[2]) < 4, 'offsets ' + G.st.ang.map((x) => x.toFixed(1)));
  });
}

console.log('\ntelemetry: gyro, orientation and accelerometer');
for (const p of [STAND, BED]) {
  test(p.name + ': the gyro is checked against the orientation stream and takes over', () => {
    fresh(p, true);
    const got = play(p, [[p.t, flick(0.5, 42)], [p.f, flick(1.6, 20)], [p.d, flick(2.7, -24)]], 3.6, {gyro: true});
    assert.strictEqual(G.tel.src, 'gyro', 'source ' + G.tel.src);
    assert(G.tel.sc === 1, 'scale ' + G.tel.sc);
    assert.deepStrictEqual(names(got), ['turn1', 'jump', 'dash1'], JSON.stringify(got));
  });
  test(p.name + ': a rad/s gyro is recognised', () => {
    fresh(p, true);
    play(p, [[p.t, flick(0.5, 42)], [p.f, flick(1.6, 20)]], 2.6, {gyro: true, unit: R2D});
    assert(Math.abs(G.tel.sc - R2D) < 1e-6, 'scale ' + G.tel.sc);
    assert.strictEqual(G.tel.src, 'gyro');
  });
}
test('a compass correction in the orientation stream is not a move once the gyro drives', () => {
  const motion = [[STAND.t, flick(0.5, 42)], [STAND.f, flick(1.6, 20)], [STAND.d, flick(2.7, -24)]],
    jump = (t) => (t > 4 ? 36 : 0);
  fresh(STAND, true);
  const plain = play(STAND, motion, 5, {oJump: jump});
  assert(plain.length === 4, 'orientation alone should see the jump as a turn: ' + JSON.stringify(names(plain)));
  fresh(STAND, true);
  let last = 99;
  const got = play(STAND, motion, 5, {gyro: true, oJump: jump, each: (t) => (last = G.steerDeg(t))});
  assert.deepStrictEqual(names(got), ['turn1', 'jump', 'dash1'], JSON.stringify(got));
  assert.strictEqual(G.tel.src, 'gyro', 'gyro lost trust over a glitch');
  assert(Math.abs(last) < 2, 'steer ' + last.toFixed(1));
});
test('when the gyro stream stops, orientation takes over without a jump', () => {
  fresh(BED, true);
  let at = 0,
    prev = null;
  const got = play(BED, [[BED.t, flick(0.5, 42)], [BED.f, flick(1.6, 20)], [BED.t, kf([3, 0], [3.5, 8], [7, 8])]], 7, {
    gyro: true,
    bias: [1.5, -1, 2], // deg/s: the gyro attitude drifts away from the orientation one
    gyroUntil: 5,
    each: (t) => {
      const s = G.steerDeg(t);
      if (t > 4.8 && t < 5.4 && prev != null) at = Math.max(at, Math.abs(s - prev));
      prev = s;
    },
  });
  assert.deepStrictEqual(names(got), ['turn1', 'jump'], JSON.stringify(got));
  assert.strictEqual(G.tel.src, 'orient');
  assert(at < 1, 'steer jumped by ' + at.toFixed(1) + ' deg in one frame');
});
test('a garbled gyro (axes swapped) is never trusted, orientation keeps working', () => {
  fresh(STAND, true);
  const got = play(STAND, [[STAND.t, flick(0.5, 42)], [STAND.f, flick(1.6, 20)], [STAND.d, flick(2.7, -24)]], 3.6, {
    gyro: true,
    perm: (w) => [w[2], w[0], w[1]],
  });
  assert.strictEqual(G.tel.sc, 0, 'scale ' + G.tel.sc);
  assert.strictEqual(G.tel.src, 'orient');
  assert.deepStrictEqual(names(got), ['turn1', 'jump', 'dash1'], JSON.stringify(got));
});
for (const unit of [1, R2D])
  test('no orientation stream at all: gyro + gravity alone (' + (unit === 1 ? 'deg/s' : 'rad/s') + ')', () => {
    fresh(BED2, true);
    const got = play(
      BED2,
      [[BED2.t, flick(0.5, 42)], [BED2.f, flick(1.6, 20)], [BED2.d, flick(2.7, -24)], [BED2.t, flick(3.8, -42)], [BED2.f, flick(4.9, -20)]],
      5.8,
      {gyro: true, accel: true, orient: false, unit, noLin: true},
    );
    assert.strictEqual(G.tel.src, 'gyro');
    assert(Math.abs(G.tel.sc - unit) < 1e-6, 'scale ' + G.tel.sc);
    // a rad/s browser reads as no motion until gravity has shown the scale, so only count the later moves there
    const n = names(got);
    if (unit === 1) assert.deepStrictEqual(n, ['turn1', 'jump', 'dash1', 'turn-1', 'slide'], JSON.stringify(got));
    else assert.deepStrictEqual(n.slice(-2), ['turn-1', 'slide'], JSON.stringify(got));
  });
test('no orientation stream: the "spin it" calibration still finds the wrist axes', () => {
  fresh(BED, false);
  G.resetCal();
  const T0 = 1.4,
    N = 6,
    keys = [[0, 0]];
  let prev = 0;
  for (let k = 0; k < N; k++) {
    const tgt = (k % 2 === 0 ? 1 : -1) * 38;
    keys.push([T0 + k + 0.25, prev], [T0 + k + 1.15, tgt]);
    prev = tgt;
  }
  const T = clock;
  G.calBegin();
  for (let k = 0; k < N; k++) G.calBeat(k % 2 === 0 ? 1 : -1, T + T0 + k);
  G.st.active = false;
  play(BED, [[BED.t, keys]], T0 + N + 0.05, {gyro: true, accel: true, orient: false});
  const r = G.calSolve(T + T0 + N);
  assert(r.ok, JSON.stringify(r));
  const ang = (Math.acos(Math.min(1, Math.abs(r.axis[0] * BED.t[0] + r.axis[1] * BED.t[1] + r.axis[2] * BED.t[2]))) * 180) / Math.PI;
  assert(ang < 7, 'axis off by ' + ang.toFixed(1));
});
test('the whole body moving makes the centre follow a held lean sooner', () => {
  const run = (lin) => {
    fresh(STAND, true);
    let last = 0;
    play(STAND, [[STAND.t, kf([0.5, 0], [0.9, 14])]], 3.2, {
      gyro: true,
      accel: true,
      lin: lin ? (t) => [Math.sin(t * 11) * 3, Math.cos(t * 7) * 2.5, Math.sin(t * 5) * 2] : null,
      each: (t) => (last = G.steerDeg(t)),
    });
    return last;
  };
  const calm = run(false),
    moving = run(true);
  assert(moving < calm - 3, 'calm ' + calm.toFixed(1) + ', moving ' + moving.toFixed(1));
});
test('flicks still fire while the body is moving', () => {
  fresh(STAND, true);
  const got = play(STAND, [[STAND.t, flick(0.5, 42)], [STAND.f, flick(1.6, 20)], [STAND.d, flick(2.7, -24)]], 3.6, {
    gyro: true,
    accel: true,
    lin: (t) => [Math.sin(t * 11) * 3, Math.cos(t * 7) * 2.5, Math.sin(t * 5) * 2],
  });
  assert.deepStrictEqual(names(got), ['turn1', 'jump', 'dash1'], JSON.stringify(got));
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
