// GEZGİN keşif aracının fiziği ve takip kamerası.
// Yerçekimi asteroit merkezine doğrudur ve 1/r² ile azalır. Yeterince hızlı gidersen
// düşük yerçekimi seni havaya kaldırır; kaçış hızını geçersen asteroitten kopar gidersin.
import * as THREE from 'three';
import { buildRover } from './models.js';
import { GAME } from './data.js';
import { opt } from './physics.js';

const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _vt = new THREE.Vector3(),
  _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(),
  _e = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Vector3();

export class Rover {
  constructor(scene, ast, rcfg, dust) {
    this.ast = ast;
    this.rcfg = rcfg;
    this.model = buildRover(rcfg);
    scene.add(this.model.group);
    this.dust = dust;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, 1);  // yüzeye teğet ileri yön
    this.up = new THREE.Vector3(0, 1, 0);   // gövde yukarı (yumuşatılmış)
    this.fwdM = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.mu = GAME.g0 * ast.R0 * ast.R0;
    this.rideH = 0.87;
    this.grounded = false;
    this.fuelMax = opt('fuel', rcfg.fuel).amount;
    this.fuel = this.fuelMax;
    this.lights = false;
    this.thrusting = false;
    this.throttle = 0;
    this.speed = 0;
    this.alt = 0;
    this.escRatio = 0;
    this.energy = -1;
    this.lowPower = false;
    this.lastImpact = 0;
    this.dustAcc = 0;
  }

  place(dir, headingHint) {
    _d.copy(dir).normalize();
    const r = this.ast.radiusAt(_d);
    this.pos.copy(_d).multiplyScalar(r + this.rideH + 0.05);
    this.vel.set(0, 0, 0);
    this.ast.normalAt(_d, this.up);
    this.fwd.copy(headingHint || new THREE.Vector3(0, 1, 0));
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up));
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
    this.fwd.normalize();
    this.fwdM.copy(this.fwd);
    this.grounded = true;
    this.syncModel(0);
  }

  update(dt, inp) {
    const sub = 3, h = dt / sub;
    this.thrusting = false;
    for (let i = 0; i < sub; i++) this.step(h, inp);
    // istatistikler
    const len = this.pos.length();
    _d.copy(this.pos).divideScalar(len);
    this.alt = Math.max(0, len - this.ast.radiusAt(_d) - this.rideH);
    this.speed = this.vel.length();
    const vesc = Math.sqrt((2 * this.mu) / len);
    this.escRatio = this.speed / vesc;
    this.energy = 0.5 * this.speed * this.speed - this.mu / len;
    this.syncModel(dt);
    this.emitDust(dt);
  }

  step(h, inp) {
    const ast = this.ast, p = this.pos, v = this.vel;
    const len = p.length();
    _d.copy(p).divideScalar(len);
    const g = this.mu / (len * len);
    const rs = ast.radiusAt(_d);
    const height = len - rs - this.rideH;
    const onGround = height < 0.35;
    const n = ast.normalAt(_d, _n);
    const ref = onGround ? n : this.up;
    this.fwd.addScaledVector(ref, -this.fwd.dot(ref)).normalize();
    const right = _r.crossVectors(ref, this.fwd);

    const thr = this.lowPower ? (inp.fwd - inp.back) * 0.35 : inp.fwd - inp.back;
    const steer = inp.right - inp.left;
    this.throttle = Math.abs(thr);
    const boost = inp.boost && !this.lowPower;

    if (onGround) {
      const vn = v.dot(n);
      _vt.copy(v).addScaledVector(n, -vn);
      let vf = _vt.dot(this.fwd), vr = _vt.dot(right);
      const maxS = (boost ? 12.5 : 8) * (this.lowPower ? 0.3 : 1);
      if (thr !== 0) {
        if (Math.sign(thr) !== Math.sign(vf) && Math.abs(vf) > 0.3) vf += thr * 16 * h;
        else vf += thr * (boost ? 9 : 6) * h;
        if (vf > maxS) vf = Math.max(maxS, vf - 20 * h);
        if (vf < -4) vf = -4;
      } else {
        vf *= Math.exp(-1.8 * h);
      }
      vr *= Math.exp(-7 * h);
      v.copy(n).multiplyScalar(vn).addScaledVector(this.fwd, vf).addScaledVector(right, vr);
      const turn = steer * 1.7 * h * (vf < -0.2 ? -1 : 1);
      _q.setFromAxisAngle(n, -turn);
      this.fwd.applyQuaternion(_q);
    } else {
      // Havada: küçük RCS kontrolü (yakıt harcar)
      if ((thr !== 0 || steer !== 0) && this.fuel > 0) {
        v.addScaledVector(this.fwd, thr * 1.4 * h);
        this.fuel = Math.max(0, this.fuel - 1.0 * h);
      }
      _q.setFromAxisAngle(this.up, -steer * 1.4 * h);
      this.fwd.applyQuaternion(_q);
    }

    v.addScaledVector(_d, -g * h);
    // Tutunma: tekerlekler zemine yakınken küçük tümseklerde havalanmayı azaltır
    if (!inp.jump && height < 1.0 && height > 0.02) {
      const vn = v.dot(n);
      if (vn > -3) v.addScaledVector(n, -g * 1.6 * h);
    }

    if (inp.jump && this.fuel > 0) {
      v.addScaledVector(onGround ? n : this.up, 4.8 * h);
      this.fuel = Math.max(0, this.fuel - 10 * h);
      this.thrusting = true;
    }

    p.addScaledVector(v, h);

    // Zemin çarpışması
    const len2 = p.length();
    _d.copy(p).divideScalar(len2);
    const minR = ast.radiusAt(_d) + this.rideH;
    if (len2 < minR) {
      p.copy(_d).multiplyScalar(minR);
      const n2 = ast.normalAt(_d, _n);
      const vn2 = v.dot(n2);
      if (vn2 < 0) {
        const imp = -vn2;
        v.addScaledVector(n2, -vn2 * (1 + (imp > 2.5 ? 0.22 : 0)));
        if (imp > 3) this.lastImpact = Math.max(this.lastImpact, imp);
      }
    }
    this.grounded = len2 - minR < 0.35;

    // Kayalar
    for (const c of ast.colliders) {
      _a.subVectors(p, c.p);
      const d2 = _a.lengthSq();
      const minD = c.r + 1.25;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 0.001;
        _a.divideScalar(d);
        p.addScaledVector(_a, minD - d);
        const vn = v.dot(_a);
        if (vn < 0) {
          v.addScaledVector(_a, -vn * 1.35);
          if (-vn > 2) this.lastImpact = Math.max(this.lastImpact, -vn);
        }
      }
    }
  }

  syncModel(dt) {
    const ast = this.ast, p = this.pos;
    _d.copy(p).normalize();
    // gövde yönelimi: dört köşedeki zemin noktalarından düzlem
    if (this.grounded) {
      const f = this.fwd, r = _r.crossVectors(this.up, f).normalize();
      const s = (fx, rx, out) => {
        out.copy(p).addScaledVector(f, fx).addScaledVector(r, rx).normalize();
        return out.multiplyScalar(ast.radiusAt(out));
      };
      s(1.1, 0.95, _a); s(-1.1, -0.95, _b); s(1.1, -0.95, _c); s(-1.1, 0.95, _e);
      _a.sub(_b); _c.sub(_e);
      _f.crossVectors(_c, _a).normalize();
      if (_f.dot(_d) < 0) _f.negate();
      this.up.lerp(_f, dt > 0 ? 1 - Math.exp(-14 * dt) : 1).normalize();
    } else {
      this.up.lerp(_d, 1 - Math.exp(-1.2 * dt)).normalize();
    }
    this.fwdM.copy(this.fwd).addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
    this.right.crossVectors(this.up, this.fwdM).normalize();
    _m.makeBasis(this.right, this.up, this.fwdM);
    const g = this.model.group;
    g.quaternion.setFromRotationMatrix(_m);
    g.position.copy(p);

    // Süspansiyon + tekerlek dönüşü
    const vf = this.vel.dot(this.fwdM);
    for (const w of this.model.wheels) {
      _w.copy(p).addScaledVector(this.right, w.x).addScaledVector(this.up, w.rest).addScaledVector(this.fwdM, w.z);
      const L = _w.length();
      _a.copy(_w).divideScalar(L);
      const ground = ast.radiusAt(_a);
      const clearance = L - ground - 0.42;
      const target = this.grounded ? THREE.MathUtils.clamp(-clearance, -0.3, 0.3) : -0.25;
      w.off += (target - w.off) * (dt > 0 ? 1 - Math.exp(-18 * dt) : 1);
      w.holder.position.y = w.rest + w.off;
      w.spin.rotation.x += (vf * dt) / 0.42;
    }
    const fl = this.thrusting;
    const flick = 0.75 + Math.random() * 0.5;
    for (const f of this.model.flames) { f.visible = fl; f.scale.set(1, flick, 1); }
    this.model.thrustLight.intensity = fl ? 40 * flick : 0;
  }

  emitDust(dt) {
    if (!this.dust || !this.grounded) return;
    const spd = Math.abs(this.vel.dot(this.fwdM));
    const rate = spd > 0.8 ? spd * 9 : 0;
    const thr = this.thrusting ? 90 : 0;
    this.dustAcc += (rate + thr) * dt;
    while (this.dustAcc > 1) {
      this.dustAcc -= 1;
      const w = this.model.wheels[Math.floor(Math.random() * 6)];
      _w.copy(this.pos).addScaledVector(this.right, w.x).addScaledVector(this.up, -0.8).addScaledVector(this.fwdM, w.z);
      const up = 1.2 + Math.random() * 2.2 + (this.thrusting ? 2 : 0);
      const back = -spd * (0.2 + Math.random() * 0.3);
      const side = (Math.random() - 0.5) * 2;
      const vx = this.up.x * up + this.fwdM.x * back + this.right.x * side;
      const vy = this.up.y * up + this.fwdM.y * back + this.right.y * side;
      const vz = this.up.z * up + this.fwdM.z * back + this.right.z * side;
      const c = 0.5 + Math.random() * 0.2;
      this.dust.emit(_w.x, _w.y, _w.z, vx, vy, vz, 2.5 + Math.random() * 2, 0.5, 2.2 + Math.random() * 1.5, c, c * 0.95, c * 0.88, 0.5, 0.05);
    }
  }
}

// Araç takip kamerası (yüzey yukarı yönüne hizalı)
export class ChaseCam {
  constructor(camera, ast) {
    this.camera = camera; this.ast = ast;
    this.yaw = 0; this.pitch = 0.32; this.dist = 11; this.mode = 'chase';
    this.up = new THREE.Vector3(0, 1, 0);
    this.target = new THREE.Vector3();
    this.idle = 0;
    this.shake = 0;
    this.camPos = new THREE.Vector3();
    this.first = true;
  }
  update(dt, rover, mdx, mdy, wheel) {
    if (Math.abs(mdx) + Math.abs(mdy) > 0) this.idle = 0; else this.idle += dt;
    this.yaw -= mdx * 0.0028;
    this.pitch = THREE.MathUtils.clamp(this.pitch + mdy * 0.0024, 0.08, 1.4);
    if (wheel) this.dist = THREE.MathUtils.clamp(this.dist * (wheel > 0 ? 1.12 : 0.89), 8, 45);
    if (this.idle > 2.0 && rover.speed > 1.5 && this.mode === 'chase') this.yaw *= Math.exp(-1.2 * dt);
    const dist = this.mode === 'orbit' ? 95 : this.dist;
    const pitch = this.mode === 'orbit' ? 1.05 : this.pitch;
    this.up.lerp(rover.up, this.first ? 1 : 1 - Math.exp(-3.5 * dt)).normalize();
    const up = this.up;
    _f.copy(rover.fwdM).addScaledVector(up, -rover.fwdM.dot(up)).normalize();
    _r.crossVectors(up, _f);
    _a.copy(_f).multiplyScalar(-Math.cos(this.yaw)).addScaledVector(_r, -Math.sin(this.yaw));
    this.target.copy(rover.pos).addScaledVector(up, 1.6);
    _b.copy(this.target).addScaledVector(_a, Math.cos(pitch) * dist).addScaledVector(up, Math.sin(pitch) * dist);
    _c.copy(_b).normalize();
    const minR = this.ast.radiusAt(_c) + 0.9;
    if (_b.length() < minR) _b.copy(_c).multiplyScalar(minR);
    // Kamera araç gövdesinin içine girmesin (gölgede gövde ekranı siyaha boğuyordu)
    _c.subVectors(_b, rover.pos);
    if (_c.length() < 6) _b.copy(rover.pos).addScaledVector(_c.normalize(), 6);
    if (this.first) { this.camPos.copy(_b); this.first = false; }
    else this.camPos.lerp(_b, 1 - Math.exp(-9 * dt));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.up.copy(up);
    this.camera.lookAt(this.target);
  }
}
