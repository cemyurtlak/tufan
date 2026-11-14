// Genel amaçlı CPU parçacık sistemi (duman, toz, alev, ejekta)
import * as THREE from 'three';

const VS = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
uniform float scale;
varying float vA;
varying vec3 vC;
void main() {
  vA = alpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * scale / max(-mv.z, 0.1), 0.0, 400.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D map;
varying float vA;
varying vec3 vC;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = t.a * vA;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vC * t.rgb, a);
}`;

export class Particles {
  constructor(max, { texture, additive = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alp = new Float32Array(max);
    this.siz = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 500 } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.geometry = g;
    this.gravity = new THREE.Vector3();
    this.radialGravity = 0; // >0 ise merkeze doğru çekim (asteroit)
  }

  setScale(h) { this.material.uniforms.scale.value = h * 0.5; }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a = 1, drag = 0, r2 = r, g2 = g, b2 = b, grav = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.drag[i] = drag;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r2; this.c1[i3 + 1] = g2; this.c1[i3 + 2] = b2;
    this.grav[i] = grav;
  }

  update(dt, ground = null) {
    const gx = this.gravity.x * dt, gy = this.gravity.y * dt, gz = this.gravity.z * dt;
    const rg = this.radialGravity;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alp[i] = 0; this.siz[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      const gm = this.grav[i];
      let vx = this.vel[i3] * k + gx * gm, vy = this.vel[i3 + 1] * k + gy * gm, vz = this.vel[i3 + 2] * k + gz * gm;
      if (rg > 0) {
        const px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
        const r2 = px * px + py * py + pz * pz, r = Math.sqrt(r2);
        const a = rg / r2 * dt * gm;
        vx -= px / r * a; vy -= py / r * a; vz -= pz / r * a;
      }
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt; this.pos[i3 + 1] += vy * dt; this.pos[i3 + 2] += vz * dt;
      if (ground) ground(this.pos, this.vel, i3);
      const t = 1 - this.life[i] / this.maxLife[i];
      this.siz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = Math.min(1, t * 12);
      this.alp[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true; a.pcolor.needsUpdate = true; a.alpha.needsUpdate = true; a.size.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
