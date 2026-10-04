'use strict';
// Gyro: pose-independent motion input.
//
// Everything is measured in the PHONE's own frame (x = right of screen, y = top, z = out of screen), relative to a
// "neutral" pose: the player's stance, which the engine keeps re-estimating. World heading and gravity never decide a
// gesture, so it works the same standing up, sitting, or lying in bed holding the phone over your face.
//
//   turn  = rotation about the player's wrist-twist axis  (t)
//   lift  = rotation about the flick-up/down axis          (f)
//   tilt  = rotation about the key-in-a-lock axis          (d = f x t)
//
// t and f are found by a short "spin it" calibration (see calBegin / calBeat / calSolve).
//
// Telemetry (orient / motion): the orientation sensor says where the phone points, the gyro says how it actually
// moved, the accelerometer says which way is down and whether the whole body is moving. Once the gyro has been checked
// against the orientation stream it drives the engine, so compass corrections and reference drift never read as input.
//
// Stance (every sample): a flick is an out-and-back wrist move. While it is out the neutral is frozen; when the hand
// comes to rest, wherever it rests is the new neutral. Between moves the neutral leaks toward the current pose: lift
// and tilt straight away (they are only ever flicked), twist only once a lean has been held longer than any steer
// needs (steering moves you sideways, nobody holds one for long). Coming back after holding a flick out is not a new
// move: it only counts once it carries the phone past where the flick started.
const Gyro = (() => {
  const R2D = 180 / Math.PI,
    D2R = Math.PI / 180,
    clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
    sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    vlen = (a) => Math.hypot(a[0], a[1], a[2]),
    vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    vnorm = (a) => {
      const l = vlen(a) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    };
  // quaternions are [x, y, z, w]
  const qmul = (a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ],
    qconj = (q) => [-q[0], -q[1], -q[2], q[3]],
    qnorm = (q) => {
      const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
    },
    qaxis = (ax, ang) => {
      const s = Math.sin(ang / 2);
      return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
    };
  // W3C DeviceOrientation: R = Rz(alpha) * Rx(beta) * Ry(gamma), degrees in, device->earth quaternion out.
  function fromEuler(alpha, beta, gamma) {
    return qmul(
      qmul(qaxis([0, 0, 1], alpha * D2R), qaxis([1, 0, 0], beta * D2R)),
      qaxis([0, 1, 0], gamma * D2R),
    );
  }
  // shortest-arc rotation vector in radians
  function rotvec(q) {
    if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
    const s = Math.hypot(q[0], q[1], q[2]);
    if (s < 1e-9) return [0, 0, 0];
    const ang = 2 * Math.atan2(s, q[3]);
    return [(q[0] / s) * ang, (q[1] / s) * ang, (q[2] / s) * ang];
  }

  const DEF_CAL = {t: [0, 1, 0], f: [1, 0, 0], d: [0, 0, 1], amp: 40, ok: false};
  // steer = steer gain (the game's), auto = how fast the neutral follows your stance (0 = only after moves)
  const cfg = {sens: 1, steer: 1, auto: 1, invertLift: false, invertDash: false, cornerNear: false};
  const st = {
    cal: Object.assign({}, DEF_CAL),
    qn: null,
    qLast: null,
    ang: [0, 0, 0],
    hist: [], // [t, q] for the last 0.4 s
    speed: 0, // deg/s
    active: false,
    flick: null, // the move being resolved: {axis, sign, t0, tb, peak, still, rest, phase: out | back | home, pre}
    home: null, // where the last move started: {q, axis, until (no reverse move before), mag (snap back to it before)}
    hold: 0, // how long the twist has leaned the same way
    holdSign: 0,
    follow: 0, // deg/s the neutral is moving to follow your stance (gesture lab)
    lockUntil: 0,
    liftLock: 0,
    holdUntil: 0,
    holdVal: 0,
    lastT: 0,
    nFeed: 0,
    calS: null,
    onGesture: null,
  };

  function thresholds() {
    const sc = clamp(st.cal.amp / 40, 0.55, 1.1),
      k = Math.max(0.2, cfg.sens);
    return [((cfg.cornerNear ? 18 : 30) * sc) / k, (11 * sc) / k, (14 * sc) / k];
  }
  const AX = () => [st.cal.t, st.cal.f, st.cal.d];
  // a rotation vector (radians, device frame) -> degrees about the three body axes
  const onAxes = (r) => {
    const A = AX();
    return [dot(r, A[0]) * R2D, dot(r, A[1]) * R2D, dot(r, A[2]) * R2D];
  };
  const offset = (q) => onAxes(rotvec(qmul(qconj(st.qn), q))), // pose q relative to the neutral
    delta = (q0, q1) => onAxes(rotvec(qmul(qconj(q0), q1))); // how far the wrist turned from q0 to q1

  // Move the neutral by c degrees about the body axes (c = the current offset re-zeroes completely).
  function shift(c) {
    const A = AX(),
      v = vadd(vadd(vmul(A[0], c[0]), vmul(A[1], c[1])), vmul(A[2], c[2])),
      l = vlen(v);
    if (l < 1e-6) return;
    st.qn = qnorm(qmul(st.qn, qaxis(vmul(v, 1 / l), l * D2R)));
    st.ang = offset(st.qLast);
  }
  function neutral() {
    st.qn = st.qLast;
    st.ang = [0, 0, 0];
    st.hist.length = 0;
    st.flick = null;
    st.home = null;
    st.hold = 0;
    st.holdUntil = 0;
    st.lockUntil = 0;
  }

  // The move is over and the hand has stopped: wherever it rests is the new neutral.
  function finish(t, stayed) {
    const f = st.flick;
    st.flick = null;
    if (!f) return;
    st.hist = st.hist.slice(-1); // the move is spent: none of it counts toward the next one
    const a = st.ang;
    if (f.axis === 0) shift(a);
    // a flick up/down or a tilt: re-zero those, and take back only the twist the flick dragged along with it (the lean
    // you had before it is yours, but the hand settling somewhere else is not)
    else shift([t - f.t0 < 0.7 ? clamp(a[0] - f.pre, -8, 8) : 0, a[1], a[2]]);
    if (st.home) {
      st.home.until = t + (stayed ? 2.5 : 0.4);
      st.home.mag = t + 3;
    }
  }

  const newFlick = (axis, sign, t, phase, peak, pre) => ({axis, sign, t0: t, tb: t, peak, still: 0, rest: 0, phase, pre});
  function fire(i, sign, t, from) {
    let g;
    if (i === 0) g = {t: 'turn', dir: sign};
    else if (i === 1) {
      if (t < st.liftLock) return false;
      st.liftLock = t + 0.45;
      g = (sign > 0) !== cfg.invertLift ? {t: 'jump'} : {t: 'slide'};
    } else g = {t: 'dash', dir: (sign < 0 ? 1 : -1) * (cfg.invertDash ? -1 : 1)};
    // a move on another axis while one is resolving: a turn keeps going (it re-zeroes everything when it ends),
    // anything else settles where it is
    const keep = st.flick && st.flick.axis === 0 && i !== 0;
    if (st.flick && !keep) finish(t, false);
    st.lockUntil = t + 0.14;
    if (!keep) st.flick = newFlick(i, sign, t, 'out', Math.abs(st.ang[i]), offset(from)[0]);
    st.home = {q: from, axis: i, until: Infinity, mag: Infinity};
    if (i !== 0) {
      st.holdUntil = t + 0.22;
      st.holdVal = st.ang[0];
    }
    if (st.onGesture) st.onGesture(g);
    return true;
  }
  // has the phone gone past where the last move on axis i started, far enough to be a new move?
  const passed = (i, sign, thr) => !!st.home && (st.ang[i] - offset(st.home.q)[i]) * sign >= 0.6 * thr[i];

  // Between moves: the neutral leaks toward wherever the phone is being held.
  function track(a, dt, t) {
    // the hand drifted back to where it was before the last move: that is still the stance
    const hm = st.home;
    if (hm && t < hm.mag && st.speed < 30) {
      const ho = offset(hm.q),
        lh = vlen(ho);
      if (lh > 4 && vlen(vsub(a, ho)) < Math.max(3, 0.3 * lh)) {
        shift(a);
        st.home = null;
        return;
      }
    }
    const SR = steerRange() / Math.max(0.2, cfg.steer),
      dz = 0.135 * SR, // 1.5x the steer dead zone
      s = Math.sign(a[0]);
    if (Math.abs(a[0]) <= dz || s !== st.holdSign) st.hold = 0;
    else st.hold += dt;
    st.holdSign = s;
    const body = tel.body,
      still = 1 - sstep((st.speed - 25) / (65 + 60 * body)), // only while the hand is quiet: moving it is input
      g = Math.max(0, cfg.auto) * still * (1 + 2 * body); // the whole body shifting: follow it faster
    if (g <= 0) return;
    // twist: leftovers inside the dead zone go at once, a real lean only once it has been held longer than steering
    // ever needs to
    const lt = Math.abs(a[0]) <= dz ? 1.2 : 0.8 * sstep((st.hold - 1.2) / 1.6),
      c = [lt, 1, 1].map((l, i) => a[i] * (1 - Math.exp(-l * g * dt)));
    st.follow = vlen(c) / dt;
    shift(c);
  }

  // One orientation sample for the engine. q = device quaternion, t = seconds. Normally reached through orient() and
  // motion(), which pick the best source; tests drive it directly.
  function feed(q, t) {
    st.qLast = q;
    st.nFeed++;
    if (!st.qn) st.qn = q;
    const dt = clamp(t - (st.lastT || t - 0.016), 1e-3, 0.1);
    st.lastT = t;
    const a = (st.ang = offset(q));
    let h = st.hist;
    h.push([t, q]);
    while (h.length && t - h[0][0] > 0.4) h.shift();
    let s0 = null;
    for (const x of h)
      if (t - x[0] <= 0.09) {
        s0 = x;
        break;
      }
    st.speed =
      s0 && s0 !== h[h.length - 1] ? (vlen(rotvec(qmul(qconj(s0[1]), q))) * R2D) / Math.max(t - s0[0], 1e-3) : 0;
    if (st.calS) st.calS.trace.push([t, q]);
    st.follow = 0;
    if (!st.active) return;
    const thr = thresholds();
    // Resolve the move in progress: out -> back -> at rest, or held out there (that is where the hand lives now).
    const f = st.flick;
    if (f) {
      const av = Math.abs(a[f.axis]);
      f.still = st.speed < 40 ? f.still + dt : 0;
      f.rest = st.speed < 45 ? f.rest + dt : 0;
      if (f.phase === 'out') {
        f.peak = Math.max(f.peak, av);
        if (t - f.t0 > 0.1 && av <= Math.max(thr[f.axis] * 0.45, 0.35 * f.peak)) {
          f.phase = 'back';
          f.tb = t;
          f.rest = 0;
          st.hist = [h[h.length - 1]]; // the swing back must not count toward the next move
        } else if (t - f.t0 > 1.3 || (t - f.t0 > 0.15 && f.still > 0.4)) finish(t, true);
      } else if (f.phase === 'home' && passed(f.axis, f.sign, thr)) {
        // it was not just the way back after all: it went past where it started
        st.flick = null;
        if (!fire(f.axis, f.sign, t, st.home.q)) st.flick = f;
      }
      if (st.flick === f && f.phase !== 'out' && (f.rest >= 0.05 || t - f.tb > (f.phase === 'home' ? 1 : 0.45)))
        finish(t, false);
    } else track(a, dt, t);
    if (t < st.lockUntil) return;
    h = st.hist; // the swing back may have swapped the history
    let o = null;
    for (const x of h)
      if (t - x[0] <= 0.22) {
        o = x;
        break;
      }
    if (!o || o === h[h.length - 1]) return;
    const d = delta(o[1], q),
      sc = [Math.abs(d[0]) / thr[0], Math.abs(d[1]) / thr[1], Math.abs(d[2]) / thr[2]];
    let i = 0;
    if (sc[1] > sc[i]) i = 1;
    if (sc[2] > sc[i]) i = 2;
    const m = sc[i];
    if (m < 1) return;
    const sign = d[i] > 0 ? 1 : -1,
      fl = st.flick;
    // that axis is busy while it is out. On the way back another move the same way counts, the other way only if it
    // is strong; on the way home after a hold, only a move back out counts.
    if (fl && fl.axis === i) {
      if (fl.phase === 'out') return;
      if (fl.phase === 'back' && fl.sign !== sign && m < 1.8) return;
      if (fl.phase === 'home' && fl.sign === sign) return;
    }
    let second = 0;
    for (let k = 0; k < 3; k++) if (k !== i) second = Math.max(second, sc[k]);
    if (second > m * 0.85 && m < 1.8) return; // ambiguous diagonal: wait for it to resolve
    // heading back to where the last move on this axis started: that is the way home, not a new move
    const hm = st.home;
    if (hm && hm.axis === i && t < hm.until) {
      const ho = offset(hm.q)[i];
      if (Math.sign(ho) === sign && Math.abs(ho) > 0.4 * thr[i] && !passed(i, sign, thr)) {
        if (!st.flick) st.flick = newFlick(i, sign, t, 'home', 0, a[0]);
        return;
      }
    }
    fire(i, sign, t, o[1]);
  }

  // ---- telemetry ------------------------------------------------------------------------------------------------
  const fit0 = () => ({d: 0, g: 0, o: 0, n: 0});
  const tel = {};
  const resetTel = () =>
    Object.assign(tel, {
      src: '', // what feeds the engine: 'orient' or 'gyro'
      qo: null, // last orientation sample
      tO: 0,
      ws: [0, 0, 0], // gyro readings since then (sum, count)
      wn: 0,
      qg: null, // gyro attitude, integrated
      tM: 0, // last gyro sample
      mdt: 0.016, // smoothed gyro interval
      sc: 0, // gyro deg/s per reported unit: 1 (the spec), 57.3 (rad/s browsers), negative if mirrored, 0 = unproven
      fo: fit0(), // gyro fitted against the orientation stream ...
      fg: fit0(), // ... or, with no orientation stream, against gravity turning in the phone's frame
      gh: [], // recent [t, gravity direction, gyro]
      gd: null, // gravity direction, device frame
      lin: 0, // linear acceleration, m/s^2
      body: 0, // 0..1: the whole body is moving, not just the wrist
    });
  resetTel();
  // least squares ref ~ k * raw, forgetting old samples
  function fitAdd(F, ref, raw) {
    F.d = F.d * 0.985 + dot(ref, raw);
    F.g = F.g * 0.985 + dot(raw, raw);
    F.o = F.o * 0.985 + dot(ref, ref);
    F.n++;
  }
  function judge() {
    const F = tel.fo.n >= 20 ? tel.fo : !tel.qo && tel.fg.n >= 40 ? tel.fg : null;
    if (!F || !(F.g > 0)) return;
    const k = F.d / F.g,
      c = F.d / Math.sqrt(F.g * F.o || 1),
      unit = Math.abs(k) > 8 ? R2D : 1;
    if (Math.abs(c) > (F === tel.fo ? 0.85 : 0.5) && Math.abs(Math.abs(k) / unit - 1) < 0.3 && tel.mdt < 0.04)
      tel.sc = Math.sign(k) * unit;
    else if (F === tel.fo && Math.abs(c) < 0.7) tel.sc = 0;
  }
  // The orientation stream takes over from the gyro: move every stored pose by the drift between the two, so the
  // handover is not a move.
  function rebase(q) {
    const J = qmul(q, qconj(st.qLast)),
      L = (x) => qmul(J, x);
    st.qn = L(st.qn);
    for (const h of st.hist) h[1] = L(h[1]);
    if (st.home) st.home.q = L(st.home.q);
    if (st.calS) for (const x of st.calS.trace) x[1] = L(x[1]);
  }
  // deviceorientation: q = fromEuler(alpha, beta, gamma)
  function orient(q, t) {
    const po = tel.qo,
      pt = tel.tO;
    tel.qo = q;
    tel.tO = t;
    if (po && tel.wn && t - pt > 0.004 && t - pt < 0.15) {
      const wo = vmul(rotvec(qmul(qconj(po), q)), R2D / (t - pt)),
        wg = vmul(tel.ws, 1 / tel.wn),
        lo = vlen(wo);
      // a jump the gyro did not feel (compass correction, Euler flip) says nothing about the gyro: skip it
      const glitch = lo > 2500 || (tel.sc && vlen(vsub(wo, vmul(wg, tel.sc))) > Math.max(150, 0.8 * lo));
      if (lo > 40 && !glitch) {
        fitAdd(tel.fo, wo, wg);
        judge();
      }
    }
    tel.ws = [0, 0, 0];
    tel.wn = 0;
    if (tel.sc && t - tel.tM < 0.2) return; // the gyro is driving
    if (tel.src === 'gyro' && st.qLast) rebase(q);
    tel.src = 'orient';
    feed(q, t);
  }
  // devicemotion: w = rotationRate as [beta, gamma, alpha] (about device x, y, z), lin = acceleration,
  // g = accelerationIncludingGravity. Any of them may be null.
  function motion(w, lin, g, t) {
    const dt = clamp(t - (tel.tM || t - 0.016), 0, 0.1);
    if (g) {
      const gl = vlen(g);
      if (gl > 2) {
        const gd = vmul(g, 1 / gl),
          la = lin ? vlen(lin) : Math.abs(gl - 9.81);
        tel.lin = la;
        tel.body += (sstep((la - 0.8) / 1.7) - tel.body) * (1 - Math.exp(-Math.max(dt, 0.008) / 0.35));
        // no orientation stream: check the gyro against gravity turning in the phone's frame, dg/dt = g x w
        if (w && !tel.qo && Math.abs(gl - 9.81) < 1.5) {
          const gh = tel.gh;
          gh.push([t, gd, w]);
          while (gh.length && t - gh[0][0] > 0.1) gh.shift();
          const o = gh[0];
          if (t - o[0] > 0.05) {
            let wa = [0, 0, 0];
            for (const x of gh) wa = vadd(wa, x[2]);
            const gdot = vmul(vsub(gd, o[1]), R2D / (t - o[0]));
            if (vlen(gdot) > 20) {
              fitAdd(tel.fg, gdot, cross(vnorm(vadd(gd, o[1])), vmul(wa, 1 / gh.length)));
              judge();
            }
          }
        }
        tel.gd = gd;
      }
    } else if (lin) {
      tel.lin = vlen(lin);
      tel.body += (sstep((tel.lin - 0.8) / 1.7) - tel.body) * (1 - Math.exp(-Math.max(dt, 0.008) / 0.35));
    }
    if (!w) return;
    tel.ws = vadd(tel.ws, w);
    tel.wn++;
    if (dt > 0) tel.mdt += (dt - tel.mdt) * 0.1;
    tel.tM = t;
    // a phone with no orientation stream at all: trust the spec's deg/s until gravity says otherwise
    const sc = tel.sc || (tel.qo ? 0 : 1);
    if (!sc) return;
    if (tel.src !== 'gyro') {
      tel.qg = st.qLast || tel.qo || [0, 0, 0, 1];
      tel.src = 'gyro';
    }
    const wv = vmul(w, sc * D2R),
      l = vlen(wv);
    if (l > 1e-9) tel.qg = qnorm(qmul(tel.qg, qaxis(vmul(wv, 1 / l), l * dt)));
    feed(tel.qg, t);
  }

  // Steering angle in degrees (+ = twisted left). Zero while a turn is resolving, held briefly after other flicks.
  function steerDeg(t) {
    if (st.flick && st.flick.axis === 0) return 0;
    if (t < st.holdUntil) return st.holdVal;
    return st.ang[0];
  }
  function steerRange() {
    return clamp(st.cal.amp * 0.7, 12, 30);
  }
  // 0..1+ progress toward each gesture's trigger, for the live meters
  function meters(t) {
    const h = st.hist,
      thr = thresholds();
    let o = null;
    for (const x of h)
      if (t - x[0] <= 0.22) {
        o = x;
        break;
      }
    if (!o || !st.qLast) return [0, 0, 0];
    const d = delta(o[1], st.qLast);
    return [Math.abs(d[0]) / thr[0], Math.abs(d[1]) / thr[1], Math.abs(d[2]) / thr[2]];
  }

  // ---- calibration: "spin it" -------------------------------------------------------------------------------
  // The player twists the phone back and forth on a beat (LEFT / RIGHT, then UP / DOWN). Each beat's net rotation
  // vector, signed by the instructed direction, adds up to the axis they actually move around.
  function calBegin() {
    st.calS = {q0: null, trace: [], beats: []};
  }
  function calBeat(sign, t) {
    if (st.calS) st.calS.beats.push({t: t, sign: sign});
  }
  function traceAt(trace, t) {
    let best = trace[0];
    for (const x of trace) {
      if (Math.abs(x[0] - t) < Math.abs(best[0] - t)) best = x;
      if (x[0] > t) break;
    }
    return best ? best[1] : [0, 0, 0];
  }
  function calSolve(endT) {
    const s = st.calS;
    st.calS = null;
    if (!s || !s.trace.length || s.beats.length < 2) return {ok: false, reason: 'nodata'};
    const B = s.beats,
      n = B.length,
      t0 = B[0].t;
    // Measure everything relative to the resting pose just before the first beat, not the pose when recording began:
    // the player may still be coming back from a previous step, and a big offset skews rotation vectors.
    let qref = s.trace[0][1];
    for (const x of s.trace) {
      if (x[0] > t0 - 0.3) break;
      qref = x[1];
    }
    const tr = s.trace.map((x) => [x[0], rotvec(qmul(qconj(qref), x[1]))]);
    // Sign comes from the first move. The player is at rest until the first prompt, so the first real rotation
    // after it can only be the instructed direction, whatever their reaction time.
    const rest = traceAt(tr, t0 - 0.3);
    let s0 = null;
    for (const x of tr) {
      if (x[0] < t0 - 0.3) continue;
      if (x[0] > t0 + 1.3) break;
      if (vlen(vsub(x[1], rest)) > 0.087) {
        s0 = vsub(traceAt(tr, x[0] + 0.15), rest);
        break;
      }
    }
    if (!s0) return {ok: false, reason: 'small'};
    // Axis and range come from whichever lag lines the beat windows up best with the player's actual rhythm.
    let best = null;
    for (let lag = -0.5; lag <= 0.801; lag += 0.05) {
      let m = [0, 0, 0];
      const ds = B.map((b, i) => {
        const d = vsub(traceAt(tr, (B[i + 1] ? B[i + 1].t : endT) + lag), traceAt(tr, b.t + lag));
        m = vadd(m, vmul(d, b.sign));
        return d;
      });
      const mag = vlen(m);
      if (!best || mag > best.mag) best = {mag: mag, m: m, ds: ds};
    }
    if ((best.mag * R2D) / n < 14) return {ok: false, reason: 'small', mag: (best.mag * R2D) / n};
    let axis = vnorm(best.m);
    if (dot(axis, s0) < 0) axis = vmul(axis, -1);
    // Rhythm check: moves that follow the beat add up. Thrashing around does not.
    let total = 0;
    for (const d of best.ds) total += vlen(d);
    if (best.mag / Math.max(total, 1e-9) < 0.62) return {ok: false, reason: 'messy', coherence: best.mag / total};
    let agree = 0;
    const mags = [];
    best.ds.forEach((d, i) => {
      const dm = vlen(d) * R2D;
      if (i > 0) mags.push(dm);
      if (dm >= 10 && Math.abs(dot(vnorm(d), axis)) > 0.5) agree++;
    });
    if (agree / n < 0.6) return {ok: false, reason: 'messy', agree: agree / n};
    mags.sort((x, y) => x - y);
    const med = mags.length ? mags[mags.length >> 1] : (best.mag * R2D) / n;
    return {ok: true, axis: axis, amp: clamp(med / 2, 10, 70), agree: agree / n};
  }
  // Build the full axis set from the two solved axes.
  function setCal(turnAxis, liftAxis, amp) {
    const t = vnorm(turnAxis);
    let f = vsub(liftAxis, vmul(t, dot(liftAxis, t)));
    if (vlen(f) < 0.3) {
      // flick axis too close to the twist axis: use whichever device axis is least aligned with it
      const cand = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ].sort((p, q) => Math.abs(dot(p, t)) - Math.abs(dot(q, t)))[0];
      f = vsub(cand, vmul(t, dot(cand, t)));
    }
    f = vnorm(f);
    const d = vnorm(cross(f, t));
    st.cal = {t: t, f: f, d: d, amp: clamp(amp || 40, 10, 70), ok: true};
    neutral();
    return st.cal;
  }
  function loadCal(c) {
    if (c && c.t && c.f && c.d && c.t.length === 3) {
      st.cal = {t: c.t, f: c.f, d: c.d, amp: clamp(+c.amp || 40, 10, 70), ok: true};
      return true;
    }
    return false;
  }
  function resetCal() {
    st.cal = Object.assign({}, DEF_CAL);
    neutral();
  }

  return {
    st: st,
    cfg: cfg,
    tel: tel,
    fromEuler: fromEuler,
    rotvec: rotvec,
    qmul: qmul,
    qconj: qconj,
    qaxis: qaxis,
    feed: feed,
    orient: orient,
    motion: motion,
    resetTel: resetTel,
    neutral: neutral,
    steerDeg: steerDeg,
    steerRange: steerRange,
    meters: meters,
    thresholds: thresholds,
    calBegin: calBegin,
    calBeat: calBeat,
    calSolve: calSolve,
    setCal: setCal,
    loadCal: loadCal,
    resetCal: resetCal,
    get cal() {
      return st.cal;
    },
  };
})();
if (typeof module !== 'undefined') module.exports = Gyro;
