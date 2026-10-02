'use strict';
const K = {};
const In = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  base: 0,
  got: false,
  perm: 'unknown',
  hist: [],
  gq: [],
  lock: 0,
  pLock: 0,
  mx: 0,
  my: 0,
  ts: 0,
  simTurn: 0,
  simTurnT: 0,
  simYaw: 0,
  steer: 0,
  rel: 0,
  lastG: null,
  cd: {},
};
const modeNow = () => (S.mode === 'auto' ? (In.got ? 'gyro' : isTouch ? 'touch' : 'keys') : S.mode);
{
  const q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2),
    q0 = new THREE.Quaternion(),
    zee = new THREE.Vector3(0, 0, 1),
    v = new THREE.Vector3();
  In.onOrient = (ev) => {
    if (ev.beta == null || ev.alpha == null || ev.gamma == null) {
      In.nullCount++;
      return;
    }
    In.got = true;
    const o = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R;
    e.set(ev.beta * D2R, ev.alpha * D2R, -ev.gamma * D2R, 'YXZ');
    q.setFromEuler(e);
    q.multiply(q1);
    q.multiply(q0.setFromAxisAngle(zee, -o));
    v.set(0, 0, -1).applyQuaternion(q);
    const yaw = Math.atan2(-v.x, -v.z) * R2D,
      pitch = Math.asin(clamp(v.y, -1, 1)) * R2D;
    v.set(1, 0, 0).applyQuaternion(q);
    const roll = Math.asin(clamp(v.y, -1, 1)) * R2D;
    {
      const tt = performance.now() / 1e3;
      In.evCount++;
      In.evT = tt;
      In.raw = [ev.alpha, ev.beta, ev.gamma];
      In.evTimes.push(tt);
      while (In.evTimes.length && tt - In.evTimes[0] > 1) In.evTimes.shift();
      In.rh.push([tt, yaw, pitch, roll]);
      while (In.rh.length && tt - In.rh[0][0] > 0.7) In.rh.shift();
    }
    if (modeNow() === 'gyro') {
      In.yaw = yaw;
      In.pitch = pitch;
      In.roll = roll;
    } else {
      In.gyroRaw = [yaw, pitch, roll];
    }
  };
}
Object.assign(In, {evCount: 0, nullCount: 0, mCount: 0, evT: 0, raw: [0, 0, 0], evTimes: [], rh: []});
addEventListener('deviceorientation', In.onOrient, true);
addEventListener(
  'devicemotion',
  () => {
    In.mCount++;
  },
  true,
);
In.requestMotion = async () => {
  try {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      In.perm = await DeviceOrientationEvent.requestPermission();
    } else In.perm = 'granted';
  } catch (e) {
    In.perm = 'denied';
  }
};
In.recenter = () => {
  In.base = In.yaw;
};
In.push = (g) => {
  g.time = performance.now() / 1e3;
  In.lastG = g;
  In.gq.push(g);
};
In.turnApplied = (dir) => {
  In.base += 90 * dir;
  if (modeNow() !== 'gyro') In.simTurnT += 90 * dir;
};
In.update = (dt, now, playing, cornerNear) => {
  const m = modeNow();
  if (m !== 'gyro') {
    let s = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    if (m === 'keys') s += clamp(In.mx * 1.2, -1, 1);
    if (m === 'touch') s += In.ts;
    s = clamp(s, -1, 1);
    In.simYaw = damp(In.simYaw, -s * (28 / S.steer), 12, dt);
    In.simTurn = damp(In.simTurn, In.simTurnT, 14, dt);
    In.yaw = In.simTurn + In.simYaw;
    In.pitch = damp(In.pitch, -In.my * 14, 8, dt);
    In.roll = damp(In.roll, 0, 8, dt);
    return;
  }
  const h = In.hist;
  h.push([now, In.yaw, In.pitch, In.roll]);
  while (h.length && now - h[0][0] > 0.7) h.shift();
  let o = null;
  for (let i = 0; i < h.length; i++)
    if (now - h[i][0] <= 0.25) {
      o = h[i];
      break;
    }
  if (!o || now < In.lock) return;
  const k = S.sens,
    dy = wrap180(In.yaw - o[1]),
    dp = (In.pitch - o[2]) * (S.invertPitch ? -1 : 1),
    dr = wrap180(In.roll - o[3]);
  const sy = Math.abs(dy) / ((cornerNear ? 18 : 30) / k),
    sp = Math.abs(dp) / (11 / k),
    sr = Math.abs(dr) / (14 / k),
    mx = Math.max(sy, sp, sr);
  if (mx < 1) return;
  let g;
  if (mx === sy) g = {t: 'turn', dir: dy > 0 ? 1 : -1};
  else if (mx === sp) g = dp > 0 ? {t: 'jump'} : {t: 'slide'};
  else g = {t: 'dash', dir: dr < 0 ? 1 : -1};
  if ((g.t === 'jump' || g.t === 'slide') && now < In.pLock) return;
  if (g.t === 'jump' || g.t === 'slide') In.pLock = now + 0.45;
  In.lock = now + 0.14;
  h.length = 0;
  In.push(g);
};
In.steerCalc = () => {
  const rel = wrap180(In.yaw - In.base);
  In.rel = rel;
  const SR = 28 / S.steer;
  let x = clamp(-rel / SR, -1, 1);
  const a = Math.abs(x),
    dz = 0.09;
  x = a < dz ? 0 : Math.sign(x) * Math.pow((a - dz) / (1 - dz), 1.2);
  In.steer = x;
};
function act(g) {
  if (game.state === 'playing') In.push(g);
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  K[e.code] = true;
  const c = e.code;
  if (game.state === 'playing') {
    if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') act({t: 'jump'});
    else if (c === 'KeyS' || c === 'ArrowDown' || c === 'ShiftLeft' || c === 'ControlLeft') act({t: 'slide'});
    else if (c === 'KeyQ' || c === 'ArrowLeft') act({t: 'turn', dir: 1});
    else if (c === 'KeyE' || c === 'ArrowRight') act({t: 'turn', dir: -1});
    else if (c === 'KeyZ') act({t: 'dash', dir: -1});
    else if (c === 'KeyC') act({t: 'dash', dir: 1});
    else if (c === 'Escape' || c === 'KeyP') game.pause();
  } else if (game.state === 'paused' && (c === 'Escape' || c === 'KeyP')) game.resume();
});
addEventListener('keyup', (e) => {
  K[e.code] = false;
});
addEventListener('mousemove', (e) => {
  In.mx = (e.clientX / innerWidth - 0.5) * 2;
  In.my = (e.clientY / innerHeight - 0.5) * 2;
});
{
  let sx = 0,
    sy = 0,
    st = 0,
    down = false;
  const cv = $('#gl');
  cv.addEventListener('pointerdown', (e) => {
    down = true;
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
  });
  cv.addEventListener('pointermove', (e) => {
    if (down && modeNow() === 'touch') In.ts = clamp((e.clientX - sx) / 110, -1, 1);
  });
  const up = (e) => {
    if (!down) return;
    down = false;
    In.ts = 0;
    const dx = e.clientX - sx,
      dy = e.clientY - sy,
      dt = performance.now() - st;
    if (modeNow() === 'touch' && dt < 450 && Math.hypot(dx, dy) > 28) {
      if (Math.abs(dx) > Math.abs(dy)) act({t: 'turn', dir: dx < 0 ? 1 : -1});
      else act({t: dy < 0 ? 'jump' : 'slide'});
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
}
