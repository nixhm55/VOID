import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowDown, ArrowUp, AudioLines, Check, ChevronDown, Clock3, Disc3, FileAudio, FolderOpen, Heart, Home,
  ListMusic, ListPlus, Mic2, MoreHorizontal, Music2, PanelLeftClose, PanelLeftOpen, Play, Plus, Search,
  Repeat, Repeat1, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Trash2, Volume1, Volume2, VolumeX, X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  type Playlist, type Preferences, type Track, getPlaylists, getPreferences, getTracks,
  removePlaylist, removeTrack, resolveAudioMimeType, savePlaylist, savePreferences, saveTrack, trackFromFile,
} from '@/lib/library';

type Page = 'home' | 'songs' | 'albums' | 'artists' | 'playlists' | 'favorites' | 'recent' | 'queue' | 'settings';
const defaults: Preferences = { theme: 'system', autoplay: false, volume: 0.72, muted: false, shuffle: false, repeat: 'off' };
const greetings = [
  'Still awake?',
  'The night is quiet.',
  'Before the world wakes.',
  'Good morning.',
  'A good morning starts here.',
  'Good to have you here.',
  'Good afternoon.',
  'Settle into the afternoon.',
  'A little room to listen.',
  'Evening, take your time.',
  'Let the day soften.',
  'The evening is yours.',
];
// `compact` marks the pages that stay visible when the sidebar is collapsed to icons.
const navItems: { id: Page; label: string; icon: typeof Home; group: 'listen' | 'collection'; compact: boolean }[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'listen', compact: true },
  { id: 'recent', label: 'Recently played', icon: Clock3, group: 'listen', compact: true },
  { id: 'songs', label: 'Songs', icon: Music2, group: 'collection', compact: true },
  { id: 'albums', label: 'Albums', icon: Disc3, group: 'collection', compact: false },
  { id: 'artists', label: 'Artists', icon: Mic2, group: 'collection', compact: false },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, group: 'collection', compact: true },
  { id: 'favorites', label: 'Favorites', icon: Heart, group: 'collection', compact: true },
  { id: 'queue', label: 'Queue', icon: AudioLines, group: 'collection', compact: false },
];
const pathFor = (page: Page) => page === 'home' ? '/' : `/${page}`;
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—:—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};
// Elapsed time reads 0:00 at the start of a song instead of a dash.
const formatElapsed = (seconds: number) => (!Number.isFinite(seconds) || seconds <= 0) ? '0:00' : formatTime(seconds);
const compactBytes = (bytes: number) => bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

const countLabel = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
const rangeStyle = (fraction: number) => ({ '--p': `${Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100}%` }) as CSSProperties;
const hueOf = (seed: string) => { let hash = 0; for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360; return hash; };
// Presentation only: a calm mood line for each two-hour block, matching the greetings above.
const moods = [
  'Late hours, low volume', 'Quiet, close, nocturnal', 'Soft light before sunrise', 'Slow start, warm cup',
  'Bright, easy, unhurried', 'Clear head, open window', 'Midday, easy and warm', 'Slow afternoon light',
  'Golden hour, low glare', 'Warm, slow, low light', 'Dim lamps, deep listening', 'Last light, long songs',
];
const moodLabelFor = (hour: number) => hour < 5 || hour >= 18 ? 'Tonight’s mood' : hour < 12 ? 'This morning’s mood' : 'This afternoon’s mood';

/* ───────────────────────── Procedural artwork ─────────────────────────
   Tracks (and albums / artists / playlists) without usable embedded artwork get a locally composed
   cover. Nothing is stored and no images are generated: a stable seed string drives a seeded PRNG,
   and the PRNG chooses many independent things — dominant / secondary / accent hue, a composition
   archetype (where the light sits), 0–2 "forms" out of ten kinds (orb, eclipse, light sweep, horizon
   band, rays, rings, crescent, haze, spot, arc), glow sizes, alphas, shading direction and grain.
   The result is one layered CSS `background` string, so a cover costs a few gradients and no pixels.
   The same seed always produces the same cover, different seeds produce different compositions
   (not one template in many colours), and the dominant hues double as the global ambient colour. */
type Hue4 = readonly [number, number, number, number]; // [h1, h2, h3, saturation %]
type ArtResult = { background: string; ambient: Hue4; grain: number };
const ART_HUES = [350, 358, 8, 18, 28, 38, 46, 142, 156, 168, 180, 192, 204, 216, 228, 242, 256, 270, 284, 298, 314, 330];
const ART_KINDS = ['orb', 'eclipse', 'sweep', 'band', 'rays', 'rings', 'crescent', 'haze', 'spot', 'arc'] as const;
const ART_LAYOUTS = ['corner', 'center', 'low', 'high', 'split', 'diagonal', 'edge', 'scatter'] as const;
const hashOf = (seed: string) => { let hash = 2166136261; for (let i = 0; i < seed.length; i += 1) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const num = (value: number, digits = 0) => value.toFixed(digits);
const hsla = (h: number, s: number, l: number, a?: number) => a === undefined
  ? `hsl(${num(h)} ${num(s)}% ${num(l)}%)`
  : `hsl(${num(h)} ${num(s)}% ${num(l)}% / ${num(a, 2)})`;

function composeArt(seed: string): ArtResult {
  const rnd = mulberry32(hashOf(seed) ^ 0x9e3779b9);
  for (let i = 0; i < 4; i += 1) rnd();
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const chance = (p: number) => rnd() < p;
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const sign = () => (rnd() < .5 ? -1 : 1);
  const wrap = (h: number) => ((h % 360) + 360) % 360;

  const neutral = chance(.07);   // a few silver / ink covers keep the collection from being all colour
  const lush = chance(.24);      // a rich, saturated colour field instead of a dark cover with a light in it
  const h1 = wrap(pick(ART_HUES) + range(-9, 9));
  const spread = rnd();
  const h2 = wrap(h1 + (spread < .52 ? sign() * range(16, 46) : spread < .86 ? sign() * range(70, 150) : range(-8, 8)));
  const h3 = wrap(chance(.25) ? h1 + 180 + range(-24, 24) : h1 + sign() * range(8, 34));
  const s1 = neutral ? range(4, 12) : range(68, 97);
  const s2 = neutral ? s1 : Math.max(48, s1 - range(0, 18));
  const lit = range(50, 64);

  const glow = (x: number, y: number, rx: number, ry: number, h: number, s: number, l: number, a: number, end = 70) =>
    `radial-gradient(ellipse ${num(rx)}% ${num(ry)}% at ${num(x, 1)}% ${num(y, 1)}%, ${hsla(h, s, l, a)} 0, ${hsla(h, s, l - 12, a * .42)} ${num(end * .5)}%, transparent ${num(end)}%)`;

  // Where the light sits: eight archetypes, each with its own placement logic.
  const layout = pick(ART_LAYOUTS);
  let p: [number, number];
  let q: [number, number];
  switch (layout) {
    case 'corner': {
      const left = chance(.5), top = chance(.5);
      p = [left ? range(2, 22) : range(78, 98), top ? range(2, 24) : range(76, 98)];
      q = [100 - p[0] + range(-14, 14), 100 - p[1] + range(-14, 14)];
      break;
    }
    case 'center':
      p = [range(36, 64), range(34, 64)];
      q = [p[0] + sign() * range(24, 42), p[1] + sign() * range(24, 40)];
      break;
    case 'low':
      p = [range(14, 86), range(78, 104)];
      q = [range(0, 100), range(-6, 26)];
      break;
    case 'high':
      p = [range(14, 86), range(-6, 22)];
      q = [range(0, 100), range(78, 106)];
      break;
    case 'split': {
      const first = chance(.5);
      p = [first ? range(8, 30) : range(70, 92), range(20, 80)];
      q = [100 - p[0] + range(-8, 8), range(20, 80)];
      break;
    }
    case 'diagonal': {
      const first = chance(.5);
      p = [first ? range(4, 30) : range(70, 96), range(4, 30)];
      q = [100 - p[0], range(70, 98)];
      break;
    }
    case 'edge': {
      const first = chance(.5);
      p = [first ? range(-8, 6) : range(94, 108), range(14, 86)];
      q = [first ? range(60, 100) : range(0, 40), range(0, 100)];
      break;
    }
    default:
      p = [range(8, 92), range(8, 92)];
      q = [range(8, 92), range(8, 92)];
  }
  const t: [number, number] = [range(6, 94), range(6, 94)];

  // Forms: zero, one or two distinct kinds, each with its own geometry and soft edges.
  const forms: string[] = [];
  const kinds = new Set<(typeof ART_KINDS)[number]>();
  const kindCount = chance(.1) ? 0 : chance(.55) ? 1 : 2;
  while (kinds.size < kindCount) kinds.add(pick(ART_KINDS));
  for (const kind of kinds) {
    const fx = range(26, 74), fy = range(24, 72);
    switch (kind) {
      case 'orb': {
        const r = range(9, 24);
        forms.push(
          `radial-gradient(ellipse ${num(r)}% ${num(r)}% at ${num(fx, 1)}% ${num(fy, 1)}%, ${hsla(h2, s2 * .6, 90, .96)} 0, ${hsla(h2, s2, 66, .86)} 34%, ${hsla(h1, s1, 48, .34)} 72%, transparent 100%)`,
          glow(fx, fy, r * 2.8, r * 2.8, h1, s1, lit, .4, 70),
        );
        break;
      }
      case 'eclipse': {
        const r = range(14, 28);
        forms.push(
          `radial-gradient(ellipse ${num(r * 1.22)}% ${num(r * 1.22)}% at ${num(fx, 1)}% ${num(fy, 1)}%, ${hsla(h1, 30, 3)} 0, ${hsla(h1, 30, 3)} 80%, ${hsla(h2, s2, 72, .9)} 85%, ${hsla(h2, s2, 58, .3)} 93%, transparent 100%)`,
          glow(fx, fy, r * 2.6, r * 2.6, h2, s2, lit, .42, 72),
        );
        break;
      }
      case 'sweep': {
        const angle = range(0, 180), c = range(26, 62), w = range(7, 20);
        forms.push(`linear-gradient(${num(angle)}deg, transparent ${num(c - w)}%, ${hsla(h2, s2 * .8, 82, range(.12, .3))} ${num(c)}%, transparent ${num(c + w * 1.4)}%)`);
        break;
      }
      case 'band': {
        const tilt = range(-16, 16), c = range(34, 72), w = range(6, 16);
        forms.push(`linear-gradient(${num(180 + tilt)}deg, transparent ${num(c - w)}%, ${hsla(h3, s2, 64, range(.22, .42))} ${num(c)}%, ${hsla(h1, s1, 52, .12)} ${num(c + w)}%, transparent ${num(c + w * 2.2)}%)`);
        break;
      }
      case 'rays': {
        const from = range(0, 360), w1 = range(18, 44), gap = range(40, 120);
        forms.push(`conic-gradient(from ${num(from)}deg at ${num(fx, 1)}% ${num(fy, 1)}%, transparent 0deg, ${hsla(h2, s2, 70, .26)} ${num(w1 / 2)}deg, transparent ${num(w1)}deg, transparent ${num(gap)}deg, ${hsla(h3, s2, 66, .18)} ${num(gap + w1 * .6)}deg, transparent ${num(gap + w1 * 1.3)}deg)`);
        break;
      }
      case 'rings': {
        const gap = range(3.5, 9);
        forms.push(`repeating-radial-gradient(ellipse at ${num(fx, 1)}% ${num(fy, 1)}%, transparent 0 ${num(gap, 1)}%, ${hsla(h2, s2 * .7, 84, range(.07, .15))} ${num(gap, 1)}% ${num(gap + .7, 1)}%)`);
        break;
      }
      case 'crescent': {
        const r = range(16, 28), dx = range(5, 11) * sign(), dy = range(-6, 6);
        forms.push(
          `radial-gradient(ellipse ${num(r)}% ${num(r)}% at ${num(fx + dx, 1)}% ${num(fy + dy, 1)}%, ${hsla(h1, 40, 4)} 0, ${hsla(h1, 40, 4)} 90%, transparent 100%)`,
          `radial-gradient(ellipse ${num(r)}% ${num(r)}% at ${num(fx, 1)}% ${num(fy, 1)}%, ${hsla(h2, s2, 80, .95)} 0, ${hsla(h2, s2, 64, .85)} 88%, transparent 100%)`,
          glow(fx, fy, r * 2.4, r * 2.4, h2, s2, lit, .36, 70),
        );
        break;
      }
      case 'haze':
        forms.push(
          glow(fx, fy, range(60, 100), range(26, 46), h3, s2, 62, range(.22, .4), 78),
          glow(100 - fx, 100 - fy, range(40, 80), range(40, 80), h2, s2, 58, range(.16, .3), 75),
        );
        break;
      case 'spot': {
        const r = range(3.5, 7);
        forms.push(
          `radial-gradient(ellipse ${num(r)}% ${num(r)}% at ${num(fx, 1)}% ${num(fy, 1)}%, ${hsla(h2, s2 * .5, 94, .98)} 0, ${hsla(h2, s2, 70, .6)} 45%, transparent 100%)`,
          glow(fx, fy, r * 6, r * 6, h2, s2, lit, .5, 70),
        );
        break;
      }
      default: {
        const radius = range(56, 110), ax = range(-10, 110), ay = range(40, 130);
        forms.push(`radial-gradient(ellipse ${num(radius)}% ${num(radius)}% at ${num(ax, 1)}% ${num(ay, 1)}%, transparent 0, transparent 84%, ${hsla(h2, s2, 78, .5)} 92%, ${hsla(h1, s1, 60, .12)} 97%, transparent 100%)`);
      }
    }
  }

  const primary = glow(p[0], p[1], range(40, lush ? 118 : 84), range(34, lush ? 118 : 84), h1, s1, lit, range(lush ? .8 : .56, lush ? 1 : .9), lush ? 86 : 70);
  const secondary = glow(q[0], q[1], range(36, 92), range(30, 92), h2, s2, lit - 4, range(.34, .7), 72);
  const accent = chance(.62) ? glow(t[0], t[1], range(14, 34), range(14, 34), h3, s2, 64, range(.3, .62), 70) : '';
  const shade = `linear-gradient(${num(range(0, 360))}deg, hsl(0 0% 100% / ${num(range(.02, .08), 2)}), transparent ${num(range(26, 44))}%, hsl(0 0% 0% / ${num(range(.18, .5), 2)}))`;
  const baseL = lush ? range(10, 20) : range(4, 11);
  const base = `linear-gradient(${num(range(0, 360))}deg, ${hsla(h1, neutral ? 6 : range(26, 52), baseL)}, ${hsla(h2, neutral ? 6 : range(24, 46), Math.max(2, baseL - range(1, 6)))})`;

  return {
    background: [...forms, shade, accent, secondary, primary, base].filter(Boolean).join(', '),
    ambient: [Math.round(h1), Math.round(h2), Math.round(h3), neutral ? 6 : Math.round(Math.min(94, s1))],
    grain: range(.08, .26),
  };
}
const artCache = new Map<string, ArtResult>();
const artForSeed = (seed: string) => {
  let art = artCache.get(seed);
  if (!art) { art = composeArt(seed); artCache.set(seed, art); }
  return art;
};
// A song's cover is a pure function of stable file identity, so it never changes across reloads or rescans.
const artFor = (track: Track, identity?: string) => artForSeed(identity ?? `${track.id}|${track.fileName}|${track.fileSize}`);

// Real embedded artwork has no generator seed, so its colour is read once from a 20×20 downscale.
// Weighted by chroma and mid-tone-ness; near-greyscale art falls back to a neutral light.
async function sampleArtworkAmbient(blob: Blob): Promise<Hue4 | null> {
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

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};

/* ───────────────────────── Auto Import ─────────────────────────
   Only formats the browser can genuinely play are imported (checked with canPlayType), and hidden
   files such as macOS "._" companions are ignored. */
const AUTO_IMPORT_EXTENSIONS = new Set(['mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff']);

/* ───────────────────────── Fonts ─────────────────────────
   "Default" and "Savage Roses" are permanent. Imported fonts are read locally, registered with
   document.fonts, and persisted as Blobs in the existing 'void-local-library' IndexedDB (in the
   'preferences' store under 'font:<id>' keys, so no library.ts change or schema bump is needed).
   The active font is applied through --void-font / --void-font-serif on <html>. */
type StoredFont = { id: string; name: string; fileName: string; format: string; size: number; addedAt: number; data: Blob };
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const FONT_MIME: Record<string, string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const FONT_MAX_BYTES = 12 * 1024 * 1024;
const FONT_ROW_PREFIX = 'font:';
const SAVAGE_FAMILY = 'Savage Roses';
const BUILTIN_FONTS = [
  { id: 'dm-serif-display', name: 'DM Serif Display Italic', family: 'DM Serif Display', tag: 'Built in' },
  { id: 'delamoore', name: 'Delamoore', family: 'Delamoore', tag: 'Built in' },
  { id: 'savage-roses', name: SAVAGE_FAMILY, family: SAVAGE_FAMILY, tag: 'Built in' },
  { id: 'wasted-vindey', name: 'Wasted Vindey', family: 'Wasted Vindey', tag: 'Built in' },
] as const;
const FONT_PREVIEW = 'A quiet place for your music';
const fontFamilyFor = (id: string) => `VOID Font ${id.slice(0, 8)}`;
const cleanFontName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Custom font';

async function materializeAudioFile(track: Track): Promise<{ file: File; mimeType: string }> {
  const mimeType = resolveAudioMimeType(track.fileName, track.mimeType || track.file.type);
  // Safari can restore an IndexedDB Blob/File in a state that appears valid to JS but
  // later fails inside the media decoder after a browser restart. Copy the persisted
  // bytes into a fresh File with an explicit MIME type before handing it to <audio>.
  const buffer = await track.file.arrayBuffer();
  const file = new File([buffer], track.fileName, {
    type: mimeType,
    lastModified: Number.isFinite(track.importedAt) ? track.importedAt : Date.now(),
  });
  return { file, mimeType };
}

function fontStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available.')); return; }
    const open = indexedDB.open('void-local-library');
    // Never create the database from here; library.ts owns its schema.
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onerror = () => reject(open.error ?? new Error('Could not open library storage.'));
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('preferences')) { db.close(); reject(new Error('Library storage is not ready.')); return; }
      let result: T | undefined;
      const transaction = db.transaction('preferences', mode);
      const request = action(transaction.objectStore('preferences'));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { db.close(); resolve(result as T); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Font storage was interrupted.')); };
    };
  });
}
const listStoredFonts = async () => {
  const rows = await fontStore<{ id: string; value?: StoredFont }[]>('readonly', store => store.getAll());
  return rows
    .filter(row => typeof row.id === 'string' && row.id.startsWith(FONT_ROW_PREFIX) && row.value?.data)
    .map(row => row.value as StoredFont)
    .sort((a, b) => a.addedAt - b.addedAt);
};
const putStoredFont = (font: StoredFont) => fontStore<IDBValidKey>('readwrite', store => store.put({ id: FONT_ROW_PREFIX + font.id, value: font }));
const deleteStoredFont = (id: string) => fontStore<undefined>('readwrite', store => store.delete(FONT_ROW_PREFIX + id));

async function loadFontFace(id: string, data: ArrayBuffer) {
  const face = new FontFace(fontFamilyFor(id), data);
  await face.load();
  document.fonts.add(face);
  return face;
}

// Reads the family name from the font's 'name' table (TTF/OTF, and WOFF where the browser can inflate it).
// WOFF2 is Brotli-compressed and cannot be read here, so those fall back to the file name.
async function readFontName(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const view = new DataView(buffer);
    const signature = view.getUint32(0);
    let table: DataView | null = null;
    if (signature === 0x774f4646) {
      const count = view.getUint16(12);
      for (let i = 0; i < count; i += 1) {
        const entry = 44 + i * 20;
        if (view.getUint32(entry) !== 0x6e616d65) continue;
        const offset = view.getUint32(entry + 4), packed = view.getUint32(entry + 8), original = view.getUint32(entry + 12);
        const raw = buffer.slice(offset, offset + packed);
        if (packed === original) table = new DataView(raw);
        else if ('DecompressionStream' in window) {
          const stream = new Blob([raw]).stream().pipeThrough(new (window as any).DecompressionStream('deflate'));
          table = new DataView(await new Response(stream).arrayBuffer());
        }
        break;
      }
    } else if (signature === 0x00010000 || signature === 0x4f54544f || signature === 0x74727565) {
      const count = view.getUint16(4);
      for (let i = 0; i < count; i += 1) {
        const entry = 12 + i * 16;
        if (view.getUint32(entry) !== 0x6e616d65) continue;
        table = new DataView(buffer, view.getUint32(entry + 8), view.getUint32(entry + 12));
        break;
      }
    }
    if (!table) return null;
    const records = table.getUint16(2), strings = table.getUint16(4);
    let family: string | null = null, legacy: string | null = null;
    for (let i = 0; i < records; i += 1) {
      const record = 6 + i * 12;
      const platform = table.getUint16(record), nameId = table.getUint16(record + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const length = table.getUint16(record + 8), offset = strings + table.getUint16(record + 10);
      const bytes = new Uint8Array(table.buffer, table.byteOffset + offset, length);
      const text = new TextDecoder(platform === 3 || platform === 0 ? 'utf-16be' : 'windows-1252').decode(bytes).trim();
      if (!text) continue;
      if (nameId === 16 && !family) family = text;
      else if (nameId === 1 && !legacy) legacy = text;
    }
    return family ?? legacy;
  } catch { return null; }
}

// Memoized so playback-time re-renders (timeupdate) never remount or reload artwork.
// `identity` lets albums, artists and playlists seed their own fallback cover instead of borrowing a song's.
const Cover = memo(function Cover({ track, large = false, kind = 'disc', identity }: { track?: Track; large?: boolean; kind?: 'disc' | 'list'; identity?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false); setFailed(false);
    if (!track?.artwork) { setSrc(null); return; }
    const url = URL.createObjectURL(track.artwork); setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [track?.artwork]);
  const Glyph = kind === 'list' ? ListMusic : Disc3;
  // Real embedded artwork always wins; the composed cover only when there is none or it cannot be decoded.
  const art = track && (!track.artwork || failed) ? artFor(track, identity) : null;
  const style = track ? ({ '--cover-h': hueOf(identity ?? `${track.album}|${track.artist}`), ...(art ? { background: art.background, '--grain': art.grain.toFixed(2) } : {}) } as CSSProperties) : undefined;
  return <div className={`${large ? 'cover-large' : 'cover-mini'}${art ? ' art-fallback' : ''}`} style={style} data-testid={large ? 'cover-artwork' : 'cover-thumbnail'}>
    {src && !failed
      ? <img src={src} alt={`${track?.album ?? 'Album'} artwork`} className={loaded ? 'loaded' : ''} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      : art ? (kind === 'list' ? <Glyph aria-hidden="true" /> : null) : <Glyph aria-hidden="true" />}
  </div>;
}, (a, b) => a.large === b.large && a.kind === b.kind && a.identity === b.identity && a.track?.artwork === b.track?.artwork
  && a.track?.id === b.track?.id && a.track?.album === b.track?.album && a.track?.artist === b.track?.artist);

type RowActions = {
  play: (track: Track, list: string[]) => void;
  openAlbum: (name: string) => void;
  move: (track: Track, index: number, step: number) => void;
  removeFromList: (id: string) => void;
  favorite: (track: Track) => void;
  menu: (track: Track) => void;
};

const TrackRows = memo(function TrackRows({ items, showIndex = false, reorder = false, activeId, page, actions }: {
  items: Track[]; showIndex?: boolean; reorder?: boolean; activeId: string | null; page: Page; actions: RowActions;
}) {
  return <div className="table-wrap">
    <table className="track-table">
      <thead><tr><th>{showIndex ? ' ' : 'Title'}</th><th>Album</th><th>Time</th><th aria-label="Actions" /></tr></thead>
      <tbody>{items.map((track, index) => <tr key={track.id} className={activeId === track.id ? 'current' : ''} data-testid={`row-track-${track.id}`}>
        <td><div className="track-main">
          {showIndex ? <span style={{ width: 16, color: 'hsl(var(--muted-foreground))' }}>{index + 1}</span> : null}
          <Cover track={track} />
          <button className="track-main" style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => actions.play(track, items.map(item => item.id))} aria-label={`Play ${track.title}`} data-testid={`button-play-${track.id}`}>
            <span><span className="track-title">{track.title}</span><span className="track-sub">{track.artist}</span></span>
          </button>
        </div></td>
        <td><button className="crumb" style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }} onClick={() => actions.openAlbum(track.album)} data-testid={`link-album-${track.id}`}>{track.album}</button></td>
        <td>{formatTime(track.duration)}</td>
        <td><div className="row-actions">
          {reorder && <><button className="icon-button" aria-label={`Move ${track.title} up`} onClick={() => actions.move(track, index, -1)} data-testid={`button-order-up-${track.id}`}><ArrowUp /></button><button className="icon-button" aria-label={`Move ${track.title} down`} onClick={() => actions.move(track, index, 1)} data-testid={`button-order-down-${track.id}`}><ArrowDown /></button><button className="icon-button" aria-label={`Remove ${track.title} from ${page === 'queue' ? 'queue' : 'playlist'}`} onClick={() => actions.removeFromList(track.id)} data-testid={`button-remove-from-list-${track.id}`}><X /></button></>}
          <button className="icon-button" aria-label={track.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => actions.favorite(track)} data-testid={`button-favorite-${track.id}`}><Heart fill={track.favorite ? 'currentColor' : 'none'} /></button>
          <button className="icon-button" aria-label={`More actions for ${track.title}`} onClick={() => actions.menu(track)} data-testid={`button-track-menu-${track.id}`}><MoreHorizontal /></button>
        </div></td>
      </tr>)}</tbody>
    </table>
  </div>;
});

function VoidGlyph({ playing }: { playing: boolean }) {
  return <svg className="void-glyph" viewBox="0 0 24 24" aria-hidden="true" data-playing={playing}>
    <circle className="g-ring" cx="12" cy="12" r="10" transform="rotate(-19 12 12)" />
    <path className="g-play" d="M10 8.4 L16.4 12 L10 15.6 Z" />
    <g className="g-pause"><rect x="9" y="8.6" width="2.1" height="6.8" rx=".8" /><rect x="12.9" y="8.6" width="2.1" height="6.8" rx=".8" /></g>
  </svg>;
}

/* ───────────────────────── Volume control ─────────────────────────
   Resting state is just the speaker icon. Clicking it grows a compact glass capsule to the left of
   the icon with a thin slider (the icon stays put, neighbouring icons fade). While open, clicking the
   icon toggles mute; the capsule folds away on outside click, Escape, or shortly after the pointer
   or focus leaves. Volume and mute still flow through the app's existing preferences. */
function VolumeControl({ volume, muted, onVolume, onToggleMute, buttonTestId, inputTestId }: {
  volume: number; muted: boolean; onVolume: (value: number) => void; onToggleMute: () => void; buttonTestId: string; inputTestId: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const silent = muted || volume <= 0;
  const Icon = silent ? VolumeX : volume < .4 ? Volume1 : Volume2;
  const clearTimer = () => window.clearTimeout(timer.current);
  const armClose = () => {
    clearTimer();
    timer.current = window.setTimeout(() => { if (!dragging.current) setOpen(false); }, 1800);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const label = open ? (silent ? 'Unmute' : 'Mute') : 'Volume';
  return <div ref={root} className="vol" data-open={open ? '' : undefined} data-silent={silent ? '' : undefined}
    onPointerEnter={clearTimer} onPointerLeave={() => { if (open) armClose(); }}
    onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}
    onBlur={event => { if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) armClose(); }}>
    <div className="vol-pop">
      <input className="vol-slider" style={rangeStyle(silent ? 0 : volume)} type="range" min="0" max="1" step=".01" value={silent ? 0 : volume}
        aria-label="Volume" tabIndex={open ? 0 : -1}
        onChange={event => onVolume(Number(event.target.value))}
        onPointerDown={() => {
          dragging.current = true; clearTimer();
          window.addEventListener('pointerup', () => { dragging.current = false; }, { once: true });
        }}
        data-testid={inputTestId} />
    </div>
    <button className="icon-button vol-button" aria-label={label} aria-expanded={open} title={label}
      onClick={() => { if (open) onToggleMute(); else setOpen(true); }} data-testid={buttonTestId}>
      <Icon key={silent ? 'silent' : 'sound'} />
    </button>
  </div>;
}

function App() {
  const [location, setLocation] = useLocation();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('void-queue') || '[]') as string[]; } catch { return []; }
  });
  const [page, setPage] = useState<Page>('home');
  const [greetingHour, setGreetingHour] = useState(() => new Date().getHours());
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [modal, setModal] = useState<'playlist' | 'rename' | 'add-to-playlist' | 'properties' | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [contextTrack, setContextTrack] = useState<Track | null>(null);
  const [detail, setDetail] = useState<{ kind: 'album' | 'artist' | 'playlist'; name: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMenu, setImportMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('void-sidebar') === 'collapsed'; } catch { return false; }
  });
  const [fontId, setFontId] = useState<string>(() => {
    try { return localStorage.getItem('void-font') || 'default'; } catch { return 'default'; }
  });
  const [customFonts, setCustomFonts] = useState<StoredFont[]>([]);
  const [fontsStatus, setFontsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [savageState, setSavageState] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [fontBusy, setFontBusy] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // Ambient colour of the playing track: [h1, h2, h3, saturation]. Drives the whole environment.
  const [atmos, setAtmos] = useState<Hue4 | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const fontFaces = useRef(new Map<string, FontFace>());
  const orbRef = useRef<HTMLDivElement>(null);
  const orbFrame = useRef(0);
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const npArt = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const themeTint = useRef<[number, number, number] | null>(null);
  expandedRef.current = expanded;
  closingRef.current = closing;
  const activeTrack = tracks.find(track => track.id === activeId) ?? null;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3400);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [storedTracks, storedPlaylists, storedPrefs] = await Promise.all([getTracks(), getPlaylists(), getPreferences()]);
      setTracks(storedTracks.sort((a, b) => b.importedAt - a.importedAt));
      setPlaylists(storedPlaylists.sort((a, b) => a.createdAt - b.createdAt));
      if (storedPrefs) {
        setPrefs({ ...defaults, ...storedPrefs });
        try { localStorage.setItem('void-theme', storedPrefs.theme); } catch { /* Theme still applies from IndexedDB. */ }
      }
      setIsReady(true);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Local library storage could not be opened.');
      setIsReady(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const pageFromPath = location === '/' ? 'home' : location.slice(1).split('/')[0] as Page;
    if (['home', 'songs', 'albums', 'artists', 'playlists', 'favorites', 'recent', 'queue', 'settings'].includes(pageFromPath)) setPage(pageFromPath);
  }, [location]);

  // Handle theme transitions seamlessly
  useEffect(() => {
    const root = document.documentElement;
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const applyTheme = () => {
      root.classList.toggle('dark', dark);
      root.dataset.theme = dark ? 'dark' : 'light';
    };

    if ('startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      (document as any).startViewTransition(applyTheme);
    } else {
      applyTheme();
    }
  }, [prefs.theme]);

  useEffect(() => {
    let timer = 0;
    const refreshGreeting = () => {
      const now = new Date();
      setGreetingHour(now.getHours());
      const nextChange = new Date(now);
      nextChange.setHours(now.getHours() + (now.getHours() % 2 ? 1 : 2), 0, 0, 120);
      timer = window.setTimeout(refreshGreeting, Math.max(1000, nextChange.getTime() - now.getTime()));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        refreshGreeting();
      }
    };
    refreshGreeting();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('void-queue', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    try { localStorage.setItem('void-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded'); } catch { /* Layout still works for this session. */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (e: MediaQueryListEvent) => {
      if (prefs.theme === 'system') {
        const dark = e.matches;
        const applyTheme = () => {
          document.documentElement.classList.toggle('dark', dark);
          document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        };
        if ('startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          (document as any).startViewTransition(applyTheme);
        } else {
          applyTheme();
        }
      }
    };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [prefs.theme]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = prefs.volume;
      audio.current.muted = prefs.muted;
    }
  }, [prefs.volume, prefs.muted]);

  /* ───────────── Global ambient colour ─────────────
     The playing track's colour (generated cover → its seed hues; real artwork → sampled once) is
     written to --h1/--h2/--h3/--s on .void-app. Everything ambient (page light, orb, top band, player
     reflection) derives from those through registered custom properties, so a track change is one
     cross-fade. Below, the browser's own top chrome (Safari tints it from theme-color) follows. */
  useEffect(() => {
    if (!activeTrack) { setAtmos(null); return; }
    const generated = artFor(activeTrack).ambient;
    if (!activeTrack.artwork) { setAtmos(generated); return; }
    let alive = true;
    sampleArtworkAmbient(activeTrack.artwork)
      .then(found => { if (alive) setAtmos(found ?? generated); })
      .catch(() => { if (alive) setAtmos(generated); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrack?.id, activeTrack?.artwork]);

  useEffect(() => {
    if (!atmos && !themeTint.current) return; // never touch the page's own theme-color until a track has played
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const base: [number, number, number] = dark ? [0, 0, 0] : [246, 244, 239];
    let target = base;
    if (atmos) {
      const tint = hslToRgb(atmos[0], atmos[3] / 100, dark ? .5 : .62);
      const mix = dark ? .17 : .13;
      target = [0, 1, 2].map(i => Math.round(base[i] + (tint[i] - base[i]) * mix)) as [number, number, number];
    }
    const apply = (color: number[]) => {
      const value = `#${color.map(v => v.toString(16).padStart(2, '0')).join('')}`;
      let metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
      if (!metas.length) { const meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); metas = [meta]; }
      metas.forEach(meta => { meta.content = value; });
    };
    const from = themeTint.current ?? target;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { themeTint.current = target; apply(target); return; }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 1400);
      const eased = progress * progress * (3 - 2 * progress);
      const current = [0, 1, 2].map(i => Math.round(from[i] + (target[i] - from[i]) * eased)) as [number, number, number];
      themeTint.current = current;
      apply(current);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [atmos, prefs.theme]);

  /* ───────────── Fonts ───────────── */
  // Verify the bundled Savage Roses face is available. The other built-in fonts are
  // declared directly in index.css and do not need IndexedDB/import handling.
  useEffect(() => {
    let alive = true;
    if (!('fonts' in document)) setSavageState('missing');
    else {
      document.fonts.load(`16px "${SAVAGE_FAMILY}"`)
        .then(faces => { if (alive) setSavageState(faces.length ? 'ready' : 'missing'); })
        .catch(error => { console.info('[VOID] Savage Roses font could not be loaded.', error); if (alive) setSavageState('missing'); });
    }
    return () => { alive = false; };
  }, []);

  // Restore imported fonts once the library database exists. Never blocks first paint.
  useEffect(() => {
    if (!isReady) return;
    let alive = true;
    (async () => {
      if (storageError) { setFontsStatus('error'); return; }
      try {
        const stored = await listStoredFonts();
        const usable: StoredFont[] = [];
        for (const font of stored) {
          try {
            fontFaces.current.set(font.id, await loadFontFace(font.id, await font.data.arrayBuffer()));
            usable.push(font);
          } catch (error) { console.warn('[VOID] Stored font could not be restored.', { name: font.name, fileName: font.fileName, error }); }
        }
        if (alive) { setCustomFonts(usable); setFontsStatus('ready'); }
      } catch (error) {
        console.warn('[VOID] Could not read stored fonts.', error);
        if (alive) setFontsStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [isReady, storageError]);

  // A saved selection that no longer exists falls back to Default.
  useEffect(() => {
    if (fontId === 'savage-roses' && savageState === 'missing') setFontId('default');
    else if (fontId.startsWith('custom:') && fontsStatus === 'ready' && !customFonts.some(font => `custom:${font.id}` === fontId)) setFontId('default');
  }, [customFonts, fontId, fontsStatus, savageState]);

  useEffect(() => {
    try { localStorage.setItem('void-font', fontId); } catch { /* Selection still applies for this session. */ }
  }, [fontId]);

  // The one place the selected font reaches the UI.
  useEffect(() => {
    const root = document.documentElement;
    let family: string | null = null;
    const builtin = BUILTIN_FONTS.find(font => font.id === fontId);
    if (builtin && (builtin.id !== 'savage-roses' || savageState !== 'missing')) family = builtin.family;
    else if (fontId.startsWith('custom:')) {
      const font = customFonts.find(item => `custom:${item.id}` === fontId);
      if (font) family = fontFamilyFor(font.id);
    }
    if (family) {
      root.style.setProperty('--void-font', `"${family}", var(--app-font-sans)`);
      root.style.setProperty('--void-font-serif', `"${family}", var(--app-font-serif)`);
    } else {
      root.style.removeProperty('--void-font');
      root.style.removeProperty('--void-font-serif');
    }
  }, [customFonts, fontId, savageState]);

  const importFont = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!FONT_EXTENSIONS.includes(extension)) { notify('Choose a .ttf, .otf, .woff or .woff2 font file.'); return; }
    if (file.size > FONT_MAX_BYTES) { notify('That font file is too large. Choose one under 12 MB.'); return; }
    if (customFonts.some(font => font.fileName === file.name && font.size === file.size)) { notify('That font is already in My Fonts.'); return; }
    setFontBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const name = (await readFontName(buffer)) || cleanFontName(file.name);
      const id = crypto.randomUUID();
      const face = await loadFontFace(id, buffer.slice(0));
      fontFaces.current.set(id, face);
      const font: StoredFont = { id, name, fileName: file.name, format: extension, size: file.size, addedAt: Date.now(), data: new Blob([buffer], { type: FONT_MIME[extension] }) };
      setCustomFonts(items => [...items, font]);
      setFontId(`custom:${id}`);
      try { await putStoredFont(font); notify(`“${name}” added to My Fonts.`); }
      catch (error) { console.warn('[VOID] Font loaded but could not be saved.', error); notify(`“${name}” is active, but could not be saved on this device.`); }
    } catch (error) {
      console.error('[VOID] Font import failed.', { fileName: file.name, size: file.size, extension, error });
      notify('That font couldn’t be loaded. Your current font is unchanged.');
    } finally { setFontBusy(false); }
  };
  const deleteFont = async (font: StoredFont) => {
    if (!window.confirm(`Remove “${font.name}” from VOID? Your original font file is not deleted.`)) return;
    try {
      await deleteStoredFont(font.id);
      const face = fontFaces.current.get(font.id);
      if (face) document.fonts.delete(face);
      fontFaces.current.delete(font.id);
      setCustomFonts(items => items.filter(item => item.id !== font.id));
      setFontId(current => current === `custom:${font.id}` ? 'default' : current);
      notify('Font removed.');
    } catch (error) {
      console.error('[VOID] Font removal failed.', { name: font.name, error });
      notify('Could not remove this font.');
    }
  };
  const fontOptions = useMemo(() => [
    { id: 'default', name: 'Default', tag: 'Built in', family: 'var(--app-font-sans)', note: '', font: null as StoredFont | null },
    ...BUILTIN_FONTS.map(font => ({
      id: font.id,
      name: font.name,
      tag: font.tag,
      family: `"${font.family}", var(--app-font-sans)`,
      note: font.id === 'savage-roses' && savageState === 'missing' ? 'Bundled font could not be loaded.' : '',
      font: null as StoredFont | null,
    })),
    ...customFonts.map(font => ({ id: `custom:${font.id}`, name: font.name, tag: font.format.toUpperCase(), family: `"${fontFamilyFor(font.id)}", var(--app-font-sans)`, note: '', font: font as StoredFont | null })),
  ], [customFonts, savageState]);

  const updatePrefs = useCallback(async (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem('void-theme', next.theme); } catch { /* IndexedDB remains the primary preference store. */ }
    try { await savePreferences(next); } catch { notify('Could not save preferences on this device.'); }
  }, [notify]);

  const playTrack = useCallback(async (track: Track, list?: string[]) => {
    if (!audio.current) return;
    if (list) setQueue(list);

    let playableTrack: Track;
    let file: File;
    let mimeType: string;
    try {
      ({ file, mimeType } = await materializeAudioFile(track));
      playableTrack = { ...track, file, mimeType };
    } catch (error) {
      console.error('[VOID] Could not materialize persisted audio bytes.', { fileName: track.fileName, error });
      setIsPlaying(false);
      notify(`Could not restore “${track.fileName}” after Safari restarted. The saved audio data could not be read.`);
      return;
    }

    setTracks(items => items.map(item => item.id === track.id ? playableTrack : item));
    setActiveId(track.id);
    setPosition(0);
    setDuration(track.duration || 0);

    const el = audio.current;
    el.pause();
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }

    // Reset the media element before assigning a fresh Blob URL. This avoids Safari
    // keeping decoder state from the previous media source.
    el.removeAttribute('src');
    el.load();

    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    el.src = url;
    el.volume = prefs.volume;
    el.muted = prefs.muted;
    el.load();

    try {
      await el.play();
      const actualDuration = el.duration;
      const persistedTrack = {
        ...playableTrack,
        duration: Number.isFinite(actualDuration) && actualDuration > 0 ? actualDuration : playableTrack.duration,
        lastPlayedAt: Date.now(),
      };
      setTracks(items => items.map(item => item.id === track.id ? persistedTrack : item));
      // Persist the freshly materialized File so the next Safari restart gets a
      // normal, explicitly typed Blob/File rather than the decoder-sensitive object.
      void saveTrack(persistedTrack).catch(error => {
        console.warn('[VOID] Could not persist refreshed audio source.', error);
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return; // superseded by a newer play

      setIsPlaying(false);
      console.error('[VOID] Audio playback failed.', { fileName: track.fileName, mimeType, error });
      notify(`Unable to decode “${track.fileName}”. The saved audio data could not be decoded by Safari.`);
    }
  }, [notify, prefs.muted, prefs.volume]);

  const togglePlay = useCallback(async () => {
    const el = audio.current;
    if (!el) return;
    if (!activeTrack) {
      const next = tracks.find(item => queue.includes(item.id)) ?? tracks[0];
      if (next) await playTrack(next, queue.length ? queue : tracks.map(item => item.id));
      else notify('Import audio files to begin your library.');
      return;
    }
    if (el.paused) {
      try { await el.play(); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) notify(`This browser could not play “${activeTrack.fileName}”. Check its format and try another file.`); }
    } else {
      el.pause();
    }
  }, [activeTrack, notify, playTrack, queue, tracks]);

  const playRelative = useCallback((direction: number) => {
    if (!tracks.length) return;
    const pool = queue.map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track);
    const source = pool.length ? pool : tracks;
    if (!activeId) { void playTrack(source[0], source.map(track => track.id)); return; }
    let index = source.findIndex(track => track.id === activeId);
    if (prefs.shuffle && direction > 0 && source.length > 1) {
      let next = index;
      while (next === index) next = Math.floor(Math.random() * source.length);
      index = next;
    } else index += direction;
    if (index < 0) index = prefs.repeat === 'all' ? source.length - 1 : 0;
    if (index >= source.length) {
      if (prefs.repeat === 'off' && !prefs.autoplay) { setIsPlaying(false); return; }
      index = 0;
    }
    void playTrack(source[index], source.map(track => track.id));
  }, [activeId, playTrack, prefs.autoplay, prefs.repeat, prefs.shuffle, queue, tracks]);

  // System / keyboard media keys. Handlers go through a ref so they always see the latest queue, shuffle and repeat.
  const mediaControls = useRef({ play: () => {}, pause: () => {}, previous: () => {}, next: () => {} });
  mediaControls.current = {
    play: () => { if (!audio.current || audio.current.paused) void togglePlay(); },
    pause: () => { audio.current?.pause(); },
    previous: () => playRelative(-1),
    next: () => playRelative(1),
  };
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => mediaControls.current.play()], ['pause', () => mediaControls.current.pause()],
      ['previoustrack', () => mediaControls.current.previous()], ['nexttrack', () => mediaControls.current.next()],
    ];
    for (const [action, handler] of handlers) { try { session.setActionHandler(action, handler); } catch { /* unsupported action */ } }
    return () => { for (const [action] of handlers) { try { session.setActionHandler(action, null); } catch { /* unsupported action */ } } };
  }, []);
  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const importFiles = async (files: FileList | File[], note = '') => {
    const chosen = Array.from(files).filter(file => file.size > 0);
    if (!chosen.length) return;
    setImporting(true);
    let added = 0;
    try {
      for (const file of chosen) {
        try { await saveTrack(await trackFromFile(file)); added += 1; }
        catch (error) {
          const message = error instanceof DOMException && error.name === 'QuotaExceededError'
            ? 'Device storage is full. Remove files or free space, then try again.'
            : `Could not add ${file.name}. Check browser storage permissions.`;
          notify(message);
        }
      }
      await reload();
      if (added) notify(`${added} ${added === 1 ? 'file' : 'files'} added to your library.${note ? ` ${note}` : ''}`);
    } finally { setImporting(false); }
  };

  // Auto Import: the person picks a folder (webkitdirectory works in Safari, Chrome and Firefox);
  // we keep only playable, non-hidden audio that is not already in the library, then reuse importFiles.
  const autoImport = async (files: FileList) => {
    const all = Array.from(files);
    const known = new Set(tracks.map(track => `${track.fileName}|${track.fileSize}`));
    const probe = document.createElement('audio');
    const supported: File[] = [];
    let duplicates = 0;
    for (const file of all) {
      if (file.size === 0 || file.name.startsWith('.')) continue;
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!AUTO_IMPORT_EXTENSIONS.has(extension)) continue;
      if (!probe.canPlayType(resolveAudioMimeType(file.name, file.type))) continue;
      const key = `${file.name}|${file.size}`;
      if (known.has(key)) { duplicates += 1; continue; }
      known.add(key);
      supported.push(file);
    }
    if (!supported.length) {
      notify(duplicates ? 'Everything in that folder is already in your library.' : 'No supported music files found.');
      return;
    }
    await importFiles(supported, duplicates ? `${countLabel(duplicates, 'duplicate')} skipped.` : '');
  };
  const openImport = () => setImportMenu(true);

  const toggleFavorite = async (track: Track) => {
    const updated = { ...track, favorite: !track.favorite };
    setTracks(items => items.map(item => item.id === track.id ? updated : item));
    try { await saveTrack(updated); } catch { notify('Could not save favorite.'); }
  };
  const deleteTrack = async (track: Track) => {
    if (!window.confirm(`Remove “${track.title}” from VOID? The original file on your Mac will not be deleted.`)) return;
    try {
      await removeTrack(track.id);
      setTracks(items => items.filter(item => item.id !== track.id));
      setQueue(items => items.filter(id => id !== track.id));
      const changedPlaylists = playlists
        .filter(playlist => playlist.trackIds.includes(track.id))
        .map(playlist => ({ ...playlist, trackIds: playlist.trackIds.filter(id => id !== track.id) }));
      await Promise.all(changedPlaylists.map(savePlaylist));
      setPlaylists(items => items.map(playlist => changedPlaylists.find(updated => updated.id === playlist.id) ?? playlist));
      if (activeId === track.id) {
        audio.current?.pause();
        setActiveId(null); setIsPlaying(false);
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      }
      notify('Audio file removed from this library.');
    } catch { notify('Could not remove this file from local storage.'); }
  };
  const addToQueue = (track: Track) => {
    setQueue(items => items.includes(track.id) ? items : [...items, track.id]);
    notify(`Added “${track.title}” to the queue.`);
  };
  const playNext = (track: Track) => {
    if (activeId === track.id) { notify('That song is already playing.'); return; }
    setQueue(items => {
      const remaining = items.filter(id => id !== track.id);
      const activeIndex = activeId ? remaining.indexOf(activeId) : -1;
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : 0;
      return [...remaining.slice(0, insertAt), track.id, ...remaining.slice(insertAt)];
    });
    notify(`“${track.title}” will play next.`);
  };
  const createPlaylist = async () => {
    const name = modalValue.trim();
    if (!name) return;
    const playlist: Playlist = { id: crypto.randomUUID(), name, description: '', createdAt: Date.now(), trackIds: [] };
    try { await savePlaylist(playlist); await reload(); setModal(null); setModalValue(''); notify('Playlist created.'); }
    catch { notify('Could not save this playlist.'); }
  };
  const renamePlaylist = async () => {
    const target = playlists.find(item => item.name === detail?.name);
    if (!target || !modalValue.trim()) return;
    try {
      await savePlaylist({ ...target, name: modalValue.trim() });
      setDetail({ ...detail!, name: modalValue.trim() }); setModal(null); setModalValue(''); await reload();
    } catch { notify('Could not rename this playlist.'); }
  };
  const deletePlaylistById = async (playlist: Playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Your audio files will stay in your library.`)) return;
    try { await removePlaylist(playlist.id); setDetail(null); await reload(); notify('Playlist deleted.'); }
    catch { notify('Could not delete this playlist.'); }
  };
  const addTrackToPlaylist = async (playlist: Playlist, track: Track) => {
    if (playlist.trackIds.includes(track.id)) { notify('That song is already in this playlist.'); return; }
    try { await savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, track.id] }); await reload(); setModal(null); setContextTrack(null); notify('Added to playlist.'); }
    catch { notify('Could not update this playlist.'); }
  };
  const rescanLibrary = async () => {
    try {
      for (const track of tracks) {
        const file = new File([track.file], track.fileName, { type: track.mimeType });
        const scanned = await trackFromFile(file);
        await saveTrack({
          ...track,
          title: scanned.title,
          artist: scanned.artist,
          album: scanned.album,
          duration: scanned.duration || track.duration,
          artwork: scanned.artwork ?? track.artwork,
        });
      }
      await reload();
      notify('Library scan complete.');
    } catch { notify('Could not finish scanning this library.'); }
  };
  const clearLibrary = async () => {
    if (!window.confirm('Clear the local VOID library and playlists? The original files on your Mac will not be deleted.')) return;
    try {
      await Promise.all([
        ...tracks.map(track => removeTrack(track.id)),
        ...playlists.map(playlist => removePlaylist(playlist.id)),
      ]);
      audio.current?.pause();
      setActiveId(null); setIsPlaying(false); setPosition(0); setDuration(0);
      if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
      setTracks([]); setPlaylists([]); setQueue([]);
      notify('Local library and playlists cleared.');
    } catch { notify('Could not clear the local library.'); }
  };
  const openCollection = (kind: 'album' | 'artist', name: string) => {
    const target: Page = kind === 'album' ? 'albums' : 'artists';
    setDetail({ kind, name });
    setQuery('');
    setPage(target);
    setLocation(pathFor(target));
    setContextTrack(null);
  };

  /* ───────────── Expanded player ─────────────
     The compact artwork "flies" into the large artwork (and back) with one transform animation
     measured from the real rectangles, so the two surfaces read as one object. Only the glass and the
     surrounding text fade; the artwork itself never does. */
  const flyArt = useCallback((direction: 'open' | 'close') => {
    const art = npArt.current;
    const source = document.querySelector<HTMLElement>('.player-track .cover-mini');
    if (!art || !source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = source.getBoundingClientRect();
    const to = art.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const scale = from.width / to.width;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const compact = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, borderRadius: `${13 / scale}px` };
    const full = { transform: 'translate(0px, 0px) scale(1)', borderRadius: '24px' };
    if (direction === 'open') art.animate([compact, full], { duration: 540, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'backwards' });
    else art.animate([full, compact], { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  }, []);
  const openExpanded = useCallback(() => {
    if (expandedRef.current) return;
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setExpanded(true);
  }, []);
  const closeExpanded = useCallback(() => {
    if (!expandedRef.current || closingRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setExpanded(false); setClosing(false); return; }
    setClosing(true);
    flyArt('close');
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { setExpanded(false); setClosing(false); }, 300);
  }, [flyArt]);
  useLayoutEffect(() => { if (expanded) flyArt('open'); }, [expanded, flyArt]);

  useEffect(() => {
    const onKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setPaletteOpen(value => !value); setPaletteQuery(''); return;
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false); setModal(null); setContextTrack(null); closeExpanded(); setImportMenu(false); return;
      }
      if (editing || paletteOpen || modal || contextTrack || importMenu) return;
      if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
      else if (event.key === 'ArrowRight') { if (audio.current && activeTrack) audio.current.currentTime = Math.min(audio.current.duration || 0, audio.current.currentTime + 5); }
      else if (event.key === 'ArrowLeft') { if (audio.current && activeTrack) audio.current.currentTime = Math.max(0, audio.current.currentTime - 5); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); void updatePrefs({ ...prefs, volume: Math.min(1, prefs.volume + .05), muted: false }); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); void updatePrefs({ ...prefs, volume: Math.max(0, prefs.volume - .05) }); }
      else if (event.key.toLowerCase() === 'm') void updatePrefs({ ...prefs, muted: !prefs.muted });
    };
    window.addEventListener('keydown', onKeys);
    return () => window.removeEventListener('keydown', onKeys);
  }, [activeTrack, closeExpanded, contextTrack, importMenu, modal, paletteOpen, prefs, togglePlay, updatePrefs]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(closeTimer.current);
    window.cancelAnimationFrame(orbFrame.current);
  }, []);

  // Mood orb: the pointer position becomes --ox / --oy (-1…1); CSS eases and maps them to light,
  // shadow and parallax. Mouse only, skipped entirely for reduced motion, one rAF-throttled write.
  const moveOrb = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = orbRef.current;
    if (!el || event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)));
    window.cancelAnimationFrame(orbFrame.current);
    orbFrame.current = window.requestAnimationFrame(() => { el.style.setProperty('--ox', x.toFixed(3)); el.style.setProperty('--oy', y.toFixed(3)); });
  };
  const resetOrb = () => {
    const el = orbRef.current;
    if (!el) return;
    window.cancelAnimationFrame(orbFrame.current);
    el.style.setProperty('--ox', '0'); el.style.setProperty('--oy', '0');
  };

  const setPageAndRoute = (target: Page) => { setDetail(null); setPage(target); setLocation(pathFor(target)); };
  const filteredTracks = useMemo(() => {
    let list = tracks;
    if (page === 'favorites') list = list.filter(track => track.favorite);
    if (page === 'recent') list = list.filter(track => track.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    if (detail?.kind === 'album') list = list.filter(track => track.album === detail.name);
    if (detail?.kind === 'artist') list = list.filter(track => track.artist === detail.name);
    if (detail?.kind === 'playlist') {
      const playlist = playlists.find(item => item.name === detail.name);
      list = (playlist?.trackIds ?? []).map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track);
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(track => `${track.title} ${track.artist} ${track.album} ${track.fileName}`.toLowerCase().includes(q));
    return list;
  }, [detail, page, playlists, query, tracks]);
  const queueTracks = useMemo(() => queue.map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track), [queue, tracks]);
  const albumNames = useMemo(() => [...new Set(tracks.map(track => track.album))], [tracks]);
  const artistNames = useMemo(() => [...new Set(tracks.map(track => track.artist))], [tracks]);
  const title = detail?.name ?? ({ home: 'Home', songs: 'Songs', albums: 'Albums', artists: 'Artists', playlists: 'Playlists', favorites: 'Favorites', recent: 'Recently played', queue: 'Queue', settings: 'Settings' } as Record<Page, string>)[page];
  const allSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    if (!q) return [];
    return tracks.filter(track => `${track.title} ${track.artist} ${track.album} ${track.fileName}`.toLowerCase().includes(q)).slice(0, 7);
  }, [paletteQuery, tracks]);
  const albumSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? albumNames.filter(name => name.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [albumNames, paletteQuery]);
  const artistSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? artistNames.filter(name => name.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [artistNames, paletteQuery]);
  const playlistSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? playlists.filter(playlist => `${playlist.name} ${playlist.description}`.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [paletteQuery, playlists]);

  const playList = (list: Track[]) => {
    if (list.length) void playTrack(list[0], list.map(track => track.id));
  };
  const hasPlayed = useMemo(() => tracks.some(track => track.lastPlayedAt), [tracks]);
  const jumpBack = useMemo(() => {
    const played = tracks.filter(track => track.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)).slice(0, 4);
    return [...played, ...tracks.filter(track => !played.includes(track))].slice(0, 4);
  }, [tracks]);
  const recentlyAdded = useMemo(() => tracks.slice(0, 4), [tracks]);
  // Uses the existing playback path: a random starting song with the whole library queued.
  const playSomething = () => {
    if (!tracks.length) { notify('Import audio files to begin your library.'); return; }
    const choices = tracks.length > 1 ? tracks.filter(track => track.id !== activeId) : tracks;
    void playTrack(choices[Math.floor(Math.random() * choices.length)], tracks.map(track => track.id));
  };
  const moveQueue = (index: number, step: number) => {
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex >= queueTracks.length) return;
    const ids = queueTracks.map(track => track.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setQueue(ids);
  };
  const moveItem = (track: Track, index: number, step: number) => {
    if (page === 'queue') { moveQueue(index, step); return; }
    if (detail?.kind !== 'playlist') return;
    const playlist = playlists.find(item => item.name === detail.name);
    if (!playlist) return;
    const ids = [...playlist.trackIds];
    const currentIndex = ids.indexOf(track.id);
    const target = currentIndex + step;
    if (currentIndex < 0 || target < 0 || target >= ids.length) return;
    [ids[currentIndex], ids[target]] = [ids[target], ids[currentIndex]];
    void savePlaylist({ ...playlist, trackIds: ids }).then(reload).catch(() => notify('Could not reorder this playlist.'));
  };
  const clearQueue = () => { setQueue([]); notify('Queue cleared.'); };
  const removeFromQueue = (id: string) => setQueue(ids => ids.filter(item => item !== id));
  const removeFromPlaylist = async (id: string) => {
    if (detail?.kind !== 'playlist') return;
    const playlist = playlists.find(item => item.name === detail.name);
    if (!playlist) return;
    try { await savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter(item => item !== id) }); await reload(); }
    catch { notify('Could not remove this song from the playlist.'); }
  };
  // Stable action bag so memoized rows keep their identity while handlers use the latest state.
  const latestActions = useRef<RowActions | null>(null);
  latestActions.current = {
    play: (track, list) => void playTrack(track, list),
    openAlbum: name => { setDetail({ kind: 'album', name }); setQuery(''); },
    move: moveItem,
    removeFromList: id => page === 'queue' ? removeFromQueue(id) : void removeFromPlaylist(id),
    favorite: track => void toggleFavorite(track),
    menu: track => setContextTrack(track),
  };
  const rowActions = useMemo<RowActions>(() => ({
    play: (track, list) => latestActions.current!.play(track, list),
    openAlbum: name => latestActions.current!.openAlbum(name),
    move: (track, index, step) => latestActions.current!.move(track, index, step),
    removeFromList: id => latestActions.current!.removeFromList(id),
    favorite: track => latestActions.current!.favorite(track),
    menu: track => latestActions.current!.menu(track),
  }), []);
  const moodIndex = Math.floor(greetingHour / 2);
  // The playing track's colour drives the page ambient, the orb, the top band and the player reflection on every page.
  const atmosphere = atmos;
  const changeVolume = (value: number) => {
    if (audio.current) audio.current.volume = value;
    void updatePrefs({ ...prefs, volume: value, muted: false });
  };
  const toggleMute = () => void updatePrefs({ ...prefs, muted: !prefs.muted });
  const cycleRepeat = () => void updatePrefs({ ...prefs, repeat: prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off' });
  const seekTo = (next: number) => { if (audio.current) audio.current.currentTime = next; setPosition(next); };

  const pageDescription: Record<Page, string> = {
    home: 'Your music, kept on this Mac.', songs: `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} in your local library`,
    albums: `${albumNames.length} ${albumNames.length === 1 ? 'album' : 'albums'} found in your files`,
    artists: `${artistNames.length} ${artistNames.length === 1 ? 'artist' : 'artists'} found in your files`,
    playlists: 'A few things, gathered your way.', favorites: 'The songs you’ve kept close.', recent: 'Your listening, on this device.', queue: `${queueTracks.length} ${queueTracks.length === 1 ? 'song' : 'songs'} lined up next.`, settings: 'A few quiet preferences.',
  };

  return <div className="void-app" data-ambient={page} data-track-ambient={atmosphere ? '' : undefined} data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
    style={atmosphere ? ({ '--h1': atmosphere[0], '--h2': atmosphere[1], '--h3': atmosphere[2], '--s': `${atmosphere[3]}%` } as CSSProperties) : undefined}>
    <div className="ambient" aria-hidden="true" />
    <audio ref={audio} preload="none" onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
      onPlay={() => setIsPlaying(true)} onPlaying={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
      onDurationChange={() => { const value = audio.current?.duration ?? 0; if (Number.isFinite(value) && value > 0) setDuration(value); }}
      onLoadedMetadata={() => {
        const value = audio.current?.duration ?? 0;
        setDuration(value);
        if (activeId && Number.isFinite(value) && value > 0) {
          setTracks(items => items.map(item => item.id === activeId ? { ...item, duration: value } : item));
          const loadedTrack = tracks.find(item => item.id === activeId);
          if (loadedTrack) {
            void saveTrack({ ...loadedTrack, duration: value }).catch(() => undefined);
          }
        }
      }}
      onEnded={() => {
        if (prefs.repeat === 'one' && audio.current) { audio.current.currentTime = 0; void audio.current.play(); }
        else playRelative(1);
      }}
      onError={() => { if (activeTrack) { setIsPlaying(false); notify(`Unable to decode “${activeTrack.fileName}”. This format may not be supported by your browser.`); } }} />
    <div className="void-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-head">
          <button className="brand" aria-label="VOID home" onClick={() => setPageAndRoute('home')} data-testid="button-void-home"><span className="eclipse" /><span className="brand-word">VOID</span></button>
          <button className="icon-button sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)} data-testid="button-toggle-sidebar">{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        </div>
        <div className="nav-group"><div className="nav-label">Listen</div>
          {navItems.filter(item => item.group === 'listen').map(item => { const Icon = item.icon; const active = page === item.id && !detail; return <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => setPageAndRoute(item.id)} key={item.id} aria-current={active ? 'page' : undefined} title={item.label} data-collapsed-hidden={!item.compact && !active} data-testid={`nav-${item.id}`}><Icon /><span>{item.label}</span></button>; })}
        </div>
        <div className="nav-group"><div className="nav-label">Your library</div>
          {navItems.filter(item => item.group === 'collection').map(item => { const Icon = item.icon; const active = page === item.id && !detail; return <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => setPageAndRoute(item.id)} key={item.id} aria-current={active ? 'page' : undefined} title={item.label} data-collapsed-hidden={!item.compact && !active} data-testid={`nav-${item.id}`}><Icon /><span>{item.label}</span></button>; })}
        </div>
        <div className="sidebar-bottom">
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPageAndRoute('settings')} aria-current={page === 'settings' ? 'page' : undefined} title="Settings" data-testid="nav-settings"><Settings /><span>Settings</span></button>
          <div className="library-note">{tracks.length ? `${tracks.length} local ${tracks.length === 1 ? 'file' : 'files'} · ${compactBytes(tracks.reduce((sum, track) => sum + track.fileSize, 0))} on this device` : 'Your files stay on this device.'}</div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="top-left"><span className="eclipse mobile-eclipse" /><span className="brand-word mobile-brand">VOID</span><span className="crumb">{detail ? title : page === 'home' ? 'A quiet place for your music' : 'Your library'}</span></div>
          <div className="top-actions">
            <button className="search-trigger" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }} aria-label="Search your library" data-testid="button-open-search"><Search size={14} /><span>Search library</span><kbd>⌘ K</kbd></button>
            {page !== 'settings' && <button className="icon-button" aria-label="Settings" title="Settings" onClick={() => setPageAndRoute('settings')} data-testid="button-open-settings"><SlidersHorizontal /></button>}
          </div>
        </header>
        <section className={`content ${page === 'home' && !detail ? 'home-content' : ''}`}>
          {storageError ? <div className="empty-state" role="alert" data-testid="status-storage-error"><strong>Local storage unavailable</strong><p>{storageError} Your browser may be in private mode or storage may be disabled. VOID does not upload your music.</p><button className="button" onClick={() => { setStorageError(''); void reload(); }} data-testid="button-retry-storage">Try again</button></div> : null}
          {!isReady && <div className="empty-state" data-testid="status-library-loading"><strong>Opening your library</strong><p>Looking for audio you’ve saved on this device.</p></div>}
          {page === 'home' && !detail && <>
            <div className="welcome">
              <div><h1 className="page-title greeting-title" key={Math.floor(greetingHour / 2)} aria-live="polite">{greetings[Math.floor(greetingHour / 2)]}</h1><p className="welcome-copy">A quiet place for the music already yours.</p>{tracks.length ? <p className="welcome-meta">{countLabel(albumNames.length, 'album')} · {countLabel(tracks.length, 'song')}</p> : null}</div>
              <button className="button add-music" onClick={openImport} disabled={importing} data-testid="button-import-home"><Plus />{importing ? 'Adding files…' : 'Add music'}</button>
            </div>
            <section className="mood" aria-label={moodLabelFor(greetingHour)}>
              <div className="mood-orb-stage" ref={orbRef} onPointerMove={moveOrb} onPointerLeave={resetOrb} aria-hidden="true" data-testid="mood-orb">
                <div className="mood-orb"><i className="orb-highlight" /><i className="orb-sheen" /></div>
              </div>
              <div className="mood-copy"><div className="mood-label">{moodLabelFor(greetingHour)}</div><h2>{moods[moodIndex]}</h2>
                <button className="button glass" onClick={playSomething} disabled={!tracks.length} data-testid="button-play-something"><Play />Play something for me</button></div>
            </section>
            {tracks.length ? <>
              <div className="home-section"><div className="section-heading"><h2>{hasPlayed ? 'Jump back in' : 'Start listening'}</h2></div>
                <div className="jump-grid">{jumpBack.map(track => <button className="jump-tile" key={track.id} onClick={() => void playTrack(track)} aria-label={`Play ${track.title}`} data-testid={`tile-jump-${track.id}`}><Cover track={track} large /><span className="jump-title">{track.title}</span><span className="jump-sub">{track.artist}</span></button>)}</div>
              </div>
              <div className="home-section"><div className="section-heading"><h2>Recently added</h2><button className="crumb" onClick={() => setPageAndRoute('songs')} data-testid="button-view-all-songs">View library</button></div>
                <TrackRows items={recentlyAdded} activeId={activeId} page={page} actions={rowActions} />
              </div>
            </> : isReady && !storageError ? <div className="empty-state"><strong>Your library is waiting.</strong><p>Bring your music into VOID and make this space yours.</p><button className="button glass" onClick={openImport} data-testid="button-import-empty"><Plus />Import music</button><span className="empty-formats">MP3 · M4A · FLAC · WAV</span></div> : null}
          </>}
          {page !== 'home' && page !== 'settings' && <div>
            <div className="eyebrow">{detail ? detail.kind === 'playlist' ? 'Your collection' : 'From your files' : 'Your collection'}</div>
            <div className="section-heading" style={{ alignItems: 'flex-end', marginBottom: 0 }}>
              <div><h1 className="page-title">{title}</h1><p className="page-subtitle">{pageDescription[page]}</p></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {page === 'playlists' && !detail && <button className="button" onClick={() => { setModal('playlist'); setModalValue(''); }} data-testid="button-create-playlist"><Plus />New playlist</button>}
                {page === 'queue' && queueTracks.length > 0 && <button className="button" onClick={clearQueue} data-testid="button-clear-queue"><Trash2 />Clear</button>}
                {(page === 'songs' || page === 'albums' || page === 'artists' || page === 'favorites' || page === 'recent' || page === 'playlists') && <input className="filter-input" aria-label={`Filter ${title}`} placeholder="Filter this view…" value={query} onChange={event => setQuery(event.target.value)} data-testid="input-filter-library" />}
              </div>
            </div>
            {detail?.kind === 'playlist' && <div className="track-toolbar"><button className="button primary" onClick={() => playList(filteredTracks)} disabled={!filteredTracks.length} data-testid="button-play-playlist"><Play />Play playlist</button><div style={{ display: 'flex', gap: 7 }}><button className="button" onClick={() => { setModal('rename'); setModalValue(detail.name); }} data-testid="button-rename-playlist">Rename</button><button className="button" onClick={() => { const playlist = playlists.find(item => item.name === detail.name); if (playlist) void deletePlaylistById(playlist); }} data-testid="button-delete-playlist"><Trash2 /></button></div></div>}
            {detail?.kind === 'album' || detail?.kind === 'artist' ? <div className="detail-hero"><Cover track={filteredTracks[0]} large identity={`${detail.kind}:${detail.name}`} /><div><div className="eyebrow">{detail.kind}</div><h1>{detail.name}</h1><p>{filteredTracks.length} {filteredTracks.length === 1 ? 'song' : 'songs'} in this collection</p><button className="button primary" style={{ marginTop: 19 }} onClick={() => playList(filteredTracks)} disabled={!filteredTracks.length} data-testid="button-play-collection"><Play />Play</button></div></div> : null}
            {page === 'songs' && <div className="track-toolbar"><span className="crumb">Audio files imported into VOID</span><button className="button" onClick={openImport} data-testid="button-add-songs"><Plus />Add music</button></div>}
            {page === 'queue' ? queueTracks.length ? <div className="track-toolbar"><button className="button primary" onClick={() => playList(queueTracks)} data-testid="button-play-queue"><Play />Play queue</button><span className="crumb">Drag with arrows to change order</span></div> : null : null}
            {page === 'albums' && !detail ? albumNames.length ? <div className="cover-grid">{albumNames.filter(name => !query || name.toLowerCase().includes(query.toLowerCase())).map(name => {
              const representative = tracks.find(track => track.album === name);
              return <button className="cover-card" key={name} onClick={() => { setDetail({ kind: 'album', name }); setQuery(''); }} data-testid={`card-album-${name}`}><Cover track={representative} large identity={`album:${name}`} /><div className="cover-card-title">{name}</div><div className="cover-card-sub">{representative?.artist} · {countLabel(tracks.filter(track => track.album === name).length, 'song')}</div></button>;
            })}</div> : <EmptyLibrary label="No albums yet" onImport={openImport} /> : null}
            {page === 'artists' && !detail ? artistNames.length ? <div className="cover-grid">{artistNames.filter(name => !query || name.toLowerCase().includes(query.toLowerCase())).map(name => {
              const representative = tracks.find(track => track.artist === name);
              return <button className="cover-card" key={name} onClick={() => { setDetail({ kind: 'artist', name }); setQuery(''); }} data-testid={`card-artist-${name}`}><Cover track={representative} large identity={`artist:${name}`} /><div className="cover-card-title">{name}</div><div className="cover-card-sub">{countLabel(tracks.filter(track => track.artist === name).length, 'song')}</div></button>;
            })}</div> : <EmptyLibrary label="No artists yet" onImport={openImport} /> : null}
            {page === 'playlists' && !detail && <div className="cover-grid">
              {playlists.map(playlist => { const lead = tracks.find(item => item.id === playlist.trackIds[0]); return <button className="cover-card" key={playlist.id} onClick={() => { setDetail({ kind: 'playlist', name: playlist.name }); setQuery(''); }} data-testid={`card-playlist-${playlist.id}`}><Cover track={lead} large kind="list" identity={`playlist:${playlist.id}`} /><div className="cover-card-title">{playlist.name}</div><div className="cover-card-sub">{countLabel(playlist.trackIds.length, 'song')}</div></button>; })}
              {playlists.length === 0 && <div className="empty-state" style={{ gridColumn: '1 / -1' }}><strong>A place for your own collections.</strong><p>Create a playlist, then add songs from their track menu.</p><button className="button" onClick={() => { setModal('playlist'); setModalValue(''); }} data-testid="button-create-first-playlist"><Plus />Create playlist</button></div>}
            </div>}
            {(page === 'songs' || page === 'favorites' || page === 'recent' || page === 'queue' || detail) && (filteredTracks.length ? <TrackRows items={page === 'queue' ? queueTracks : filteredTracks} showIndex={page === 'queue'} reorder={page === 'queue' || detail?.kind === 'playlist'} activeId={activeId} page={page} actions={rowActions} /> : <EmptyLibrary label={page === 'favorites' ? 'Nothing saved here yet' : page === 'recent' ? 'Your recent listening will live here' : page === 'queue' ? 'Your queue is clear' : detail ? 'No songs in this collection' : 'No songs in your library yet'} onImport={openImport} />)}
            {page === 'queue' && queueTracks.length > 0 && <div style={{ marginTop: 14 }}>{queueTracks.map(track => <span key={track.id} style={{ display: 'none' }}>{track.id}</span>)}</div>}
          </div>}
          {page === 'settings' && <div><div className="eyebrow">Preferences</div><h1 className="page-title">Settings</h1><p className="page-subtitle">Small adjustments for this device.</p>
            <div className="settings-section">
              <div className="section-heading"><h2>Appearance</h2><span>Saved locally</span></div>
              <div className="setting-row"><div><strong>Theme</strong><p>Follow your Mac, or choose a fixed appearance.</p></div><select className="select-control" value={prefs.theme} onChange={event => void updatePrefs({ ...prefs, theme: event.target.value as Preferences['theme'] })} aria-label="Theme" data-testid="select-theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Font</h2><span>Applies across VOID</span></div>
              <div className="font-panel" role="radiogroup" aria-label="Font" data-testid="font-panel">
                <div className="font-group-label">My Fonts</div>
                {fontOptions.map(option => {
                  const disabled = !!option.note;
                  const selected = fontId === option.id && !disabled;
                  return <div className={`font-option ${selected ? 'selected' : ''}`} key={option.id}>
                    <button className="font-select" role="radio" aria-checked={selected} disabled={disabled} onClick={() => setFontId(option.id)} data-testid={`font-option-${option.id}`}>
                      <span className="font-check" aria-hidden="true">{selected ? <Check /> : null}</span>
                      <span className="font-copy">
                        <span className="font-name">{option.name}<em>{option.tag}</em></span>
                        {option.note
                          ? <span className="font-note">{option.note}</span>
                          : <span className="font-preview" style={{ fontFamily: option.family }}>{FONT_PREVIEW}</span>}
                      </span>
                    </button>
                    {option.font ? <button className="icon-button" aria-label={`Remove ${option.name}`} title="Remove font" onClick={() => void deleteFont(option.font!)} data-testid={`button-remove-font-${option.id}`}><Trash2 /></button> : null}
                  </div>;
                })}
                <button className="font-import" onClick={() => fontInput.current?.click()} disabled={fontBusy} data-testid="button-import-font"><span className="font-check" aria-hidden="true"><Plus /></span>{fontBusy ? 'Adding font…' : 'Import Font'}<small>.ttf · .otf · .woff · .woff2</small></button>
              </div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Playback</h2></div>
              <div className="setting-row"><div><strong>Autoplay</strong><p>Continue through the queue when a song ends.</p></div><button className={`switch ${prefs.autoplay ? 'on' : ''}`} role="switch" aria-checked={prefs.autoplay} aria-label="Autoplay" onClick={() => void updatePrefs({ ...prefs, autoplay: !prefs.autoplay })} data-testid="switch-autoplay"><span /></button></div>
              <div className="setting-row"><div><strong>Shuffle</strong><p>Play the queue in a different order.</p></div><button className={`switch ${prefs.shuffle ? 'on' : ''}`} role="switch" aria-checked={prefs.shuffle} aria-label="Shuffle" onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="switch-shuffle"><span /></button></div>
              <div className="setting-row"><div><strong>Repeat</strong><p>Choose what happens at the end of the queue.</p></div><select className="select-control" value={prefs.repeat} onChange={event => void updatePrefs({ ...prefs, repeat: event.target.value as Preferences['repeat'] })} aria-label="Repeat" data-testid="select-repeat"><option value="off">Off</option><option value="all">Repeat queue</option><option value="one">Repeat song</option></select></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Your files</h2></div>
              <div className="setting-row"><div><strong>Local library</strong><p>Audio files stay in this browser’s private storage. Clearing site data removes them.</p></div><span className="crumb">{tracks.length} files · {compactBytes(tracks.reduce((sum, track) => sum + track.fileSize, 0))}</span></div>
              <p className="page-subtitle" style={{ marginTop: 17, lineHeight: 1.7 }}>VOID does not upload your audio. Browser storage can be limited, and playback depends on which codecs this browser supports. Imported files are copied into local browser storage so they can be available after refresh.</p>
               <div className="setting-row"><div><strong>Import music</strong><p>Add more audio from your Mac.</p></div><button className="button" onClick={openImport} data-testid="button-settings-import">Add music</button></div>
               <div className="setting-row"><div><strong>Rescan library</strong><p>Read available file tags and artwork again from stored audio.</p></div><button className="button" onClick={() => void rescanLibrary()} disabled={!tracks.length} data-testid="button-rescan-library">Rescan</button></div>
               <div className="setting-row"><div><strong>Clear library</strong><p>Remove VOID’s local copies and playlists. Original Mac files are untouched.</p></div><button className="button danger" onClick={() => void clearLibrary()} disabled={!tracks.length && !playlists.length} data-testid="button-clear-library">Clear library</button></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Keyboard shortcuts</h2></div>
              {[['Space', 'Play or pause'], ['← / →', 'Seek 5 seconds'], ['↑ / ↓', 'Adjust volume'], ['M', 'Mute or unmute'], ['⌘ K', 'Search library'], ['Esc', 'Close the current panel']].map(([key, label]) => <div className="setting-row" key={key}><strong>{label}</strong><kbd style={{ fontFamily: 'var(--app-font-mono)', fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{key}</kbd></div>)}
            </div>
          </div>}
        </section>
      </main>
    </div>
    <div className="player-bar" data-testid="player-bar" data-idle={activeTrack ? undefined : ''} data-np={expanded ? '' : undefined}>
      <div className="player-track" onClick={() => activeTrack && openExpanded()} onKeyDown={event => { if (activeTrack && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openExpanded(); } }} role={activeTrack ? 'button' : undefined} tabIndex={activeTrack ? 0 : undefined} aria-label={activeTrack ? 'Open now playing' : undefined} data-testid="player-current-track">
        <Cover track={activeTrack ?? undefined} />
        <span><span className="track-title">{activeTrack?.title ?? 'Nothing playing'}</span><span className="track-sub">{activeTrack?.artist ?? 'Your music will be here'}</span></span>
      </div>
      <div className="player-center">
        <div className="player-controls">
          <button className={`icon-button ${prefs.shuffle ? 'active-control' : ''}`} aria-label="Shuffle" title="Shuffle" aria-pressed={prefs.shuffle} onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="button-shuffle"><Shuffle /></button>
          <button className="icon-button" aria-label="Previous track" title="Previous track" onClick={() => playRelative(-1)} data-testid="button-previous"><SkipBack /></button>
          <button className="icon-button play-button" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => void togglePlay()} data-testid="button-play-pause"><VoidGlyph playing={isPlaying} /></button>
          <button className="icon-button" aria-label="Next track" title="Next track" onClick={() => playRelative(1)} data-testid="button-next"><SkipForward /></button>
          <button className={`icon-button ${prefs.repeat !== 'off' ? 'active-control' : ''}`} aria-label={`Repeat ${prefs.repeat}`} title={`Repeat ${prefs.repeat}`} aria-pressed={prefs.repeat !== 'off'} onClick={cycleRepeat} data-testid="button-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}</button>
        </div>
        <div className="player-scrub">
          <span>{activeTrack ? formatElapsed(position) : '—:—'}</span>
          <input className="seek" aria-label="Playback position" style={rangeStyle(duration ? position / duration : 0)} type="range" min="0" max={duration || 0} step=".1" value={Math.min(position, duration || 0)} disabled={!activeTrack} onChange={event => seekTo(Number(event.target.value))} data-testid="input-seek" />
          <span>{activeTrack ? formatTime(duration) : '—:—'}</span>
        </div>
      </div>
      <div className="player-extra">
        <button className="icon-button extra-fade extra-opt" aria-label={activeTrack?.favorite ? 'Remove favorite' : 'Add favorite'} title={activeTrack?.favorite ? 'Remove favorite' : 'Add favorite'} disabled={!activeTrack} onClick={() => activeTrack && void toggleFavorite(activeTrack)} data-testid="button-player-favorite"><Heart fill={activeTrack?.favorite ? 'currentColor' : 'none'} /></button>
        <button className="icon-button extra-fade extra-opt" aria-label="Open queue" title="Queue" onClick={() => setPageAndRoute('queue')} data-testid="button-open-queue"><ListMusic /></button>
        <button className="icon-button extra-fade" aria-label="Expand now playing" title="Now playing" onClick={openExpanded} data-testid="button-expand-player"><ChevronDown style={{ transform: 'rotate(180deg)' }} /></button>
        <VolumeControl volume={prefs.volume} muted={prefs.muted} onVolume={changeVolume} onToggleMute={toggleMute} buttonTestId="button-mute" inputTestId="input-volume" />
      </div>
    </div>
    <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.aiff,.aif,.alac" multiple hidden onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} data-testid="input-import-files" />
    <input ref={element => { folderInput.current = element; element?.setAttribute('webkitdirectory', ''); }} type="file" multiple hidden onChange={event => { if (event.target.files) void autoImport(event.target.files); event.target.value = ''; }} data-testid="input-import-folder" />
    <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFont(file); }} data-testid="input-import-font" />
    {importMenu && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setImportMenu(false); }}><div className="import-menu" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="import-menu">
      <div className="import-head"><h2 id="import-title">Add music</h2><p>Files are copied into this browser’s private storage. Nothing is uploaded.</p></div>
      <button className="import-option" onClick={() => { setImportMenu(false); folderInput.current?.click(); }} data-testid="button-auto-import"><span className="import-icon"><FolderOpen /></span><span className="import-copy"><strong>Auto Import</strong><span>Choose a folder and VOID finds the music inside it.</span></span></button>
      <button className="import-option" onClick={() => { setImportMenu(false); fileInput.current?.click(); }} data-testid="button-add-from-files"><span className="import-icon"><FileAudio /></span><span className="import-copy"><strong>Add from Files</strong><span>Pick individual songs from your Mac.</span></span></button>
      <div className="import-footer"><button className="button" onClick={() => setImportMenu(false)} data-testid="button-cancel-import">Cancel</button></div>
    </div></div>}
    {paletteOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><div className="palette" role="dialog" aria-modal="true" aria-label="Search your library"><input autoFocus className="palette-input" placeholder="Search your music…" value={paletteQuery} onChange={event => setPaletteQuery(event.target.value)} onKeyDown={event => {
      if (event.key !== 'Enter') return;
      if (allSearchResults[0]) { void playTrack(allSearchResults[0]); setPaletteOpen(false); }
      else if (albumSearchResults[0]) { setPaletteOpen(false); openCollection('album', albumSearchResults[0]); }
      else if (artistSearchResults[0]) { setPaletteOpen(false); openCollection('artist', artistSearchResults[0]); }
      else if (playlistSearchResults[0]) { const playlist = playlistSearchResults[0]; setPaletteOpen(false); setPage('playlists'); setLocation('/playlists'); setDetail({ kind: 'playlist', name: playlist.name }); }
    }} data-testid="input-search-palette" /><div className="palette-results">
       {allSearchResults.map(track => <button key={track.id} className="palette-result" onClick={() => { void playTrack(track); setPaletteOpen(false); }} data-testid={`search-result-${track.id}`}><Cover track={track} /><span><span className="track-title">{track.title}</span><span className="track-sub">{track.artist} · {track.album}</span></span><Play size={13} /></button>)}
       {albumSearchResults.map(name => <button key={`album-${name}`} className="palette-result" onClick={() => { setPaletteOpen(false); openCollection('album', name); }} data-testid={`search-album-${name}`}><Disc3 size={16} /><span>{name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Album</span></button>)}
       {artistSearchResults.map(name => <button key={`artist-${name}`} className="palette-result" onClick={() => { setPaletteOpen(false); openCollection('artist', name); }} data-testid={`search-artist-${name}`}><Mic2 size={16} /><span>{name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Artist</span></button>)}
       {playlistSearchResults.map(playlist => <button key={playlist.id} className="palette-result" onClick={() => { setPaletteOpen(false); setPage('playlists'); setLocation('/playlists'); setDetail({ kind: 'playlist', name: playlist.name }); setQuery(''); }} data-testid={`search-playlist-${playlist.id}`}><ListMusic size={16} /><span>{playlist.name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Playlist</span></button>)}
       {paletteQuery && !allSearchResults.length && !albumSearchResults.length && !artistSearchResults.length && !playlistSearchResults.length && <div className="empty-state" style={{ margin: 8, padding: 20 }}><strong>No match in your library</strong><p>Search only checks files you’ve added here.</p></div>}
      {!paletteQuery && <div className="crumb" style={{ padding: '14px 12px' }}>Search your local songs by title, artist, album, or file name.</div>}
      </div></div></div>}
    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
       <h2 id="modal-title">{modal === 'playlist' ? 'New playlist' : modal === 'rename' ? 'Rename playlist' : modal === 'properties' ? 'Track details' : 'Add to playlist'}</h2>
       {modal === 'add-to-playlist' ? <>
        <p>Choose where “{contextTrack?.title}” belongs.</p>
        {playlists.length ? playlists.map(playlist => <button className="palette-result" key={playlist.id} onClick={() => contextTrack && void addTrackToPlaylist(playlist, contextTrack)} data-testid={`button-add-to-${playlist.id}`}><ListMusic size={15} />{playlist.name}<span className="crumb" style={{ marginLeft: 'auto' }}>{countLabel(playlist.trackIds.length, 'song')}</span></button>) : <p>Create a playlist first, then add songs from their menus.</p>}
        <div className="modal-actions"><button className="button" onClick={() => setModal(null)} data-testid="button-cancel-add-playlist">Close</button></div>
       </> : modal === 'properties' && contextTrack ? <>
         <p>File information stored with your local library.</p>
         <dl className="properties-list">
           <dt>File</dt><dd>{contextTrack.fileName}</dd>
           <dt>Title</dt><dd>{contextTrack.title}</dd>
           <dt>Artist</dt><dd>{contextTrack.artist}</dd>
           <dt>Album</dt><dd>{contextTrack.album}</dd>
           <dt>Duration</dt><dd>{formatTime(contextTrack.duration)}</dd>
           <dt>Format</dt><dd>{contextTrack.mimeType || 'Unknown'}</dd>
           <dt>Size</dt><dd>{compactBytes(contextTrack.fileSize)}</dd>
           <dt>Added</dt><dd>{new Date(contextTrack.importedAt).toLocaleString()}</dd>
         </dl>
         <div className="modal-actions"><button className="button" onClick={() => { setModal(null); setContextTrack(null); }} data-testid="button-close-properties">Close</button></div>
      </> : <>
        <p>{modal === 'playlist' ? 'A small collection, stored with your local library.' : 'Give this collection a new name.'}</p>
        <input autoFocus className="modal-input" value={modalValue} maxLength={70} placeholder="Playlist name" onChange={event => setModalValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') modal === 'playlist' ? void createPlaylist() : void renamePlaylist(); }} data-testid="input-playlist-name" />
        <div className="modal-actions"><button className="button" onClick={() => setModal(null)} data-testid="button-cancel-playlist">Cancel</button><button className="button primary" disabled={!modalValue.trim()} onClick={() => modal === 'playlist' ? void createPlaylist() : void renamePlaylist()} data-testid="button-save-playlist">{modal === 'playlist' ? 'Create playlist' : 'Save name'}</button></div>
      </>}
    </div></div>}
    {contextTrack && modal !== 'add-to-playlist' && modal !== 'properties' && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setContextTrack(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label={`Actions for ${contextTrack.title}`}>
      <h2>{contextTrack.title}</h2><p>{contextTrack.artist} · {contextTrack.fileName}</p>
      <button className="palette-result" onClick={() => { void playTrack(contextTrack); setContextTrack(null); }} data-testid="context-play"><Play size={15} />Play now</button>
      <button className="palette-result" onClick={() => { addToQueue(contextTrack); setContextTrack(null); }} data-testid="context-add-queue"><ListPlus size={15} />Add to queue</button>
       <button className="palette-result" onClick={() => { playNext(contextTrack); setContextTrack(null); }} data-testid="context-play-next"><SkipForward size={15} />Play next</button>
      <button className="palette-result" onClick={() => { setModal('add-to-playlist'); }} data-testid="context-add-playlist"><ListMusic size={15} />Add to playlist</button>
      <button className="palette-result" onClick={() => { void toggleFavorite(contextTrack); setContextTrack(null); }} data-testid="context-favorite"><Heart size={15} />{contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
       <button className="palette-result" onClick={() => openCollection('artist', contextTrack.artist)} data-testid="context-go-artist"><Mic2 size={15} />Go to artist</button>
       <button className="palette-result" onClick={() => openCollection('album', contextTrack.album)} data-testid="context-go-album"><Disc3 size={15} />Go to album</button>
       <button className="palette-result" onClick={() => setModal('properties')} data-testid="context-properties"><SlidersHorizontal size={15} />Properties</button>
      <button className="palette-result" onClick={() => { void deleteTrack(contextTrack); setContextTrack(null); }} data-testid="context-remove"><Trash2 size={15} />Remove from VOID</button>
      <div className="modal-actions"><button className="button" onClick={() => setContextTrack(null)} data-testid="button-close-track-menu">Close</button></div>
    </div></div>}
    {expanded && <div className="np-layer" data-closing={closing ? '' : undefined} data-testid="now-playing-expanded">
      <div className="np-scrim" aria-hidden="true" onMouseDown={closeExpanded} />
      <section className="np-panel" role="dialog" aria-modal="true" aria-label="Now playing">
        <div className="np-glass" aria-hidden="true" />
        <div className="np-top np-fade">
          <button className="icon-button np-close" aria-label="Close now playing" title="Close" onClick={closeExpanded} data-testid="button-close-expanded"><X /></button>
          <span className="brand"><span className="eclipse" /><span className="brand-word">VOID</span></span>
          <div className="np-top-end"><VolumeControl volume={prefs.volume} muted={prefs.muted} onVolume={changeVolume} onToggleMute={toggleMute} buttonTestId="expanded-mute" inputTestId="expanded-volume" /></div>
        </div>
        {activeTrack ? <div className="np-body">
          <div className="np-main">
            <div className="np-art" ref={npArt}><Cover track={activeTrack} large /></div>
            <div className="np-meta np-fade">
              <div className="np-info">
                <div className="np-titles"><h1>{activeTrack.title}</h1><p>{activeTrack.artist} · {activeTrack.album}</p></div>
                <button className="icon-button" onClick={() => void toggleFavorite(activeTrack)} aria-label={activeTrack.favorite ? 'Remove favorite' : 'Add favorite'} title={activeTrack.favorite ? 'Remove favorite' : 'Add favorite'} data-testid="expanded-favorite"><Heart fill={activeTrack.favorite ? 'currentColor' : 'none'} /></button>
              </div>
              <div className="np-scrub">
                <input className="np-seek" type="range" min="0" max={duration || 0} step=".1" style={rangeStyle(duration ? position / duration : 0)} value={Math.min(position, duration || 0)} aria-label="Now playing position" onChange={event => seekTo(Number(event.target.value))} data-testid="expanded-seek" />
                <div className="np-times"><span>{formatElapsed(position)}</span><span>{formatTime(duration)}</span></div>
              </div>
              <div className="np-controls">
                <button className={`icon-button ${prefs.shuffle ? 'active-control' : ''}`} aria-pressed={prefs.shuffle} aria-label="Shuffle" title="Shuffle" onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="expanded-shuffle"><Shuffle /></button>
                <div className="np-transport">
                  <button className="icon-button" onClick={() => playRelative(-1)} aria-label="Previous track" title="Previous track" data-testid="expanded-previous"><SkipBack /></button>
                  <button className="icon-button play-button" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} data-testid="expanded-play"><VoidGlyph playing={isPlaying} /></button>
                  <button className="icon-button" onClick={() => playRelative(1)} aria-label="Next track" title="Next track" data-testid="expanded-next"><SkipForward /></button>
                </div>
                <button className={`icon-button ${prefs.repeat !== 'off' ? 'active-control' : ''}`} aria-pressed={prefs.repeat !== 'off'} aria-label={`Repeat ${prefs.repeat}`} title={`Repeat ${prefs.repeat}`} onClick={cycleRepeat} data-testid="expanded-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}</button>
              </div>
            </div>
          </div>
          <div className="np-side np-fade">
            <div className="np-lyrics" data-empty={activeTrack.lyrics ? undefined : ''}>{activeTrack.lyrics || 'Lyrics unavailable'}</div>
          </div>
        </div> : <div className="np-body np-body-empty np-fade"><div className="empty-state"><strong>Nothing playing just yet.</strong><p>Choose a song from your local library.</p><button className="button" onClick={() => { closeExpanded(); setPageAndRoute('songs'); }} data-testid="button-browse-library">Browse library</button></div></div>}
        {activeTrack && <div className="np-dock np-fade"><button className="icon-button" onClick={() => { closeExpanded(); setPageAndRoute('queue'); }} aria-label="Open queue" title="Open queue" data-testid="expanded-queue"><ListMusic /></button></div>}
      </section>
    </div>}
    {toast && <div className="toast-stack" aria-live="polite"><div className="toast-item" data-testid="status-toast">{toast}</div></div>}
  </div>;
}

function EmptyLibrary({ label, onImport }: { label: string; onImport: () => void }) {
  return <div className="empty-state" data-testid="empty-library"><strong>{label}</strong><p>VOID only shows audio you’ve added. No catalog, recommendations, or placeholder tracks.</p><button className="button" onClick={onImport} data-testid="button-empty-add-files"><Plus />Add audio files</button></div>;
}

export default App;