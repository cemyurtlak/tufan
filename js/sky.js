// Gökyüzü: Samanyolu, yıldızlar, Güneş, Dünya (NASA Blue Marble dokusu) ve Ay.
// Asteroitin dönüşü, gökyüzü grubunun ters yönde döndürülmesiyle taklit edilir.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { makeGlowTexture } from './textures.js';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
varying vec3 vDir;
uniform vec3 galN; uniform vec3 galC;
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float lat = dot(d, galN);
  float band = exp(-lat*lat*14.0);
  float core = pow(max(dot(d, galC), 0.0), 6.0);
  float n = fbm(d*3.5)*0.7 + fbm(d*9.0)*0.3;
  float dust = smoothstep(0.42, 0.72, fbm(d*6.0 + 3.0));
  vec3 cool = vec3(0.55, 0.62, 0.85), warm = vec3(1.0, 0.78, 0.55);
  vec3 col = mix(cool, warm, clamp(core*2.0 + 0.2, 0.0, 1.0)) * band * (0.25 + n) * (1.0 - 0.75*dust*band);
  col += warm * core * band * 0.9 * (1.0 - 0.6*dust);
  col += vec3(0.35,0.12,0.4) * pow(fbm(d*2.2+7.0), 3.0) * 0.25;
  col += vec3(0.08,0.2,0.35) * pow(fbm(d*1.7-4.0), 4.0) * 0.25;
  gl_FragColor = vec4(col * 0.05, 1.0);
}`;

const STAR_VS = `
attribute float size; attribute vec3 scolor; attribute float tw;
uniform float time; uniform float pr;
varying vec3 vC;
void main(){ vC = scolor * (0.88 + 0.12*sin(time*(1.0+tw*3.0) + tw*80.0));
  vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * pr; gl_Position = projectionMatrix * mv; }`;
const STAR_FS = `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); a*=a; gl_FragColor = vec4(vC*a, a); }`;

const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FS = `
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  float d = dot(n, sunDir);
  float day = smoothstep(-0.12, 0.2, d);
  vec3 dayC = texture2D(dayMap, vUv).rgb * (max(d, 0.0) * 1.7 + 0.02);
  vec3 nightC = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.75, 0.45) * 2.2;
  vec3 col = dayC + nightC * (1.0 - day);
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += vec3(0.3, 0.6, 1.0) * fres * smoothstep(-0.3, 0.4, d) * 1.2;
  gl_FragColor = vec4(col, 1.0);
}`;
const ATM_VS = `varying vec3 vNv; varying vec3 vPv; varying vec3 vNw;
void main(){ vNv = normalize(normalMatrix*normal); vNw = normalize(mat3(modelMatrix)*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vPv = mv.xyz; gl_Position = projectionMatrix*mv; }`;
const ATM_FS = `uniform vec3 sunDir; varying vec3 vNv; varying vec3 vPv; varying vec3 vNw;
void main(){ float k = dot(normalize(vNv), normalize(vPv)); float i = pow(clamp(k/0.45, 0.0, 1.0), 2.5);
  float lit = smoothstep(-0.35, 0.5, dot(vNw, sunDir));
  gl_FragColor = vec4(vec3(0.3,0.6,1.0) * i * (0.08 + lit) * 1.6, 1.0); }`;

export function createSky(renderer, assetBase = 'assets/textures/') {
  const group = new THREE.Group();
  const rand = mulberry32(42);
  const galN = new THREE.Vector3(0.25, 0.85, -0.46).normalize();
  const galC = new THREE.Vector3().crossVectors(galN, new THREE.Vector3(1, 0, 0)).normalize();

  // Arka plan
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { galN: { value: galN }, galC: { value: galC } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 32), skyMat);
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // Yıldızlar
  const NS = 14000;
  const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), ss = new Float32Array(NS), st = new Float32Array(NS);
  const palette = [[0.62, 0.72, 1.0], [0.8, 0.86, 1.0], [1, 1, 1], [1, 0.95, 0.85], [1, 0.85, 0.65], [1, 0.7, 0.5]];
  const tmp = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3();
  tb.crossVectors(galN, galC);
  for (let i = 0; i < NS; i++) {
    let d;
    if (i < NS * 0.45) {
      const a = rand() * Math.PI * 2;
      const lat = (rand() + rand() + rand() - 1.5) * 0.16;
      d = tmp.copy(galC).multiplyScalar(Math.cos(a)).addScaledVector(tb, Math.sin(a)).multiplyScalar(Math.cos(lat)).addScaledVector(galN, Math.sin(lat)).normalize();
    } else {
      const u = rand() * 2 - 1, t = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      d = tmp.set(s * Math.cos(t), u, s * Math.sin(t));
    }
    sp[i * 3] = d.x * 4500; sp[i * 3 + 1] = d.y * 4500; sp[i * 3 + 2] = d.z * 4500;
    const m = Math.pow(rand(), 7);
    const c = palette[Math.floor(rand() * palette.length)];
    const b = 0.25 + m * 3.2;
    sc[i * 3] = c[0] * b; sc[i * 3 + 1] = c[1] * b; sc[i * 3 + 2] = c[2] * b;
    ss[i] = 1.2 + m * 3.6;
    st[i] = rand();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('scolor', new THREE.BufferAttribute(sc, 3));
  sg.setAttribute('size', new THREE.BufferAttribute(ss, 1));
  sg.setAttribute('tw', new THREE.BufferAttribute(st, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pr: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  group.add(stars);

  // Güneş
  const sunDir0 = new THREE.Vector3(0.86, 0.33, 0.12).normalize();
  const glow = makeGlowTexture(256, 2.4);
  const glowSoft = makeGlowTexture(256, 4.0);
  const sun = new THREE.Group();
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(40, 34, 26), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunCore.scale.setScalar(110);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSoft, color: new THREE.Color(2.2, 1.8, 1.3), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunHalo.scale.setScalar(1300);
  sun.add(sunHalo, sunCore);
  sun.position.copy(sunDir0).multiplyScalar(3800);
  group.add(sun);

  // Dünya
  const loader = new THREE.TextureLoader();
  const loadTex = (f, srgb = true) => {
    const t = loader.load((window.__TEX && window.__TEX[f]) || assetBase + f);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const earthDir0 = new THREE.Vector3(-0.42, 0.2, 0.88).normalize();
  const earth = new THREE.Group();
  const sunDirU = { value: sunDir0.clone() };
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: loadTex('earth_atmos_2048.jpg') }, nightMap: { value: loadTex('earth_lights_2048.png') }, sunDir: sunDirU },
    vertexShader: EARTH_VS, fragmentShader: EARTH_FS,
  });
  const ER = 34;
  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(ER, 64, 48), earthMat);
  earthMesh.rotation.z = 0.41;
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.012, 64, 48), new THREE.MeshLambertMaterial({
    map: loadTex('earth_clouds_1024.png'), transparent: true, depthWrite: false, opacity: 0.9,
  }));
  clouds.rotation.z = 0.41;
  const atm = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.12, 64, 48), new THREE.ShaderMaterial({
    uniforms: { sunDir: sunDirU }, vertexShader: ATM_VS, fragmentShader: ATM_FS,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  earth.add(earthMesh, clouds, atm);
  earth.position.copy(earthDir0).multiplyScalar(1700);
  group.add(earth);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 32), new THREE.MeshStandardMaterial({ map: loadTex('moon_1024.jpg'), roughness: 1 }));
  moon.position.copy(earth.position).add(new THREE.Vector3(80, 14, -40));
  group.add(moon);

  const sunDir = new THREE.Vector3(), earthDir = new THREE.Vector3();
  let time = 0;

  function update(dt, angle) {
    time += dt;
    starMat.uniforms.time.value = time;
    group.rotation.y = angle;
    group.updateMatrixWorld();
    sunDir.copy(sunDir0).applyQuaternion(group.quaternion);
    earthDir.copy(earthDir0).applyQuaternion(group.quaternion);
    sunDirU.value.copy(sunDir);
    earthMesh.rotation.y += dt * 0.02;
    clouds.rotation.y += dt * 0.026;
  }
  update(0, 0);

  function earthWorldPos(out = new THREE.Vector3()) { return earth.getWorldPosition(out); }

  return { group, update, sunDir, earthDir, earth, sun, moon, earthWorldPos };
}
