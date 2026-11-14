import { T as __T, dec } from './i18n.js';
// Fırlatma sinematiği: seçilen roket sınıfına göre model, alev, duman, kademe ayrılması.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { makeGlowTexture, makeSmokeTexture, makeGroundTexture, makeConcreteTexture } from './textures.js';
import { mats } from './models.js';
import { caption } from './ui.js';
import { audio } from './audio.js';

const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FLAME_FS = `uniform float time; uniform vec3 c1; uniform vec3 c2; uniform float power; varying vec2 vUv;
void main(){ float y = vUv.y; float f = 0.82 + 0.18*sin(time*57.0 + y*31.0) * sin(time*23.0 + vUv.x*40.0);
  float a = pow(1.0 - y, 1.3) * power * f; vec3 col = mix(c1, c2, smoothstep(0.0, 0.7, y)); gl_FragColor = vec4(col*a, a); }`;

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform float alt; uniform vec3 sunDir; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  vec3 zen = vec3(0.04, 0.10, 0.32), hor = vec3(1.0, 0.52, 0.28), mid = vec3(0.35, 0.36, 0.55);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h)); col = mix(col, zen, smoothstep(0.12, 0.7, h));
  float s = max(dot(d, sunDir), 0.0); col += vec3(1.0, 0.6, 0.3) * (pow(s, 16.0)*0.35 + pow(s, 600.0)*4.0);
  if (d.y < 0.0) col = mix(hor*0.5, vec3(0.12,0.09,0.07), smoothstep(0.0, 0.1, -d.y));
  float k = 1.0 - alt; col *= k*k*k;
  gl_FragColor = vec4(col, 1.0); }`;

function flameMesh(r, h, c1, c2) {
  const g = new THREE.ConeGeometry(r, h, 24, 1, true);
  g.rotateX(Math.PI); g.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, c1: { value: c1 }, c2: { value: c2 }, power: { value: 0 } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, mat);
}

function buildRocket(kind) {
  const m = mats();
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.45, metalness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xc8662a, roughness: 0.7, metalness: 0.05 });
  const S = {
    light: { R: 1.3, H1: 18, H2: 7, HF: 6 }, medium: { R: 1.85, H1: 34, H2: 10, HF: 9 },
    heavy: { R: 1.85, H1: 34, H2: 10, HF: 9 }, super: { R: 4.2, H1: 50, H2: 12, HF: 13 },
  }[kind];
  const { R, H1, H2, HF } = S;
  const mk = (geo, mat, x, y, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  const rocket = new THREE.Group();
  const stage1 = new THREE.Group(); rocket.add(stage1);
  const flames1 = [];
  const cores = [];
  if (kind === 'heavy') cores.push({ x: -(2 * R + 0.3), r: R, h: H1, mat: white, nose: true }, { x: 2 * R + 0.3, r: R, h: H1, mat: white, nose: true });
  if (kind === 'super') cores.push({ x: -(R + 2.1), r: 1.9, h: H1 * 0.92, mat: white, nose: true }, { x: R + 2.1, r: 1.9, h: H1 * 0.92, mat: white, nose: true });
  cores.push({ x: 0, r: R, h: H1, mat: kind === 'super' ? orange : white, nose: false });
  for (const c of cores) {
    stage1.add(mk(new THREE.CylinderGeometry(c.r, c.r, c.h, 32), c.mat, c.x, c.h / 2));
    if (kind !== 'super' || c.x === 0) stage1.add(mk(new THREE.CylinderGeometry(c.r * 1.01, c.r * 1.01, 1.2, 32), black, c.x, c.h * 0.08));
    if (c.nose) stage1.add(mk(new THREE.ConeGeometry(c.r, c.r * 2.4, 32), c.mat, c.x, c.h + c.r * 1.2));
    stage1.add(mk(new THREE.CylinderGeometry(c.r * 0.45, c.r * 0.75, 2, 24, 1, true), black, c.x, -0.8));
    const f = flameMesh(c.r * 0.9, c.r * 13, new THREE.Color(2.6, 2.0, 1.3), new THREE.Color(1.6, 0.45, 0.1));
    f.position.set(c.x, -1.8, 0); stage1.add(f); flames1.push(f);
    const core = flameMesh(c.r * 0.42, c.r * 4.5, new THREE.Color(3.4, 3.2, 2.8), new THREE.Color(2.2, 1.3, 0.5));
    core.position.set(c.x, -1.8, 0); stage1.add(core); flames1.push(core);
  }
  if (kind !== 'super') stage1.add(mk(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 2.2, 32), black, 0, H1 + 1.1));
  else stage1.add(mk(new THREE.CylinderGeometry(R * 0.8, R, 2.2, 32), white, 0, H1 + 1.1));
  // fin/ızgara
  if (kind === 'medium' || kind === 'heavy') {
    for (let i = 0; i < 4; i++) {
      const fin = mk(new THREE.BoxGeometry(0.15, 1.2, 1.4), black, 0, H1 - 1.5);
      fin.position.x = Math.cos(i * Math.PI / 2) * (R + 0.5); fin.position.z = Math.sin(i * Math.PI / 2) * (R + 0.5);
      fin.rotation.y = -i * Math.PI / 2; stage1.add(fin);
    }
  }
  const stage2 = new THREE.Group();
  stage2.position.y = H1 + 2.2;
  rocket.add(stage2);
  const R2 = kind === 'super' ? R * 0.8 : R;
  stage2.add(mk(new THREE.CylinderGeometry(R2, R2, H2, 32), white, 0, H2 / 2));
  stage2.add(mk(new THREE.CylinderGeometry(R2 * 0.3, R2 * 0.7, 1.8, 24, 1, true), black, 0, -0.6));
  const flame2 = flameMesh(R2 * 1.05, R2 * 14, new THREE.Color(1.5, 1.7, 2.4), new THREE.Color(0.25, 0.25, 0.7));
  flame2.position.y = -1.4; stage2.add(flame2);
  // burun konisi
  const Rf = R2 * 1.05;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const y = (i / 20) * HF;
    const r = y < HF * 0.3 ? Rf : Rf * Math.sqrt(Math.max(0, 1 - ((y - HF * 0.3) / (HF * 0.7)) ** 2));
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  const fairing = [];
  for (const ph of [0, Math.PI]) {
    const g = new THREE.LatheGeometry(pts, 24, ph, Math.PI);
    const half = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }));
    half.position.y = H2; half.castShadow = true;
    stage2.add(half); fairing.push(half);
  }
  const payload = mk(new THREE.BoxGeometry(R2 * 1.1, HF * 0.4, R2 * 1.1), m.gold, 0, H2 + HF * 0.25);
  stage2.add(payload);
  const H = H1 + 2.2 + H2 + HF;
  return { rocket, stage1, stage2, flames1, flame2, fairing, payload, H, R, cores };
}


// Fırlatma alanı: gökyüzü, zemin, pad, kaide, roket ve servis kulesi (fırlatma ve üs sahneleri ortak kullanır)
export function buildLaunchSite(scene, launcher) {
  const site = {};
    site.skyMat = new THREE.ShaderMaterial({
      uniforms: { alt: { value: 0 }, sunDir: { value: new THREE.Vector3(0.55, 0.14, 0.82).normalize() } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), site.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
    // yıldızlar
    const N = 3000, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 0.95 + 0.05, t = Math.random() * 6.283, s = Math.sqrt(1 - u * u);
      sp[i * 3] = s * Math.cos(t) * 7000; sp[i * 3 + 1] = u * 7000; sp[i * 3 + 2] = s * Math.sin(t) * 7000;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    site.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(sg, site.starMat); stars.frustumCulled = false; scene.add(stars);

    const sun = new THREE.DirectionalLight(0xffc49a, 2.6);
    sun.position.set(330, 85, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 1200 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x8aa0d0, 0x5a4030, 0.7));

    const gt = makeGroundTexture(); gt.repeat.set(80, 80);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const ct = makeConcreteTexture(); ct.repeat.set(6, 6);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(55, 64), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.05; pad.receiveShadow = true; scene.add(pad);
    const trench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 40), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }));
    trench.position.set(0, 0.1, 18); scene.add(trench);

    const R = buildRocket(launcher.visual);
    site.R = R;
    site.scale = R.H / 55;
    const base = 6;
    // kaide
    const mount = new THREE.Mesh(new THREE.BoxGeometry(R.R * 6 + (launcher.visual === 'heavy' ? 10 : launcher.visual === 'super' ? 10 : 0), base, R.R * 5), new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.6, metalness: 0.5 }));
    mount.position.y = base / 2 - 0.5; mount.castShadow = true; mount.receiveShadow = true; scene.add(mount);
    R.rocket.position.y = base;
    scene.add(R.rocket);
    // kule
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x9a3d2a, roughness: 0.6, metalness: 0.6 });
    const tower = new THREE.Group();
    const TH = R.H + 12, tx = -(R.R * 3 + 10);
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, TH, 0.5), towerMat); c.position.set(x, TH / 2, z); c.castShadow = true; tower.add(c);
    }
    for (let y = 4; y < TH; y += 4) {
      for (const [w, d, x, z] of [[4.5, 0.3, 0, -2], [4.5, 0.3, 0, 2], [0.3, 4.5, -2, 0], [0.3, 4.5, 2, 0]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), towerMat); b.position.set(x, y, z); tower.add(b);
      }
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(tx) - R.R, 1.2, 2), towerMat);
    arm.position.set((Math.abs(tx) - R.R) / 2, R.H * 0.8, 0); tower.add(arm);
    site.beaconLight = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.5, 0.3) }));
    site.beaconLight.position.set(0, TH + 0.6, 0); tower.add(site.beaconLight);
    tower.position.x = tx;
    scene.add(tower);
  site.tower = tower; site.towerX = tx; site.mount = mount; site.sun = sun; site.TH = TH;
  return site;
}

export class LaunchSequence {
  constructor(renderer, launcher, onDone, opts = {}) {
    this.onDone = onDone;
    this.opts = opts;
    this.launcher = launcher;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 20000);
    scene.fog = new THREE.Fog(0x7a5a4a, 300, 5000);

    const site = buildLaunchSite(scene, launcher);
    Object.assign(this, { skyMat: site.skyMat, starMat: site.starMat, R: site.R, scale: site.scale, beaconLight: site.beaconLight });
    const R = site.R;
    const base = 6;

    this.light = new THREE.PointLight(0xff9a50, 0, 0, 2);
    scene.add(this.light);

    this.smoke = new Particles(5000, { texture: makeSmokeTexture() });
    this.fire = new Particles(1500, { texture: makeGlowTexture(64, 1.6), additive: true });
    this.smoke.gravity.set(0, 0.6, 0);
    this.fire.gravity.set(0, -10, 0);
    this.smoke.setScale(innerHeight); this.fire.setScale(innerHeight);
    scene.add(this.smoke.points, this.fire.points);

    this.t = this.opts.startT || 0;
    this.pos = new THREE.Vector3(0, base, 0);
    this.vel = new THREE.Vector3();
    this.dist = 0;
    this.staged = false; this.fairingOff = false;
    this.done = false;
    this.shake = 0;
    this.tmp = new THREE.Vector3();
  }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.smoke.setScale(innerHeight); this.fire.setScale(innerHeight); }

  update(dt) {
    this.t += dt;
    const t = this.t, R = this.R, S = this.scale;
    const ign = 3.0, lift = 3.6;
    const tau = Math.max(0, t - lift);
    // Geri sayım yazıları
    const imp = this.opts.payload === 'impactor';
    if (t < ign) caption(`T−${3 - Math.floor(t)}`, `${this.launcher.name} · ${this.launcher.ref}`);
    else if (t < lift + 1.2) caption(t < lift ? __T('ATEŞLEME') : __T('KALKIŞ!'), `${this.launcher.name} · ${this.launcher.ref}`);
    else if (tau > 4.5 && tau < 7) caption(__T('MAKS-Q'), __T('En yüksek aerodinamik basınç: motorlar kısılıyor'));
    else if (tau > 8.5 && tau < 10.2) caption(__T('KADEME AYRILMASI'), __T('1. kademe görevini tamamladı'));
    else if (tau > 10.2 && tau < 12.5) caption(__T('BURUN KONİSİ AYRILDI'), imp ? __T('Kinetik çarpıcı uzay boşluğunda') : __T('Görev aracı uzay boşluğunda'));
    else if (tau >= 12.5) caption(imp ? __T('ÇARPICI YOLDA') : __T('DÜNYA KAÇIŞ YÖRÜNGESİ'), imp ? __T('GEZGİN\'in hedefleme verisiyle asteroide doğru') : __T`Asteroide transfer: ${dec(this.launcher.transfer)} yıl`);
    else caption('', '');

    // Motor gücü
    const p1 = t < ign ? 0 : this.staged ? 0 : Math.min(1, (t - ign) / 0.5) * (tau > 4.5 && tau < 7 ? 0.8 : 1);
    const p2 = tau > 9.2 ? Math.min(1, (tau - 9.2) / 0.4) : 0;
    for (const f of R.flames1) { f.material.uniforms.power.value = p1; f.material.uniforms.time.value = t; f.scale.set(1, 0.9 + Math.random() * 0.2 + tau * 0.03, 1); }
    R.flame2.material.uniforms.power.value = p2; R.flame2.material.uniforms.time.value = t;
    R.flame2.scale.set(1, 0.9 + Math.random() * 0.15, 1);
    audio.rumble(Math.max(p1 * Math.max(0.15, 1 - tau / 14), p2 * 0.1));

    // Hareket (yerçekimi dönüşü)
    if (t > lift) {
      const s = 2 * tau * tau + 0.35 * tau * tau * tau;
      const ds = s - this.dist; this.dist = s;
      const th = 0.65 * THREE.MathUtils.smoothstep(tau, 3, 12);
      const dir = this.tmp.set(Math.sin(th), Math.cos(th), 0);
      this.vel.copy(dir).multiplyScalar(ds / Math.max(dt, 1e-4));
      this.pos.addScaledVector(dir, ds);
      R.rocket.position.copy(this.pos);
      R.rocket.rotation.z = -th;
    }
    // Kademe ayrılması
    if (!this.staged && tau > 8.5) {
      this.staged = true;
      this.scene.attach(R.stage1);
      this.s1vel = this.vel.clone().multiplyScalar(0.92);
      this.s1spin = 0.3;
      audio.thump(0.4);
    }
    if (this.staged) {
      this.s1vel.y -= 9 * dt;
      R.stage1.position.addScaledVector(this.s1vel, dt);
      R.stage1.rotation.z += this.s1spin * dt;
    }
    if (!this.fairingOff && tau > 10.2) {
      this.fairingOff = true;
      R.fairing.forEach((f, i) => { this.scene.attach(f); f.userData.v = this.vel.clone().multiplyScalar(0.97).add(new THREE.Vector3(0, 0, i ? 6 : -6)); f.userData.s = i ? 0.8 : -0.8; });
    }
    if (this.fairingOff) R.fairing.forEach((f) => { f.position.addScaledVector(f.userData.v, dt); f.rotation.x += f.userData.s * dt; });

    // Parçacıklar
    const alt = this.pos.y;
    const nozzleY = this.pos.y - 2;
    if (p1 > 0) {
      for (const c of R.cores) {
        const cosT = Math.cos(-R.rocket.rotation.z), sinT = Math.sin(-R.rocket.rotation.z);
        const nx = this.pos.x + c.x * cosT - 2.5 * sinT, ny = this.pos.y + c.x * -sinT + (-2.5) * cosT;
        const k = R.cores.length > 1 ? 0.6 : 1;
        // Alev kıvılcımları
        for (let i = 0; i < 6 * k; i++) {
          this.fire.emit(nx + (Math.random() - 0.5) * c.r, ny, (Math.random() - 0.5) * c.r,
            (Math.random() - 0.5) * 8 - Math.sin(-R.rocket.rotation.z) * 40, -30 - Math.random() * 40, (Math.random() - 0.5) * 8,
            0.3 + Math.random() * 0.3, c.r * 2.2, c.r * 0.6, 3, 1.6, 0.6, 1, 0.5, 2, 0.4, 0.1);
        }
        if (alt < 70) {
          // Yerde yayılan duman bulutları
          for (let i = 0; i < 3 * k; i++) {
            const a = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 18;
            const lit = Math.max(0, 1 - alt / 40);
            this.smoke.emit(c.x + Math.cos(a) * 4, 2 + Math.random() * 3, Math.sin(a) * 4 + 6,
              Math.cos(a) * sp, 1 + Math.random() * 5, Math.sin(a) * sp + 6,
              5 + Math.random() * 4, 6 * S, 26 * S, 0.75 + lit * 0.5, 0.62 + lit * 0.2, 0.55, 0.55, 0.6, 0.5, 0.49, 0.48, 0.25);
          }
        }
        // Yükselen iz
        if (t > lift) {
          for (let i = 0; i < 3 * k; i++) {
            this.smoke.emit(nx + (Math.random() - 0.5) * 2, ny - Math.random() * 6, (Math.random() - 0.5) * 2,
              this.vel.x * 0.15 + (Math.random() - 0.5) * 4, this.vel.y * 0.1 + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
              6 + Math.random() * 3, 4 * S, 20 * S, 0.95, 0.72, 0.55, 0.4 * Math.max(0.15, 1 - alt / 1200), 0.3, 0.7, 0.7, 0.72, 0.1);
          }
        }
      }
    } else if (t < ign) {
      // Ateşleme öncesi buhar
      if (Math.random() < 0.6) this.smoke.emit(R.cores[0].x + 2, 8 + Math.random() * 10, 2, 3 + Math.random() * 3, 1, 2, 3, 2, 10, 0.95, 0.95, 0.98, 0.4, 0.5);
    }
    if (p2 > 0) {
      for (let i = 0; i < 2; i++) {
        this.fire.emit(this.pos.x + Math.sin(-R.rocket.rotation.z) * (R.stage2.position.y - 2), this.pos.y + Math.cos(R.rocket.rotation.z) * (R.stage2.position.y - 2), 0,
          (Math.random() - 0.5) * 10, -20, (Math.random() - 0.5) * 10, 0.4, 3, 1, 1.5, 1.8, 3, 0.6, 0.2, 0.4, 0.4, 1.2, 0);
      }
    }
    this.smoke.update(dt, (pp, vv, i3) => { if (pp[i3 + 1] < 1) { pp[i3 + 1] = 1; vv[i3 + 1] = Math.abs(vv[i3 + 1]) * 0.3; } });
    this.fire.update(dt);

    // Işık
    this.light.position.set(this.pos.x, nozzleY - 6, 0);
    this.light.intensity = (p1 * 14000 + p2 * 800) * (0.85 + Math.random() * 0.3);
    this.beaconLight.visible = Math.sin(t * 5) > 0;

    // Gökyüzü
    const a = THREE.MathUtils.clamp((alt - 40) / 1100, 0, 1);
    this.skyMat.uniforms.alt.value = a;
    this.starMat.opacity = a;
    this.scene.fog.far = 5000 + a * 20000;

    // Kamera planları
    const cam = this.camera;
    this.shake = p1 * Math.max(0, 1 - tau / 9) * 0.35;
    if (t < lift + 1.2) {
      cam.position.set(75 * S, 5 * S, 120 * S);
      cam.lookAt(0, R.H * 0.45 + 6, 0);
    } else if (tau < 6) {
      cam.position.set(38 * S, 2.5 * S, 60 * S);
      cam.lookAt(this.pos.x, this.pos.y + R.H * 0.6, 0);
      cam.fov = THREE.MathUtils.lerp(50, 30, tau / 6); cam.updateProjectionMatrix();
    } else {
      const th = -R.rocket.rotation.z;
      const off = new THREE.Vector3(-22, -34, 46).multiplyScalar(S);
      off.applyAxisAngle(new THREE.Vector3(0, 0, 1), -th);
      cam.position.copy(this.pos).add(off);
      cam.fov = 45; cam.updateProjectionMatrix();
      cam.lookAt(this.pos.x + Math.sin(th) * R.H * 0.6, this.pos.y + Math.cos(th) * R.H * 0.6, 0);
    }
    if (this.shake > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake * S * 2));

    if (tau > 13.5 && !this.done) { this.done = true; audio.rumble(0); this.onDone(); }
  }

  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
