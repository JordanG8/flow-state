'use strict';
// Arena core: the map, the on-foot movement (run, jump, step up, wall run, wall jump) and the ray tests used for
// shooting. No rendering and no DOM, so it runs under node for the tests.
const ACORE = (() => {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const C = {
    SPEED: 8.6, // run speed, m/s
    GR: 26,
    JV: 9.4,
    W: 0.35, // half width of the body box
    H: 1.8,
    EYE: 1.62,
    STEP: 0.56, // tallest ledge you walk up without jumping
    WR_MAX: 1.9, // longest wall run, seconds
    WR_GR: 3.6, // gravity while on the wall
    WR_MIN: 4, // slowest speed along the wall that still starts a run
    KILL_Y: -14,
  };

  // ---- map: "Switchback" --------------------------------------------------------------------------------
  // Two slabs split by a chasm. Ways across: the centre bridge, the catwalk above it, stepping stones at the far
  // ends, and two striped walls that hang over the drop and can only be crossed by running along them.
  // Box fields: x0..z1 bounds, k = shader kind, s = shader extra, wr = marked wall-run wall, nc = no collision.
  function buildMap() {
    const B = [];
    const box = (x0, x1, y0, y1, z0, z1, k, o) => {
      const b = Object.assign({x0, x1, y0, y1, z0, z1, k: k || 0, s: 0}, o || {});
      B.push(b);
      return b;
    };
    const cen = (x, z, w, h, d, k, o) => box(x - w / 2, x + w / 2, (o && o.y) || 0, ((o && o.y) || 0) + h, z - d / 2, z + d / 2, k, o);
    // everything in `half` is mirrored through the centre so both sides play the same
    const half = () => {
      // slab
      box(-40, 40, -40, 0, -30, -6, 0);
      // perimeter
      box(-41, 41, -40, 9, -31, -30, 0);
      box(-41, -40, -40, 9, -30, 0, 0);
      // corner tower: deck on pillars, stairs up the side, a parapet facing the chasm
      box(-34, -24, 3.6, 4, -26, -16, 0);
      for (const [x, z] of [[-33.5, -25.5], [-24.5, -25.5], [-33.5, -16.5], [-24.5, -16.5]]) cen(x, z, 1, 3.6, 1, 10);
      for (let i = 0; i < 7; i++) box(-24 + 0.8 * i, -24 + 0.8 * (i + 1), 0, 3.5 - 0.5 * i, -23, -19.5, 0);
      box(-34, -24, 4, 5, -16.3, -16, 10);
      box(-34.3, -34, 4, 5, -26, -16, 10);
      // crates and low walls
      cen(-12, -12, 2.4, 2.4, 2.4, 10);
      cen(-9.5, -12.2, 2.4, 1.2, 2.4, 10);
      cen(10, -22, 3.2, 1.3, 1.2, 10);
      cen(4.5, -25, 2, 2, 2, 10);
      cen(-19, -8.6, 5, 1.2, 0.9, 10);
      cen(31, -23, 3, 3, 3, 10);
      cen(31, -19.4, 3, 1.5, 2.2, 10);
      cen(-6, -20, 1, 2.6, 5, 0);
      cen(22, -27, 5, 1.2, 1, 10);
      // the slot: two facing walls to wall-jump between, and the perch they lead to
      box(8, 8.6, 0, 7, -18, -8, 9, {wr: 1});
      box(12.6, 13.2, 0, 4.4, -18, -8, 9, {wr: 1});
      box(13.2, 18.5, 4, 4.4, -18, -12, 0);
      cen(18, -17.5, 1, 4, 1, 10);
      cen(18, -12.5, 1, 4, 1, 10);
      box(13.2, 18.5, 4.4, 5.3, -18.3, -18, 10);
      // catwalk stairs and the pillars under the catwalk
      for (let i = 0; i < 9; i++) box(-1.6, 1.6, 0, 4.5 - 0.5 * i, -14 - 0.8 * (i + 1), -14 - 0.8 * i, 0);
      box(-1.6, -1, 0, 4.6, -7.3, -6.7, 10);
      box(1, 1.6, 0, 4.6, -7.3, -6.7, 10);
      // bridge rails
      box(-4, -3.65, 0, 1.1, -6, -0.6, 10);
      // stepping stone
      box(-37.6, -34.4, -40, 0, -3.6, -1.2, 0);
      // skyline (no collision)
      for (const [x, z, w, h] of [[-58, -44, 9, 30], [-30, -56, 7, 44], [6, -60, 11, 26], [38, -52, 8, 52], [64, -30, 10, 34], [-70, -12, 8, 22]])
        cen(x, z, w, h + 40, w, 3, {y: -40, nc: 1});
    };
    const n0 = B.length;
    half();
    for (let i = n0, n = B.length; i < n; i++) {
      const b = B[i];
      B.push(Object.assign({}, b, {x0: -b.x1, x1: -b.x0, z0: -b.z1, z1: -b.z0}));
    }
    // centre pieces (already symmetric)
    box(-4, 4, -1, 0, -6, 6, 0); // bridge
    box(-1.6, 1.6, 4.6, 5, -14, 14, 0); // catwalk
    box(-1.6, -1.45, 5, 5.6, -14, 14, 10);
    box(1.45, 1.6, 5, 5.6, -14, 14, 10);
    // the two wall-run crossings
    box(23.6, 24.4, -40, 7.5, -11, 11, 9, {wr: 1, s: 40});
    box(-24.4, -23.6, -40, 7.5, -11, 11, 9, {wr: 1, s: 40});
    const solid = B.filter((b) => !b.nc);
    solid.forEach((b, i) => (b.i = i));
    return {boxes: B, solid: solid};
  }
  const MAP = buildMap();
  const SPAWNS = [
    [-36, -27, -135], [-14, -27, 180], [14, -27, 180], [36, -27, 135], [36, 27, 45], [14, 27, 0], [-14, 27, 0], [-36, 27, -45],
    [-29, -21, -120], [29, 21, 60], [28, -10, 120], [-28, 10, -60],
  ].map((s) => ({x: s[0], y: s[0] === -29 || s[0] === 29 ? 4 : 0, z: s[1], yaw: (s[2] * Math.PI) / 180}));

  // ---- player -------------------------------------------------------------------------------------------
  function newPlayer(sp) {
    return {
      x: sp.x, y: sp.y + 0.02, z: sp.z, vx: 0, vy: 0, vz: 0,
      yaw: sp.yaw, pitch: 0,
      grounded: false, coyote: 0, jbuf: 0,
      wall: 0, // 0 off the wall, 1 wall on the right, -1 wall on the left
      wn: [0, 0], wt: [0, 0], wallT: 0, wspd: 0, lastWall: -1, wallCd: 0,
      stride: 0, ev: [],
    };
  }
  const hit = (b, x, y, z) =>
    x + C.W > b.x0 && x - C.W < b.x1 && y + C.H > b.y0 && y < b.y1 && z + C.W > b.z0 && z - C.W < b.z1;
  function blocked(S, x, y, z) {
    for (const b of S) if (hit(b, x, y, z)) return b;
    return null;
  }
  // A wall you can run on: tall enough around the body, and still beside you.
  const runnable = (b, P) => b.y1 >= P.y + 1.5 && b.y0 <= P.y + 0.6;
  function wallBeside(S, P) {
    const x = P.x - P.wn[0] * 0.1,
      z = P.z - P.wn[1] * 0.1;
    for (const b of S) if (hit(b, x, P.y, z) && runnable(b, P)) return b;
    return null;
  }
  function startWall(P, b, nx, nz, pvx, pvz, inp) {
    if (P.grounded || P.wall || inp.mz < 0.2) return;
    if (P.wallCd > 0 && b.i === P.lastWall) return;
    if (!runnable(b, P)) return;
    // tangent: the wall direction closest to where you were going
    let tx = -nz,
      tz = nx;
    const along = pvx * tx + pvz * tz;
    if (along < 0) {
      tx = -tx;
      tz = -tz;
    }
    if (Math.abs(along) < C.WR_MIN) return;
    P.wn = [nx, nz];
    P.wt = [tx, tz];
    // right of travel is (-tz, tx); the wall sits opposite its normal
    P.wall = -tz * -nx + tx * -nz > 0 ? 1 : -1;
    P.wallT = 0;
    P.wspd = Math.max(Math.abs(along), C.SPEED) * 1.1;
    P.vy = clamp(Math.max(P.vy, 3.4), 3.4, 6.5);
    P.lastWall = b.i;
    P.ev.push({t: 'wallrun', side: P.wall});
  }
  function endWall(P) {
    if (!P.wall) return;
    P.wall = 0;
    P.wallCd = 0.9;
  }
  // inp: {mx, mz} move axes (right, forward; length <= 1), jump (true on the frame it is pressed), yaw (radians)
  function step(P, inp, dt, S) {
    S = S || MAP.solid;
    P.ev.length = 0;
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      sub(P, inp, h, S);
      left -= h;
      inp = Object.assign({}, inp, {jump: false});
    }
  }
  function sub(P, inp, dt, S) {
    P.yaw = inp.yaw;
    const fx = -Math.sin(P.yaw),
      fz = -Math.cos(P.yaw),
      rx = -fz,
      rz = fx;
    let wx = fx * inp.mz + rx * inp.mx,
      wz = fz * inp.mz + rz * inp.mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    if (inp.jump) P.jbuf = 0.14;
    P.jbuf -= dt;
    P.coyote -= dt;
    P.wallCd -= dt;

    if (P.wall) {
      P.wallT += dt;
      P.wspd += (C.SPEED * 1.06 - P.wspd) * Math.min(1, dt * 1.2);
      P.vx = P.wt[0] * P.wspd - P.wn[0] * 1.2;
      P.vz = P.wt[1] * P.wspd - P.wn[1] * 1.2;
      P.vy -= C.WR_GR * dt;
      if (P.jbuf > 0) {
        // wall jump: keep the run, kick off the wall and up
        P.jbuf = 0;
        P.vx = P.wt[0] * P.wspd * 0.92 + P.wn[0] * 6.4;
        P.vz = P.wt[1] * P.wspd * 0.92 + P.wn[1] * 6.4;
        P.vy = 9;
        endWall(P);
        P.ev.push({t: 'walljump'});
      } else if (P.wallT > C.WR_MAX || inp.mz < -0.4) endWall(P);
    } else {
      const tx = wx * C.SPEED,
        tz = wz * C.SPEED;
      if (P.grounded) {
        const k = 1 - Math.exp(-14 * dt);
        P.vx += (tx - P.vx) * k;
        P.vz += (tz - P.vz) * k;
      } else {
        // air: steer toward the wish direction without losing speed you already carry
        const sp = Math.hypot(P.vx, P.vz),
          a = 26 * dt;
        let nx = P.vx + wx * a,
          nz = P.vz + wz * a;
        const ns = Math.hypot(nx, nz),
          cap = Math.max(sp, C.SPEED);
        if (ns > cap) {
          nx *= cap / ns;
          nz *= cap / ns;
        }
        P.vx = nx;
        P.vz = nz;
      }
      if (P.jbuf > 0 && (P.grounded || P.coyote > 0)) {
        P.jbuf = 0;
        P.coyote = 0;
        P.vy = C.JV;
        P.grounded = false;
        P.ev.push({t: 'jump'});
      }
      P.vy -= C.GR * dt;
    }
    if (P.vy < -45) P.vy = -45;

    const pvx = P.vx,
      pvz = P.vz;
    // horizontal, one axis at a time; low ledges are stepped onto instead of blocking
    for (let ax = 0; ax < 2; ax++) {
      const d = (ax ? P.vz : P.vx) * dt;
      if (!d) continue;
      const nx = ax ? P.x : P.x + d,
        nz = ax ? P.z + d : P.z;
      const b = blocked(S, nx, P.y, nz);
      if (!b) {
        P.x = nx;
        P.z = nz;
        continue;
      }
      const up = b.y1 - P.y;
      if (!P.wall && up > 0 && up <= C.STEP && (P.grounded || P.vy <= 0.5) && !blocked(S, nx, b.y1 + 1e-3, nz)) {
        P.x = nx;
        P.z = nz;
        P.y = b.y1 + 1e-3;
        if (P.vy < 0) P.vy = 0;
        continue;
      }
      if (ax) {
        P.z = d > 0 ? b.z0 - C.W - 1e-4 : b.z1 + C.W + 1e-4;
        P.vz = 0;
        startWall(P, b, 0, d > 0 ? -1 : 1, pvx, pvz, inp);
      } else {
        P.x = d > 0 ? b.x0 - C.W - 1e-4 : b.x1 + C.W + 1e-4;
        P.vx = 0;
        startWall(P, b, d > 0 ? -1 : 1, 0, pvx, pvz, inp);
      }
    }
    // vertical
    const ny = P.y + P.vy * dt,
      was = P.grounded;
    const b = blocked(S, P.x, ny, P.z);
    P.grounded = false;
    if (!b) P.y = ny;
    else if (P.vy <= 0) {
      P.y = b.y1 + 1e-4;
      if (!was && P.vy < -3) P.ev.push({t: 'land', v: -P.vy});
      P.vy = 0;
      P.grounded = true;
      P.coyote = 0.1;
      P.lastWall = -1;
      endWall(P);
      P.wallCd = 0;
    } else {
      P.y = b.y0 - C.H - 1e-4;
      P.vy = 0;
    }
    if (P.wall && !wallBeside(S, P)) endWall(P); // ran off the end of the wall
    if (P.grounded) P.stride += (Math.hypot(P.vx, P.vz) * dt) / 2.6;
    else if (P.wall) P.stride += (P.wspd * dt) / 2.2;
    if (P.y < C.KILL_Y) P.ev.push({t: 'fell'});
  }

  // ---- rays ---------------------------------------------------------------------------------------------
  // Slab test. Returns the entry distance along d (unit) or -1.
  function rayBox(o, d, x0, x1, y0, y1, z0, z1, max) {
    let t0 = 0,
      t1 = max;
    const lo = [x0, y0, z0],
      hi = [x1, y1, z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) return -1;
        continue;
      }
      let a0 = (lo[a] - o[a]) / d[a],
        a1 = (hi[a] - o[a]) / d[a];
      if (a0 > a1) {
        const t = a0;
        a0 = a1;
        a1 = t;
      }
      if (a0 > t0) t0 = a0;
      if (a1 < t1) t1 = a1;
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function rayMap(o, d, max, S) {
    S = S || MAP.solid;
    let best = max;
    for (const b of S) {
      const t = rayBox(o, d, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, best);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
  // A standing player at feet position p: head sphere first, then the body box. Returns {t, head} or null.
  function rayPlayer(o, d, p, max) {
    const cx = p[0] - o[0],
      cy = p[1] + 1.62 - o[1],
      cz = p[2] - o[2],
      r = 0.27;
    const tc = cx * d[0] + cy * d[1] + cz * d[2],
      d2 = cx * cx + cy * cy + cz * cz - tc * tc;
    let th = -1;
    if (tc > 0 && d2 < r * r) th = tc - Math.sqrt(r * r - d2);
    const tb = rayBox(o, d, p[0] - 0.4, p[0] + 0.4, p[1], p[1] + 1.42, p[2] - 0.4, p[2] + 0.4, max);
    if (th >= 0 && th < max && (tb < 0 || th <= tb + 0.05)) return {t: th, head: true};
    if (tb >= 0 && tb < max) return {t: tb, head: false};
    return null;
  }

  // The spawn furthest from everyone still alive (ties broken by `rnd`).
  function pickSpawn(others, rnd) {
    let best = null,
      bs = -1;
    for (const s of SPAWNS) {
      let near = 1e9;
      for (const o of others) near = Math.min(near, Math.hypot(o[0] - s.x, o[2] - s.z));
      const sc = Math.min(near, 60) + (rnd ? rnd() : Math.random()) * 6;
      if (sc > bs) {
        bs = sc;
        best = s;
      }
    }
    return best;
  }

  return {C, MAP, SPAWNS, newPlayer, step, rayBox, rayMap, rayPlayer, pickSpawn};
})();
if (typeof module !== 'undefined') module.exports = ACORE;
