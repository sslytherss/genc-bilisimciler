import * as THREE from 'three';

/**
 * Konsept görseldeki altın devre yollu, mavi ışıklı küp yüzeyini tarayıcıda çizer.
 * Hiç görsel dosyası indirmeden (mobil veri dostu) iki doku üretir:
 *  - map:         koyu metal zemin + altın yollar + altın çerçeve
 *  - emissiveMap: yalnızca parlayan mavi noktalar ve hafif yol ışıltısı
 */

const GOLD = '#c9a25e';
const GOLD_LIGHT = '#f0d49a';
const GOLD_DARK = '#7a5c2c';
const BLUE = '#8fd3ff';

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

type Trace = { points: [number, number][]; width: number; lit: boolean };

function makeTraces(size: number, inset: number, rng: Rng, count: number): Trace[] {
  const traces: Trace[] = [];
  const step = size / 32;
  const min = inset + step;
  const max = size - inset - step;

  for (let i = 0; i < count; i++) {
    // Yolların çoğu çerçeveden içeri doğru başlar, bir kısmı ortadaki çipten dışarı.
    let x: number;
    let y: number;
    let dir: number;
    const side = Math.floor(rng() * 5);
    const along = min + rng() * (max - min);
    if (side === 0) [x, y, dir] = [min, along, 0];
    else if (side === 1) [x, y, dir] = [max, along, 4];
    else if (side === 2) [x, y, dir] = [along, min, 2];
    else if (side === 3) [x, y, dir] = [along, max, 6];
    else [x, y, dir] = [size / 2 + (rng() - 0.5) * size * 0.2, size / 2 + (rng() - 0.5) * size * 0.2, Math.floor(rng() * 8)];

    x = Math.round(x / step) * step;
    y = Math.round(y / step) * step;
    const points: [number, number][] = [[x, y]];
    const segments = 2 + Math.floor(rng() * 4);

    for (let s = 0; s < segments; s++) {
      const len = step * (2 + Math.floor(rng() * 6));
      const [dx, dy] = DIRS[dir];
      const nx = Math.min(max, Math.max(min, x + dx * len));
      const ny = Math.min(max, Math.max(min, y + dy * len));
      if (nx === x && ny === y) break;
      x = nx;
      y = ny;
      points.push([x, y]);
      // 45° kıvrımlar: PCB yollarının karakteristik görünümü
      dir = (dir + (rng() < 0.5 ? 1 : 7)) % 8;
    }

    if (points.length > 1) {
      traces.push({ points, width: step * (0.18 + rng() * 0.22), lit: rng() < 0.35 });
    }
  }
  return traces;
}

function strokeTrace(ctx: CanvasRenderingContext2D, t: Trace) {
  ctx.beginPath();
  ctx.moveTo(t.points[0][0], t.points[0][1]);
  for (const [px, py] of t.points.slice(1)) ctx.lineTo(px, py);
  ctx.stroke();
}

export type CircuitTextures = { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture };

export function createCircuitTextures(seed: number, size = 512, framed = true): CircuitTextures {
  const rng = mulberry32(seed);
  const inset = framed ? size * 0.075 : 0;

  const base = document.createElement('canvas');
  base.width = base.height = size;
  const ctx = base.getContext('2d')!;

  const glow = document.createElement('canvas');
  glow.width = glow.height = size;
  const g = glow.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);

  // Zemin: koyu, hafif fırçalanmış metal
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#1a1a1c');
  bg.addColorStop(1, '#0b0b0d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng() * 0.025})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1);
  }

  // Merkez çip bloğu (bazı yüzlerde)
  if (rng() < (framed ? 0.6 : 1)) {
    const chip = size * (0.16 + rng() * 0.1);
    const cx = size / 2 - chip / 2;
    const cy = size / 2 - chip / 2;
    ctx.fillStyle = '#070708';
    ctx.fillRect(cx, cy, chip, chip);
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, chip, chip);
    const pins = 6;
    ctx.fillStyle = GOLD;
    for (let p = 0; p < pins; p++) {
      const o = cx + (chip / pins) * (p + 0.5) - 2;
      ctx.fillRect(o, cy - 7, 4, 7);
      ctx.fillRect(o, cy + chip, 4, 7);
    }
    // Çipin üzerinde küçük ışıklı ızgara
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        if (rng() < 0.5) continue;
        const px = cx + chip * (0.2 + a * 0.2);
        const py = cy + chip * (0.2 + b * 0.2);
        g.fillStyle = BLUE;
        g.globalAlpha = 0.5 + rng() * 0.5;
        g.fillRect(px - 2, py - 2, 4, 4);
      }
    }
    g.globalAlpha = 1;
  }

  // Altın devre yolları
  const traces = makeTraces(size, inset, rng, 26 + Math.floor(rng() * 12));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of traces) {
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = t.width + 2.5;
    strokeTrace(ctx, t);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = t.width;
    strokeTrace(ctx, t);

    const [ex, ey] = t.points[t.points.length - 1];
    const r = t.width * 1.4 + 2;
    ctx.fillStyle = GOLD_LIGHT;
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (t.lit) {
      g.strokeStyle = 'rgba(143,211,255,0.22)';
      g.lineWidth = t.width;
      g.lineCap = 'round';
      strokeTrace(g, t);
      const halo = g.createRadialGradient(ex, ey, 0, ex, ey, r * 3.2);
      halo.addColorStop(0, 'rgba(220,245,255,1)');
      halo.addColorStop(0.35, 'rgba(143,211,255,0.85)');
      halo.addColorStop(1, 'rgba(143,211,255,0)');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(ex, ey, r * 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (!framed) return finish(base, glow);

  // Kalın altın çerçeve (konsept görseldeki pahlı kenarlar)
  const frame = ctx.createLinearGradient(0, 0, size, size);
  frame.addColorStop(0, GOLD_LIGHT);
  frame.addColorStop(0.5, GOLD);
  frame.addColorStop(1, GOLD_DARK);
  ctx.strokeStyle = frame;
  ctx.lineWidth = inset * 0.9;
  ctx.strokeRect(inset * 0.45, inset * 0.45, size - inset * 0.9, size - inset * 0.9);
  ctx.strokeStyle = '#0b0b0d';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inset + 5, inset + 5, size - inset * 2 - 10, size - inset * 2 - 10);

  return finish(base, glow);
}

function finish(base: HTMLCanvasElement, glow: HTMLCanvasElement): CircuitTextures {
  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(glow);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/** Işık hâleleri ve toz parçacıkları için yumuşak dairesel doku. */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
