# FLOW STATE

Two games in one page:

- **Run**: a first-person parkour runner. Swipe on a phone, WASD and a locked mouse on desktop.
- **Arena**: a peer-to-peer shooter for 2 to 8 players. One assault rifle, one map with wall runs, first to the kill
  target. You join a friend with a six-letter code.

Live: https://flow-state-beryl.vercel.app

Plain HTML/JS on top of three.js (loaded from a CDN). No build step: `src/` is deployed as-is, plus one serverless
function (`api/lobby.js`) for the Arena handshake.

## Arena

**Lobbies.** *Create lobby* gives you a six-letter code. Friends type it under *Join*. The host sets the rules (kills
to win, respawn time, health, time limit) and starts; anyone who joins later drops into the running match. If the
host leaves, the match ends for everyone.

**How the networking works.** Players connect straight to the host over WebRTC data channels (a star: the host relays).
The only server involved is `api/lobby.js`, which carries one offer and one answer per joiner. It keeps them in a
private **Vercel Blob** store (`flow-state-lobbies`, linked to the project as `BLOB_READ_WRITE_TOKEN`), one small JSON
document per lobby at `lobbies/<CODE>.json`, written with ETag conditions so simultaneous joins cannot clobber each
other. Codes expire after six hours. No game traffic touches a server. There is no TURN relay, so two players behind
strict (symmetric) NATs may fail to connect; STUN covers ordinary home and mobile networks.

Each client owns its own movement and tests its own shots; the target owns its health and announces its own death;
the host keeps the score and calls the winner.

**The map, Switchback.** Two slabs split by a drop. Ways across: the centre bridge, the catwalk above it, stepping
stones at the far ends, and two striped walls that hang over the drop. Jump at any tall wall while moving along it and
you run on it (up to about two seconds); jump again to kick off. Wall jumps chain between facing walls, which is how
you reach the perches.

**Kill replay.** When you die you wait out the respawn time. The first half (at most five seconds) replays the kill
through the killer's eyes from a rolling recording every client keeps; the rest hovers over the spot where you are
about to respawn. With the default 10 s respawn that is 5 s of replay and 5 s of hover.

**Controls**

| | Desktop | Phone |
| --- | --- | --- |
| Move | WASD | left thumb: floating stick |
| Look | mouse | right thumb: drag (the Fire button drags too) |
| Fire | left click | Fire |
| Jump / wall jump | Space | Jump |
| Reload | R | Reload |
| Camera | V (first / third person) | 1P / 3P button |
| Scores | hold Tab | Scores |
| Menu | Esc | pause button |

## Run controls

Phones play Run by touch: drag to steer, swipe up to leap, down to slide, sideways to turn, and tap twice on one side
of the screen to dash.

> **Gyro control is switched off.** The motion engine, the wrist calibration and their tests are all still here
> (`src/gyro.js`, `src/calib.js`, `tests/`), but nothing listens to the sensors or asks for motion permission. Set
> `GYRO_ON = true` in `src/input.js` to bring the mode back. The rest of this section describes that mode.

**Phone (gyro, currently off)** works in any pose: standing, sitting, lying in bed. The first run asks you to *spin it*
(twist left/right, then flick up/down) so the game learns the axes your wrist actually moves around.

The phone is your eyes, like a VR headset you hold. Turning it slowly is looking: the view follows it 1:1 (predicted to
the frame and tremor filtered, so it never trails your hand), and you run where you look. A fast flick is a move: the
view does not tip, roll or swing with it, it only fires the move. Near a red corner, looking into the bend does not
steer you off the path; keep looking into it and the run turns at the middle of the corner. The look folds into the
turn's swing, so straight ahead is wherever the phone points afterwards, and bringing the phone back to your natural
hold is not a steer. Every move re-zeroes itself, so you never have to turn to face another direction.

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
| Steer | look where you want to go (twist slowly) |
| Turn (red corners) | look into the bend as you reach it, or snap your wrist toward it and let it spring back |
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
  arena-core.js   Arena map, movement (run, jump, wall run, wall jump) and ray tests (no DOM)
  net.js          lobby client + WebRTC star (reliable and unreliable channel per player)
  rifle.js        the AR-9 model, its toon + outline shader, muzzle flash
  arena.js        Arena match flow, soldiers, cameras, HUD, touch controls, kill replay
  arena.css       mode picker, Arena menu, lobby, HUD
api/lobby.js      lobby signaling on Vercel Blob (in-memory when there is no token)
tests/gyro.test.js    numeric tests for the gesture engine and calibration
tests/stance.test.js  the centre following a drifting stance, sloppy returns, gyro / orientation / accelerometer fusion
tests/look.test.js    the view holding still through moves, 1:1 looks, running where you look, corners taken by looking
tests/assist.test.js  aim assist through corners
tests/arena.test.js   Arena movement, wall runs, the map's routes, hit geometry
scripts/dev-server.js  static server for src/ that also mounts api/lobby.js (so lobbies work locally)
scripts/dev-server.py  static only
```

## Develop

```
npm run dev     # http://localhost:5173, no caching, lobby API included (in-memory)
npm test        # gesture engine, stance + sensor fusion, VR look + corners, calibration, aim assist, arena
```

Add `?debug` to the URL to expose `window.__fs` (game, input, gyro, audio analyser tap) for poking from the console.

The gesture engine is DOM-free on purpose: `tests/gyro.test.js` simulates a wrist moving a phone (standing, lying back,
on its side, with arbitrary world headings and oblique wrist axes) and checks calibration and every gesture.

## Deploy

Pushed to `main` -> Vercel production. `vercel.json` points the output directory at `src/`; there is no build. Vercel
installs `@vercel/blob` for `api/lobby.js`, which needs the `BLOB_READ_WRITE_TOKEN` the linked Blob store provides.
