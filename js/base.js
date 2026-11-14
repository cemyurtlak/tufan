// Fırlatma Kompleksi LC-39: uçuş direktörünü yönet, çarpıcıyı hazırla ve ateşle.
import * as THREE from 'three';
import { buildLaunchSite } from './launch.js';
import { Particles } from './particles.js';
import { makeSmokeTexture } from './textures.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { $, toast } from './ui.js';
import { fmt } from './data.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BEAM_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BEAM_FS = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 1.6) * opacity; gl_FragColor = vec4(color * a, a); }`;

const WIND_LIMIT = 14;

// Karakter modeli oyun açılırken bir kez yüklenir (ilk karede eski modelin görünmesini önler)
let CHAR_GLTF = null;
export function preloadCharacter() {
  if (CHAR_GLTF) return Promise.resolve(CHAR_GLTF);
  const url = (window.__TEX && window.__TEX['Soldier.glb']) || 'assets/models/Soldier.glb';
  return new Promise((res) => new GLTFLoader().load(url, (g) => { CHAR_GLTF = g; res(g); }, undefined, (e) => { console.warn('Karakter modeli yüklenemedi', e); res(null); }));
}
export const getCharacterGLTF = () => CHAR_GLTF;

// ---------------- Karakter ----------------
function buildCharacter() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f3a6b, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x5f5a4c, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99572, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.8 });
  const reflect = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.3, metalness: 0.4, emissive: 0x333333 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const torso = mk(new THREE.CapsuleGeometry(0.27, 0.5, 6, 12), jacket, 0, 1.18, 0);
  torso.scale.set(1, 1, 0.75);
  g.add(torso);
  g.add(mk(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 16), reflect, 0, 1.12, 0));
  g.add(mk(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), skin, 0, 1.55, 0));
  const head = mk(new THREE.SphereGeometry(0.16, 16, 12), skin, 0, 1.72, 0);
  g.add(head);
  const hair = mk(new THREE.SphereGeometry(0.168, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), dark, 0, 1.74, -0.01);
  g.add(hair);
  // kulaklık
  const band = mk(new THREE.TorusGeometry(0.17, 0.015, 6, 20, Math.PI), dark, 0, 1.74, 0);
  band.rotation.z = 0; g.add(band);
  g.add(mk(new THREE.BoxGeometry(0.05, 0.09, 0.07), dark, 0.17, 1.7, 0));
  const mic = mk(new THREE.BoxGeometry(0.015, 0.015, 0.14), dark, 0.15, 1.65, 0.08); mic.rotation.y = 0.5; g.add(mic);
  const limb = (r, l, mat, px, py, off) => {
    const pivot = new THREE.Group(); pivot.position.set(px, py, 0);
    const m = mk(new THREE.CapsuleGeometry(r, l, 4, 8), mat, 0, off, 0); pivot.add(m);
    g.add(pivot); return pivot;
  };
  const armL = limb(0.075, 0.5, jacket, -0.36, 1.45, -0.32);
  const armR = limb(0.075, 0.5, jacket, 0.36, 1.45, -0.32);
  armL.children[0].add(mk(new THREE.SphereGeometry(0.075, 8, 6), skin, 0, -0.32, 0));
  armR.children[0].add(mk(new THREE.SphereGeometry(0.075, 8, 6), skin, 0, -0.32, 0));
  const legL = limb(0.1, 0.6, pants, -0.13, 0.9, -0.42);
  const legR = limb(0.1, 0.6, pants, 0.13, 0.9, -0.42);
  legL.add(mk(new THREE.BoxGeometry(0.16, 0.1, 0.3), dark, 0, -0.85, 0.05));
  legR.add(mk(new THREE.BoxGeometry(0.16, 0.1, 0.3), dark, 0, -0.85, 0.05));
  g.userData = { armL, armR, legL, legR, phase: 0 };
  return g;
}

// ---------------- Saha aracı (SUV) ----------------
function buildCar() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.35, metalness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.4, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1724, roughness: 0.08, metalness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.2, metalness: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 0.6 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x402000, emissive: 0xff9a10, emissiveIntensity: 0 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  box(2.0, 0.78, 4.6, white, 0, 0.78, 0);              // gövde
  box(2.02, 0.14, 4.62, blue, 0, 0.92, 0);             // şerit
  box(1.9, 0.3, 1.25, white, 0, 1.25, 1.55).rotation.x = -0.12; // kaput
  box(1.86, 0.72, 2.6, glass, 0, 1.52, -0.45);         // camlar
  box(1.9, 0.12, 2.65, white, 0, 1.93, -0.45);         // tavan
  for (const x of [-0.93, 0.93]) box(0.06, 0.72, 0.12, white, x, 1.52, 0.8);   // A direkleri
  for (const x of [-0.93, 0.93]) box(0.06, 0.72, 0.12, white, x, 1.52, -1.7);  // C direkleri
  box(2.04, 0.3, 0.25, dark, 0, 0.5, 2.36);            // ön tampon
  box(2.04, 0.3, 0.25, dark, 0, 0.5, -2.36);           // arka tampon
  box(1.3, 0.28, 0.06, chrome, 0, 0.98, 2.31);         // ızgara
  for (const x of [-0.72, 0.72]) box(0.34, 0.16, 0.06, head, x, 1.0, 2.31);
  const tails = [-0.8, 0.8].map((x) => box(0.24, 0.22, 0.06, tail, x, 1.0, -2.31));
  const bar = box(1.2, 0.13, 0.28, amber, 0, 2.06, 0.2);  // tepe lambası
  box(1.6, 0.06, 0.06, dark, 0, 2.0, -0.45);           // tavan rayı
  // kapı yazısı
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.fillStyle = '#1f5fbf'; x.font = '700 46px "Exo 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LC-39 SAHA EKİBİ', 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  for (const sgn of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    decal.position.set(sgn * 1.012, 0.62, 0.1); decal.rotation.y = sgn * Math.PI / 2; g.add(decal);
  }
  // tekerlekler
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20); wg.rotateZ(Math.PI / 2);
  const rg = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12); rg.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const holder = new THREE.Group(); holder.position.set(wx, 0.42, wz);
    const spin = new THREE.Group();
    const w = new THREE.Mesh(wg, tire); w.castShadow = true;
    spin.add(w, new THREE.Mesh(rg, chrome));
    holder.add(spin); g.add(holder);
    wheels.push({ holder, spin, front: wz > 0 });
  }
  // farlar
  const lights = [];
  for (const sx of [-0.72, 0.72]) {
    const sl = new THREE.SpotLight(0xfff1dc, 300, 70, 0.45, 0.6, 1.8);
    sl.position.set(sx, 1.0, 2.4);
    const tg = new THREE.Object3D(); tg.position.set(sx, 0, 14);
    g.add(sl, tg); sl.target = tg; lights.push(sl);
  }
  g.userData = { wheels, tails, bar, tailMat: tail, barMat: amber };
  return g;
}

function textSign(text, w = 512, h = 96, color = '#ffd27a') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, w, h);
  x.fillStyle = color; x.font = `700 ${Math.round(h * 0.42)}px "Exo 2", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function screenTex(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#04121e'; x.fillRect(0, 0, 256, 160);
  x.strokeStyle = '#2aa8e0'; x.lineWidth = 2;
  if (seed === 0) { // yörünge
    x.beginPath(); x.ellipse(128, 80, 100, 50, 0.2, 0, 7); x.stroke();
    x.fillStyle = '#5fd8ff'; x.beginPath(); x.arc(90, 70, 10, 0, 7); x.fill();
    x.fillStyle = '#ff6a50'; x.beginPath(); x.arc(205, 95, 4, 0, 7); x.fill();
  } else if (seed === 1) { // telemetri grafikleri
    for (let k = 0; k < 3; k++) { x.beginPath(); for (let i = 0; i < 256; i += 4) x.lineTo(i, 40 + k * 45 + Math.sin(i * 0.05 + k) * 12 * Math.random()); x.stroke(); }
  } else { // liste
    x.fillStyle = '#6dffa8'; x.font = '14px monospace';
    ['YAKIT   GO', 'HEDEF   GO', 'RÜZGAR  GO', 'MENZİL  GO', 'UÇUŞ YZ GO'].forEach((l, i) => x.fillText(l, 20, 30 + i * 26));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BaseScene {
  constructor({ launcher, res, cfg, onFire, allowUnlock }) {
    this.res = res; this.cfg = cfg; this.onFire = onFire; this.allowUnlock = allowUnlock;
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x7a5a4a, 250, 4500);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 20000);
    const site = this.site = buildLaunchSite(scene, launcher);
    site.sun.shadow.camera.left = -45; site.sun.shadow.camera.right = 45;
    site.sun.shadow.camera.top = 45; site.sun.shadow.camera.bottom = -45;
    site.sun.shadow.camera.updateProjectionMatrix();
    scene.add(site.sun.target);
    this.sunOffset = site.sun.position.clone().normalize().multiplyScalar(300);
    const R = site.R;

    this.boxes = [];     // {minX,maxX,minZ,maxZ}
    this.circles = [];   // {x,z,r}
    this.occluders = []; // kamera çarpışması
    const addBox = (cx, cz, w, d) => this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

    // Kaide ve kule engelleri
    const mw = R.R * 6 + (launcher.visual === 'heavy' || launcher.visual === 'super' ? 10 : 0);
    addBox(0, 0, mw, R.R * 5);
    addBox(site.towerX, 0, 4.6, 4.6);
    this.occluders.push(site.tower, site.mount, R.rocket);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.92 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.5, metalness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.45, metalness: 0.2 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.5, metalness: 0.3 });
    const mkBox = (w, h, d, mat, x, y, z, occ = true, col = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      if (occ) this.occluders.push(m);
      if (col) addBox(x, z, w, d);
      return m;
    };

    // Yol
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 56), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.04, 81); road.receiveShadow = true; scene.add(road);
    for (let z = 58; z < 106; z += 6) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.5), new THREE.MeshBasicMaterial({ color: 0xd8c070 }));
      l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
    }

    // Sığınak (ateşleme kontrol merkezi)
    const BZ = 115, BW = 28, BD = 16, BH = 5, T = 0.6;
    this.bunker = { minX: -BW / 2, maxX: BW / 2, minZ: BZ - BD / 2, maxZ: BZ + BD / 2 };
    const front = BZ - BD / 2;
    mkBox(BW / 2 - 2.5, BH, T, concrete, -(2.5 + (BW / 2 - 2.5) / 2), BH / 2, front);
    mkBox(BW / 2 - 2.5, BH, T, concrete, (2.5 + (BW / 2 - 2.5) / 2), BH / 2, front);
    mkBox(5, BH - 3, T, concrete, 0, 3 + (BH - 3) / 2, front, true, false);
    mkBox(BW, BH, T, concrete, 0, BH / 2, BZ + BD / 2);
    mkBox(T, BH, BD, concrete, -BW / 2, BH / 2, BZ);
    mkBox(T, BH, BD, concrete, BW / 2, BH / 2, BZ);
    const roof = mkBox(BW + 1, 0.8, BD + 1, concrete, 0, BH + 0.4, BZ, true, false);
    roof.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.06, BZ); floor.receiveShadow = true; scene.add(floor);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshBasicMaterial({ map: textSign('ATEŞLEME KONTROL MERKEZİ') }));
    sign.position.set(0, BH - 0.6, front - 0.35); sign.rotation.y = Math.PI; scene.add(sign);
    // kapı ışığı
    const doorLamp = new THREE.PointLight(0xffd8a0, 30, 16, 2); doorLamp.position.set(0, 3.6, front - 1.2); scene.add(doorLamp);
    // iç mekan: konsol ve ekranlar
    const desk = mkBox(10, 1.0, 1.4, darkMetal, 0, 0.5, BZ + 5.5, false, true);
    desk.material = darkMetal;
    for (let i = 0; i < 3; i++) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ map: screenTex(i), color: new THREE.Color(1.6, 1.6, 1.6) }));
      sc.position.set(-3 + i * 3, 1.9, BZ + 6.1); sc.rotation.y = Math.PI; scene.add(sc);
    }
    const bigScreen = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshBasicMaterial({ map: textSign('TUFAN · ÇARPICI GÖREVİ', 1024, 330, '#5fd8ff') }));
    bigScreen.position.set(0, 3.7, BZ + BD / 2 - 0.35); bigScreen.rotation.y = Math.PI; scene.add(bigScreen);
    const inLight = new THREE.PointLight(0x9fd0ff, 40, 22, 2); inLight.position.set(0, 4, BZ + 1); scene.add(inLight);
    for (const x of [-9, 9]) mkBox(1.2, 2.2, 0.8, darkMetal, x, 1.1, BZ + 6.5);

    // Yakıt tankları ve vana
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.35, metalness: 0.3 });
    for (const [x, z] of [[62, -30], [62, -46]]) {
      const tk = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 20), tankMat); tk.position.set(x, 8, z); tk.castShadow = true; scene.add(tk);
      this.occluders.push(tk);
      for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), darkMetal); leg.position.set(x + a, 3, z + b); leg.castShadow = true; scene.add(leg);
      }
      this.circles.push({ x, z, r: 4.8 });
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 64, 10), darkMetal);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(30, 0.4, -38); scene.add(pipe);
    mkBox(2, 1.4, 1.4, darkMetal, 50, 0.7, -32, false, true);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20), red);
    wheel.position.set(50, 1.6, -31.2); scene.add(wheel);
    this.valveWheel = wheel;

    // Veri terminali (kule dibinde)
    const tx = site.towerX + 6;
    mkBox(1.2, 1.6, 0.8, darkMetal, tx, 0.8, 9);
    const term = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: screenTex(0), color: new THREE.Color(1.8, 1.8, 1.8) }));
    term.position.set(tx, 1.4, 9.42); scene.add(term);

    // Projektör direkleri
    for (const [x, z] of [[-70, -60], [70, -60], [-70, 60], [70, 60]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 32, 8), darkMetal); mast.position.set(x, 16, z); mast.castShadow = true; scene.add(mast);
      this.circles.push({ x, z, r: 0.9 });
      const head = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.6) }));
      head.position.set(x, 32, z); head.lookAt(0, 30, 0); scene.add(head);
      const sl = new THREE.SpotLight(0xfff1d8, 4500, 260, 0.3, 0.6, 2);
      sl.position.set(x, 32, z); sl.target.position.set(0, R.H * 0.5, 0);
      scene.add(sl, sl.target);
    }
    // Paratoner direkleri
    for (const [x, z] of [[-45, 45], [45, 45], [0, -60]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, R.H * 1.4, 6), darkMetal); m.position.set(x, R.H * 0.7, z); scene.add(m);
      this.circles.push({ x, z, r: 0.6 });
    }

    // Buhar (yakıt dolumu sırasında sıvı oksijen tahliyesi)
    this.vapor = new Particles(1500, { texture: makeSmokeTexture(64, 11) });
    this.vapor.gravity.set(0, 0.3, 0);
    this.vapor.setScale(innerHeight);
    scene.add(this.vapor.points);

    // Karakter
    // Karakter: gerçekçi, animasyonlu insan modeli (Mixamo). Yüklenene kadar basit model yer tutar.
    this.char = new THREE.Group();
    this.placeholder = null;
    if (!CHAR_GLTF) { this.placeholder = buildCharacter(); this.char.add(this.placeholder); }
    scene.add(this.char);
    this.mixer = null; this.actions = null; this.curAction = null;
    this.loadCharacter();
    // Saha aracı
    this.car = buildCar();
    scene.add(this.car);
    this.carPos = new THREE.Vector3(25.2, 0, 62.5); // karakterin (22, 0, 62) hemen yanı
    this.carH = Math.PI; // pad'e (−z) bakar
    this.carV = 0; this.carSteer = 0; this.inCar = false; this.braking = false;
    this.mouseIdle = 0;
    this.pos = new THREE.Vector3(22, 0, 62);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.facing = Math.PI; // -z yönüne (pad'e) bak
    this.camYaw = 0.35; this.camPitch = 0.28; this.camDist = 6;
    this.camPos = new THREE.Vector3();
    this.firstCam = true;
    this.ray = new THREE.Raycaster();

    // Görevler
    this.tasks = [
      { id: 'valve', label: 'Yakıt vanasını aç', verb: 'Vanayı aç', pos: new THREE.Vector3(50, 0, -30), hold: 3, color: 0xffb547 },
      { id: 'data', label: 'Hedefleme verisini yükle', verb: 'GEZGİN verisini rokete yükle', pos: new THREE.Vector3(tx, 0, 10.6), hold: 3, color: 0x5fd8ff },
      { id: 'console', label: 'Konsoldan ateşle', verb: 'Ateşleme konsolunu aç', pos: new THREE.Vector3(0, 0, BZ + 4), hold: 0, color: 0xff5d5d },
    ];
    for (const t of this.tasks) {
      t.done = false; t.progress = 0;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 10, 1, true).translate(0, 11, 0), new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(t.color).multiplyScalar(2) }, opacity: { value: 0.45 } },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      beam.position.copy(t.pos);
      if (t.id === 'console') beam.scale.y = 0.2;
      scene.add(beam); t.beam = beam;
      const el = document.createElement('div');
      el.className = 'site-label';
      el.style.setProperty('--c', '#' + new THREE.Color(t.color).getHexString());
      el.innerHTML = `<b>${t.label}</b><span></span>`;
      $('baseLabels').appendChild(el);
      t.el = el; t.distEl = el.querySelector('span');
    }

    this.fuel = 0; this.fueling = false; this.dataLoaded = false;
    this.windT = Math.random() * 100; this.wind = 8;
    this.panelOpen = false; this.countdown = null; this.fired = false;
    this.t = 0; this.hudT = 0;
    this.padCam = { pos: new THREE.Vector3(10, 10, 100), look: new THREE.Vector3(0, R.H * 0.5, 0) };

    $('firePanel').onclick = (e) => {
      const b = e.target.closest('[data-fire]');
      if (!b) return;
      audio.click();
      if (b.dataset.fire === 'start' && this.allGo() && this.countdown === null) { this.countdown = 10; this.lastBeep = 11; toast('Geri sayım başladı.', 'info', 3); }
      if (b.dataset.fire === 'abort' && this.countdown !== null) { this.countdown = null; toast('Geri sayım durduruldu.', 'warn', 3); }
      if (b.dataset.fire === 'close') this.closePanel();
    };
    toast('<b>Fırlatma Kompleksi LC-39.</b> Uçuş direktörüsün: çarpıcıyı hazırla, sığınağa geç ve ateşle.', 'info', 8);
    toast('Kamera için ekrana tıkla. <kbd>WASD</kbd> yürü, <kbd>Shift</kbd> koş, <kbd>E</kbd> etkileşim. Yakındaki <b>saha aracına</b> <kbd>F</kbd> ile bin.', 'info', 9);
    this.renderPanel();
  }

  loadCharacter() {
    const setup = (gltf) => {
      if (this.disposed || !gltf) return;
      const model = gltf.scene;
      // Boyu 1,80 m'ye ölçekle
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      const h = box.max.y - box.min.y;
      if (h > 0.5 && (h < 1.5 || h > 2.2)) model.scale.multiplyScalar(1.8 / h);
      this.modelHeight = h;
      model.rotation.y = Math.PI; // model -z yönüne bakıyor; bizim ileri yönümüz +z
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) { o.material = o.material.clone(); o.material.envMapIntensity = 1; }
        }
      });
      if (this.placeholder) this.char.remove(this.placeholder);
      this.char.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = {};
      for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      for (const n of ['Idle', 'Walk', 'Run']) if (!this.actions[n]) this.actions[n] = this.actions.Idle || this.mixer.clipAction(gltf.animations[0]);
      this.curAction = null;
      this.play('Idle');
    };
    if (CHAR_GLTF) setup(CHAR_GLTF);
    else preloadCharacter().then(setup);
  }

  play(name) {
    const a = this.actions[name];
    if (!a || this.curAction === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    if (this.curAction) this.curAction.fadeOut(0.25);
    this.curAction = a;
  }

  inBunker() {
    const b = this.bunker, p = this.pos;
    return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
  }
  checks() {
    const beacon = this.res && this.res.flags && this.res.flags.beacon;
    return [
      { name: 'Yakıt ikmali', ok: this.fuel >= 100, info: this.fueling || this.fuel > 0 ? `%${Math.floor(this.fuel)}` : 'Vana kapalı' },
      { name: 'Hedefleme verisi', ok: this.dataLoaded, info: this.dataLoaded ? (beacon ? 'Hassas: işaretçi kilidi' : 'Tahmini: işaretçi yok') : 'Yüklenmedi' },
      { name: 'Pad bölgesi tahliye', ok: this.inBunker(), info: this.inBunker() ? 'Personel sığınakta' : 'Personel sahada' },
      { name: `Rüzgar (limit ${WIND_LIMIT} m/s)`, ok: this.wind < WIND_LIMIT, info: `${fmt(this.wind, 1)} m/s` },
      { name: 'Uçuş yazılımı', ok: this.dataLoaded, info: this.dataLoaded ? 'Hedef koordinatları girildi' : 'Veri bekleniyor' },
    ];
  }
  allGo() { return this.checks().every((c) => c.ok); }

  openPanel() {
    this.panelOpen = true;
    this.allowUnlock();
    if (document.pointerLockElement) document.exitPointerLock();
    $('firePanel').classList.add('show');
    this.renderPanel();
  }
  closePanel() {
    this.panelOpen = false;
    $('firePanel').classList.remove('show');
    this.countdown = null;
  }

  // Panel bir kez kurulur, sonra yalnızca metin ve sınıflar güncellenir
  // (her karede innerHTML yenilemek düğmeyi imlecin altından silip tıklamayı engelliyordu)
  buildPanel() {
    const fp = $('firePanel');
    fp.innerHTML = `
      <div class="fp-head">ATEŞLEME KONTROL · LC-39</div>
      <div class="fp-sub">Çarpıcı: ${fmt(this.cfg.impactorMass)} kg · Hedef: 2026 TK7 "Tufan"</div>
      <div class="fp-polls">${this.checks().map((c, i) => `<div class="fp-row"><span data-n="${i}"></span><em data-i="${i}"></em><b data-s="${i}"></b></div>`).join('')}</div>
      <div class="fp-count" id="fpCount"></div>
      <div class="fp-btns">
        <button class="btn primary" data-fire="start" id="fpStart">GERİ SAYIMI BAŞLAT</button>
        <button class="btn" data-fire="abort" id="fpAbort">DURDUR</button>
        <button class="btn ghost" data-fire="close">KONSOLU KAPAT (E)</button>
      </div>`;
    this.panelBuilt = true;
  }

  renderPanel() {
    if (!this.panelBuilt) this.buildPanel();
    const fp = $('firePanel');
    const cs = this.checks();
    const go = cs.every((c) => c.ok);
    const cd = this.countdown;
    const held = cd !== null && !go;
    cs.forEach((c, i) => {
      const n = fp.querySelector(`[data-n="${i}"]`), inf = fp.querySelector(`[data-i="${i}"]`), st = fp.querySelector(`[data-s="${i}"]`);
      if (n.textContent !== c.name) n.textContent = c.name;
      if (inf.textContent !== c.info) inf.textContent = c.info;
      const txt = c.ok ? 'GO' : 'NO-GO', cls = c.ok ? 'go' : 'nogo';
      if (st.textContent !== txt) st.textContent = txt;
      if (st.className !== cls) st.className = cls;
    });
    const count = $('fpCount');
    const ctext = cd === null ? (go ? 'HAZIR' : 'BEKLENİYOR') : held ? 'OTOMATİK BEKLEME' : 'T−' + Math.ceil(cd);
    if (count.textContent !== ctext) count.textContent = ctext;
    count.classList.toggle('hold', held);
    $('fpStart').classList.toggle('disabled', !(go && cd === null));
    $('fpAbort').classList.toggle('disabled', cd === null);
  }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.vapor.setScale(innerHeight); }

  collide(p = this.pos, r = 0.45) {
    let hit = false;
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
        else { // kutunun içinde: en yakın kenardan dışarı it
          const opts = [[b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; hit = true; }
    }
    return hit;
  }

  // Aracın kapladığı alanı iki daireyle temsil et (yayaya karşı)
  carCircles() {
    const h = this.carH, p = this.carPos;
    return [-1.2, 1.2].map((o) => ({ x: p.x + Math.sin(h) * o, z: p.z + Math.cos(h) * o, r: 1.15 }));
  }

  // Karakter aracın tavanının üstünde mi (yatay olarak)?
  overCar() {
    const h = this.carH, dx = this.pos.x - this.carPos.x, dz = this.pos.z - this.carPos.z;
    const lz = dx * Math.sin(h) + dz * Math.cos(h), lx = dx * Math.cos(h) - dz * Math.sin(h);
    return Math.abs(lx) < 1.25 && Math.abs(lz) < 2.55;
  }

  driveCar(dt, inp) {
    const throttle = inp.fwd - inp.back;
    let v = this.carV;
    const max = inp.boost ? 28 : 18;
    this.braking = false;
    if (throttle > 0) { if (v < -0.5) { v += 16 * dt; this.braking = true; } else v += (inp.boost ? 11 : 7) * dt; }
    else if (throttle < 0) { if (v > 0.5) { v -= 16 * dt; this.braking = true; } else v -= 5 * dt; }
    else v *= Math.exp(-0.9 * dt);
    v = THREE.MathUtils.clamp(v, -6, max);
    const steerT = inp.left - inp.right;
    this.carSteer += (steerT - this.carSteer) * (1 - Math.exp(-6 * dt));
    const av = Math.abs(v);
    const yawRate = this.carSteer * 1.35 * Math.min(1, av / 5) * Math.sign(v) * (1 - 0.45 * Math.min(1, av / 28));
    this.carH += yawRate * dt;
    this.carPos.x += Math.sin(this.carH) * v * dt;
    this.carPos.z += Math.cos(this.carH) * v * dt;
    if (this.collide(this.carPos, 1.55)) {
      if (av > 6) { audio.thump(Math.min(0.5, av * 0.03)); }
      v *= 0.35;
    }
    this.carV = v;
    this.pos.set(this.carPos.x, 0, this.carPos.z);
    audio.engine(av / 3, Math.abs(throttle));
  }

  updateCarVisual(dt) {
    const car = this.car, u = car.userData;
    car.position.copy(this.carPos); car.rotation.y = this.carH;
    for (const w of u.wheels) {
      w.spin.rotation.x += (this.carV * dt) / 0.42;
      w.holder.rotation.y = w.front ? this.carSteer * 0.45 : 0;
    }
    u.tailMat.emissiveIntensity = this.inCar && (this.braking || this.carV < -0.3) ? 4 : 0.6;
    u.barMat.emissiveIntensity = this.inCar && Math.sin(this.t * 9) > 0 ? 6 : 0;
  }

  toggleCar() {
    if (this.inCar) {
      if (Math.abs(this.carV) > 3) { toast('Araçtan inmek için önce yavaşla.', 'warn', 2.5); return; }
      // sürücü tarafından in
      const h = this.carH;
      this.pos.set(this.carPos.x + Math.cos(h) * 1.9, 0, this.carPos.z - Math.sin(h) * 1.9);
      this.collide();
      this.inCar = false; this.carV = 0;
      this.char.visible = true;
      this.facing = h + Math.PI / 2;
      this.camDist = this.walkDist || 6;
      audio.engineOff();
    } else {
      this.inCar = true;
      this.char.visible = false;
      this.walkDist = this.camDist;
      this.camDist = Math.max(this.camDist, 10);
      this.camYaw = this.carH + Math.PI;
      this.camPitch = 0.22;
      this.vel.set(0, 0, 0);
      audio.click();
    }
  }

  update(dt) {
    this.t += dt;
    const site = this.site;
    // Rüzgar
    this.windT += dt;
    this.wind = Math.max(1, 9 + 4.2 * Math.sin(this.windT * 0.19) + 2.6 * Math.sin(this.windT * 0.53 + 1.3));
    // Yakıt
    if (this.fueling && this.fuel < 100) this.fuel = Math.min(100, this.fuel + dt * 4.5);
    const venting = this.fueling ? (this.fuel < 100 ? 1 : 0.5) : 0;
    if (venting && Math.random() < venting * 0.9) {
      const R = site.R;
      const h = 6 + Math.random() * R.H * 0.7;
      const a = Math.random() * Math.PI * 2;
      this.vapor.emit(Math.cos(a) * R.R * 1.05, h, Math.sin(a) * R.R * 1.05, Math.cos(a) * 1.5, -0.4, Math.sin(a) * 1.5 + 0.8, 4, 1.5, 7, 0.95, 0.96, 1, 0.35, 0.5);
    }
    this.vapor.update(dt);
    site.beaconLight.visible = Math.sin(this.t * 5) > 0;

    // Etkileşim / hareket
    const inp = input.axis();
    if (this.panelOpen) {
      if (input.hit('KeyE') || input.hit('Escape')) this.closePanel();
      Object.assign(inp, { fwd: 0, back: 0, left: 0, right: 0, jump: false, boost: false, interact: false });
    }
    if (!this.panelOpen && input.hit('KeyF')) {
      if (this.inCar || this.pos.distanceTo(this.carPos) < 3.8) this.toggleCar();
    }
    if (Math.abs(input.mdx) + Math.abs(input.mdy) > 0) this.mouseIdle = 0; else this.mouseIdle += dt;
    if (!this.panelOpen) {
      this.camYaw -= input.mdx * 0.003;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.mdy * 0.0025, -0.25, 1.2);
      if (input.wheel) this.camDist = THREE.MathUtils.clamp(this.camDist * (input.wheel > 0 ? 1.12 : 0.89), 2.5, 22);
    }
    if (this.inCar) {
      this.driveCar(dt, inp);
      // kamera fare kullanılmıyorsa aracın arkasına yerleşsin
      if (this.mouseIdle > 1.2 && Math.abs(this.carV) > 2) {
        let d = (this.carH + Math.PI) - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.camYaw += d * (1 - Math.exp(-2.5 * dt));
      }
    }
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    const fwd = new THREE.Vector3(-sy, 0, -cy), right = new THREE.Vector3(cy, 0, -sy);
    const wish = new THREE.Vector3().addScaledVector(fwd, inp.fwd - inp.back).addScaledVector(right, inp.right - inp.left);
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();
    const speed = inp.boost ? 6.5 : 2.2;
    if (!this.inCar) {
      this.vel.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-10 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      // zemin yüksekliği: aracın tavanının üstündeyse 2,0 m
      const onCarFoot = this.overCar();
      const ground = onCarFoot && this.pos.y >= 1.5 ? 2.0 : 0;
      if (inp.jump && this.pos.y <= ground + 0.001) this.vy = 9.2; // ≈2,8 m sıçrama
      this.vy -= 15 * dt;
      this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
      if (this.pos.y === ground) this.vy = Math.max(0, this.vy);
      this.collide();
      if (this.pos.y < 1.5) for (const c of this.carCircles()) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.45;
        if (d < m && d > 1e-4) { this.pos.x = c.x + (dx / d) * m; this.pos.z = c.z + (dz / d) * m; }
      }
    }
    this.updateCarVisual(dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    const c = this.char;
    c.position.copy(this.pos); c.rotation.y = this.facing;
    if (this.mixer) {
      const busy = this.near && this.near.id !== 'console' && inp.interact;
      const want = sp < 0.25 ? 'Idle' : sp < 4 ? 'Walk' : 'Run';
      this.play(busy && sp < 0.25 ? 'Idle' : want);
      if (want === 'Walk') this.actions.Walk.timeScale = THREE.MathUtils.clamp(sp / 1.6, 0.6, 1.6);
      if (want === 'Run') this.actions.Run.timeScale = THREE.MathUtils.clamp(sp / 5.6, 0.8, 1.3);
      this.mixer.update(dt);
    } else {
      const u = this.placeholder.userData;
      u.phase += dt * sp * 1.9;
      const k = Math.min(1, sp / 4);
      u.legL.rotation.x = Math.sin(u.phase) * 0.75 * k; u.legR.rotation.x = -Math.sin(u.phase) * 0.75 * k;
      u.armL.rotation.x = -Math.sin(u.phase) * 0.6 * k; u.armR.rotation.x = Math.sin(u.phase) * 0.6 * k;
    }

    // Görevler
    let near = null;
    if (!this.inCar) for (const t of this.tasks) {
      if (t.done && t.id !== 'console') continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d < 2.6 && (!near || d < near.d)) near = { t, d };
    }
    this.near = near && near.t;
    if (this.near && !this.panelOpen) {
      const t = this.near;
      if (t.id === 'console') {
        if (input.hit('KeyE')) { audio.click(); this.openPanel(); }
      } else if (inp.interact) {
        t.progress += dt / t.hold;
        if (Math.random() < 0.15) audio.scanTick();
        if (t.id === 'valve') this.valveWheel.rotation.z += dt * 4;
        if (t.progress >= 1) this.completeTask(t);
      }
    }
    for (const t of this.tasks) t.beam.material.uniforms.opacity.value = t.done ? 0.1 : 0.35 + 0.15 * Math.sin(this.t * 3);

    // Geri sayım
    if (this.countdown !== null) {
      if (this.allGo()) {
        this.countdown -= dt;
        const s = Math.ceil(this.countdown);
        if (s < this.lastBeep && s >= 0) { this.lastBeep = s; audio.tone(s <= 3 ? 1200 : 880, 0.12, 'square', 0.06); }
        if (this.countdown <= 0 && !this.fired) { this.fired = true; this.closePanel(); this.onFire(); }
      }
    }

    // Kamera
    const cam = this.camera;
    if (this.panelOpen) {
      cam.position.lerp(this.padCam.pos, 1 - Math.exp(-4 * dt));
      cam.lookAt(this.padCam.look);
    } else {
      const target = this.inCar ? new THREE.Vector3(this.carPos.x, 1.8, this.carPos.z) : new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
      const cp = Math.cos(this.camPitch);
      const dir = new THREE.Vector3(sy * cp, Math.sin(this.camPitch), cy * cp);
      let dist = this.camDist;
      this.ray.set(target, dir); this.ray.far = dist;
      const hits = this.ray.intersectObjects(this.occluders, true);
      if (hits.length) dist = Math.max(0.6, hits[0].distance - 0.3);
      const want = target.clone().addScaledVector(dir, dist);
      want.y = Math.max(0.3, want.y);
      if (this.firstCam) { this.camPos.copy(want); this.firstCam = false; } else this.camPos.lerp(want, 1 - Math.exp(-14 * dt));
      cam.position.copy(this.camPos);
      cam.lookAt(target);
    }
    // Gölge kamerası karakteri takip etsin
    site.sun.target.position.set(this.pos.x, 0, this.pos.z);
    site.sun.position.copy(site.sun.target.position).add(this.sunOffset);

    this.updateLabels();
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.12; this.updateHUD(); if (this.panelOpen) this.renderPanel(); }
  }

  completeTask(t) {
    t.done = true; t.progress = 1;
    audio.chime();
    if (t.id === 'valve') { this.fueling = true; toast('<b>Yakıt vanası açıldı.</b> Sıvı oksijen ve yakıt dolumu başladı.', 'ok', 5); }
    if (t.id === 'data') {
      this.dataLoaded = true;
      const beacon = this.res && this.res.flags && this.res.flags.beacon;
      toast(beacon ? '<b>Hedefleme verisi yüklendi.</b> Çarpıcı, GEZGİN\'in kurduğu işaretçiye kilitlenecek.' : '<b>Hedefleme verisi yüklendi.</b> İşaretçi yok: çarpıcı kütle merkezini tahmini koordinatla arayacak.', 'ok', 6);
    }
  }

  updateLabels() {
    const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
    for (const t of this.tasks) {
      const el = t.el;
      if ((t.done && t.id !== 'console') || this.panelOpen) { el.style.display = 'none'; continue; }
      v.copy(t.pos).add(new THREE.Vector3(0, 2.6, 0)).project(this.camera);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      t.distEl.textContent = fmt(Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z)) + ' m';
    }
  }

  updateHUD() {
    const tasks = [
      { label: 'Yakıt vanasını aç', done: this.tasks[0].done, extra: this.fueling ? `%${Math.floor(this.fuel)}` : '' },
      { label: 'Hedefleme verisini yükle', done: this.dataLoaded, extra: '' },
      { label: 'Sığınağa gir, konsoldan ateşle', done: this.fired, extra: '' },
    ];
    $('baseTasks').innerHTML = tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><i></i>${t.label}<em>${t.extra}</em></li>`).join('');
    const wEl = $('windTxt');
    wEl.textContent = `${fmt(this.wind, 1)} m/s`;
    wEl.className = this.wind >= WIND_LIMIT ? 'bad' : this.wind > WIND_LIMIT - 2 ? 'warn' : '';
    $('baseInfo').innerHTML = `Yakıt: <b>%${Math.floor(this.fuel)}</b> · Konum: <b>${this.inCar ? 'Saha aracında' : this.inBunker() ? 'Sığınak' : 'Saha'}</b>`;
    const pr = $('basePrompt');
    const nearCar = !this.inCar && this.pos.distanceTo(this.carPos) < 3.8;
    if (this.inCar && !this.panelOpen) {
      pr.classList.add('show');
      $('basePromptTxt').innerHTML = `<kbd>F</kbd> araçtan in · <b>${fmt(Math.abs(this.carV) * 3.6)} km/sa</b>`;
      $('basePromptFill').style.width = '0%';
    } else if (nearCar && !this.near && !this.panelOpen) {
      pr.classList.add('show');
      $('basePromptTxt').innerHTML = '<kbd>F</kbd> saha aracına bin';
      $('basePromptFill').style.width = '0%';
    } else if (this.near && !this.panelOpen) {
      pr.classList.add('show');
      $('basePromptTxt').innerHTML = this.near.id === 'console' ? '<kbd>E</kbd> Ateşleme konsolunu aç' : `<kbd>E</kbd> basılı tut: ${this.near.verb}`;
      $('basePromptFill').style.width = (this.near.id === 'console' ? 0 : this.near.progress * 100) + '%';
    } else pr.classList.remove('show');
    $('baseControls').classList.toggle('show', this.t < 30);
  }

  dispose() {
    this.disposed = true;
    audio.engineOff();
    if (this.mixer) this.mixer.stopAllAction();
    $('baseLabels').innerHTML = '';
    $('firePanel').classList.remove('show');
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
