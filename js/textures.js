// Prosedürel doku üretimi (canvas). İnternet gerektirmez.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function tileNoise(size, seed) {
  // Döşenebilir (kenarları birleşen) çok oktavlı değer gürültüsü
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let g = 4; g <= 128; g *= 2) {
    const grid = new Float32Array(g * g);
    for (let i = 0; i < g * g; i++) grid[i] = rand();
    const cell = size / g;
    for (let y = 0; y < size; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const ya = (y0 % g) * g, yb = ((y0 + 1) % g) * g;
      for (let x = 0; x < size; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const xa = x0 % g, xb = (x0 + 1) % g;
        const a = grid[ya + xa], b = grid[ya + xb], c = grid[yb + xa], d = grid[yb + xb];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(h, size, strength) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
  }
  return data;
}

function toTexture(data, size, srgb) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

export function makeRegolithTextures(size = 512, seed = 5) {
  const h = tileNoise(size, seed);
  const rand = mulberry32(seed + 1);
  // Küçük çukurlar ve çakıllar
  for (let k = 0; k < 160; k++) {
    const cx = rand() * size, cy = rand() * size;
    const r = 3 + Math.pow(rand(), 2) * 22;
    const depth = 0.04 + rand() * 0.08;
    const pebble = rand() < 0.45;
    const R = Math.ceil(r * 1.6);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const q = Math.hypot(dx, dy) / r;
        if (q > 1.6) continue;
        const x = ((Math.floor(cx + dx) % size) + size) % size;
        const y = ((Math.floor(cy + dy) % size) + size) % size;
        let v;
        if (pebble) v = q < 1 ? depth * 0.9 * Math.sqrt(1 - q * q) : 0;
        else v = q < 1 ? depth * (q * q - 1) : depth * 0.25 * Math.exp(-(((q - 1) * 3) ** 2));
        h[y * size + x] += v;
      }
    }
  }
  const normal = toTexture(heightToNormal(h, size, 9), size, false);
  const alb = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, 150 + h[i] * 130));
    alb[i * 4] = v; alb[i * 4 + 1] = v * 0.98; alb[i * 4 + 2] = v * 0.95; alb[i * 4 + 3] = 255;
  }
  const albedo = toTexture(alb, size, true);
  return { normal, albedo };
}

export function makeGlowTexture(size = 128, falloff = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - d);
      const v = Math.pow(a, falloff);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = v * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSmokeTexture(size = 128, seed = 3) {
  const h = tileNoise(size, seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const base = Math.max(0, 1 - d);
      const a = Math.pow(base, 1.4) * (0.55 + 0.9 * h[y * size + x]);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSolarTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1a3d';
  ctx.fillRect(0, 0, s, s);
  const n = 8;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const g = ctx.createLinearGradient(i * 32, j * 32, i * 32 + 32, j * 32 + 32);
      g.addColorStop(0, '#16306b'); g.addColorStop(1, '#0a1838');
      ctx.fillStyle = g;
      ctx.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
      ctx.strokeStyle = 'rgba(160,190,230,0.35)';
      ctx.beginPath(); ctx.moveTo(i * 32 + 16, j * 32 + 2); ctx.lineTo(i * 32 + 16, j * 32 + 30); ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeTreadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2b2e'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#4a4c50';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + 8, 32); ctx.lineTo(i * 16, 64); ctx.lineTo(i * 16 + 5, 64); ctx.lineTo(i * 16 + 13, 32); ctx.lineTo(i * 16 + 5, 0);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeGroundTexture(seed = 17) {
  const size = 512;
  const h = tileNoise(size, seed);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = h[i];
    data[i * 4] = 120 + v * 90; data[i * 4 + 1] = 98 + v * 70; data[i * 4 + 2] = 72 + v * 50; data[i * 4 + 3] = 255;
  }
  return toTexture(data, size, true);
}

export function makeConcreteTexture(seed = 21) {
  const size = 512;
  const h = tileNoise(size, seed);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let v = 140 + h[i] * 60;
      if (x % 128 < 2 || y % 128 < 2) v -= 40; // derz çizgileri
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v * 0.97; data[i * 4 + 3] = 255;
    }
  }
  return toTexture(data, size, true);
}
