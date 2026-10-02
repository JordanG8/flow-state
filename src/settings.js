'use strict';
// Settings screen, the pause-menu quick panel, and the gesture lab. Rows are built from CFG so a control only needs
// to be declared once.
const pct = (v) => Math.round(v * 100) + '%';
const x2 = (v) => v.toFixed(2) + 'x';
const CFG = [
  {sec: 'Motion', only: 'touch'},
  {k: 'sens', l: 'Snap sensitivity', h: 'Higher means a smaller flick triggers a move', min: 0.4, max: 2.5, st: 0.05, f: x2, only: 'touch'},
  {k: 'steer', l: 'Steer gain', h: 'Higher means less twist to steer', min: 0.5, max: 2.5, st: 0.05, f: x2, only: 'touch'},
  {k: 'assist', l: 'Aim assist', h: 'Keeps you on the path. Strongest for a quarter second after every turn', min: 0, max: 1, st: 0.05, f: pct, only: 'touch'},
  {k: 'invertPitch', l: 'Invert up/down flick', t: 'tg', only: 'touch'},
  {k: 'invertDash', l: 'Invert dash tilt', t: 'tg', only: 'touch'},
  {calib: 1, only: 'touch'},
  {
    k: 'mode',
    l: 'Input',
    t: 'seg',
    o: [
      ['auto', 'Auto'],
      ['gyro', 'Gyro'],
      ['touch', 'Touch'],
      ['keys', 'Keys'],
    ],
    only: 'touch',
  },
  {sensor: 1, only: 'touch'},
  {lab: 1, only: 'touch'},
  {sec: 'Mouse', only: 'desktop'},
  {k: 'msens', l: 'Mouse sensitivity', h: 'Look speed while the mouse is locked', min: 0.1, max: 4, st: 0.05, f: x2, only: 'desktop'},
  {k: 'invertY', l: 'Invert mouse Y', t: 'tg', only: 'desktop'},
  {k: 'lockMouse', l: 'Lock mouse while running', h: 'Esc releases it and pauses', t: 'tg', only: 'desktop'},
  {k: 'recentre', l: 'Recentre view when idle', h: 'Eases back to straight ahead', t: 'tg', only: 'desktop'},
  {k: 'cursorFx', l: 'Cursor effect', h: 'The ink trail in menus', t: 'tg', only: 'desktop'},
  {sec: 'Crosshair', only: 'desktop'},
  {
    k: 'crosshair',
    l: 'Style',
    t: 'seg',
    o: [
      ['cross', 'Cross'],
      ['dot', 'Dot'],
      ['ring', 'Ring'],
      ['off', 'Off'],
    ],
    only: 'desktop',
  },
  {k: 'xhSize', l: 'Size', min: 0.5, max: 2.5, st: 0.1, f: x2, only: 'desktop'},
  {
    k: 'xhColor',
    l: 'Colour',
    t: 'seg',
    o: [
      ['ink', 'Ink'],
      ['red', 'Red'],
      ['white', 'White'],
      ['auto', 'Auto'],
    ],
    only: 'desktop',
  },
  {xhdemo: 1, only: 'desktop'},
  {sec: 'View'},
  {
    k: 'view',
    l: 'Camera',
    h: 'V switches while running',
    t: 'seg',
    o: [
      ['first', 'First person'],
      ['third', 'Third person'],
    ],
  },
  {k: 'fov', l: 'Field of view', min: 60, max: 110, st: 1, f: (v) => v + '°'},
  {k: 'roll', l: 'Camera roll', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'bob', l: 'Head bob', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'shake', l: 'Camera shake', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'hands', l: 'Show hands', h: 'First person only', t: 'tg'},
  {
    k: 'quality',
    l: 'Quality',
    t: 'seg',
    o: [
      ['low', 'Low'],
      ['med', 'Med'],
      ['high', 'High'],
    ],
  },
  {sec: 'Audio'},
  {k: 'music', l: 'Music', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'sfx', l: 'Effects', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'bass', l: 'Bass', h: 'Lower for laptop or phone speakers, higher for headphones', min: 0, max: 1, st: 0.05, f: pct},
  {k: 'haptics', l: 'Vibration', t: 'tg', only: 'touch'},
  {sec: 'Other'},
  {reset: 1},
];
const showCfg = (c) => !c.only || (c.only === 'touch' ? isTouch : !isMobile);

// What a control does when it changes, beyond writing S[k].
function applySetting(k) {
  if (k === 'music' || k === 'sfx' || k === 'bass') A.setVol();
  else if (k === 'quality') resize();
  else if (k === 'view') game.applyView();
  else if (k === 'cursorFx' && !S.cursorFx) UI.hide();
  if (k === 'crosshair' || k === 'xhSize' || k === 'xhColor') xhDemo();
  updMode();
}
function xhDemo() {
  const d = $('#xh-demo .xh');
  if (!d) return;
  d.dataset.s = S.crosshair;
  d.dataset.c = S.xhColor;
  d.style.setProperty('--xs', S.xhSize);
  d.style.setProperty('--k', 0);
  d.classList.add('on');
}
function makeRow(c, idx, rebuild) {
  const row = document.createElement('div');
  row.className = 'row';
  row.style.setProperty('--n', idx);
  const lab = document.createElement('label');
  lab.innerHTML = c.l + (c.h ? '<small>' + c.h + '</small>' : '');
  row.appendChild(lab);
  if (c.t === 'tg') {
    const b = document.createElement('button');
    b.className = 'tg' + (S[c.k] ? ' on' : '');
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', !!S[c.k]);
    b.setAttribute('aria-label', c.l);
    b.onclick = () => {
      S[c.k] = !S[c.k];
      b.classList.toggle('on', S[c.k]);
      b.setAttribute('aria-checked', S[c.k]);
      saveS();
      A.uiToggle(S[c.k]);
      buzz(6);
      applySetting(c.k);
    };
    row.appendChild(b);
  } else if (c.t === 'seg') {
    const d = document.createElement('div');
    d.className = 'seg';
    for (const o of c.o) {
      const b = document.createElement('button');
      b.textContent = o[1];
      b.className = S[c.k] === o[0] ? 'on' : '';
      b.onclick = () => {
        if (S[c.k] === o[0]) return;
        S[c.k] = o[0];
        [...d.children].forEach((x) => x.classList.toggle('on', x === b));
        saveS();
        A.uiToggle(true);
        buzz(6);
        applySetting(c.k);
      };
      d.appendChild(b);
    }
    row.appendChild(d);
  } else {
    const d = document.createElement('div');
    d.className = 'rg';
    const i = document.createElement('input');
    i.type = 'range';
    i.min = c.min;
    i.max = c.max;
    i.step = c.st;
    i.value = S[c.k];
    const o = document.createElement('output');
    o.textContent = c.f(+S[c.k]);
    UI.sliderInit(i);
    i.oninput = () => {
      S[c.k] = +i.value;
      o.textContent = c.f(+i.value);
      saveS();
      UI.sliderTick(i, o);
      applySetting(c.k);
    };
    i.setAttribute('aria-label', c.l);
    d.appendChild(i);
    d.appendChild(o);
    row.appendChild(d);
  }
  return row;
}

let labEls = null;
function buildSettings() {
  const root = $('#set-body');
  root.innerHTML = '';
  let idx = 0;
  for (const c of CFG) {
    if (!showCfg(c)) continue;
    if (c.sec) {
      const d = document.createElement('div');
      d.className = 'sec';
      d.textContent = c.sec;
      d.style.setProperty('--n', idx++);
      root.appendChild(d);
      continue;
    }
    if (c.calib) {
      const d = document.createElement('div');
      d.className = 'row';
      d.style.setProperty('--n', idx++);
      d.innerHTML = `<label>Wrist calibration<small id=cal-state></small></label><div class=btns><button class=btn id=cal-open>Recalibrate</button></div>`;
      root.appendChild(d);
      const st = () => {
        $('#cal-state').textContent = Gyro.cal.ok ? 'Range ±' + Math.round(Gyro.cal.amp) + '°, axes saved' : 'Not calibrated yet';
      };
      st();
      $('#cal-open').onclick = () => {
        game.openCalib('settings');
        setTimeout(st, 0);
      };
      continue;
    }
    if (c.sensor) {
      const d = document.createElement('div');
      d.style.setProperty('--n', idx++);
      const bar = (id, n) =>
        `<div class=mt><div class='mono mh'><span>${n}</span><span id=${id}v>0%</span></div><div class=mb><i id=${id}></i><i class=tk></i></div></div>`;
      d.innerHTML =
        `<div class='lab lab2'><div class=m><span class=mono>Sensor</span><b id=sc-st>-</b></div><div class=m><span class=mono>Rate</span><b id=sc-hz>0 Hz</b></div><div class=m><span class=mono>Alpha / Beta / Gamma</span><b id=sc-raw class=sm>-</b></div><div class=m><span class=mono>Context</span><b id=sc-ctx class=sm>-</b></div></div><p class='mono note' id=sc-msg></p><div class='mono mt2'>Flick meter. Cross the red line to trigger.</div>` +
        bar('sm-t', 'Turn (twist)') +
        bar('sm-l', 'Leap / Slide (flick up or down)') +
        bar('sm-d', 'Dash (tilt like a key)') +
        `<div class=btns><button class=btn id=sc-en>Enable motion</button><button class='btn alt' id=sc-re>Recheck</button></div>`;
      root.appendChild(d);
      $('#sc-en').onclick = async () => {
        await In.requestMotion();
        addEventListener('deviceorientation', In.onOrient, true);
        updMode();
      };
      $('#sc-re').onclick = () => {
        In.evCount = 0;
        In.nullCount = 0;
        In.mCount = 0;
      };
      continue;
    }
    if (c.lab) {
      const d = document.createElement('div');
      d.style.setProperty('--n', idx++);
      d.innerHTML = `<div class=lab><div class=m><span class=mono>Twist</span><b id=lb-y>0</b></div><div class=m><span class=mono>Flick</span><b id=lb-p>0</b></div><div class=m><span class=mono>Tilt</span><b id=lb-r>0</b></div><div class=lamps><span data-g=turn1>Turn L</span><span data-g=turn-1>Turn R</span><span data-g=jump>Leap</span><span data-g=slide>Slide</span><span data-g=dash1>Dash R</span><span data-g=dash-1>Dash L</span></div></div><div class=btns><button class=btn id=lb-re>Re-zero</button><button class='btn alt' id=lb-perm>Enable motion</button></div><p class='mono note'>Gesture lab: make each move and watch the lamp. Angles are measured from your neutral pose and re-zero after every flick.</p>`;
      root.appendChild(d);
      $('#lb-re').onclick = () => In.recenter();
      $('#lb-perm').onclick = async () => {
        await In.requestMotion();
        updMode();
      };
      labEls = {y: $('#lb-y'), p: $('#lb-p'), r: $('#lb-r'), lamps: $$('.lamps span')};
      continue;
    }
    if (c.xhdemo) {
      const d = document.createElement('div');
      d.id = 'xh-demo';
      d.className = 'xh-demo';
      d.style.setProperty('--n', idx++);
      d.innerHTML = '<div class=xh><b class=xa></b><b class=xb></b><b class=xc></b><b class=xd></b><i></i></div>';
      root.appendChild(d);
      xhDemo();
      continue;
    }
    if (c.reset) {
      const b = document.createElement('button');
      b.className = 'btn alt';
      b.textContent = 'Reset to defaults';
      b.onclick = () => {
        Object.assign(S, DEF);
        saveS();
        buildSettings();
        resize();
        A.setVol();
        game.applyView();
      };
      root.appendChild(b);
      if (isTouch) {
        const r = document.createElement('button');
        r.className = 'btn alt';
        r.style.marginLeft = '10px';
        r.textContent = 'Forget wrist calibration';
        r.onclick = () => {
          Gyro.resetCal();
          try {
            localStorage.removeItem('fs_gyro');
          } catch (e) {}
          buildSettings();
        };
        root.appendChild(r);
      }
      continue;
    }
    root.appendChild(makeRow(c, idx++));
  }
}
// Pause screen: the two things you actually reach for mid-run.
function buildPauseQuick() {
  const root = $('#pz-quick');
  if (!root) return;
  root.innerHTML = '';
  const m = modeNow(),
    pick = (k) => CFG.find((c) => c.k === k);
  let i = 0;
  root.appendChild(makeRow(Object.assign({}, pick('view'), {h: ''}), i++));
  if (m === 'keys') root.appendChild(makeRow(Object.assign({}, pick('msens'), {h: ''}), i++));
  else if (m === 'gyro') root.appendChild(makeRow(Object.assign({}, pick('sens'), {h: ''}), i++));
}

function sensorUpdate() {
  if (!$('#sc-st')) return;
  const now = performance.now() / 1e3,
    live = In.evCount > 0 && now - In.evT < 1;
  const framed = (() => {
    try {
      return window !== window.top;
    } catch (e) {
      return true;
    }
  })();
  const st = live ? 'LIVE' : In.evCount > 0 ? 'STALLED' : In.perm === 'denied' ? 'BLOCKED' : 'NO DATA';
  $('#sc-st').textContent = st;
  $('#sc-st').style.color = live ? '#0a8a3a' : '#ff2a1d';
  $('#sc-hz').textContent = (live ? In.evTimes.length : 0) + ' Hz';
  $('#sc-raw').textContent = In.evCount ? In.raw.map((v) => Math.round(v)).join(' / ') : '-';
  $('#sc-ctx').textContent = (framed ? 'EMBEDDED' : 'OWN TAB') + ' / ' + (window.isSecureContext ? 'HTTPS' : 'INSECURE');
  let m;
  if (live)
    m = 'Sensor live. Make each move and watch the meter cross the red line. If a bar never gets there, raise Snap sensitivity or recalibrate.';
  else if (In.perm === 'denied')
    m =
      'Motion permission was denied. On iPhone, quit the browser, reopen, and tap Allow. Or enable Motion and Orientation access for this site in Safari settings.';
  else if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function' &&
    In.perm !== 'granted'
  )
    m = 'Tap Enable motion and allow the prompt.';
  else if (framed)
    m = 'No motion data. This page is embedded, and browsers block the gyro inside embedded pages. Open the link in its own browser tab.';
  else if (In.nullCount > 0)
    m = 'The browser sends empty sensor data. Motion sensors are off for this site or device. Check site settings for Motion sensors, and turn off battery saver.';
  else m = 'No motion events yet. Move the phone. If nothing appears, check site settings for Motion sensors.';
  $('#sc-msg').textContent = m;
  const mt = live ? Gyro.meters(now) : [0, 0, 0];
  const set = (id, v) => {
    const e = $('#' + id);
    if (!e) return;
    const pk = Math.max(+(e.dataset.pk || 0) * 0.985, v);
    e.dataset.pk = pk;
    e.style.width = Math.min(100, (v / 1.5) * 100) + '%';
    e.style.background = v >= 1 ? '#ff2a1d' : '#0c0c0f';
    $('#' + id + 'v').textContent = Math.round(v * 100) + '%  peak ' + Math.round(pk * 100) + '%';
  };
  set('sm-t', mt[0]);
  set('sm-l', mt[1]);
  set('sm-d', mt[2]);
}
function labUpdate() {
  sensorUpdate();
  if (!labEls || !$('#lb-y')) return;
  const a = Gyro.st.ang;
  labEls.y.textContent = Math.round(a[0]) + '°';
  labEls.p.textContent = Math.round(a[1]) + '°';
  labEls.r.textContent = Math.round(a[2]) + '°';
  const g = In.lastG,
    now = performance.now() / 1e3;
  for (const l of labEls.lamps) {
    const id = l.dataset.g;
    const hit =
      g &&
      now - g.time < 0.45 &&
      ((g.t === 'turn' && id === 'turn' + g.dir) ||
        (g.t === 'jump' && id === 'jump') ||
        (g.t === 'slide' && id === 'slide') ||
        (g.t === 'dash' && id === 'dash' + g.dir));
    l.classList.toggle('hit', !!hit);
  }
  In.gq.length = 0;
}
