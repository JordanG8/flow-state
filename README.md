# FLOW STATE

A first-person parkour game you steer by rotating your phone. On desktop it plays with WASD and a locked mouse.

Live: https://flow-state-beryl.vercel.app

Plain HTML/JS on top of three.js (loaded from a CDN). No build step: `src/` is deployed as-is.

## Controls

**Phone (gyro)** works in any pose: standing, sitting, lying in bed. The first run asks you to *spin it*
(twist left/right, then flick up/down) so the game learns the axes your wrist actually moves around. Slow rotation
steers; a fast flick is a move, and every flick re-zeroes itself, so you never have to turn to face another direction.

Straight ahead is wherever you hold the phone, and it keeps up with you while you play. Wherever your hand comes to rest
after a move becomes the new centre. If your arms sag or your body turns, the centre slowly follows, so you never have
to shift your stance to keep running straight (*Auto-centre* in Settings sets how fast; 0 means only after moves).
Coming back after holding a flick out is not a new move: it only counts if it carries the phone past where it started.

All the phone's motion sensors feed this. The gyroscope, once it has been checked against the orientation sensor, says
how your hand actually moved, so compass corrections and orientation drift never read as input. The orientation sensor
covers phones whose gyro reads wrong. The accelerometer tells a whole-body shift (re-centre faster) from a wrist move,
and checks the gyro on phones that have no orientation sensor.

| Move | Gesture |
| --- | --- |
| Steer | twist slowly |
| Turn (red corners) | snap your wrist toward the bend and let it spring back |
| Leap | flick the top of the phone up |
| Slide | flick down |
| Dash | tilt sideways like a key in a lock |

**Desktop**

| | |
| --- | --- |
| A / D | steer |
| W or Space (or left click) | leap |
| S (or right click) | slide |
| Q / E | turn left / right |
| Z / C | dash |
| Mouse | look around (pointer is locked while you run; sensitivity in Settings or the pause menu) |
| V | switch first / third person |
| Esc / P | pause (Esc also releases the mouse) |

Touch without gyro: drag to steer, swipe to move.

## Locker

Runner colours, head gear and trails unlock by best distance. `?unlock` in the URL unlocks everything for testing.

## Layout

```
src/
  index.html      markup for every screen
  style.css       original look
  ui.css          tactile controls, crosshair, calibration, locker
  core.js         deterministic course generator + player physics (no DOM)
  gyro.js         sensor fusion, stance tracking, gesture engine, calibration solver (no DOM)
  input.js        gyro / keyboard + mouse / touch -> gestures, steer, camera view
  calib.js        the "spin it" calibration screen
  audio.js        procedural music + effects, master EQ chain
  cosmetics.js    unlock data, the third-person runner, trails
  locker.js       locker screen
  settings.js     settings screen, pause quick panel, gesture lab
  ui.js           hover/press feedback, crosshair, toasts, cursor effect
  game.js         renderer, camera, game loop, screens
tests/gyro.test.js    numeric tests for the gesture engine and calibration
tests/stance.test.js  the centre following a drifting stance, sloppy returns, gyro / orientation / accelerometer fusion
tests/assist.test.js  aim assist through corners
scripts/dev-server.py
```

## Develop

```
npm run dev     # http://localhost:5173, no caching
npm test        # gesture engine, stance + sensor fusion, calibration, aim assist tests
```

Add `?debug` to the URL to expose `window.__fs` (game, input, gyro, audio analyser tap) for poking from the console.

The gesture engine is DOM-free on purpose: `tests/gyro.test.js` simulates a wrist moving a phone (standing, lying back,
on its side, with arbitrary world headings and oblique wrist axes) and checks calibration and every gesture.

## Deploy

Pushed to `main` -> Vercel production. `vercel.json` points the output directory at `src/`; there is no build.
