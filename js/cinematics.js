// Varış ve final sinematikleri (asteroit sahnesinde)
import * as THREE from 'three';
import { buildMothership, buildImpactor, buildIonTug, mats } from './models.js';
import { dirFromLatLon } from './asteroid.js';
import { Particles } from './particles.js';
import { makeSmokeTexture, makeGlowTexture } from './textures.js';
import { caption } from './ui.js';
import { audio } from './audio.js';
import { launcherOf, timeline } from './physics.js';
import { fmt, fmtYear, GAME } from './data.js';

const Y = new THREE.Vector3(0, 1, 0);
const ease = (x) => 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);

export class Arrival {
  constructor({ scene, camera, ast, sky, cfg, setShadow, onDone }) {
    Object.assign(this, { scene, camera, ast, sky, cfg, setShadow, onDone });
    this.mother = buildMothership();
    this.mother.scale.setScalar(1.6);
    this.dir = dirFromLatLon(25, 70);
    this.p0 = this.dir.clone().multiplyScalar(ast.R0 * 10).add(new THREE.Vector3(60, 40, -30));
    this.p1 = this.dir.clone().multiplyScalar(ast.R0 * 2.2);
    scene.add(this.mother);
    this.t = 0; this.angle = 0; this.done = false;
    this.mother.userData.flames.forEach((f) => (f.visible = true));
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.angle += dt * 0.01;
    this.sky.update(dt, this.angle);
    const k = ease(t / 7);
    const pos = this.mother.position.lerpVectors(this.p0, this.p1, k);
    this.mother.lookAt(0, 0, 0);
    this.mother.userData.flames.forEach((f) => { f.visible = t > 4.2 && t < 7; f.scale.y = 0.8 + Math.random() * 0.4; });
    const back = pos.clone().normalize();
    const side = new THREE.Vector3().crossVectors(back, Y).normalize();
    const camTarget = pos.clone().addScaledVector(back, 26 - 10 * k).addScaledVector(side, 14).addScaledVector(Y, 6);
    this.camera.position.copy(camTarget);
    this.camera.up.set(0, 1, 0);
    const look = new THREE.Vector3().lerpVectors(pos, new THREE.Vector3(), 0.55 + 0.45 * k);
    this.camera.lookAt(look);
    this.setShadow(new THREE.Vector3(), 95);
    const L = launcherOf(this.cfg);
    if (t < 4.2) caption('VARIŞ', `2026 TK7 "Tufan" · Çap 160 m · Dönme periyodu 5,8 saat · Yolculuk ${fmt(L.transfer, 2)} yıl`);
    else caption('GEZGİN AYRILIYOR', 'Keşif aracı yüzeye iniş için serbest bırakıldı');
    if (t > 7.6 && !this.done) { this.done = true; this.onDone(); }
  }
  dispose() { this.scene.remove(this.mother); }
}

export class FinalSequence {
  constructor({ scene, camera, ast, sky, cfg, res, outcome, setShadow, onDone, skyAngle, skipKinetic = false }) {
    Object.assign(this, { scene, camera, ast, sky, cfg, res, outcome, setShadow, onDone });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.angle = skyAngle || 0;
    this.steps = [];
    this.tl = timeline(cfg);
    if (cfg.methods.kinetik && !skipKinetic) this.steps.push(this.kineticStep());
    if (cfg.methods.iyon) this.steps.push(this.ionStep());
    if (cfg.methods.traktor) this.steps.push(this.tractorStep());
    this.steps.push({ dur: 3, update: (t) => this.analysis(t) });
    this.idx = 0; this.t = 0; this.done = false;
    this.dust = new Particles(6000, { texture: makeSmokeTexture(64, 9) });
    this.dust.radialGravity = GAME.g0 * ast.R0 * ast.R0;
    this.sparks = new Particles(1500, { texture: makeGlowTexture(64, 1.5), additive: true });
    this.dust.setScale(innerHeight); this.sparks.setScale(innerHeight);
    this.group.add(this.dust.points, this.sparks.points);
    this.steps[0].init?.();
  }

  kineticStep() {
    const ast = this.ast;
    let site = this.res.beaconSite && this.res.beaconSite.done ? this.res.beaconSite.pos.clone() : null;
    if (!site) {
      const d = dirFromLatLon(-6, 128).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.45).normalize();
      site = ast.surfacePoint(d, 0);
    }
    const normal = ast.normalAt(site.clone().normalize(), new THREE.Vector3());
    const tan = new THREE.Vector3().crossVectors(normal, Y).normalize();
    const tan2 = new THREE.Vector3().crossVectors(normal, tan).normalize();
    const dirIn = normal.clone().multiplyScalar(0.72).addScaledVector(tan, 0.69).normalize();
    const imp = buildImpactor();
    imp.scale.setScalar(1.3);
    const start = site.clone().addScaledVector(dirIn, 420);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: mats().glow, color: new THREE.Color(9, 8, 6.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flash.visible = false;
    const light = new THREE.PointLight(0xffd2a0, 0, 0, 2);
    const camPos = site.clone().addScaledVector(normal, 50).addScaledVector(tan2, 75).addScaledVector(tan, -30);
    const L = launcherOf(this.cfg);
    const kin = this.outcome.parts.find((p) => p.id === 'kinetik');
    let hit = false;
    return {
      dur: 10.5,
      init: () => { this.group.add(imp, flash, light); imp.position.copy(start); imp.lookAt(site); this.faceSun(normal); },
      update: (t, dt) => {
        const T = 4.2;
        this.sky.update(dt, this.angle);
        this.camera.position.copy(camPos).addScaledVector(tan, t * 1.5);
        this.camera.up.copy(normal);
        this.camera.lookAt(site.clone().addScaledVector(normal, 6));
        if (t < T) {
          const k = Math.pow(t / T, 1.6);
          imp.position.lerpVectors(start, site, k);
          imp.visible = true;
          for (let i = 0; i < 3; i++) {
            const p = imp.position;
            this.sparks.emit(p.x, p.y, p.z, dirIn.x * 4, dirIn.y * 4, dirIn.z * 4, 0.6, 3, 0.5, 1.6, 1.3, 1, 0.6, 0, 0.6, 0.4, 0.3, 0);
          }
          caption('ÇARPICI YAKLAŞIYOR', `${fmt(this.cfg.impactorMass)} kg · ${fmt(L.vimp, 1)} km/s · ${this.res.flags.beacon ? 'işaretçiye kilitli' : '<span class="bad">işaretçi yok: kör nişan</span>'}`);
        } else {
          if (!hit) {
            hit = true; imp.visible = false; flash.visible = true; flash.position.copy(site).addScaledVector(normal, 1);
            light.position.copy(site).addScaledVector(normal, 6);
            audio.boom(1);
            this.shake = 2.5;
            for (let i = 0; i < 5000; i++) {
              const v = normal.clone().multiplyScalar(0.6 + Math.random())
                .addScaledVector(tan, (Math.random() - 0.5) * 1.6).addScaledVector(tan2, (Math.random() - 0.5) * 1.6)
                .addScaledVector(dirIn, -0.4).normalize().multiplyScalar(4 + Math.pow(Math.random(), 2) * 34);
              const c = 0.45 + Math.random() * 0.2;
              this.dust.emit(site.x, site.y, site.z, v.x, v.y, v.z, 6 + Math.random() * 6, 0.3 + Math.random() * 0.4, 1.4 + Math.random() * 2.6, c * 1.05, c, c * 0.9, 0.7, 0.05);
            }
            for (let i = 0; i < 700; i++) {
              const v = normal.clone().addScaledVector(new THREE.Vector3().randomDirection(), 0.9).normalize().multiplyScalar(10 + Math.random() * 45);
              this.sparks.emit(site.x, site.y, site.z, v.x, v.y, v.z, 0.5 + Math.random() * 1.0, 0.9, 0.2, 2.2, 1.4, 0.6, 1, 0.3, 1.2, 0.3, 0.1, 0.4);
            }
          }
          const u = t - T;
          flash.scale.setScalar(Math.min(1, u / 0.12) * 26 * (1 + u * 0.8));
          flash.material.opacity = Math.max(0, 1 - u / 1.1);
          light.intensity = 2.5e5 * Math.max(0, 1 - u / 1.4) ** 2;
          caption('ÇARPMA!', kin ? `Δv = ${fmt(kin.dv * 100, 2)} cm/s · Isabet verimi %${Math.round(kin.eff * 100)}` : '');
        }
        if (this.shake > 0) {
          this.camera.position.add(new THREE.Vector3().randomDirection().multiplyScalar(this.shake));
          this.shake = Math.max(0, this.shake - dt * 1.8);
        }
        this.setShadow(site, 70);
      },
    };
  }

  ionStep() {
    const site = this.res.anchorSite;
    const ok = site && site.done;
    const pos = site ? site.pos.clone() : this.ast.surfacePoint(dirFromLatLon(87, 30));
    const normal = site ? site.normal.clone() : this.ast.normalAt(pos.clone().normalize(), new THREE.Vector3());
    const tug = buildIonTug(this.cfg.ionCount);
    const y0 = 2026 + this.tl.opsStart, y1 = y0 + this.cfg.ionYears;
    return {
      dur: 7,
      init: () => {
        this.group.add(tug);
        tug.position.copy(pos).addScaledVector(normal, ok ? 0 : 14);
        tug.quaternion.setFromUnitVectors(Y, normal);
        tug.userData.plumes.forEach((p) => (p.visible = true));
        this.faceSun(normal);
      },
      update: (t, dt) => {
        this.angle += dt * 2.2;
        this.sky.update(dt, this.angle);
        tug.userData.plumes.forEach((p) => { p.scale.set(1, 0.9 + Math.random() * 0.2, 1); p.material.opacity = 0.45 + Math.random() * 0.1; });
        if (!ok) tug.position.copy(pos).addScaledVector(normal, 14 + Math.sin(t * 2) * 3);
        const a = t * 0.25;
        const tan = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
        const tan2 = new THREE.Vector3().crossVectors(normal, tan);
        this.camera.position.copy(pos).addScaledVector(normal, 18).addScaledVector(tan, Math.cos(a) * 42).addScaledVector(tan2, Math.sin(a) * 42);
        this.camera.up.copy(normal);
        this.camera.lookAt(pos.clone().addScaledVector(normal, 8));
        const yr = y0 + (y1 - y0) * Math.min(1, t / 6);
        caption('İYON İTİCİ ÇALIŞIYOR', `${this.cfg.ionCount} × 0,25 N · Yıl ${fmtYear(yr)} / ${fmtYear(y1)} · ${ok ? 'kutba ankrajlı, kesintisiz itme' : '<span class="bad">ankraj yok: dönen yüzeyde verimsiz itme (%30)</span>'}`);
        this.setShadow(pos, 70);
      },
    };
  }

  tractorStep() {
    const part = this.outcome.parts.find((p) => p.id === 'traktor');
    const hover = (part ? part.hover : 128) / GAME.mPerUnit;
    const dir = dirFromLatLon(5, 200);
    const craft = buildMothership();
    craft.scale.setScalar(3.2);
    const y0 = 2026 + this.tl.opsStart, y1 = y0 + this.cfg.tractorYears;
    return {
      dur: 7,
      init: () => {
        this.group.add(craft);
        craft.position.copy(dir).multiplyScalar(hover);
        craft.lookAt(0, 0, 0);
        craft.userData.flames.forEach((f) => (f.visible = true));
      },
      update: (t, dt) => {
        this.angle += dt * 2.2;
        this.sky.update(dt, this.angle);
        craft.userData.flames.forEach((f) => (f.scale.y = 0.7 + Math.random() * 0.4));
        const side = new THREE.Vector3().crossVectors(dir, Y).normalize();
        const a = t * 0.12;
        this.camera.position.copy(dir).multiplyScalar(hover * 0.55).addScaledVector(side, 150 * Math.cos(a)).addScaledVector(Y, 60 + 20 * Math.sin(a));
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(dir.clone().multiplyScalar(hover * 0.45));
        const yr = y0 + (y1 - y0) * Math.min(1, t / 6);
        caption('YERÇEKİMİ TRAKTÖRÜ', `${fmt(this.cfg.tractorMass)} kg · ${fmt(hover * GAME.mPerUnit)} m mesafe · Yıl ${fmtYear(yr)} / ${fmtYear(y1)}`);
        this.setShadow(new THREE.Vector3(), 100);
      },
    };
  }

  // Gökyüzü açısını, verilen yüzey normali güneşe en iyi bakacak şekilde ayarla
  faceSun(normal) {
    let best = this.angle, bd = -2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      this.sky.update(0, a);
      const d = this.sky.sunDir.dot(normal);
      if (d > bd) { bd = d; best = a; }
    }
    this.angle = best - 0.35;
    this.sky.update(0, this.angle);
  }

  analysis(t) {
    caption('YÖRÜNGE ANALİZİ', 'Derin Uzay Ağı radar ölçümleri işleniyor…');
    const k = ease(t / 3);
    const e = this.sky.earthWorldPos();
    const away = e.clone().normalize().multiplyScalar(-1);
    this.camera.position.copy(away.multiplyScalar(160 + 120 * k)).add(new THREE.Vector3(0, 40, 0));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(), e, k * 0.6));
    this.setShadow(new THREE.Vector3(), 100);
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const step = this.steps[this.idx];
    step.update(this.t, dt);
    this.dust.update(dt, (p, v, i3) => {
      const L = Math.hypot(p[i3], p[i3 + 1], p[i3 + 2]);
      const rs = this.ast.radiusAt({ x: p[i3], y: p[i3 + 1], z: p[i3 + 2] });
      if (L < rs + 0.2) { const k = (rs + 0.2) / L; p[i3] *= k; p[i3 + 1] *= k; p[i3 + 2] *= k; v[i3] *= 0.2; v[i3 + 1] *= 0.2; v[i3 + 2] *= 0.2; }
    });
    this.sparks.update(dt);
    if (this.t >= step.dur) {
      this.idx++; this.t = 0;
      if (this.idx >= this.steps.length) { this.done = true; this.onDone(); return; }
      this.steps[this.idx].init?.();
    }
  }

  skip() { if (!this.done) { this.done = true; this.onDone(); } }
  dispose() { this.scene.remove(this.group); }
}
