'use strict';
// Input: turns gyro / keyboard+mouse / touch into one stream of gestures (In.gq), a steer value (In.steer) and a
// camera view offset (In.view, In.turnOff). The game never reads devices directly.
const K = {};
const In = {
  got: false,
  perm: 'unknown',
  gq: [], // queued gestures: {t:'turn'|'jump'|'slide'|'dash', dir}
  lastG: null,
  steer: 0, // -1 (left) .. 1 (right)
  view: {yaw: 0, pitch: 0, roll: 0}, // degrees, camera offset relative to the heading
  turnOff: 0, // decaying camera swing after a corner turn
  look: {yaw: 0, pitch: 0}, // desktop mouse-look, relative to the heading
  locked: false, // pointer lock is active
  mouseSpeed: 0, // smoothed mouse speed, for crosshair kick
  lastMouse: 0,
  sm: 0, // smoothed keyboard / touch steer
  ts: 0, // touch drag steer
  evCount: 0,
  nullCount: 0,
  mCount: 0,
  evT: 0,
  raw: [0, 0, 0],
  evTimes: [],
};
// Gyro only drives the game on touch devices; a laptop's tilt sensor must not hijack desktop play.
const modeNow = () => (S.mode === 'auto' ? (In.got && isTouch ? 'gyro' : isTouch ? 'touch' : 'keys') : S.mode);

// ---- gyro -------------------------------------------------------------------------------------------------
try {
  Gyro.loadCal(JSON.parse(localStorage.getItem('fs_gyro') || 'null'));
} catch (e) {}
In.saveCal = () => {
  try {
    const c = Gyro.cal;
    localStorage.setItem('fs_gyro', JSON.stringify({t: c.t, f: c.f, d: c.d, amp: c.amp}));
  } catch (e) {}
};
In.onOrient = (ev) => {
  if (ev.beta == null || ev.alpha == null || ev.gamma == null) {
    In.nullCount++;
    return;
  }
  In.got = true;
  const t = performance.now() / 1e3;
  In.evCount++;
  In.evT = t;
  In.raw = [ev.alpha, ev.beta, ev.gamma];
  In.evTimes.push(t);
  while (In.evTimes.length && t - In.evTimes[0] > 1) In.evTimes.shift();
  Gyro.feed(Gyro.fromEuler(ev.alpha, ev.beta, ev.gamma), t);
};
Gyro.st.onGesture = (g) => In.push(g);
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

// ---- shared -----------------------------------------------------------------------------------------------
In.push = (g) => {
  g.time = performance.now() / 1e3;
  In.lastG = g;
  In.gq.push(g);
};
// Hard reset to "facing straight down the course": new run, respawn, restart. Every bit of view state goes to zero
// together so the camera can never come back rotated (it used to keep a stale base angle in keys/touch mode).
In.reset = () => {
  In.turnOff = 0;
  In.view.yaw = In.view.pitch = In.view.roll = 0;
  In.look.yaw = In.look.pitch = 0;
  In.steer = 0;
  In.sm = 0;
  In.gq.length = 0;
  Gyro.neutral();
};
// Soft recentre (resume from pause): only the gyro neutral moves.
In.recenter = () => {
  Gyro.neutral();
  In.steer = 0;
};
In.turnApplied = (dir) => {
  In.turnOff -= 90 * dir; // the world just rotated 90; swing the camera round to it
};
const shape = (x) => {
  const a = Math.abs(x),
    dz = 0.09;
  return a < dz ? 0 : Math.sign(x) * Math.pow((a - dz) / (1 - dz), 1.2);
};
In.update = (dt, now, playing, cornerNear) => {
  const m = modeNow();
  Gyro.cfg.sens = S.sens;
  Gyro.cfg.invertLift = !!S.invertPitch;
  Gyro.cfg.invertDash = !!S.invertDash;
  Gyro.cfg.cornerNear = !!cornerNear;
  const st = game.state;
  Gyro.st.active = m === 'gyro' && !Gyro.st.calS && (st === 'playing' || st === 'paused' || st === 'settings' || st === 'calib');
  In.turnOff = damp(In.turnOff, 0, 14, dt);
  const V = In.view;
  if (m === 'gyro') {
    const sd = Gyro.steerDeg(now),
      SR = Gyro.steerRange() / S.steer;
    In.steer = shape(clamp(-sd / SR, -1, 1));
    const a = Gyro.st.ang;
    V.yaw = damp(V.yaw, clamp(sd, -45, 45), 22, dt);
    V.pitch = damp(V.pitch, clamp(a[1], -40, 50), 22, dt);
    V.roll = damp(V.roll, clamp(a[2], -40, 40), 22, dt);
    return;
  }
  const s = clamp((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + (m === 'touch' ? In.ts : 0), -1, 1);
  In.sm = damp(In.sm, s, 12, dt);
  In.steer = shape(In.sm);
  if (m === 'touch') {
    // the whole view leans with the finger, like tilting a phone
    V.yaw = -In.sm * (28 / S.steer);
    V.pitch = damp(V.pitch, 0, 8, dt);
  } else {
    if (S.recentre && now - In.lastMouse > 0.8) {
      In.look.yaw = damp(In.look.yaw, 0, 2.5, dt);
      In.look.pitch = damp(In.look.pitch, 0, 2.5, dt);
    }
    V.yaw = In.look.yaw - In.sm * 7;
    V.pitch = In.look.pitch;
  }
  V.roll = damp(V.roll, 0, 8, dt);
  In.mouseSpeed = damp(In.mouseSpeed, 0, 10, dt);
};

// ---- keyboard / mouse -------------------------------------------------------------------------------------
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
    else if (c === 'KeyV') game.toggleView();
    else if (c === 'Escape' || c === 'KeyP') game.pause();
  } else if (game.state === 'paused' && (c === 'Escape' || c === 'KeyP')) game.resume();
});
addEventListener('keyup', (e) => {
  K[e.code] = false;
});
addEventListener('blur', () => {
  for (const k in K) K[k] = false;
});

// pointer lock: the mouse becomes the camera while you run
In.lockFails = 0; // if the browser keeps refusing pointer lock, stop insisting
In.canLock = () =>
  modeNow() === 'keys' && S.lockMouse !== false && In.lockFails < 3 && !!document.documentElement.requestPointerLock;
In.lock = () => {
  const cv = $('#gl');
  if (!In.canLock() || document.pointerLockElement === cv) return;
  try {
    const p = cv.requestPointerLock({unadjustedMovement: true}); // raw input: no OS mouse acceleration
    if (p && p.catch)
      p.catch(() => {
        try {
          cv.requestPointerLock();
        } catch (e) {}
      });
  } catch (e) {
    try {
      cv.requestPointerLock();
    } catch (e2) {}
  }
};
In.unlock = () => {
  if (document.pointerLockElement) document.exitPointerLock();
};
document.addEventListener('pointerlockchange', () => {
  In.locked = document.pointerLockElement === $('#gl');
  document.body.classList.toggle('locked', In.locked);
  // Esc (or alt-tab) drops the lock: that is the pause button.
  if (!In.locked && game.state === 'playing') game.pause();
});
document.addEventListener('pointerlockerror', () => {
  In.lockFails++;
});
document.addEventListener('mousemove', (e) => {
  if (!In.locked || game.state !== 'playing') return;
  const dx = e.movementX || 0,
    dy = e.movementY || 0;
  if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // spurious spike some browsers emit when the lock engages
  const k = 0.09 * S.msens;
  In.look.yaw = clamp(In.look.yaw - dx * k, -110, 110);
  In.look.pitch = clamp(In.look.pitch - dy * k * (S.invertY ? -1 : 1), -75, 80);
  In.mouseSpeed = Math.min(1, In.mouseSpeed + Math.hypot(dx, dy) / 140);
  In.lastMouse = performance.now() / 1e3;
});
document.addEventListener('mousedown', (e) => {
  if (!In.locked || game.state !== 'playing') return;
  if (e.button === 0) act({t: 'jump'});
  else if (e.button === 2) act({t: 'slide'});
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ---- touch (when there is no gyro) ------------------------------------------------------------------------
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
