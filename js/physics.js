// Görev bütçesi ve saptırma fiziği.
//
// Iskalama mesafesi için "yörünge boyunca kayma" yaklaşımı kullanılır:
//   Δx ≈ 3 · Δv · t        (t: Δv uygulandıktan sonra çarpmaya kalan süre)
// Sürekli itme (iyon, traktör) için:  Δx ≈ 3 · a · D · (T − t0 − D/2)
// Kinetik çarpıcı:  Δv = β · m · v / M
// Yerçekimi traktörü:  a = G · m_traktör / d²

import {
  ASTEROID, LAUNCHERS, BUS, OPS, ROVER_BASE, ROVER_OPTS, BUDGET, T_IMPACT, R_EARTH_KM,
} from './data.js';

export const G = 6.674e-11;
export const YEAR = 3.156e7;

export const launcherOf = (cfg) => LAUNCHERS.find((l) => l.id === cfg.launcher);
export const opt = (group, id) => ROVER_OPTS[group].find((o) => o.id === id);

export function roverStats(r) {
  const parts = [
    ROVER_BASE,
    opt('power', r.power),
    opt('battery', r.battery),
    opt('antenna', r.antenna),
    opt('fuel', r.fuel),
    ...ROVER_OPTS.instruments.filter((i) => r.instruments[i.id]),
  ];
  return {
    mass: parts.reduce((s, p) => s + p.mass, 0),
    cost: parts.reduce((s, p) => s + p.cost, 0),
  };
}

export function methodMass(cfg, id) {
  if (id === 'kinetik') return cfg.impactorMass + 150;
  if (id === 'iyon') return cfg.ionCount * (210 + 270 * cfg.ionYears);
  if (id === 'traktor') return cfg.tractorMass;
  return 0;
}
export function methodCost(cfg, id) {
  if (id === 'kinetik') return 45 + 0.022 * cfg.impactorMass;
  if (id === 'iyon') return 70 * cfg.ionCount + 8 * cfg.ionYears;
  if (id === 'traktor') return 90 + 0.006 * cfg.tractorMass + 6 * cfg.tractorYears;
  return 0;
}

export function timeline(cfg) {
  const L = launcherOf(cfg);
  const dev = 1.0 + (cfg.methods.iyon ? 0.3 : 0) + (cfg.methods.traktor ? 0.2 : 0);
  const arrival = dev + L.transfer;
  const opsStart = arrival + 0.05;
  return {
    dev, transfer: L.transfer, arrival, opsStart,
    ionEnd: cfg.methods.iyon ? opsStart + cfg.ionYears : null,
    tractorEnd: cfg.methods.traktor ? opsStart + cfg.tractorYears : null,
    impact: T_IMPACT,
  };
}

// Saptırma hesabı. flags: { beacon, anchor, massKnown }
export function deflect(cfg, M, beta, flags) {
  const L = launcherOf(cfg);
  const tl = timeline(cfg);
  const parts = [];
  if (cfg.methods.kinetik) {
    const hit = flags.hitEff != null ? flags.hitEff : (flags.beacon ? 0.95 : 0.6);
    const dv = (beta * cfg.impactorMass * L.vimp * 1000 / M) * hit;
    const lead = (T_IMPACT - tl.opsStart) * YEAR;
    parts.push({ id: 'kinetik', name: 'Kinetik çarpıcı', dv, lead, shift: 3 * dv * lead, eff: hit });
  }
  if (cfg.methods.iyon) {
    const eff = flags.anchor ? 1.0 : 0.3;
    const a = cfg.ionCount * 0.25 * eff / M;
    const D = cfg.ionYears;
    const dv = a * D * YEAR;
    const lead = (T_IMPACT - tl.opsStart - D / 2) * YEAR;
    parts.push({ id: 'iyon', name: 'İyon itici', dv, lead, shift: 3 * dv * lead, eff });
  }
  if (cfg.methods.traktor) {
    const dFac = flags.massKnown ? 1.6 : 2.6;
    const d = dFac * ASTEROID.radius;
    const a = G * cfg.tractorMass / (d * d);
    const D = cfg.tractorYears;
    const dv = a * D * YEAR;
    const lead = (T_IMPACT - tl.opsStart - D / 2) * YEAR;
    parts.push({ id: 'traktor', name: 'Yerçekimi traktörü', dv, lead, shift: 3 * dv * lead, eff: 1.6 / dFac, hover: d });
  }
  const shiftKm = parts.reduce((s, p) => s + p.shift, 0) / 1000;
  const shiftRE = shiftKm / R_EARTH_KM;
  const bx = ASTEROID.b0.x + shiftRE;
  const by = ASTEROID.b0.y;
  const missRE = Math.hypot(bx, by);
  return { parts, shiftKm, shiftRE, bx, by, missRE, missKm: missRE * R_EARTH_KM, dvTotal: parts.reduce((s, p) => s + p.dv, 0) };
}

export function verdict(missRE) {
  if (missRE >= 1.5) return 'safe';
  if (missRE >= 1.1) return 'close';
  return 'impact';
}

export function summarize(cfg) {
  const L = launcherOf(cfg);
  const rv = roverStats(cfg.rover);
  const massParts = [{ label: BUS.label, v: BUS.mass }, { label: 'GEZGİN keşif aracı', v: rv.mass }];
  const costParts = [
    { label: BUS.label, v: BUS.cost }, { label: OPS.label, v: OPS.cost },
    { label: 'GEZGİN keşif aracı', v: rv.cost }, { label: `Fırlatma (${L.name})`, v: L.cost },
  ];
  const names = { kinetik: 'Kinetik çarpıcı', iyon: 'İyon itici', traktor: 'Yerçekimi traktörü' };
  for (const id of ['kinetik', 'iyon', 'traktor']) {
    if (!cfg.methods[id]) continue;
    massParts.push({ label: names[id], v: methodMass(cfg, id) });
    costParts.push({ label: names[id], v: methodCost(cfg, id) });
  }
  const mass = massParts.reduce((s, p) => s + p.v, 0);
  const cost = costParts.reduce((s, p) => s + p.v, 0);
  const tl = timeline(cfg);
  const errors = [];
  const warnings = [];
  const anyMethod = cfg.methods.kinetik || cfg.methods.iyon || cfg.methods.traktor;
  if (!anyMethod) errors.push('En az bir saptırma yöntemi seçmelisin.');
  if (mass > L.cap) errors.push(`Kütle fırlatma kapasitesini aşıyor (${Math.round(mass)} kg > ${L.cap} kg).`);
  if (cost > BUDGET) errors.push(`Bütçe aşıldı (${Math.round(cost)} M$ > ${BUDGET} M$).`);
  if (tl.ionEnd && tl.ionEnd > T_IMPACT - 0.5) errors.push('İyon itme süresi çarpmaya çok yakın bitiyor.');
  if (tl.tractorEnd && tl.tractorEnd > T_IMPACT - 0.5) errors.push('Traktör süresi çarpmaya çok yakın bitiyor.');
  if (cfg.methods.traktor && !cfg.rover.instruments.spektrometre)
    warnings.push('Spektrometre yok: asteroit kütlesi bilinemez, traktör güvenli (uzak) mesafede beklemek zorunda kalır.');
  if (!cfg.rover.instruments.sismometre)
    warnings.push('Sismometre yok: iç yapı (β) ölçülemez, sonucu önceden tahmin edemezsin.');
  const p = opt('power', cfg.rover.power);
  if (p.night === 0) warnings.push('Güneş paneli gece şarj etmez. Gece için yeterli batarya al ya da güneşli bölgelerde kal.');
  if (opt('battery', cfg.rover.battery).cap < 120 && p.night === 0) warnings.push('Küçük batarya + güneş paneli: gece sürüşü çok kısa olacak.');

  // Tahmini ıskalama: yüzey görevleri başarıyla tamamlanırsa
  const flags = { beacon: true, anchor: true, massKnown: !!cfg.rover.instruments.spektrometre };
  const est = {};
  for (const k of ['rubble', 'monolith']) {
    const t = ASTEROID.types[k];
    const rho = (t.density[0] + t.density[1]) / 2;
    const beta = (t.beta[0] + t.beta[1]) / 2;
    est[k] = deflect(cfg, rho * ASTEROID.volume, beta, flags);
  }
  return {
    launcher: L, rover: rv, massParts, costParts, mass, cost, tl, errors, warnings, est,
    valid: errors.length === 0,
  };
}

export function makeTruth(rand = Math.random) {
  const kind = rand() < ASTEROID.priorRubble ? 'rubble' : 'monolith';
  const t = ASTEROID.types[kind];
  const density = t.density[0] + (t.density[1] - t.density[0]) * rand();
  const beta = t.beta[0] + (t.beta[1] - t.beta[0]) * rand();
  return { kind, density, beta, mass: density * ASTEROID.volume };
}
