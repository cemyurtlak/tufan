import { T as __T, pct } from './i18n.js';
// Görev Tasarım Atölyesi: fırlatma aracı, saptırma yöntemleri ve keşif aracı modülleri.
import { LAUNCHERS, METHODS, ROVER_OPTS, BUDGET, T_IMPACT, ASTEROID, fmt, fmtYear } from './data.js';
import { summarize, methodMass, methodCost } from './physics.js';
import { audio } from './audio.js';

const kg = (v) => (v >= 1000 ? fmt(v / 1000, 2) + ' t' : fmt(v) + ' kg');

export class DesignScreen {
  constructor(root, cfg, onLaunch, onBack) {
    this.root = root; this.cfg = cfg; this.onLaunch = onLaunch; this.onBack = onBack;
    this.render();
    this.update();
  }

  card(group, o, selected, extra = '') {
    return `<button class="card ${selected ? 'sel' : ''}" data-group="${group}" data-id="${o.id}">
      <div class="card-name">${o.name}</div>${o.ref ? `<div class="card-ref">${o.ref}</div>` : ''}
      <div class="card-desc">${o.desc || ''}</div>
      <div class="chips"><span>${kg(o.mass ?? 0)}</span><span>${fmt(o.cost)} M$</span>${extra}</div></button>`;
  }

  render() {
    const c = this.cfg;
    const L = LAUNCHERS.map((l) => __T`<button class="card ${c.launcher === l.id ? 'sel' : ''}" data-group="launcher" data-id="${l.id}">
      <div class="card-name">${l.name}</div><div class="card-ref">${l.ref}</div><div class="card-desc">${l.desc}</div>
      <div class="chips"><span>Kapasite ${kg(l.cap)}</span><span>${fmt(l.cost)} M$</span><span>Transfer ${fmt(l.transfer, 2)} yıl</span><span>Çarpma ${fmt(l.vimp, 1)} km/s</span></div></button>`).join('');

    const slider = (key, min, max, step, label, unit) => `<label class="slider"><span>${label}</span>
      <input type="range" data-slider="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}"><b data-out="${key}"></b><em>${unit}</em></label>`;

    const meth = (id, sliders) => `<div class="method ${c.methods[id] ? 'on' : ''}" data-method="${id}">
      <div class="method-head" data-toggle="${id}"><div class="tog"><i></i></div>
        <div><div class="card-name">${METHODS[id].name}</div><div class="card-ref">${METHODS[id].ref}</div></div>
        <div class="chips right"><span data-mm="${id}"></span><span data-mc="${id}"></span></div></div>
      <div class="card-desc">${METHODS[id].desc}</div>
      <div class="method-body">${sliders}</div></div>`;

    const r = c.rover;
    const grp = (g, key) => ROVER_OPTS[g].map((o) => this.card(g, o, r[key] === o.id,
      o.sun !== undefined ? `<span>☀ ${fmt(o.sun, 1)}/sn</span><span>☾ ${fmt(o.night, 1)}/sn</span>` : '')).join('');
    const inst = ROVER_OPTS.instruments.map((o) => `<button class="card check ${r.instruments[o.id] ? 'sel' : ''}" data-inst="${o.id}">
      <div class="card-name"><span class="box"></span>${o.name}</div><div class="card-desc">${o.desc}</div>
      <div class="chips"><span>${kg(o.mass)}</span><span>${fmt(o.cost)} M$</span></div></button>`).join('');

    this.root.innerHTML = __T`
    <div class="design-wrap">
      <header class="design-head">
        <div><div class="tag">AŞAMA 2 · GÖREV TASARIMI</div><h2>GÖREV TASARIM ATÖLYESİ</h2></div>
        <div class="head-info">
          <div><span>Hedef</span><b>${ASTEROID.name}</b></div>
          <div><span>Çarpmaya</span><b>${T_IMPACT} yıl</b></div>
          <div><span>Bütçe</span><b>${fmt(BUDGET)} M$</b></div>
          <div><span>Teleskop tahmini</span><b>%${Math.round(ASTEROID.priorRubble * 100)} moloz yığını</b></div>
        </div>
      </header>
      <div class="design-grid">
        <section class="options">
          <div class="sec"><h3><em>1</em> FIRLATMA ARACI</h3><div class="cards four">${L}</div></div>
          <div class="sec"><h3><em>2</em> SAPTIRMA YÖNTEMİ <small>birden fazla seçilebilir</small></h3>
            ${meth('kinetik', slider('impactorMass', 500, 9000, 250, __T('Çarpıcı kütlesi'), 'kg'))}
            ${meth('iyon', slider('ionCount', 1, 4, 1, __T('İtici sayısı (0,25 N, 7,5 kW)'), __T('adet')) + slider('ionYears', 1, 3.5, 0.5, __T('İtme süresi'), __T('yıl')))}
            ${meth('traktor', slider('tractorMass', 3000, 25000, 1000, __T('Traktör kütlesi'), 'kg') + slider('tractorYears', 1, 4, 0.5, __T('Çekim süresi'), __T('yıl')))}
          </div>
          <div class="sec"><h3><em>3</em> KEŞİF ARACI "GEZGİN" <small>yüzeyde senin süreceğin araç</small></h3>
            <h4>Güç kaynağı</h4><div class="cards three">${grp('power', 'power')}</div>
            <h4>Batarya</h4><div class="cards three">${grp('battery', 'battery')}</div>
            <h4>Bilimsel aletler</h4><div class="cards three">${inst}</div>
            <h4>İletişim</h4><div class="cards two">${grp('antenna', 'antenna')}</div>
            <h4>Manevra yakıtı</h4><div class="cards two">${grp('fuel', 'fuel')}</div>
          </div>
        </section>
        <aside class="summary" id="d-summary"></aside>
      </div>
    </div>`;

    this.root.onclick = (e) => {
      const t = e.target.closest('[data-group],[data-inst],[data-toggle],[data-act]');
      if (!t) return;
      audio.click();
      if (t.dataset.act === 'launch') { if (this.sum.valid) this.onLaunch(this.cfg); return; }
      if (t.dataset.act === 'back') { this.onBack(); return; }
      if (t.dataset.group === 'launcher') this.cfg.launcher = t.dataset.id;
      else if (t.dataset.group) {
        const key = { power: 'power', battery: 'battery', antenna: 'antenna', fuel: 'fuel' }[t.dataset.group];
        this.cfg.rover[key] = t.dataset.id;
      } else if (t.dataset.inst) this.cfg.rover.instruments[t.dataset.inst] = !this.cfg.rover.instruments[t.dataset.inst];
      else if (t.dataset.toggle) this.cfg.methods[t.dataset.toggle] = !this.cfg.methods[t.dataset.toggle];
      this.refreshSelection();
      this.update();
    };
    this.root.oninput = (e) => {
      const k = e.target.dataset.slider;
      if (!k) return;
      this.cfg[k] = parseFloat(e.target.value);
      this.update();
    };
  }

  refreshSelection() {
    const c = this.cfg;
    this.root.querySelectorAll('[data-group]').forEach((el) => {
      const g = el.dataset.group;
      const cur = g === 'launcher' ? c.launcher : c.rover[g];
      el.classList.toggle('sel', cur === el.dataset.id);
    });
    this.root.querySelectorAll('[data-inst]').forEach((el) => el.classList.toggle('sel', !!c.rover.instruments[el.dataset.inst]));
    this.root.querySelectorAll('[data-method]').forEach((el) => el.classList.toggle('on', !!c.methods[el.dataset.method]));
  }

  update() {
    const c = this.cfg;
    const s = this.sum = summarize(c);
    this.root.querySelectorAll('[data-out]').forEach((el) => {
      const k = el.dataset.out; el.textContent = k.includes('Mass') ? fmt(c[k]) : fmt(c[k], k.includes('Years') ? 1 : 0);
    });
    for (const id of ['kinetik', 'iyon', 'traktor']) {
      this.root.querySelector(`[data-mm="${id}"]`).textContent = kg(methodMass(c, id));
      this.root.querySelector(`[data-mc="${id}"]`).textContent = fmt(methodCost(c, id)) + ' M$';
    }
    const massP = s.mass / s.launcher.cap, costP = s.cost / BUDGET;
    const bar = (p, cls = '') => `<div class="bar big ${cls}"><i style="width:${Math.min(100, p * 100)}%" class="${p > 1 ? 'bad' : p > 0.9 ? 'warn' : ''}"></i></div>`;
    const tl = s.tl;
    const X = (y) => (y / T_IMPACT) * 100;
    const seg = (a, b, cls, label) => `<div class="tl-seg ${cls}" style="left:${X(a)}%;width:${Math.max(0.8, X(b) - X(a))}%" title="${label}"></div>`;
    let tlHtml = seg(0, tl.dev, 'dev', __T('Geliştirme')) + seg(tl.dev, tl.arrival, 'tr', 'Transfer');
    if (c.methods.kinetik) tlHtml += __T`<div class="tl-mark kin" style="left:${X(tl.opsStart)}%" title="Kinetik çarpma"></div>`;
    if (c.methods.iyon) tlHtml += seg(tl.opsStart, tl.ionEnd, 'ion', __T('İyon itme'));
    if (c.methods.traktor) tlHtml += `<div class="tl-seg trc" style="left:${X(tl.opsStart)}%;width:${X(tl.tractorEnd) - X(tl.opsStart)}%;top:14px"></div>`;
    const missRow = (k, label, prob) => {
      const e = s.est[k];
      const p = Math.min(1, e.missRE / 3);
      const v = e.missRE >= 1.5 ? 'ok' : e.missRE >= 1.1 ? 'warn' : 'bad';
      const vt = e.missRE >= 1.5 ? __T('GÜVENLİ') : e.missRE >= 1.1 ? __T('KIL PAYI') : __T('ÇARPMA');
      return `<div class="miss-row"><div class="miss-lbl">${label} <small>${pct(prob)}</small></div>
        <div class="miss-bar"><i class="${v}" style="width:${p * 100}%"></i><s style="left:${(1.1 / 3) * 100}%"></s><s class="g" style="left:${(1.5 / 3) * 100}%"></s></div>
        <div class="miss-val ${v}">${fmt(e.missRE, 2)} R⊕ <b>${vt}</b></div></div>`;
    };
    const rv = s.rover;
    this.root.querySelector('#d-summary').innerHTML = __T`
      <div class="sum-block"><div class="sum-h">KÜTLE <b>${kg(s.mass)} / ${kg(s.launcher.cap)}</b></div>${bar(massP)}
        <ul class="parts">${s.massParts.map((p) => `<li><span>${p.label}</span><b>${kg(p.v)}</b></li>`).join('')}</ul></div>
      <div class="sum-block"><div class="sum-h">BÜTÇE <b>${fmt(s.cost)} / ${fmt(BUDGET)} M$</b></div>${bar(costP)}
        <ul class="parts">${s.costParts.map((p) => `<li><span>${p.label}</span><b>${fmt(p.v)} M$</b></li>`).join('')}</ul></div>
      <div class="sum-block"><div class="sum-h">TAKVİM <b>Varış: ${fmtYear(2026 + tl.arrival)}</b></div>
        <div class="timeline">${tlHtml}<div class="tl-end" title="Çarpma"></div></div>
        <div class="tl-legend"><span class="dev">Geliştirme ${fmt(tl.dev, 1)} y</span><span class="tr">Transfer ${fmt(tl.transfer, 2)} y</span>${c.methods.iyon ? __T('<span class="ion">İyon</span>') : ''}${c.methods.traktor ? __T('<span class="trc">Traktör</span>') : ''}<span class="end">Çarpma 2036</span></div></div>
      <div class="sum-block"><div class="sum-h">TAHMİNİ ISKALAMA <small>yüzey görevleri başarılı olursa</small></div>
        ${missRow('rubble', __T('Moloz yığını ise'), Math.round(ASTEROID.priorRubble * 100))}
        ${missRow('monolith', __T('Monolit ise'), Math.round((1 - ASTEROID.priorRubble) * 100))}
        <div class="miss-note">Hedef: Dünya'yı en az <b>1,5 Dünya yarıçapı</b> (≈9.560 km) ıskalamak. 1,1 R⊕ altı: yerçekimi asteroidi Dünya'ya çeker.</div></div>
      <div class="sum-block"><div class="sum-h">GEZGİN <b>${kg(rv.mass)} · ${fmt(rv.cost)} M$</b></div></div>
      ${s.errors.length ? `<ul class="msgs err">${s.errors.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
      ${s.warnings.length ? `<ul class="msgs warn">${s.warnings.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
      <button class="btn primary launch ${s.valid ? '' : 'disabled'}" data-act="launch">${s.valid ? __T('GÖREVİ ONAYLA VE FIRLAT 🚀') : __T('TASARIM GEÇERSİZ')}</button>
      <button class="btn ghost" data-act="back">← Brifinge dön</button>`;
  }
}
