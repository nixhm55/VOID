import type { Track } from '@/lib/library';
import type { Hue4 } from '../../core/voidCore';

export type { Hue4 };
export type ArtResult = { background: string; ambient: Hue4; grain: number };
export type ArtFamily = { from: number; to: number; weight: number };

const ART_FAMILIES: readonly ArtFamily[] = [
  { from: 346, to: 368, weight: 26 },
  { from: 8, to: 26, weight: 18 },
  { from: 30, to: 52, weight: 20 },
  { from: 316, to: 344, weight: 12 },
  { from: 268, to: 312, weight: 9 },
  { from: 214, to: 262, weight: 6 },
  { from: 176, to: 206, weight: 4 },
  { from: 128, to: 168, weight: 3 },
];

const ART_LAYOUTS = [
  'orb',
  'duo',
  'corner',
  'horizon',
  'trio',
  'sun',
  'edge',
  'wash',
] as const;

const seedWords = (seed: string): [number, number, number, number] => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
};

const sfc32 = (a: number, b: number, c: number, d: number) => () => {
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;

  const t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;

  const r = (t + d) | 0;
  c = (c + r) | 0;

  return (r >>> 0) / 4294967296;
};

const num = (value: number, digits = 0) => value.toFixed(digits);

const hsla = (
  h: number,
  s: number,
  l: number,
  a?: number,
) =>
  a === undefined
    ? `hsl(${num(h, 1)} ${num(s)}% ${num(l, 1)}%)`
    : `hsl(${num(h, 1)} ${num(s)}% ${num(l, 1)}% / ${num(a, 2)})`;

export function composeArt(seed: string): ArtResult {
  const rnd = sfc32(...seedWords(seed));
  for (let i = 0; i < 12; i += 1) rnd();
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const chance = (p: number) => rnd() < p;
  const sign = () => (rnd() < 0.5 ? -1 : 1);
  const wrap = (h: number) => ((h % 360) + 360) % 360;

  const pickFamily = (list: readonly ArtFamily[]) => {
    const total = list.reduce((sum, item) => sum + item.weight, 0);
    let roll = rnd() * total;
    for (const item of list) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return list[list.length - 1];
  };

  const hueIn = (family: ArtFamily) => wrap(range(family.from, family.to));
  const family = pickFamily(ART_FAMILIES);
  const warmFamilies = ART_FAMILIES.slice(0, 4);
  const h1 = hueIn(family);
  const roll = rnd();
  const h2 =
    roll < 0.5
      ? hueIn(pickFamily(warmFamilies.filter((item) => item !== family)))
      : roll < 0.86
        ? wrap(h1 + sign() * range(14, 46))
        : wrap(h1 + sign() * range(70, 130));

  const h3 = chance(0.5) ? hueIn(ART_FAMILIES[2]) : wrap(h2 + sign() * range(12, 44));
  const lush = chance(0.24);
  const s1 = range(74, 98);
  const s2 = range(66, 96);
  const s3 = range(62, 94);
  const lit = range(46, 60);
  const size = lush ? 1.26 : 1;
  const alpha = (lo: number, hi: number) => Math.min(1, range(lo, hi) * (lush ? 1.2 : 1));

  const glow = (
    x: number, y: number, rx: number, ry: number, h: number, s: number, l: number, a: number, end = 100,
  ) =>
    `radial-gradient(ellipse ${num(rx)}% ${num(ry)}% at ${num(x, 1)}% ${num(y, 1)}%, ${hsla(
      h, s, Math.min(94, l + 6), a,
    )} 0, ${hsla(h, s, l, a * 0.64)} ${num(end * 0.26)}%, ${hsla(
      h, s, Math.max(6, l - 8), a * 0.32,
    )} ${num(end * 0.56)}%, ${hsla(
      h, s, Math.max(4, l - 16), a * 0.11,
    )} ${num(end * 0.8)}%, transparent ${num(end)}%)`;

  const lights: string[] = [];
  const add = (x: number, y: number, rx: number, ry: number, h: number, s: number, l: number, a: number, end?: number) => {
    lights.push(glow(x, y, rx, ry, h, s, l, a, end));
  };
  let focus: [number, number] = [50, 50];

  switch (ART_LAYOUTS[Math.floor(rnd() * ART_LAYOUTS.length)]) {
    case 'orb': {
      const x = range(24, 76);
      const y = range(32, 84);
      const r = range(34, 62) * size;
      add(x, y, r, r * range(0.86, 1.14), h1, s1, lit, alpha(0.7, 0.95), range(80, 100));
      add(100 - x + range(-14, 14), 100 - y + range(-14, 14), range(40, 86), range(36, 80), h2, s2, lit - 6, alpha(0.34, 0.6));
      focus = [x, y];
      break;
    }
    case 'duo': {
      const flip = chance(0.5);
      const xa = range(10, 40);
      const xb = range(60, 90);
      const ya = range(18, 78);
      const yb = range(18, 78);
      add(flip ? xb : xa, ya, range(30, 56) * size, range(30, 56) * size, h1, s1, lit, alpha(0.62, 0.9), 96);
      add(flip ? xa : xb, yb, range(28, 54) * size, range(28, 54) * size, h2, s2, lit - 4, alpha(0.55, 0.85), 96);
      focus = [flip ? xb : xa, ya];
      break;
    }
    case 'corner': {
      const left = chance(0.5);
      const top = chance(0.5);
      const x = left ? range(-6, 18) : range(82, 106);
      const y = top ? range(-6, 20) : range(80, 106);
      add(x, y, range(70, 118) * size, range(62, 110) * size, h1, s1, lit, alpha(0.66, 0.95));
      add(100 - x + range(-10, 10), 100 - y + range(-10, 10), range(44, 82), range(40, 78), h2, s2, lit - 4, alpha(0.5, 0.82));
      focus = [x, y];
      break;
    }
    case 'horizon': {
      const low = chance(0.5);
      const y = low ? range(80, 106) : range(-6, 20);
      add(range(24, 76), y, range(84, 130) * size, range(26, 46) * size, h1, s1, lit, alpha(0.7, 0.95));
      add(range(10, 90), low ? range(-8, 16) : range(84, 108), range(36, 72), range(30, 60), h2, s2, lit - 6, alpha(0.3, 0.56));
      focus = [50, y];
      break;
    }
    case 'trio': {
      const base = range(0, Math.PI * 2);
      const radius = range(22, 38);
      const hues = [h1, h2, h3];
      const sats = [s1, s2, s3];
      hues.forEach((h, i) => {
        const angle = base + i * 2.0944 + range(-0.5, 0.5);
        add(
          50 + Math.cos(angle) * radius + range(-6, 6),
          50 + Math.sin(angle) * radius + range(-6, 6),
          range(30, 52) * size,
          range(30, 52) * size,
          h, sats[i], lit - i * 2, alpha(0.5, 0.82), 98,
        );
      });
      break;
    }
    case 'sun': {
      const x = range(28, 72);
      const y = range(28, 72);
      const r = range(7, 15);
      add(x, y, r, r, h3, Math.min(100, s3 + 6), 84, alpha(0.6, 0.9), 60);
      add(x, y, r * 4.6, r * 4.6, h1, s1, lit, alpha(0.5, 0.8));
      add(range(-10, 110), range(-10, 110), range(60, 110), range(54, 100), h2, s2, lit - 8, alpha(0.3, 0.56));
      focus = [x, y];
      break;
    }
    case 'edge': {
      const left = chance(0.5);
      const x = left ? range(-12, 6) : range(94, 112);
      const y = range(18, 82);
      add(x, y, range(52, 90) * size, range(46, 84) * size, h1, s1, lit, alpha(0.7, 0.95));
      add(left ? range(70, 100) : range(0, 30), range(10, 90), range(34, 66), range(32, 64), h2, s2, lit - 4, alpha(0.4, 0.7), 96);
      focus = [x, y];
      break;
    }
    default: {
      lights.push(
        `linear-gradient(${num(range(0, 360))}deg, ${hsla(h1, s1, lit - 8, alpha(0.5, 0.8))}, transparent ${num(range(48, 70))}%, ${hsla(h2, s2, lit - 10, alpha(0.45, 0.75))})`,
      );
      const x = range(20, 80);
      const y = range(20, 80);
      add(x, y, range(28, 52) * size, range(28, 52) * size, h3, s3, lit, alpha(0.5, 0.8), 96);
      focus = [x, y];
    }
  }

  const extras: string[] = [];
  if (chance(0.45)) {
    extras.push(
      glow(range(10, 90), range(10, 90), range(70, 120), range(40, 84), h3, s3, 64, alpha(0.14, 0.3)),
      glow(range(10, 90), range(10, 90), range(60, 110), range(52, 104), h2, s2, 58, alpha(0.12, 0.26)),
    );
  }
  if (chance(0.5)) {
    const left = chance(0.5);
    const top = chance(0.5);
    extras.push(glow(left ? range(-10, 8) : range(92, 110), top ? range(-10, 10) : range(90, 110), range(40, 80), range(36, 74), h3, s3, lit, alpha(0.28, 0.55)));
  }

  const clamp = (value: number) => Math.max(20, Math.min(80, value));
  const strength = range(0.3, 0.62) * (lush ? 0.7 : 1);
  const vignette = `radial-gradient(ellipse ${num(range(78, 110))}% ${num(range(78, 110))}% at ${num(clamp(focus[0]), 1)}% ${num(clamp(focus[1]), 1)}%, transparent 0, transparent 34%, ${hsla(h1, 50, 3, strength * 0.45)} 70%, ${hsla(h1, 50, 2, strength)} 100%)`;
  const shade = `linear-gradient(${num(range(0, 360))}deg, hsl(0 0% 100% / ${num(range(0.02, 0.07), 2)}), transparent ${num(range(30, 48))}%, hsl(0 0% 0% / ${num(range(0.12, 0.34), 2)}))`;
  const baseL = lush ? range(10, 18) : range(4, 9);
  const base = `linear-gradient(${num(range(0, 360))}deg, ${hsla(h1, range(34, 60), baseL + range(0, 3))}, ${hsla(h2, range(30, 56), Math.max(2, baseL - range(1, 4)))})`;

  return {
    background: [vignette, shade, ...extras, ...lights, base].join(', '),
    ambient: [Math.round(h1), Math.round(h2), Math.round(h3), Math.round(Math.min(94, s1))],
    grain: range(0.1, 0.26),
  };
}

const artCache = new Map<string, ArtResult>();
export const artForSeed = (seed: string) => {
  let art = artCache.get(seed);
  if (!art) { art = composeArt(seed); artCache.set(seed, art); }
  return art;
};
export const artFor = (track: Track, identity?: string) => artForSeed(identity ?? `${track.id}|${track.fileName}|${track.fileSize}`);

// Sample artwork ambient from local blob
export async function sampleArtworkAmbient(blob: Blob): Promise<Hue4 | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 20;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const bins = new Array<number>(24).fill(0);
    let satSum = 0, weightSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d < .08) continue;
      const l = (max + min) / 2;
      const mid = 1 - Math.abs(2 * l - 1);
      const s = d / (mid || 1);
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const weight = d * mid;
      bins[Math.floor(h / 15) % 24] += weight;
      satSum += s * weight; weightSum += weight;
    }
    if (weightSum < 4) return [215, 215, 215, 6];
    const score = (i: number) => bins[(i + 23) % 24] * .5 + bins[i] + bins[(i + 1) % 24] * .5;
    let best = 0;
    for (let i = 1; i < 24; i += 1) if (score(i) > score(best)) best = i;
    let second = -1;
    for (let i = 0; i < 24; i += 1) {
      const gap = Math.min((i - best + 24) % 24, (best - i + 24) % 24);
      if (gap >= 5 && (second < 0 || score(i) > score(second))) second = i;
    }
    const h1 = best * 15 + 7.5;
    const h2 = second >= 0 && score(second) > score(best) * .25 ? second * 15 + 7.5 : (h1 + 28) % 360;
    const h3 = (h1 + 338) % 360;
    const saturation = Math.max(54, Math.min(94, Math.round((satSum / weightSum) * 105)));
    return [Math.round(h1), Math.round(h2), Math.round(h3), saturation];
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

// Sample ambient from remote image URL (JioSaavn / streaming cover)
export async function sampleImageUrlAmbient(url: string): Promise<Hue4 | null> {
  if (!url || /archive\.org|ytimg\.com|fbcdn\.net/i.test(url)) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const size = 20;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const bins = new Array<number>(24).fill(0);
    let satSum = 0, weightSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d < .08) continue;
      const l = (max + min) / 2;
      const mid = 1 - Math.abs(2 * l - 1);
      const s = d / (mid || 1);
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const weight = d * mid;
      bins[Math.floor(h / 15) % 24] += weight;
      satSum += s * weight; weightSum += weight;
    }
    if (weightSum < 4) return [215, 215, 215, 6];
    const score = (i: number) => bins[(i + 23) % 24] * .5 + bins[i] + bins[(i + 1) % 24] * .5;
    let best = 0;
    for (let i = 1; i < 24; i += 1) if (score(i) > score(best)) best = i;
    let second = -1;
    for (let i = 0; i < 24; i += 1) {
      const gap = Math.min((i - best + 24) % 24, (best - i + 24) % 24);
      if (gap >= 5 && (second < 0 || score(i) > score(second))) second = i;
    }
    const h1 = best * 15 + 7.5;
    const h2 = second >= 0 && score(second) > score(best) * .25 ? second * 15 + 7.5 : (h1 + 28) % 360;
    const h3 = (h1 + 338) % 360;
    const saturation = Math.max(54, Math.min(94, Math.round((satSum / weightSum) * 105)));
    return [Math.round(h1), Math.round(h2), Math.round(h3), saturation];
  } catch { return null; }
}

export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};
