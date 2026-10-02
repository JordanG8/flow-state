'use strict';
// Calib: the "spin it" screen. Two guided beats (twist left/right, flick up/down) teach Gyro the player's wrist
// axes and range; then a practice pad lights a lamp for every move that registers.
const Calib = (() => {
  const BEAT = 1.0,
    LEAD = 1.4,
    N = 6;
  const STEPS = [
    {
      key: 'turn',
      title: 'Spin<br>it.',
      text: 'Twist your wrist LEFT then RIGHT, like turning a doorknob. Follow the beat and go big.',
      words: ['LEFT', 'RIGHT'],
      arrows: ['←', '→'],
    },
    {
      key: 'lift',
      title: 'Flick<br>it.',
      text: 'Now flick the TOP of the phone UP, then DOWN. Same beat. Smooth, not frantic.',
      words: ['UP', 'DOWN'],
      arrows: ['↑', '↓'],
    },
  ];
  const MSG = {
    nodata: 'No motion data. Move the phone and try again, or use defaults.',
    small: 'Too small to read. Bigger, slower twists.',
    messy: 'That was a bit all over the place. Smooth and steady.',
  };
  let phase = 'idle',
    step = 0,
    t0 = 0,
    beat = -1,
    hooks = {},
    got = {turn: null, lift: null},
    el = null;
  const now = () => performance.now() / 1e3;
  function refs() {
    if (el) return el;
    el = {
      root: $('#calib'),
      step: $('#cal-step'),
      sub: $('#cal-sub'),
      title: $('#cal-title'),
      text: $('#cal-text'),
      word: $('#cal-word'),
      pips: $('#cal-pips'),
      go: $('#cal-go'),
      redo: $('#cal-redo'),
      skip: $('#cal-skip'),
      cancel: $('#cal-cancel'),
      lamps: $$('#cal-lamps span'),
    };
    el.go.onclick = () => {
      A.ui();
      if (phase === 'intro' || phase === 'retry') begin(phase === 'retry' ? step : 0);
      else if (phase === 'practice' || phase === 'ready') finish();
    };
    el.redo.onclick = () => {
      A.ui();
      got = {turn: null, lift: null};
      setPhase('intro');
    };
    el.skip.onclick = () => {
      A.ui();
      Gyro.resetCal();
      toPractice('Default axes. You can recalibrate from Pause any time.');
    };
    el.cancel.onclick = () => {
      A.uiBack();
      stop();
      if (hooks.onCancel) hooks.onCancel();
    };
    return el;
  }
  function setPhase(p) {
    phase = p;
    const e = refs();
    e.root.dataset.phase = p;
    const intro = p === 'intro' || p === 'ready';
    if (p === 'intro') {
      e.step.textContent = 'Calibrate';
      e.sub.textContent = 'Takes ten seconds';
      e.title.innerHTML = 'Spin<br>it.';
      e.text.textContent =
        'Hold the phone however you will play: standing, on the couch, lying in bed. We learn how your wrist moves, so you never have to stand up or turn around.';
      e.go.textContent = 'Start';
    } else if (p === 'ready') {
      e.step.textContent = 'Ready';
      e.sub.textContent = 'Axes saved';
      e.title.innerHTML = 'Ready?';
      e.text.textContent = 'Get comfortable and hold the phone how you will play. This pose becomes neutral. Moves re-zero themselves from here.';
      e.go.textContent = 'Lock and run';
    } else if (p === 'retry') {
      e.go.textContent = 'Try again';
    }
    e.redo.style.display = p === 'ready' || p === 'practice' ? '' : 'none';
    e.skip.style.display = p === 'intro' || p === 'retry' ? '' : 'none';
    e.go.style.display = p === 'count' || p === 'collect' ? 'none' : '';
    e.root.classList.toggle('practice', p === 'practice' || p === 'ready');
    return intro;
  }
  function open(o) {
    hooks = o || {};
    got = {turn: null, lift: null};
    refs();
    setPhase(Gyro.cal.ok && !hooks.force ? 'ready' : 'intro');
  }
  function pips(k) {
    const e = refs();
    e.pips.innerHTML = '';
    for (let i = 0; i < N; i++) {
      const s = document.createElement('i');
      s.className = i < k ? 'done' : i === k ? 'now' : '';
      e.pips.appendChild(s);
    }
  }
  function begin(s) {
    step = s;
    const e = refs(),
      S0 = STEPS[s];
    e.step.textContent = 'Step ' + (s + 1) + ' / 2';
    e.sub.textContent = s === 0 ? 'Wrist axis' : 'Flick axis';
    e.title.innerHTML = S0.title;
    e.text.textContent = S0.text;
    e.word.textContent = 'Ready';
    e.word.dataset.dir = '';
    t0 = now() + LEAD;
    beat = -1;
    pips(-1);
    Gyro.calBegin();
    setPhase('count');
  }
  function toPractice(msg) {
    const e = refs();
    e.step.textContent = 'Locked';
    e.sub.textContent = Gyro.cal.ok ? 'Range ±' + Math.round(Gyro.cal.amp) + '°' : 'Default axes';
    e.title.innerHTML = 'Try<br>it.';
    e.text.textContent = msg || 'Make each move. A lamp lights when it registers. Happy? Run.';
    e.go.textContent = 'Lock and run';
    setPhase('practice');
    e.go.textContent = 'Lock and run';
  }
  function solved(r) {
    const e = refs();
    if (!r.ok) {
      e.step.textContent = 'Step ' + (step + 1) + ' / 2';
      e.text.textContent = MSG[r.reason] || MSG.messy;
      e.word.textContent = '?';
      A.miss();
      setPhase('retry');
      return;
    }
    A.cp();
    buzz([10, 30, 10]);
    got[STEPS[step].key] = r;
    if (step === 0) begin(1);
    else {
      Gyro.setCal(got.turn.axis, got.lift.axis, got.turn.amp);
      In.saveCal();
      toPractice();
    }
  }
  function finish() {
    stop();
    if (hooks.onDone) hooks.onDone();
  }
  function stop() {
    Gyro.st.calS = null;
    phase = 'idle';
  }
  // called every frame while the screen is up
  function tick() {
    if (phase === 'idle') return;
    const e = refs(),
      t = now();
    if (phase === 'count' || phase === 'collect') {
      const k = Math.floor((t - t0) / BEAT);
      if (phase === 'count' && t >= t0) setPhase('collect');
      if (phase === 'count') {
        const left = Math.ceil(t0 - t);
        e.word.textContent = left > 1 ? 'Ready' : 'Go';
      }
      if (phase === 'collect') {
        if (k >= N) {
          const r = Gyro.calSolve(t0 + N * BEAT);
          pips(N);
          solved(r);
          return;
        }
        if (k !== beat) {
          beat = k;
          const S0 = STEPS[step],
            i = k % 2;
          Gyro.calBeat(i === 0 ? 1 : -1, t0 + k * BEAT);
          e.word.textContent = S0.arrows[i] + ' ' + S0.words[i];
          e.word.dataset.dir = i;
          e.word.classList.remove('b');
          void e.word.offsetWidth;
          e.word.classList.add('b');
          pips(k);
          A.uiTick(i ? 0.2 : 0.8);
          buzz(8);
        }
      }
    }
    if (phase === 'practice' || phase === 'ready') {
      const g = In.lastG,
        tt = now();
      for (const l of e.lamps) {
        const id = l.dataset.g,
          hit =
            g &&
            tt - g.time < 0.45 &&
            ((g.t === 'turn' && id === 'turn' + g.dir) ||
              (g.t === 'jump' && id === 'jump') ||
              (g.t === 'slide' && id === 'slide') ||
              (g.t === 'dash' && id === 'dash' + g.dir));
        l.classList.toggle('hit', !!hit);
      }
      In.gq.length = 0;
    }
  }
  return {open, tick, stop, get phase() {
    return phase;
  }};
})();
