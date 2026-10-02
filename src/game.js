'use strict';
addEventListener('contextmenu', (e) => e.preventDefault());
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.autoClear = false;
const isGL2 = !!renderer.capabilities.isWebGL2;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene(),
  vmCam = new THREE.PerspectiveCamera(65, 1, 0.02, 6);
const PAL = [
  {l: [0.97, 0.96, 0.93], f: [0.925, 0.915, 0.89], a: [1, 0.16, 0.1]},
  {l: [1, 0.96, 0.91], f: [0.965, 0.865, 0.78], a: [1, 0.3, 0.1]},
  {l: [0.94, 0.97, 1], f: [0.8, 0.865, 0.93], a: [0.96, 0.12, 0.3]},
  {l: [0.95, 0.98, 0.94], f: [0.84, 0.9, 0.82], a: [1, 0.22, 0.14]},
];
const ACTN = ['Act I', 'Act II', 'Act III', 'Act IV'];
const U = {
  uTime: {value: 0},
  uCam: {value: new THREE.Vector3()},
  uSun: {value: new THREE.Vector3(0.5, 0.8, 0.3).normalize()},
  uLight: {value: new THREE.Color(...PAL[0].l)},
  uFog: {
    value: new THREE.Color(...PAL[0].f),
  },
  uAccent: {value: new THREE.Color(...PAL[0].a)},
  uInk: {value: new THREE.Color(0.06, 0.06, 0.08)},
  uFogDen: {value: 0.008},
  uBody: {value: new THREE.Vector4(0, 0, 0, 0)}, // cosmetic outfit tint (w = 1 when custom)
  uTrim: {value: new THREE.Vector4(0, 0, 0, 0)},
};
const VS = `attribute vec2 aSize;attribute vec3 aInfo;varying vec3 vN,vW,vInfo;varying vec2 vUv,vSize;varying float vD; void main(){vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);vUv=uv;vSize=aSize;vInfo=aInfo;vec4 mv=viewMatrix*wp;vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
const FS = `precision highp float;uniform float uTime,uFogDen;uniform vec3 uCam,uSun,uLight,uFog,uAccent,uInk;uniform vec4 uBody,uTrim;varying vec3 vN,vW,vInfo;varying vec2 vUv,vSize;varying float vD; float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} void main(){vec3 n=normalize(vN);float kind=vInfo.x,seed=vInfo.y,ex=vInfo.z;bool top=n.y>.5; float sunL=clamp(dot(n,normalize(uSun)),0.,1.);float lit=.40+.40*sunL+.20*(n.y*.5+.5);lit=mix(lit,floor(lit*5.+.5)/5.,.55); vec3 col=uLight*lit; float ed=min(min(vUv.x*vSize.x,(1.-vUv.x)*vSize.x),min(vUv.y*vSize.y,(1.-vUv.y)*vSize.y)); if(!top&&n.y>-.5){float hh=vUv.y*vSize.y;col*=mix(.70,1.,smoothstep(0.,2.2,hh));} col*=mix(.94,1.,smoothstep(0.,.7,ed)); vec3 edgeC=uInk;float edgeW=.03+vD*.0007;float efade=1.-smoothstep(35.,150.,vD);float noEdge=0.; if(kind>.5&&kind<1.5){float p=.88+.12*sin(uTime*3.+seed*6.28);col=uAccent*p*(.78+.22*lit);} else if(kind>1.5&&kind<2.5){if(top){float r=length((vUv-.5)*vSize);float ring=step(0.,sin(r*6.-uTime*7.));col=mix(vec3(.98),uAccent,ring);}else col=uAccent*lit;} else if(kind>2.5&&kind<3.5){col=mix(uLight*.93,uFog,.15)*lit*(.9+.1*seed);if(ex>.5)col=uAccent*(.7+.3*lit);edgeC=mix(uInk,uFog,.55);} else if(kind>3.5&&kind<4.5){col=mix(uAccent,vec3(1.),.25+.25*sin(uTime*4.+seed*9.));noEdge=1.;} else if(kind>5.5&&kind<6.5){if(top){float st=step(.5,fract(ed*.28-uTime*.7));col=mix(uLight,uAccent,st*.9);}} else if(kind>6.5&&kind<7.5){col=uLight*mix(lit,1.,.35);if(uBody.w>.5){col=uBody.rgb*lit;edgeC=mix(uInk,vec3(.93),step(dot(uBody.rgb,vec3(.33)),.22));}} else if(kind>7.5&&kind<8.5){if(uTrim.w>.5){col=uTrim.rgb*(.8+.2*lit);}else{float p=.88+.12*sin(uTime*3.+seed*6.28);col=uAccent*p*(.78+.22*lit);}} float lw=1.-smoothstep(edgeW,edgeW+fwidth(ed)*1.3+.004,ed);col=mix(col,edgeC,lw*(1.-noEdge)*efade); float f=1.-exp(-pow(vD*uFogDen,1.6));float hf=smoothstep(-4.,-48.,vW.y-uCam.y);f=clamp(f+hf*.6*(1.-f),0.,1.); col=mix(col,uFog,f);col+=(h21(gl_FragCoord.xy)-.5)*.006;gl_FragColor=vec4(col,1.);}`;
const mainMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: VS,
  fragmentShader: FS,
  extensions: {derivatives: true},
});
const handMat = new THREE.ShaderMaterial({
  uniforms: Object.assign({}, U, {uFogDen: {value: 0}}),
  vertexShader: VS,
  fragmentShader: FS,
  extensions: {derivatives: true},
});
const sunMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {uA: U.uAccent},
  vertexShader:
    'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:
    'uniform vec3 uA;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float d=smoothstep(.36,.33,r);float h=exp(-r*r*5.);gl_FragColor=vec4(uA,d*.92+h*.16);}',
});
const sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sunMat);
sun.scale.set(150, 150, 1);
scene.add(sun);
sun.frustumCulled = false;
const SUNDIR = new THREE.Vector3(-0.35, 0.2, -0.9).normalize();
const postMat = new THREE.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tS: {value: null},
    uRes: {
      value: new THREE.Vector2(1, 1),
    },
    uTime: {value: 0},
    uBlur: {value: 0},
    uChroma: {value: 0},
    uVig: {value: 0.35},
    uSlow: {value: 0},
    uFlash: {value: 0},
    uRed: {value: 0},
    uShat: {value: 0},
  },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `precision highp float;uniform sampler2D tS;uniform vec2 uRes;uniform float uTime,uBlur,uChroma,uVig,uSlow,uFlash,uRed,uShat;varying vec2 vUv; float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} vec2 h22(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);} void main(){vec2 uv=vUv;float asp=uRes.x/uRes.y;float crack=0.; if(uShat>.001){vec2 p=vec2(uv.x*asp,uv.y)*4.2;vec2 ip=floor(p),fp=fract(p);float d1=9.,d2=9.;vec2 id=vec2(0.);  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=h22(ip+g);vec2 pt=g+.5+.42*sin(6.2831*o+3.);float d=length(pt-fp);if(d<d1){d2=d1;d1=d;id=ip+g;}else if(d<d2){d2=d;}}  vec2 hd=h22(id)-.5;float s=uShat*uShat;uv+=vec2(hd.x/asp,hd.y)*s*.5+vec2(0.,-s*.35*h21(id));crack=1.-smoothstep(0.,.06,d2-d1);} vec2 d=uv-.5;float r=length(d);float bl=uBlur*smoothstep(.1,.8,r);float ca=uChroma*r*.012;vec3 c=vec3(0.); for(int i=0;i<4;i++){float t=float(i)/3.;vec2 u=uv-d*bl*t;c+=vec3(texture2D(tS,u-d*ca).r,texture2D(tS,u).g,texture2D(tS,u+d*ca).b);} c/=4.; c*=1.-uVig*smoothstep(.3,.95,r*1.2); float l=dot(c,vec3(.3,.59,.11));c=mix(c,vec3(l),uSlow*.4);c=mix(c,c*c*(3.-2.*c),.22); c=mix(c,vec3(1.,.1,.07),uRed*smoothstep(.25,.9,r)*.55); c=mix(c,vec3(.06),crack*clamp(uShat*6.,0.,1.));c=mix(c,vec3(1.),smoothstep(.75,1.,uShat)); c=mix(c,vec3(1.),uFlash);c+=(h21(gl_FragCoord.xy)-.5)*.006;gl_FragColor=vec4(c,1.);}`,
});
const postScene = new THREE.Scene(),
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  m.frustumCulled = false;
  postScene.add(m);
}
let rt = null;
const QS = {low: {s: 0.6, ms: 0}, med: {s: 0.8, ms: 2}, high: {s: 1, ms: 4}};
function makeRT(w, h) {
  const ms = isGL2 ? QS[S.quality].ms : 0;
  let r;
  if (ms) {
    r = new THREE.WebGLMultisampleRenderTarget(w, h, {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    r.samples = ms;
  } else
    r = new THREE.WebGLRenderTarget(w, h, {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  return r;
}
let aspect = 1;
function resize() {
  const w = innerWidth,
    h = innerHeight,
    dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  if (rt) rt.dispose();
  rt = makeRT(
    Math.max(2, Math.floor(w * dpr * QS[S.quality].s)),
    Math.max(2, Math.floor(h * dpr * QS[S.quality].s)),
  );
  aspect = w / h;
  camera.aspect = aspect;
  vmCam.aspect = aspect;
  postMat.uniforms.uRes.value.set(canvas.width, canvas.height);
  fitHands();
}
addEventListener('resize', resize);
const baseVFov = () => clamp(2 * Math.atan(Math.tan((S.fov * D2R) / 2) / aspect) * R2D, 52, 102);
const NS = 26,
  sgeo = new THREE.BufferGeometry(),
  spos = new Float32Array(NS * 6);
sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
const smat = new THREE.LineBasicMaterial({color: 1381656, transparent: true, opacity: 0, depthWrite: false}),
  streak = new THREE.LineSegments(sgeo, smat);
streak.frustumCulled = false;
scene.add(streak);
const sd = [];
for (let i = 0; i < NS; i++)
  sd.push({
    a: Math.random() * 6.28,
    rad: 2.6 + Math.random() * 9,
    f: Math.random() * 70 - 8,
    len: 0.5 + Math.random() * 1.6,
  });
function mkBox(w, h, d, kind, seed, mat) {
  const g = new THREE.BoxGeometry(w, h, d),
    sz = new Float32Array(48),
    inf = new Float32Array(72),
    fs = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      sz[i * 2] = fs[f][0];
      sz[i * 2 + 1] = fs[f][1];
      inf[i * 3] = kind;
      inf[i * 3 + 1] = seed;
    }
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 3));
  return new THREE.Mesh(g, mat || handMat);
}
const hands = [];
function mkHand(side) {
  const g = new THREE.Group();
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
  };
  add(mkBox(0.09, 0.085, 0.5, 7, 0.2), 0, 0, 0.25);
  add(mkBox(0.1, 0.095, 0.05, 8, 0.5), 0, 0, 0.02);
  add(mkBox(0.105, 0.05, 0.1, 8, 0.3), 0, 0, -0.06);
  for (let i = 0; i < 4; i++) {
    add(mkBox(0.022, 0.03, 0.075, 8, 0.1 * i), (i - 1.5) * 0.026, -0.004, -0.145);
    add(mkBox(0.022, 0.04, 0.028, 8, 0.7), (i - 1.5) * 0.026, -0.027, -0.18);
  }
  const th = mkBox(0.026, 0.03, 0.065, 8, 0.4);
  add(th, -side * 0.065, -0.005, -0.07);
  th.rotation.y = side * 0.5;
  vmScene.add(g);
  return {g: g, side: side, x: 0};
}
hands.push(mkHand(-1), mkHand(1));
let handScale = 1;
function fitHands() {
  const v = 65 * D2R;
  vmCam.fov = 65;
  vmCam.updateProjectionMatrix();
  const halfW = Math.tan(v / 2) * aspect * 0.55;
  handScale = clamp(aspect * 1.7, 0.6, 1);
  for (const h of hands) {
    h.x = h.side * Math.min(0.2, halfW * 0.62);
    h.g.scale.setScalar(handScale);
  }
}
const hs = {jump: 0, slide: 0, dash: 0, turn: 0, run: 0};
// Third-person runner (lives in the course scene) and the locker studio (its own scene, with a second runner).
const runner = Cos.buildRunner();
scene.add(runner.root);
const studio = new THREE.Scene(),
  studioRunner = Cos.buildRunner(),
  studioSun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sunMat);
studioSun.scale.set(150, 150, 1);
studioSun.frustumCulled = false;
studio.add(studioSun);
studio.add(studioRunner.root);
studioRunner.root.visible = true;
{
  const slab = mkBox(6.4, 0.5, 6.4, 0, 0.2, mainMat);
  slab.position.set(0, -0.25, 0);
  studio.add(slab);
  for (const [x, z, h] of [[-9, -14, 16], [8, -18, 22], [-20, -6, 11], [18, -4, 14]]) {
    const t = mkBox(4 + (h % 3), h, 4 + (h % 4), 3, 0.5, mainMat);
    t.position.set(x, h / 2 - 3.2, z);
    studio.add(t);
  }
}
const studioP = {x: 0, y: 0, z: 0, speed: 17, stride: 0, grounded: true, sliding: false, lat: 0, dashV: 0, a: 0};
const FACES = (b) => {
  const {x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1} = b,
    sx = x1 - x0,
    sy = y1 - y0,
    sz = z1 - z0;
  return [
    [
      [0, 1, 0],
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      sx,
      sz,
    ],
    [
      [0, -1, 0],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      sx,
      sz,
    ],
    [
      [1, 0, 0],
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      sz,
      sy,
    ],
    [
      [-1, 0, 0],
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      sz,
      sy,
    ],
    [
      [0, 0, 1],
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      sx,
      sy,
    ],
    [
      [0, 0, -1],
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      sx,
      sy,
    ],
  ];
};
const UVS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
function buildMesh(ch) {
  const all = [];
  for (const b of ch.boxes) all.push(b);
  for (const b of ch.vboxes) all.push(b);
  for (const b of ch.decor) all.push(b);
  const N = all.length,
    pos = new Float32Array(N * 72),
    nor = new Float32Array(N * 72),
    uv = new Float32Array(N * 48),
    sz = new Float32Array(N * 48),
    inf = new Float32Array(N * 72),
    idx = new Uint16Array(N * 36);
  let vi = 0,
    ii = 0;
  for (const b of all) {
    const seed = Math.abs(Math.sin(b.x0 * 12.9898 + b.z0 * 78.233 + b.y0 * 37.7)) % 1;
    for (const f of FACES(b)) {
      const base = vi;
      for (let k = 0; k < 4; k++) {
        const p = f[1][k];
        pos.set(p, vi * 3);
        nor.set(f[0], vi * 3);
        uv.set(UVS[k], vi * 2);
        sz[vi * 2] = f[2];
        sz[vi * 2 + 1] = f[3];
        inf[vi * 3] = b.k;
        inf[vi * 3 + 1] = seed;
        inf[vi * 3 + 2] = b.s || 0;
        vi++;
      }
      idx.set([base, base + 1, base + 2, base, base + 2, base + 3], ii);
      ii += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, mainMat);
  m.frustumCulled = false;
  scene.add(m);
  ch.mesh = m;
}
function dropMesh(ch) {
  if (ch.mesh) {
    scene.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    ch.mesh = null;
  }
}
const el = {
  hud: $('#hud'),
  dn: $('#hdn'),
  ff: $('#hff'),
  hs: $('#hhs'),
  bs: $('#hbs'),
  fxf: $('#fxf'),
  fxr: $('#fxr'),
};
let hintTO = 0;
function bigText(t) {
  el.bs.textContent = t;
  el.bs.classList.remove('on');
  void el.bs.offsetWidth;
  el.bs.classList.add('on');
}
function hintText(t) {
  clearTimeout(hintTO);
  if (!t) {
    el.hs.classList.remove('on');
    return;
  }
  if (el.hs.textContent !== t || !el.hs.classList.contains('on')) {
    el.hs.textContent = t;
    el.hs.classList.remove('on');
    void el.hs.offsetWidth;
    el.hs.classList.add('on');
  }
}
function buzz(p) {
  if (S.haptics && navigator.vibrate)
    try {
      navigator.vibrate(p);
    } catch (e) {}
}
const SCRS = ['loader', 'menu', 'settings', 'how', 'calib', 'pause', 'locker'];
function show(id) {
  for (const s of SCRS) {
    const e = $('#' + s);
    if (e) e.classList.toggle('on', s === id);
  }
}
function wipe(fn) {
  const w = $('#wipe');
  w.className = 'in';
  setTimeout(() => {
    fn();
    w.className = 'out';
    setTimeout(() => (w.className = ''), 520);
  }, 430);
}
const game = {
  state: 'loading',
  course: null,
  P: null,
  cp: null,
  ts: 1,
  slowUntil: 0,
  slowK: 1,
  flow: 0,
  combo: 0,
  flowIdle: 0,
  shake: 0,
  dip: 0,
  eye: 1.62,
  deadT: 0,
  flash: 0,
  red: 0,
  visH: 0,
  act: 0,
  lockT: 0,
  lastStepN: 0,
  stepAlt: false,
  mileN: 0,
  hintShown: {},
  cpRef: null,
  attract: null,
  slideSnd: false,
  third: false,
  cy: null, // smoothed floor height for the third-person camera
  lkAng: 0.5,
  lkKick: 0,
  calibFrom: '',
  calibPrev: '',
  pendingUnlocks: [],
  toggleView() {
    S.view = S.view === 'third' ? 'first' : 'third';
    saveS();
    this.applyView();
    UI.toast(S.view === 'third' ? 'Third person' : 'First person', 1200);
    A.uiToggle(true);
  },
  applyView() {
    document.body.dataset.view = S.view;
    Cos.trailsClear();
    this.cy = null;
  },
  // From the pause menu, settings, or the start of a run
  openCalib(from) {
    this.calibFrom = from;
    this.calibPrev = this.state;
    this.state = 'calib';
    show('calib');
    Calib.open({force: true, onDone: () => this.calibDone(true), onCancel: () => this.calibDone(false)});
  },
  calibDone(ok) {
    const from = this.calibFrom;
    this.calibFrom = '';
    if (from === 'pause') {
      if (ok) {
        show(null);
        this.state = 'playing';
        In.recenter();
        A.setTS(1, false);
        In.lock();
      } else {
        this.state = 'paused';
        show('pause');
      }
    } else {
      this.state = this.calibPrev || 'settings';
      show('settings');
      buildSettings();
    }
  },
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    In.unlock();
    buildPauseQuick();
    $('#pz-recal').style.display = modeNow() === 'gyro' ? '' : 'none';
    show('pause');
    A.setTS(this.ts, true);
    A.slideStop();
    A.wind(0, false);
  },
  resume() {
    if (this.state !== 'paused') return;
    In.gq.length = 0;
    show(null);
    this.state = 'playing';
    In.recenter();
    In.lock();
    ensureLock();
    A.setTS(1, false);
  },
};
function newCourse(seed) {
  if (game.course) for (const ch of game.course.chunks) dropMesh(ch);
  const c = new CORE.Course(seed);
  c.onDrop = dropMesh;
  game.course = c;
  for (let i = 0; i < 10; i++) c.next();
  for (const ch of c.chunks) buildMesh(ch);
  game.cp = c.chunks[0].cp;
  game.cpRef = game.cp;
}
function ensure() {
  const c = game.course;
  let n = 0;
  while (c.n - game.P.ci < 10 && n++ < 3) {
    const ch = c.next();
    buildMesh(ch);
  }
}
function newRun() {
  newCourse((Math.random() * 2 ** 31) | 0);
  game.P = CORE.newPlayer(game.cp);
  game.flow = 0;
  game.combo = 0;
  game.mileN = 0;
  game.hintShown = {};
  game.act = 0;
  game.visH = 0;
  game.ts = 1;
  game.cy = null;
  Cos.trailsClear();
  In.reset();
}
function slowmo(d, k) {
  game.slowUntil = performance.now() / 1e3 + d;
  game.slowK = k;
}
function setAct(a) {
  game.act = a;
}
function handleEvents(P) {
  for (const e of P.ev) {
    if (e.t === 'land') {
      A.land(e.v);
      game.dip = clamp(e.v / 40, 0.03, 0.3);
      hs.jump = 0;
      if (e.v > 12) buzz(12);
      if (e.v > 6) game.flow = clamp(game.flow + 0.01, 0, 1);
    } else if (e.t === 'jump') {
      A.jump();
      hs.jump = 1;
      UI.xhHit('jump');
    } else if (e.t === 'slide') {
      A.slideStart();
      game.slideSnd = true;
      hs.slide = 1;
      UI.xhHit('slide');
    } else if (e.t === 'dive') {
      A.jump();
    } else if (e.t === 'dash') {
      A.dash();
      hs.dash = e.dir;
      UI.xhHit('dash');
      buzz(8);
    } else if (e.t === 'pad') {
      A.pad();
      game.dip = -0.1;
      hs.jump = 1;
      buzz(20);
    } else if (e.t === 'turn') {
      A.turn();
      slowmo(0.34, 0.38);
      game.red = 1;
      hs.turn = e.dir;
      In.turnApplied(e.dir);
      UI.xhHit('turn');
      game.flow = clamp(game.flow + (e.perfect ? 0.12 : 0.07), 0, 1);
      game.flowIdle = 0;
      buzz(e.perfect ? [14, 20, 14] : 14);
      hintText('');
    } else if (e.t === 'turnmiss' || e.t === 'turnwrong') {
      A.tick();
    } else if (e.t === 'impact') {
      A.impact();
      game.shake = 1;
      game.flow = 0;
      game.combo = 0;
      buzz(40);
    } else if (e.t === 'gate') {
      if (e.ok) {
        game.combo++;
        A.gate(game.combo - 1);
        game.flow = clamp(game.flow + 0.07 + Math.min(0.05, game.combo * 0.004), 0, 1);
        game.flowIdle = 0;
        if (e.vis && !e.need) slowmo(0.12, 0.7);
        UI.xhHit('hit');
        buzz(6);
      } else {
        game.combo = 0;
        A.miss();
        game.flow = Math.max(0, game.flow - 0.05);
      }
    } else if (e.t === 'die') die(e.why);
  }
}
function die(why) {
  game.state = 'dead';
  game.deadT = 0;
  A.death();
  A.slideStop();
  A.wind(0, false);
  buzz([30, 40, 60]);
  bigText('Broken.');
  hintText('');
  const d = Math.floor(game.P.dist);
  if (d > best) {
    best = d;
    try {
      localStorage.setItem('fs_best', best);
    } catch (e) {}
  }
  for (const u of Cos.newlyUnlocked()) game.pendingUnlocks.push(u.it.name);
}
function doRespawn() {
  const P = game.P;
  CORE.respawn(game.course, P, game.cpRef);
  game.flow = Math.max(0, game.flow * 0.3);
  game.combo = 0;
  game.ts = 1;
  game.cy = null;
  Cos.trailsClear();
  In.reset();
  game.lockT = 0.7;
  game.visH = P.H * 90;
  game.state = 'playing';
  game.flash = 1;
  A.rise();
  bigText('Again.');
  ensure();
  if (game.pendingUnlocks.length) {
    UI.toast('Unlocked: ' + game.pendingUnlocks.join(', '), 3200);
    A.uiUnlock();
    game.pendingUnlocks.length = 0;
  }
}
function updateHints(P) {
  const c = game.course;
  let best = null;
  for (let i = P.ci; i <= P.ci + 1; i++) {
    const ch = c.get(i);
    if (!ch || !ch.hint) continue;
    const h = ch.hint,
      p = (P.x - h.x) * h.ax + (P.z - h.z) * h.az;
    if (p > -36 && p < 2) {
      best = {ch: ch, h: h};
      break;
    }
  }
  if (!best) {
    hintText('');
    return;
  }
  const t = best.h.type;
  if ((hintCnt[t] || 0) >= 4 && !game.hintShown[best.ch.i]) {
    hintText('');
    return;
  }
  if (!game.hintShown[best.ch.i]) {
    game.hintShown[best.ch.i] = true;
    hintCnt[t] = (hintCnt[t] || 0) + 1;
    try {
      localStorage.setItem('fs_hints', JSON.stringify(hintCnt));
    } catch (e) {}
  }
  const m = modeNow(),
    k = m === 'keys';
  const TX = {
    jump: k ? 'Space: leap' : 'Flick up: leap',
    slide: k ? 'S: slide' : 'Flick down: slide',
    dash: k ? 'Z / C: dash' : 'Tilt: dash',
    steer: k ? 'A / D: steer' : 'Rotate slowly: steer',
    turn: best.h.dir > 0 ? (k ? 'Q: turn left' : 'Snap left') : k ? 'E: turn right' : 'Snap right',
  };
  hintText(TX[t]);
}
function stepGame(raw, now) {
  const P = game.P,
    c = game.course;
  const tgt = now < game.slowUntil ? game.slowK : 1;
  game.ts = damp(game.ts, tgt, tgt < game.ts ? 28 : 5, raw);
  const dt = raw * game.ts;
  const cn = (() => {
    const i = P.ci;
    for (let k = i - 1; k <= i + 1; k++) {
      const ch = c.get(k);
      if (ch && ch.corner && !ch.corner.used) return true;
    }
    return false;
  })();
  In.update(raw, now, true, cn);
  if (game.lockT > 0) {
    game.lockT -= raw;
    In.gq.length = 0;
  }
  for (const g of In.gq) P.q.push(g);
  In.gq.length = 0;
  P.steer = In.steer;
  const spd = 15 + 8.5 * clamp(P.dist / 2800, 0, 1);
  P.speedT = Math.max(spd + game.flow * 3.4, spd);
  CORE.stepP(c, P, dt);
  handleEvents(P);
  if (game.state !== 'playing') return;
  if (game.slideSnd && !P.sliding) {
    A.slideStop();
    A.wind(0, false);
    game.slideSnd = false;
  }
  const ch = c.get(P.ci);
  if (ch) {
    if (ch.act !== game.act) {
      setAct(ch.act);
      bigText(ACTN[ch.act]);
    }
    if (
      ch.cp &&
      ch.cp !== game.cpRef &&
      (P.x - ch.cp.x) * CORE.hv(P.H)[0] + (P.z - ch.cp.z) * CORE.hv(P.H)[1] > 0
    ) {
      game.cpRef = ch.cp;
      ch.cp.dist = P.dist;
      A.cp();
      bigText('Checkpoint');
    }
  }
  ensure();
  c.trim(Math.min(P.ci, game.cpRef.ci) - 2);
  if (P.grounded && !P.sliding) {
    P.stride += (P.speed * dt) / 5.4;
    const n = Math.floor(P.stride * 2);
    if (n !== game.lastStepN) {
      game.lastStepN = n;
      game.stepAlt = !game.stepAlt;
      A.step(clamp(P.speed / 22, 0.3, 1), game.stepAlt);
    }
  }
  game.flowIdle += dt;
  game.flow = clamp(game.flow - (game.flowIdle > 4 ? 0.04 : 0.01) * dt, 0, 1);
  const mn = Math.floor(P.dist / 300);
  if (mn > game.mileN) {
    game.mileN = mn;
    bigText(['Keep. Moving.', 'Flow. Flow. Flow.', 'Breathe.', 'No. Thoughts.', 'Just. Rotate.'][mn % 5]);
  }
  updateHints(P);
  el.dn.textContent = String(Math.floor(P.dist)).padStart(3, '0');
  el.ff.style.width = game.flow * 100 + '%';
  A.wind(clamp((P.speed - 6) / 20, 0, 1), !P.grounded);
  A.intensity(0.1 + game.flow * 0.85 + clamp((P.speed - 14) / 14, 0, 1) * 0.15);
  A.setTS(game.ts, false);
}
const sdv = new THREE.Vector3();
function updateCamera(raw, now) {
  const P = game.P;
  let px,
    py,
    pz,
    yaw,
    pitch,
    roll,
    fovK = 0;
  const att =
      game.state === 'menu' || game.state === 'settings' || game.state === 'how' || game.state === 'loading',
    lk = game.state === 'locker',
    third = S.view === 'third' && !att && !lk;
  game.third = third;
  if (lk) {
    // studio: fixed height, the camera orbits the runner (drag to turn)
    px = Math.sin(game.lkAng) * 5.2;
    pz = Math.cos(game.lkAng) * 5.2;
    py = 2.25;
    yaw = game.lkAng * R2D;
    pitch = -13;
    roll = 0;
    const W = innerWidth,
      H = innerHeight;
    if (aspect > 1) camera.setViewOffset(W, H, -W * 0.2, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.2, W, H);
  } else if (att && game.attract) {
    const a = game.attract;
    a.s += raw * 9;
    if (a.s >= a.len - 30) {
      a.s = 0;
      game.flash = 0.9;
    }
    const p0 = a.at(a.s),
      p1 = a.at(a.s + 16);
    a.cx = damp(a.cx, p0[0], 5, raw);
    a.cy = damp(a.cy, p0[1], 5, raw);
    a.cz = damp(a.cz, p0[2], 5, raw);
    if (a.s < 0.1) {
      a.cx = p0[0];
      a.cy = p0[1];
      a.cz = p0[2];
      a.lx = p1[0];
      a.lz = p1[2];
    }
    a.lx = damp(a.lx, p1[0], 3, raw);
    a.lz = damp(a.lz, p1[2], 3, raw);
    px = a.cx;
    pz = a.cz;
    py = a.cy + 2.6 + Math.sin(now * 0.5) * 0.25;
    yaw = Math.atan2(-(a.lx - px), -(a.lz - pz)) * R2D;
    pitch = -8;
    roll = Math.sin(now * 0.4) * 1.5;
    fovK = 0;
  } else {
    game.visH = damp(game.visH, P.H * 90, 10, raw);
    const sn = clamp(P.speed / 24, 0, 1),
      slide = P.sliding ? 1 : 0;
    game.eye = damp(game.eye, slide ? 0.68 : 1.62, 14, raw);
    game.dip = damp(game.dip, 0, 9, raw);
    game.shake = damp(game.shake, 0, 5, raw);
    const bobA = P.grounded && !slide ? S.bob : 0,
      ph = P.stride * Math.PI * 2;
    const bob = Math.sin(ph) * 0.045 * bobA * sn;
    const sk = S.shake * (0.004 + 0.007 * sn) + game.shake * 0.07 * S.shake,
      sh = [Math.sin(now * 37) * sk, Math.sin(now * 29 + 1) * sk, Math.sin(now * 23 + 2) * sk];
    const V = In.view;
    yaw = P.H * 90 + In.turnOff + V.yaw * (third ? 0.6 : 1);
    if (!third) {
      px = P.x + sh[0];
      py = P.y + game.eye + bob - game.dip + sh[1];
      pz = P.z + sh[2];
      pitch = clamp(V.pitch, -72, 78) + Math.cos(ph) * 0.35 * bobA * sn;
      roll = V.roll * S.roll * 0.35 - (P.lat + P.dashV) * 0.35 * S.roll + Math.sin(ph) * 0.45 * bobA * sn;
      fovK = sn * 6 + slide * 4 + game.flow * 4 + (P.grounded ? 0 : 2);
    } else {
      // chase camera: orbits the runner, mouse / twist looks around
      game.cy = game.cy == null ? P.y : damp(game.cy, P.y, 11, raw);
      const dist = 4.9 + sn * 0.9 - slide * 0.5,
        lp = clamp(-9 + V.pitch * 0.9, -55, 38),
        yr = yaw * D2R,
        pr = lp * D2R,
        lx = -Math.sin(yr) * Math.cos(pr),
        ly = Math.sin(pr),
        lz = -Math.cos(yr) * Math.cos(pr),
        ty = game.cy + 1.15 - slide * 0.4 - game.dip * 0.5;
      px = P.x - lx * dist + Math.cos(yr) * 0.5 + sh[0];
      py = Math.max(ty - ly * dist + sh[1], P.y + 0.45);
      pz = P.z - lz * dist - Math.sin(yr) * 0.5 + sh[2];
      pitch = lp;
      roll = V.roll * S.roll * 0.25 - (P.lat + P.dashV) * 0.2 * S.roll;
      fovK = sn * 4 + slide * 2 + game.flow * 3 - 6;
    }
  }
  camera.position.set(px, py, pz);
  camera.rotation.set(pitch * D2R, yaw * D2R, roll * D2R, 'YXZ');
  if (!lk && camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.fov = baseVFov() + fovK;
  camera.updateProjectionMatrix();
  U.uCam.value.set(px, py, pz);
  sun.position.set(px + SUNDIR.x * 700, py + SUNDIR.y * 700 + 40, pz + SUNDIR.z * 700);
  sun.lookAt(camera.position);
  studioSun.position.set(px + SUNDIR.x * 700, py + SUNDIR.y * 700 + 40, pz + SUNDIR.z * 700);
  studioSun.lookAt(camera.position);
  const sn2 = att || lk ? 0.3 : clamp((P.speed - 10) / 16, 0, 1);
  smat.opacity = clamp(sn2 - 0.25, 0, 1) * 0.2;
  const vh = (att || lk ? yaw : game.visH) * D2R,
    hx = -Math.sin(vh),
    hz = -Math.cos(vh),
    rx = -hz,
    rz = hx,
    sp = att || lk ? 9 : P.speed;
  for (let i = 0; i < NS; i++) {
    const s = sd[i];
    s.f -= sp * raw;
    if (s.f < -8) {
      s.f += 75 + Math.random() * 10;
      s.a = Math.random() * 6.28;
      s.rad = 2.6 + Math.random() * 9;
    }
    const lx = Math.cos(s.a) * s.rad,
      ly = Math.sin(s.a) * s.rad * 0.7 + 1.2,
      bx = px + hx * s.f + rx * lx,
      bz = pz + hz * s.f + rz * lx,
      by = py - 1.2 + ly,
      L = s.len * (0.5 + sn2 * 2);
    spos[i * 6] = bx;
    spos[i * 6 + 1] = by;
    spos[i * 6 + 2] = bz;
    spos[i * 6 + 3] = bx + hx * L;
    spos[i * 6 + 4] = by;
    spos[i * 6 + 5] = bz + hz * L;
  }
  sgeo.attributes.position.needsUpdate = true;
}
function updateHands(raw, now) {
  const P = game.P,
    sn = clamp(P.speed / 24, 0, 1),
    ph = P.stride * Math.PI * 2,
    gr = P.grounded && !P.sliding ? 1 : 0;
  hs.jump = damp(hs.jump, P.grounded ? 0 : 1, 10, raw);
  hs.slide = damp(hs.slide, P.sliding ? 1 : 0, 12, raw);
  hs.dash = damp(hs.dash, 0, 6, raw);
  hs.turn = damp(hs.turn, 0, 7, raw);
  hs.run = damp(hs.run, gr * sn, 6, raw);
  for (const h of hands) {
    const s = h.side,
      p = s < 0 ? 0 : Math.PI,
      sw = Math.sin(ph + p) * hs.run,
      cw = Math.cos(ph + p) * hs.run;
    h.g.position.set(
      h.x * (1 + hs.slide * 0.3) + hs.turn * 0.05 * -1 * s * 0,
      -0.31 +
        Math.abs(Math.sin(ph * 1)) * 0.012 * hs.run -
        hs.slide * 0.05 +
        hs.jump * 0.07 -
        0.01 +
        (s * hs.dash > 0 ? 0 : 0),
      -0.55 + cw * 0.06 - hs.slide * 0.04 - hs.jump * 0.03,
    );
    h.g.rotation.set(
      0.25 + sw * 0.32 * S.bob + hs.jump * 0.35 - hs.slide * 0.25,
      s * 0.16 + hs.turn * 0.35 + (s * hs.dash > 0 ? -s * 0.25 : 0),
      s * 0.06 - hs.dash * 0.2 + sw * 0.05 * s,
    );
    h.g.scale.setScalar(handScale * (1 + (s * hs.dash > 0 ? 0.04 : 0)));
  }
}
function updateRunner(raw, now, live) {
  const P = game.P;
  Cos.setGear(runner, Cos.eq.head);
  runner.root.visible = !!(live && game.third && P);
  if (!P) return;
  if (live) {
    Cos.trailsUpdate(P, raw, now, game.state === 'playing', game.visH);
    if (runner.root.visible) Cos.pose(runner, P, raw, now, game.visH);
  }
}
let studioOn = false;
function updateStudio(raw, now) {
  if (!studioOn) {
    studioOn = true;
    studio.add(Cos.group());
    Cos.trailsClear();
  }
  const P = studioP,
    R = 1.55;
  P.a += raw * 0.85;
  P.x = Math.cos(P.a) * R;
  P.z = Math.sin(P.a) * R;
  P.stride += (P.speed * raw) / 5.4;
  const heading = Math.atan2(Math.sin(P.a), -Math.cos(P.a)) * R2D;
  game.lkKick = damp(game.lkKick, 0, 8, raw);
  Cos.setGear(studioRunner, Cos.shown.head);
  Cos.pose(studioRunner, P, raw, now, heading);
  studioRunner.root.scale.setScalar(1 + game.lkKick * 0.14);
  Cos.trailsUpdate(P, raw, now, true, heading, Cos.shown.trail);
}
function leaveStudio() {
  if (!studioOn) return;
  studioOn = false;
  scene.add(Cos.group());
  Cos.trailsClear();
  camera.clearViewOffset();
}
function render(now) {
  U.uTime.value = now;
  const dpal = PAL[game.act],
    k = (0.8 / 60) * 60;
  const dc = (col, arr, r) => {
    col.r = damp(col.r, arr[0], r, 0.016);
    col.g = damp(col.g, arr[1], r, 0.016);
    col.b = damp(col.b, arr[2], r, 0.016);
  };
  dc(U.uLight.value, dpal.l, 1.2);
  dc(U.uFog.value, dpal.f, 1.2);
  dc(U.uAccent.value, dpal.a, 1.2);
  renderer.setClearColor(U.uFog.value, 1);
  const playing = game.state === 'playing' || game.state === 'dead' || game.state === 'paused';
  Cos.applyColors(now);
  renderer.setRenderTarget(rt);
  renderer.clear(true, true, true);
  renderer.render(game.state === 'locker' ? studio : scene, camera);
  if (S.hands && playing && !game.third) {
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }
  renderer.setRenderTarget(null);
  const P = game.P,
    sn = P ? clamp((P.speed - 10) / 16, 0, 1) : 0.3,
    u = postMat.uniforms;
  u.tS.value = rt.texture;
  u.uTime.value = now;
  u.uBlur.value = (playing ? sn : 0.2) * 0.03 + game.flow * 0.008;
  u.uChroma.value = 0.25 + sn * 0.4 + game.flow * 0.4;
  u.uVig.value = 0.32 + sn * 0.12;
  u.uSlow.value = clamp(1 - game.ts, 0, 1);
  u.uFlash.value = game.flash;
  u.uRed.value = game.red;
  u.uShat.value = game.state === 'dead' ? clamp(game.deadT / 1, 0, 1) : 0;
  renderer.render(postScene, postCam);
  el.fxf.style.opacity = 0;
}
let lastT = performance.now() / 1e3;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1e3;
  const raw = Math.min(0.05, now - lastT);
  lastT = now;
  tickFrame(raw, now);
}
function tickFrame(raw, now) {
  game.flash = damp(game.flash, 0, 5, raw);
  game.red = damp(game.red, 0, 6, raw);
  const st = game.state;
  if (st === 'playing') {
    stepGame(raw, now);
  } else if (st === 'dead') {
    game.deadT += raw;
    if (game.deadT > 1.15) doRespawn();
  } else if (st === 'paused') {
    In.update(raw, now, false, false);
    labUpdate();
  } else {
    In.update(raw, now, false, false);
    if (st === 'settings') labUpdate();
    if (st === 'calib') Calib.tick();
    if (st === 'locker') updateStudio(raw, now);
  }
  if (st !== 'locker') leaveStudio();
  const inRun = st === 'playing' || st === 'dead' || st === 'paused' || (st === 'calib' && game.calibFrom === 'pause');
  if (game.course && game.P && inRun) {
    updateCamera(raw, now);
    if (st === 'playing' || st === 'dead') updateHands(st === 'dead' ? 0 : raw, now);
    updateRunner(st === 'playing' ? raw : 0, now, true);
  } else if (game.course) {
    updateCamera(raw, now);
    updateRunner(0, now, false);
  }
  UI.crosshair(raw);
  if (rt) render(now);
  el.fxr.style.opacity = game.red * 0.8;
}
function buildAttract() {
  const c = game.course,
    pts = [];
  for (const ch of c.chunks)
    for (const w of ch.wps) {
      const l = pts[pts.length - 1];
      if (!l || Math.hypot(l[0] - w[0], l[2] - w[2]) > 0.5) pts.push(w);
    }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]),
    );
  const len = cum[cum.length - 1];
  const at = (s) => {
    s = clamp(s, 0, len - 0.01);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(0.001, cum[i] - cum[i - 1]);
    return [
      lerp(pts[i - 1][0], pts[i][0], t),
      lerp(pts[i - 1][1], pts[i][1], t),
      lerp(pts[i - 1][2], pts[i][2], t),
    ];
  };
  const p0 = at(0),
    p1 = at(16);
  game.attract = {s: 0, len: len, at: at, cx: p0[0], cy: p0[1], cz: p0[2], lx: p1[0], lz: p1[2]};
}
const TIPS = [
  'Rotate. Do not tap.',
  'Your wrist is the controller.',
  'Look where you are going. Literally.',
  'Red kills. White holds.',
  'Snap early. Corners buffer.',
  'Breathe out on the landing.',
  'Rings in order play a melody.',
];
function setProg(p, label) {
  game.progT = p;
  if (label) $('#ld-step').textContent = label;
}
let progV = 0;
(function progLoop() {
  progV += ((game.progT || 0) - progV) * 0.12;
  const p = Math.round(progV * 100);
  $('#ld-pct').textContent = p;
  $('#ld-fill').style.width = progV * 100 + '%';
  if (game.state === 'loading') requestAnimationFrame(progLoop);
})();
function letters(id, txt, off) {
  const e = $(id);
  [...txt].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.setProperty('--i', i + off);
    if (ch === '.') s.className = 'dot';
    e.appendChild(s);
  });
}
letters('#t1', 'FLOW', 0);
letters('#t2', 'STATE.', 4);
$('#ld-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot() {
  game.applyView();
  Cos.newlyUnlocked();
  const t0 = performance.now();
  setProg(0.08, 'Waking the renderer');
  resize();
  await tick(120);
  setProg(0.3, 'Growing the course');
  newCourse((Math.random() * 2 ** 31) | 0);
  game.P = CORE.newPlayer(game.cp);
  await tick(120);
  setProg(0.6, 'Compiling shaders');
  buildAttract();
  try {
    updateCamera(0.016, 0);
    render(0);
  } catch (e) {
    console.error(e);
  }
  await tick(120);
  setProg(0.85, 'Tuning the silence');
  try {
    await Promise.race([document.fonts.ready, tick(1500)]);
  } catch (e) {}
  const wait = 2600 - (performance.now() - t0);
  if (wait > 0) await tick(wait);
  setProg(1, 'Ready');
  await tick(400);
  const b = $('#ld-go');
  b.textContent = 'Tap to enter';
  b.classList.add('rdy');
  b.disabled = false;
  b.onclick = async () => {
    b.onclick = null;
    In.requestMotion();
    A.init();
    A.ui();
    await tick(60);
    toMenu(true);
  };
}
function toMenu(wiped) {
  const go = () => {
    game.state = 'menu';
    show('menu');
    hud(false);
    if (game.course) buildAttract();
    $('#mn-best').textContent = 'Best ' + best + ' m';
    const nf = Cos.freshCount();
    $('#mn-new').textContent = nf ? nf + ' new' : '';
    updMode();
    A.intensity(0.2);
    A.setTS(1, false);
    A.slideStop();
    A.wind(0, false);
  };
  if (wiped) wipe(go);
  else go();
}
function updMode() {
  const m = modeNow();
  $('#mn-mode').textContent =
    m === 'gyro'
      ? 'Input: gyro'
      : isTouch
        ? 'No motion sensor: swipe mode. Open in its own tab for gyro'
        : 'Input: ' + (m === 'keys' ? 'keyboard + mouse' : m);
}
function hud(on) {
  el.hud.classList.toggle('on', on);
}
async function startFlow() {
  A.init();
  if (In.perm !== 'granted') await In.requestMotion();
  await tick(250);
  wipe(() => {
    newRun();
    game.state = 'calib';
    A.intensity(0.15);
    if (modeNow() === 'gyro') {
      game.state = 'calib';
      show('calib');
      Calib.open({onDone: beginRun, onCancel: () => wipe(() => toMenu(false))});
    } else beginRun();
  });
}
function beginRun() {
  show(null);
  hud(true);
  In.recenter();
  game.state = 'playing';
  game.lockT = 0.2;
  game.P.speed = 0;
  bigText('Go.');
  A.setTS(1, false);
  In.lock();
  ensureLock();
}
// If the lock did not take (Esc during a transition, Chrome's short re-lock cooldown, or the browser said no),
// pause so the next click relocks it instead of running with a dead mouse. After 3 refusals we stop insisting.
function ensureLock() {
  setTimeout(() => {
    if (game.state === 'playing' && In.canLock() && !In.locked) game.pause();
  }, 700);
}
$('#hp').onclick = () => game.pause();
$('#hv').onclick = () => game.toggleView();
let prev = 'menu';
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  A.init();
  if (a === 'play' || a === 'restart') In.lock(); // inside the click, so the browser grants pointer lock
  if (a === 'play') startFlow();
  else if (a === 'locker') {
    prev = 'menu';
    game.state = 'locker';
    show('locker');
    Locker.open();
  } else if (a === 'recal') game.openCalib('pause');
  else if (a === 'how') {
    prev = 'menu';
    game.state = 'how';
    show('how');
  } else if (a === 'settings') {
    prev = game.state === 'paused' ? 'pause' : 'menu';
    if (game.state !== 'paused') game.state = 'settings';
    show('settings');
    buildSettings();
  } else if (a === 'back') {
    if (game.state === 'locker') Locker.close();
    if (prev === 'pause') {
      buildPauseQuick();
      show('pause');
    } else toMenu(false);
  } else if (a === 'resume') game.resume();
  else if (a === 'restart') {
    wipe(() => {
      hud(true);
      newRun();
      beginRun();
    });
  } else if (a === 'menu')
    wipe(() => {
      toMenu(false);
    });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});
addEventListener('blur', () => game.pause());
boot();
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__fs = {A, In, Gyro, Cos, game, S, CORE, Calib, UI, tickFrame, camera, runner, K, newRun, beginRun, die, doRespawn, updateCamera};
