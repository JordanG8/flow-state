'use strict';
// The AR-9: the Arena's only weapon, modelled in code. One build function serves the first-person view model and
// the rifle every third-person soldier carries. Parts are merged into a few geometries with per-vertex colour and
// drawn with a toon shader plus an ink outline, to sit in the same paper-and-ink world as the course.
const Rifle = (() => {
  const COL = {
    dark: [0.085, 0.09, 0.105],
    body: [0.17, 0.18, 0.205],
    poly: [0.29, 0.3, 0.33],
    metal: [0.56, 0.58, 0.62],
    light: [0.88, 0.87, 0.83],
    lens: [0.2, 0.75, 0.9],
    tint: [2, 0, 0], // marker: drawn in the owner's colour
  };
  const MUZZLE_Z = -0.745,
    AXIS_Y = 0.055;

  // ---- geometry -------------------------------------------------------------------------------------------
  function builder() {
    const pos = [],
      nor = [],
      col = [];
    const m = new THREE.Matrix4(),
      n3 = new THREE.Matrix3(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      v = new THREE.Vector3(),
      one = new THREE.Vector3(1, 1, 1);
    const add = (geo, c, x, y, z, rx, ry, rz) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      m.compose(v.set(x, y, z), q.setFromEuler(e.set(rx || 0, ry || 0, rz || 0)), one);
      n3.getNormalMatrix(m);
      const p = g.attributes.position,
        n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(n3).normalize();
        nor.push(v.x, v.y, v.z);
        col.push(c[0], c[1], c[2]);
      }
      geo.dispose();
    };
    return {
      box: (w, h, d, c, x, y, z, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz),
      // cylinder along the barrel axis
      cyl: (r, len, c, x, y, z, seg, r2) => add(new THREE.CylinderGeometry(r2 || r, r, len, seg || 10), c, x, y, z, Math.PI / 2, 0, 0),
      done() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
        return g;
      },
    };
  }
  let GEO = null;
  // Origin is the top of the pistol grip. The barrel points down -z along y = AXIS_Y.
  function geometry() {
    if (GEO) return GEO;
    const {dark, body, poly, metal, light, lens, tint} = COL;
    const Y = AXIS_Y;
    let b = builder();
    // receiver
    b.box(0.052, 0.062, 0.27, body, 0, Y, -0.045);
    b.box(0.04, 0.012, 0.27, dark, 0, Y + 0.036, -0.045);
    b.box(0.004, 0.024, 0.075, dark, 0.0265, Y + 0.004, -0.06); // ejection port
    b.box(0.012, 0.018, 0.03, body, 0.03, Y - 0.004, 0.05); // forward assist
    b.box(0.006, 0.03, 0.012, poly, 0.0285, Y - 0.008, -0.012, 0, 0, 0.25); // brass deflector
    b.box(0.046, 0.05, 0.19, poly, 0, 0, -0.01);
    b.box(0.047, 0.076, 0.07, poly, 0, -0.045, -0.085, 0.08);
    b.box(0.049, 0.01, 0.074, dark, 0, -0.083, -0.088, 0.08); // magwell lip
    for (const s of [-1, 1]) {
      b.box(0.003, 0.009, 0.009, metal, s * 0.0238, 0.014, -0.045); // pins
      b.box(0.003, 0.009, 0.009, metal, s * 0.0238, 0.008, 0.06);
      b.box(0.003, 0.02, 0.03, dark, s * 0.0238, 0.0, -0.085); // mag release
    }
    b.box(0.005, 0.01, 0.022, tint, -0.0245, 0.012, 0.03, 0.5); // selector
    b.box(0.03, 0.009, 0.022, dark, 0, Y + 0.036, 0.098); // charging handle
    b.box(0.05, 0.007, 0.012, dark, 0, Y + 0.036, 0.107);
    // trigger group
    b.box(0.012, 0.006, 0.078, dark, 0, -0.054, 0.004);
    b.box(0.012, 0.032, 0.006, dark, 0, -0.04, -0.034);
    b.box(0.008, 0.03, 0.008, tint, 0, -0.036, 0.014, -0.3);
    // grip
    b.box(0.04, 0.118, 0.05, dark, 0, -0.078, 0.078, -0.32);
    b.box(0.043, 0.012, 0.054, poly, 0, -0.134, 0.097, -0.32);
    for (let i = 0; i < 4; i++) b.box(0.042, 0.006, 0.018, body, 0, -0.05 - i * 0.021, 0.096 + i * 0.007, -0.32);
    // handguard: slotted sides, a lower bulge, an accent collar
    b.box(0.05, 0.058, 0.31, poly, 0, Y, -0.335);
    b.box(0.042, 0.022, 0.27, dark, 0, Y - 0.036, -0.33);
    b.box(0.054, 0.062, 0.014, dark, 0, Y, -0.183);
    b.box(0.0525, 0.0605, 0.012, tint, 0, Y, -0.476);
    b.box(0.054, 0.062, 0.01, dark, 0, Y, -0.489);
    for (let i = 0; i < 6; i++)
      for (const s of [-1, 1]) {
        b.box(0.004, 0.013, 0.03, dark, s * 0.0245, Y + 0.008, -0.22 - i * 0.042);
        b.box(0.004, 0.008, 0.03, dark, s * 0.0245, Y - 0.014, -0.24 - i * 0.042);
      }
    b.box(0.03, 0.012, 0.09, dark, 0, Y - 0.052, -0.36); // hand stop
    b.box(0.03, 0.026, 0.014, dark, 0, Y - 0.058, -0.398, 0.3);
    // top rail
    b.box(0.024, 0.008, 0.585, dark, 0, Y + 0.044, -0.2);
    for (let i = 0; i < 23; i++) b.box(0.03, 0.007, 0.013, body, 0, Y + 0.05, 0.08 - i * 0.0255);
    // barrel and muzzle brake
    b.box(0.032, 0.04, 0.03, dark, 0, Y + 0.002, -0.508);
    b.cyl(0.0105, 0.2, metal, 0, Y, -0.59, 10);
    b.cyl(0.013, 0.03, dark, 0, Y, -0.535, 10);
    b.cyl(0.0175, 0.075, dark, 0, Y, -0.7075, 8);
    b.cyl(0.0185, 0.009, tint, 0, Y, -0.668, 8);
    b.cyl(0.0195, 0.006, body, 0, Y, -0.742, 8);
    for (let i = 0; i < 3; i++) b.box(0.039, 0.007, 0.01, body, 0, Y, -0.688 - i * 0.018);
    // folding front sight
    b.box(0.024, 0.01, 0.03, dark, 0, Y + 0.056, -0.455);
    b.box(0.006, 0.03, 0.006, dark, 0, Y + 0.075, -0.455);
    b.box(0.02, 0.022, 0.004, dark, 0, Y + 0.07, -0.447);
    // optic: an open reflex frame on a riser
    b.box(0.03, 0.016, 0.075, dark, 0, Y + 0.058, -0.045);
    b.box(0.046, 0.007, 0.062, body, 0, Y + 0.069, -0.045);
    for (const s of [-1, 1]) b.box(0.005, 0.044, 0.05, body, s * 0.0205, Y + 0.093, -0.051);
    b.box(0.046, 0.006, 0.05, body, 0, Y + 0.117, -0.051);
    b.box(0.048, 0.004, 0.004, tint, 0, Y + 0.121, -0.076);
    b.box(0.036, 0.04, 0.002, lens, 0, Y + 0.093, -0.066);
    b.box(0.014, 0.014, 0.014, metal, 0.03, Y + 0.085, -0.03);
    b.box(0.03, 0.012, 0.02, dark, 0, Y + 0.078, -0.012);
    // stock
    b.cyl(0.0155, 0.2, dark, 0, Y - 0.004, 0.19, 10);
    b.box(0.036, 0.072, 0.165, poly, 0, Y - 0.02, 0.272);
    b.box(0.03, 0.03, 0.135, poly, 0, -0.012, 0.288, 0.36);
    b.box(0.041, 0.135, 0.024, dark, 0, 0.012, 0.362);
    b.box(0.03, 0.012, 0.125, body, 0, Y + 0.022, 0.262);
    b.box(0.0375, 0.009, 0.1, tint, 0, Y - 0.012, 0.268);
    b.box(0.038, 0.02, 0.012, dark, 0, Y - 0.02, 0.196);
    for (let i = 0; i < 3; i++) b.box(0.043, 0.006, 0.026, body, 0, -0.03 + i * 0.04, 0.362);
    const main = b.done();
    // magazine (drops out on reload)
    b = builder();
    b.box(0.034, 0.1, 0.058, body, 0, -0.125, -0.092, 0.1);
    b.box(0.034, 0.085, 0.058, body, 0, -0.205, -0.109, 0.28);
    b.box(0.039, 0.013, 0.066, tint, 0, -0.249, -0.122, 0.28);
    for (let i = 0; i < 3; i++) b.box(0.036, 0.004, 0.05, dark, 0, -0.13 - i * 0.034, -0.092 - i * 0.006, 0.1 + i * 0.07);
    b.box(0.006, 0.07, 0.004, light, 0.0175, -0.15, -0.066, 0.16); // witness strip
    const mag = b.done();
    // bolt carrier, seen through the ejection port
    b = builder();
    b.box(0.006, 0.02, 0.07, metal, 0.0262, AXIS_Y + 0.004, -0.06);
    b.box(0.008, 0.008, 0.02, light, 0.0268, AXIS_Y + 0.004, -0.04);
    const bolt = b.done();
    GEO = {main, mag, bolt};
    return GEO;
  }

  // ---- materials ------------------------------------------------------------------------------------------
  const VS = `attribute vec3 aCol;uniform float uOut;varying vec3 vN,vW,vC;varying float vD;
void main(){vec3 p=position+normal*uOut;vec4 wp=modelMatrix*vec4(p,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);vC=aCol;vec4 mv=viewMatrix*wp;vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
  const FS = `precision highp float;uniform vec3 uSun,uFog,uInk,uCam,uTint;uniform float uFogDen,uLine,uHeat;varying vec3 vN,vW,vC;varying float vD;
void main(){vec3 n=normalize(vN);vec3 col;
if(uLine>.5){col=uInk;}else{
vec3 base=vC.r>1.5?uTint:vC;vec3 l=normalize(uSun);vec3 v=normalize(uCam-vW);
float sunL=clamp(dot(n,l),0.,1.);float lit=.5+.5*sunL+.18*(n.y*.5+.5);lit=floor(lit*4.+.5)/4.;
float rim=pow(1.-clamp(dot(n,v),0.,1.),2.5);float sp=step(.955,dot(n,normalize(l+v)));
float gloss=smoothstep(.25,.6,dot(base,vec3(.33)));
col=base*lit*1.18+rim*mix(.10,.22,gloss)+sp*mix(.06,.3,gloss);
col+=vec3(1.,.62,.25)*uHeat;}
float f=1.-exp(-pow(vD*uFogDen,1.6));col=mix(col,uFog,clamp(f,0.,1.));gl_FragColor=vec4(col,1.);}`;
  // world: true for rifles in the map (fogged, lit from the real camera); false for the view model.
  function materials(world, tint) {
    const base = {
      uSun: U.uSun,
      uFog: U.uFog,
      uInk: U.uInk,
      uCam: world ? U.uCam : {value: new THREE.Vector3()},
      uFogDen: world ? U.uFogDen : {value: 0},
      uTint: {value: new THREE.Color(tint[0], tint[1], tint[2])},
      uHeat: {value: 0},
    };
    const fill = new THREE.ShaderMaterial({uniforms: Object.assign({uOut: {value: 0}, uLine: {value: 0}}, base), vertexShader: VS, fragmentShader: FS});
    const line = new THREE.ShaderMaterial({
      uniforms: Object.assign({uOut: {value: world ? 0.006 : 0.0028}, uLine: {value: 1}}, base),
      vertexShader: VS,
      fragmentShader: FS,
      side: THREE.BackSide,
    });
    return {fill, line, tint: base.uTint.value, heat: base.uHeat};
  }

  // ---- muzzle flash ---------------------------------------------------------------------------------------
  let flashTex = null;
  function flashTexture() {
    if (flashTex) return flashTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    const star = (n, r0, r1, fill) => {
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2,
          r = i % 2 ? r0 : r1 * (0.7 + 0.3 * Math.abs(Math.sin(i * 2.3)));
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    star(7, 16, 62, '#ff5a14');
    star(7, 12, 46, '#ffb020');
    star(6, 8, 28, '#fff3c4');
    g.beginPath();
    g.arc(0, 0, 11, 0, 7);
    g.fillStyle = '#fff';
    g.fill();
    flashTex = new THREE.CanvasTexture(c);
    return flashTex;
  }

  // Returns {root, mag, bolt, muzzle, flash, mats, fire(), update(dt)}.
  function build(world, tint) {
    const G = geometry(),
      mats = materials(world, tint || [1, 0.36, 0.1]),
      root = new THREE.Group();
    const part = (geo) => {
      const g = new THREE.Group(),
        a = new THREE.Mesh(geo, mats.fill),
        o = new THREE.Mesh(geo, mats.line);
      a.frustumCulled = o.frustumCulled = false;
      g.add(a, o);
      root.add(g);
      return g;
    };
    part(G.main);
    const mag = part(G.mag),
      bolt = part(G.bolt);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, AXIS_Y, MUZZLE_Z);
    root.add(muzzle);
    const fm = new THREE.MeshBasicMaterial({map: flashTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false});
    const flash = new THREE.Group(),
      pg = new THREE.PlaneGeometry(1, 1);
    const f0 = new THREE.Mesh(pg, fm),
      f1 = new THREE.Mesh(pg, fm),
      f2 = new THREE.Mesh(pg, fm);
    f1.rotation.y = Math.PI / 2;
    f1.scale.set(1.9, 0.55, 1);
    f1.position.z = -0.5;
    f2.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    f2.scale.set(1.9, 0.55, 1);
    f2.position.z = -0.5;
    flash.add(f0, f1, f2);
    flash.position.z = -0.02;
    flash.visible = false;
    for (const f of flash.children) f.frustumCulled = false;
    muzzle.add(flash);
    const r = {root, mag, bolt, muzzle, flash, mats, flashT: 0, boltK: 0};
    r.fire = () => {
      r.flashT = 0.055;
      r.boltK = 1;
      flash.visible = true;
      flash.rotation.z = Math.random() * 6.28;
      flash.scale.setScalar((world ? 0.3 : 0.2) * (0.8 + Math.random() * 0.5));
    };
    r.update = (dt) => {
      if (r.flashT > 0) {
        r.flashT -= dt;
        if (r.flashT <= 0) flash.visible = false;
      }
      r.boltK += (0 - r.boltK) * (1 - Math.exp(-30 * dt));
      bolt.position.z = r.boltK * 0.045;
      mats.heat.value = r.flashT > 0 ? 0.1 : 0;
    };
    return r;
  }
  return {build, COL, MUZZLE_Z, AXIS_Y};
})();
