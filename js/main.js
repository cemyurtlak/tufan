// TUFAN — Gezegen Savunma Görevi · ana döngü ve aşama yönetimi
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAsteroid } from './asteroid.js';
import { createSky } from './sky.js';
import { Particles } from './particles.js';
import { makeSmokeTexture } from './textures.js';
import { SurfaceMission, siteDirs, LANDING_DIR } from './surface.js';
import { LaunchSequence } from './launch.js';
import { Arrival, FinalSequence } from './cinematics.js';
import { BaseScene, preloadCharacter } from './base.js';
import { PilotPhase } from './pilot.js';
import { dirFromLatLon } from './asteroid.js';
import { DesignScreen } from './design.js';
import { renderResult } from './result.js';
import { DEFAULT_CONFIG, ASTEROID, GAME, fmt, T_IMPACT } from './data.js';
import { makeTruth, deflect, launcherOf } from './physics.js';
import { input, initInput } from './input.js';
import { audio } from './audio.js';
import { $, show, showAlso, fade, caption, toast } from './ui.js';

const params = new URLSearchParams(location.search);
const TEST = params.get('test');

// ---------- Görüntü ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;
initInput(canvas);

const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 12000);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.85);
composer.addPass(renderPass);
// Geçersiz (NaN/sonsuz) ve aşırı parlak pikselleri temizle. Yoksa bloom bunları yayıp
// ekranda büyük siyah dikdörtgenler oluşturuyor.
const sanitize = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    float fix(float v){ return (isnan(v) || isinf(v)) ? 0.0 : clamp(v, 0.0, 40.0); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(fix(c.r), fix(c.g), fix(c.b), 1.0); }`,
});
composer.addPass(sanitize);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- Dünya ----------
let ast, sky, dust;
const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);
const earthLight = new THREE.DirectionalLight(0x6f9cff, 0.25);
scene.add(earthLight, earthLight.target);
scene.add(new THREE.AmbientLight(0x8090b0, 0.09));

function setShadow(center, half) {
  sunLight.target.position.copy(center);
  sunLight.position.copy(center).addScaledVector(sky.sunDir, 250);
  const c = sunLight.shadow.camera;
  if (c.right !== half) {
    c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 600;
    c.updateProjectionMatrix();
  }
  earthLight.position.copy(sky.earthDir).multiplyScalar(200);
}

// ---------- Durum ----------
const state = { phase: 'loading', cfg: structuredClone(DEFAULT_CONFIG), truth: makeTruth(), paused: false, menuAngle: 0, skyAngle: 0 };
let launch = null, arrival = null, surface = null, final = null, design = null, base = null, pilot = null;
let surfaceRes = null, outcome = null;
window.__game = state;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function load() {
  const setP = (p, t) => { $('loadFill').style.width = p + '%'; $('loadText').textContent = t; };
  setP(10, 'Asteroit yüzeyi oluşturuluyor…'); await nextFrame();
  ast = createAsteroid();
  scene.add(ast.group);
  setP(55, 'Kayalar ve kraterler yerleştiriliyor…'); await nextFrame();
  const all = { ...DEFAULT_CONFIG, methods: { kinetik: true, iyon: true, traktor: true }, rover: { ...DEFAULT_CONFIG.rover, instruments: { spektrometre: true, sismometre: true, matkap: true } } };
  ast.addBoulders([LANDING_DIR, ...siteDirs(all, ast).map((s) => s.dir)]);
  setP(75, 'Gökyüzü ve Dünya hazırlanıyor (NASA Blue Marble)…'); await nextFrame();
  sky = createSky(renderer);
  scene.add(sky.group);
  dust = new Particles(2500, { texture: makeSmokeTexture(64, 4) });
  dust.radialGravity = GAME.g0 * ast.R0 * ast.R0;
  dust.setScale(innerHeight);
  scene.add(dust.points);
  setP(88, 'Karakter modeli yükleniyor…'); await nextFrame();
  await preloadCharacter();
  setP(95, 'Shader\'lar derleniyor…'); await nextFrame();
  setShadow(new THREE.Vector3(), 95);
  renderer.compile(scene, camera);
  setP(100, 'Hazır'); await nextFrame();
  if (TEST) runTest(TEST); else goMenu();
  requestAnimationFrame(loop);
}

// ---------- Aşamalar ----------
state.gen = 0;
const GAMEPLAY = ['surface', 'base', 'pilot'];

// Her şeyi temizle (bölüm atlarken kullanılır)
function cleanupAll() {
  state.gen++;
  for (const o of [launch, arrival, surface, final, base, pilot]) { try { if (o) { o.ended = true; o.dispose(); } } catch (e) { console.warn(e); } }
  launch = arrival = surface = final = base = pilot = null;
  if (dust) dust.clear();
  audio.silenceLoops();
  state.unlockOk = true;
  if (document.pointerLockElement) document.exitPointerLock();
  state.paused = false; showAlso('pause', false);
  state.chapterOpen = false; $('chapters').classList.remove('show');
  caption('', '');
  bloom.strength = 0.55;
  const f = $('fade'); f.style.transition = 'none'; f.style.opacity = 0;
}

// Bölüm atlamak için örnek yüzey sonucu (tüm görevler başarılı)
function demoRes() {
  const bd = dirFromLatLon(-6, 128), pd = dirFromLatLon(87, 30);
  return {
    reason: 'demo', flags: { beacon: true, anchor: true, massKnown: true }, densityKnown: true, structureKnown: true,
    uploaded: 244, produced: 244, tasksDone: 7, tasksTotal: 7, drills: 0, rescues: 0,
    beaconSite: { pos: ast.surfacePoint(bd), normal: ast.normalAt(bd, new THREE.Vector3()), done: true },
    anchorSite: { pos: ast.surfacePoint(pd), normal: ast.normalAt(pd, new THREE.Vector3()), done: true },
    skyAngle: 0,
  };
}

function goMenu() {
  cleanupAll();
  state.phase = 'menu';
  state.truth = makeTruth();
  state.cfg = structuredClone(DEFAULT_CONFIG);
  show('menu');
  audio.ambient(1);
}

function goBrief() {
  state.phase = 'brief';
  show('brief');
  const lines = [
    `<b>14 Mart 2026</b> · Vera C. Rubin Gözlemevi yeni bir Dünya'ya yakın asteroit keşfetti: <b>${ASTEROID.name}</b>.`,
    `Çap: <b>${ASTEROID.diameter} m</b> · Dönme periyodu: <b>${fmt(ASTEROID.rotationHours, 1)} saat</b> · Çarpma hızı: <b>17 km/s</b>.`,
    `Yörünge ölçümleri <b>${ASTEROID.impactDate}</b> için <b>%99,7 çarpma olasılığı</b> gösteriyor. Açığa çıkacak enerji ≈ <b>125 megaton TNT</b>: bir metropolü yok etmeye yeter.`,
    `Yer teleskopları asteroitin <b>%${Math.round(ASTEROID.priorRubble * 100)} olasılıkla gevşek bir moloz yığını</b>, <b>%${Math.round((1 - ASTEROID.priorRubble) * 100)} olasılıkla katı bir monolit</b> olduğunu tahmin ediyor. Kesin yapıyı ancak yerinde ölçüm söyleyebilir.`,
    `Görevin: <b>${fmt(1000)} milyon $</b> bütçe ve <b>${T_IMPACT} yıl</b> içinde bir saptırma görevi tasarlamak, fırlatmak, asteroit yüzeyinde keşif aracını sürerek kritik ölçümleri yapmak ve Tufan'ı Dünya'dan uzaklaştırmak.`,
  ];
  const box = $('briefText');
  box.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  [...box.children].forEach((p, i) => { p.style.animationDelay = i * 0.55 + 's'; });
}

function goDesign() {
  state.phase = 'design';
  show('design');
  design = new DesignScreen($('design'), state.cfg, (cfg) => { state.cfg = cfg; goLaunch(); }, goBrief);
}

async function goLaunch() {
  const g = state.gen;
  await fade(1, 0.5); if (g !== state.gen) return;
  state.phase = 'launch';
  show('cine');
  launch = new LaunchSequence(renderer, launcherOf(state.cfg), () => endLaunch());
  bloom.strength = 0.7;
  await fade(0, 0.6);
}
async function endLaunch() {
  if (state.phase !== 'launch') return;
  const g = state.gen;
  state.phase = 'trans';
  await fade(1, 0.8); if (g !== state.gen) return;
  launch.dispose(); launch = null;
  bloom.strength = 0.55;
  audio.rumble(0);
  goArrival();
  await fade(0, 0.8);
}

function goArrival() {
  state.phase = 'arrival';
  show('cine');
  arrival = new Arrival({ scene, camera, ast, sky, cfg: state.cfg, setShadow, onDone: () => endArrival() });
}
async function endArrival() {
  if (state.phase !== 'arrival') return;
  const g = state.gen;
  state.phase = 'trans';
  await fade(1, 0.5); if (g !== state.gen) return;
  arrival.dispose(); arrival = null;
  startSurface();
  await fade(0, 0.7);
}

function startSurface() {
  state.phase = 'surface';
  state.paused = false;
  caption('', '');
  show('hud');
  surface = new SurfaceMission({ scene, camera, ast, sky, cfg: state.cfg, truth: state.truth, setShadow, dust, onEnd: (r) => endSurface(r) });
  toast(`<b>GEZGİN yüzeyde.</b> Görev noktalarına sür, <kbd>F</kbd> ile araçtan in ve görevi yürüyerek yap. Radar sol altta.`, 'info', 8);
  toast('Kamerayı fareyle çevirmek için ekrana <b>tıkla</b>. <kbd>H</kbd>: kontroller', 'info', 7);
  audio.ambient(0.6);
}

async function endSurface(res) {
  surfaceRes = res;
  const g = state.gen;
  state.phase = 'trans';
  state.unlockOk = true;
  if (document.pointerLockElement) document.exitPointerLock();
  await fade(1, 0.8); if (g !== state.gen) return;
  if (surface) { surface.dispose(); surface = null; }
  dust.clear();
  // Kinetik çarpıcı varsa: fırlatma üssüne geç ve çarpıcıyı oyuncu fırlatsın
  if (state.cfg.methods.kinetik) { goBase(res); await fade(0, 0.8); return; }
  startFinal(res);
  await fade(0, 0.8);
}

function goBase(res) {
  surfaceRes = res;
  state.phase = 'base';
  state.paused = false;
  show('base');
  base = new BaseScene({
    launcher: launcherOf(state.cfg), res, cfg: state.cfg,
    onFire: () => goLaunch2(),
    allowUnlock: () => { state.unlockOk = true; },
  });
  audio.ambient(0.3);
}

async function goLaunch2() {
  const g = state.gen;
  state.phase = 'trans';
  state.unlockOk = true;
  if (document.pointerLockElement) document.exitPointerLock();
  await fade(1, 0.6); if (g !== state.gen) return;
  if (base) { base.dispose(); base = null; }
  state.phase = 'launch2';
  show('cine');
  launch = new LaunchSequence(renderer, launcherOf(state.cfg), () => endLaunch2(), { startT: 2.7, payload: 'impactor' });
  bloom.strength = 0.7;
  await fade(0, 0.5);
}
async function endLaunch2() {
  if (state.phase !== 'launch2') return;
  const g = state.gen;
  state.phase = 'trans';
  await fade(1, 0.8); if (g !== state.gen) return;
  launch.dispose(); launch = null;
  bloom.strength = 0.55;
  audio.rumble(0);
  caption('', '');
  goPilot();
  await fade(0, 0.8);
}

function goPilot() {
  if (!surfaceRes) surfaceRes = demoRes();
  state.phase = 'pilot';
  state.paused = false;
  show('pilot');
  pilot = new PilotPhase({ scene, camera, ast, sky, cfg: state.cfg, res: surfaceRes, setShadow, skyAngle: surfaceRes.skyAngle, onDone: (r) => endPilot(r) });
}
async function endPilot(r) {
  const g = state.gen;
  state.phase = 'trans';
  surfaceRes = { ...surfaceRes, flags: { ...surfaceRes.flags, hitEff: r.hitEff }, pilot: r };
  state.unlockOk = true;
  if (document.pointerLockElement) document.exitPointerLock();
  await fade(1, 0.8); if (g !== state.gen) return;
  pilot.dispose(); pilot = null;
  dust.clear();
  startFinal(surfaceRes, true);
  await fade(0, 0.8);
}

function startFinal(res, skipKinetic = false) {
  outcome = deflect(state.cfg, state.truth.mass, state.truth.beta, res.flags);
  state.phase = 'final';
  show('cine');
  final = new FinalSequence({ scene, camera, ast, sky, cfg: state.cfg, res, outcome, setShadow, skyAngle: res.skyAngle, skipKinetic, onDone: () => endFinal() });
}
async function endFinal() {
  if (state.phase !== 'final') return;
  const g = state.gen;
  state.phase = 'trans';
  await fade(1, 0.8); if (g !== state.gen) return;
  final.dispose(); final = null;
  caption('', '');
  goResult();
  await fade(0, 0.8);
}

function goResult() {
  state.phase = 'result';
  show('result');
  renderResult($('result'), {
    cfg: state.cfg, res: surfaceRes, truth: state.truth, out: outcome,
    onRetry: () => { audio.click(); goDesign(); },
    onMenu: () => { audio.click(); goMenu(); },
  });
}

// ---------- Bölüm seçimi (sunum modu) ----------
const CHAPTERS = [
  { id: 'brief', n: 1, name: 'Brifing', desc: 'Tehdit ve görev tanımı' },
  { id: 'design', n: 2, name: 'Görev Tasarımı', desc: 'Roket, yöntem ve araç seçimi' },
  { id: 'launch', n: 3, name: 'Fırlatma', desc: 'Ana uydu ve GEZGİN kalkışı' },
  { id: 'arrival', n: 4, name: 'Asteroide Varış', desc: 'Ana uydunun yaklaşması' },
  { id: 'surface', n: 5, name: 'Asteroit Yüzeyi', desc: 'GEZGİN ile keşif görevleri' },
  { id: 'base', n: 6, name: 'Fırlatma Üssü', desc: 'Uçuş direktörü ile çarpıcıyı ateşle' },
  { id: 'launch2', n: 7, name: 'Çarpıcı Fırlatma', desc: 'Kinetik çarpıcının kalkışı' },
  { id: 'pilot', n: 8, name: 'Son Yaklaşma', desc: 'Çarpıcıyı hedefe yönlendir' },
  { id: 'final', n: 9, name: 'Saptırma', desc: 'Çarpma ve yörünge analizi' },
  { id: 'result', n: 10, name: 'Sonuç', desc: 'B-düzlemi ve puan' },
];
function renderChapters() {
  $('chapterList').innerHTML = CHAPTERS.map((c) => `<button class="chap" data-chapter="${c.id}"><em>${String(c.n).padStart(2, '0')}</em><b>${c.name}</b><span>${c.desc}</span></button>`).join('');
}
function openChapters() {
  if (state.phase === 'loading') return;
  renderChapters();
  state.chapterOpen = true;
  state.unlockOk = true;
  if (document.pointerLockElement) document.exitPointerLock();
  showAlso('pause', false); state.paused = false;
  audio.silenceLoops();
  $('chapters').classList.add('show');
}
function closeChapters() { state.chapterOpen = false; $('chapters').classList.remove('show'); }
function jumpTo(id) {
  const cfg = state.cfg;
  cleanupAll();
  state.cfg = cfg;
  if (['base', 'launch2', 'pilot'].includes(id)) state.cfg.methods.kinetik = true;
  surfaceRes = demoRes();
  if (id === 'brief') goBrief();
  else if (id === 'design') goDesign();
  else if (id === 'launch') { state.phase = 'launch'; show('cine'); launch = new LaunchSequence(renderer, launcherOf(state.cfg), () => endLaunch()); bloom.strength = 0.7; }
  else if (id === 'arrival') goArrival();
  else if (id === 'surface') startSurface();
  else if (id === 'base') goBase(surfaceRes);
  else if (id === 'launch2') { state.phase = 'launch2'; show('cine'); launch = new LaunchSequence(renderer, launcherOf(state.cfg), () => endLaunch2(), { startT: 2.7, payload: 'impactor' }); bloom.strength = 0.7; }
  else if (id === 'pilot') goPilot();
  else if (id === 'final') { surfaceRes.flags.hitEff = 0.9; startFinal(surfaceRes, false); }
  else if (id === 'result') { surfaceRes.flags.hitEff = 0.9; outcome = deflect(state.cfg, state.truth.mass, state.truth.beta, surfaceRes.flags); goResult(); }
  toast(`<b>Bölüm: ${CHAPTERS.find((c) => c.id === id).name}</b> · <kbd>F2</kbd> ile bölüm listesine dön`, 'info', 4);
}
$('chapters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chapter]');
  if (b) { audio.click(); jumpTo(b.dataset.chapter); return; }
  if (e.target.closest('[data-act=closeChapters]') || e.target.id === 'chapters') { audio.click(); closeChapters(); }
});

// ---------- Duraklatma ----------
function setPaused(p) {
  state.paused = p;
  showAlso('pause', p);
  $('pauseEnd').style.display = state.phase === 'surface' ? '' : 'none';
  if (p) audio.silenceLoops();
}
document.addEventListener('pointerlockchange', () => {
  if (!GAMEPLAY.includes(state.phase)) { state.unlockOk = false; return; }
  if (!document.pointerLockElement && !state.paused && !state.unlockOk && !state.chapterOpen) setPaused(true);
  state.unlockOk = false;
  $('crosshint').classList.toggle('show', !document.pointerLockElement);
});
canvas.addEventListener('click', () => {
  audio.init();
  if (GAMEPLAY.includes(state.phase) && !state.paused && !state.chapterOpen && !document.pointerLockElement && !(base && base.panelOpen)) {
    try { canvas.requestPointerLock(); } catch (e) { /* desteklenmiyor */ }
  }
});
addEventListener('keydown', (e) => { if (e.code === 'F2') { e.preventDefault(); state.chapterOpen ? closeChapters() : openChapters(); } });

// ---------- Düğmeler ----------
document.body.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  audio.init();
  if (!a) return;
  const act = a.dataset.act;
  if (['start', 'howto', 'about', 'closeModal', 'toDesign', 'resume', 'endSurface', 'quit', 'mute', 'chapters'].includes(act)) audio.click();
  if (act === 'start') goBrief();
  if (act === 'chapters') openChapters();
  if (act === 'howto') $('howto').classList.add('show');
  if (act === 'about') $('about').classList.add('show');
  if (act === 'closeModal') a.closest('.modal').classList.remove('show');
  if (act === 'toDesign') goDesign();
  if (act === 'resume') { setPaused(false); try { canvas.requestPointerLock(); } catch (er) { /* */ } }
  if (act === 'endSurface') { setPaused(false); surface && surface.finish('manual'); }
  if (act === 'quit') goMenu();
  if (act === 'mute') { const m = audio.toggleMute(); a.textContent = m ? 'SES: KAPALI' : 'SES: AÇIK'; }
});
$('skipBtn').addEventListener('click', (e) => { e.stopPropagation(); skipCine(); });
function skipCine() {
  if (state.phase === 'launch' && launch) endLaunch();
  else if (state.phase === 'launch2' && launch) endLaunch2();
  else if (state.phase === 'arrival' && arrival) endArrival();
  else if (state.phase === 'final' && final) final.skip();
}

// ---------- Döngü ----------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { state.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  try { tick(dt); } catch (err) { console.error(err); state.error = String(err && err.stack || err); }
  input.endFrame();
}

function orbitCamera(dt, radius, speed, yOff, shift = 0.33) {
  // Güneş yandan vursun diye kamera Güneş'e dik bir yay üzerinde salınır (gölgeler, kraterler görünür)
  state.menuAngle += dt * speed;
  const sunAz = Math.atan2(sky.sunDir.z, sky.sunDir.x);
  const a = sunAz + 1.75 + Math.sin(state.menuAngle) * 0.45;
  camera.position.set(Math.cos(a) * radius, yOff + Math.sin(state.menuAngle * 0.7) * 15, Math.sin(a) * radius);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.rotateY(shift);
}

function tick(dt) {
  const ph = state.phase;
  const frozen = state.paused || state.chapterOpen;
  if ((input.hit('Space') || input.hit('Enter')) && ['launch', 'launch2', 'arrival', 'final'].includes(ph) && !state.chapterOpen) skipCine();
  if (GAMEPLAY.includes(ph) && input.hit('Escape') && !document.pointerLockElement && !state.chapterOpen && !(base && base.panelOpen)) setPaused(!state.paused);

  if ((ph === 'launch' || ph === 'launch2') && launch) {
    if (!state.chapterOpen) launch.update(dt);
    renderPass.scene = launch.scene; renderPass.camera = launch.camera;
    composer.render(dt);
    return;
  }
  if (ph === 'base' && base) {
    if (!frozen) base.update(dt);
    renderPass.scene = base.scene; renderPass.camera = base.camera;
    composer.render(dt);
    return;
  }
  renderPass.scene = scene; renderPass.camera = camera;
  if (ph === 'menu' || ph === 'brief' || ph === 'design' || ph === 'result' || ph === 'loading') {
    state.skyAngle += dt * 0.012;
    sky.update(dt, state.skyAngle);
    orbitCamera(dt, ph === 'design' ? 260 : 200, ph === 'design' ? 0.05 : 0.08, 35, ph === 'menu' ? 0.36 : ph === 'brief' ? -0.3 : 0.3);
    setShadow(new THREE.Vector3(), 95);
  } else if (ph === 'arrival' && arrival) { if (!state.chapterOpen) arrival.update(dt); }
  else if (ph === 'surface' && surface) { if (!frozen) surface.update(dt); }
  else if (ph === 'pilot' && pilot) { if (!frozen) pilot.update(dt); }
  else if (ph === 'final' && final) { if (!state.chapterOpen) final.update(dt); }
  if (dust) dust.update(dt, groundDust);
  composer.render(dt);
}

function groundDust(p, v, i3) {
  const L = Math.hypot(p[i3], p[i3 + 1], p[i3 + 2]);
  const rs = ast.radiusAt({ x: p[i3], y: p[i3 + 1], z: p[i3 + 2] });
  if (L < rs + 0.1) { const k = (rs + 0.1) / L; p[i3] *= k; p[i3 + 1] *= k; p[i3 + 2] *= k; v[i3] *= 0.3; v[i3 + 1] *= 0.3; v[i3 + 2] *= 0.3; }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  if (launch) launch.resize();
  if (base) base.resize();
  if (pilot) pilot.resize();
  if (dust) dust.setScale(innerHeight);
});

// ---------- Test kancaları (?test=surface vb.) ----------
function runTest(t) {
  state.unlockOk = true;
  if (t === 'menu') goMenu();
  else if (CHAPTERS.some((c) => c.id === t)) jumpTo(t);
}
window.__api = { state, get surface() { return surface; }, get final() { return final; }, get launch() { return launch; }, get base() { return base; }, get pilot() { return pilot; }, input, camera, goDesign, startSurface, skipCine, jumpTo };

load();
