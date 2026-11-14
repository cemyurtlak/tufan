// EVA: asteroit yüzeyinde yürüyen astronot (gerçekçi iskelet animasyonlu model + uzay giysisi)
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { GAME } from './data.js';

const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const SCALE = 0.75; // 1 m = 0.75 oyun birimi (asteroit ölçeği: 1 birim = 1,33 m)

export class Astronaut {
  constructor(scene, ast, gltf) {
    this.ast = ast;
    this.group = new THREE.Group();
    scene.add(this.group);
    const model = skeletonClone(gltf.scene);
    model.rotation.y = Math.PI;
    model.scale.setScalar(SCALE);
    // Uzay giysisi malzemeleri
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material.clone();
      if (/visor/i.test(o.name) || /visor/i.test(m.name || '')) {
        m.map = null; m.color.set(0xd9a441); m.metalness = 1; m.roughness = 0.18;
      } else {
        m.map = null; m.color.set(0xe9e8e3); m.roughness = 0.82; m.metalness = 0.05;
      }
      o.material = m;
    });
    this.group.add(model);
    this.model = model;
    model.updateMatrixWorld(true);
    // Kask ve sırt çantası kemiklere bağlanır
    const attach = (boneName, build) => {
      let bone = null;
      model.traverse((o) => { if (o.isBone && o.name.endsWith(boneName)) bone = bone || o; });
      if (!bone) return;
      const ws = new THREE.Vector3(); bone.getWorldScale(ws);
      // Karakterin gerçek ileri (+z) ve yukarı (+y) yönlerini kemiğin yerel eksenlerine çevir
      const inv = new THREE.Quaternion(); bone.getWorldQuaternion(inv); inv.invert();
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize();
      const u = new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize();
      f.addScaledVector(u, -f.dot(u)).normalize();
      const x = new THREE.Vector3().crossVectors(u, f);
      const pivot = new THREE.Group();
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, u, f));
      pivot.scale.setScalar(SCALE / ws.x);
      bone.add(pivot);
      build(pivot);
    };
    attach('Head', (p) => {
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2 }));
      glass.position.set(0, 0.11, 0.02);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 18, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.22, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0xe0a840, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }));
      visor.position.copy(glass.position);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.8, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.05, 0.0);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.4) }));
      lamp.position.set(0.12, 0.24, 0.12);
      for (const m of [glass, visor, ring]) m.castShadow = true;
      p.add(glass, visor, ring, lamp);
    });
    attach('Spine2', (p) => {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.22), new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.7 }));
      pack.position.set(0, 0.02, -0.22); pack.castShadow = true;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 }));
      top.position.set(0, 0.32, -0.22);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xc8102e, side: THREE.DoubleSide }));
      flag.position.set(0.16, 0.16, 0.13);
      p.add(pack, top);
    });
    // Animasyon
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    for (const n of ['Idle', 'Walk', 'Run']) if (!this.actions[n]) this.actions[n] = this.actions.Idle || this.mixer.clipAction(gltf.animations[0]);
    this.cur = null;
    this.play('Idle');

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.face = new THREE.Vector3(0, 0, 1);
    this.fwdM = this.face; // ChaseCam uyumu
    this.right = new THREE.Vector3(1, 0, 0);
    this.mu = GAME.g0 * ast.R0 * ast.R0;
    this.grounded = true;
    this.speed = 0; this.alt = 0; this.escRatio = 0; this.energy = -1;
    this.group.visible = false;
  }

  play(name) {
    const a = this.actions[name];
    if (!a || this.cur === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(0.3).play();
    if (this.cur) this.cur.fadeOut(0.3);
    this.cur = a;
  }

  place(pos, faceDir) {
    _d.copy(pos).normalize();
    this.pos.copy(_d).multiplyScalar(this.ast.radiusAt(_d) + 0.05);
    this.ast.normalAt(_d, this.up);
    this.face.copy(faceDir).addScaledVector(this.up, -faceDir.dot(this.up)).normalize();
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.sync(0);
  }

  // camFwd: kameranın yüzeye teğet ileri yönü
  update(dt, inp, camFwd) {
    const ast = this.ast, p = this.pos, v = this.vel;
    const len = p.length();
    _d.copy(p).divideScalar(len);
    const n = ast.normalAt(_d, _n);
    const h = len - ast.radiusAt(_d);
    const onGround = h < 0.12;
    const g = this.mu / (len * len);
    const fwd = _a.copy(camFwd).addScaledVector(n, -camFwd.dot(n)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, n);
    const wish = new THREE.Vector3().addScaledVector(fwd, inp.fwd - inp.back).addScaledVector(right, inp.right - inp.left);
    if (wish.lengthSq() > 0) wish.normalize();
    const speed = inp.boost ? 3.4 : 1.6; // oyun birimi/sn (≈4,5 ve 2,1 m/s)
    const vn = v.dot(n);
    const vt = v.clone().addScaledVector(n, -vn);
    if (onGround) {
      vt.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-7 * dt));
      v.copy(vt).addScaledVector(n, vn);
      if (inp.jump && vn < 0.5) v.addScaledVector(n, 3.4);
    } else {
      v.addScaledVector(wish, 0.6 * dt);
    }
    v.addScaledVector(_d, -g * dt);
    p.addScaledVector(v, dt);
    // zemin
    const L2 = p.length(); _d.copy(p).divideScalar(L2);
    const ground = ast.radiusAt(_d);
    if (L2 < ground) {
      p.copy(_d).multiplyScalar(ground);
      const n2 = ast.normalAt(_d, _n);
      const vn2 = v.dot(n2);
      if (vn2 < 0) v.addScaledVector(n2, -vn2);
    }
    this.grounded = p.length() - ground < 0.12;
    // kayalar
    for (const c of ast.colliders) {
      _a.subVectors(p, c.p);
      const d2 = _a.lengthSq(), m = c.r + 0.35;
      if (d2 < m * m) { const d = Math.sqrt(d2) || 0.001; p.addScaledVector(_a.divideScalar(d), m - d); }
    }
    // yönelim: hareket yönüne dön
    const vt2 = v.clone().addScaledVector(n, -v.dot(n));
    this.speed = vt2.length();
    if (this.speed > 0.2) this.face.lerp(vt2.normalize(), 1 - Math.exp(-10 * dt));
    this.alt = Math.max(0, p.length() - ground);
    this.escRatio = v.length() / Math.sqrt((2 * this.mu) / p.length());
    this.energy = 0.5 * v.lengthSq() - this.mu / p.length();
    // animasyon (düşük yerçekiminde yavaş adımlar)
    const ms = this.speed / SCALE; // m/s
    if (!this.grounded) this.play('Idle');
    else this.play(ms < 0.3 ? 'Idle' : ms < 3 ? 'Walk' : 'Run');
    if (this.cur === this.actions.Walk) this.cur.timeScale = THREE.MathUtils.clamp(ms / 1.8, 0.5, 1.3);
    if (this.cur === this.actions.Run) this.cur.timeScale = THREE.MathUtils.clamp(ms / 6, 0.6, 1.1);
    this.mixer.update(dt);
    this.sync(dt);
  }

  sync(dt) {
    _d.copy(this.pos).normalize();
    const n = this.ast.normalAt(_d, _n);
    // gövde dik dursun: yerçekimi yönü ile yüzey normali arası
    const target = n.clone().lerp(_d, 0.6).normalize();
    this.up.lerp(target, dt > 0 ? 1 - Math.exp(-8 * dt) : 1).normalize();
    this.face.addScaledVector(this.up, -this.face.dot(this.up)).normalize();
    this.right.crossVectors(this.up, this.face).normalize();
    _m.makeBasis(this.right, this.up, this.face);
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.position.copy(this.pos);
  }

  dispose() { this.group.parent && this.group.parent.remove(this.group); this.mixer.stopAllAction(); }
}

// EVA kamerası: karakterden bağımsız, yüzeye hizalı üçüncü şahıs kamera
export class EvaCam {
  constructor(camera, ast) {
    this.camera = camera; this.ast = ast;
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.pitch = 0.32; this.dist = 4.2;
    this.pos = new THREE.Vector3();
    this.first = true;
  }
  reset(fwd, up) { this.fwd.copy(fwd); this.up.copy(up); this.first = true; }
  update(dt, astro, mdx, mdy, wheel) {
    this.up.lerp(astro.up, this.first ? 1 : 1 - Math.exp(-4 * dt)).normalize();
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
    _q.setFromAxisAngle(this.up, -mdx * 0.003);
    this.fwd.applyQuaternion(_q).normalize();
    this.pitch = THREE.MathUtils.clamp(this.pitch + mdy * 0.0025, -0.1, 1.3);
    if (wheel) this.dist = THREE.MathUtils.clamp(this.dist * (wheel > 0 ? 1.12 : 0.89), 2, 14);
    const target = astro.pos.clone().addScaledVector(this.up, 1.0);
    const want = target.clone().addScaledVector(this.fwd, -Math.cos(this.pitch) * this.dist).addScaledVector(this.up, Math.sin(this.pitch) * this.dist);
    const wd = want.clone().normalize();
    const minR = this.ast.radiusAt(wd) + 0.5;
    if (want.length() < minR) want.copy(wd).multiplyScalar(minR);
    if (this.first) { this.pos.copy(want); this.first = false; } else this.pos.lerp(want, 1 - Math.exp(-12 * dt));
    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(target);
  }
}
