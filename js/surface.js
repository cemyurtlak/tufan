import { T as __T } from './i18n.js';
// Asteroit yüzeyi görev aşaması: sürüş, tarama, sensör, işaretçi, ankraj, enerji ve iletişim.
import * as THREE from 'three';
import { Rover, ChaseCam } from './rover.js';
import { dirFromLatLon } from './asteroid.js';
import { buildSensor, buildBeacon, buildFlag, buildDrillSite, buildIonTug, buildMothership } from './models.js';
import { GAME, ASTEROID, fmt } from './data.js';
import { opt } from './physics.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { $, toast, mmss } from './ui.js';
import { Astronaut, EvaCam } from './eva.js';
import { getCharacterGLTF } from './base.js';

const Y = new THREE.Vector3(0, 1, 0);

const BEAM_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BEAM_FS = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 1.6) * opacity; gl_FragColor = vec4(color * a, a); }`;

const TYPES = {
  spectro: { color: 0x5fd8ff, verb: __T('Spektral tarama'), dur: 4, drain: 2.2, mb: 40 },
  seismic: { color: 0x6dffa8, verb: __T('Sismik sensör yerleştir'), dur: 3, drain: 1.2, mb: 25 },
  drill: { color: 0xffb547, verb: __T('Karot numunesi al'), dur: 5.5, drain: 3.0, mb: 60 },
  beacon: { color: 0xff5d5d, verb: __T('Hedef işaretçisi kur'), dur: 4, drain: 1.0, mb: 4 },
  anchor: { color: 0xb18cff, verb: __T('İyon iticiyi ankrajla'), dur: 6, drain: 1.5, mb: 4 },
};

export const LANDING_DIR = new THREE.Vector3(0.37, 0.45, 0.82).normalize();

export function siteDirs(cfg, ast) {
  const list = [];
  const r = cfg.rover.instruments;
  if (r.spektrometre) {
    list.push({ type: 'spectro', name: __T('Spektral Tarama A'), dir: dirFromLatLon(14, 84) });
    list.push({ type: 'spectro', name: __T('Spektral Tarama B'), dir: dirFromLatLon(44, 38) });
    list.push({ type: 'spectro', name: __T('Spektral Tarama C'), dir: dirFromLatLon(-8, 50) });
  }
  if (r.sismometre) {
    list.push({ type: 'seismic', name: __T('Sismik Sensör 1'), dir: dirFromLatLon(32, 135) });
    list.push({ type: 'seismic', name: __T('Sismik Sensör 2'), dir: dirFromLatLon(-22, 205) });
    list.push({ type: 'seismic', name: __T('Sismik Sensör 3'), dir: dirFromLatLon(10, 300) });
  }
  if (r.matkap) {
    list.push({ type: 'drill', name: __T('Karot: Büyük Krater'), dir: ast.bigCrater.c.clone() });
    list.push({ type: 'drill', name: __T('Karot: Krater Kenarı'), dir: ast.bigCrater.c.clone().applyAxisAngle(Y, 0.55).normalize() });
  }
  if (cfg.methods.kinetik) list.push({ type: 'beacon', name: __T('Çarpma Noktası'), dir: dirFromLatLon(-6, 128) });
  if (cfg.methods.iyon) list.push({ type: 'anchor', name: __T('Kuzey Kutbu Ankrajı'), dir: dirFromLatLon(87, 30) });
  return list;
}

export class SurfaceMission {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, camera, ast, sky, cfg, truth, onEnd, setShadow, dust
    const cfg = this.cfg;
    this.power = opt('power', cfg.rover.power);
    this.batCap = opt('battery', cfg.rover.battery).cap;
    this.battery = this.batCap;
    this.rate = opt('antenna', cfg.rover.antenna).rate;
    this.window = GAME.windowSec;
    this.t = 0;
    this.skyAngle = 0;
    this.objects = new THREE.Group();
    this.scene.add(this.objects);

    this.rover = new Rover(this.objects, this.ast, cfg.rover, this.dust);
    this.cam = new ChaseCam(this.camera, this.ast);
    // EVA: astronot ve kamerası
    const g = getCharacterGLTF();
    this.astro = g ? new Astronaut(this.objects, this.ast, g) : null;
    this.evaCam = new EvaCam(this.camera, this.ast);
    this.eva = false; this.o2 = 100;
    this.flags = { beacon: false, anchor: false, massKnown: false };
    this.densityKnown = false; this.structureKnown = false;
    this.buffer = []; this.uploaded = 0; this.produced = 0;
    this.uploadedKinds = { spectro: 0, seismicNet: 0, drill: 0 };
    this.sunlit = true; this.link = true; this.envTimer = 0; this.hudTimer = 0;
    this.endConfirm = 0; this.rescues = 0; this.ended = false;
    this.showHelp = true;
    this.warnState = '';

    // Görev noktaları
    this.sites = siteDirs(cfg, this.ast).map((s, i) => this.makeSite(s, i));
    // Ana uydu gökyüzünde
    this.mother = buildMothership();
    this.mother.scale.setScalar(1.6);
    this.mother.position.copy(dirFromLatLon(25, 70)).multiplyScalar(this.ast.R0 * 2.2);
    this.mother.lookAt(0, 0, 0);
    this.objects.add(this.mother);
    // İyon itici: kutbun üstünde bekler
    if (cfg.methods.iyon) {
      this.tug = buildIonTug(cfg.ionCount);
      const site = this.sites.find((s) => s.type === 'anchor');
      this.tug.position.copy(site.pos).addScaledVector(site.normal, 14);
      this.tug.quaternion.setFromUnitVectors(Y, site.normal);
      this.objects.add(this.tug);
    }

    this.labelsEl = $('labels');
    this.labelsEl.innerHTML = '';
    for (const s of this.sites) {
      const el = document.createElement('div');
      el.className = 'site-label';
      el.style.setProperty('--c', '#' + new THREE.Color(TYPES[s.type].color).getHexString());
      el.innerHTML = `<b>${s.name}</b><span></span>`;
      this.labelsEl.appendChild(el);
      s.el = el; s.distEl = el.querySelector('span');
    }
    this.radar = $('radar').getContext('2d');
    this.buildTaskList();

    this.lowPower = false;
    this.rover.place(LANDING_DIR, new THREE.Vector3(0, 1, 0));
    // İniş: araç 16 birim yukarıdan iticilerle alçalır
    this.rover.pos.addScaledVector(this.rover.up, 9);
    this.rover.grounded = false;
    this.intro = 6;
  }

  get actor() { return this.eva ? this.astro : this.rover; }

  toggleEva() {
    if (!this.astro) { toast(__T('Astronot modeli yüklenemedi.'), 'warn', 3); return; }
    if (this.eva) {
      const d = this.astro.pos.distanceTo(this.rover.pos);
      if (d > 4.5) { toast(__T`GEZGİN'e binmek için aracın yanına git (${fmt(d * GAME.mPerUnit)} m).`, 'warn', 3); return; }
      this.eva = false;
      this.astro.group.visible = false;
      this.cam.first = true;
      audio.click();
      toast(__T('Astronot GEZGİN\'e bindi. Oksijen yeniden dolduruluyor.'), 'info', 3);
    } else {
      if (!this.rover.grounded || this.rover.speed > 1.2) { toast(__T('Araçtan inmek için önce dur.'), 'warn', 2.5); return; }
      const side = this.rover.pos.clone().addScaledVector(this.rover.right, 2.4);
      this.astro.place(side, this.rover.fwdM);
      this.astro.group.visible = true;
      this.evaCam.reset(this.rover.fwdM, this.astro.up);
      this.eva = true;
      audio.engineOff(); audio.click();
      toast(__T('<b>EVA başladı.</b> <kbd>WASD</kbd> yürü, <kbd>Shift</kbd> sek-koş, <kbd>Boşluk</kbd> zıpla, <kbd>E</kbd> görev, <kbd>F</kbd> araca dön. Oksijeni izle!'), 'info', 7);
    }
  }

  makeSite(s, i) {
    const T = TYPES[s.type];
    const dir = s.dir.clone().normalize();
    const pos = this.ast.surfacePoint(dir, 0);
    const normal = this.ast.normalAt(dir, new THREE.Vector3());
    const g = new THREE.Group();
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(Y, normal);
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 45, 12, 1, true);
    beamGeo.translate(0, 22.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(T.color).multiplyScalar(2.2) }, opacity: { value: 0.5 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.8, 64), new THREE.MeshBasicMaterial({
      color: new THREE.Color(T.color).multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45;
    g.add(ring);
    this.objects.add(g);
    return { ...s, ...T, i, dir, pos, normal, group: g, beam, ring, done: false, progress: 0, occluded: false };
  }

  buildTaskList() {
    const c = this.cfg;
    const t = [];
    const cnt = (type) => this.sites.filter((s) => s.type === type);
    if (c.rover.instruments.spektrometre) t.push({ label: __T('Spektral tarama'), list: cnt('spectro') });
    if (c.rover.instruments.sismometre) t.push({ label: __T('Sismik sensör yerleştir'), list: cnt('seismic') });
    if (c.rover.instruments.matkap) t.push({ label: __T('Karot numunesi al'), list: cnt('drill') });
    if (c.methods.kinetik) t.push({ label: __T('Çarpma noktasına işaretçi kur'), list: cnt('beacon'), critical: true });
    if (c.methods.iyon) t.push({ label: __T('İyon iticiyi kutba ankrajla'), list: cnt('anchor'), critical: true });
    this.tasks = t;
  }

  // --------------------------------------------------------------
  update(dt) {
    if (this.ended) return;
    this.t += dt;
    this.window -= dt;
    this.skyAngle += (dt / GAME.dayPeriodSec) * Math.PI * 2;
    this.sky.update(dt, this.skyAngle);

    const inp = input.axis();
    if (this.rover.lowPower) { inp.boost = false; }
    if (this.intro > 0) {
      this.intro -= dt;
      const rd = this.rover.pos.clone().normalize();
      const vr = this.rover.vel.dot(rd);
      Object.assign(inp, { fwd: 0, back: 0, left: 0, right: 0, boost: false, interact: false });
      inp.jump = !this.rover.grounded && vr < -2.2;
      if (this.intro <= 0 || this.rover.grounded) { this.rover.fuel = this.rover.fuelMax; }
      if (this.rover.grounded && this.intro > 0) this.intro = 0;
    }
    if (input.hit('KeyL')) { this.rover.lights = !this.rover.lights; this.rover.model.setLights(this.rover.lights); audio.click(); }
    if (input.hit('KeyF') && !(this.intro > 0)) this.toggleEva();
    if (input.hit('KeyC')) { this.cam.mode = this.cam.mode === 'chase' ? 'orbit' : 'chase'; audio.click(); }
    if (input.hit('KeyH')) { this.showHelp = !this.showHelp; }
    if (input.hit('KeyG')) this.requestEnd();
    if (this.rover.lowPower && this.rover.lights) { this.rover.lights = false; this.rover.model.setLights(false); }

    // interaksiyon sırasında sürme
    const near = this.nearestSite();
    const interacting = near && inp.interact && this.canInteract(near);
    if (interacting) { inp.fwd = inp.back = inp.left = inp.right = 0; inp.jump = false; }
    this.rover.lowPower = this.lowPower;
    if (this.eva) {
      this.rover.update(dt, { fwd: 0, back: 0, left: 0, right: 0, boost: false, jump: false, interact: false });
      this.astro.update(dt, inp, this.evaCam.fwd);
      this.evaCam.update(dt, this.astro, input.mdx, input.mdy, input.wheel);
      this.o2 = Math.max(0, this.o2 - dt * (100 / 240));
      if (this.o2 <= 20 && !this.o2Warned) { this.o2Warned = true; audio.warn(); toast(__T('<b>OKSİJEN DÜŞÜK</b> GEZGİN\'e dön.'), 'bad', 5); }
      if (this.o2 <= 0) {
        this.eva = false; this.astro.group.visible = false; this.cam.first = true;
        this.window -= 30;
        toast(__T('<b>Oksijen bitti!</b> Ana uydu astronotu acil durum prosedürüyle GEZGİN\'e geri aldı (−30 sn).'), 'bad', 6);
      }
    } else {
      this.rover.update(dt, inp);
      this.cam.update(dt, this.rover, input.mdx, input.mdy, input.wheel);
      this.o2 = Math.min(100, this.o2 + dt * 25);
      if (this.o2 > 40) this.o2Warned = false;
    }

    if (this.rover.lastImpact > 3) {
      this.cam.shake = Math.min(1.2, this.rover.lastImpact * 0.12);
      audio.thump(Math.min(0.5, this.rover.lastImpact * 0.05));
      this.rover.lastImpact = 0;
    }
    if (this.eva) audio.engineOff(); else audio.engine(this.rover.speed, this.rover.throttle);
    audio.thrust(this.rover.thrusting);

    // Çevre: Güneş ve Dünya görünürlüğü
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 0.2;
      const A = this.actor;
      const o = new THREE.Vector3().copy(A.pos).addScaledVector(A.up, 0.8);
      this.sunlit = !this.ast.isOccluded(o, this.sky.sunDir);
      o.addScaledVector(A.up, 0.8);
      this.link = !this.ast.isOccluded(o, this.sky.earthDir);
      for (const s of this.sites) {
        const d = s.pos.distanceTo(this.camera.position);
        const dir = new THREE.Vector3().subVectors(s.pos, this.camera.position).normalize();
        s.occluded = d > 6 && this.ast.isOccluded(this.camera.position, dir, d - 3);
      }
    }

    // Enerji
    const gen = this.sunlit ? this.power.sun : this.power.night;
    let cons = 0.3 + this.rover.throttle * 1.15 * (inp.boost ? 1.7 : 1) + (this.rover.lights ? 0.45 : 0);
    if (interacting) cons += near.drain;
    this.genRate = gen; this.consRate = cons;
    this.battery = THREE.MathUtils.clamp(this.battery + (gen - cons) * dt, 0, this.batCap);
    if (this.battery <= 0.01 && !this.lowPower) {
      this.lowPower = true; audio.warn();
      toast(__T('<b>GÜÇ KRİTİK</b> Güvenli moda geçildi. Hız sınırlı, aletler kapalı. Güneşe çık ya da şarj olmasını bekle.'), 'bad', 6);
    }
    if (this.lowPower && this.battery > this.batCap * 0.15) { this.lowPower = false; toast(__T('Güç geri geldi. Sistemler normal.'), 'ok'); }

    // Veri iletimi
    if (this.link && this.buffer.length) {
      let budget = this.rate * dt;
      while (budget > 0 && this.buffer.length) {
        const pk = this.buffer[0];
        const take = Math.min(budget, pk.left);
        pk.left -= take; budget -= take; this.uploaded += take;
        if (pk.left <= 0.0001) { this.buffer.shift(); this.onUploaded(pk); }
      }
    }

    // Etkileşim
    this.handleInteraction(dt, near, interacting);

    // Kaçış kontrolü
    const L = this.rover.pos.length();
    if ((this.rover.energy > 0 && L > this.ast.R0 * 2.6) || L > this.ast.R0 * 6) this.rescue();

    this.animateSites(dt);
    this.setShadow(this.actor.pos, this.cam.mode === 'orbit' && !this.eva ? 110 : this.eva ? 25 : 45);

    // HUD
    this.updateLabels();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.1; this.updateHUD(near, interacting); }
    if (this.endConfirm > 0) this.endConfirm -= dt;
    // Tüm görevler bitip veriler iletildiyse otomatik olarak sonraki aşamaya geç
    if (this.allDone() && this.autoEnd === undefined) {
      this.autoEnd = 6;
      audio.chime();
      toast(__T`<b>Tüm yüzey görevleri tamamlandı!</b> ${this.cfg.methods.kinetik ? __T('Fırlatma üssüne') : __T('Saptırma aşamasına')} geçiliyor… (<kbd>G</kbd>: hemen geç)`, 'ok', 6);
    }
    if (this.autoEnd !== undefined) { this.autoEnd -= dt; if (this.autoEnd <= 0) this.finish('complete'); }
    if (this.window <= 0) this.finish('timeout');
  }

  nearestSite() {
    let best = null, bd = 5.2;
    for (const s of this.sites) {
      if (s.done) continue;
      const d = s.pos.distanceTo(this.actor.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // Görevler yalnızca araçtan inilip yürüyerek (EVA) yapılır
  canInteract(s) { const A = this.actor; return this.eva && A.grounded && A.speed < 2.2 && !this.lowPower; }

  handleInteraction(dt, near, interacting) {
    if (!near) return;
    if (interacting) {
      near.progress += dt / near.dur;
      this.scanTick = (this.scanTick || 0) - dt;
      if (this.scanTick <= 0) { this.scanTick = 0.12; audio.scanTick(); }
      if (near.progress >= 1) this.completeSite(near);
    }
  }

  completeSite(s) {
    s.done = true; s.progress = 1;
    audio.chime();
    s.ring.visible = false;
    s.beam.material.uniforms.color.value.set(0x6dffa8).multiplyScalar(1.5);
    s.beam.material.uniforms.opacity.value = 0.18;
    let obj = null;
    if (s.type === 'seismic') {
      obj = buildSensor();
      const pod = this.rover.model.seismicPods.find((p) => p.visible);
      if (pod) pod.visible = false;
    } else if (s.type === 'beacon') { obj = buildBeacon(); this.flags.beacon = true; }
    else if (s.type === 'spectro') obj = buildFlag(0x5fd8ff);
    else if (s.type === 'drill') obj = buildDrillSite();
    else if (s.type === 'anchor') { this.flags.anchor = true; this.anchorAnim = 0; }
    if (obj) {
      const p = this.eva ? this.astro.pos.clone().addScaledVector(this.astro.face, 1.2) : this.rover.pos.clone().addScaledVector(this.rover.right, -2.2);
      const d = p.clone().normalize();
      obj.position.copy(this.ast.surfacePoint(d, 0));
      obj.quaternion.setFromUnitVectors(Y, this.ast.normalAt(d, new THREE.Vector3()));
      this.objects.add(obj);
      s.deployed = obj;
    }
    this.pushData({ kind: s.type, mb: s.mb, name: s.name });
    const msgs = {
      spectro: __T`<b>${s.name}</b> tamamlandı. ${s.mb} MB spektrum verisi tampona alındı.`,
      seismic: __T`<b>${s.name}</b> yerleştirildi.`,
      drill: __T`<b>${s.name}</b> alındı. ${s.mb} MB analiz verisi.`,
      beacon: __T('<b>Hedef işaretçisi aktif!</b> Çarpıcı artık kütle merkezine hassas nişan alabilir.'),
      anchor: __T('<b>İyon itici kutba ankrajlandı!</b> Dönme ekseni boyunca kesintisiz itme mümkün.'),
    };
    toast(msgs[s.type], 'ok', 5);
    if (s.type === 'seismic' && this.sites.filter((x) => x.type === 'seismic').every((x) => x.done)) {
      this.pushData({ kind: 'seismicNet', mb: 45, name: __T('Aktif sismik deney') });
      toast(__T('<b>Sismik ağ tamamlandı.</b> Aktif sismik deney yapıldı: 45 MB veri. İç yapı sonucu için Dünya\'ya iletilmeli.'), 'info', 6);
    }
  }

  pushData(p) { this.buffer.push({ ...p, left: p.mb }); this.produced += p.mb; }

  onUploaded(pk) {
    const tr = this.truth;
    if (pk.kind === 'spectro') {
      this.uploadedKinds.spectro++;
      if (this.uploadedKinds.spectro >= this.sites.filter((s) => s.type === 'spectro').length && !this.densityKnown) {
        this.densityKnown = true; this.flags.massKnown = true; audio.chime();
        toast(__T`<b>ANALİZ: Yoğunluk ${fmt(tr.density / 1000, 2)} g/cm³</b><br>Asteroit kütlesi ≈ ${fmt(tr.mass / 1e9, 2)} milyar ton.`, 'science', 8);
      }
    } else if (pk.kind === 'seismicNet') {
      this.structureKnown = true; audio.chime();
      toast(__T`<b>ANALİZ: İç yapı ${ASTEROID.types[tr.kind].label.toUpperCase()}</b><br>Momentum katsayısı β ≈ ${fmt(tr.beta, 1)}.`, 'science', 8);
    } else if (pk.kind === 'drill') this.uploadedKinds.drill++;
  }

  allDone() {
    return this.tasks.every((t) => t.list.every((x) => x.done)) && this.buffer.length === 0 && this.produced > 0;
  }

  requestEnd() {
    if (this.endConfirm > 0 || this.allDone()) { this.finish(this.allDone() ? 'complete' : 'manual'); return; }
    this.endConfirm = 4;
    const open = this.tasks.filter((t) => t.list.some((s) => !s.done)).length;
    toast(__T`Yüzey görevini bitirmek için <b>4 sn içinde tekrar G</b>'ye bas.${open ? __T` (${open} görev eksik)` : ''}${this.buffer.length ? __T(' İletilmemiş veri var!') : ''}`, 'warn', 4);
  }

  rescue() {
    this.rescues++;
    if (this.eva) { this.eva = false; this.astro.group.visible = false; }
    this.window -= 60;
    audio.warn();
    toast(__T('<b>GEZGİN asteroitin yerçekiminden kaçtı!</b> Ana uydu aracı yakalayıp iniş bölgesine geri bıraktı (−60 sn).'), 'bad', 7);
    this.rover.place(LANDING_DIR, new THREE.Vector3(0, 1, 0));
    this.cam.first = true;
  }

  animateSites(dt) {
    const t = this.t;
    for (const s of this.sites) {
      if (!s.done) {
        s.beam.material.uniforms.opacity.value = 0.38 + 0.18 * Math.sin(t * 3 + s.i);
        s.ring.scale.setScalar(1 + 0.05 * Math.sin(t * 4 + s.i));
        s.ring.rotation.z += dt * 0.5;
      }
      if (s.deployed && s.deployed.userData.blink) s.deployed.userData.blink.visible = Math.sin(t * 6 + s.i) > 0;
    }
    if (this.tug && this.flags.anchor) {
      this.anchorAnim = Math.min(1, (this.anchorAnim || 0) + dt * 0.4);
      const site = this.sites.find((s) => s.type === 'anchor');
      const h = 14 * (1 - THREE.MathUtils.smoothstep(this.anchorAnim, 0, 1));
      this.tug.position.copy(site.pos).addScaledVector(site.normal, h);
    } else if (this.tug) {
      const site = this.sites.find((s) => s.type === 'anchor');
      this.tug.position.copy(site.pos).addScaledVector(site.normal, 14 + Math.sin(t) * 0.5);
    }
  }

  updateLabels() {
    const cam = this.camera, w = innerWidth, h = innerHeight;
    const v = new THREE.Vector3();
    for (const s of this.sites) {
      const el = s.el;
      if (s.done) { el.style.display = 'none'; continue; }
      v.copy(s.pos).addScaledVector(s.normal, 4).project(cam);
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const behind = v.z > 1;
      let edge = false;
      if (behind) { x = w - x; y = h - y; }
      const mx = 230, mt = 120, mb = 170;
      if (behind || x < mx || x > w - mx || y < mt || y > h - mb) {
        edge = true;
        const cx = w / 2, cy = (mt + h - mb) / 2, dx = x - cx, dy = y - cy;
        const hw = w / 2 - mx, hh = (h - mb - mt) / 2;
        const k = Math.min(hw / Math.abs(dx || 1e-3), hh / Math.abs(dy || 1e-3));
        if (behind || k < 1) { x = cx + dx * k; y = cy + dy * k; }
      }
      el.style.display = 'block';
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle('edge', edge);
      el.classList.toggle('occ', s.occluded && !edge);
      const dm = s.pos.distanceTo(this.actor.pos) * GAME.mPerUnit;
      s.distEl.textContent = dm > 1000 ? fmt(dm / 1000, 2) + ' km' : fmt(dm) + ' m';
    }
  }

  updateHUD(near, interacting) {
    const r = this.actor, rv = this.rover;
    $('clock').textContent = mmss(this.window);
    $('clock').classList.toggle('low', this.window < 90);
    $('dayState').innerHTML = this.sunlit ? __T('<span class="sun">☀</span> GÜNEŞ IŞIĞINDA') : __T('<span class="moon">☾</span> GÖLGEDE');
    const bp = this.battery / this.batCap;
    $('batFill').style.width = bp * 100 + '%';
    $('batFill').className = bp < 0.2 ? 'bad' : bp < 0.45 ? 'warn' : '';
    $('batTxt').textContent = Math.round(bp * 100) + '%';
    const net = this.genRate - this.consRate;
    $('powerTxt').innerHTML = __T`Üretim <b>${fmt(this.genRate, 1)}</b> · Tüketim <b>${fmt(this.consRate, 1)}</b> · <span class="${net >= 0 ? 'ok' : 'bad'}">${net >= 0 ? '+' : ''}${fmt(net, 1)}/sn</span>`;
    $('fuelFill').style.width = (rv.fuel / rv.fuelMax) * 100 + '%';
    $('fuelTxt').textContent = Math.round(rv.fuel);
    $('o2Row').style.display = this.eva || this.o2 < 100 ? '' : 'none';
    $('o2Fill').style.width = this.o2 + '%';
    $('o2Fill').className = this.o2 < 20 ? 'bad' : this.o2 < 45 ? 'warn' : '';
    $('o2Txt').textContent = Math.round(this.o2) + '%';
    $('linkTxt').innerHTML = this.link ? __T('<span class="ok">● DÜNYA BAĞLANTISI AKTİF</span>') : __T('<span class="bad">○ DÜNYA UFUK ALTINDA</span>');
    const buf = this.buffer.reduce((s, p) => s + p.left, 0);
    $('dataTxt').innerHTML = __T`Tampon <b>${fmt(buf)}</b> MB · İletilen <b>${fmt(this.uploaded)}</b> MB${buf > 0 && this.link ? __T` · <span class="ok">${this.rate} MB/sn ↑</span>` : ''}`;
    $('spdTxt').textContent = fmt(r.speed * GAME.mPerUnit, 1);
    $('altTxt').textContent = fmt(r.alt * GAME.mPerUnit, 1);
    const esc = Math.min(1, r.escRatio);
    $('escFill').style.width = esc * 100 + '%';
    $('escFill').className = esc > 0.85 ? 'bad' : esc > 0.65 ? 'warn' : '';
    $('escTxt').textContent = Math.round(r.escRatio * 100) + '%';
    $('modeTxt').textContent = this.eva ? (r.grounded ? __T('EVA · YÜRÜYÜŞ') : __T('EVA · SIÇRAMA')) : this.lowPower ? __T('GÜVENLİ MOD') : r.grounded ? __T('SÜRÜŞ') : (r.energy > 0 ? __T('KAÇIŞ YÖRÜNGESİ!') : __T('BALİSTİK UÇUŞ'));

    // görev listesi
    const ul = $('taskList');
    let html = '';
    for (const t of this.tasks) {
      const d = t.list.filter((s) => s.done).length, n = t.list.length;
      html += `<li class="${d === n ? 'done' : ''} ${t.critical ? 'crit' : ''}"><i></i>${t.label}<em>${d}/${n}</em></li>`;
    }
    html += __T`<li class="${this.buffer.length === 0 && this.produced > 0 ? 'done' : ''}"><i></i>Verileri Dünya'ya ilet<em>${fmt(this.uploaded)}/${fmt(this.produced)} MB</em></li>`;
    ul.innerHTML = html;
    const tr = this.truth;
    $('knowTxt').innerHTML =
      __T`Yoğunluk: <b>${this.densityKnown ? fmt(tr.density / 1000, 2) + ' g/cm³' : '?'}</b> · İç yapı: <b>${this.structureKnown ? ASTEROID.types[tr.kind].label : '?'}</b>`;

    // istem
    const pr = $('prompt');
    if (near) {
      pr.classList.add('show');
      let txt;
      if (this.lowPower) txt = __T('Güç yetersiz: aletler kapalı');
      else if (!this.eva) txt = __T`<kbd>F</kbd> araçtan in · ${near.verb} yürüyerek yapılır`;
      else if (!this.canInteract(near)) txt = __T`${near.verb}: dur ve yere in`;
      else txt = __T`<kbd>E</kbd> basılı tut: ${near.verb}`;
      $('promptTxt').innerHTML = txt;
      $('promptFill').style.width = near.progress * 100 + '%';
    } else if (this.eva && this.astro.pos.distanceTo(this.rover.pos) < 4.5) {
      pr.classList.add('show');
      $('promptTxt').innerHTML = __T('<kbd>F</kbd> GEZGİN\'e bin');
      $('promptFill').style.width = '0%';
    } else pr.classList.remove('show');

    // uyarılar
    let w = '';
    if (r.energy > 0 && !r.grounded) w = __T('KAÇIŞ HIZI AŞILDI: ASTEROİTTEN KOPUYORSUN!');
    else if (r.escRatio > 0.8) w = __T('KAÇIŞ HIZINA YAKLAŞIYORSUN');
    else if (this.eva && this.o2 < 20) w = __T('OKSİJEN DÜŞÜK: GEZGİN\'E DÖN');
    else if (this.lowPower) w = __T('GÜÇ KRİTİK: GÜVENLİ MOD');
    else if (bp < 0.2) w = __T('BATARYA DÜŞÜK');
    else if (this.window < 60) w = __T('GÖREV PENCERESİ KAPANIYOR');
    const we = $('warn');
    if (w !== this.warnState) { this.warnState = w; we.textContent = w; we.classList.toggle('show', !!w); if (w) audio.warn(); }
    if (this.t > 40 && !this._helpAuto) { this._helpAuto = true; this.showHelp = false; }
    $('controls').classList.toggle('show', this.showHelp);

    this.drawRadar();
  }

  drawRadar() {
    const c = this.radar, W = 180, R = 82, cx = 90, cy = 90;
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(6,14,26,0.72)'; c.beginPath(); c.arc(cx, cy, R + 6, 0, 7); c.fill();
    c.strokeStyle = 'rgba(111,211,255,0.25)'; c.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    const r = this.actor;
    const d = r.pos.clone().normalize();
    const f = r.fwdM, rt = r.right;
    const plot = (dir) => {
      const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(d), -1, 1));
      const t = dir.clone().addScaledVector(d, -dir.dot(d));
      const b = Math.atan2(-t.dot(rt), t.dot(f));
      const rr = (ang / Math.PI) * R;
      return [cx + Math.sin(b) * rr, cy - Math.cos(b) * rr, ang];
    };
    // Güneş ve Dünya yönleri (kenarda)
    for (const [dir, col, ch, vis] of [[this.sky.sunDir, '#ffd27a', '☀', this.sunlit], [this.sky.earthDir, '#6fb8ff', '●', this.link]]) {
      const t = dir.clone().addScaledVector(d, -dir.dot(d));
      const b = Math.atan2(-t.dot(rt), t.dot(f));
      c.globalAlpha = vis ? 1 : 0.35; c.fillStyle = col; c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ch, cx + Math.sin(b) * (R + 1), cy - Math.cos(b) * (R + 1));
    }
    c.globalAlpha = 1;
    for (const s of this.sites) {
      const [x, y] = plot(s.dir);
      c.fillStyle = s.done ? 'rgba(109,255,168,0.5)' : '#' + new THREE.Color(s.color).getHexString();
      c.beginPath(); c.arc(x, y, s.done ? 2.5 : 4, 0, 7); c.fill();
    }
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(cx, cy - 7); c.lineTo(cx + 5, cy + 5); c.lineTo(cx, cy + 2); c.lineTo(cx - 5, cy + 5); c.closePath(); c.fill();
  }

  finish(reason) {
    if (this.ended) return;
    this.ended = true;
    audio.silenceLoops();
    const beacon = this.sites.find((s) => s.type === 'beacon');
    const anchor = this.sites.find((s) => s.type === 'anchor');
    const total = this.tasks.reduce((s, t) => s + t.list.length, 0);
    const done = this.tasks.reduce((s, t) => s + t.list.filter((x) => x.done).length, 0);
    this.onEnd({
      reason, flags: { ...this.flags }, densityKnown: this.densityKnown, structureKnown: this.structureKnown,
      uploaded: this.uploaded, produced: this.produced, tasksDone: done, tasksTotal: total,
      drills: this.uploadedKinds.drill, rescues: this.rescues,
      beaconSite: beacon ? { pos: beacon.pos.clone(), normal: beacon.normal.clone(), done: beacon.done } : null,
      anchorSite: anchor ? { pos: anchor.pos.clone(), normal: anchor.normal.clone(), done: anchor.done } : null,
      skyAngle: this.skyAngle,
    });
  }

  dispose() {
    this.scene.remove(this.objects);
    this.labelsEl.innerHTML = '';
  }
}
