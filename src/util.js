'use strict';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const clamp = CORE.clamp,
  lerp = (a, b, t) => a + (b - a) * t,
  damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const D2R = Math.PI / 180,
  R2D = 180 / Math.PI,
  wrap180 = (a) => {
    a %= 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  };
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const isMobile = isTouch && Math.min(screen.width, screen.height) < 900;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const DEF = {
  sens: 1,
  steer: 1,
  invertPitch: false,
  assist: 0.85, // aim assist for gyro / touch: centres you on the path, hardest right after a turn
  invertDash: false,
  mode: 'auto',
  msens: 1, // mouse look sensitivity
  invertY: false,
  lockMouse: true,
  recentre: false, // ease the view back to centre when the mouse is idle
  crosshair: 'cross', // cross | dot | ring | off
  xhSize: 1,
  xhColor: 'ink', // ink | red | white | auto
  view: 'first', // first | third
  cursorFx: true,
  fov: 88,
  roll: 0.5,
  bob: reduce ? 0.2 : 0.6,
  shake: reduce ? 0.2 : 0.6,
  hands: true,
  quality: isMobile ? 'med' : 'high',
  saver: isMobile, // battery saver: lower resolution, lighter post pass, no MSAA (default on for phones)
  music: 0.7,
  bass: 0.35, // low end: small speakers want less, headphones more
  sfx: 0.8,
  haptics: true,
};
const S = Object.assign({}, DEF);
try {
  Object.assign(S, JSON.parse(localStorage.getItem('fs_set') || '{}'));
} catch (e) {}
const saveS = () => {
  try {
    localStorage.setItem('fs_set', JSON.stringify(S));
  } catch (e) {}
};
let best = 0;
try {
  best = +localStorage.getItem('fs_best') || 0;
} catch (e) {}
let hintCnt = {};
try {
  hintCnt = JSON.parse(localStorage.getItem('fs_hints') || '{}');
} catch (e) {}
