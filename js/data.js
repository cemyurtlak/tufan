import { T as __T, dec } from './i18n.js';
// Oyunun tüm sabitleri ve tasarım kataloğu.
// Değerler gerçek görevlerden esinlenmiş yaklaşık değerlerdir (bkz. README).

export const T_IMPACT = 10;          // keşiften çarpmaya kalan süre (yıl)
export const BUDGET = 1000;          // milyon $
export const R_EARTH_KM = 6371;

export const ASTEROID = {
  name: '2026 TK7 "Tufan"',
  shortName: 'TUFAN',
  diameter: 160,                     // m
  radius: 80,                        // m
  volume: (4 / 3) * Math.PI * Math.pow(80, 3), // m^3
  rotationHours: 5.8,
  discovered: __T('14 Mart 2026'),
  impactDate: __T('Ekim 2036'),
  priorRubble: 0.65,                 // yer teleskobu tahmini
  types: {
    rubble: {
      label: __T('Moloz yığını'),
      long: __T('Moloz yığını (C-tipi, gözenekli, karbonca zengin)'),
      density: [1500, 1900],
      beta: [3.0, 4.2],
    },
    monolith: {
      label: __T('Monolit'),
      long: __T('Monolit (S-tipi, katı silikat kaya)'),
      density: [2500, 2900],
      beta: [1.3, 2.0],
    },
  },
  // Saptırma yapılmazsa B-düzlemindeki çarpma noktası (Dünya yarıçapı biriminde)
  b0: { x: -0.25, y: 0.15 },
};

// Oyun içi ölçek: asteroitin ortalama yarıçapı 60 birim = 80 m
export const GAME = {
  R0: 60,
  mPerUnit: 80 / 60,
  g0: 3.2,              // yüzey yerçekimi (oyun ölçeği, oynanabilirlik için büyütülmüş)
  windowSec: 12 * 60,   // yüzey görev penceresi
  dayPeriodSec: 6 * 60, // oyun içi dönme periyodu (gündüz/gece)
};

export const LAUNCHERS = [
  { id: 'hafif', name: __T('Hafif Sınıf'), ref: __T('Vega-C sınıfı'), cap: 1500, cost: 45, transfer: 1.5, vimp: 5.5, visual: 'light',
    desc: __T('Ucuz ama zayıf. Sadece küçük görevler.') },
  { id: 'orta', name: __T('Orta Sınıf'), ref: __T('Falcon 9 sınıfı'), cap: 5000, cost: 90, transfer: 1.25, vimp: 6.0, visual: 'medium',
    desc: __T('Dengeli maliyet ve kapasite.') },
  { id: 'agir', name: __T('Ağır Sınıf'), ref: __T('Falcon Heavy sınıfı'), cap: 10000, cost: 250, transfer: 1.05, vimp: 6.5, visual: 'heavy',
    desc: __T('Daha hızlı transfer, daha sert çarpma.') },
  { id: 'superagir', name: __T('Süper Ağır'), ref: __T('SLS Block 1 sınıfı'), cap: 27000, cost: 420, transfer: 0.9, vimp: 7.0, visual: 'super',
    desc: __T('Devasa kapasite, devasa fiyat.') },
];

export const BUS = { mass: 1100, cost: 200, label: __T('Ana uydu (seyir, güç, iletişim)') };
export const OPS = { cost: 80, label: __T('Operasyon & Derin Uzay Ağı') };
export const ROVER_BASE = { mass: 180, cost: 40, label: __T('GEZGİN şasi') };

export const ROVER_OPTS = {
  power: [
    { id: 'gunes_kucuk', name: __T('Gövde güneş paneli'), mass: 12, cost: 4, sun: 1.3, night: 0,
      desc: __T('Hafif ve ucuz. Gölgede şarj yok.') },
    { id: 'gunes_buyuk', name: __T('Açılır güneş kanatları'), mass: 28, cost: 9, sun: 2.8, night: 0,
      desc: __T('Gündüz hızlı şarj. Gece işe yaramaz.') },
    { id: 'rtg', name: __T('RTG (radyoizotop)'), mass: 45, cost: 65, sun: 1.1, night: 1.1,
      desc: __T('Gece-gündüz sabit güç. Pahalı ve ağır.') },
  ],
  battery: [
    { id: 'S', name: __T('Küçük batarya'), mass: 14, cost: 2, cap: 90, desc: __T('90 birim enerji') },
    { id: 'M', name: __T('Orta batarya'), mass: 30, cost: 4, cap: 180, desc: __T('180 birim enerji') },
    { id: 'L', name: __T('Büyük batarya'), mass: 55, cost: 7, cap: 320, desc: __T('320 birim enerji') },
  ],
  instruments: [
    { id: 'spektrometre', name: __T('Kızılötesi spektrometre'), mass: 9, cost: 15,
      desc: __T('Bileşim → yoğunluk → asteroit kütlesi. Yerçekimi traktörü için şart.') },
    { id: 'sismometre', name: __T('Sismometre kiti (3 sensör)'), mass: 21, cost: 12,
      desc: __T('İç yapı: moloz yığını mı, monolit mi? (β katsayısı)') },
    { id: 'matkap', name: __T('Karot matkabı'), mass: 26, cost: 14,
      desc: __T('Yüzey altı numunesi. Ek bilim puanı.') },
  ],
  antenna: [
    { id: 'kucuk', name: __T('Düşük kazançlı anten'), mass: 4, cost: 2, rate: 3, desc: __T('3 MB/s veri iletimi') },
    { id: 'buyuk', name: __T('Yüksek kazançlı çanak'), mass: 16, cost: 10, rate: 10, desc: __T('10 MB/s veri iletimi') },
  ],
  fuel: [
    { id: 'az', name: __T('Az itici yakıt'), mass: 8, cost: 1, amount: 40, desc: __T('Birkaç kısa sıçrama') },
    { id: 'cok', name: __T('Bol itici yakıt'), mass: 26, cost: 3, amount: 130, desc: __T('Uzun sıçramalar, engel aşma') },
  ],
};

export const METHODS = {
  kinetik: {
    name: __T('Kinetik Çarpıcı'),
    ref: __T('NASA DART (2022) benzeri'),
    desc: __T('Yüksek hızla asteroide çarpar. Hızlı ve ucuz, ama sonuç asteroitin iç yapısına (β) bağlı.'),
  },
  iyon: {
    name: __T('Ankrajlı İyon İtici'),
    ref: __T('Asteroit Yönlendirme kavramı'),
    desc: __T('Asteroitin kutbuna sabitlenir ve yıllarca iter. Hassas, ama güç ve zaman ister.'),
  },
  traktor: {
    name: __T('Yerçekimi Traktörü'),
    ref: __T('NASA/ESA kavram çalışmaları'),
    desc: __T('Temas etmeden, kendi kütlesinin çekimiyle asteroidi yavaşça çeker. Çok hassas ama çok zayıf.'),
  },
};

export const DEFAULT_CONFIG = {
  launcher: 'orta',
  methods: { kinetik: true, iyon: false, traktor: false },
  impactorMass: 3000,
  ionCount: 2,
  ionYears: 2,
  tractorMass: 12000,
  tractorYears: 3,
  rover: {
    power: 'gunes_buyuk',
    battery: 'M',
    instruments: { spektrometre: true, sismometre: true, matkap: false },
    antenna: 'kucuk',
    fuel: 'az',
  },
};

export function fmt(n, d = 0) {
  return Number(n).toLocaleString(__T('tr-TR'), { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtYear(y) { return dec(y.toFixed(1)); }
