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
    master.connect(comp);
    comp.connect(ctx.destination);
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
    ro.gain.value = 0.55;
    revIn.connect(rev);
    rev.connect(ro);
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
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    {
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const ws = ctx.createBufferSource();
    ws.buffer = noiseBuf;
    ws.loop = true;
    windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 700;
    windF.Q.value = 0.6;
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
    f.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send) {
      const x = ctx.createGain();
      x.gain.value = o.send;
      g.connect(x);
      x.connect(revIn);
    }
    s.start(t, Math.random() * 1.5);
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
          f2: 5e3,
          q: 0.8,
          g: 0.025,
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
        type: 'highpass',
        f: 2500,
        g: 0.08,
        bus: musicBus,
      });
    }
    if (I > 0.35) {
      if (b % 4 === 2) noise(t, 0.04, {type: 'highpass', f: 7e3, g: 0.05 + 0.03 * I, bus: musicBus});
      else if (I > 0.5 && b % 2 === 1 && Math.random() < I - 0.3)
        noise(t, 0.025, {type: 'highpass', f: 8e3, g: 0.025, bus: musicBus});
    }
    if (I > 0.6 && (b === 4 || b === 12)) noise(t, 0.15, {f: 1800, q: 0.9, g: 0.1, bus: musicBus, send: 0.4});
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
      windG.gain.setTargetAtTime(Math.pow(v, 1.3) * 0.2 + (air ? 0.05 : 0), T(), 0.1);
      windF.frequency.setTargetAtTime(400 + v * 1400, T(), 0.1);
    },
    step(v, alt) {
      if (!ctx) return;
      const t = T();
      noise(t, 0.07, {f: alt ? 520 : 680, q: 1.2, g: 0.2 * v});
      note(alt ? 95 : 112, t, {f2: 60, a: 0.002, d: 0.08, g: 0.16 * v, bus: sfxBus});
    },
    jump() {
      if (!ctx) return;
      const t = T();
      noise(t, 0.28, {type: 'highpass', f: 500, f2: 2800, g: 0.12});
      note(220, t, {f2: 440, a: 0.005, d: 0.2, g: 0.1, bus: sfxBus});
    },
    land(v) {
      if (!ctx) return;
      const t = T(),
        k = clamp(v / 16, 0.2, 1);
      note(78, t, {f2: 38, a: 0.002, d: 0.18, g: 0.5 * k, bus: sfxBus});
      noise(t, 0.12, {type: 'lowpass', f: 900, g: 0.2 * k});
    },
    slideStart() {
      if (!ctx || slideN) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.14, T(), 0.04);
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
      noise(t, 0.34, {f: 300, f2: 3600, q: 1.5, g: 0.22, send: 0.3});
      note(880, t, {type: 'square', a: 0.001, d: 0.04, g: 0.05, lp: 3e3, bus: sfxBus});
      note(66, t, {f2: 40, a: 0.002, d: 0.2, g: 0.35, bus: sfxBus});
    },
    dash() {
      if (!ctx) return;
      noise(T(), 0.18, {f: 900, f2: 3e3, q: 1.2, g: 0.16});
    },
    pad() {
      if (!ctx) return;
      const t = T();
      note(180, t, {f2: 900, type: 'square', a: 0.003, d: 0.25, g: 0.07, lp: 2400, bus: sfxBus});
      noise(t, 0.35, {type: 'highpass', f: 800, f2: 4e3, g: 0.14});
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
      noise(t, 0.2, {type: 'lowpass', f: 1200, g: 0.3});
    },
    death() {
      if (!ctx) return;
      const t = T();
      for (let i = 0; i < 20; i++) {
        const t0 = t + i * 0.011 + Math.random() * 0.05;
        noise(t0, 0.05 + Math.random() * 0.2, {
          type: 'highpass',
          f: 2500 + Math.random() * 5500,
          g: 0.16,
          send: 0.4,
        });
        if (i % 4 === 0)
          note(2200 + Math.random() * 3e3, t0, {a: 0.001, d: 0.5, g: 0.03, send: 0.6, bus: sfxBus});
      }
      note(120, t, {f2: 28, a: 0.003, d: 1, g: 0.6, bus: sfxBus});
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(0.55 * S.music * 0.15, t);
      musicBus.gain.linearRampToValueAtTime(0.55 * S.music, t + 1.6);
    },
    rise() {
      if (!ctx) return;
      noise(T(), 0.7, {f: 200, f2: 6e3, q: 0.9, g: 0.16, a: 0.5, send: 0.4});
    },
  };
  return api;
})();
