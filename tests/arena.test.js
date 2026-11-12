'use strict';
// Arena movement and shooting geometry: node tests/arena.test.js
const A = require('../src/arena-core.js');
const assert = require('assert');
const C = A.C;
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok  ' + name);
};
const at = (x, y, z, yawDeg) => A.newPlayer({x, y, z, yaw: ((yawDeg || 0) * Math.PI) / 180});
// run the sim; ctl(t, P) returns the input for this frame
function run(P, secs, ctl) {
  const evs = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    const i = Object.assign({mx: 0, mz: 0, jump: false, yaw: P.yaw}, ctl(t, P) || {});
    A.step(P, i, 1 / 60);
    for (const e of P.ev) evs.push(Object.assign({time: t}, e));
    if (evs.some((e) => e.t === 'fell')) break;
  }
  return evs;
}
const once = () => {
  let done = false;
  return (c) => (c && !done ? (done = true) : false);
};

test('map is point-symmetric and spawns are clear', () => {
  for (const b of A.MAP.solid) {
    const m = A.MAP.solid.find((o) => Math.abs(o.x0 + b.x1) < 1e-6 && Math.abs(o.z0 + b.z1) < 1e-6 && o.y0 === b.y0 && o.y1 === b.y1 && Math.abs(o.x1 + b.x0) < 1e-6);
    assert(m, 'no mirror for box at ' + b.x0 + ',' + b.z0);
  }
  for (const s of A.SPAWNS) {
    const P = A.newPlayer(s);
    run(P, 0.5, () => ({}));
    assert(P.grounded, 'spawn not on ground ' + s.x + ',' + s.z);
    assert(Math.abs(P.y - s.y) < 0.05, 'spawn sank or floats ' + s.x + ',' + s.z + ' y=' + P.y);
  }
});

test('runs at run speed and stops at a wall', () => {
  const P = at(0, 0, -27, 90); // yaw 90: forward is -x
  run(P, 1.5, () => ({mz: 1}));
  assert(Math.abs(Math.hypot(P.vx, P.vz) - C.SPEED) < 0.2);
  run(P, 8, () => ({mz: 1}));
  assert(P.x > -40 && P.x < -39.5, 'stopped at the perimeter, x=' + P.x);
});

test('jump clears a 1.2 m crate but not a 2.4 m one', () => {
  let P = at(-9.5, 0, -8, 0); // crate at z -13.4..-11, 1.2 tall; forward is -z
  let j = once(),
    landY = 0;
  run(P, 1.2, (t, p) => {
    if (p.grounded) landY = Math.max(landY, p.y);
    return {mz: 1, jump: j(p.z < -8.5)};
  });
  assert(Math.abs(landY - 1.2) < 0.01, 'landed on the low crate, y=' + landY);
  P = at(-12, 0, -7, 0);
  j = once();
  run(P, 1.5, (t, p) => ({mz: 1, jump: j(p.z < -9)}));
  assert(P.y < 0.1 && P.z > -10.9, 'blocked by the tall crate');
});

test('stairs are walked up without jumping', () => {
  const P = at(-17, 0, -21.2, 90);
  const ev = run(P, 2.2, () => ({mz: 1}));
  assert(P.y > 3.9 && P.grounded, 'on the tower deck, y=' + P.y);
  assert(!ev.some((e) => e.t === 'jump'));
});

test('the chasm kills', () => {
  const P = at(15, 0, -9, 180); // forward +z, off the edge
  const ev = run(P, 4, () => ({mz: 1}));
  assert(ev.some((e) => e.t === 'fell'));
});

test('wall run carries you across the chasm', () => {
  // run +z beside the striped wall (its face is at x = 23.6), jump at the edge and lean into it
  const P = at(22.6, 0, -16, 180);
  const j = once();
  const ev = run(P, 3.2, (t, p) => ({mz: 1, mx: p.z > -9 && !p.grounded ? -0.5 : 0, jump: j(p.z > -7.4)}));
  // facing +z, right is -x; the wall is at +x, so strafe left (mx<0) leans into it
  assert(ev.some((e) => e.t === 'wallrun'), 'started a wall run');
  assert(!ev.some((e) => e.t === 'fell'), 'did not fall');
  assert(P.z > 6 && P.y > -0.1, 'reached the far slab: z=' + P.z + ' y=' + P.y);
});

test('wall run needs speed along the wall, and ends on its own', () => {
  // jumping straight into a wall does not stick
  let P = at(20, 0, -20, -90); // forward +x, into the wall face
  let j = once();
  let ev = run(P, 1.5, (t, p) => ({mz: 1, jump: j(p.x > 22)}));
  assert(!ev.some((e) => e.t === 'wallrun'), 'no run head-on');
  // a long wall: the perimeter. The run times out and you drop.
  P = at(-20, 0, -29.2, -90); // forward +x along the north wall (face at z=-30)
  j = once();
  let tStart = -1,
    tEnd = -1;
  run(P, 4, (t, p) => {
    if (p.wall && tStart < 0) tStart = t;
    if (!p.wall && tStart >= 0 && tEnd < 0) tEnd = t;
    return {mz: 1, mx: -0.6, jump: j(t > 0.8)};
  });
  assert(tStart > 0 && tEnd > tStart, 'ran and ended');
  assert(tEnd - tStart <= C.WR_MAX + 0.05 && tEnd - tStart > 1, 'lasted ' + (tEnd - tStart));
});

test('wall jump kicks away and up', () => {
  const P = at(-20, 0, -29.2, -90);
  const j = once(),
    j2 = once();
  let done = false,
    y0 = 0;
  const ev = run(P, 1.6, (t, p) => {
    const a = j(t > 0.8),
      b = j2(p.wall && p.wallT > 0.4);
    if (b) {
      done = true;
      y0 = p.y;
    }
    return {mz: 1, mx: done ? 0 : -0.6, jump: a || b};
  });
  assert(ev.some((e) => e.t === 'walljump'));
  assert(P.z > -28, 'pushed off the wall, z=' + P.z);
  assert(P.x > -10, 'kept running along it, x=' + P.x);
});

test('the slot: wall jumps reach the perch', () => {
  // between the facing walls (inner faces x = 8.6 and 12.6), running -z
  const P = at(12, 0, -6.6, 0);
  const j = once();
  let jumps = 0,
    top = 0;
  run(P, 5, (t, p) => {
    top = Math.max(top, p.y);
    let jump = j(p.z < -8.2);
    if (p.wall && p.wallT > 0.12 && jumps < 6) {
      jump = true;
      jumps++;
    }
    // lean into whichever wall is next: start right (+x wall), then alternate
    const mx = p.wall || p.z > -8.2 ? 0 : jumps % 2 === 0 ? 0.7 : -0.7;
    return {mz: 1, mx, jump};
  });
  assert(top > 4.9, 'climbed above the perch wall, top=' + top.toFixed(2) + ' after ' + jumps + ' wall jumps');
});

test('rays: map, body and head', () => {
  const d = [0, 0, -1];
  assert(Math.abs(A.rayMap([20, 2, -20], d, 200) - 10) < 0.01, 'north wall at z=-30');
  const p = [0, 0, -10];
  let h = A.rayPlayer([0, 1, 0], d, p, 100);
  assert(h && !h.head && Math.abs(h.t - 9.6) < 0.01);
  h = A.rayPlayer([0, 1.62, 0], d, p, 100);
  assert(h && h.head);
  assert(!A.rayPlayer([1, 1, 0], d, p, 100), 'miss to the side');
  assert(!A.rayPlayer([0, 1, 0], d, p, 5), 'out of range');
  // a crate between shooter and target blocks the shot
  const o = [-12, 1, -8],
    t = [-12, 0, -16];
  const pm = A.rayMap(o, d, 100),
    pp = A.rayPlayer(o, d, t, 100);
  assert(pp && pm < pp.t, 'crate is closer than the player');
});

test('spawn picking avoids enemies', () => {
  const s = A.pickSpawn([[-36, 0, -27], [-14, 0, -27]], () => 0);
  assert(Math.hypot(s.x + 36, s.z + 27) > 40);
});
console.log(n + ' arena tests passed');
