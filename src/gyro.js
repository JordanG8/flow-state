'use strict';
// Gyro: pose-independent motion input.
//
// Everything is measured in the PHONE's own frame (x = right of screen, y = top, z = out of screen), relative to a
// "neutral" pose that the game keeps re-zeroing. World heading and gravity are never used, so it works the same
// standing up, sitting, or lying in bed holding the phone over your face.
//
//   turn  = rotation about the player's wrist-twist axis  (t)
//   lift  = rotation about the flick-up/down axis          (f)
//   tilt  = rotation about the key-in-a-lock axis          (d = f x t)
//
// t and f are found by a short "spin it" calibration (see calBegin / calBeat / calSolve). Each flick is an
// out-and-back wrist move: after one fires we wait for the phone to come back (or settle somewhere new) and re-zero
// that axis, so nobody ever has to end up facing another direction.
const Gyro = (() => {
  const R2D = 180 / Math.PI,
    D2R = Math.PI / 180,
    clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
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
  const cfg = {sens: 1, invertLift: false, invertDash: false, cornerNear: false};
  const st = {
    cal: Object.assign({}, DEF_CAL),
    qn: null,
    qLast: null,
    ang: [0, 0, 0],
    hist: [],
    speed: 0,
    active: false,
    flick: null,
    lastFlick: null,
    lockUntil: 0,
    liftLock: 0,
    holdUntil: 0,
    holdVal: 0,
    lastT: 0,
    calS: null,
    onGesture: null,
  };

  function thresholds() {
    const sc = clamp(st.cal.amp / 40, 0.55, 1.1),
      k = Math.max(0.2, cfg.sens);
    return [((cfg.cornerNear ? 18 : 30) * sc) / k, (11 * sc) / k, (14 * sc) / k];
  }
  const AX = () => [st.cal.t, st.cal.f, st.cal.d];

  // Move the neutral pose forward by `deg` about axis i, and keep history continuous.
  function rezero(i, deg) {
    st.qn = qmul(st.qn, qaxis(AX()[i], deg * D2R));
    st.ang[i] -= deg;
    for (const h of st.hist) h[i + 1] -= deg;
  }
  function neutral() {
    st.qn = st.qLast;
    st.ang = [0, 0, 0];
    st.hist.length = 0;
    st.flick = null;
    st.lastFlick = null;
    st.holdUntil = 0;
    st.lockUntil = 0;
  }

  function endFlick(reason, t) {
    const f = st.flick;
    if (!f) return;
    if (reason !== 'returned') rezero(f.axis, st.ang[f.axis]);
    else if (st.hist.length) st.hist = [st.hist[st.hist.length - 1]]; // the swing back must not count toward the next move
    st.lastFlick = {axis: f.axis, sign: f.sign, t: t};
    st.flick = null;
  }

  function fire(i, sign, t) {
    let g;
    if (i === 0) g = {t: 'turn', dir: sign};
    else if (i === 1) {
      if (t < st.liftLock) return false;
      st.liftLock = t + 0.45;
      g = (sign > 0) !== cfg.invertLift ? {t: 'jump'} : {t: 'slide'};
    } else g = {t: 'dash', dir: (sign < 0 ? 1 : -1) * (cfg.invertDash ? -1 : 1)};
    st.lockUntil = t + 0.14;
    st.flick = {axis: i, sign: sign, t0: t, peak: Math.abs(st.ang[i]), still: 0, lastT: t};
    if (i !== 0) {
      st.holdUntil = t + 0.22;
      st.holdVal = st.ang[0];
    }
    if (st.onGesture) st.onGesture(g);
    return true;
  }

  // One orientation sample. q = device quaternion (fromEuler), t = seconds.
  function feed(q, t) {
    st.qLast = q;
    if (!st.qn) st.qn = q;
    const dt = Math.max(1e-3, t - (st.lastT || t - 0.016));
    st.lastT = t;
    const r = rotvec(qmul(qconj(st.qn), q)),
      A = AX(),
      a = [dot(r, A[0]) * R2D, dot(r, A[1]) * R2D, dot(r, A[2]) * R2D];
    st.ang = a;
    let h = st.hist;
    h.push([t, a[0], a[1], a[2]]);
    while (h.length && t - h[0][0] > 0.4) h.shift();
    let s0 = null;
    for (const x of h)
      if (t - x[0] <= 0.09) {
        s0 = x;
        break;
      }
    st.speed =
      s0 && s0 !== h[h.length - 1] ? Math.hypot(a[0] - s0[1], a[1] - s0[2], a[2] - s0[3]) / Math.max(t - s0[0], 1e-3) : 0;
    if (st.calS) {
      const c = st.calS;
      if (!c.q0) c.q0 = q;
      c.trace.push([t, rotvec(qmul(qconj(c.q0), q))]);
    }
    if (!st.active) return;
    const thr = thresholds();
    // Resolve a flick in progress: wait for the wrist to come back, or to settle somewhere new.
    const f = st.flick;
    if (f) {
      const av = Math.abs(a[f.axis]);
      f.peak = Math.max(f.peak, av);
      f.still = st.speed < 40 ? f.still + dt : 0;
      if (t - f.t0 > 0.1 && av <= Math.max(thr[f.axis] * 0.45, 0.35 * f.peak)) endFlick('returned', t);
      else if (t - f.t0 > 1.3) endFlick('timeout', t);
      else if (t - f.t0 > 0.15 && f.still > 0.4) endFlick('stay', t);
    }
    if (t < st.lockUntil) return;
    h = st.hist; // endFlick may have swapped the history
    let o = null;
    for (const x of h)
      if (t - x[0] <= 0.22) {
        o = x;
        break;
      }
    if (!o || o === h[h.length - 1]) return;
    const d = [a[0] - o[1], a[1] - o[2], a[2] - o[3]],
      sc = [Math.abs(d[0]) / thr[0], Math.abs(d[1]) / thr[1], Math.abs(d[2]) / thr[2]];
    let i = 0;
    if (sc[1] > sc[i]) i = 1;
    if (sc[2] > sc[i]) i = 2;
    const m = sc[i];
    if (m < 1) return;
    if (st.flick && st.flick.axis === i) return; // that axis is busy coming back
    const sign = d[i] > 0 ? 1 : -1,
      lf = st.lastFlick;
    if (lf && lf.axis === i && lf.sign !== sign && t - lf.t < 0.4 && m < 1.8) return; // the return swing, not a new move
    let second = 0;
    for (let k = 0; k < 3; k++) if (k !== i) second = Math.max(second, sc[k]);
    if (second > m * 0.85 && m < 1.8) return; // ambiguous diagonal: wait for it to resolve
    fire(i, sign, t);
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
    if (!o) return [0, 0, 0];
    const a = st.ang;
    return [Math.abs(a[0] - o[1]) / thr[0], Math.abs(a[1] - o[2]) / thr[1], Math.abs(a[2] - o[3]) / thr[2]];
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
    const LAG = 0.12;
    let m = [0, 0, 0];
    const ds = [];
    s.beats.forEach((b, i) => {
      const a = traceAt(s.trace, b.t + LAG),
        e = traceAt(s.trace, (s.beats[i + 1] ? s.beats[i + 1].t : endT) + LAG),
        d = vsub(e, a);
      ds.push(d);
      m = vadd(m, vmul(d, b.sign));
    });
    const n = s.beats.length,
      mag = (vlen(m) * R2D) / n;
    if (mag < 14) return {ok: false, reason: 'small', mag: mag};
    const axis = vnorm(m);
    let agree = 0;
    const mags = [];
    s.beats.forEach((b, i) => {
      const dm = vlen(ds[i]) * R2D;
      if (i > 0) mags.push(dm);
      if (dm >= 10 && dot(vnorm(vmul(ds[i], b.sign)), axis) > 0.5) agree++;
    });
    if (agree / n < 0.6) return {ok: false, reason: 'messy', agree: agree / n};
    mags.sort((x, y) => x - y);
    const med = mags.length ? mags[mags.length >> 1] : mag * 2;
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
    fromEuler: fromEuler,
    rotvec: rotvec,
    qmul: qmul,
    qconj: qconj,
    qaxis: qaxis,
    feed: feed,
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
