'use strict';
const CORE = (() => {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
    lerp = (a, b, t) => a + (b - a) * t;
  const HV = [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ],
    hv = (H) => HV[((H % 4) + 4) % 4],
    mod4 = (H) => ((H % 4) + 4) % 4;
  function rng32(a) {
    return function () {
      a |= 0;
      a = (a + 1831565813) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const GR = 30,
    JV = 11,
    PADV = 17,
    PH = 1.75,
    SH = 0.8,
    HW = 0.3,
    LATMAX = 9.5;
  class Course {
    constructor(seed) {
      this.seed = seed;
      this.rng = rng32(seed);
      this.rng2 = rng32(seed ^ 2654435769);
      this.chunks = [];
      this.base = 0;
      this.n = 0;
      this.c = {x: 0, y: 0, z: 0, H: 0};
      this.dist = 0;
      this.last = '';
      this.last2 = '';
      this.sinceCorner = 0;
      this.sinceCp = 0;
      this.lastDir = 0;
      this.script = ['run', 'hurdles', 'gaps', 'corner', 'run', 'stairs', 'bars', 'corner', 'run'];
      this.onDrop = null;
      const ch = this.newChunk('start');
      this.add(ch, this.lb(-5, 5, -10, 36, -1.4, 0, 0));
      ch.cp = {x: 0, y: 0, z: -1, H: 0, ci: ch.i, dist: 0};
      this.adv(ch, 36);
      this.finish(ch);
      this.chunks.push(ch);
    }
    r(a, b) {
      return a + (b - a) * this.rng();
    }
    ri(a, b) {
      return Math.floor(this.r(a, b + 1));
    }
    diff() {
      return clamp(this.dist / 2800, 0, 1);
    }
    W() {
      return 7.4 - 3.2 * this.diff();
    }
    vplan() {
      return 15 + 8.5 * this.diff();
    }
    get(i) {
      return this.chunks[i - this.base];
    }
    lb(l0, l1, f0, f1, y0, y1, k, s) {
      const c = this.c,
        h = hv(c.H),
        hx = h[0],
        hz = h[1],
        rx = -hz,
        rz = hx;
      const ax = c.x + rx * l0 + hx * f0,
        az = c.z + rz * l0 + hz * f0,
        bx = c.x + rx * l1 + hx * f1,
        bz = c.z + rz * l1 + hz * f1;
      return {
        x0: Math.min(ax, bx),
        x1: Math.max(ax, bx),
        z0: Math.min(az, bz),
        z1: Math.max(az, bz),
        y0: c.y + y0,
        y1: c.y + y1,
        k: k || 0,
        s: s || 0,
      };
    }
    add(ch, b) {
      ch.boxes.push(b);
      return b;
    }
    addV(ch, b) {
      ch.vboxes.push(b);
    }
    adv(ch, len) {
      const h = hv(this.c.H);
      this.c.x += h[0] * len;
      this.c.z += h[1] * len;
      this.dist += len;
      ch.len += len;
      ch.wps.push([this.c.x, this.c.y, this.c.z]);
    }
    hp(f) {
      const c = this.c,
        h = hv(c.H);
      return {x: c.x + h[0] * f, z: c.z + h[1] * f, ax: h[0], az: h[1]};
    }
    gate(ch, f, lat, yc, w, hh, o) {
      const c = this.c,
        h = hv(c.H),
        hx = h[0],
        hz = h[1],
        rx = -hz,
        rz = hx;
      o = o || {};
      const g = {
        x: c.x + hx * f + rx * lat,
        y: c.y + yc,
        z: c.z + hz * f + rz * lat,
        ax: hx,
        az: hz,
        rx: rx,
        rz: rz,
        hw: w / 2,
        hh: hh / 2,
        need: o.need || null,
        prev: undefined,
        done: false,
        vis: o.vis !== false,
      };
      ch.gates.push(g);
      if (g.vis) {
        const t = 0.09,
          mk = (a, b, c0, d, e, f2) => this.addV(ch, this.lb(a, b, c0, d, e, f2, 4));
        mk(lat - w / 2 - t, lat - w / 2 + t, f - t, f + t, yc - hh / 2, yc + hh / 2);
        mk(lat + w / 2 - t, lat + w / 2 + t, f - t, f + t, yc - hh / 2, yc + hh / 2);
        mk(lat - w / 2 - t, lat + w / 2 + t, f - t, f + t, yc + hh / 2 - t, yc + hh / 2 + t);
      }
    }
    newChunk(name) {
      const c = this.c;
      return {
        i: this.n++,
        name: name,
        boxes: [],
        vboxes: [],
        decor: [],
        gates: [],
        corner: null,
        hint: null,
        cp: null,
        wps: [[c.x, c.y, c.z]],
        len: 0,
        st: {x: c.x, y: c.y, z: c.z, H: c.H},
        act: Math.floor(this.dist / 1e3) % 4,
        bb: null,
        mesh: null,
        ymin: 0,
      };
    }
    finish(ch) {
      let x0 = 1e9,
        x1 = -1e9,
        z0 = 1e9,
        z1 = -1e9,
        ym = 1e9;
      for (const b of ch.boxes) {
        x0 = Math.min(x0, b.x0);
        x1 = Math.max(x1, b.x1);
        z0 = Math.min(z0, b.z0);
        z1 = Math.max(z1, b.z1);
        if (b.k !== 1) ym = Math.min(ym, b.y1);
      }
      ch.bb = {x0: x0, x1: x1, z0: z0, z1: z1};
      ch.ymin = ym === 1e9 ? 0 : ym;
      this.decor(ch);
    }
    decor(ch) {
      const r = this.rng2,
        st = ch.st,
        h = hv(st.H),
        hx = h[0],
        hz = h[1],
        rx = -hz,
        rz = hx,
        len = Math.max(ch.len, 20),
        n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const side = r() < 0.5 ? -1 : 1,
          f = r() * len,
          lat = side * (17 + r() * 55),
          w = 5 + r() * 13,
          d = 5 + r() * 13,
          cx = st.x + hx * f + rx * lat,
          cz = st.z + hz * f + rz * lat,
          top = st.y - 12 - r() * 22;
        ch.decor.push({
          x0: cx - w / 2,
          x1: cx + w / 2,
          z0: cz - d / 2,
          z1: cz + d / 2,
          y0: top - 70 - r() * 60,
          y1: top,
          k: 3,
          s: r() < 0.14 ? 1 : 0,
        });
      }
      if (r() < 0.2) {
        const side = r() < 0.5 ? -1 : 1,
          f = r() * len,
          lat = side * (40 + r() * 60),
          w = 10 + r() * 16,
          d = 10 + r() * 16,
          cx = st.x + hx * f + rx * lat,
          cz = st.z + hz * f + rz * lat,
          y0 = st.y + 26 + r() * 30;
        ch.decor.push({
          x0: cx - w / 2,
          x1: cx + w / 2,
          z0: cz - d / 2,
          z1: cz + d / 2,
          y0: y0,
          y1: y0 + 2 + r() * 3,
          k: 3,
          s: 0,
        });
      }
    }
    next() {
      const name = this.script.length ? this.script.shift() : this.pick();
      const ch = this.newChunk(name);
      this['pat_' + name](ch);
      this.finish(ch);
      this.chunks.push(ch);
      this.last2 = this.last;
      this.last = name;
      this.sinceCorner = name === 'corner' ? 0 : this.sinceCorner + 1;
      this.sinceCp = name === 'cp' ? 0 : this.sinceCp + 1;
      return ch;
    }
    pick() {
      const d = this.diff();
      if (this.last === 'corner') return 'run';
      if (this.sinceCp >= 10 && this.last !== 'cp') return 'cp';
      if (this.sinceCorner >= 3 && (this.sinceCorner >= 5 || this.rng() < 0.6)) return 'corner';
      if (['zig', 'slalom', 'pad', 'beam'].includes(this.last) && this.rng() < 0.5) return 'run';
      const W = [
        ['gaps', 2],
        ['stairs', 1.4],
        ['bars', 1.2],
        ['hurdles', 1.2],
        ['beam', d > 0.04 ? 1.5 : 0.3],
        ['zig', d > 0.07 ? 1.6 : 0],
        ['slalom', d > 0.1 ? 1.3 : 0],
        ['pad', d > 0.12 ? 1.2 : 0],
        ['run', this.last === 'run' ? 0 : 0.5],
      ];
      let tot = 0;
      for (const w of W) {
        if (w[0] === this.last) w[1] *= 0.15;
        if (w[0] === this.last2) w[1] *= 0.5;
        tot += w[1];
      }
      let x = this.rng() * tot;
      for (const w of W) {
        x -= w[1];
        if (x <= 0) return w[0];
      }
      return 'run';
    }
    slab(ch, w, f0, f1) {
      this.add(ch, this.lb(-w / 2, w / 2, f0, f1, -1.4, 0, 0));
    }
    pat_run(ch) {
      const len = this.r(14, 24);
      this.slab(ch, this.W(), 0, len);
      this.adv(ch, len);
    }
    pat_gaps(ch) {
      const d = this.diff(),
        w = this.W(),
        v = this.vplan(),
        n = this.ri(2, 3 + Math.floor(d * 3));
      for (let i = 0; i < n; i++) {
        const L = Math.max(7, v * this.r(0.36, 0.48));
        this.slab(ch, w, 0, L);
        if (i === 0) ch.hint = Object.assign({type: 'jump'}, this.hp(L));
        let g = clamp(v * this.r(0.19, 0.3), 4, 8.6),
          dy = 0;
        const q = this.rng();
        if (q < 0.2) {
          dy = -this.r(1.5, 3);
          g *= 1.15;
        } else if (q < 0.36 && this.c.y < 8) {
          dy = this.r(0.5, 1);
          g *= 0.88;
        }
        this.gate(ch, L + g / 2, 0, 1.8 + dy * 0.5, Math.min(w, 4.6), 3);
        this.adv(ch, L + g);
        this.c.y += dy;
      }
      const L2 = this.r(9, 13);
      this.slab(ch, w, 0, L2);
      this.adv(ch, L2);
    }
    pat_stairs(ch) {
      const v = this.vplan(),
        w = this.W(),
        up = this.c.y < 10 && (this.c.y < -3 || this.rng() < 0.62),
        n = this.ri(3, 4 + Math.floor(this.diff() * 2)),
        hs = (up ? 1 : -1) * this.r(0.85, 1.1),
        L0 = this.r(10, 14);
      this.slab(ch, w, 0, L0);
      ch.hint = Object.assign({type: 'jump'}, this.hp(L0));
      this.adv(ch, L0);
      for (let i = 0; i < n; i++) {
        const L = Math.max(8, v * this.r(0.4, 0.5));
        this.c.y += hs;
        this.slab(ch, w, 0, L);
        if (i % 2 === 0) this.gate(ch, 0, 0, 1.9, Math.min(w, 4.4), 3.2);
        this.adv(ch, L);
      }
      const L2 = this.r(8, 12);
      this.slab(ch, w, 0, L2);
      this.adv(ch, L2);
    }
    pat_zig(ch) {
      const d = this.diff(),
        n = this.ri(4, 6 + Math.floor(d * 3)),
        pw = lerp(4.2, 3.2, d),
        off = 2.4,
        Lp = 11,
        stp = 7;
      let side = this.rng() < 0.5 ? -1 : 1;
      this.slab(ch, pw + 2, 0, 8);
      ch.hint = Object.assign(
        {
          type: 'dash',
        },
        this.hp(2),
      );
      this.adv(ch, 8);
      for (let i = 0; i < n; i++) {
        const lat = side * off;
        this.add(ch, this.lb(lat - pw / 2, lat + pw / 2, 0, Lp, -1.4, 0, 0));
        if (i < n - 1) this.gate(ch, Lp - 1.5, 0, 1.5, 3.2, 2.6);
        this.adv(ch, i === n - 1 ? Lp : stp);
        side = -side;
      }
      const L = this.r(9, 12);
      this.slab(ch, pw + 2, 0, L);
      this.adv(ch, L);
    }
    pat_beam(ch) {
      const d = this.diff(),
        lam = this.r(38, 52),
        A = this.r(1.7, 2.4) * (0.85 + 0.3 * d),
        bw = lerp(2.9, 2.1, d),
        len = Math.max(1, Math.round(this.r(50, 75) / (lam / 2))) * (lam / 2),
        stp = 2.6;
      this.slab(ch, this.W(), 0, 6);
      ch.hint = Object.assign({type: 'steer'}, this.hp(6));
      this.adv(ch, 6);
      for (let f = 0, k = 0; f < len; f += stp, k++) {
        const fm = Math.min(stp, len - f),
          lat = A * Math.sin((2 * Math.PI * (f + fm / 2)) / lam);
        this.add(ch, this.lb(lat - bw / 2, lat + bw / 2, f, f + fm, -1.4, 0, 0));
        if (k % 6 === 3) this.gate(ch, f + fm / 2, lat, 1.4, 2.8, 2.4);
      }
      this.adv(ch, len);
      const L = this.r(8, 12);
      this.slab(ch, this.W(), 0, L);
      this.adv(ch, L);
    }
    pat_slalom(ch) {
      const w = Math.max(this.W(), 6.6),
        len = this.r(52, 72);
      this.slab(ch, w, 0, len);
      let side = this.rng() < 0.5 ? -1 : 1;
      for (let f = 16, i = 0; f < len - 8; f += 11, i++) {
        const lat = side * 1.7;
        this.add(ch, this.lb(lat - 1, lat + 1, f, f + 2, 0, 3.6, 1));
        if (i === 0)
          ch.hint = Object.assign(
            {type: 'steer'},
            {x: this.hp(f).x, z: this.hp(f).z, ax: this.hp(f).ax, az: this.hp(f).az},
          );
        this.gate(ch, f + 1, -side * 1.5, 1.4, 2.4, 2.4);
        side = -side;
      }
      this.adv(ch, len);
    }
    pat_bars(ch) {
      const w = this.W(),
        n = this.ri(2, 3 + (this.diff() > 0.4 ? 1 : 0)),
        total = 12 + n * 17 + 4;
      this.slab(ch, w, 0, total);
      for (let i = 0, f = 12; i < n; i++, f += 17) {
        this.add(ch, this.lb(-w / 2, w / 2, f, f + 0.8, 0.95, 1.7, 1));
        this.add(ch, this.lb(-w / 2 - 0.9, -w / 2, f - 0.1, f + 0.9, -1.4, 2.4, 0));
        this.add(ch, this.lb(w / 2, w / 2 + 0.9, f - 0.1, f + 0.9, -1.4, 2.4, 0));
        this.gate(ch, f + 0.4, 0, 0.5, w, 0.8, {need: 'slide', vis: false});
        if (i === 0) ch.hint = Object.assign({type: 'slide'}, this.hp(f));
      }
      this.adv(ch, total);
    }
    pat_hurdles(ch) {
      const w = this.W(),
        d = this.diff(),
        n = this.ri(2, 3 + Math.floor(d * 3)),
        total = 11 + n * 15 + 3;
      this.slab(ch, w, 0, total);
      for (let i = 0, f = 11; i < n; i++, f += 15) {
        const hh = this.r(0.65, 0.95),
          part = this.rng() < 0.35 && d > 0.1;
        this.add(ch, this.lb(-w / 2, part ? w / 2 - 2.4 : w / 2, f, f + 0.9, 0, hh, 1));
        this.gate(ch, f + 0.45, 0, 0.6, w, 1, {need: 'air', vis: false});
        if (i === 0) ch.hint = Object.assign({type: 'jump'}, this.hp(f));
      }
      this.adv(ch, total);
    }
    pat_pad(ch) {
      const w = this.W(),
        v = this.vplan(),
        L1 = 15,
        G = clamp(0.8 * (v - 8), 7, 14);
      this.slab(ch, w, 0, L1);
      this.add(ch, this.lb(-1.7, 1.7, L1 - 8, L1 - 4.6, 0, 0.12, 2));
      this.gate(ch, L1 - 8 + v * 0.567, 0, 5, 4, 3.6);
      this.adv(ch, L1 + G);
      this.c.y += 0.7;
      const L = 14 + v * 0.35;
      this.slab(ch, w, 0, L);
      this.adv(ch, L);
    }
    pat_corner(ch) {
      const S = 12,
        c = this.c,
        h = hv(c.H);
      const dir = this.lastDir && this.rng() < 0.65 ? -this.lastDir : this.rng() < 0.5 ? 1 : -1;
      this.lastDir = dir;
      this.add(ch, this.lb(-S / 2, S / 2, 0, S, -1.4, 0, 6));
      this.add(ch, this.lb(-S / 2, S / 2, S, S + 1.2, -1.4, 5.5, 0));
      ch.corner = {
        tx: c.x,
        tz: c.z,
        H: c.H,
        dir: dir,
        S: S,
        cx: c.x + (h[0] * S) / 2,
        cz: c.z + (h[1] * S) / 2,
        used: false,
      };
      ch.hint = {type: 'turn', dir: dir, x: c.x - h[0] * 4, z: c.z - h[1] * 4, ax: h[0], az: h[1]};
      const nH = c.H + dir,
        nh = hv(nH);
      ch.len += S;
      this.dist += S;
      ch.wps.push([ch.corner.cx, c.y, ch.corner.cz]);
      this.c = {x: ch.corner.cx + (nh[0] * S) / 2, y: c.y, z: ch.corner.cz + (nh[1] * S) / 2, H: nH};
      ch.wps.push([this.c.x, this.c.y, this.c.z]);
    }
    pat_cp(ch) {
      const w = Math.max(this.W(), 6),
        L = 16,
        c = this.c,
        h = hv(c.H);
      this.slab(ch, w, 0, L);
      const pc = 0.7;
      this.addV(ch, this.lb(-w / 2 - 0.6, -w / 2, L / 2 - pc / 2, L / 2 + pc / 2, -1.4, 6.4, 4));
      this.addV(ch, this.lb(w / 2, w / 2 + 0.6, L / 2 - pc / 2, L / 2 + pc / 2, -1.4, 6.4, 4));
      this.addV(ch, this.lb(-w / 2 - 0.6, w / 2 + 0.6, L / 2 - pc / 2, L / 2 + pc / 2, 6.4, 7.1, 4));
      ch.cp = {x: c.x + h[0] * 3, y: c.y, z: c.z + h[1] * 3, H: c.H, ci: ch.i, dist: 0};
      this.adv(ch, L);
    }
    locate(P) {
      let i = P.ci;
      for (let k = 0; k < 3; k++) {
        const n = this.get(i + 1);
        if (n && P.x > n.bb.x0 - 3 && P.x < n.bb.x1 + 3 && P.z > n.bb.z0 - 3 && P.z < n.bb.z1 + 3) i++;
        else break;
      }
      P.ci = i;
    }
    trim(min) {
      while (this.base < min && this.chunks.length > 3) {
        const d = this.chunks.shift();
        this.base++;
        if (this.onDrop) this.onDrop(d);
      }
    }
    resetFrom(ci) {
      for (let i = Math.max(ci, this.base); i < this.base + this.chunks.length; i++) {
        const ch = this.get(i);
        for (const g of ch.gates) {
          g.done = false;
          g.prev = undefined;
        }
        if (ch.corner) ch.corner.used = false;
      }
    }
  }
  function newPlayer(cp) {
    return {
      sinceTurn: 9,
      x: cp.x,
      y: cp.y,
      z: cp.z,
      vy: 0,
      H: cp.H,
      speed: 0,
      speedT: 15,
      lat: 0,
      dashV: 0,
      dashCd: 0,
      grounded: false,
      coyote: 0,
      jumpBuf: 0,
      sliding: false,
      slideT: 0,
      slideQ: 0,
      ph: PH,
      alive: true,
      ci: cp.ci || 0,
      dist: 0,
      steer: 0,
      turnLock: 0,
      turnBuf: null,
      q: [],
      ev: [],
      stride: 0,
      stumbleT: 0,
    };
  }
  function hitB(boxes, x, y, z, h, hw, f) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        x + hw > b.x0 &&
        x - hw < b.x1 &&
        z + hw > b.z0 &&
        z - hw < b.z1 &&
        y + h > b.y0 &&
        y < b.y1 &&
        (!f || f(b))
      )
        return b;
    }
    return null;
  }
  const notHaz = (b) => b.k !== 1;
  function findCorner(C, P) {
    for (let i = P.ci - 1; i <= P.ci + 1; i++) {
      const ch = C.get(i);
      if (ch && ch.corner && !ch.corner.used && mod4(ch.corner.H) === mod4(P.H)) return ch.corner;
    }
    return null;
  }
  function doTurn(P, c, f) {
    c.used = true;
    P.H += c.dir;
    const nh = hv(P.H),
      rx = -nh[1],
      rz = nh[0],
      o = (P.x - c.cx) * rx + (P.z - c.cz) * rz;
    if (Math.abs(o) < 7.5) P.dashV = clamp(P.dashV - o * 6, -45, 45);
    P.lat = 0;
    P.turnLock = 0.34;
    P.sinceTurn = 0;
    P.ev.push({t: 'turn', dir: c.dir, perfect: Math.abs(f - c.S / 2) < 2.6});
  }
  function stepP(C, P, dt) {
    const ev = P.ev;
    ev.length = 0;
    if (!P.alive) return;
    C.locate(P);
    const boxes = [];
    for (let i = P.ci - 1; i <= P.ci + 2; i++) {
      const ch = C.get(i);
      if (ch) for (const b of ch.boxes) boxes.push(b);
    }
    P.jumpBuf -= dt;
    P.coyote -= dt;
    P.dashCd -= dt;
    P.turnLock -= dt;
    P.sinceTurn += dt;
    P.slideQ -= dt;
    P.stumbleT -= dt;
    if (P.turnBuf) {
      P.turnBuf.t -= dt;
      if (P.turnBuf.t <= 0) {
        P.turnBuf = null;
        ev.push({t: 'turnmiss'});
      }
    }
    for (const a of P.q) {
      if (a.t === 'jump') P.jumpBuf = 0.17;
      else if (a.t === 'slide') {
        if (P.grounded || P.coyote > 0) {
          if (!P.sliding) {
            P.sliding = true;
            P.slideT = 0.75;
            ev.push({t: 'slide'});
          }
        } else {
          P.vy = Math.min(P.vy, -15);
          P.slideQ = 0.45;
          ev.push({t: 'dive'});
        }
      } else if (a.t === 'dash') {
        if (P.dashCd <= 0) {
          P.dashV = clamp(P.dashV + a.dir * 15, -30, 30);
          P.dashCd = 0.42;
          ev.push({t: 'dash', dir: a.dir});
        }
      } else if (a.t === 'turn') P.turnBuf = {dir: a.dir, t: 0.45};
    }
    P.q.length = 0;
    if (P.turnBuf) {
      const c = findCorner(C, P);
      if (c) {
        if (c.dir !== P.turnBuf.dir) {
          P.turnBuf = null;
          ev.push({
            t: 'turnwrong',
          });
        } else {
          const h = hv(P.H),
            hx = h[0],
            hz = h[1],
            rx = -hz,
            rz = hx,
            f = (P.x - c.tx) * hx + (P.z - c.tz) * hz,
            l = (P.x - c.tx) * rx + (P.z - c.tz) * rz;
          if (f > -0.4 && f < c.S + 1 && Math.abs(l) < c.S / 2 + 1.5) {
            doTurn(P, c, f);
            P.turnBuf = null;
          }
        }
      }
    }
    if (P.jumpBuf > 0 && (P.grounded || P.coyote > 0)) {
      if (P.sliding && !hitB(boxes, P.x, P.y + 0.001, P.z, PH, HW)) {
        P.sliding = false;
        P.slideT = 0;
      }
      if (!P.sliding) {
        P.vy = JV;
        P.grounded = false;
        P.coyote = 0;
        P.jumpBuf = 0;
        ev.push({t: 'jump'});
      }
    }
    if (P.sliding) {
      P.slideT -= dt;
      if (P.slideT <= 0 && !hitB(boxes, P.x, P.y + 0.001, P.z, PH, HW)) P.sliding = false;
    }
    P.ph = P.sliding ? SH : PH;
    P.speed += (P.speedT - P.speed) * (1 - Math.exp(-1.1 * dt));
    // After a turn the steer is normally locked out for a moment; aim assist drives it instead (P.assistOn).
    const st = P.turnLock > 0 && !P.assistOn ? 0 : P.steer,
      kk = P.grounded ? 14 : 6;
    P.lat += (st * LATMAX - P.lat) * (1 - Math.exp(-kk * dt));
    P.dashV *= Math.exp(-6 * dt);
    const h = hv(P.H),
      hx = h[0],
      hz = h[1],
      rx = -hz,
      rz = hx,
      lat = P.lat + P.dashV,
      vx = hx * P.speed + rx * lat,
      vz = hz * P.speed + rz * lat;
    const n = Math.max(1, Math.min(14, Math.ceil((Math.hypot(vx, vz) * dt) / 0.2))),
      sd = dt / n,
      px0 = P.x,
      pz0 = P.z,
      wasG = P.grounded;
    let blockedF = false,
      landV = 0,
      dead = null;
    for (let s = 0; s < n; s++) {
      let nx = P.x + vx * sd,
        b = hitB(boxes, nx, P.y, P.z, P.ph, HW, notHaz);
      if (b) {
        if (b.y1 - P.y <= 0.45 && b.y1 > P.y && !hitB(boxes, nx, b.y1 + 0.002, P.z, P.ph, HW, notHaz))
          P.y = b.y1 + 0.002;
        else {
          nx = vx > 0 ? b.x0 - HW - 1e-4 : b.x1 + HW + 1e-4;
          if (hx !== 0 && vx * hx > 0) blockedF = true;
        }
      }
      P.x = nx;
      let nz = P.z + vz * sd;
      b = hitB(boxes, P.x, P.y, nz, P.ph, HW, notHaz);
      if (b) {
        if (b.y1 - P.y <= 0.45 && b.y1 > P.y && !hitB(boxes, P.x, b.y1 + 0.002, nz, P.ph, HW, notHaz))
          P.y = b.y1 + 0.002;
        else {
          nz = vz > 0 ? b.z0 - HW - 1e-4 : b.z1 + HW + 1e-4;
          if (hz !== 0 && vz * hz > 0) blockedF = true;
        }
      }
      P.z = nz;
      const py = P.y;
      P.vy -= GR * sd;
      P.y += P.vy * sd;
      if (P.vy <= 0) {
        b = hitB(boxes, P.x, P.y, P.z, P.ph, HW, (bb) => bb.k !== 1 || py >= bb.y1 - 0.12);
        if (b) {
          if (P.vy < -5) landV = Math.max(landV, -P.vy);
          P.y = b.y1;
          P.vy = 0;
        }
      } else {
        b = hitB(boxes, P.x, P.y, P.z, P.ph, HW, notHaz);
        if (b) {
          P.y = b.y0 - P.ph - 1e-4;
          P.vy = 0;
        }
      }
      const gb =
        P.vy <= 0
          ? hitB(boxes, P.x, P.y - 0.05, P.z, 0.05, HW - 0.03, (bb) => bb.k !== 1 || P.y >= bb.y1 - 0.12)
          : null;
      P.grounded = !!gb;
      if (gb && gb.k === 2) {
        P.vy = PADV;
        P.y += 0.02;
        P.grounded = false;
        ev.push({
          t: 'pad',
        });
      }
      if (hitB(boxes, P.x, P.y + 0.06, P.z, P.ph - 0.12, HW - 0.06, (bb) => bb.k === 1)) {
        dead = 'hazard';
        break;
      }
    }
    if (P.grounded) {
      P.coyote = 0.12;
      if (!wasG) {
        ev.push({t: 'land', v: landV});
        if (P.slideQ > 0) {
          P.sliding = true;
          P.slideT = 0.75;
          P.slideQ = 0;
          ev.push({t: 'slide'});
        }
      }
    }
    if (blockedF && P.speed > 7 && P.stumbleT <= 0) {
      ev.push({t: 'impact', v: P.speed});
      P.speed = 3;
      P.stumbleT = 0.6;
    }
    P.dist += Math.max(0, (P.x - px0) * hx + (P.z - pz0) * hz);
    if (!dead) {
      let ym = 1e9;
      for (let i = P.ci - 1; i <= P.ci + 2; i++) {
        const ch = C.get(i);
        if (ch) ym = Math.min(ym, ch.ymin);
      }
      if (P.y < ym - 14) dead = 'fall';
    }
    for (let i = P.ci; i <= P.ci + 2; i++) {
      const ch = C.get(i);
      if (!ch) continue;
      for (const g of ch.gates) {
        if (g.done) continue;
        const s = (P.x - g.x) * g.ax + (P.z - g.z) * g.az;
        if (g.prev === undefined) {
          g.prev = s;
          continue;
        }
        if (g.prev < 0 && s >= 0) {
          g.done = true;
          const l = (P.x - g.x) * g.rx + (P.z - g.z) * g.rz,
            yb = P.y + P.ph / 2;
          let ok;
          if (g.need === 'slide') ok = P.sliding;
          else if (g.need === 'air') ok = !P.grounded;
          else ok = Math.abs(l) <= g.hw + 0.45 && Math.abs(yb - g.y) <= g.hh + 0.3;
          ev.push({t: 'gate', ok: ok, need: g.need, vis: g.vis});
        }
        g.prev = s;
      }
    }
    if (dead) {
      P.alive = false;
      ev.push({t: 'die', why: dead});
    }
  }
  function respawn(C, P, cp) {
    P.x = cp.x;
    P.y = cp.y + 0.02;
    P.z = cp.z;
    P.H = cp.H;
    P.vy = 0;
    P.speed = 6;
    P.lat = 0;
    P.dashV = 0;
    P.grounded = false;
    P.sliding = false;
    P.alive = true;
    P.ci = cp.ci;
    P.turnBuf = null;
    P.q.length = 0;
    P.stumbleT = 0;
    P.turnLock = 0.2;
    P.sinceTurn = 0;
    P.dist = cp.dist || 0;
    C.resetFrom(cp.ci);
  }
  // The platform under the player `f` metres ahead: how far its centre is to the right (off, metres) and half its width.
  function groundSpan(C, P, f) {
    const h = hv(P.H),
      hx = h[0],
      hz = h[1],
      rx = -hz,
      rz = hx,
      qx = P.x + hx * f,
      qz = P.z + hz * f;
    let best = null,
      bd = 9;
    for (let i = P.ci - 1; i <= P.ci + 2; i++) {
      const ch = C.get(i);
      if (!ch) continue;
      for (const b of ch.boxes) {
        if (b.k === 1 || qx < b.x0 || qx > b.x1 || qz < b.z0 || qz > b.z1) continue;
        const dy = b.y1 - P.y;
        if (dy > 1.3 || dy < -1.4) continue; // a floor you could be standing on (or about to land on), not a wall
        if (Math.abs(dy) < bd) {
          bd = Math.abs(dy);
          best = b;
        }
      }
    }
    if (!best) return null;
    const a = (best.x0 - P.x) * rx + (best.z0 - P.z) * rz,
      b2 = (best.x1 - P.x) * rx + (best.z1 - P.z) * rz,
      lo = Math.min(a, b2),
      hi = Math.max(a, b2);
    return {off: (lo + hi) / 2, half: (hi - lo) / 2};
  }
  // Aim assist for loose steering (gyro / touch). level 0..1.
  //  - for 0.25 s after a turn (and after a respawn) it steers you onto the middle of the path no matter what the
  //    input says, then hands control back over the next 0.25 s;
  //  - the rest of the time it only pulls you toward the middle as you drift toward an edge.
  function aimAssist(C, P, steer, level) {
    P.assistOn = false;
    if (level <= 0.01 || !P.alive) return steer;
    const g = groundSpan(C, P, clamp(P.speed * 0.2, 2.5, 5));
    if (!g) return steer;
    const e = Math.abs(g.off) < 0.12 ? 0 : g.off,
      toCentre = clamp(e * 0.65, -1, 1),
      edge = clamp((Math.abs(g.off) / Math.max(g.half, 0.5) - 0.3) / 0.6, 0, 1),
      full = Math.min(1, level * 1.5);
    let w = level * 0.85 * edge;
    if (P.sinceTurn < 0.25) w = Math.max(w, full);
    else if (P.sinceTurn < 0.5) w = Math.max(w, full * (1 - (P.sinceTurn - 0.25) / 0.25));
    if (Math.abs(P.dashV) > 4) w *= 0.3; // you meant that dash
    if (w < 0.02) return steer;
    P.assistOn = true;
    return clamp(steer * (1 - w) + toCentre * w, -1, 1);
  }
  return {
    groundSpan: groundSpan,
    aimAssist: aimAssist,
    Course: Course,
    newPlayer: newPlayer,
    stepP: stepP,
    respawn: respawn,
    hv: hv,
    clamp: clamp,
  };
})();

if (typeof module !== 'undefined') module.exports = CORE;
