'use strict';
// Cosmetics: what you wear (outfit colours, head gear, trail), unlocked by your best distance, plus the blocky
// third-person runner that wears it. Colours reach the shader through the shared uBody / uTrim uniforms, so the
// first-person hands, the in-world runner and the locker preview all match.
const Cos = (() => {
  const HAZ = null; // null colour = "use the act palette" (the original paper-and-red look)
  const CAT = {
    outfit: [
      {id: 'paper', name: 'Paper', at: 0, body: HAZ, trim: HAZ, note: 'The original. Takes the colour of each act.'},
      {id: 'ink', name: 'Ink', at: 0, body: [0.06, 0.06, 0.08], trim: [0.93, 0.92, 0.88], note: 'Black on white. Nothing else.'},
      {id: 'cobalt', name: 'Cobalt', at: 150, body: [0.1, 0.27, 0.86], trim: [0.94, 0.96, 1], note: 'Cold and clean.'},
      {id: 'mint', name: 'Mint', at: 300, body: [0.16, 0.76, 0.6], trim: [0.06, 0.07, 0.08], note: 'Fresh air at speed.'},
      {id: 'marigold', name: 'Marigold', at: 500, body: [1, 0.72, 0.1], trim: [0.07, 0.06, 0.05], note: 'Impossible to lose.'},
      {id: 'blush', name: 'Blush', at: 750, body: [1, 0.62, 0.7], trim: [0.12, 0.05, 0.08], note: 'Soft, on purpose.'},
      {id: 'glitch', name: 'Glitch', at: 1000, anim: 'glitch', note: 'Never the same colour twice.'},
    ],
    head: [
      {id: 'bare', name: 'Bare', at: 0, note: 'Just a head.'},
      {id: 'visor', name: 'Visor', at: 100, note: 'Eyes front.'},
      {id: 'cap', name: 'Cap', at: 200, note: 'Brim forward.'},
      {id: 'phones', name: 'Headphones', at: 400, note: 'You are the soundtrack.'},
      {id: 'hood', name: 'Hood', at: 700, note: 'Up, always.'},
      {id: 'antenna', name: 'Antenna', at: 900, note: 'Picking up something.'},
      {id: 'crown', name: 'Crown', at: 1500, note: 'For the long runs.'},
    ],
    trail: [
      {id: 'none', name: 'None', at: 0, note: 'Leave nothing behind.'},
      {id: 'ribbon', name: 'Ribbon', at: 250, note: 'A flat line of colour.'},
      {id: 'prints', name: 'Prints', at: 450, note: 'Every footstep, stamped.'},
      {id: 'cubes', name: 'Shed', at: 800, note: 'Sheds little blocks as you go.'},
    ],
  };
  const LABEL = {outfit: 'Runner', head: 'Head', trail: 'Trail'};
  const eq = {outfit: 'paper', head: 'bare', trail: 'none'};
  const shown = Object.assign({}, eq); // what is currently displayed (differs from eq while browsing the locker)
  let seen = {},
    fresh = {};
  const unlockAll = /[?&]unlock\b/.test(location.search);
  try {
    Object.assign(eq, JSON.parse(localStorage.getItem('fs_cos') || '{}'));
    seen = JSON.parse(localStorage.getItem('fs_cos_seen') || '{}');
    fresh = JSON.parse(localStorage.getItem('fs_cos_new') || '{}');
  } catch (e) {}
  const item = (cat, id) => CAT[cat].find((i) => i.id === id) || CAT[cat][0];
  const isUnlocked = (it) => unlockAll || it.at <= best;
  for (const c in eq) if (!isUnlocked(item(c, eq[c]))) eq[c] = CAT[c][0].id;
  Object.assign(shown, eq);
  const save = () => {
    try {
      localStorage.setItem('fs_cos', JSON.stringify(eq));
    } catch (e) {}
  };
  const saveSeen = () => {
    try {
      localStorage.setItem('fs_cos_seen', JSON.stringify(seen));
      localStorage.setItem('fs_cos_new', JSON.stringify(fresh));
    } catch (e) {}
  };
  // Items that crossed their threshold since we last looked (first load marks the free ones as seen silently).
  function newlyUnlocked() {
    const out = [];
    for (const c in CAT)
      for (const it of CAT[c]) {
        const k = c + '/' + it.id;
        if (isUnlocked(it) && !seen[k]) {
          seen[k] = 1;
          if (it.at > 0) {
            out.push({cat: c, it: it});
            fresh[k] = 1;
          }
        }
      }
    if (out.length || Object.keys(seen).length) saveSeen();
    return out;
  }
  const isFresh = (cat, id) => !!fresh[cat + '/' + id];
  const clearFresh = (cat, id) => {
    if (fresh[cat + '/' + id]) {
      delete fresh[cat + '/' + id];
      saveSeen();
    }
  };
  const freshCount = () => Object.keys(fresh).length;
  const equip = (cat, id) => {
    const it = item(cat, id);
    if (!isUnlocked(it)) return false;
    eq[cat] = it.id;
    shown[cat] = it.id;
    save();
    return true;
  };

  // ---- colours ------------------------------------------------------------------------------------------
  const tmpC = new THREE.Color();
  function applyColors(now) {
    const o = item('outfit', shown.outfit);
    let b = o.body,
      t = o.trim;
    if (o.anim === 'glitch') {
      const h = (now * 0.35) % 1;
      tmpC.setHSL(h, 0.85, 0.55);
      b = [tmpC.r, tmpC.g, tmpC.b];
      tmpC.setHSL((h + 0.5) % 1, 0.9, 0.6);
      t = [tmpC.r, tmpC.g, tmpC.b];
    }
    U.uBody.value.set(b ? b[0] : 0, b ? b[1] : 0, b ? b[2] : 0, b ? 1 : 0);
    U.uTrim.value.set(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? 1 : 0);
  }
  // colour used for trails: the outfit's body colour, or the act accent for the default
  const trailCol = new THREE.Color();
  function trailColor() {
    const b = U.uBody.value;
    if (b.w > 0.5) return trailCol.setRGB(b.x, b.y, b.z);
    return trailCol.copy(U.uAccent.value);
  }

  // ---- the runner ---------------------------------------------------------------------------------------
  function buildRunner() {
    const root = new THREE.Group(),
      pelvis = new THREE.Group(),
      box = (w, h, d, kind, x, y, z, parent, seed) => {
        const m = mkBox(w, h, d, kind, seed || 0.3, mainMat);
        m.position.set(x, y, z);
        (parent || pelvis).add(m);
        return m;
      };
    pelvis.position.y = 0.9;
    root.add(pelvis);
    box(0.4, 0.58, 0.24, 7, 0, 0.31, 0, pelvis, 0.1); // torso
    box(0.42, 0.07, 0.25, 8, 0, 0.17, 0, pelvis, 0.2); // belt stripe
    const leg = (sx) => {
        const g = new THREE.Group();
        g.position.set(sx * 0.1, 0, 0);
        box(0.15, 0.78, 0.17, 7, 0, -0.39, 0, g, 0.5);
        box(0.17, 0.1, 0.29, 8, 0, -0.84, -0.05, g, 0.6); // shoe
        pelvis.add(g);
        return g;
      },
      arm = (sx) => {
        const g = new THREE.Group();
        g.position.set(sx * 0.27, 0.55, 0);
        box(0.12, 0.56, 0.13, 7, 0, -0.27, 0, g, 0.7);
        box(0.13, 0.1, 0.14, 8, 0, -0.58, 0, g, 0.8); // glove
        pelvis.add(g);
        return g;
      };
    const legL = leg(-1),
      legR = leg(1),
      armL = arm(-1),
      armR = arm(1);
    const neck = new THREE.Group();
    neck.position.set(0, 0.63, 0);
    pelvis.add(neck);
    box(0.27, 0.27, 0.27, 7, 0, 0.17, 0, neck, 0.4); // head
    const gear = new THREE.Group();
    gear.position.set(0, 0.17, 0);
    neck.add(gear);
    const r = {root, pelvis, legL, legR, armL, armR, neck, gear, gearId: null, ant: null, w: {run: 0, air: 0, slide: 0}};
    root.visible = false;
    return r;
  }
  function setGear(r, id) {
    if (r.gearId === id) return;
    r.gearId = id;
    r.ant = null;
    while (r.gear.children.length) {
      const c = r.gear.children.pop();
      c.geometry.dispose();
    }
    const g = (w, h, d, kind, x, y, z) => {
      const m = mkBox(w, h, d, kind, 0.9, mainMat);
      m.position.set(x, y, z);
      r.gear.add(m);
      return m;
    };
    if (id === 'visor') {
      g(0.3, 0.08, 0.05, 8, 0, 0.02, -0.15);
      g(0.3, 0.03, 0.12, 7, 0, 0.14, -0.1);
    } else if (id === 'cap') {
      g(0.29, 0.08, 0.29, 8, 0, 0.15, 0);
      g(0.27, 0.025, 0.15, 8, 0, 0.115, -0.2);
    } else if (id === 'phones') {
      g(0.34, 0.04, 0.06, 8, 0, 0.16, 0);
      g(0.06, 0.13, 0.12, 8, -0.17, 0, 0);
      g(0.06, 0.13, 0.12, 8, 0.17, 0, 0);
    } else if (id === 'hood') {
      g(0.31, 0.09, 0.31, 7, 0, 0.16, 0.01);
      g(0.31, 0.32, 0.1, 7, 0, 0.0, 0.14);
      g(0.05, 0.3, 0.2, 7, -0.16, 0.0, 0.05);
      g(0.05, 0.3, 0.2, 7, 0.16, 0.0, 0.05);
    } else if (id === 'antenna') {
      g(0.03, 0.26, 0.03, 7, 0.06, 0.27, 0);
      r.ant = g(0.08, 0.08, 0.08, 8, 0.06, 0.43, 0);
    } else if (id === 'crown') {
      g(0.31, 0.06, 0.31, 8, 0, 0.16, 0);
      for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12], [0, 0]]) g(0.05, 0.11, 0.05, 8, x, 0.24, z);
    }
  }

  // Pose a runner from sim state. rw = smoothed weights, kept on the rig.
  function pose(r, P, raw, now, visH) {
    const w = r.w,
      sn = clamp(P.speed / 24, 0, 1),
      ph = P.stride * Math.PI * 2,
      gr = P.grounded && !P.sliding ? 1 : 0;
    w.run = damp(w.run, gr, 9, raw);
    w.air = damp(w.air, P.grounded ? 0 : 1, 12, raw);
    w.slide = damp(w.slide, P.sliding ? 1 : 0, 14, raw);
    r.root.position.set(P.x, P.y, P.z);
    const lean = clamp((P.lat + P.dashV) / 12, -1, 1);
    r.root.rotation.set(0, visH * D2R - lean * 0.28, 0, 'YXZ');
    r.root.rotation.z = -lean * 0.12;
    const s = Math.sin(ph),
      sw = w.run * (0.5 + 0.5 * sn);
    r.legL.rotation.x = s * sw - 0.85 * w.air + w.slide * 1.1;
    r.legR.rotation.x = -s * sw - 0.2 * w.air + w.slide * 1.2;
    r.armL.rotation.x = -s * sw * 0.9 + 1.2 * w.air - w.slide * 0.3;
    r.armR.rotation.x = s * sw * 0.9 + 1.5 * w.air - w.slide * 0.3;
    r.armL.rotation.z = -0.08 - 0.5 * w.air;
    r.armR.rotation.z = 0.08 + 0.5 * w.air;
    r.pelvis.rotation.x = -0.05 * w.run - 0.17 * sn * w.run + 1.15 * w.slide - 0.1 * w.air;
    r.pelvis.position.y = 0.9 - 0.2 * w.run * (0.6 + 0.4 * Math.abs(Math.cos(ph))) - 0.5 * w.slide - 0.08 * w.air;
    r.neck.rotation.x = -r.pelvis.rotation.x * 0.7;
    if (r.ant) r.ant.position.x = 0.06 + Math.sin(now * 9) * 0.015 * (0.3 + sn);
  }

  // ---- trails ---------------------------------------------------------------------------------------------
  const T = {group: null, ribbon: null, prints: [], cubes: [], pts: [], lastStep: 0, alt: 1, printI: 0, tAcc: 0};
  const NR = 30;
  function initTrails() {
    T.group = new THREE.Group();
    scene.add(T.group);
    const geo = new THREE.BufferGeometry(),
      pos = new Float32Array(NR * 2 * 3),
      idx = [];
    for (let i = 0; i < NR - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const rib = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: 0xff2a1d, side: THREE.DoubleSide, fog: false}));
    rib.frustumCulled = false;
    rib.visible = false;
    T.group.add(rib);
    T.ribbon = rib;
    const pg = new THREE.PlaneGeometry(0.2, 0.36);
    pg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({color: 0xff2a1d, fog: false}));
      m.visible = false;
      m.userData.life = 0;
      T.group.add(m);
      T.prints.push(m);
    }
    const cg = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({color: 0xff2a1d, fog: false}));
      m.visible = false;
      m.userData = {life: 0, v: new THREE.Vector3()};
      T.group.add(m);
      T.cubes.push(m);
    }
  }
  function trailsClear() {
    T.pts.length = 0;
    if (T.ribbon) T.ribbon.visible = false;
    for (const m of T.prints) m.visible = false;
    for (const m of T.cubes) m.visible = false;
  }
  function trailsUpdate(P, raw, now, live, heading, id) {
    if (!T.ribbon) initTrails();
    id = id || eq.trail;
    const col = trailColor();
    const hh = (heading * Math.PI) / 180,
      fx = -Math.sin(hh),
      fz = -Math.cos(hh),
      rx = -fz,
      rz = fx;
    // ribbon
    const rib = T.ribbon;
    if (id === 'ribbon' && live) {
      T.tAcc += raw;
      while (T.tAcc > 0.03) {
        T.tAcc -= 0.03;
        T.pts.unshift([P.x, P.y + 0.95, P.z]);
        if (T.pts.length > NR) T.pts.pop();
      }
      T.pts[0] = [P.x, P.y + 0.95, P.z];
      // Only the last ~3.4 m: long enough to read as a trail, short enough that it never reaches the chase camera.
      const pa = rib.geometry.attributes.position.array,
        n = T.pts.length,
        LMAX = 3.4;
      let run = 0;
      for (let i = 0; i < NR; i++) {
        const j = Math.min(i, n - 1),
          p = T.pts[j],
          q = T.pts[Math.min(j + 1, n - 1)],
          tx = p[0] - q[0],
          tz = p[2] - q[2],
          l = Math.hypot(tx, tz) || 1;
        if (i > 0 && i < n) run += Math.hypot(p[0] - T.pts[j - 1][0], p[2] - T.pts[j - 1][2]);
        const wd = 0.16 * Math.max(0, 1 - run / LMAX) * clamp(P.speed / 14, 0.2, 1),
          sx = -tz / l,
          sz = tx / l;
        pa[i * 6] = p[0] + sx * wd;
        pa[i * 6 + 1] = p[1];
        pa[i * 6 + 2] = p[2] + sz * wd;
        pa[i * 6 + 3] = p[0] - sx * wd;
        pa[i * 6 + 4] = p[1];
        pa[i * 6 + 5] = p[2] - sz * wd;
      }
      rib.geometry.attributes.position.needsUpdate = true;
      rib.material.color.copy(col);
      rib.visible = n > 2;
    } else {
      rib.visible = false;
      if (id !== 'ribbon') T.pts.length = 0;
    }
    // prints: one per footfall
    for (const m of T.prints) {
      if (!m.visible) continue;
      m.userData.life -= raw;
      if (m.userData.life <= 0) m.visible = false;
      else m.scale.setScalar(Math.min(1, m.userData.life / 0.5));
    }
    if (id === 'prints' && live && P.grounded && !P.sliding) {
      const n = Math.floor(P.stride * 2);
      if (n !== T.lastStep) {
        T.lastStep = n;
        T.alt = -T.alt;
        const m = T.prints[T.printI++ % T.prints.length];
        m.position.set(P.x + rx * 0.13 * T.alt, P.y + 0.025, P.z + rz * 0.13 * T.alt);
        m.rotation.y = hh;
        m.material.color.copy(col);
        m.userData.life = 1.6;
        m.scale.setScalar(1);
        m.visible = true;
      }
    }
    // shed blocks
    for (const m of T.cubes) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life -= raw;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      u.v.y -= 9 * raw;
      m.position.addScaledVector(u.v, raw);
      m.rotation.x += raw * 5;
      m.rotation.y += raw * 4;
      m.scale.setScalar(Math.min(1, u.life / 0.35));
    }
    if (id === 'cubes' && live && P.speed > 5) {
      T.tAcc += raw;
      while (T.tAcc > 0.045) {
        T.tAcc -= 0.045;
        const m = T.cubes.find((c) => !c.visible);
        if (!m) break;
        const u = m.userData,
          o = (Math.random() - 0.5) * 0.4;
        m.position.set(P.x - fx * 0.3 + rx * o, P.y + 0.5 + Math.random() * 0.8, P.z - fz * 0.3 + rz * o);
        u.v.set(-fx * (1 + Math.random() * 2) + rx * o * 3, 0.6 + Math.random() * 1.6, -fz * (1 + Math.random() * 2) + rz * o * 3);
        u.life = 0.9;
        m.material.color.copy(col);
        m.visible = true;
        m.scale.setScalar(1);
      }
    }
  }

  return {
    CAT, LABEL, eq, shown, item, isUnlocked, equip, newlyUnlocked, isFresh, clearFresh, freshCount, applyColors, buildRunner, setGear, pose, trailsUpdate, trailsClear,
    group() {
      if (!T.ribbon) initTrails();
      return T.group;
    },
    setShown(cat, id) {
      shown[cat] = id;
    },
    resetShown() {
      Object.assign(shown, eq);
    },
  };
})();
