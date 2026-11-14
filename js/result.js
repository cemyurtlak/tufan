import { T as __T } from './i18n.js';
// Sonuç ekranı: B-düzlemi animasyonu, saptırma dökümü, puan ve öğrenilenler.
import { ASTEROID, BUDGET, R_EARTH_KM, fmt, GAME } from './data.js';
import { verdict, summarize, deflect } from './physics.js';

export function computeScore(out, res, sum) {
  const v = verdict(out.missRE);
  let score = v === 'safe' ? 500 : v === 'close' ? 200 : 0;
  if (v === 'safe') score += Math.min(150, Math.round((out.missRE - 1.5) * 120));
  const sci = Math.min(250, Math.round(res.uploaded * 0.8));
  const budget = v !== 'impact' ? Math.max(0, Math.round((BUDGET - sum.cost) * 0.4)) : 0;
  const tasks = res.tasksTotal ? Math.round((res.tasksDone / res.tasksTotal) * 100) : 0;
  return { total: score + sci + budget + tasks - res.rescues * 25, parts: { deflect: score, sci, budget, tasks, rescue: -res.rescues * 25 } };
}

function lessons(cfg, res, truth, out) {
  const L = [];
  const v = verdict(out.missRE);
  if (res.pilot) {
    if (res.pilot.missed) L.push(__T('Çarpıcı son yaklaşmada asteroidi ıskaladı. Gerçek DART görevi son 4 saatte tamamen otonom güdümle (SMART Nav) hedefe kilitlendi.'));
    else L.push(__T`Çarpıcı, kütle merkezi doğrultusundaki ideal noktanın ${fmt(res.pilot.dMeters, 1)} m uzağına çarptı. Merkezden uzaklaştıkça momentumun bir kısmı asteroidi döndürmeye gider ve saptırma zayıflar.`);
  }
  if (cfg.methods.kinetik && !res.flags.beacon && !res.pilot) L.push(__T('Hedef işaretçisi kurulmadığı için çarpıcı kütle merkezini ıskaladı ve momentumun yalnızca %60\'ı aktarıldı. Gerçek DART görevi de son saatlerde otonom navigasyonla hedefin merkezine kilitlendi.'));
  if (cfg.methods.iyon && !res.flags.anchor) L.push(__T('İyon itici dönme eksenine (kutba) sabitlenmediği için itme yönü sürekli döndü ve etkisi %30\'a düştü.'));
  if (cfg.methods.traktor && !res.flags.massKnown) L.push(__T('Asteroitin kütlesi ölçülemediği için traktör çarpışma riskine karşı uzakta beklemek zorunda kaldı. Çekim kuvveti mesafenin karesiyle azalır.'));
  if (truth.kind === 'monolith' && cfg.methods.kinetik) L.push(__T`Bu asteroit bir monolitti (β ≈ ${fmt(truth.beta, 1)}). Katı kayalarda ejekta az olduğu için kinetik çarpmanın etkisi moloz yığınlarına göre yarı yarıya düşer.`);
  if (truth.kind === 'rubble' && cfg.methods.kinetik) L.push(__T`Bu asteroit bir moloz yığınıydı (β ≈ ${fmt(truth.beta, 1)}). Fırlayan ejekta ek itme sağladı. DART'ta Dimorphos için β ≈ 3,6 ölçüldü.`);
  if (!res.structureKnown) L.push(__T('İç yapı ölçülmeden yapılan bir saptırma kumar gibidir. Gerçek görevlerde (ESA Hera, 2026) çarpma sonrası ölçüm yapılır.'));
  if (v === 'impact' && cfg.methods.traktor && !cfg.methods.kinetik) L.push(__T('Yerçekimi traktörü tek başına çok zayıftır. Genelde kinetik çarpmadan sonra "ince ayar" için önerilir.'));
  if (v !== 'safe') L.push(__T('Uyarı süresi her şeydir: aynı Δv, çarpmadan ne kadar erken uygulanırsa ıskalama mesafesi o kadar büyür (Δx ≈ 3·Δv·t).'));
  if (res.produced > 0 && res.uploaded < res.produced * 0.6) L.push(__T('Toplanan verinin bir kısmı Dünya\'ya ulaşmadı. Veri, ancak Dünya ufkun üstündeyken iletilebilir: iletişim penceresini planlamak gerekir.'));
  return L.slice(0, 4);
}

export function renderResult(root, { cfg, res, truth, out, onRetry, onMenu }) {
  const sum = summarize(cfg);
  const v = verdict(out.missRE);
  const sc = computeScore(out, res, sum);
  const head = { safe: [__T('DÜNYA KURTARILDI'), __T('Tufan güvenli bir mesafeden geçecek.')], close: [__T('KIL PAYI'), __T('Asteroit atmosferin sınırından geçecek. Risk çok yüksek; ek görev şart.')], impact: [__T('ÇARPMA KAÇINILMAZ'), __T('Saptırma yetersiz kaldı. Tahliye planları devreye giriyor.')] }[v];
  const T = ASTEROID.types[truth.kind];
  const flagsAll = { beacon: true, anchor: true, massKnown: true };
  const ideal = deflect(cfg, truth.mass, truth.beta, flagsAll);
  root.innerHTML = __T`
  <div class="result-wrap ${v}">
    <div class="res-left">
      <div class="tag">AŞAMA 5 · GÖREV SONUCU</div>
      <h1 class="verdict">${head[0]}</h1>
      <p class="verdict-sub">${head[1]}</p>
      <canvas id="bplane" width="560" height="560"></canvas>
      <div class="bp-legend"><span><i class="e"></i>Dünya</span><span><i class="r1"></i>1,1 R⊕ yakalama</span><span><i class="r2"></i>1,5 R⊕ güvenli sınır</span><span><i class="a"></i>Asteroit</span></div>
    </div>
    <div class="res-right">
      <div class="res-grid">
        <div class="stat"><span>Iskalama</span><b class="${v}">${fmt(out.missKm)} km</b><em>${fmt(out.missRE, 2)} Dünya yarıçapı</em></div>
        <div class="stat"><span>Toplam Δv</span><b>${fmt(out.dvTotal * 100, 2)} cm/s</b><em>${fmt(out.dvTotal * 1000, 1)} mm/s</em></div>
        <div class="stat"><span>Puan</span><b>${fmt(sc.total)}</b><em>saptırma ${sc.parts.deflect} · bilim ${sc.parts.sci} · bütçe ${sc.parts.budget} · görev ${sc.parts.tasks}</em></div>
      </div>
      <h3>SAPTIRMA DÖKÜMÜ</h3>
      <table class="tbl"><tr><th>Yöntem</th><th>Δv</th><th>Etki süresi</th><th>Kayma</th><th>Verim</th></tr>
        ${out.parts.map((p) => __T`<tr><td>${p.name}</td><td>${fmt(p.dv * 100, 3)} cm/s</td><td>${fmt(p.lead / 3.156e7, 1)} yıl</td><td>${fmt(p.shift / 1000)} km</td><td class="${p.eff < 0.9 ? 'bad' : 'ok'}">%${Math.round(p.eff * 100)}</td></tr>`).join('')}
      </table>
      <div class="ideal">Tüm yüzey görevleri eksiksiz olsaydı: <b>${fmt(ideal.missRE, 2)} R⊕</b> (${fmt(ideal.missKm)} km)</div>
      <h3>ASTEROİTİN GERÇEK YAPISI</h3>
      <div class="truth">
        <div><span>Tür</span><b>${T.long}</b></div>
        <div><span>Yoğunluk</span><b>${fmt(truth.density / 1000, 2)} g/cm³</b></div>
        <div><span>Kütle</span><b>${fmt(truth.mass / 1e9, 2)} milyar ton</b></div>
        <div><span>β (momentum katsayısı)</span><b>${fmt(truth.beta, 2)}</b></div>
      </div>
      <h3>GÖREV</h3>
      <div class="truth">
        <div><span>Yüzey görevleri</span><b>${res.tasksDone}/${res.tasksTotal}</b></div>
        <div><span>İletilen bilim verisi</span><b>${fmt(res.uploaded)} / ${fmt(res.produced)} MB</b></div>
        <div><span>Harcanan bütçe</span><b>${fmt(sum.cost)} / ${fmt(BUDGET)} M$</b></div>
        <div><span>Kurtarma operasyonu</span><b>${res.rescues}</b></div>
      </div>
      <h3>NE ÖĞRENDİK?</h3>
      <ul class="lessons">${lessons(cfg, res, truth, out).map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="res-btns">
        <button class="btn primary" data-act="retry">TASARIMI DEĞİŞTİR, TEKRAR DENE</button>
        <button class="btn" data-act="menu">ANA MENÜ</button>
      </div>
    </div>
  </div>`;
  root.querySelector('[data-act=retry]').onclick = onRetry;
  root.querySelector('[data-act=menu]').onclick = onMenu;
  animateBPlane(root.querySelector('#bplane'), out, v);
}

function animateBPlane(cv, out, v) {
  const ctx = cv.getContext('2d');
  const W = cv.width, C = W / 2, S = W / 7.2; // 1 R⊕ = S px
  const x0 = ASTEROID.b0.x, y0 = ASTEROID.b0.y;
  const start = performance.now();
  const col = { safe: '#6dffa8', close: '#ffb547', impact: '#ff5d5d' }[v];
  function frame(now) {
    const k = Math.min(1, (now - start) / 2600);
    const e = 1 - Math.pow(1 - k, 3);
    const bx = x0 + (out.bx - x0) * e, by = y0 + (out.by - y0) * e;
    ctx.clearRect(0, 0, W, W);
    // ızgara
    ctx.strokeStyle = 'rgba(111,211,255,0.08)'; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(C + i * S, 0); ctx.lineTo(C + i * S, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, C + i * S); ctx.lineTo(W, C + i * S); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160,190,220,0.6)'; ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(__T('B-DÜZLEMİ (Dünya yarıçapı birimi)'), 12, 20);
    // halkalar
    const ring = (r, c, dash) => { ctx.setLineDash(dash); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(C, C, r * S, 0, 7); ctx.stroke(); ctx.setLineDash([]); };
    ring(1.5, 'rgba(109,255,168,0.7)', [6, 6]);
    ring(1.1, 'rgba(255,181,71,0.7)', [3, 4]);
    // Dünya
    const g = ctx.createRadialGradient(C - S * 0.3, C - S * 0.3, S * 0.1, C, C, S);
    g.addColorStop(0, '#7fc4ff'); g.addColorStop(0.6, '#2a6fbf'); g.addColorStop(1, '#0d2c5c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, S, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,190,255,0.6)'; ctx.lineWidth = 6; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(C, C, S * 1.04, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    // ilk nokta
    const px = (x) => C + x * S, py = (y) => C - y * S;
    ctx.fillStyle = 'rgba(255,93,93,0.8)'; ctx.beginPath(); ctx.arc(px(x0), py(y0), 5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(px(x0), py(y0)); ctx.lineTo(px(bx), py(by)); ctx.stroke(); ctx.setLineDash([]);
    // belirsizlik elipsi
    ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(px(bx), py(by), 18, 10, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(px(bx), py(by), 7, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillText(`${fmt(Math.hypot(bx, by), 2)} R⊕`, Math.min(W - 80, px(bx) + 12), py(by) - 10);
    if (k < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
