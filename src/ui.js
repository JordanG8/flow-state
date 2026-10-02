'use strict';
// UI: the small physical feedback that makes the menus feel like buttons (hover tick, press thunk, slider ticks,
// keyboard focus travel), the crosshair, toasts, and the desktop cursor effect.
const UI = (() => {
  const fine = matchMedia('(pointer:fine)').matches && !isMobile;
  const SEL = 'button, .card, .lk-item, input[type=range]';
  let lastHover = 0;

  // ---- hover / press ------------------------------------------------------------------------------------
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest(SEL);
    if (!t || t.disabled || (e.relatedTarget && t.contains(e.relatedTarget))) return;
    if (!t.closest('.scr.on, #hud')) return;
    const n = performance.now();
    if (n - lastHover < 45) return;
    lastHover = n;
    A.uiHover();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target.closest && e.target.closest('button, .lk-item');
      if (!t || t.disabled || !t.closest('.scr.on, #hud')) return;
      if (t.matches('.tg, .seg button, .lk-item, .lk-tabs button')) return; // these play their own sound
      if (t.matches('.back, [data-a=back], #cal-cancel')) A.uiBack();
      else A.uiPress();
      buzz(5);
    },
    true,
  );
  // keyboard-initiated clicks (Enter / Space on a focused button) have detail 0 and no pointerdown
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target.closest && e.target.closest('button');
      if (t && e.detail === 0 && !t.matches('.tg, .seg button, .lk-item')) A.uiPress();
    },
    true,
  );

  // ---- keyboard travel (Up / Down through the visible controls) ---------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const st = game.state;
    if (st === 'playing' || st === 'calib') return;
    const root = $('.scr.on:not(#loader)');
    if (!root) return;
    const list = [...root.querySelectorAll('button:not([disabled]), input[type=range]')].filter((x) => x.offsetParent !== null);
    if (!list.length) return;
    e.preventDefault();
    let i = list.indexOf(document.activeElement);
    i = i < 0 ? (e.key === 'ArrowDown' ? 0 : list.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[i].focus();
    list[i].scrollIntoView({block: 'nearest'});
    A.uiHover();
  });

  // ---- slider / toggle feedback (called from the settings builder) -----------------------------------------
  let lastTick = 0;
  function sliderTick(input, out) {
    const k = (+input.value - +input.min) / Math.max(1e-6, +input.max - +input.min),
      n = performance.now();
    input.style.setProperty('--k', k);
    if (n - lastTick > 28) {
      lastTick = n;
      A.uiTick(k);
      buzz(2);
    }
    if (out) {
      out.classList.remove('blip');
      void out.offsetWidth;
      out.classList.add('blip');
    }
  }
  function sliderInit(input) {
    input.style.setProperty('--k', (+input.value - +input.min) / Math.max(1e-6, +input.max - +input.min));
  }

  // ---- toast -----------------------------------------------------------------------------------------------
  let toastTO = 0;
  function toast(text, hold) {
    const e = $('#toast-t');
    if (!e) return;
    clearTimeout(toastTO);
    e.textContent = text;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
    toastTO = setTimeout(() => e.classList.remove('on'), hold || 2200);
  }

  // ---- crosshair --------------------------------------------------------------------------------------------
  const xh = $('#xh');
  let kick = 0,
    xhT = 0;
  function xhHit(cls) {
    if (!xh) return;
    xh.classList.remove('hit', 'jump', 'slide', 'dash', 'turn');
    void xh.offsetWidth;
    xh.classList.add(cls);
    clearTimeout(xhT);
    xhT = setTimeout(() => xh.classList.remove(cls), cls === 'hit' ? 160 : 220);
  }
  function crosshair(raw) {
    if (!xh) return;
    const show = In.locked && game.state === 'playing' && S.crosshair !== 'off';
    xh.classList.toggle('on', show);
    if (!show) return;
    xh.dataset.s = S.crosshair;
    xh.dataset.c = S.xhColor;
    kick = damp(kick, In.mouseSpeed, 12, raw);
    xh.style.setProperty('--k', kick.toFixed(3));
    xh.style.setProperty('--xs', S.xhSize);
  }

  // ---- desktop cursor effect ---------------------------------------------------------------------------------
  const cv = $('#fxm'),
    g = cv && cv.getContext('2d');
  const trail = [],
    shards = [],
    rings = [];
  let mx = -99,
    my = -99,
    rx = -99,
    ry = -99,
    hot = 0,
    raf = 0,
    lastMove = 0,
    dpr = 1,
    over = false;
  const on = () => fine && S.cursorFx && !reduce && !In.locked && game.state !== 'playing' && game.state !== 'loading';
  function size() {
    if (!cv) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
  }
  addEventListener('resize', size);
  size();
  function hide() {
    document.body.classList.remove('fx');
    if (g) g.clearRect(0, 0, cv.width, cv.height);
    trail.length = shards.length = rings.length = 0;
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function kickLoop() {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  document.addEventListener('mousemove', (e) => {
    if (!on()) {
      if (document.body.classList.contains('fx')) hide();
      return;
    }
    document.body.classList.add('fx');
    if (rx < -50) {
      rx = e.clientX;
      ry = e.clientY;
    }
    mx = e.clientX;
    my = e.clientY;
    lastMove = performance.now();
    over = !!(e.target.closest && e.target.closest('button, input, .card, .lk-item'));
    trail.push({x: mx, y: my, t: lastMove});
    if (trail.length > 60) trail.shift();
    kickLoop();
  });
  document.addEventListener('mousedown', (e) => {
    if (!on() || e.button !== 0) return;
    const n = performance.now();
    rings.push({x: e.clientX, y: e.clientY, t: n});
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5,
        v = 160 + Math.random() * 260;
      shards.push({x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, s: 5 + Math.random() * 9, t: n, ink: i % 3 === 0});
    }
    hot = 1;
    kickLoop();
  });
  document.addEventListener('pointerlockchange', () => {
    if (In.locked) hide();
  });
  addEventListener('blur', hide);
  let lastDraw = 0;
  function draw(ts) {
    raf = 0;
    if (!on()) {
      hide();
      return;
    }
    const n = performance.now(),
      dt = Math.min(0.05, (n - (lastDraw || n)) / 1e3 || 0.016);
    lastDraw = n;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    while (trail.length && n - trail[0].t > 380) trail.shift();
    // ribbon: tapering red slab with an ink copy offset behind it, like a misregistered print
    if (trail.length > 1) {
      for (const [ox, col, k] of [[4, '#0c0c0f', 0.7], [0, '#ff2a1d', 1]]) {
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1],
            b = trail[i],
            age = 1 - (n - b.t) / 380,
            w = Math.max(0.5, 9 * age * k);
          g.strokeStyle = col;
          g.globalAlpha = Math.max(0, age) * (ox ? 0.55 : 0.95);
          g.lineWidth = w;
          g.lineCap = 'butt';
          g.beginPath();
          g.moveTo(a.x + ox, a.y + ox);
          g.lineTo(b.x + ox, b.y + ox);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i],
        k = (n - r.t) / 420;
      if (k >= 1) {
        rings.splice(i, 1);
        continue;
      }
      g.strokeStyle = '#ff2a1d';
      g.globalAlpha = 1 - k;
      g.lineWidth = 3 * (1 - k) + 0.5;
      g.strokeRect(r.x - 6 - k * 34, r.y - 6 - k * 34, 12 + k * 68, 12 + k * 68);
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i],
        k = (n - s.t) / 520;
      if (k >= 1) {
        shards.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - 3 * dt;
      s.vy = s.vy * (1 - 3 * dt) + 380 * dt;
      s.r += s.vr * dt;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.r);
      g.globalAlpha = 1 - k;
      g.fillStyle = s.ink ? '#0c0c0f' : '#ff2a1d';
      const z = s.s * (1 - k * 0.6);
      g.beginPath();
      g.moveTo(0, -z);
      g.lineTo(z * 0.8, z * 0.7);
      g.lineTo(-z * 0.8, z * 0.5);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    // the cursor itself: exact dot + a lagging square that snaps larger and rotates over controls
    rx = damp(rx, mx, 22, dt);
    ry = damp(ry, my, 22, dt);
    hot = damp(hot, 0, 9, dt);
    const sz = (over ? 17 : 9) + hot * 7;
    g.save();
    g.translate(rx, ry);
    g.rotate(over ? Math.PI / 4 : 0);
    g.strokeStyle = '#0c0c0f';
    g.lineWidth = 2.5;
    g.strokeRect(-sz, -sz, sz * 2, sz * 2);
    g.strokeStyle = '#ff2a1d';
    g.lineWidth = 1.5;
    g.strokeRect(-sz + 1.5, -sz + 1.5, sz * 2 - 3, sz * 2 - 3);
    g.restore();
    g.fillStyle = '#ff2a1d';
    g.fillRect(mx - 2, my - 2, 4, 4);
    if (n - lastMove < 700 || trail.length || shards.length || rings.length || hot > 0.02) raf = requestAnimationFrame(draw);
  }

  return {sliderTick, sliderInit, toast, crosshair, xhHit, hide, fine};
})();
