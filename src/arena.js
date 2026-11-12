'use strict';
// Arena: the peer-to-peer shooter. One rifle, one map, first to the kill target.
// Movement and hit geometry live in arena-core.js, the link in net.js, the rifle in rifle.js. This file is the game
// around them: lobby and match flow, rendering, controls (keys + mouse, or joystick + drag), the HUD, and the
// kill replay shown while you wait to respawn.
//
// Who decides what: you own your position and your shots (your client tests the ray and tells the target), the
// target owns its health and announces its own death, and the host keeps the score and calls the winner.
const Arena = (() => {
  const C = ACORE.C;
  const PCOL = [[1, 0.36, 0.1], [0.12, 0.45, 1], [0.1, 0.72, 0.45], [0.98, 0.74, 0.08], [0.66, 0.3, 0.95], [1, 0.4, 0.62], [0.1, 0.75, 0.86], [0.5, 0.52, 0.56]];
  const GUN = {gap: 0.1, mag: 30, reload: 1.9, dmg: 20, head: 34, range: 170};
  // lobby rules: [key, label, min, max, step, format]
  const RULES = [
    ['kills', 'Kills to win', 5, 50, 5, (v) => v],
    ['respawn', 'Respawn time', 4, 16, 2, (v) => v + ' s'],
    ['hp', 'Health', 50, 200, 25, (v) => v],
    ['time', 'Time limit', 0, 20, 5, (v) => (v ? v + ' min' : 'Off')],
  ];
  const DEFSET = {kills: 15, respawn: 10, hp: 100, time: 10};
  const PAL = {l: [0.95, 0.96, 0.98], f: [0.77, 0.82, 0.9], a: [1, 0.36, 0.1]};
  const F_GROUND = 1, F_WR = 2, F_WL = 4, F_DEAD = 8, F_RELOAD = 16;
  const REC_HZ = 20, REC_KEEP = 9;
  const V3 = THREE.Vector3;

  const G = {
    ready: false, phase: 'off', set: Object.assign({}, DEFSET),
    players: new Map(), // id -> {id, name, col, rig, tag, buf, cur, alive, kills, deaths}
    me: null, P: null, hp: 100, alive: false, invuln: 0,
    look: {yaw: 0, pitch: 0}, kick: {p: 0, y: 0}, bloom: 0,
    W: {ammo: GUN.mag, next: 0, reload: 0},
    inp: {mx: 0, mz: 0, jump: false, fire: false},
    t0: 0, death: null, sendAcc: 0, recAcc: 0, rec: [], shots: [],
    hurt: 0, flash: 0, eye: C.EYE, roll: 0, fovK: 0, vmKick: 0, stepN: 0, lastYaw: 0, swayX: 0, swayY: 0,
    paused: false, board: false, ended: null, replay: null,
  };
  let aScene, avScene, vm, vmGun, vmMat, myRig, sunM, ring, tracers = [], sparks = [], ti = 0, si = 0;
  const $id = (s) => document.getElementById(s);
  const E = {};
  const nowS = () => performance.now() / 1e3;
  const fin = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && isFinite(v));
  const colCss = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';
  const colOf = (id) => PCOL[((id % 8) + 8) % 8];
  const fwdOf = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const lerpA = (a, b, t) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  // ---- scene ----------------------------------------------------------------------------------------------
  // A material in the course's toon shader with its own outfit colours (uBody for kind 7, uTrim for kind 8).
  function pmat(col, noFog) {
    const u = Object.assign({}, U, {
      uBody: {value: new THREE.Vector4(col[0], col[1], col[2], 1)},
      uTrim: {value: new THREE.Vector4(0.085, 0.09, 0.105, 1)},
      uThin: {value: 1},
    });
    if (noFog) u.uFogDen = {value: 0};
    return new THREE.ShaderMaterial({uniforms: u, vertexShader: VS, fragmentShader: FS, extensions: {derivatives: true}});
  }
  const ZAX = new V3(0, 0, 1);
  // a box stretched from a to b
  function limb(parent, a, b, w, h, kind, mat) {
    const va = new V3(...a),
      vb = new V3(...b),
      d = vb.clone().sub(va),
      m = mkBox(w, h, d.length(), kind, 0.4, mat);
    m.position.copy(va).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(ZAX, d.normalize());
    parent.add(m);
    return m;
  }
  function buildSoldier(col) {
    const mat = pmat(col),
      root = new THREE.Group(),
      pelvis = new THREE.Group(),
      torso = new THREE.Group(),
      aim = new THREE.Group(),
      neck = new THREE.Group();
    const bx = (w, h, d, k, x, y, z, par, seed) => {
      const m = mkBox(w, h, d, k, seed || 0.3, mat);
      m.position.set(x, y, z);
      par.add(m);
      return m;
    };
    pelvis.position.y = 0.92;
    root.add(pelvis);
    pelvis.add(torso);
    const leg = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.11, 0, 0);
      bx(0.16, 0.8, 0.18, 0, 0, -0.4, 0, g, 0.5);
      bx(0.17, 0.2, 0.19, 7, 0, -0.42, -0.005, g, 0.2); // knee pad
      bx(0.18, 0.13, 0.3, 8, 0, -0.855, -0.05, g, 0.6);
      pelvis.add(g);
      return g;
    };
    const legL = leg(-1),
      legR = leg(1);
    bx(0.42, 0.56, 0.25, 0, 0, 0.3, 0, torso, 0.1);
    bx(0.45, 0.35, 0.29, 7, 0, 0.37, 0, torso, 0.2); // vest
    bx(0.44, 0.07, 0.27, 8, 0, 0.05, 0, torso, 0.3);
    bx(0.3, 0.32, 0.13, 8, 0, 0.36, 0.2, torso, 0.4); // pack
    bx(0.1, 0.09, 0.05, 8, -0.1, 0.33, -0.16, torso, 0.5); // pouches
    bx(0.1, 0.09, 0.05, 8, 0.03, 0.33, -0.16, torso, 0.6);
    aim.position.set(0, 0.5, 0);
    torso.add(aim);
    const gun = Rifle.build(true, col);
    gun.root.position.set(0.1, -0.1, -0.3);
    aim.add(gun.root);
    limb(aim, [0.25, 0, 0], [0.31, -0.24, -0.08], 0.12, 0.12, 0, mat);
    limb(aim, [0.31, -0.24, -0.08], [0.11, -0.18, -0.2], 0.105, 0.105, 0, mat);
    bx(0.085, 0.1, 0.1, 8, 0.1, -0.175, -0.215, aim, 0.7);
    limb(aim, [-0.25, 0, 0], [-0.22, -0.21, -0.3], 0.12, 0.12, 0, mat);
    limb(aim, [-0.22, -0.21, -0.3], [0.08, -0.125, -0.6], 0.105, 0.105, 0, mat);
    bx(0.09, 0.08, 0.11, 8, 0.095, -0.115, -0.63, aim, 0.8);
    bx(0.13, 0.1, 0.14, 7, 0.25, 0.01, 0, aim, 0.9); // shoulder caps
    bx(0.13, 0.1, 0.14, 7, -0.25, 0.01, 0, aim, 0.9);
    neck.position.set(0, 0.6, 0);
    torso.add(neck);
    bx(0.24, 0.25, 0.24, 0, 0, 0.14, 0, neck, 0.4);
    bx(0.29, 0.13, 0.3, 7, 0, 0.26, 0.005, neck, 0.5); // helmet
    bx(0.27, 0.06, 0.26, 7, 0, 0.17, 0.03, neck, 0.6);
    bx(0.25, 0.075, 0.04, 8, 0, 0.16, -0.115, neck, 0.7); // visor
    root.visible = false;
    return {root, pelvis, torso, aim, neck, legL, legR, gun, mat, w: {run: 0, air: 0, wall: 0, dead: 0}, spd: 0, stride: 0, px: null, pz: 0};
  }
  // s: {x, y, z, yaw, pitch, fl}
  function poseSoldier(r, s, dt, now) {
    const w = r.w,
      dead = s.fl & F_DEAD,
      gr = s.fl & F_GROUND,
      wall = s.fl & F_WR ? 1 : s.fl & F_WL ? -1 : 0;
    if (r.px != null && dt > 1e-4) {
      const d = Math.hypot(s.x - r.px, s.z - r.pz) / dt;
      if (d < 30) r.spd = damp(r.spd, d, 12, dt);
    }
    r.px = s.x;
    r.pz = s.z;
    w.run = damp(w.run, gr ? clamp(r.spd / C.SPEED, 0, 1) : 0, 10, dt);
    w.air = damp(w.air, gr || wall ? 0 : 1, 10, dt);
    w.wall = damp(w.wall, wall, 10, dt);
    w.dead = dead ? damp(w.dead, 1, 7, dt) : 0;
    if (gr || wall) r.stride += (r.spd * dt) / 2.6;
    const ph = r.stride * Math.PI * 2,
      sn = Math.sin(ph),
      sw = Math.min(1, w.run + Math.abs(w.wall));
    r.root.position.set(s.x, s.y, s.z);
    r.root.rotation.set(w.dead * 1.48, s.yaw, w.wall * 0.26, 'YXZ');
    r.legL.rotation.x = sn * 0.95 * sw - 0.55 * w.air;
    r.legR.rotation.x = -sn * 0.95 * sw + 0.3 * w.air;
    r.pelvis.position.y = 0.92 - 0.05 * Math.abs(Math.cos(ph)) * sw - 0.62 * w.dead;
    r.torso.rotation.x = -0.14 * sw;
    r.torso.rotation.y = sn * 0.07 * sw;
    r.aim.rotation.x = (dead ? -0.5 : s.pitch) - r.torso.rotation.x;
    r.aim.rotation.y = -r.torso.rotation.y;
    r.neck.rotation.x = s.pitch * 0.5;
    r.gun.update(dt);
  }
  function nameTag(name, col) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '800 34px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
    const tw = Math.min(210, g.measureText(name.toUpperCase()).width),
      x0 = 128 - tw / 2 - 20;
    g.fillStyle = '#ecebe6';
    g.fillRect(x0, 8, tw + 40, 46);
    g.strokeStyle = '#0c0c0f';
    g.lineWidth = 4;
    g.strokeRect(x0, 8, tw + 40, 46);
    g.fillStyle = colCss(col);
    g.fillRect(x0 + 2, 10, 10, 42);
    g.fillStyle = '#0c0c0f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name.toUpperCase(), 134, 33, 210);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false}));
    s.scale.set(1.9, 0.475, 1);
    s.position.y = 2.25;
    return s;
  }

  function init() {
    if (G.ready) return;
    G.ready = true;
    SCRS.push('mp', 'lobby', 'aend', 'apause');
    aScene = new THREE.Scene();
    const ch = {boxes: ACORE.MAP.boxes, vboxes: [], decor: []};
    buildMesh(ch);
    scene.remove(ch.mesh);
    aScene.add(ch.mesh);
    sunM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sunMat);
    sunM.scale.set(150, 150, 1);
    sunM.frustumCulled = false;
    aScene.add(sunM);
    // spawn marker for the hover camera
    ring = new THREE.Group();
    const rm = new THREE.MeshBasicMaterial({color: 0xff5c1a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false});
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 40), rm);
    r1.rotation.x = -Math.PI / 2;
    r1.position.y = 0.04;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 30, 0.05), rm);
    beam.position.y = 15;
    ring.add(r1, beam);
    ring.visible = false;
    aScene.add(ring);
    const tg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({color: 0xff5c1a, transparent: true, opacity: 0.95, depthWrite: false}));
      m.visible = false;
      m.frustumCulled = false;
      aScene.add(m);
      tracers.push({m, o: new V3(), d: new V3(), dist: 0, t: 0, dur: 0});
    }
    for (let i = 0; i < 72; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({color: 0x0c0c0f}));
      m.visible = false;
      m.frustumCulled = false;
      aScene.add(m);
      sparks.push({m, v: new V3(), life: 0});
    }
    // first-person view model: the rifle and two forearms
    avScene = new THREE.Scene();
    vm = new THREE.Group();
    vmGun = Rifle.build(false, PCOL[0]);
    vmMat = pmat(PCOL[0], true);
    vm.add(vmGun.root);
    limb(vm, [0.11, -0.3, 0.44], [0.005, -0.1, 0.1], 0.07, 0.07, 7, vmMat);
    const g1 = mkBox(0.07, 0.085, 0.085, 8, 0.6, vmMat);
    g1.position.set(0.004, -0.085, 0.085);
    g1.rotation.x = -0.32;
    vm.add(g1);
    limb(vm, [-0.17, -0.3, 0.1], [-0.012, -0.012, -0.3], 0.066, 0.066, 7, vmMat);
    const g2 = mkBox(0.075, 0.05, 0.11, 8, 0.7, vmMat);
    g2.position.set(-0.004, 0.0, -0.33);
    vm.add(g2);
    vm.scale.setScalar(0.82);
    avScene.add(vm);
    bindUI();
  }
  function setVmColor(col) {
    vmGun.mats.tint.setRGB(col[0], col[1], col[2]);
    vmMat.uniforms.uBody.value.set(col[0], col[1], col[2], 1);
  }

  // ---- fx -------------------------------------------------------------------------------------------------
  function tracer(o, e, col) {
    const t = tracers[ti++ % tracers.length];
    t.o.copy(o);
    t.d.copy(e).sub(o);
    t.dist = t.d.length();
    if (t.dist < 0.5) return;
    t.d.multiplyScalar(1 / t.dist);
    t.t = 0;
    t.dur = clamp(t.dist / 240, 0.045, 0.22);
    t.m.material.color.setRGB(col[0] * 0.95, col[1] * 0.8, col[2] * 0.7);
    t.m.quaternion.setFromUnitVectors(ZAX, t.d);
    t.m.visible = true;
  }
  function burst(p, n, col) {
    for (let i = 0; i < n; i++) {
      const s = sparks[si++ % sparks.length];
      s.m.position.copy(p);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(7);
      s.life = 0.16 + Math.random() * 0.2;
      s.m.material.color.setRGB(col[0], col[1], col[2]);
      s.m.visible = true;
    }
  }
  function updateFx(dt) {
    for (const t of tracers) {
      if (!t.m.visible) continue;
      t.t += dt;
      const k = t.t / t.dur;
      if (k >= 1) {
        t.m.visible = false;
        continue;
      }
      const head = t.dist * k,
        tail = Math.max(0, head - 8),
        len = Math.max(0.05, head - tail);
      t.m.position.copy(t.o).addScaledVector(t.d, (head + tail) / 2);
      t.m.scale.set(0.035, 0.035, len);
    }
    for (const s of sparks) {
      if (!s.m.visible) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.m.visible = false;
        continue;
      }
      s.v.y -= 22 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.scale.setScalar(0.03 + s.life * 0.22);
      s.m.rotation.x += dt * 14;
      s.m.rotation.z += dt * 11;
    }
  }

  // ---- players --------------------------------------------------------------------------------------------
  function syncRoster() {
    const ids = new Set(Net.st.roster.map((r) => r.id));
    for (const r of Net.st.roster) {
      let pl = G.players.get(r.id);
      if (!pl) {
        const col = colOf(r.id);
        pl = {id: r.id, name: r.name, col, rig: buildSoldier(col), buf: [], cur: null, alive: false, kills: 0, deaths: 0};
        pl.tag = nameTag(r.name, col);
        pl.rig.root.add(pl.tag);
        aScene.add(pl.rig.root);
        G.players.set(r.id, pl);
        if (G.phase === 'match' && r.id !== Net.st.id) feed(null, pl, 'joined');
      }
      pl.name = r.name;
    }
    for (const [id, pl] of G.players)
      if (!ids.has(id)) {
        aScene.remove(pl.rig.root);
        G.players.delete(id);
        if (G.phase === 'match') feed(null, pl, 'left');
      }
    G.me = G.players.get(Net.st.id) || null;
    if (G.me) {
      myRig = G.me.rig;
      G.me.tag.visible = false;
      setVmColor(G.me.col);
    }
    if (G.phase === 'lobby') drawLobby();
    drawBoard();
  }
  // where a remote player is "now" (rendered 100 ms in the past so there are always two snapshots to blend)
  function sample(pl, t) {
    const b = pl.buf;
    if (!b.length) return null;
    let i = b.length - 1;
    while (i > 0 && b[i].t > t) i--;
    const a = b[i],
      c = b[Math.min(i + 1, b.length - 1)],
      k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 0;
    return {
      x: lerp(a.p[0], c.p[0], k), y: lerp(a.p[1], c.p[1], k), z: lerp(a.p[2], c.p[2], k),
      yaw: lerpA(a.a[0], c.a[0], k), pitch: lerp(a.a[1], c.a[1], k), fl: k < 0.5 ? a.fl : c.fl,
    };
  }
  function myFlags() {
    const P = G.P;
    return (P && P.grounded ? F_GROUND : 0) | (P && P.wall > 0 ? F_WR : 0) | (P && P.wall < 0 ? F_WL : 0) | (G.alive ? 0 : F_DEAD) | (G.W.reload > 0 ? F_RELOAD : 0);
  }
  const myPose = () => ({x: G.P.x, y: G.P.y, z: G.P.z, yaw: G.look.yaw, pitch: G.look.pitch, fl: myFlags()});

  // ---- match flow -----------------------------------------------------------------------------------------
  function resetScores() {
    for (const pl of G.players.values()) pl.kills = pl.deaths = 0;
  }
  function hostStart() {
    if (!Net.isHost || G.phase !== 'lobby') return;
    const idx = ACORE.SPAWNS.map((_, i) => i).sort(() => Math.random() - 0.5),
      sp = {};
    let n = 0;
    for (const id of G.players.keys()) sp[id] = idx[n++ % idx.length];
    const m = {t: 'start', s: G.set, sp, el: 0};
    Net.send(m);
    Net.setPoll(6000);
    startMatch(m);
  }
  function startMatch(m) {
    if (!G.me) return;
    Object.assign(G.set, cleanSet(m.s));
    resetScores();
    if (m.k) applyScores(m);
    G.phase = 'match';
    G.ended = null;
    G.t0 = nowS() - (m.el || 0);
    G.rec.length = 0;
    G.shots.length = 0;
    G.death = null;
    G.replay = null;
    for (const pl of G.players.values()) {
      pl.buf.length = 0;
      pl.cur = null;
    }
    const si = m.sp && m.sp[G.me.id] != null ? m.sp[G.me.id] % ACORE.SPAWNS.length : null;
    spawn(si != null ? ACORE.SPAWNS[si] : ACORE.pickSpawn(alivePos()));
    game.state = 'arena';
    show(null);
    hud(false);
    E.hud.classList.add('on');
    E.feed.innerHTML = '';
    setPaused(false);
    big('Go.');
    A.intensity(0.55);
    A.rise();
    E.kt.textContent = G.set.kills;
    if (!navigator.userActivation || navigator.userActivation.isActive) In.lock();
    // a joiner's match starts from a network message, not a click, so the browser may refuse the mouse lock
    setTimeout(() => {
      if (G.phase === 'match' && In.canLock() && !In.locked) setPaused(true, 'Match is live.');
    }, 400);
  }
  function spawn(sp) {
    G.P = ACORE.newPlayer(sp);
    G.look.yaw = sp.yaw;
    G.look.pitch = 0;
    G.kick.p = G.kick.y = 0;
    G.hp = G.set.hp;
    G.alive = true;
    G.invuln = nowS() + 1.5;
    G.W.ammo = GUN.mag;
    G.W.reload = 0;
    G.death = null;
    G.replay = null;
    G.flash = 0.7;
    ring.visible = false;
    E.death.classList.remove('on');
    if (G.me) setVmColor(G.me.col);
    if (myRig) {
      myRig.px = null;
      myRig.w.dead = 0;
    }
  }
  const alivePos = () => {
    const out = [];
    for (const pl of G.players.values()) if (pl !== G.me && pl.cur && !(pl.cur.fl & F_DEAD)) out.push([pl.cur.x, pl.cur.y, pl.cur.z]);
    return out;
  };
  function dieLocal(killer, head) {
    if (!G.alive) return;
    G.alive = false;
    G.hp = 0;
    G.inp.fire = false;
    const now = nowS(),
      total = G.set.respawn,
      R = Math.min(5, total / 2);
    G.death = {t: now, killer, R, total, hover: false, si: 0};
    Net.send({t: 'die', k: killer, hd: !!head});
    onDeath(G.me.id, killer, head);
    A.death();
    G.hurt = 0.5;
    buzz([40, 30, 80]);
    const kp = G.players.get(killer);
    E.dby.textContent = kp ? 'Killed by ' + kp.name : 'You fell';
    E.dtag.textContent = 'Kill replay';
    E.death.classList.add('on');
  }
  function onDeath(victim, killer, head) {
    const v = G.players.get(victim),
      k = killer !== victim ? G.players.get(killer) : null;
    if (!v) return;
    v.deaths++;
    if (k) k.kills++;
    feed(k, v, head ? 'headshot' : '');
    if (k === G.me && v !== G.me) {
      big((head ? 'Headshot. ' : 'Down. ') + v.name);
      A.cp();
      buzz(20);
    }
    if (Net.isHost) {
      Net.send(scoreMsg('sc'));
      if (k && k.kills >= G.set.kills) hostEnd(k.id);
    }
    drawBoard();
  }
  const scoreMsg = (t) => {
    const k = {},
      d = {};
    for (const pl of G.players.values()) {
      k[pl.id] = pl.kills;
      d[pl.id] = pl.deaths;
    }
    return {t, k, d};
  };
  function applyScores(m) {
    for (const pl of G.players.values()) {
      if (m.k && isFinite(m.k[pl.id])) pl.kills = m.k[pl.id] | 0;
      if (m.d && isFinite(m.d[pl.id])) pl.deaths = m.d[pl.id] | 0;
    }
    drawBoard();
  }
  function hostEnd(w) {
    if (G.phase !== 'match') return;
    const m = Object.assign(scoreMsg('end'), {w});
    Net.send(m);
    endMatch(m);
  }
  function endMatch(m) {
    if (G.phase !== 'match') return;
    applyScores(m);
    G.phase = 'end';
    G.ended = {w: m.w, t: nowS()};
    G.alive = false;
    G.inp.fire = false;
    E.hud.classList.remove('on');
    E.death.classList.remove('on');
    ring.visible = false;
    In.unlock();
    const wp = G.players.get(m.w);
    $id('ae-title').textContent = wp ? (wp === G.me ? 'You win.' : wp.name + ' wins.') : 'Time.';
    $id('ae-sub').textContent = wp && wp === G.me ? 'First to ' + G.set.kills + '. Clean.' : wp ? 'Reached ' + wp.kills + ' kills' : 'Nobody scored';
    $id('ae-board').innerHTML = '';
    $id('ae-board').appendChild(boardTable());
    $id('ae-again').style.display = Net.isHost ? '' : 'none';
    $id('ae-note').textContent = Net.isHost ? '' : 'Waiting for the host';
    show('aend');
    A.intensity(0.25);
    if (wp === G.me) A.uiUnlock();
    else A.cp();
  }
  function toLobby() {
    G.phase = 'lobby';
    G.ended = null;
    game.state = 'lobby';
    E.hud.classList.remove('on');
    setPaused(false);
    In.unlock();
    show('lobby');
    Net.setPoll(2000);
    drawLobby();
    A.intensity(0.25);
  }
  function leave(msg) {
    Net.leave();
    closeAll(msg);
  }
  function closeAll(msg) {
    for (const pl of G.players.values()) aScene.remove(pl.rig.root);
    G.players.clear();
    G.me = null;
    myRig = null;
    G.phase = 'off';
    E.hud.classList.remove('on');
    In.unlock();
    openMenu(msg);
  }
  const cleanSet = (s) => {
    const o = {};
    for (const [k, , mn, mx] of RULES) o[k] = clamp(Math.round(+(s && s[k]) || 0), mn, mx);
    return o;
  };

  // ---- network messages -----------------------------------------------------------------------------------
  Net.on.roster = () => G.ready && syncRoster();
  Net.on.closed = (why) => G.ready && closeAll(why);
  Net.on.joined = (id) => {
    Net.send({t: 'cfg', s: G.set, to: id});
    if (G.phase === 'match') Net.send(Object.assign(scoreMsg('start'), {s: G.set, sp: {}, el: nowS() - G.t0, to: id}));
  };
  Net.on.msg = (m) => {
    const pl = G.players.get(m.f),
      now = nowS();
    if (m.t === 's') {
      if (!pl || pl === G.me || !fin(m.p, 3) || !fin(m.a, 2)) return;
      pl.buf.push({t: now, p: m.p, a: m.a, fl: m.fl | 0});
      if (pl.buf.length > 30) pl.buf.shift();
    } else if (m.t === 'f') {
      if (!pl || pl === G.me || !pl.cur || !fin(m.e, 3)) return;
      const o = [pl.cur.x, pl.cur.y + C.EYE, pl.cur.z];
      G.shots.push({t: now, id: pl.id, o, e: m.e});
      if (!G.replay) showShot(pl, o, m.e, false);
    } else if (m.t === 'hit') {
      if (!pl || !G.alive || G.phase !== 'match' || now < G.invuln) return;
      const d = clamp(+m.d || 0, 0, GUN.head);
      G.hp -= d;
      G.hurt = Math.min(1, G.hurt + 0.55);
      A.impact();
      buzz(25);
      if (G.hp <= 0) dieLocal(pl.id, !!m.hd);
    } else if (m.t === 'die') {
      if (pl && pl !== G.me) onDeath(pl.id, typeof m.k === 'number' ? m.k : -1, !!m.hd);
    } else if (m.f === 0) {
      // only the host may send these
      if (m.t === 'sc') applyScores(m);
      else if (m.t === 'cfg') {
        Object.assign(G.set, cleanSet(m.s));
        drawLobby();
      } else if (m.t === 'start') startMatch(m);
      else if (m.t === 'end') endMatch(m);
      else if (m.t === 'lobby') toLobby();
    }
  };
  const tv = new V3(),
    tv2 = new V3();
  function showShot(pl, o, e, quiet) {
    const rig = pl.rig;
    if (rig.root.visible) {
      rig.gun.fire();
      rig.gun.muzzle.getWorldPosition(tv);
    } else tv.set(o[0], o[1] - 0.12, o[2]);
    tv2.set(e[0], e[1], e[2]);
    tracer(tv, tv2, pl.col);
    burst(tv2, 3, [0.05, 0.05, 0.06]);
    const d = tv.distanceTo(camera.position);
    A.shot(clamp(1 - d / 75, 0.07, 0.75) * (quiet ? 0.6 : 1));
  }

  // ---- weapon ---------------------------------------------------------------------------------------------
  function reload() {
    if (G.W.reload > 0 || G.W.ammo >= GUN.mag || !G.alive) return;
    G.W.reload = GUN.reload;
    A.reload();
  }
  function fire(now, third) {
    const W = G.W;
    if (W.reload > 0 || now < W.next) return;
    if (W.ammo <= 0) {
      W.next = now + 0.25;
      A.tick();
      reload();
      return;
    }
    W.ammo--;
    W.next = now + GUN.gap;
    const P = G.P,
      moving = Math.hypot(P.vx, P.vz) / C.SPEED,
      sp = 0.003 + G.bloom + moving * 0.007 + (P.grounded ? 0 : 0.014),
      a = Math.random() * 6.283,
      r = Math.sqrt(Math.random()) * sp;
    const yaw = G.look.yaw + G.kick.y + Math.cos(a) * r,
      pitch = clamp(G.look.pitch + G.kick.p + Math.sin(a) * r, -1.5, 1.5);
    let d = fwdOf(yaw, pitch);
    const eye = [P.x, P.y + G.eye, P.z];
    let o = eye;
    if (third) {
      // aim where the camera's crosshair lands, but shoot from the head
      const co = [camera.position.x, camera.position.y, camera.position.z],
        hit = trace(co, d),
        ap = [co[0] + d[0] * hit.t, co[1] + d[1] * hit.t, co[2] + d[2] * hit.t],
        dx = ap[0] - eye[0],
        dy = ap[1] - eye[1],
        dz = ap[2] - eye[2],
        l = Math.hypot(dx, dy, dz) || 1;
      d = [dx / l, dy / l, dz / l];
    }
    const h = trace(o, d),
      e = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t];
    if (h.pl) {
      Net.send({t: 'hit', to: h.pl.id, d: h.head ? GUN.head : GUN.dmg, hd: h.head});
      hitmark(h.head);
      burst(tv.set(e[0], e[1], e[2]), 5, h.pl.col);
    } else if (h.t < GUN.range) burst(tv.set(e[0], e[1], e[2]), 4, [0.05, 0.05, 0.06]);
    // visuals: from the muzzle you can see
    if (third && myRig) {
      myRig.gun.fire();
      myRig.gun.muzzle.getWorldPosition(tv);
    } else {
      const f = fwdOf(yaw, pitch),
        rx = Math.cos(yaw),
        rz = -Math.sin(yaw);
      tv.set(eye[0] + f[0] * 0.95 + rx * 0.15, eye[1] + f[1] * 0.95 - 0.12, eye[2] + f[2] * 0.95 + rz * 0.15);
    }
    tracer(tv, tv2.set(e[0], e[1], e[2]), G.me.col);
    vmGun.fire();
    G.vmKick = 1;
    G.kick.p += 0.0125 + Math.random() * 0.004;
    G.kick.y += (Math.random() - 0.5) * 0.009;
    G.bloom = Math.min(0.03, G.bloom + 0.0045);
    A.shot(1);
    buzz(6);
    const er = e.map((v) => +v.toFixed(2));
    Net.send({t: 'f', e: er}, true);
    G.shots.push({t: now, id: G.me.id, o: eye, e: er});
  }
  // nearest thing along a ray: the map, or another living player
  function trace(o, d) {
    let t = ACORE.rayMap(o, d, GUN.range),
      pl = null,
      head = false;
    for (const q of G.players.values()) {
      if (q === G.me || !q.cur || q.cur.fl & F_DEAD) continue;
      const h = ACORE.rayPlayer(o, d, [q.cur.x, q.cur.y, q.cur.z], t);
      if (h && h.t < t) {
        t = h.t;
        pl = q;
        head = h.head;
      }
    }
    return {t, pl, head};
  }

  // ---- kill replay ----------------------------------------------------------------------------------------
  function record(now, dt) {
    G.recAcc += dt;
    if (G.recAcc < 1 / REC_HZ) return;
    G.recAcc = 0;
    const s = {};
    for (const pl of G.players.values()) {
      const c = pl === G.me ? (G.P ? myPose() : null) : pl.cur;
      if (c) s[pl.id] = [c.x, c.y, c.z, c.yaw, c.pitch, c.fl];
    }
    G.rec.push({t: now, s});
    while (G.rec.length && now - G.rec[0].t > REC_KEEP) G.rec.shift();
    while (G.shots.length && now - G.shots[0].t > REC_KEEP) G.shots.shift();
  }
  function recAt(t) {
    const r = G.rec;
    if (!r.length) return null;
    let i = r.length - 1;
    while (i > 0 && r[i].t > t) i--;
    const a = r[i],
      b = r[Math.min(i + 1, r.length - 1)],
      k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0,
      out = {};
    for (const id in a.s) {
      const p = a.s[id],
        q = b.s[id] || p;
      out[id] = {x: lerp(p[0], q[0], k), y: lerp(p[1], q[1], k), z: lerp(p[2], q[2], k), yaw: lerpA(p[3], q[3], k), pitch: lerp(p[4], q[4], k), fl: k < 0.5 ? p[5] : q[5]};
    }
    return out;
  }
  // While dead: R seconds of replay ending just after the kill, then hover over the next spawn point.
  function deathTick(now) {
    const D = G.death,
      el = now - D.t;
    if (el >= D.total) {
      spawn(D.spawn || ACORE.pickSpawn(alivePos()));
      big('Again.');
      A.rise();
      return;
    }
    if (el < D.R) {
      if (!G.replay) {
        // the replay is seen through the killer's eyes, so the rifle in view is theirs
        const kp = G.players.get(D.killer);
        if (kp) setVmColor(kp.col);
      }
      const t = D.t - D.R + 0.5 + el;
      G.replay = {t, prev: G.replay ? G.replay.t : t, killer: D.killer};
    } else {
      G.replay = null;
      if (!D.hover) {
        D.hover = true;
        D.spawn = ACORE.pickSpawn(alivePos());
        ring.position.set(D.spawn.x, D.spawn.y, D.spawn.z);
        ring.visible = true;
        E.dtag.textContent = 'Deploying';
        G.flash = 0.5;
      }
    }
    E.dcd.textContent = 'Respawn in ' + Math.ceil(D.total - el);
    E.dbf.style.width = (el / D.total) * 100 + '%';
  }

  // ---- frame ----------------------------------------------------------------------------------------------
  function readInput() {
    const I = G.inp;
    if (modeNow() !== 'touch' || K.KeyW || K.KeyS || K.KeyA || K.KeyD) {
      I.mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
      I.mz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0);
    } else {
      I.mx = T.mx;
      I.mz = T.mz;
    }
  }
  function handleEv(P) {
    for (const e of P.ev) {
      if (e.t === 'jump') A.jump();
      else if (e.t === 'land') {
        A.land(e.v);
        G.vmKick = Math.max(G.vmKick, clamp(e.v / 30, 0, 0.6));
        if (e.v > 13) buzz(10);
      } else if (e.t === 'wallrun') {
        A.dash();
        buzz(8);
      } else if (e.t === 'walljump') A.pad();
      else if (e.t === 'fell') dieLocal(-1, false);
    }
  }
  function frame(raw, now) {
    const match = G.phase === 'match';
    G.hurt = damp(G.hurt, 0, 2.2, raw);
    G.flash = damp(G.flash, 0, 5, raw);
    if (match) {
      const third = S.view === 'third';
      if (G.alive) {
        readInput();
        const I = G.inp;
        ACORE.step(G.P, {mx: G.paused ? 0 : I.mx, mz: G.paused ? 0 : I.mz, jump: I.jump && !G.paused, yaw: G.look.yaw}, raw);
        I.jump = false;
        handleEv(G.P);
      }
      if (G.alive) {
        const W = G.W,
          P = G.P;
        if (W.reload > 0) {
          W.reload -= raw;
          if (W.reload <= 0) {
            W.reload = 0;
            W.ammo = GUN.mag;
          }
        }
        if (G.inp.fire && !G.paused) fire(now, third);
        G.kick.p = damp(G.kick.p, 0, 9, raw);
        G.kick.y = damp(G.kick.y, 0, 9, raw);
        G.bloom = damp(G.bloom, 0, 5, raw);
        const n = Math.floor(P.stride * 2);
        if (n !== G.stepN) {
          G.stepN = n;
          if (P.grounded || P.wall) A.step(P.wall ? 0.9 : clamp(Math.hypot(P.vx, P.vz) / C.SPEED, 0.2, 0.8), n & 1);
        }
        A.wind(clamp((Math.hypot(P.vx, P.vz) - 7) / 9, 0, 1) * 0.5, !P.grounded);
      } else if (G.death) deathTick(now);
      // score and clock
      if (G.set.time) {
        const left = G.set.time * 60 - (now - G.t0);
        E.time.textContent = Math.max(0, Math.floor(left / 60)) + ':' + String(Math.max(0, Math.floor(left % 60))).padStart(2, '0');
        if (left <= 0 && Net.isHost) {
          let top = null;
          for (const pl of G.players.values()) if (!top || pl.kills > top.kills) top = pl;
          hostEnd(top && top.kills > 0 ? top.id : -1);
        }
      } else E.time.textContent = '';
      // network: 20 snapshots a second
      G.sendAcc += raw;
      if (G.sendAcc >= 0.05 && G.P) {
        G.sendAcc = 0;
        const P = G.P;
        Net.send({t: 's', p: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)], a: [+G.look.yaw.toFixed(3), +(G.look.pitch + G.kick.p).toFixed(3)], fl: myFlags()}, true);
      }
    }
    // everyone else
    for (const pl of G.players.values()) if (pl !== G.me) pl.cur = sample(pl, now - 0.1) || pl.cur;
    if (match && G.P) record(now, raw);
    pose(raw, now);
    cam(raw, now);
    if (match) {
      viewModel(raw, now);
      hudTick(now);
    }
    updateFx(raw);
    draw(now);
  }
  // Put every soldier where it should be drawn: live, or from the recording during a replay.
  function pose(raw, now) {
    const rp = G.replay,
      fr = rp ? recAt(rp.t) : null,
      third = S.view === 'third';
    for (const pl of G.players.values()) {
      const me = pl === G.me;
      let s;
      if (fr) s = fr[pl.id];
      else if (me) s = G.P && G.phase === 'match' ? myPose() : null;
      else s = pl.cur;
      let vis = !!s && G.phase !== 'lobby';
      if (fr && pl.id === rp.killer) vis = false; // you are looking through their eyes
      if (!fr && me) vis = vis && third && G.alive; // your own body only shows in third person
      pl.rig.root.visible = vis;
      if (s) poseSoldier(pl.rig, s, raw, now);
      else pl.rig.px = null;
    }
    if (rp) {
      // replay the shots as the recording passes them
      for (const sh of G.shots)
        if (sh.t > rp.prev && sh.t <= rp.t) {
          const pl = G.players.get(sh.id);
          if (!pl) continue;
          if (sh.id === rp.killer) {
            vmGun.fire();
            G.vmKick = 1;
            const c = fr && fr[sh.id];
            if (c) {
              const f = fwdOf(c.yaw, c.pitch);
              tv.set(sh.o[0] + f[0] * 0.95 + Math.cos(c.yaw) * 0.15, sh.o[1] + f[1] * 0.95 - 0.12, sh.o[2] + f[2] * 0.95 - Math.sin(c.yaw) * 0.15);
              tracer(tv, tv2.set(sh.e[0], sh.e[1], sh.e[2]), pl.col);
              burst(tv2, 3, [0.05, 0.05, 0.06]);
            }
            A.shot(0.7);
          } else showShot(pl, sh.o, sh.e, true);
        }
    }
  }
  let camFP = false;
  function cam(raw, now) {
    let px, py, pz, yaw, pitch, roll = 0, fov = baseVFov();
    camFP = false;
    const orbit = (cx, cy, cz, rad, h, sp, clip) => {
      const a = now * sp,
        dx = Math.cos(a) * rad,
        dz = Math.sin(a) * rad,
        l = Math.hypot(dx, h - 1, dz),
        d = [dx / l, (h - 1) / l, dz / l],
        // stay inside the map: stop short of whatever is between the subject and the camera
        k = clip ? Math.max(0.25, Math.min(l, ACORE.rayMap([cx, cy + 1, cz], d, l + 0.5) - 0.5)) : l;
      px = cx + d[0] * k;
      py = cy + 1 + d[1] * k;
      pz = cz + d[2] * k;
      yaw = Math.atan2(dx, dz);
      pitch = -Math.atan2(h - 1, rad);
    };
    const rp = G.replay,
      fr = rp ? recAt(rp.t) : null;
    if (G.phase !== 'match') {
      const w = G.ended && G.players.get(G.ended.w);
      if (w && w.cur) orbit(w.cur.x, w.cur.y, w.cur.z, 5.5, 2.6, 0.5, true);
      else orbit(0, 0, 0, 44, 26, 0.07);
    } else if (fr && fr[rp.killer]) {
      const c = fr[rp.killer];
      px = c.x;
      py = c.y + C.EYE;
      pz = c.z;
      yaw = c.yaw;
      pitch = c.pitch;
      roll = (c.fl & F_WR ? 1 : c.fl & F_WL ? -1 : 0) * 0.14;
      camFP = true;
    } else if (fr && fr[G.me.id]) {
      // no killer to watch (you fell): follow yourself from behind
      const c = fr[G.me.id],
        f = fwdOf(c.yaw, -0.25);
      px = c.x - f[0] * 4.5;
      py = Math.max(c.y + 2.4, -6);
      pz = c.z - f[2] * 4.5;
      yaw = c.yaw;
      pitch = -0.3;
    } else if (!G.alive && G.death && G.death.spawn) {
      const s = G.death.spawn;
      orbit(s.x, s.y, s.z, 6, 4, 0.55, true);
    } else if (G.P) {
      const P = G.P,
        third = S.view === 'third',
        sn = clamp(Math.hypot(P.vx, P.vz) / C.SPEED, 0, 1.3);
      yaw = G.look.yaw + G.kick.y;
      pitch = clamp(G.look.pitch + G.kick.p, -1.5, 1.5);
      G.roll = damp(G.roll, P.wall * 0.15 * (0.4 + 0.6 * S.roll), 9, raw);
      G.fovK = damp(G.fovK, (sn > 1.02 ? 5 : 0) + (P.wall ? 5 : 0) + sn * 2, 6, raw);
      fov += G.fovK;
      roll = G.roll;
      const bob = P.grounded ? Math.sin(P.stride * Math.PI * 2) * 0.03 * S.bob * sn : 0;
      if (!third) {
        px = P.x;
        py = P.y + G.eye + bob;
        pz = P.z;
        camFP = true;
      } else {
        const f = fwdOf(yaw, pitch),
          rx = Math.cos(yaw),
          rz = -Math.sin(yaw),
          piv = [P.x + rx * 0.62, P.y + 1.62, P.z + rz * 0.62],
          back = [-f[0], -f[1], -f[2]],
          dist = Math.max(0.5, Math.min(3.5, ACORE.rayMap(piv, back, 3.8) - 0.3));
        px = piv[0] + back[0] * dist;
        py = piv[1] + back[1] * dist + 0.1;
        pz = piv[2] + back[2] * dist;
        roll *= 0.5;
      }
    } else orbit(0, 0, 0, 44, 26, 0.07);
    camera.position.set(px, py, pz);
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.fov = fov;
    camera.updateProjectionMatrix();
    U.uCam.value.set(px, py, pz);
    sunM.position.set(px + SUNDIR.x * 700, py + SUNDIR.y * 700 + 40, pz + SUNDIR.z * 700);
    sunM.lookAt(camera.position);
  }
  function viewModel(raw, now) {
    const P = G.P,
      W = G.W,
      live = G.alive && !G.replay;
    G.vmKick = damp(G.vmKick, 0, 16, raw);
    const dy = live ? wrapPi(G.look.yaw - G.lastYaw) : 0;
    G.lastYaw = G.look.yaw;
    G.swayX = damp(G.swayX, clamp(dy * 1.4, -0.05, 0.05), 10, raw);
    const sn = live ? clamp(Math.hypot(P.vx, P.vz) / C.SPEED, 0, 1) * (P.grounded || P.wall ? 1 : 0) : 0,
      ph = live ? P.stride * Math.PI * 2 : 0,
      k = G.vmKick,
      rl = live && W.reload > 0 ? 1 - W.reload / GUN.reload : -1;
    // reload: tip the rifle up and in, drop the magazine, seat a new one
    const e = (a, b, x) => clamp((x - a) / (b - a), 0, 1),
      ss = (x) => x * x * (3 - 2 * x);
    const tip = rl < 0 ? 0 : ss(e(0, 0.18, rl)) * (1 - ss(e(0.8, 1, rl))),
      out = rl < 0 ? 0 : ss(e(0.12, 0.34, rl)) * (1 - ss(e(0.5, 0.72, rl)));
    vmGun.mag.position.set(0, -0.3 * out, 0.03 * out);
    vmGun.mag.rotation.x = -0.5 * out;
    vm.position.set(
      0.17 + G.swayX * 0.5 + Math.sin(ph) * 0.006 * sn - tip * 0.03,
      -0.175 + Math.abs(Math.cos(ph)) * 0.008 * sn - (live ? clamp(P.vy * 0.0022, -0.03, 0.03) : 0) + k * 0.006 - tip * 0.05,
      -0.44 + k * 0.045 + tip * 0.03,
    );
    vm.rotation.set(k * 0.055 + tip * 0.42 - sn * 0.01, 0.035 + G.swayX * 1.2 + tip * 0.3, -G.roll * 0.6 - G.swayX * 1.5 - tip * 0.55, 'YXZ');
    vmGun.update(raw);
  }
  const wrapPi = (a) => {
    a %= Math.PI * 2;
    return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a;
  };
  function draw(now) {
    U.uTime.value = now;
    U.uAmb.value = 0.3;
    U.uLight.value.setRGB(...PAL.l);
    U.uFog.value.setRGB(...PAL.f);
    U.uAccent.value.setRGB(...PAL.a);
    renderer.setClearColor(U.uFog.value, 1);
    renderer.setRenderTarget(rt);
    renderer.clear(true, true, true);
    renderer.render(aScene, camera);
    if (camFP && G.phase === 'match' && (G.alive || G.replay)) {
      renderer.clearDepth();
      renderer.render(avScene, vmCam);
    }
    renderer.setRenderTarget(null);
    const u = postU;
    u.tS.value = rt.texture;
    u.uTime.value = now;
    u.uBlur.value = 0;
    u.uChroma.value = 0.3;
    u.uVig.value = 0.3 + G.hurt * 0.25;
    u.uSlow.value = G.replay ? 0.55 : 0;
    u.uFlash.value = G.flash;
    u.uRed.value = G.hurt;
    u.uShat.value = 0;
    postQuad.material = postMats[2];
    renderer.render(postScene, postCam);
    el.fxr.style.opacity = G.hurt * 0.7;
  }

  // ---- HUD ------------------------------------------------------------------------------------------------
  let hudLast = {};
  const setTxt = (k, e, v) => {
    if (hudLast[k] !== v) {
      hudLast[k] = v;
      e.textContent = v;
    }
  };
  function hudTick(now) {
    setTxt('k', E.k, String(G.me ? G.me.kills : 0).padStart(2, '0'));
    setTxt('hp', E.hpn, Math.max(0, Math.ceil(G.hp)));
    const hk = clamp(G.hp / G.set.hp, 0, 1);
    if (hudLast.hk !== hk) {
      hudLast.hk = hk;
      E.hpf.style.width = hk * 100 + '%';
      E.hp.classList.toggle('low', hk < 0.35);
    }
    setTxt('am', E.am, G.W.reload > 0 ? '--' : String(G.W.ammo).padStart(2, '0'));
    const lowAm = G.W.reload <= 0 && G.W.ammo <= 6;
    if (hudLast.la !== lowAm) {
      hudLast.la = lowAm;
      E.ammo.classList.toggle('low', lowAm);
    }
    const P = G.P,
      gap = 5 + (G.bloom + (P ? (Math.hypot(P.vx, P.vz) / C.SPEED) * 0.007 + (P.grounded ? 0 : 0.014) : 0)) * 900;
    E.xh.style.setProperty('--g', gap.toFixed(1) + 'px');
    const showX = G.alive && !G.paused;
    if (hudLast.x !== showX) {
      hudLast.x = showX;
      E.xh.classList.toggle('on', showX);
      E.touch.classList.toggle('on', showX && modeNow() === 'touch');
      E.hp.classList.toggle('off', !G.alive);
      E.ammo.classList.toggle('off', !G.alive);
    }
    const rl = G.W.reload > 0 && G.alive;
    if (hudLast.rl !== rl) {
      hudLast.rl = rl;
      E.xh.classList.toggle('reload', rl);
    }
  }
  function hitmark(head) {
    E.xh.classList.remove('hit', 'head');
    void E.xh.offsetWidth;
    E.xh.classList.add('hit');
    if (head) E.xh.classList.add('head');
    A.hitmark(head);
  }
  function big(t) {
    E.bigs.textContent = t;
    E.bigs.classList.remove('on');
    void E.bigs.offsetWidth;
    E.bigs.classList.add('on');
  }
  function feed(k, v, how) {
    const d = document.createElement('div');
    const nm = (pl) => {
      const b = document.createElement('b');
      b.textContent = pl.name;
      b.style.borderColor = colCss(pl.col);
      return b;
    };
    if (how === 'joined' || how === 'left') {
      d.appendChild(nm(v));
      d.appendChild(document.createTextNode(how));
    } else {
      if (k) d.appendChild(nm(k));
      const i = document.createElement('i');
      i.textContent = k ? (how === 'headshot' ? 'headshot' : 'shot') : 'fell';
      if (how === 'headshot') i.className = 'hs';
      if (k) {
        d.appendChild(i);
        d.appendChild(nm(v));
      } else {
        d.appendChild(nm(v));
        d.appendChild(i);
      }
    }
    E.feed.appendChild(d);
    while (E.feed.children.length > 5) E.feed.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }
  function boardTable() {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th></th><th>Player</th><th>Kills</th><th>Deaths</th></tr></thead>';
    const tb = document.createElement('tbody');
    [...G.players.values()]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .forEach((pl, i) => {
        const tr = document.createElement('tr');
        if (pl === G.me) tr.className = 'me';
        const c = (v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
          return td;
        };
        c(i + 1);
        const n = c(pl.name + (pl.id === 0 ? ' (host)' : ''));
        n.style.borderLeftColor = colCss(pl.col);
        n.className = 'nm';
        c(pl.kills);
        c(pl.deaths);
        tb.appendChild(tr);
      });
    t.appendChild(tb);
    return t;
  }
  function drawBoard() {
    if (!E.board || !G.board) return;
    E.board.innerHTML = '';
    E.board.appendChild(boardTable());
  }
  function setBoard(on) {
    G.board = on;
    E.board.classList.toggle('on', on);
    drawBoard();
  }
  function setPaused(on, title) {
    G.paused = on;
    if (on) {
      $id('ap-title').textContent = title || 'Menu.';
      In.unlock();
      show('apause');
    } else if (G.phase === 'match') show(null);
  }

  // ---- menu and lobby UI ----------------------------------------------------------------------------------
  function status(t, bad) {
    E.status.textContent = t || '';
    E.status.classList.toggle('bad', !!bad);
  }
  function openMenu(msg) {
    init();
    game.state = 'mp';
    hud(false);
    show('mp');
    status(msg || '', !!msg);
    $id('am-name').value = localStorage.getItem('fs_name') || '';
    busy(false);
    A.intensity(0.2);
  }
  const myName = () => {
    const n = Net.cleanName($id('am-name').value);
    try {
      localStorage.setItem('fs_name', n);
    } catch (e) {}
    return n;
  };
  function busy(on) {
    for (const b of document.querySelectorAll('#mp [data-ar=host], #mp [data-ar=join]')) b.disabled = on;
  }
  function enterLobby() {
    G.phase = 'lobby';
    game.state = 'lobby';
    syncRoster();
    show('lobby');
    drawLobby();
  }
  async function doHost() {
    busy(true);
    status('Opening a lobby');
    try {
      G.set = Object.assign({}, DEFSET);
      const code = await Net.host(myName());
      if (!code) return;
      enterLobby();
    } catch (e) {
      status(e.message, true);
    }
    busy(false);
  }
  async function doJoin() {
    const code = $id('am-code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 6) return status('A lobby code is six letters', true);
    busy(true);
    status('Connecting to ' + code);
    try {
      await Net.join(code, myName());
      if (game.state === 'mp') enterLobby(); // the host may already have dropped us into a running match
    } catch (e) {
      if (e.message !== 'Cancelled') status(e.message, true);
    }
    busy(false);
  }
  function drawLobby() {
    if (!E.code) return;
    const host = Net.isHost;
    E.code.textContent = Net.st.code;
    const ul = $id('lb-players');
    ul.innerHTML = '';
    for (const pl of G.players.values()) {
      const li = document.createElement('li'),
        chip = document.createElement('i'),
        n = document.createElement('span');
      chip.style.background = colCss(pl.col);
      n.textContent = pl.name;
      li.appendChild(chip);
      li.appendChild(n);
      for (const [c, t] of [[pl.id === 0, 'Host'], [pl === G.me, 'You']])
        if (c) {
          const em = document.createElement('em');
          em.textContent = t;
          li.appendChild(em);
        }
      ul.appendChild(li);
    }
    $id('lb-n').textContent = G.players.size + ' / ' + Net.MAXP;
    $id('lb-who').textContent = host ? 'You set these' : 'Set by the host';
    const rules = $id('lb-rules');
    rules.innerHTML = '';
    for (const [k, label, mn, mx, step, fmt] of RULES) {
      const row = document.createElement('div');
      row.className = 'lb-rule';
      const l = document.createElement('label');
      l.textContent = label;
      const st = document.createElement('div');
      st.className = 'stepper';
      const mk = (txt, d) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.setAttribute('aria-label', label + (d < 0 ? ' down' : ' up'));
        b.disabled = !host || G.set[k] + d < mn || G.set[k] + d > mx;
        b.onclick = () => {
          G.set[k] = clamp(G.set[k] + d, mn, mx);
          Net.send({t: 'cfg', s: G.set});
          A.uiTick((G.set[k] - mn) / (mx - mn));
          drawLobby();
        };
        return b;
      };
      const v = document.createElement('b');
      v.textContent = fmt(G.set[k]);
      st.appendChild(mk('-', -step));
      st.appendChild(v);
      st.appendChild(mk('+', step));
      row.appendChild(l);
      row.appendChild(st);
      rules.appendChild(row);
    }
    const sb = $id('lb-start');
    sb.style.display = host ? '' : 'none';
    sb.textContent = G.players.size > 1 ? 'Start match' : 'Start solo';
    $id('lb-note').textContent = host
      ? G.players.size > 1
        ? 'Everyone here drops in when you start'
        : 'Share the code. Friends can also join after you start'
      : 'Waiting for the host to start';
  }

  // ---- controls -------------------------------------------------------------------------------------------
  const T = {mx: 0, mz: 0};
  const lookBy = (dx, dy, k) => {
    if (!G.alive || G.paused || G.phase !== 'match') return;
    G.look.yaw = wrapPi(G.look.yaw - dx * k);
    G.look.pitch = clamp(G.look.pitch - dy * k * (S.invertY ? -1 : 1), -1.45, 1.45);
  };
  function toggleView() {
    S.view = S.view === 'third' ? 'first' : 'third';
    saveS();
    document.body.dataset.view = S.view;
    A.uiToggle(true);
  }
  function bindUI() {
    for (const [k, id] of Object.entries({
      hud: 'ahud', k: 'ah-k', kt: 'ah-kt', time: 'ah-time', feed: 'ah-feed', xh: 'ah-xh', hp: 'ah-hp', hpn: 'ah-hpn', hpf: 'ah-hpf', ammo: 'ah-ammo',
      am: 'ah-am', bigs: 'ah-bigs', death: 'ah-death', dtag: 'ah-dtag', dby: 'ah-dby', dcd: 'ah-dcd', dbf: 'ah-dbf', board: 'ah-board', touch: 'ah-touch',
      status: 'am-status', code: 'lb-code',
    }))
      E[k] = $id(id);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ar]');
      if (!b || b.disabled) return;
      const a = b.dataset.ar;
      A.init();
      if (a === 'mp-back') {
        Net.leave();
        toMenu(false);
      } else if (a === 'host') doHost();
      else if (a === 'join') doJoin();
      else if (a === 'leave') leave('');
      else if (a === 'copy') {
        const done = () => {
          b.textContent = 'Copied';
          setTimeout(() => (b.textContent = 'Copy'), 1400);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(Net.st.code).then(done, () => {});
      } else if (a === 'start') {
        In.lock();
        hostStart();
      } else if (a === 'resume') {
        In.lock();
        setPaused(false);
      } else if (a === 'again') {
        if (Net.isHost) {
          Net.send({t: 'lobby'});
          toLobby();
        }
      }
    });
    const code = $id('am-code');
    code.addEventListener('input', () => {
      code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJoin();
    });
    // keyboard and mouse
    addEventListener('keydown', (e) => {
      if (G.phase !== 'match' || game.state !== 'arena') return;
      const c = e.code;
      if (c === 'Tab') {
        e.preventDefault();
        if (!e.repeat) setBoard(true);
      }
      if (e.repeat) return;
      if (c === 'Space') {
        G.inp.jump = true;
        e.preventDefault();
      } else if (c === 'KeyR') reload();
      else if (c === 'KeyV') toggleView();
      else if (c === 'Escape' || c === 'KeyP') {
        if (!In.locked) setPaused(!G.paused);
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Tab') setBoard(false);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!In.locked && G.phase === 'match' && game.state === 'arena' && !G.paused) setPaused(true);
    });
    document.addEventListener('mousemove', (e) => {
      if (!In.locked || game.state !== 'arena') return;
      const dx = e.movementX || 0,
        dy = e.movementY || 0;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      lookBy(dx, dy, 0.0021 * S.msens);
    });
    document.addEventListener('mousedown', (e) => {
      if (game.state !== 'arena' || G.phase !== 'match' || G.paused || e.button !== 0) return;
      if (In.locked) G.inp.fire = true;
      else if (In.canLock() && e.target === canvas) In.lock();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && modeNow() !== 'touch') G.inp.fire = false;
    });
    addEventListener('blur', () => {
      G.inp.fire = false;
      setBoard(false);
    });
    $id('ah-pause').onclick = () => setPaused(true);
    $id('ah-view').onclick = toggleView;
    $id('ah-sb').onclick = () => setBoard(!G.board);
    // touch: left thumb is a floating stick, right thumb drags the view; fire also drags, so you can track
    const stick = $id('at-move'),
      base = $id('at-base'),
      nub = $id('at-nub');
    let sid = null,
      sx = 0,
      sy = 0;
    const R = 58;
    stick.addEventListener('pointerdown', (e) => {
      if (sid != null) return;
      sid = e.pointerId;
      stick.setPointerCapture(sid);
      sx = e.clientX;
      sy = e.clientY;
      base.style.left = sx + 'px';
      base.style.top = sy + 'px';
      base.classList.add('on');
      nub.style.transform = '';
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - sx,
        dy = e.clientY - sy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx *= R / l;
        dy *= R / l;
      }
      nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const m = Math.min(1, l / R),
        k = m < 0.14 ? 0 : (m - 0.14) / 0.86 / (m || 1);
      T.mx = (dx / R) * k;
      T.mz = (-dy / R) * k;
    });
    const sup = (e) => {
      if (e.pointerId !== sid) return;
      sid = null;
      T.mx = T.mz = 0;
      base.classList.remove('on');
    };
    stick.addEventListener('pointerup', sup);
    stick.addEventListener('pointercancel', sup);
    const drag = (elm, down, up) => {
      const last = {};
      elm.addEventListener('pointerdown', (e) => {
        elm.setPointerCapture(e.pointerId);
        last[e.pointerId] = [e.clientX, e.clientY];
        if (down) down();
        e.preventDefault();
      });
      elm.addEventListener('pointermove', (e) => {
        const l = last[e.pointerId];
        if (!l) return;
        lookBy(e.clientX - l[0], e.clientY - l[1], 0.0052 * (S.tsens || 1));
        l[0] = e.clientX;
        l[1] = e.clientY;
      });
      const end = (e) => {
        if (!last[e.pointerId]) return;
        delete last[e.pointerId];
        if (up) up();
      };
      elm.addEventListener('pointerup', end);
      elm.addEventListener('pointercancel', end);
    };
    drag($id('at-look'));
    drag($id('at-fire'), () => (G.inp.fire = true), () => (G.inp.fire = false));
    drag($id('at-jump'), () => (G.inp.jump = true));
    drag($id('at-rel'), reload);
  }

  return {
    G, PCOL, openMenu,
    // called by the game loop every frame; true when the Arena drew the frame
    tick(raw, now) {
      if (!G.ready || (game.state !== 'lobby' && game.state !== 'arena')) return false;
      frame(raw, now);
      return true;
    },
  };
})();
if (window.__fs) Object.assign(window.__fs, {Arena, Net, ACORE, Rifle});
