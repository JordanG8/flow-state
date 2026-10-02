'use strict';
const A = (() => {
  let ctx = null,
    master,
    musicBus,
    musicLP,
    sfxBus,
    rev,
    revIn,
    dlyIn,
    noiseBuf,
    windG,
    windF,
    slideN = null,
    tap = null,
    ready = false;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12),
    ri = (n) => Math.floor(Math.random() * n);
  const M = {
    step: 0,
    t: 0,
    I: 0.2,
    Ti: 0.2,
    root: 50,
    scale: [0, 2, 3, 5, 7, 9, 10],
    prog: [0, 3, 6, 3],
    arp: [],
    motif: [],
    bassPat: [0, 6, 10],
    ts: 1,
    kickOn: true,
    nextProgBar: 8,
  };
  const PROGS = [
      [0, 3, 6, 3],
      [0, 6, 3, 4],
      [0, 2, 6, 3],
      [0, 4, 3, 6],
      [0, 5, 3, 6],
      [0, 3, 4, 6],
      [0, 6, 5, 4],
    ],
    ROOTS = [0, 5, 7, 10, 3, 2];
  const deg = (d) => M.root + M.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  // Pink noise (Paul Kellet filter) with the loop seam crossfaded, so a looping buffer never clicks or pulses.
  function makeNoise(c, secs) {
    const sr = c.sampleRate,
      fade = (sr * 0.3) | 0,
      n = ((sr * secs) | 0) + fade,
      raw = new Float32Array(n);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0,
      pk = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      pk = Math.max(pk, Math.abs(raw[i]));
    }
    const len = n - fade,
      buf = c.createBuffer(1, len, sr),
      d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (raw[i] / pk) * 0.9;
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * Math.sin(t * Math.PI * 0.5) + (raw[len + i] / pk) * 0.9 * Math.cos(t * Math.PI * 0.5);
    }
    return buf;
  }
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    // Master EQ: cut sub rumble, tame the 2-4 kHz bite, roll off the top so noise and saws never read as hiss.
    const eq = [
      ['highpass', 34, 0.7, 0],
      ['lowshelf', 140, 0, 1.5],
      ['peaking', 3100, 0.9, -2],
      ['highshelf', 7500, 0, -3.5],
      ['lowpass', 14000, 0.6, 0],
    ].map(([type, f, q, gain]) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    });
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.08;
    master.connect(eq[0]);
    for (let i = 0; i < eq.length - 1; i++) eq[i].connect(eq[i + 1]);
    eq[eq.length - 1].connect(comp);
    comp.connect(lim);
    lim.connect(ctx.destination);
    if (/[?&]debug(&|$)/.test(location.search)) {
      tap = ctx.createAnalyser(); // measurement hook for tests: window.__fs.A.tap
      tap.fftSize = 4096;
      lim.connect(tap);
    }
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55 * S.music;
    musicLP = ctx.createBiquadFilter();
    musicLP.type = 'lowpass';
    musicLP.frequency.value = 16e3;
    musicBus.connect(musicLP);
    musicLP.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9 * S.sfx;
    sfxBus.connect(master);
    const len = (ctx.sampleRate * 2.6) | 0,
      ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.35;
        d[i] = lp * Math.pow(1 - i / len, 2.6);
      }
    }
    rev = ctx.createConvolver();
    rev.buffer = ir;
    revIn = ctx.createGain();
    const ro = ctx.createGain();
    ro.gain.value = 0.42;
    const rhp = ctx.createBiquadFilter(),
      rlp = ctx.createBiquadFilter();
    rhp.type = 'highpass';
    rhp.frequency.value = 220;
    rlp.type = 'lowpass';
    rlp.frequency.value = 5200;
    revIn.connect(rev);
    rev.connect(rhp);
    rhp.connect(rlp);
    rlp.connect(ro);
    ro.connect(master);
    dlyIn = ctx.createGain();
    const dly = ctx.createDelay(1);
    dly.delayTime.value = 0.2;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    dlyIn.connect(dly);
    dly.connect(dlp);
    dlp.connect(fb);
    fb.connect(dly);
    const dout = ctx.createGain();
    dout.gain.value = 0.45;
    dlp.connect(dout);
    dout.connect(master);
    dout.connect(revIn);
    noiseBuf = makeNoise(ctx, 6);
    const ws = ctx.createBufferSource();
    ws.buffer = noiseBuf;
    ws.loop = true;
    windF = ctx.createBiquadFilter();
    windF.type = 'lowpass';
    windF.frequency.value = 500;
    windF.Q.value = 0.5;
    windG = ctx.createGain();
    windG.gain.value = 0;
    ws.connect(windF);
    windF.connect(windG);
    windG.connect(sfxBus);
    ws.start();
    M.root = [45, 47, 48, 50, 52][ri(5)];
    genArp();
    genMotif();
    M.t = ctx.currentTime + 0.15;
    M.step = 0;
    ready = true;
    setInterval(tick, 28);
  }
  function note(f, t, o) {
    const g = ctx.createGain(),
      osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.det) osc.detune.value = o.det;
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a || 0.005) + (o.d || 0.3));
    const a = o.a || 0.005,
      d = o.d || 0.3;
    g.gain.setValueAtTime(1e-4, t);
    g.gain.linearRampToValueAtTime(o.g || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
    let out = osc;
    if (o.lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(o.lp, t);
      if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(o.lpEnd, t + a + d);
      osc.connect(fl);
      fl.connect(g);
    } else osc.connect(g);
    g.connect(o.bus || musicBus);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      g.connect(s);
      s.connect(revIn);
    }
    if (o.dly) {
      const s = ctx.createGain();
      s.gain.value = o.dly;
      g.connect(s);
      s.connect(dlyIn);
    }
    osc.start(t);
    osc.stop(t + a + d + 0.06);
  }
  function noise(t, dur, o) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1e3, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(o.g || 0.2, t + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(f);
    if (o.lp) {
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.value = o.lp;
      f.connect(l);
      l.connect(g);
    } else f.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send) {
      const x = ctx.createGain();
      x.gain.value = o.send;
      g.connect(x);
      x.connect(revIn);
    }
    s.start(t, Math.random() * 4);
    s.stop(t + dur + 0.05);
  }
  function genArp() {
    const T = [
      [0, 3, 6, 8, 11, 14],
      [0, 2, 4, 6, 8, 10, 12, 14],
      [2, 6, 10, 14, 15],
      [0, 3, 5, 8, 10, 13],
      [0, 1, 4, 6, 7, 9, 12, 14],
      [0, 4, 7, 10, 12],
    ];
    const tpl = T[ri(T.length)],
      a = Array(16).fill(null);
    let idx = ri(4);
    for (const s of tpl) {
      idx = clamp(idx + ri(5) - 2, 0, 6);
      a[s] = idx;
    }
    M.arp = a;
  }
  function genMotif() {
    const st = [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
      n = 4 + ri(3);
    M.motif = [];
    let d = 7 + ri(4);
    for (let i = 0; i < n; i++) {
      d = clamp(d + ri(5) - 2, 5, 13);
      M.motif.push({s: st[ri(st.length)], d: d});
    }
  }
  function mutMotif() {
    if (Math.random() < 0.35) return genMotif();
    const m = M.motif[ri(M.motif.length)];
    if (m) m.d = clamp(m.d + ri(5) - 2, 5, 13);
  }
  function sched(st, t) {
    const b = st % 16,
      bar = (st / 16) | 0,
      I = M.I;
    t += b % 2 ? 0.011 : 0;
    if (b === 0) {
      if (bar >= M.nextProgBar) {
        M.prog = PROGS[ri(PROGS.length)];
        M.nextProgBar = bar + 8;
      }
      if (bar > 0 && bar % 24 === 0)
        M.root = 43 + ((((M.root - 43 + ROOTS[ri(ROOTS.length)]) % 12) + 12) % 12);
      if (bar % 2 === 0) {
        genArp();
        M.bassPat = [0].concat([3, 6, 8, 10, 14].filter(() => Math.random() < 0.5));
      }
      if (bar % 4 === 0) mutMotif();
      M.kickOn = !(bar % 8 === 7 && Math.random() < 0.5);
      const d = M.prog[bar % 4];
      for (let k = 0; k < 4; k++) {
        const m = deg(d + 2 * k);
        for (const dt of [-7, 7])
          note(mtof(m), t, {
            type: 'sawtooth',
            det: dt,
            a: 1.1,
            d: 2.9,
            g: 0.016,
            lp: 450 + I * 800,
            send: 0.5,
          });
      }
      if (bar % 5 === 3 && Math.random() < 0.6)
        noise(t, 2.2, {
          type: 'bandpass',
          f: 300,
          f2: 3200,
          q: 0.8,
          g: 0.016,
          lp: 4500,
          a: 1.5,
          bus: musicBus,
          send: 0.5,
        });
    }
    const d = M.prog[bar % 4];
    if (M.bassPat.indexOf(b) >= 0) {
      const m = deg(d) - 12;
      note(mtof(m), t, {type: 'sine', a: 0.01, d: 0.34, g: 0.26 * (0.55 + 0.45 * I)});
      note(mtof(m + 12), t, {type: 'triangle', a: 0.01, d: 0.22, g: 0.05, lp: 700});
    }
    if (
      I > 0.2 &&
      M.kickOn &&
      (b % 4 === 0 ||
        (b === 14 && I > 0.55 && Math.random() < 0.4) ||
        (b === 10 && I > 0.7 && Math.random() < 0.35))
    ) {
      note(150, t, {type: 'sine', f2: 48, a: 0.002, d: 0.13, g: 0.62});
      noise(t, 0.02, {
        type: 'bandpass',
        f: 1800,
        q: 0.6,
        g: 0.04,
        lp: 5000,
        bus: musicBus,
      });
    }
    if (I > 0.35) {
      if (b % 4 === 2) noise(t, 0.035, {type: 'highpass', f: 6e3, lp: 11e3, g: 0.042 + 0.026 * I, bus: musicBus});
      else if (I > 0.5 && b % 2 === 1 && Math.random() < I - 0.3)
        noise(t, 0.022, {type: 'highpass', f: 6500, lp: 11e3, g: 0.014, bus: musicBus});
    }
    if (I > 0.6 && (b === 4 || b === 12)) noise(t, 0.15, {f: 1500, q: 0.9, g: 0.07, lp: 4200, bus: musicBus, send: 0.35});
    const ar = M.arp[b];
    if (ar != null && Math.random() < 0.45 + 0.55 * I) {
      const lad = [d, d + 2, d + 4, d + 6, d + 7, d + 9, d + 11],
        m = deg(lad[ar]) + 12;
      note(mtof(m), t, {
        type: 'sawtooth',
        a: 0.004,
        d: 0.15 + 0.1 * (1 - I),
        g: 0.04 + 0.035 * I,
        lp: 3200,
        lpEnd: 500,
        send: 0.3,
        dly: 0.5,
      });
    }
    if (I > 0.25) {
      const mb = st % 32;
      for (const m of M.motif)
        if (m.s === mb && Math.random() < 0.85) {
          const f = mtof(deg(m.d) + 12);
          note(f, t, {type: 'sine', a: 0.004, d: 1.4, g: 0.07, send: 0.7, dly: 0.3});
          note(f * 2, t, {type: 'sine', a: 0.004, d: 0.5, g: 0.02, send: 0.5});
        }
    }
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    M.I += (M.Ti - M.I) * 0.02;
    const now = ctx.currentTime;
    if (M.t < now - 0.3) M.t = now + 0.05;
    while (M.t < now + 0.2) {
      sched(M.step, M.t);
      M.t += 60 / (104 + M.I * 18) / 4 / Math.max(0.5, M.ts);
      M.step++;
    }
  }
  const T = () => ctx.currentTime;
  const api = {
    init: init,
    get tap() {
      return tap;
    },
    get on() {
      return ready;
    },
    setVol() {
      if (!ctx) return;
      musicBus.gain.value = 0.55 * S.music;
      sfxBus.gain.value = 0.9 * S.sfx;
    },
    intensity(v) {
      M.Ti = clamp(v, 0, 1);
    },
    setTS(ts, paused) {
      if (!ctx) return;
      M.ts = ts;
      musicLP.frequency.setTargetAtTime(
        paused ? 500 : 260 + 16e3 * Math.pow(clamp(ts, 0, 1), 2.2),
        T(),
        0.08,
      );
    },
    wind(v, air) {
      if (!ctx) return;
      // Quiet, dark whoosh that only really opens up at speed. v = 0 closes it completely.
      windG.gain.setTargetAtTime(v > 0 ? Math.pow(v, 1.8) * 0.1 + (air ? 0.015 : 0) : 0, T(), 0.12);
      windF.frequency.setTargetAtTime(260 + v * 900, T(), 0.12);
    },
    step(v, alt) {
      if (!ctx) return;
      const t = T();
      noise(t, 0.07, {type: 'lowpass', f: alt ? 380 : 460, q: 0.7, g: 0.11 * v});
      note(alt ? 95 : 112, t, {f2: 60, a: 0.002, d: 0.08, g: 0.16 * v, bus: sfxBus});
    },
    jump() {
      if (!ctx) return;
      const t = T();
      noise(t, 0.28, {f: 450, f2: 1800, q: 0.7, g: 0.06, lp: 3500});
      note(220, t, {f2: 440, a: 0.005, d: 0.2, g: 0.1, bus: sfxBus});
    },
    land(v) {
      if (!ctx) return;
      const t = T(),
        k = clamp(v / 16, 0.2, 1);
      note(78, t, {f2: 38, a: 0.002, d: 0.18, g: 0.5 * k, bus: sfxBus});
      noise(t, 0.12, {type: 'lowpass', f: 700, g: 0.13 * k});
    },
    slideStart() {
      if (!ctx || slideN) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 650;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.07, T(), 0.04);
      s.connect(f);
      f.connect(g);
      g.connect(sfxBus);
      s.start();
      slideN = {s: s, g: g};
    },
    slideStop() {
      if (!ctx || !slideN) return;
      const n = slideN;
      slideN = null;
      n.g.gain.setTargetAtTime(0, T(), 0.06);
      n.s.stop(T() + 0.4);
    },
    turn() {
      if (!ctx) return;
      const t = T();
      noise(t, 0.34, {f: 300, f2: 2400, q: 1.2, g: 0.12, lp: 4000, send: 0.3});
      note(880, t, {type: 'square', a: 0.001, d: 0.04, g: 0.05, lp: 3e3, bus: sfxBus});
      note(66, t, {f2: 40, a: 0.002, d: 0.2, g: 0.35, bus: sfxBus});
    },
    dash() {
      if (!ctx) return;
      noise(T(), 0.18, {f: 700, f2: 2200, q: 1, g: 0.09, lp: 3600});
    },
    pad() {
      if (!ctx) return;
      const t = T();
      note(180, t, {f2: 900, type: 'square', a: 0.003, d: 0.25, g: 0.07, lp: 2400, bus: sfxBus});
      noise(t, 0.35, {f: 700, f2: 2600, q: 0.8, g: 0.07, lp: 4200});
    },
    gate(n) {
      if (!ctx) return;
      const t = T(),
        m = deg(7 + (n % 10) * 1) + 12;
      note(mtof(m), t, {type: 'triangle', a: 0.003, d: 0.9, g: 0.14, send: 0.55, dly: 0.3, bus: sfxBus});
      note(mtof(m + 12), t, {type: 'sine', a: 0.003, d: 0.5, g: 0.05, send: 0.5, bus: sfxBus});
    },
    miss() {
      if (!ctx) return;
      note(160, T(), {type: 'triangle', f2: 110, a: 0.003, d: 0.15, g: 0.06, bus: sfxBus});
    },
    tick() {
      if (!ctx) return;
      note(1400, T(), {
        type: 'square',
        a: 0.001,
        d: 0.025,
        g: 0.035,
        lp: 4e3,
        bus: sfxBus,
      });
    },
    ui() {
      if (!ctx) return;
      const t = T();
      note(520, t, {type: 'square', a: 0.001, d: 0.05, g: 0.05, lp: 3500, bus: sfxBus});
      note(1040, t + 0.04, {type: 'square', a: 0.001, d: 0.07, g: 0.04, lp: 3500, bus: sfxBus});
    },
    uiHover() {
      if (!ctx) return;
      note(1180 * (0.97 + Math.random() * 0.06), T(), {type: 'triangle', a: 0.001, d: 0.035, g: 0.022, lp: 5000, bus: sfxBus});
    },
    uiPress() {
      if (!ctx) return;
      const t = T();
      note(170, t, {f2: 72, a: 0.001, d: 0.09, g: 0.2, bus: sfxBus});
      note(820, t, {type: 'square', a: 0.001, d: 0.03, g: 0.03, lp: 3000, bus: sfxBus});
    },
    uiBack() {
      if (!ctx) return;
      const t = T();
      note(660, t, {type: 'triangle', a: 0.001, d: 0.06, g: 0.06, lp: 4000, bus: sfxBus});
      note(440, t + 0.05, {type: 'triangle', a: 0.001, d: 0.09, g: 0.06, lp: 4000, bus: sfxBus});
    },
    uiToggle(on) {
      if (!ctx) return;
      const t = T(),
        a = on ? 700 : 1050,
        b = on ? 1050 : 700;
      note(a, t, {type: 'square', a: 0.001, d: 0.04, g: 0.035, lp: 3500, bus: sfxBus});
      note(b, t + 0.045, {type: 'square', a: 0.001, d: 0.06, g: 0.04, lp: 3500, bus: sfxBus});
    },
    uiTick(k) {
      if (!ctx) return;
      note(560 + clamp(k, 0, 1) * 1100, T(), {type: 'triangle', a: 0.001, d: 0.025, g: 0.04, lp: 5000, bus: sfxBus});
    },
    uiLocked() {
      if (!ctx) return;
      const t = T();
      note(120, t, {type: 'square', a: 0.001, d: 0.1, g: 0.05, lp: 600, bus: sfxBus});
      note(104, t + 0.07, {type: 'square', a: 0.001, d: 0.12, g: 0.05, lp: 600, bus: sfxBus});
    },
    uiEquip() {
      if (!ctx) return;
      const t = T();
      [0, 7, 12].forEach((x, i) =>
        note(mtof(M.root + 24 + x), t + i * 0.05, {type: 'triangle', a: 0.002, d: 0.35, g: 0.09, send: 0.4, bus: sfxBus})
      );
      note(150, t, {f2: 60, a: 0.001, d: 0.1, g: 0.2, bus: sfxBus});
    },
    uiUnlock() {
      if (!ctx) return;
      const t = T();
      [0, 4, 7, 12, 16].forEach((x, i) =>
        note(mtof(M.root + 24 + x), t + i * 0.06, {type: 'triangle', a: 0.002, d: 0.6, g: 0.1, send: 0.6, dly: 0.3, bus: sfxBus})
      );
    },
    cp() {
      if (!ctx) return;
      const t = T();
      [0, 4, 7, 11].forEach((x, i) =>
        note(mtof(M.root + 24 + x), t + i * 0.07, {
          type: 'triangle',
          a: 0.003,
          d: 0.8,
          g: 0.12,
          send: 0.6,
          bus: sfxBus,
        }),
      );
    },
    impact() {
      if (!ctx) return;
      const t = T();
      note(90, t, {f2: 35, a: 0.002, d: 0.3, g: 0.6, bus: sfxBus});
      noise(t, 0.2, {type: 'lowpass', f: 900, g: 0.2});
    },
    death() {
      if (!ctx) return;
      const t = T();
      for (let i = 0; i < 12; i++) {
        const t0 = t + i * 0.016 + Math.random() * 0.05;
        noise(t0, 0.05 + Math.random() * 0.18, {
          f: 900 + Math.random() * 2600,
          q: 1.4,
          g: 0.07,
          lp: 5000,
          send: 0.35,
        });
        if (i % 4 === 0)
          note(1800 + Math.random() * 2e3, t0, {a: 0.001, d: 0.5, g: 0.022, send: 0.6, bus: sfxBus});
      }
      note(120, t, {f2: 28, a: 0.003, d: 1, g: 0.6, bus: sfxBus});
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(0.55 * S.music * 0.15, t);
      musicBus.gain.linearRampToValueAtTime(0.55 * S.music, t + 1.6);
    },
    rise() {
      if (!ctx) return;
      noise(T(), 0.7, {f: 200, f2: 3500, q: 0.9, g: 0.08, lp: 4500, a: 0.5, send: 0.35});
    },
  };
  return api;
})();
