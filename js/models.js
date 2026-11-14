// Prosedürel 3B modeller: GEZGİN keşif aracı, ana uydu, çarpıcı, iyon itici, sensörler.
import * as THREE from 'three';
import { makeSolarTexture, makeTreadTexture, makeGlowTexture, makeRegolithTextures } from './textures.js';

let M = null;
export function mats() {
  if (M) return M;
  const foilN = makeRegolithTextures(256, 77).normal;
  const solar = makeSolarTexture();
  const tread = makeTreadTexture();
  tread.repeat.set(3, 1);
  M = {
    white: new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 0.35, roughness: 0.42 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.7, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0a640, metalness: 1.0, roughness: 0.28, normalMap: foilN, normalScale: new THREE.Vector2(0.6, 0.6) }),
    silverFoil: new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 1.0, roughness: 0.22, normalMap: foilN, normalScale: new THREE.Vector2(0.5, 0.5) }),
    solar: new THREE.MeshStandardMaterial({ map: solar, color: 0xffffff, metalness: 0.6, roughness: 0.25 }),
    tire: new THREE.MeshStandardMaterial({ map: tread, color: 0xffffff, metalness: 0.2, roughness: 0.85 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a1020, metalness: 0.9, roughness: 0.1, emissive: 0x1a3a70, emissiveIntensity: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0 }),
    green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.6) }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }),
    rtg: new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.8, roughness: 0.4, emissive: 0x501008, emissiveIntensity: 0.5 }),
    flameBlue: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 4.0), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    ionBlue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 5.0), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    glow: makeGlowTexture(128, 2.0),
  };
  return M;
}

function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function dish(radius, mat) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const r = (i / 12) * radius; pts.push(new THREE.Vector2(r, (r * r) / (radius * 2.2))); }
  const g = new THREE.LatheGeometry(pts, 32);
  const m = new THREE.Mesh(g, mat);
  m.material.side = THREE.DoubleSide;
  m.castShadow = true;
  return m;
}
function flameCone(r, h, mat) {
  // Taban nozülde (y=0), uç −y yönünde
  const g = new THREE.ConeGeometry(r, h, 16, 1, true);
  g.rotateX(Math.PI);
  g.translate(0, -h / 2, 0);
  return new THREE.Mesh(g, mat);
}
function plumeCone(r, h, mat) {
  // Uç motorda (y=0), genişleyerek +y yönünde açılır
  const g = new THREE.ConeGeometry(r, h, 20, 1, true);
  g.rotateX(Math.PI);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

// --- GEZGİN keşif aracı. Yerel eksenler: x sağ, y yukarı, z ileri. ---
export function buildRover(r) {
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(box(1.7, 0.5, 2.6, m.white, 0, 0, 0));
  body.add(box(1.5, 0.3, 2.2, m.gold, 0, -0.38, 0));
  const deck = box(1.78, 0.05, 2.62, m.solar, 0, 0.28, 0);
  body.add(deck);
  body.add(box(0.5, 0.25, 0.4, m.grey, -0.4, 0.42, -0.9));
  body.add(box(1.72, 0.12, 0.12, m.dark, 0, 0.1, 1.32));
  // Direk ve kamera başlığı
  const mast = cyl(0.05, 0.06, 1.4, m.grey); mast.position.set(0.55, 0.98, 0.95); body.add(mast);
  const head = box(0.5, 0.24, 0.26, m.white, 0.55, 1.72, 0.98); body.add(head);
  for (const dx of [-0.13, 0.13]) {
    const l = cyl(0.06, 0.06, 0.06, m.lens, 12); l.rotation.x = Math.PI / 2; l.position.set(0.55 + dx, 1.72, 1.13); body.add(l);
  }
  // Farlar
  const headlights = [];
  for (const dx of [-0.55, 0.55]) {
    const lamp = box(0.22, 0.12, 0.05, m.lamp, dx, 0.05, 1.32); body.add(lamp);
    const sl = new THREE.SpotLight(0xfff1dc, 0, 70, 0.55, 0.6, 1.6);
    sl.position.set(dx, 0.1, 1.35);
    const tgt = new THREE.Object3D(); tgt.position.set(dx * 1.5, -1.5, 12);
    body.add(sl, tgt); sl.target = tgt;
    headlights.push(sl);
  }
  // Anten
  if (r.antenna === 'buyuk') {
    const strut = cyl(0.04, 0.04, 0.8, m.grey); strut.position.set(-0.45, 0.65, -0.85); body.add(strut);
    const d = dish(0.55, m.white.clone()); d.position.set(-0.45, 1.05, -0.85); d.rotation.x = -0.8; body.add(d);
    const feed = cyl(0.02, 0.02, 0.4, m.grey); feed.position.set(-0.45, 1.25, -0.72); feed.rotation.x = -0.8; body.add(feed);
  } else {
    const whip = cyl(0.015, 0.025, 1.3, m.grey); whip.position.set(-0.65, 0.95, -1.05); body.add(whip);
    body.add(box(0.25, 0.04, 0.25, m.white, -0.65, 0.33, -1.05));
  }
  // Güç
  if (r.power === 'gunes_buyuk') {
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      wing.add(box(1.5, 0.04, 2.4, m.solar, s * 0.75, 0, 0));
      wing.add(box(1.52, 0.06, 0.05, m.grey, s * 0.75, 0, 1.2));
      wing.add(box(1.52, 0.06, 0.05, m.grey, s * 0.75, 0, -1.2));
      wing.position.set(s * 0.88, 0.3, 0); wing.rotation.z = s * 0.18;
      body.add(wing);
    }
  } else if (r.power === 'rtg') {
    const rtg = new THREE.Group();
    rtg.add(cyl(0.16, 0.16, 0.9, m.rtg));
    for (let i = 0; i < 6; i++) { const f = box(0.02, 0.8, 0.22, m.dark); f.rotation.y = (i / 6) * Math.PI; f.position.y = 0; rtg.add(f); }
    rtg.position.set(0, 0.35, -1.55); rtg.rotation.x = 0.9;
    body.add(rtg);
  }
  // Aletler
  if (r.instruments.spektrometre) {
    const t = box(0.32, 0.22, 0.3, m.gold, -0.3, 0.42, 1.05); body.add(t);
    const l = cyl(0.07, 0.07, 0.1, m.lens, 12); l.rotation.x = Math.PI / 2; l.position.set(-0.3, 0.42, 1.24); body.add(l);
  }
  const seismicPods = [];
  if (r.instruments.sismometre) {
    for (const z of [-0.65, 0, 0.65]) {
      const pod = cyl(0.15, 0.17, 0.22, m.gold, 12); pod.position.set(0.93, 0.05, z); pod.rotation.z = Math.PI / 2; body.add(pod);
      seismicPods.push(pod);
    }
  }
  if (r.instruments.matkap) {
    const d = cyl(0.06, 0.06, 1.2, m.grey); d.position.set(-0.97, 0.15, 0.4); body.add(d);
    body.add(box(0.18, 0.3, 0.18, m.dark, -0.97, 0.7, 0.4));
  }
  // Tekerlekler (rocker-bogie)
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12);
  hubGeo.rotateZ(Math.PI / 2);
  for (const x of [-1.15, 1.15]) {
    for (const z of [-0.95, 0, 0.95]) {
      const holder = new THREE.Group();
      holder.position.set(x, -0.45, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, m.tire); tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, m.grey);
      spin.add(tire, hub);
      holder.add(spin);
      const arm = box(0.08, 0.5, 0.08, m.grey, -Math.sign(x) * 0.2, 0.25, 0); holder.add(arm);
      g.add(holder);
      wheels.push({ holder, spin, x, z, rest: -0.45, off: 0 });
    }
    const rocker = box(0.08, 0.08, 2.0, m.grey, x * 0.9, -0.15, 0); g.add(rocker);
  }
  // Manevra iticileri
  const flames = [];
  for (const x of [-0.7, 0.7]) for (const z of [-1.0, 1.0]) {
    const noz = cyl(0.05, 0.1, 0.16, m.dark, 10); noz.position.set(x, -0.55, z); body.add(noz);
    const f = flameCone(0.14, 1.3, m.flameBlue); f.position.set(x, -0.63, z); f.visible = false; body.add(f);
    flames.push(f);
  }
  const thrustLight = new THREE.PointLight(0x7fb0ff, 0, 18, 2);
  thrustLight.position.set(0, -1.2, 0);
  g.add(thrustLight);

  function setLights(on) {
    headlights.forEach((l) => (l.intensity = on ? 220 : 0));
    m.lamp.emissiveIntensity = on ? 6 : 0;
  }
  return { group: g, body, wheels, flames, thrustLight, seismicPods, setLights, headlights };
}

// --- Ana uydu ---
export function buildMothership() {
  const m = mats();
  const g = new THREE.Group();
  g.add(box(3, 2.6, 3, m.gold));
  g.add(box(3.05, 0.2, 3.05, m.white, 0, 1.35, 0));
  for (const s of [-1, 1]) {
    const boom = cyl(0.06, 0.06, 2, m.grey); boom.rotation.z = Math.PI / 2; boom.position.set(s * 2.5, 0, 0); g.add(boom);
    const wing = new THREE.Group();
    for (let k = 0; k < 3; k++) wing.add(box(2.6, 0.06, 2.8, m.solar, s * (1.5 + k * 2.7), 0, 0));
    wing.position.x = s * 2.2;
    g.add(wing);
  }
  const d = dish(1.4, m.white.clone()); d.position.set(0, 1.5, 0); g.add(d);
  const feed = cyl(0.04, 0.04, 1.0, m.grey); feed.position.set(0, 2.0, 0); g.add(feed);
  const noz = cyl(0.35, 0.6, 0.8, m.dark); noz.position.set(0, -1.7, 0); g.add(noz);
  const flames = [];
  for (const [x, z] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]) {
    const f = flameCone(0.2, 2.4, m.flameBlue); f.position.set(x, -1.4, z); f.rotation.z = Math.sign(x) * 0.5; f.visible = false;
    g.add(f); flames.push(f);
  }
  g.userData.flames = flames;
  return g;
}

// --- Kinetik çarpıcı (DART benzeri) ---
export function buildImpactor() {
  const m = mats();
  const g = new THREE.Group();
  g.add(box(1.2, 1.2, 1.2, m.gold));
  g.add(box(1.22, 0.1, 1.22, m.white, 0, 0.62, 0));
  for (const s of [-1, 1]) {
    const arm = cyl(0.04, 0.04, 1.2, m.grey); arm.rotation.z = Math.PI / 2; arm.position.set(s * 1.1, 0, 0); g.add(arm);
    const panel = cyl(1.4, 1.4, 0.05, m.solar, 32); panel.rotation.z = Math.PI / 2; panel.position.set(s * 2.4, 0, 0); g.add(panel);
  }
  const d = dish(0.4, m.white.clone()); d.position.set(0, 0.7, 0); g.add(d);
  return g;
}

// --- İyon itici (kutba ankrajlı) ---
export function buildIonTug(count = 2) {
  const m = mats();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.08, 0.06, 3.2, m.grey); leg.position.set(Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4);
    leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); g.add(leg);
    const foot = cyl(0.3, 0.35, 0.12, m.dark); foot.position.set(Math.cos(a) * 2.0, 0.05, Math.sin(a) * 2.0); g.add(foot);
  }
  g.add(at(cyl(1.0, 1.1, 1.6, m.silverFoil, 20), 0, 2.8, 0));
  const plumes = [];
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = n > 1 ? Math.cos(a) * 0.5 : 0, z = n > 1 ? Math.sin(a) * 0.5 : 0;
    const eng = cyl(0.35, 0.35, 0.5, m.dark, 20); eng.position.set(x, 3.85, z); g.add(eng);
    const grid = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.6, 5) }));
    grid.rotation.x = -Math.PI / 2; grid.position.set(x, 4.11, z); g.add(grid);
    const pl = plumeCone(1.6, 22, m.ionBlue);
    pl.position.set(x, 4.1, z);
    pl.visible = false;
    g.add(pl); plumes.push(pl);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k++) g.add(box(2.4, 0.05, 1.6, m.solar, s * (2.3 + k * 2.5), 2.8, 0));
  }
  g.userData.plumes = plumes;
  return g;
}

// --- Yüzeye bırakılan nesneler ---
export function buildSensor() {
  const m = mats();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.03, 0.03, 0.7, m.grey, 6); leg.position.set(Math.cos(a) * 0.25, 0.3, Math.sin(a) * 0.25);
    leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(leg);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.gold);
  dome.position.y = 0.55; dome.castShadow = true; g.add(dome);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.green); led.position.y = 0.86; g.add(led);
  g.userData.blink = led;
  return g;
}
export function buildBeacon() {
  const m = mats();
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.08, 2.4, m.grey), 0, 1.2, 0));
  g.add(box(0.5, 0.3, 0.5, m.gold, 0, 0.15, 0));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m.red); top.position.y = 2.45; g.add(top);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.glow, color: new THREE.Color(6, 0.4, 0.3), blending: THREE.AdditiveBlending, depthWrite: false }));
  spr.scale.setScalar(2.5); spr.position.y = 2.45; g.add(spr);
  g.userData.blink = spr;
  return g;
}
export function buildFlag(color = 0x6fd3ff) {
  const m = mats();
  const g = new THREE.Group();
  g.add(at(cyl(0.025, 0.025, 1.6, m.grey, 6), 0, 0.8, 0));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.3 }));
  f.position.set(0.35, 1.4, 0); g.add(f);
  return g;
}
export function buildDrillSite() {
  const m = mats();
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  hole.rotation.x = -Math.PI / 2; hole.position.y = 0.03; g.add(hole);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.8, 24), new THREE.MeshStandardMaterial({ color: 0x9a9088, roughness: 1 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.add(buildFlag(0xffb547).translateX(1));
  return g;
}
