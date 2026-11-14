// Prosedürel asteroit: analitik yarıçap fonksiyonu (fizik ile birebir aynı yüzey),
// küp-küre ağı, kraterler, kayalar ve çakıllar.
import * as THREE from 'three';
import { makeNoise, mulberry32 } from './noise.js';
import { makeRegolithTextures } from './textures.js';

export function dirFromLatLon(latDeg, lonDeg, out = new THREE.Vector3()) {
  const la = THREE.MathUtils.degToRad(latDeg), lo = THREE.MathUtils.degToRad(lonDeg);
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
}

function randomDir(rand) {
  const u = rand() * 2 - 1, t = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
}

export function createAsteroid({ seed = 2026, R0 = 60, N = 144 } = {}) {
  const n1 = makeNoise(seed), n2 = makeNoise(seed * 3 + 7), n3 = makeNoise(seed * 7 + 13);
  const rand = mulberry32(seed + 99);

  // --- Kraterler ---
  const craters = [];
  const bigCrater = { c: new THREE.Vector3(0.55, -0.3, 0.78).normalize(), th: 0.6, depth: 0.075 };
  craters.push(bigCrater);
  craters.push({ c: new THREE.Vector3(-0.7, 0.2, -0.6).normalize(), th: 0.42, depth: 0.06 });
  for (let i = 0; i < 90; i++) {
    const th = 0.045 + 0.28 * Math.pow(rand(), 2.6);
    craters.push({ c: randomDir(rand), th, depth: th * (0.15 + 0.08 * rand()) });
  }
  for (const k of craters) { k.cos2 = Math.cos(Math.min(Math.PI, k.th * 2.2)); k.cx = k.c.x; k.cy = k.c.y; k.cz = k.c.z; }

  const info = { crater: 0, rim: 0, lump: 0 };

  function shapeN(x, y, z, withInfo) {
    const ex = 1.28, ey = 0.86, ez = 1.0;
    let r = 1 / Math.sqrt((x / ex) ** 2 + (y / ey) ** 2 + (z / ez) ** 2);
    let f = 0, amp = 1, fr = 0.9, norm = 0;
    for (let o = 0; o < 4; o++) { f += amp * n1(x * fr + 3.1, y * fr - 1.7, z * fr + 0.4); norm += amp; amp *= 0.5; fr *= 2.03; }
    const lump = f / norm;
    r *= 1 + 0.14 * lump;
    let g = 0; amp = 1; fr = 3.0; norm = 0;
    for (let o = 0; o < 3; o++) { g += amp * n2(x * fr, y * fr, z * fr); norm += amp; amp *= 0.5; fr *= 2.1; }
    r += 0.032 * g / norm;
    let rr = 0; amp = 1; fr = 8;
    for (let o = 0; o < 2; o++) { rr += amp * (1 - Math.abs(n3(x * fr, y * fr, z * fr))); amp *= 0.5; fr *= 2.1; }
    r += 0.007 * (rr / 1.5 - 0.6);
    let cr = 0, cfloor = 0, crim = 0;
    for (let i = 0; i < craters.length; i++) {
      const k = craters[i];
      const dt = x * k.cx + y * k.cy + z * k.cz;
      if (dt < k.cos2) continue;
      const a = Math.acos(dt > 1 ? 1 : dt);
      const q = a / k.th;
      if (q < 1) {
        cr += k.depth * (q * q - 1) + k.depth * 0.22 * q * q * q * q;
        const fl = 1 - q; if (fl > cfloor) cfloor = fl;
      } else {
        const e = (q - 1) * 2.6;
        const hh = 0.22 * Math.exp(-e * e);
        cr += k.depth * hh;
        if (hh > crim) crim = hh;
      }
    }
    r += cr;
    if (withInfo) { info.crater = cfloor; info.rim = crim; info.lump = lump; }
    return r;
  }

  function radiusAt(v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return R0 * shapeN(v.x / l, v.y / l, v.z / l, false);
  }

  const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _p0 = new THREE.Vector3(),
    _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _d = new THREE.Vector3();
  const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0);

  function normalAt(dir, out = new THREE.Vector3(), e = 0.004) {
    _d.copy(dir).normalize();
    _t1.crossVectors(_d, Math.abs(_d.y) < 0.9 ? AX_Y : AX_X).normalize();
    _t2.crossVectors(_d, _t1);
    _p0.copy(_d).multiplyScalar(radiusAt(_d));
    _p1.copy(_d).addScaledVector(_t1, e).normalize(); _p1.multiplyScalar(radiusAt(_p1));
    _p2.copy(_d).addScaledVector(_t2, e).normalize(); _p2.multiplyScalar(radiusAt(_p2));
    _p1.sub(_p0); _p2.sub(_p0);
    out.crossVectors(_p1, _p2).normalize();
    if (out.dot(_d) < 0) out.negate();
    return out;
  }

  function surfacePoint(dir, h = 0, out = new THREE.Vector3()) {
    out.copy(dir).normalize();
    return out.multiplyScalar(radiusAt(out) + h);
  }

  // --- Ağ (küp-küre) ---
  const tex = makeRegolithTextures(512, seed);
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const V = (N + 1) * (N + 1);
  const pos = new Float32Array(6 * V * 3), nor = new Float32Array(6 * V * 3), col = new Float32Array(6 * V * 3), uv = new Float32Array(6 * V * 2);
  const idx = new Uint32Array(6 * N * N * 6);
  const UVR = 9;
  let vi = 0, ii = 0;
  const dv = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let f = 0; f < 6; f++) {
    const [n, u, w] = faces[f];
    const base = vi;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const a = -1 + (2 * i) / N, b = -1 + (2 * j) / N;
        const cx = n[0] + u[0] * a + w[0] * b, cy = n[1] + u[1] * a + w[1] * b, cz = n[2] + u[2] * a + w[2] * b;
        const x2 = cx * cx, y2 = cy * cy, z2 = cz * cz;
        const sx = cx * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3);
        const sy = cy * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3);
        const sz = cz * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3);
        dv.set(sx, sy, sz).normalize();
        const r = R0 * shapeN(dv.x, dv.y, dv.z, true);
        const o = vi * 3;
        pos[o] = dv.x * r; pos[o + 1] = dv.y * r; pos[o + 2] = dv.z * r;
        normalAt(dv, nv);
        nor[o] = nv.x; nor[o + 1] = nv.y; nor[o + 2] = nv.z;
        // Renk: regolit, krater tabanları koyu, kenarlar açık
        const x = dv.x, y = dv.y, z = dv.z;
        let c = 0.17 + 0.05 * n2(x * 5 + 2, y * 5, z * 5) + 0.03 * info.lump;
        c *= 1 - Math.min(0.3, info.crater * 0.5);
        c += info.rim * 0.14;
        const br = n3(x * 2.2 + 5, y * 2.2, z * 2.2);
        if (br > 0.42) c += (br - 0.42) * 0.3;
        const slope = 1 - Math.max(0, nv.dot(dv));
        c += slope * 0.12;
        const tint = n1(x * 1.4 + 9, y * 1.4, z * 1.4) * 0.03;
        col[o] = c * 1.06 + tint; col[o + 1] = c * 0.99; col[o + 2] = c * 0.92 - tint;
        uv[vi * 2] = (i / N) * UVR; uv[vi * 2 + 1] = (j / N) * UVR;
        vi++;
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = base + j * (N + 1) + i, b2 = a + 1, c2 = a + (N + 1) + 1, d2 = a + (N + 1);
        idx[ii++] = a; idx[ii++] = b2; idx[ii++] = c2;
        idx[ii++] = a; idx[ii++] = c2; idx[ii++] = d2;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex.albedo, normalMap: tex.normal, normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.96, metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x5b544d, roughness: 0.92, metalness: 0, map: tex.albedo, normalMap: tex.normal,
  });

  function rockGeo(s) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const nz = makeNoise(s);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.3 * nz(x * 1.3, y * 1.3, z * 1.3) + 0.1 * nz(x * 3.1, y * 3.1, z * 3.1);
      p.setXYZ(i, x * k, y * k * 0.72, z * k);
    }
    g.computeVertexNormals();
    return g;
  }

  const colliders = [];
  const decor = new THREE.Group();
  group.add(decor);

  function addBoulders(exclude = [], count = 280) {
    const r = mulberry32(seed + 5);
    const geos = [rockGeo(seed + 1), rockGeo(seed + 2), rockGeo(seed + 3)];
    const lists = [[], [], []];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const d = randomDir(r);
      const sc = 0.3 + 2.8 * Math.pow(r(), 3.2);
      let bad = false;
      for (const ex of exclude) if (d.angleTo(ex) * R0 < 7 + sc) { bad = true; break; }
      if (bad) continue;
      const rad = radiusAt(d);
      p.copy(d).multiplyScalar(rad + sc * 0.2);
      e.set(r() * 6.28, r() * 6.28, r() * 6.28); q.setFromEuler(e);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      lists[i % 3].push(m.clone());
      if (sc > 0.45) colliders.push({ p: p.clone(), r: sc * 0.85 });
    }
    lists.forEach((list, k) => {
      const im = new THREE.InstancedMesh(geos[k], rockMat, list.length);
      list.forEach((mm, j) => im.setMatrixAt(j, mm));
      im.castShadow = true; im.receiveShadow = true;
      decor.add(im);
    });
    // Çakıllar
    const pg = new THREE.DodecahedronGeometry(1, 0);
    const PC = 5000;
    const pim = new THREE.InstancedMesh(pg, rockMat, PC);
    for (let i = 0; i < PC; i++) {
      const d = randomDir(r);
      const sc = 0.05 + 0.2 * r() * r();
      p.copy(d).multiplyScalar(radiusAt(d) + sc * 0.3);
      e.set(r() * 6.28, r() * 6.28, r() * 6.28); q.setFromEuler(e);
      s.set(sc, sc * 0.7, sc);
      m.compose(p, q, s);
      pim.setMatrixAt(i, m);
    }
    pim.receiveShadow = true;
    decor.add(pim);
  }

  const _o = new THREE.Vector3();
  function isOccluded(origin, dir, maxDist = 500) {
    let t = 0.4;
    for (let i = 0; i < 90; i++) {
      _o.copy(origin).addScaledVector(dir, t);
      const L = _o.length();
      if (L > R0 * 1.5 && _o.dot(dir) > 0) return false;
      const h = L - radiusAt(_o);
      if (h < 0) return true;
      t += Math.max(0.5, h * 0.7);
      if (t > maxDist) return false;
    }
    return false;
  }

  return { group, mesh, R0, radiusAt, normalAt, surfacePoint, isOccluded, addBoulders, colliders, craters, bigCrater, material };
}
