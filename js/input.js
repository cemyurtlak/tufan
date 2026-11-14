// Klavye + fare girdisi (Pointer Lock destekli)
export const input = {
  keys: new Set(),
  pressed: new Set(),
  mdx: 0, mdy: 0, wheel: 0,
  locked: false,
  dragging: false,
  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; this.wheel = 0; },
  axis() {
    const k = this.keys;
    return {
      fwd: (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0,
      back: (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0,
      left: (k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0,
      right: (k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0,
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
      jump: k.has('Space'),
      interact: k.has('KeyE'),
    };
  },
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (input.locked || input.dragging) { input.mdx += e.movementX || 0; input.mdy += e.movementY || 0; }
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2 || !input.locked) input.dragging = true; });
  window.addEventListener('mouseup', () => (input.dragging = false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
}
