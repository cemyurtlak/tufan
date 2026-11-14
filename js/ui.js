// Ekran yönetimi, bildirimler, geçişler
export const $ = (id) => document.getElementById(id);

export function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
}
export function showAlso(id, on = true) { $(id).classList.toggle('show', on); }

export function toast(msg, kind = 'info', dur = 4.5) {
  const box = $('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 500); }, dur * 1000);
  while (box.children.length > 5) box.firstChild.remove();
}

export function fade(to, dur = 0.6) {
  const f = $('fade');
  f.style.transition = `opacity ${dur}s ease`;
  f.style.opacity = to;
  return new Promise((r) => setTimeout(r, dur * 1000));
}

export function caption(main, sub = '') {
  const c = $('cineCaption'), s = $('cineSub');
  if (c.dataset.t !== main) {
    c.dataset.t = main;
    c.classList.remove('in'); void c.offsetWidth;
    c.textContent = main;
    if (main) c.classList.add('in');
  }
  s.innerHTML = sub;
}

export function mmss(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
