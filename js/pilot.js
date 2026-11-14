// Son yaklaşma: kinetik çarpıcıyı RCS iticileriyle hedefe yönlendir.
import * as THREE from 'three';
import { buildImpactor, mats } from './models.js';
import { dirFromLatLon } from './asteroid.js';
import { Particles } from './particles.js';
import { makeSmokeTexture, makeGlowTexture } from './textures.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { $, toast } from './ui.js';
import { GAME, fmt } from './data.js';
import { launcherOf } from './physics.js';

const SPEED = 55;          // oyun birimi / sn (yaklaşma hissi için ölçeklenmiş)
const START_DIST = 1300;

export class PilotPhase {
  constructor({ scene, camera, ast, sky, cfg, res, setShadow, onDone, skyAngle }) {
    Object.assign(this, { scene, camera, ast, sky, cfg, res, setShadow, onDone });
    this.group = new THREE.Group();
    scene.add(this.group);
    const R0 = ast.R0;

    // Hedef: işaretçinin bulunduğu nokta; yaklaşma doğrultusu bu noktadan kütle merkezine
    const siteDir = res.beaconSite ? res.beaconSite.pos.clone().normalize() : dirFromLatLon(-6, 128);
    this.approach = siteDir.clone();
    this.target = ast.surfacePoint(siteDir);
    this.targetN = ast.normalAt(siteDir, new THREE.Vector3());
    this.beacon = !!(res.flags && res.flags.beacon);
    // Temel eksenler
    this.fwd = this.approach.clone().negate();
    const tmp = Math.abs(this.fwd.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.right = new THREE.Vector3().crossVectors(this.fwd, tmp).normalize();
    this.up = new THREE.Vector3().crossVectors(this.right, this.fwd).normalize();
    // İşaretçi yoksa ekranda gösterilen hedef, gerçek en iyi noktadan sapmalı (tahmin hatası)
    if (this.beacon) this.shown = this.target.clone();
    else {
      const a = Math.random() * Math.PI * 2, e = 7 + Math.random() * 6;
      const p = this.target.clone().addScaledVector(this.right, Math.cos(a) * e).addScaledVector(this.up, Math.sin(a) * e);
      this.shown = ast.surfacePoint(p, 0);
    }

    // Güneş hedefe vursun
    let best = skyAngle || 0, bd = -2;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; sky.update(0, a); const d = sky.sunDir.dot(this.targetN); if (d > bd) { bd = d; best = a; } }
    this.skyAngle = best - 0.4; sky.update(0, this.skyAngle);

    // Çarpıcı: başlangıçta yanal bir hatayla gelir, oyuncu düzeltir
    this.craft = buildImpactor();
    this.craft.scale.setScalar(1.2);
    // Güneşe karşı aşırı parlak yansımalar olmasın
    this.craft.traverse((o) => {
      if (o.isMesh && o.material && 'roughness' in o.material) {
        o.material = o.material.clone();
        o.material.roughness = Math.max(o.material.roughness, 0.6);
        o.material.metalness = Math.min(o.material.metalness, 0.4);
      }
    });
    const ea = Math.random() * Math.PI * 2, err = 28 + Math.random() * 16;
    this.pos = this.target.clone().addScaledVector(this.approach, START_DIST)
      .addScaledVector(this.right, Math.cos(ea) * err).addScaledVector(this.up, Math.sin(ea) * err);
    this.vel = this.fwd.clone().multiplyScalar(SPEED);
    this.group.add(this.craft);
    this.craft.lookAt(this.pos.clone().add(this.fwd));
    this.rcs = 100;
    const glow = mats().glow;
    this.jets = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.5, 2, 3.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(1.6); s.visible = false; this.group.add(s); this.jets.push(s);
    }

    // Hedef işaretleri (yüzeye yapışık halkalar)
    const ring = (r1, r2, color) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.group.add(m); return m;
    };
    this.tRing = ring(this.beacon ? 2.4 : 9, this.beacon ? 2.9 : 9.6, new THREE.Color(4, 0.6, 0.4));
    this.tRing2 = ring(this.beacon ? 5.5 : 14, this.beacon ? 5.8 : 14.4, new THREE.Color(2.4, 0.4, 0.3));
    this.placeOnSurface(this.tRing, this.shown); this.placeOnSurface(this.tRing2, this.shown);
    this.strobe = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(10, 0.8, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.strobe.scale.setScalar(this.beacon ? 6 : 0.001);
    this.strobe.position.copy(this.shown).addScaledVector(this.targetN, 2.5);
    this.group.add(this.strobe);
    this.pRing = ring(1.6, 2.1, new THREE.Color(0.6, 3, 4));
    this.pDot = ring(0, 0.5, new THREE.Color(0.6, 3, 4));

    // Efektler
    this.dust = new Particles(6000, { texture: makeSmokeTexture(64, 9) });
    this.dust.radialGravity = GAME.g0 * R0 * R0;
    this.sparks = new Particles(1500, { texture: makeGlowTexture(64, 1.5), additive: true });
    this.dust.setScale(innerHeight); this.sparks.setScale(innerHeight);
    this.group.add(this.dust.points, this.sparks.points);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(9, 8, 6.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false; this.group.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffd2a0, 0, 0, 2); this.group.add(this.flashLight);

    this.t = 0; this.state = 'fly'; this.after = 0; this.shake = 0;
    this.camYaw = 0; this.camPitch = 0;
    this.camPos = this.pos.clone();
    this.predicted = null;
    this.timeScale = 1;
    this.L = launcherOf(cfg);
    toast(`<b>Son yaklaşma.</b> ${this.beacon ? 'İşaretçinin kırmızı ışığına nişan al.' : 'İşaretçi yok: kırmızı halka tahmini kütle merkezi bölgesi.'} <kbd>WASD</kbd> ile RCS iticilerini ateşle.`, 'info', 8);
  }

  placeOnSurface(mesh, p) {
    const n = this.ast.normalAt(p.clone().normalize(), new THREE.Vector3());
    mesh.position.copy(p).addScaledVector(n, 0.35);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }

  // Düz çizgide ilerlerse yüzeye nerede çarpar?
  predict(origin, dir) {
    const ast = this.ast, p = new THREE.Vector3();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      p.copy(origin).addScaledVector(dir, t);
      const L = p.length();
      if (L > ast.R0 * 1.6 && p.dot(dir) > 0) return null;
      const h = L - ast.radiusAt(p);
      if (h < 0.05) return { t, p: p.clone() };
      t += Math.max(0.3, h * 0.8);
      if (t > START_DIST * 2) return null;
    }
    return null;
  }

  resize() { this.dust.setScale(innerHeight); this.sparks.setScale(innerHeight); }

  update(dtReal) {
    const dt = dtReal * this.timeScale;
    this.t += dt;
    this.sky.update(dt, this.skyAngle);
    if (this.state === 'fly') this.fly(dt, dtReal);
    else this.afterImpact(dt);
    this.dust.update(dt, (p, v, i3) => {
      const L = Math.hypot(p[i3], p[i3 + 1], p[i3 + 2]);
      const rs = this.ast.radiusAt({ x: p[i3], y: p[i3 + 1], z: p[i3 + 2] });
      if (L < rs + 0.2) { const k = (rs + 0.2) / L; p[i3] *= k; p[i3 + 1] *= k; p[i3 + 2] *= k; v[i3] *= 0.2; v[i3 + 1] *= 0.2; v[i3 + 2] *= 0.2; }
    });
    this.sparks.update(dt);
    this.strobe.visible = this.beacon && Math.sin(this.t * 7) > 0;
    this.setShadow(this.target, 70);
  }

  fly(dt, dtReal) {
    const inp = input.axis();
    const ax = (inp.right - inp.left), ay = (inp.fwd - inp.back);
    const power = inp.boost ? 14 : 8;
    const firing = (ax || ay) && this.rcs > 0;
    if (firing) {
      this.vel.addScaledVector(this.right, ax * power * dt).addScaledVector(this.up, ay * power * dt);
      this.rcs = Math.max(0, this.rcs - (inp.boost ? 16 : 9) * dt * Math.hypot(ax, ay));
    }
    audio.thrust(!!firing);
    // Kamera serbest bakış (sınırlı)
    this.camYaw = THREE.MathUtils.clamp(this.camYaw - input.mdx * 0.002, -0.6, 0.6);
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - input.mdy * 0.002, -0.45, 0.45);

    const prevPos = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    this.craft.position.copy(this.pos);
    const vdir = this.vel.clone().normalize();
    this.craft.lookAt(this.pos.clone().add(vdir));
    // RCS jet görselleri
    const jp = [[this.right, -1, ax < 0], [this.right, 1, ax > 0], [this.up, -1, ay < 0], [this.up, 1, ay > 0]];
    this.jets.forEach((s, i) => {
      const [axis, sgn, on] = jp[i];
      s.visible = !!(firing && on);
      s.position.copy(this.pos).addScaledVector(axis, -sgn * 2.2);
      s.scale.setScalar(1.2 + Math.random() * 0.8);
    });

    this.predicted = this.predict(this.pos, vdir);
    const pr = this.predicted;
    if (pr) { this.pRing.visible = this.pDot.visible = true; this.placeOnSurface(this.pRing, pr.p); this.placeOnSurface(this.pDot, pr.p); }
    else { this.pRing.visible = this.pDot.visible = false; }
    this.tRing.rotation.z += dt; this.tRing2.rotation.z -= dt * 0.6;

    const tti = pr ? pr.t / SPEED : null;
    this.timeScale = tti !== null && tti < 1.6 ? 0.3 : 1;

    // Kamera
    const back = this.fwd.clone().negate();
    const camOff = back.clone().multiplyScalar(16).addScaledVector(this.up, 4);
    const q = new THREE.Quaternion().setFromAxisAngle(this.up, this.camYaw);
    const q2 = new THREE.Quaternion().setFromAxisAngle(this.right, this.camPitch);
    camOff.applyQuaternion(q2).applyQuaternion(q);
    const want = this.pos.clone().add(camOff);
    this.camPos.lerp(want, 1 - Math.exp(-10 * dtReal));
    this.camera.position.copy(this.camPos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.pos.clone().addScaledVector(vdir, 40));

    // Çarpma / ıskalama
    if (pr && pr.t <= SPEED * dt * 1.05) { this.impact(pr.p); return; }
    if (!pr && this.pos.dot(vdir) > 0 && this.pos.length() < this.ast.R0 * 3) {
      // asteroidi geçti
      this.missed(); return;
    }
    if (!pr && prevPos.length() > this.pos.length() && this.pos.length() < this.ast.R0 * 1.4) { this.missed(); return; }
    this.updateHUD(tti, pr);
  }

  impact(p) {
    this.state = 'impact';
    audio.thrust(false);
    this.timeScale = 1;
    this.craft.visible = false;
    this.jets.forEach((s) => (s.visible = false));
    this.pRing.visible = this.pDot.visible = false;
    const n = this.ast.normalAt(p.clone().normalize(), new THREE.Vector3());
    this.impactPoint = p.clone();
    const dM = p.distanceTo(this.target) * GAME.mPerUnit;
    this.dMeters = dM;
    this.hitEff = 0.95 * THREE.MathUtils.clamp(1 - dM / 40, 0.3, 1);
    this.flash.visible = true; this.flash.position.copy(p).addScaledVector(n, 1);
    this.flashLight.position.copy(p).addScaledVector(n, 6);
    audio.boom(1);
    this.shake = 2.5;
    const dirIn = this.fwd.clone().negate();
    const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    for (let i = 0; i < 5000; i++) {
      const v = n.clone().multiplyScalar(0.6 + Math.random()).addScaledVector(t1, (Math.random() - 0.5) * 1.6).addScaledVector(t2, (Math.random() - 0.5) * 1.6)
        .addScaledVector(dirIn, 0.3).normalize().multiplyScalar(4 + Math.pow(Math.random(), 2) * 34);
      const c = 0.45 + Math.random() * 0.2;
      this.dust.emit(p.x, p.y, p.z, v.x, v.y, v.z, 6 + Math.random() * 6, 0.3 + Math.random() * 0.4, 1.4 + Math.random() * 2.6, c * 1.05, c, c * 0.9, 0.7, 0.05);
    }
    for (let i = 0; i < 700; i++) {
      const v = n.clone().addScaledVector(new THREE.Vector3().randomDirection(), 0.9).normalize().multiplyScalar(10 + Math.random() * 45);
      this.sparks.emit(p.x, p.y, p.z, v.x, v.y, v.z, 0.5 + Math.random(), 0.9, 0.2, 2.2, 1.4, 0.6, 1, 0.3, 1.2, 0.3, 0.1, 0.4);
    }
    // Kamerayı çarpma noktasını gören bir yere al
    this.viewPos = p.clone().addScaledVector(n, 45).addScaledVector(t1, 60).addScaledVector(t2, -20);
    this.viewN = n;
    const q = this.hitEff >= 0.85 ? 'MÜKEMMEL İSABET' : this.hitEff >= 0.6 ? 'İYİ İSABET' : 'ZAYIF İSABET';
    this.showCaption('ÇARPMA!', `${q} · Hedefe uzaklık ${fmt(dM, 1)} m · Momentum aktarım verimi %${Math.round(this.hitEff * 100)}`);
  }

  missed() {
    this.state = 'miss';
    audio.thrust(false);
    this.timeScale = 1;
    this.hitEff = 0; this.dMeters = null;
    this.pRing.visible = this.pDot.visible = false;
    this.showCaption('ISKA!', 'Çarpıcı asteroidi kaçırdı. Kinetik saptırma gerçekleşmedi.');
    audio.warn();
  }

  afterImpact(dt) {
    this.after += dt;
    if (this.state === 'impact') {
      const u = this.after;
      this.flash.scale.setScalar(Math.min(1, u / 0.12) * 26 * (1 + u * 0.8));
      this.flash.material.opacity = Math.max(0, 1 - u / 1.1);
      this.flashLight.intensity = 2.5e5 * Math.max(0, 1 - u / 1.4) ** 2;
      this.camPos.lerp(this.viewPos, 1 - Math.exp(-2.5 * dt));
      this.camera.position.copy(this.camPos);
      if (this.shake > 0) { this.camera.position.add(new THREE.Vector3().randomDirection().multiplyScalar(this.shake)); this.shake = Math.max(0, this.shake - dt * 1.8); }
      this.camera.up.copy(this.viewN);
      this.camera.lookAt(this.impactPoint.clone().addScaledVector(this.viewN, 8));
    } else {
      this.pos.addScaledVector(this.vel, dt);
      this.craft.position.copy(this.pos);
      this.camera.lookAt(this.pos);
    }
    if (this.after > 6.5 && !this.done) {
      this.done = true;
      this.hideCaption();
      this.onDone({ hitEff: this.hitEff, dMeters: this.dMeters, missed: this.state === 'miss' });
    }
  }

  showCaption(a, b) { $('pilotCaption').innerHTML = `<div class="pc-main">${a}</div><div class="pc-sub">${b}</div>`; $('pilotCaption').classList.add('show'); }
  hideCaption() { $('pilotCaption').classList.remove('show'); }

  updateHUD(tti, pr) {
    $('ttiTxt').textContent = tti !== null ? fmt(tti, 1) + ' sn' : '—';
    $('pilotSpeed').textContent = `Hız ${fmt(this.L.vimp, 1)} km/s · Mesafe ${fmt(this.pos.distanceTo(this.target) * GAME.mPerUnit / 1000, 2)} km`;
    $('rcsFill').style.width = this.rcs + '%';
    $('rcsFill').className = this.rcs < 20 ? 'bad' : this.rcs < 45 ? 'warn' : '';
    $('rcsTxt').textContent = Math.round(this.rcs) + '%';
    let aim;
    if (pr) {
      const d = pr.p.distanceTo(this.shown) * GAME.mPerUnit;
      const cls = d < 4 ? 'ok' : d < 15 ? 'warn' : 'bad';
      aim = `Tahmini isabet: <b class="${cls}">${fmt(d, 1)} m</b> ${this.beacon ? 'işaretçiden' : 'tahmini merkezden'}`;
      $('pilotWarn').classList.remove('show');
    } else {
      aim = 'Tahmini isabet: <b class="bad">ASTEROİDİ ISKALIYOR</b>';
      $('pilotWarn').textContent = 'ROTA ASTEROİDİ KAÇIRIYOR · RCS İLE DÜZELT';
      $('pilotWarn').classList.add('show');
    }
    $('aimTxt').innerHTML = aim;
    $('targetTxt').innerHTML = this.beacon ? 'Hedef: <b class="ok">İşaretçi kilidi (hassas)</b>' : 'Hedef: <b class="warn">Tahmini kütle merkezi (±15 m)</b>';
    $('pilotControls').classList.toggle('show', this.t < 12);
  }

  dispose() { this.scene.remove(this.group); audio.thrust(false); this.hideCaption(); $('pilotWarn').classList.remove('show'); }
}
