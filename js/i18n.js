// Dil desteği: varsayılan İngilizce, menüden Türkçe seçilebilir.
// Kaynak kodda metinler Türkçe yazılır; T('...') ve T`...` İngilizce sözlükten (i18n_en.js) çevirir.
import { EN } from './i18n_en.js';

function detect() {
  try {
    const p = new URLSearchParams(location.search).get('lang');
    if (p === 'tr' || p === 'en') { try { localStorage.setItem('tufan_lang', p); } catch (e) {} return p; }
  } catch (e) {}
  try {
    const s = localStorage.getItem('tufan_lang');
    if (s === 'tr' || s === 'en') return s;
  } catch (e) {}
  return 'en';
}

export const LANG = detect();
// Yüzde ve ondalık biçimi: TR '%60' ve '2028,3', EN '60%' ve '2028.3'
export const pct = (n) => (LANG === 'tr' ? '%' + n : n + '%');
export const dec = (s) => (LANG === 'tr' ? String(s).replace('.', ',') : String(s));
const has = (k) => Object.prototype.hasOwnProperty.call(EN, k);

export function T(strings, ...vals) {
  if (typeof strings === 'string') return (LANG === 'en' && has(strings)) ? EN[strings] : strings;
  if (!Array.isArray(strings)) return strings;
  const key = strings.join('${}');
  if (LANG === 'en' && has(key)) { let k = 0; return EN[key].replace(/\$\{\}/g, () => String(vals[k++])); }
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += String(vals[i]) + strings[i + 1];
  return out;
}

// index.html içindeki sabit metinleri çevirir.
export function translateDOM(root) {
  if (LANG !== 'en' || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const p = n.parentNode && n.parentNode.nodeName;
    if (p === 'SCRIPT' || p === 'STYLE') continue;
    const v = n.nodeValue, t = v.trim();
    if (t && has(t)) n.nodeValue = v.slice(0, v.indexOf(t)) + EN[t] + v.slice(v.indexOf(t) + t.length);
  }
  if (root.querySelectorAll) for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) {
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && has(v.trim())) el.setAttribute(a, EN[v.trim()]); }
  }
}

function setLang(l) {
  try { localStorage.setItem('tufan_lang', l); } catch (e) {}
  const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
  if (LANG === 'en' && has(document.title)) document.title = EN[document.title];
  translateDOM(document.body);
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.classList.toggle('on', b.dataset.lang === LANG);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
  }
}
