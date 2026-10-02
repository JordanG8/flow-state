'use strict';
// Locker screen: pick runner / head / trail. The 3D preview is drawn by the game loop (game.js, state 'locker');
// this file only owns the list, the equip logic and the drag-to-turn gesture.
const Locker = (() => {
  let cat = 'outfit';
  const tabs = $('#lk-tabs'),
    grid = $('#lk-grid'),
    note = $('#lk-note'),
    count = $('#lk-count'),
    root = $('#locker');

  const css = (c) => 'rgb(' + c.map((v) => Math.round(Math.min(1, v) * 255)).join(',') + ')';
  function swatches(it) {
    if (cat !== 'outfit') return '';
    if (it.anim === 'glitch')
      return '<div class=sw><i style="background:linear-gradient(90deg,#ff2a1d,#ffd21a,#22d3a0,#2a5bff,#e23bff)"></i><i style="background:linear-gradient(90deg,#2a5bff,#e23bff,#ff2a1d,#ffd21a)"></i></div>';
    if (!it.body) return '<div class=sw><i style="background:#f6f5f0"></i><i style="background:#ff2a1d"></i></div>';
    return '<div class=sw><i style="background:' + css(it.body) + '"></i><i style="background:' + css(it.trim) + '"></i></div>';
  }
  function renderTabs() {
    tabs.innerHTML = '';
    for (const c in Cos.CAT) {
      const b = document.createElement('button');
      b.textContent = Cos.LABEL[c];
      b.className = c === cat ? 'on' : '';
      const fresh = Cos.CAT[c].some((it) => Cos.isFresh(c, it.id));
      if (fresh) b.textContent += ' *';
      b.onclick = () => {
        if (c === cat) return;
        cat = c;
        A.uiToggle(true);
        buzz(6);
        Cos.resetShown();
        renderTabs();
        render(true);
      };
      tabs.appendChild(b);
    }
  }
  function render(anim) {
    grid.className = 'lk-grid' + (anim ? ' in' : '');
    grid.innerHTML = '';
    let total = 0,
      owned = 0;
    for (const c in Cos.CAT)
      for (const it of Cos.CAT[c]) {
        total++;
        if (Cos.isUnlocked(it)) owned++;
      }
    Cos.CAT[cat].forEach((it, i) => {
      const locked = !Cos.isUnlocked(it),
        eq = Cos.eq[cat] === it.id,
        sel = Cos.shown[cat] === it.id;
      const b = document.createElement('button');
      b.className = 'lk-item' + (locked ? ' locked' : '') + (eq ? ' eq' : '') + (sel ? ' sel' : '') + (Cos.isFresh(cat, it.id) ? ' new' : '');
      b.style.setProperty('--n', i);
      b.innerHTML =
        swatches(it) + '<b>' + it.name + '</b><small>' + (eq ? 'Equipped' : locked ? 'Reach ' + it.at + ' m' : 'Owned') + '</small>';
      b.onclick = () => {
        Cos.setShown(cat, it.id);
        if (locked) {
          A.uiLocked();
          buzz([8, 40, 8]);
        } else {
          Cos.equip(cat, it.id);
          Cos.clearFresh(cat, it.id);
          A.uiEquip();
          buzz(12);
          game.lkKick = 1;
        }
        renderTabs();
        render();
      };
      grid.appendChild(b);
    });
    const cur = Cos.item(cat, Cos.shown[cat]);
    note.textContent = cur.note + (!Cos.isUnlocked(cur) ? '  Locked: reach ' + cur.at + ' m. Your best is ' + best + ' m.' : '');
    count.textContent = owned + ' / ' + total + ' unlocked';
  }
  function open() {
    Cos.resetShown();
    renderTabs();
    render(true);
    game.lkAng = 0.5;
  }
  function close() {
    Cos.resetShown();
  }

  // drag anywhere on the open part of the screen to turn the runner
  {
    let down = false,
      lx = 0;
    root.addEventListener('pointerdown', (e) => {
      if (e.target !== root && !e.target.classList.contains('lk-hint') && !e.target.closest('.lk-hint')) return;
      down = true;
      lx = e.clientX;
      try {
        root.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    root.addEventListener('pointermove', (e) => {
      if (!down) return;
      game.lkAng += (e.clientX - lx) * 0.012;
      lx = e.clientX;
    });
    const up = () => (down = false);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  }
  return {open, close, renderTabs};
})();
