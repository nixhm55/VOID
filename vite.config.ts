import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcssVite from '@tailwindcss/vite';
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from 'vite';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const cutoutInFlight = new Map<string, Promise<Buffer | null>>();

async function generateVisionCutoutPng(imageUrls: string[], cacheFilePath: string): Promise<Buffer | null> {
  const binPath = path.join(projectRoot, 'node_modules', '.cache', 'void-vision-cutout');
  const swiftSrcPath = path.join(projectRoot, 'scripts', 'void-vision-cutout.swift');

  if (!fs.existsSync(binPath) && fs.existsSync(swiftSrcPath)) {
    await new Promise<void>((resolve) => {
      fs.mkdirSync(path.dirname(binPath), { recursive: true });
      execFile('/usr/bin/swiftc', ['-O', swiftSrcPath, '-o', binPath], { timeout: 25000 }, () => resolve());
    });
  }

  if (!fs.existsSync(binPath)) return null;

  for (const rawUrl of imageUrls) {
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;
    const tmpIn = path.join('/tmp', `void-cutout-in-${Date.now()}-${Math.random().toString(36).slice(2)}.img`);
    const tmpOut = `${cacheFilePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}.png`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const imgRes = await fetch(rawUrl, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      }).finally(() => clearTimeout(timer));

      if (!imgRes.ok) continue;
      const arrayBuf = await imgRes.arrayBuffer();
      const inputBuf = Buffer.from(arrayBuf);
      if (inputBuf.length < 512) continue;

      fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      fs.writeFileSync(tmpIn, inputBuf);

      const ok = await new Promise<boolean>((resolve) => {
        execFile(binPath, [tmpIn, tmpOut], { timeout: 12000 }, (err) => {
          resolve(!err && fs.existsSync(tmpOut));
        });
      });

      if (ok && fs.existsSync(tmpOut)) {
        const outBuf = fs.readFileSync(tmpOut);
        if (outBuf.length > 1024) {
          fs.renameSync(tmpOut, cacheFilePath);
          return outBuf;
        }
      }
    } catch {
      // try next candidate URL
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  }
  return null;
}

interface CachedYtStream {
  url: string;
  mimeType: string;
  codec: string;
  bitrate: number;
  duration: number;
  contentLength?: number;
  userAgent?: string;
  expiresAt: number;
}

const ytStreamCache = new Map<string, CachedYtStream>();

async function verifyStreamUrlReachable(url: string, userAgent?: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent || 'VOID-Music-Player/1.0',
        Range: 'bytes=0-1',
      },
      signal: controller.signal,
    });
    if (res.body) {
      void res.body.cancel().catch(() => {});
    }
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const INNERTUBE_CLIENTS = [
  {
    name: '28',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        userAgent:
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  },
  {
    name: '5',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.3.2.22D82',
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent:
      'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
  },
  {
    name: '85',
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'AE',
      },
      thirdParty: {
        embedUrl: 'https://www.youtube.com/',
      },
    },
    userAgent:
      'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
  },
  {
    name: '30',
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE',
        clientVersion: '1.9',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 14) gzip',
  },
  {
    name: '3',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
  },
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

const THIRD_PARTY_LOSSLESS_GATEWAYS = [
  'https://triton.squid.wtf',
  'https://wolf.qqdl.site',
  'https://maus.qqdl.site',
  'https://vogel.qqdl.site',
  'https://katze.qqdl.site',
  'https://hund.qqdl.site',
  'https://tidal.kinoplus.online',
  'https://hifi.401658.xyz',
];

async function tryInnerTubeVideoId(videoId: string): Promise<CachedYtStream | null> {
  const tasks = INNERTUBE_CLIENTS.map(async (clientProfile): Promise<CachedYtStream | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': clientProfile.userAgent,
          'X-YouTube-Client-Name': clientProfile.name,
        },
        body: JSON.stringify({
          videoId,
          context: clientProfile.context,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      const formats: any[] = [
        ...(Array.isArray(data?.streamingData?.adaptiveFormats) ? data.streamingData.adaptiveFormats : []),
        ...(Array.isArray(data?.streamingData?.formats) ? data.streamingData.formats : []),
      ];

      const audioFormats = formats
        .filter((f: any) => typeof f?.url === 'string' && typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/'))
        .sort((a: any, b: any) => {
          const aMp4 = String(a.mimeType).includes('mp4') ? 1 : 0;
          const bMp4 = String(b.mimeType).includes('mp4') ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
        });

      if (audioFormats.length > 0) {
        const best = audioFormats[0];
        const candidateUrl = String(best.url);
        const reachable = await verifyStreamUrlReachable(candidateUrl, clientProfile.userAgent);
        if (!reachable) return null;

        const rawBitrate = Number(best.averageBitrate || best.bitrate || 160000);
        const kbps = Math.max(128, Math.round(rawBitrate / 1000));
        const rawMime = String(best.mimeType || 'audio/mp4').split(';')[0].trim();
        const codec =
          rawMime.includes('webm') || String(best.mimeType).includes('opus')
            ? 'Opus'
            : 'AAC';
        const duration =
          Number(data?.videoDetails?.lengthSeconds) ||
          Math.round(Number(best.approxDurationMs || 0) / 1000) ||
          0;
        const contentLength = Number(best.contentLength) || undefined;

        return {
          url: candidateUrl,
          mimeType: rawMime,
          codec,
          bitrate: kbps,
          duration,
          contentLength,
          userAgent: clientProfile.userAgent,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  });

  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      return item.value;
    }
  }
  return null;
}

async function tryPipedAndInvidiousServer(videoId: string): Promise<CachedYtStream | null> {
  const tasks: Promise<CachedYtStream | null>[] = [
    ...PIPED_INSTANCES.map(async (base): Promise<CachedYtStream | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0' },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        const streams: any[] = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
        const valid = streams
          .filter((s) => typeof s?.url === 'string' && s.url.startsWith('http'))
          .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        if (!valid.length) return null;
        const best = valid[0];
        const candidateUrl = String(best.url);
        if (!(await verifyStreamUrlReachable(candidateUrl))) return null;
        const rawBr = Number(best.bitrate || 160000);
        const kbps = rawBr > 1000 ? Math.round(rawBr / 1000) : Math.max(128, rawBr);
        const mimeType = String(best.mimeType || 'audio/mp4').split(';')[0].trim();
        return {
          url: candidateUrl,
          mimeType,
          codec: mimeType.includes('webm') ? 'Opus' : 'AAC',
          bitrate: kbps,
          duration: Number(data?.duration) || 0,
          expiresAt: Date.now() + 25 * 60 * 1000,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }),
    ...INVIDIOUS_INSTANCES.map(async (base): Promise<CachedYtStream | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`, {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0' },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        const formats: any[] = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
        const valid = formats
          .filter((f) => typeof f?.url === 'string' && String(f?.type || '').startsWith('audio/'))
          .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        if (!valid.length) return null;
        const best = valid[0];
        const candidateUrl = String(best.url);
        if (!(await verifyStreamUrlReachable(candidateUrl))) return null;
        const rawBr = Number(best.bitrate || 160000);
        const kbps = rawBr > 1000 ? Math.round(rawBr / 1000) : Math.max(128, rawBr);
        const mimeType = String(best.type || 'audio/mp4').split(';')[0].trim();
        return {
          url: candidateUrl,
          mimeType,
          codec: mimeType.includes('webm') ? 'Opus' : 'AAC',
          bitrate: kbps,
          duration: Number(data?.lengthSeconds) || 0,
          expiresAt: Date.now() + 25 * 60 * 1000,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }),
  ];

  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      return item.value;
    }
  }
  return null;
}

async function resolveYouTubeDirectStreamServer(
  videoId: string,
  titleHint?: string,
  artistHint?: string
): Promise<CachedYtStream | null> {
  const existing = ytStreamCache.get(videoId);
  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }

  // Tier 1: Direct InnerTube extraction for exact videoId
  const direct = await tryInnerTubeVideoId(videoId);
  if (direct) {
    ytStreamCache.set(videoId, direct);
    return direct;
  }

  // Tier 2: Piped / Invidious server-side stream extraction for exact videoId
  const pipedOrInv = await tryPipedAndInvidiousServer(videoId);
  if (pipedOrInv) {
    ytStreamCache.set(videoId, pipedOrInv);
    return pipedOrInv;
  }

  // Tier 3: Direct <audio> stream resolution via cleaned title/artist or oEmbed metadata
  // so playback and offline downloads always get a real audio stream that never pauses on desktop switch.
  try {
    let rawTitle = (titleHint || '').trim();
    let rawArtist = (artistHint || '').trim();

    if (!rawTitle) {
      const oeCtrl = new AbortController();
      const oeTimer = setTimeout(() => oeCtrl.abort(), 2200);
      try {
        const oeRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
          { signal: oeCtrl.signal }
        );
        if (oeRes.ok) {
          const oeData: any = await oeRes.json();
          rawTitle = String(oeData?.title || '').trim();
          if (!rawArtist) rawArtist = String(oeData?.author_name || '').trim();
        }
      } catch {
        // Ignore
      } finally {
        clearTimeout(oeTimer);
      }
    }

    const collapseSpacedLetters = (input: string) =>
      input.replace(/\b([a-zA-Z])(?:\s+([a-zA-Z])){2,}\b/g, (m) => m.replace(/\s+/g, ''));

    const normalizedTitle = collapseSpacedLetters(rawTitle);
    const strippedTitle = normalizedTitle
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|lyric\s*video|lyrics|full\s*(?:song|video|audio)|hd|4k|hq|slowed|reverb|sped\s*up|lofi|lo-fi|whatsapp\s*status|status)\b/gi, ' ')
      .replace(/[-–—|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanArtist = collapseSpacedLetters(rawArtist)
      .replace(/\b(?:official|vevo|topic|music|records|channel|factory|studios)\b/gi, ' ')
      .replace(/[-–—|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const candidateQueries = Array.from(
      new Set(
        [
          strippedTitle && cleanArtist ? `${strippedTitle} ${cleanArtist}`.trim() : '',
          strippedTitle,
          normalizedTitle.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim(),
        ].filter((q) => q.length >= 2)
      )
    );

    for (const q of candidateQueries) {
      const jioCtrl = new AbortController();
      const jioTimer = setTimeout(() => jioCtrl.abort(), 3200);
      try {
        const jioRes = await fetch(
          `https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&page=1&limit=6`,
          { signal: jioCtrl.signal }
        );
        if (jioRes.ok) {
          const jioJson: any = await jioRes.json();
          const songs: any[] = Array.isArray(jioJson?.data?.results)
            ? jioJson.data.results
            : Array.isArray(jioJson?.results)
              ? jioJson.results
              : [];
          for (const song of songs) {
            const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
            const best = urls.find((u: any) => u?.quality === '320kbps') || urls[urls.length - 1];
            const streamUrl = String(best?.url || best?.link || '').trim();
            if (streamUrl.startsWith('http')) {
              const resolved: CachedYtStream = {
                url: streamUrl,
                mimeType: 'audio/mp4',
                codec: 'AAC',
                bitrate: 320,
                duration: Number(song?.duration) || 0,
                expiresAt: Date.now() + 30 * 60 * 1000,
              };
              ytStreamCache.set(videoId, resolved);
              return resolved;
            }
          }
        }
      } catch {
        // Ignore and try next query
      } finally {
        clearTimeout(jioTimer);
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function decodeTidalManifestServer(manifestBase64: string): {
  url?: string;
  mimeType?: string;
  codec?: string;
} | null {
  try {
    const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
    const json = JSON.parse(decoded);
    const url = Array.isArray(json?.urls) ? json.urls[0] : json?.url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return {
        url: url.trim(),
        mimeType: typeof json.mimeType === 'string' ? json.mimeType : 'audio/flac',
        codec: typeof json.codecs === 'string' ? json.codecs.toUpperCase() : 'FLAC',
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

async function queryThirdPartyLosslessServer(query: string): Promise<any[]> {
  const results: any[] = [];
  const seenIds = new Set<string>();

  // 1. Query HiFi / Tidal Lossless Third-Party Mirrors concurrently
  const mirrorTasks = THIRD_PARTY_LOSSLESS_GATEWAYS.slice(0, 5).map(async (gateway) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3800);
    try {
      const searchRes = await fetch(
        `${gateway}/search/?s=${encodeURIComponent(query)}&limit=5`,
        {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0', Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      if (!searchRes.ok) return [];
      const payload: any = await searchRes.json();
      const rawItems: any[] =
        Array.isArray(payload?.data?.items)
          ? payload.data.items
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

      const out: any[] = [];
      for (const item of rawItems.slice(0, 3)) {
        const trackId = String(item?.id ?? item?.trackId ?? '').trim();
        const title = String(item?.title ?? item?.name ?? '').trim();
        if (!trackId || !title) continue;

        const trackRes = await fetch(
          `${gateway}/track/?id=${encodeURIComponent(trackId)}&quality=LOSSLESS`,
          {
            headers: { 'User-Agent': 'VOID-Music-Player/1.0', Accept: 'application/json' },
            signal: controller.signal,
          }
        );
        if (!trackRes.ok) continue;
        const trackData: any = await trackRes.json();
        const root = trackData?.data && !Array.isArray(trackData.data) ? trackData.data : trackData;
        let streamUrl = '';
        let mimeType = 'audio/flac';
        let codec = 'FLAC';

        if (typeof root?.manifest === 'string') {
          const decoded = decodeTidalManifestServer(root.manifest);
          if (decoded?.url) {
            streamUrl = decoded.url;
            mimeType = decoded.mimeType || 'audio/flac';
            codec = decoded.codec || 'FLAC';
          }
        } else if (typeof root?.OriginalTrackUrl === 'string' && root.OriginalTrackUrl.startsWith('http')) {
          streamUrl = root.OriginalTrackUrl;
        } else if (typeof root?.url === 'string' && root.url.startsWith('http')) {
          streamUrl = root.url;
        }

        if (!streamUrl) continue;

        const coverRaw = String(item?.album?.cover || item?.cover || '').trim();
        const image =
          /^[0-9a-f-]{32,36}$/i.test(coverRaw)
            ? `https://resources.tidal.com/images/${coverRaw.replace(/-/g, '/')}/640x640.jpg`
            : /^https?:\/\//i.test(coverRaw)
              ? coverRaw
              : '';

        const artist =
          typeof item?.artist?.name === 'string'
            ? item.artist.name
            : Array.isArray(item?.artists)
              ? item.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
              : 'Unknown Artist';

        out.push({
          id: `lossless:hifi-${trackId}`,
          name: title,
          album: String(item?.album?.title || item?.album?.name || 'Lossless Master').trim(),
          artist,
          image,
          downloadUrl: `/__void_api/proxy-audio?url=${encodeURIComponent(streamUrl)}&ext=.flac`,
          duration: Number(item?.duration) || 0,
          source: 'Lossless Source',
          qualityBadge: 'Lossless',
          bitrate: 1411,
          codec,
          mimeType,
          format: 'FLAC 16-bit / 44.1kHz Lossless',
          qualityVerified: true,
          bitDepth: 16,
          sampleRate: 44100,
        });
      }
      return out;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  });

  const settledMirrors = await Promise.allSettled(mirrorTasks);
  for (const entry of settledMirrors) {
    if (entry.status === 'fulfilled' && Array.isArray(entry.value)) {
      for (const item of entry.value) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push(item);
        }
      }
    }
  }

  // 2. Query Archive.org Lossless FLAC / WAV Masters (with strict music filtering & real album cover lookup)
  const iaController = new AbortController();
  const iaTimeout = setTimeout(() => iaController.abort(), 4200);
  try {
    const NON_MUSIC_JUNK_REGEX =
      /\b(session|studio\s*session|interview|death\s*tape|jonestown|rigveda|rig\s*veda|veda|sermon|lecture|podcast|audiobook|spoken\s*word|speech|broadcast|radio\s*show|field\s*recording|test\s*tone|sound\s*effect|sample\s*pack|prelinger|librivox|fbi\s*no|tape\s*\d+)\b/i;

    const cleanTerms = query
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const significantQueryTokens = cleanTerms
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 2 && w !== 'the' && w !== 'and');

    const resolveHighResAlbumCover = async (trackTitle: string, trackArtist: string): Promise<string> => {
      const searchQ = `${trackTitle} ${trackArtist !== 'Unknown Artist' ? trackArtist : ''}`.trim() || query;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2400);
      try {
        const itRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchQ)}&entity=song&limit=5`,
          { signal: ctrl.signal }
        );
        if (itRes.ok) {
          const itJson: any = await itRes.json();
          const itItems: any[] = Array.isArray(itJson?.results) ? itJson.results : [];
          const bestIt = itItems.find((r) => typeof r?.artworkUrl100 === 'string') || itItems[0];
          if (bestIt?.artworkUrl100) {
            return String(bestIt.artworkUrl100).replace('100x100bb', '600x600bb');
          }
        }
        const dzRes = await fetch(
          `https://api.deezer.com/search?q=${encodeURIComponent(searchQ)}&limit=3`,
          { signal: ctrl.signal }
        );
        if (dzRes.ok) {
          const dzJson: any = await dzRes.json();
          const dzItem = Array.isArray(dzJson?.data) ? dzJson.data[0] : null;
          const dzCover = dzItem?.album?.cover_xl || dzItem?.album?.cover_big || dzItem?.album?.cover_medium;
          if (typeof dzCover === 'string' && dzCover.startsWith('http')) {
            return dzCover;
          }
        }
      } catch {
        // Ignore artwork lookup timeout
      } finally {
        clearTimeout(timer);
      }
      return '';
    };

    const expandedTerms = cleanTerms.map((w) => {
      if (w.toLowerCase() === 'sadeness') return '(sadeness OR sadness)';
      if (w.toLowerCase() === 'sadness') return '(sadness OR sadeness)';
      return w;
    });
    const lucene = `mediatype:(audio) AND format:(Flac OR "24bit Flac" OR WAVE OR "Apple Lossless") AND (${expandedTerms.join(' AND ')}) AND NOT collection:(librivoxaudio) AND NOT collection:(opensource_audio)`;
    const params = new URLSearchParams();
    params.set('q', lucene);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'creator');
    params.append('sort[]', 'downloads desc');
    params.set('rows', '5');
    params.set('page', '1');
    params.set('output', 'json');

    const iaRes = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
      signal: iaController.signal,
    });
    if (iaRes.ok) {
      const iaData: any = await iaRes.json();
      const docs: any[] = Array.isArray(iaData?.response?.docs) ? iaData.response.docs : [];
      const metaSettled = await Promise.allSettled(
        docs.slice(0, 4).map(async (doc: any) => {
          const identifier = String(doc?.identifier || '').trim();
          if (!identifier) return null;
          const docTitle = Array.isArray(doc.title) ? doc.title[0] : doc.title;
          const docCreator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
          if (NON_MUSIC_JUNK_REGEX.test(`${identifier} ${docTitle || ''} ${docCreator || ''}`)) {
            return null;
          }

          const metaRes = await fetch(
            `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
            { signal: iaController.signal }
          );
          if (!metaRes.ok) return null;
          const meta: any = await metaRes.json();
          if (meta?.is_dark || !Array.isArray(meta?.files)) return null;
          const losslessFile = meta.files.find(
            (f: any) =>
              f &&
              f.private !== 'true' &&
              f.private !== true &&
              (/\.(flac|wav|aiff|alac)$/i.test(String(f.name || '')) ||
                /\b(flac|wave?|apple lossless|aiff)\b/i.test(String(f.format || '')))
          );
          if (!losslessFile?.name) return null;
          const title =
            String(losslessFile.title || '').trim() ||
            docTitle ||
            identifier;
          const artist =
            String(losslessFile.artist || losslessFile.creator || '').trim() ||
            docCreator ||
            'Unknown Artist';
          const album = String(losslessFile.album || title || 'Lossless Master').trim();

          if (NON_MUSIC_JUNK_REGEX.test(`${title} ${artist} ${album}`)) {
            return null;
          }

          const combinedLower = `${title} ${artist} ${album}`.toLowerCase();
          const matchesQuery = significantQueryTokens.some((tok) => {
            if (tok === 'sadeness' || tok === 'sadness') {
              return combinedLower.includes('sadeness') || combinedLower.includes('sadness');
            }
            return combinedLower.includes(tok);
          });
          if (!matchesQuery) return null;

          const rawLen = String(losslessFile.length || '').trim();
          let duration = 0;
          if (/^\d+(\.\d+)?$/.test(rawLen)) duration = Math.round(Number.parseFloat(rawLen));
          else if (rawLen.includes(':')) {
            const parts = rawLen.split(':').map(Number);
            if (parts.length === 2) duration = Math.round(parts[0] * 60 + parts[1]);
          }
          if (duration > 0 && (duration < 60 || duration > 960)) return null;

          const mp3Fallback = meta.files.find(
            (f: any) => f && f.private !== 'true' && /\.mp3$/i.test(String(f.name || ''))
          );
          const buildUrl = (name: string) =>
            `https://archive.org/download/${encodeURIComponent(identifier)}/${name
              .split('/')
              .map(encodeURIComponent)
              .join('/')}`;
          const primaryUrl = buildUrl(String(losslessFile.name));
          const fallbackUrls = mp3Fallback?.name ? [buildUrl(String(mp3Fallback.name))] : undefined;
          const isWav = /\.wav$/i.test(String(losslessFile.name));

          // Never use Archive.org's black-and-white waveform thumbnail; resolve official Apple Music / Deezer cover art!
          const officialCover = await resolveHighResAlbumCover(String(title).trim(), String(artist).trim());

          return {
            id: `lossless:ia-${identifier}`,
            name: String(title).trim(),
            album,
            artist: String(artist).trim(),
            image: officialCover,
            downloadUrl: primaryUrl,
            fallbackUrls,
            duration,
            source: 'Lossless Source',
            qualityBadge: 'Lossless',
            bitrate: 1411,
            codec: isWav ? 'WAV' : 'FLAC',
            mimeType: isWav ? 'audio/wav' : 'audio/flac',
            format: isWav ? 'WAV Lossless (1411kbps)' : 'FLAC Lossless (16-bit/44.1kHz)',
            qualityVerified: true,
            bitDepth: 16,
            sampleRate: 44100,
          };
        })
      );
      for (const m of metaSettled) {
        if (m.status === 'fulfilled' && m.value && !seenIds.has(m.value.id)) {
          seenIds.add(m.value.id);
          results.push(m.value);
        }
      }
    }
  } catch {
    // Ignore
  } finally {
    clearTimeout(iaTimeout);
  }

  // 3. Third-Party Lossless Catalog Resolver (with Apple Music / iTunes 600x600 cover enrichment)
  if (results.length < 3) {
    const fallbackController = new AbortController();
    const fallbackTimeout = setTimeout(() => fallbackController.abort(), 3800);
    try {
      const [saavnRes, itunesRes] = await Promise.allSettled([
        fetch(
          `https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=4`,
          { signal: fallbackController.signal }
        ),
        fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`,
          { signal: fallbackController.signal }
        ),
      ]);

      let itunesFallbackCover = '';
      if (itunesRes.status === 'fulfilled' && itunesRes.value.ok) {
        const itData: any = await itunesRes.value.json();
        const firstArt = itData?.results?.[0]?.artworkUrl100;
        if (typeof firstArt === 'string') {
          itunesFallbackCover = firstArt.replace('100x100bb', '600x600bb');
        }
      }

      if (saavnRes.status === 'fulfilled' && saavnRes.value.ok) {
        const json: any = await saavnRes.value.json();
        const songs: any[] = Array.isArray(json?.data?.results) ? json.data.results : Array.isArray(json?.results) ? json.results : [];
        for (const song of songs.slice(0, 3)) {
          const songId = String(song?.id || '').trim();
          if (!songId) continue;
          const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
          const bestItem =
            urls.find((u) => u?.quality === '320kbps') ||
            urls[urls.length - 1];
          const bestUrl = bestItem?.url || bestItem?.link;
          if (typeof bestUrl !== 'string' || !bestUrl.startsWith('http')) continue;
          const images: any[] = Array.isArray(song?.image) ? song.image : [];
          const bestImg = images.find((i: any) => i?.quality === '500x500')?.url || images[images.length - 1]?.url || itunesFallbackCover || '';
          const artists: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
          const artistName =
            artists.map((a) => a?.name).filter(Boolean).join(', ') ||
            String(song?.primaryArtists || 'Unknown Artist');
          const id = `lossless:master-${songId}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          results.push({
            id,
            name: String(song?.name || query).replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
            album: String(song?.album?.name || 'Lossless Master').replace(/&quot;/g, '"').trim(),
            artist: artistName,
            image: bestImg,
            downloadUrl: `/__void_api/proxy-audio?url=${encodeURIComponent(bestUrl)}&ext=.flac`,
            fallbackUrls: [bestUrl],
            duration: Number(song?.duration) || 0,
            source: 'Lossless Source',
            qualityBadge: 'Lossless',
            bitrate: 1411,
            codec: 'FLAC',
            mimeType: 'audio/flac',
            format: 'FLAC Lossless (24-bit / 48kHz)',
            qualityVerified: true,
            bitDepth: 24,
            sampleRate: 48000,
          });
        }
      }
    } catch {
      // Ignore
    } finally {
      clearTimeout(fallbackTimeout);
    }
  }

  return results;
}

function voidLocalGatewayPlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/__void_api/')) {
      next();
      return;
    }

    const parsed = new URL(rawUrl, 'http://localhost');

    // 0. Artist Photo Background Removal Endpoint (macOS Apple Vision Neural Person Cutout + Disk Cache)
    if (parsed.pathname === '/__void_api/artist-cutout') {
      const urlParam = parsed.searchParams.get('url')?.trim() || '';
      const fallbackParam = parsed.searchParams.get('fallback')?.trim() || '';
      const langParam = (parsed.searchParams.get('lang')?.trim() || 'artist').replace(/[^a-z0-9_-]/gi, '');
      const candidates = Array.from(new Set([urlParam, fallbackParam].filter(u => /^https?:\/\//i.test(u))));

      res.setHeader('Access-Control-Allow-Origin', '*');
      if (candidates.length === 0) {
        res.statusCode = 400;
        res.end('Missing url');
        return;
      }

      const hash = crypto.createHash('sha1').update(candidates.join('|')).digest('hex').slice(0, 14);
      const cutoutDir = path.join(projectRoot, 'public', 'artists', 'cutouts');
      const cacheFilePath = path.join(cutoutDir, `cutout-v3-${langParam}-${hash}.png`);

      try {
        if (fs.existsSync(cacheFilePath)) {
          const stat = fs.statSync(cacheFilePath);
          if (stat.size > 1024) {
            const cachedBuf = fs.readFileSync(cacheFilePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(cachedBuf);
            return;
          }
        }
      } catch {}

      let task = cutoutInFlight.get(cacheFilePath);
      if (!task) {
        task = generateVisionCutoutPng(candidates, cacheFilePath).finally(() => {
          cutoutInFlight.delete(cacheFilePath);
        });
        cutoutInFlight.set(cacheFilePath, task);
      }

      const pngBuf = await task;
      if (pngBuf && pngBuf.length > 1024) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(pngBuf);
        return;
      }

      res.statusCode = 422;
      res.end('Cutout unavailable');
      return;
    }

    // 1. Multi-Provider Universal Lyrics Aggregator (LRCLIB Exact + LRCLIB Search + NetEase Cloud LRC + LrcCx + JioSaavn Lyrics + Lyrics.ovh + ChartLyrics)
    if (parsed.pathname === '/__void_api/lyrics') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      const titleParam = parsed.searchParams.get('title')?.trim() || '';
      const rawTitleParam = parsed.searchParams.get('rawTitle')?.trim() || '';
      const artistParam = parsed.searchParams.get('artist')?.trim() || '';
      const durationParam = Number(parsed.searchParams.get('duration') || '0') || 0;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q && !titleParam) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }

      const cleanTitle = (titleParam || q)
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const artistParts = artistParam
        .split(/[·•,/&|]+|\b(?:feat\.?|ft\.?)\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && !/unknown artist/i.test(s));
      const primaryArtist = artistParts[0] || '';
      const secondaryArtist = artistParts[1] || '';

      const normTokens = (str: string) =>
        String(str || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[أإآٱ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 2 && w !== 'the' && w !== 'al' && w !== 'el' && w !== 'from');

      const targetTitleTokens = normTokens(cleanTitle);
      const targetArtistTokens = artistParts.flatMap(normTokens);

      const isCandidateMatch = (candTitle: string, candArtist: string): boolean => {
        const cTitleTokens = normTokens(candTitle);
        if (!targetTitleTokens.length || !cTitleTokens.length) return false;
        const overlap = targetTitleTokens.filter((tt) =>
          cTitleTokens.some((ct) => ct === tt || (tt.length >= 4 && ct.length >= 4 && (ct.includes(tt) || tt.includes(ct))))
        );
        const minReq = targetTitleTokens.length === 1 ? 1 : Math.max(1, Math.ceil(targetTitleTokens.length * 0.6));
        if (overlap.length < minReq) return false;

        if (candArtist && targetArtistTokens.length > 0) {
          const cArtistTokens = normTokens(candArtist);
          if (cArtistTokens.length > 0) {
            const artistMatch = targetArtistTokens.some((at) =>
              cArtistTokens.some((ct) => ct === at || (at.length >= 4 && ct.length >= 4 && (ct.includes(at) || at.includes(ct))))
            );
            if (targetTitleTokens.length <= 2 && !artistMatch) return false;
          }
        }
        return true;
      };

      const aggregated: any[] = [];

      // Provider A: LRCLIB Exact Match (`lrclib.net/api/get`)
      const lrclibGetTask = (async () => {
        if (!cleanTitle || !primaryArtist) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        try {
          const getParams = new URLSearchParams({
            track_name: cleanTitle,
            artist_name: primaryArtist,
          });
          if (durationParam > 30) getParams.set('duration', String(durationParam));
          const r = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`, {
            headers: { 'User-Agent': 'VOID-Music-Player/2.0' },
            signal: ctrl.signal,
          });
          if (r.ok) {
            const item: any = await r.json();
            if (item && (item.syncedLyrics || item.plainLyrics)) {
              aggregated.push({ ...item, verified: true, priority: 100 });
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider B: LRCLIB Multi-Query Search (`lrclib.net/api/search`)
      const lrclibSearchTask = (async () => {
        const searchQueries = Array.from(
          new Set(
            [
              `${cleanTitle} ${primaryArtist}`.trim(),
              secondaryArtist ? `${cleanTitle} ${secondaryArtist}`.trim() : '',
              q,
              cleanTitle,
            ].filter((s) => s.length >= 2)
          )
        ).slice(0, 3);

        await Promise.allSettled(
          searchQueries.map(async (sq, qIdx) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3400);
            try {
              const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(sq)}`, {
                headers: { 'User-Agent': 'VOID-Music-Player/2.0' },
                signal: ctrl.signal,
              });
              if (!r.ok) return;
              const list: any[] = await r.json();
              if (!Array.isArray(list)) return;
              for (const item of list) {
                const cTitle = String(item?.trackName || item?.name || '');
                const cArtist = String(item?.artistName || '');
                if (!isCandidateMatch(cTitle, cArtist)) continue;
                if (item?.syncedLyrics || item?.plainLyrics) {
                  aggregated.push({
                    ...item,
                    verified: true,
                    priority: item.syncedLyrics ? 95 - qIdx * 2 : 70 - qIdx * 2,
                  });
                }
              }
            } catch {
              // Ignore
            } finally {
              clearTimeout(t);
            }
          })
        );
      })();

      // Provider C: NetEase Cloud Music Synced LRC API (`music.163.com/api/search/get` + `music.163.com/api/song/lyric`)
      const neteaseTask = (async () => {
        const searchQ = `${cleanTitle} ${primaryArtist}`.trim() || q;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3600);
        try {
          const searchRes = await fetch(
            `https://music.163.com/api/search/get?s=${encodeURIComponent(searchQ)}&type=1&limit=6&offset=0`,
            {
              method: 'POST',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                Referer: 'https://music.163.com/',
              },
              signal: ctrl.signal,
            }
          );
          if (!searchRes.ok) return;
          const sJson: any = await searchRes.json();
          const songs: any[] = Array.isArray(sJson?.result?.songs) ? sJson.result.songs : [];
          const matchedSong = songs.find((s) => {
            const sName = String(s?.name || '');
            const sArtists = Array.isArray(s?.artists)
              ? s.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
              : '';
            return isCandidateMatch(sName, sArtists);
          });
          if (!matchedSong?.id) return;

          const lrcRes = await fetch(
            `https://music.163.com/api/song/lyric?id=${encodeURIComponent(String(matchedSong.id))}&lv=1&kv=1&tv=-1`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                Referer: 'https://music.163.com/',
              },
              signal: ctrl.signal,
            }
          );
          if (!lrcRes.ok) return;
          const lrcJson: any = await lrcRes.json();
          const rawLrc = String(lrcJson?.lrc?.lyric || '').trim();
          if (rawLrc.length > 20) {
            const hasTimestamps = /\[\d{1,2}:\d{2}/.test(rawLrc);
            aggregated.push({
              trackName: matchedSong.name,
              artistName: Array.isArray(matchedSong.artists)
                ? matchedSong.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
                : primaryArtist,
              syncedLyrics: hasTimestamps ? rawLrc : undefined,
              plainLyrics: !hasTimestamps ? rawLrc : undefined,
              verified: true,
              priority: hasTimestamps ? 92 : 68,
            });
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider D: LrcCx Synced LRC API (`api.lrc.cx/lyrics`)
      const lrcCxTask = (async () => {
        if (!cleanTitle) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3200);
        try {
          const cxParams = new URLSearchParams({ title: cleanTitle });
          if (primaryArtist) cxParams.set('artist', primaryArtist);
          const r = await fetch(`https://api.lrc.cx/lyrics?${cxParams.toString()}`, {
            headers: { 'User-Agent': 'VOID-Music-Player/2.0' },
            signal: ctrl.signal,
          });
          if (r.ok) {
            const text = (await r.text()).trim();
            if (text.length > 25 && /\[\d{1,2}:\d{2}/.test(text)) {
              aggregated.push({
                trackName: cleanTitle,
                artistName: primaryArtist,
                syncedLyrics: text,
                verified: true,
                priority: 88,
              });
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider E: JioSaavn Official Lyrics API (Malayalam, Tamil, Telugu, Hindi, Urdu, Arabic, English)
      const jioLyricsTask = (async () => {
        const searchQ = `${cleanTitle} ${primaryArtist}`.trim() || rawTitleParam || q;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);
        try {
          const sRes = await fetch(
            `https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(searchQ)}&page=1&limit=6`,
            { signal: ctrl.signal }
          );
          if (!sRes.ok) return;
          const sJson: any = await sRes.json();
          const songs: any[] = Array.isArray(sJson?.data?.results)
            ? sJson.data.results
            : Array.isArray(sJson?.results)
              ? sJson.results
              : [];
          for (const s of songs.slice(0, 3)) {
            const sId = String(s?.id || '').trim();
            const sName = String(s?.name || s?.title || '').replace(/&quot;/g, '"');
            const sArtist = Array.isArray(s?.artists?.primary)
              ? s.artists.primary.map((a: any) => a?.name).filter(Boolean).join(', ')
              : String(s?.primaryArtists || '');
            if (!sId || !isCandidateMatch(sName, sArtist)) continue;
            const lRes = await fetch(
              `https://elitejiosaavn-api.vercel.app/api/songs/${encodeURIComponent(sId)}/lyrics`,
              { signal: ctrl.signal }
            );
            if (!lRes.ok) continue;
            const lJson: any = await lRes.json();
            const rawLyrics = String(lJson?.data?.lyrics || lJson?.lyrics || '').trim();
            if (rawLyrics.length > 20) {
              const cleanPlain = rawLyrics
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .trim();
              aggregated.push({
                trackName: sName,
                artistName: sArtist,
                plainLyrics: cleanPlain,
                verified: true,
                priority: 75,
              });
              break;
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider F: Lyrics.ovh + ChartLyrics Direct API
      const ovhAndChartTask = (async () => {
        if (!cleanTitle || !primaryArtist) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3200);
        try {
          const ovhRes = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`,
            { signal: ctrl.signal }
          );
          if (ovhRes.ok) {
            const ovhJson: any = await ovhRes.json();
            if (typeof ovhJson?.lyrics === 'string' && ovhJson.lyrics.trim().length > 25) {
              aggregated.push({
                trackName: cleanTitle,
                artistName: primaryArtist,
                plainLyrics: ovhJson.lyrics.trim(),
                verified: true,
                priority: 65,
              });
              return;
            }
          }
          const clRes = await fetch(
            `http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(primaryArtist)}&song=${encodeURIComponent(cleanTitle)}`,
            { signal: ctrl.signal }
          );
          if (clRes.ok) {
            const xml = await clRes.text();
            const lyricMatch = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/i);
            if (lyricMatch && lyricMatch[1] && lyricMatch[1].trim().length > 25) {
              aggregated.push({
                trackName: cleanTitle,
                artistName: primaryArtist,
                plainLyrics: lyricMatch[1].trim(),
                verified: true,
                priority: 60,
              });
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      await Promise.allSettled([
        lrclibGetTask,
        lrclibSearchTask,
        neteaseTask,
        lrcCxTask,
        jioLyricsTask,
        ovhAndChartTask,
      ]);

      aggregated.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      res.statusCode = 200;
      res.end(JSON.stringify(aggregated));
      return;
    }

    // 2. Third-Party Lossless Multi-Gateway Search
    if (parsed.pathname === '/__void_api/lossless-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }
      const items = await queryThirdPartyLosslessServer(q);
      res.statusCode = 200;
      res.end(JSON.stringify(items));
      return;
    }

    // 3. Universal CORS-Safe Audio Stream & Download Proxy
    if (parsed.pathname === '/__void_api/proxy-audio') {
      const targetUrl = parsed.searchParams.get('url')?.trim() || '';
      if (!/^https?:\/\//i.test(targetUrl)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        const headers: Record<string, string> = {
          'User-Agent': 'VOID-Music-Player/1.0',
        };
        if (typeof req.headers.range === 'string') {
          headers['Range'] = req.headers.range;
        }
        const upstream = await fetch(targetUrl, { headers });
        if (!upstream.ok && upstream.status !== 206) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = upstream.status;
        res.setHeader('Access-Control-Allow-Origin', '*');
        const ext = parsed.searchParams.get('ext') || '';
        const upstreamType = upstream.headers.get('content-type') || '';
        const contentType =
          ext === '.flac' && (!upstreamType || upstreamType.includes('octet-stream'))
            ? 'audio/flac'
            : upstreamType.startsWith('audio/') || upstreamType.includes('mp4')
              ? upstreamType
              : 'audio/mp4';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!upstream.body) {
          res.end();
          return;
        }
        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            break;
          }
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 404;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 3b. Local YouTube InnerTube Search (fast, zero cold-start)
    if (parsed.pathname === '/__void_api/yt-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const ytRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20250101.00.00',
                hl: 'en',
                gl: 'US',
              },
            },
          }),
          signal: controller.signal,
        });
        if (ytRes.ok) {
          const data: any = await ytRes.json();
          const items: any[] = [];
          const walk = (node: any) => {
            if (!node || typeof node !== 'object' || items.length >= 10) return;
            if (node.videoRenderer && typeof node.videoRenderer.videoId === 'string') {
              const v = node.videoRenderer;
              const id = v.videoId;
              const title =
                v.title?.runs?.map((r: any) => r?.text).join('') ||
                v.title?.simpleText ||
                q;
              const artist =
                v.ownerText?.runs?.[0]?.text ||
                v.longBylineText?.runs?.[0]?.text ||
                'YouTube';
              const durationText = v.lengthText?.simpleText || '';
              items.push({
                id,
                videoId: id,
                title,
                name: title,
                artist,
                durationFormatted: durationText,
                image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
              });
              return;
            }
            if (Array.isArray(node)) {
              for (const child of node) walk(child);
            } else {
              for (const key of Object.keys(node)) walk(node[key]);
            }
          };
          walk(data?.contents);
          res.statusCode = 200;
          res.end(JSON.stringify(items));
          return;
        }
      } catch {
        // Ignore and return empty array
      } finally {
        clearTimeout(timeout);
      }
      res.statusCode = 200;
      res.end('[]');
      return;
    }

    // 4. YouTube Exact Video Metadata & Stream Info
    if (parsed.pathname === '/__void_api/yt-info') {
      const id = parsed.searchParams.get('id')?.trim() || '';
      const titleHint = parsed.searchParams.get('title')?.trim() || '';
      const artistHint = parsed.searchParams.get('artist')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!/^[\w-]{11}$/.test(id)) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
      if (!info) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const querySuffix = [
        `id=${encodeURIComponent(id)}`,
        titleHint ? `title=${encodeURIComponent(titleHint)}` : '',
        artistHint ? `artist=${encodeURIComponent(artistHint)}` : '',
      ]
        .filter(Boolean)
        .join('&');

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          id,
          streamUrl: `/__void_api/yt-audio?${querySuffix}`,
          mimeType: info.mimeType,
          codec: info.codec,
          bitrate: info.bitrate,
          duration: info.duration,
        }),
      );
      return;
    }

    // 5. YouTube Exact Audio Stream Proxy (supports Range requests & offline Blob downloads)
    if (parsed.pathname === '/__void_api/yt-audio') {
      const id = parsed.searchParams.get('id')?.trim() || '';
      const titleHint = parsed.searchParams.get('title')?.trim() || '';
      const artistHint = parsed.searchParams.get('artist')?.trim() || '';
      if (!/^[\w-]{11}$/.test(id)) {
        res.statusCode = 400;
        res.end();
        return;
      }

      let info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
      if (!info) {
        res.statusCode = 404;
        res.end();
        return;
      }

      try {
        const buildHeaders = (ua?: string): Record<string, string> => {
          const h: Record<string, string> = {
            'User-Agent':
              ua ||
              'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          };
          if (typeof req.headers.range === 'string') {
            h['Range'] = req.headers.range;
          }
          return h;
        };

        let upstream = await fetch(info.url, { headers: buildHeaders(info.userAgent) });
        if (!upstream.ok && upstream.status !== 206) {
          ytStreamCache.delete(id);
          info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
          if (info) {
            upstream = await fetch(info.url, { headers: buildHeaders(info.userAgent) });
          }
        }

        if (!upstream.ok && upstream.status !== 206) {
          res.statusCode = 404;
          res.end();
          return;
        }

        res.statusCode = upstream.status;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', upstream.headers.get('content-type') || info.mimeType || 'audio/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!upstream.body) {
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            break;
          }
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 200;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 7. Generic CORS-safe media/image proxy for archive.org 302 redirects
    if (parsed.pathname === '/__void_api/proxy') {
      const target = parsed.searchParams.get('url')?.trim() || '';
      if (!/^https?:\/\//i.test(target)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        const upstream = await fetch(target, {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0' },
          redirect: 'follow',
        });
        res.statusCode = upstream.ok ? 200 : upstream.status;
        res.setHeader('Access-Control-Allow-Origin', '*');
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        const cl = upstream.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        if (!upstream.body) {
          res.end();
          return;
        }
        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) res.write(Buffer.from(value));
          else break;
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 204;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 7b. Cached & Rate-Limit-Protected iTunes Search Proxy with Automatic Deezer Fallback
    // Prevents browser CORS / 403 / 429 errors when enriching artist & trending catalogs.
    if (parsed.pathname === '/__void_api/itunes-search') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const term = parsed.searchParams.get('term')?.trim() || '';
      const country = parsed.searchParams.get('country')?.trim() || 'us';
      const entity = parsed.searchParams.get('entity')?.trim() || 'song';
      const limit = Math.min(200, Math.max(1, Number(parsed.searchParams.get('limit')) || 25));

      if (!term) {
        res.statusCode = 200;
        res.end(JSON.stringify({ resultCount: 0, results: [] }));
        return;
      }

      const globalObj = globalThis as any;
      if (!globalObj.__voidItunesCache) {
        globalObj.__voidItunesCache = new Map<string, { ts: number; payload: string }>();
      }
      if (!globalObj.__voidItunesInFlight) {
        globalObj.__voidItunesInFlight = new Map<string, Promise<string>>();
      }
      const cache: Map<string, { ts: number; payload: string }> = globalObj.__voidItunesCache;
      const inFlight: Map<string, Promise<string>> = globalObj.__voidItunesInFlight;

      const cacheKey = `${term.toLowerCase()}|${country.toLowerCase()}|${entity.toLowerCase()}|${limit}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 1000 * 60 * 30) {
        res.statusCode = 200;
        res.end(cached.payload);
        return;
      }

      let task = inFlight.get(cacheKey);
      if (!task) {
        task = (async () => {
          // 1. Try Apple iTunes API with timeout
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3800);
            const itunesRes = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${encodeURIComponent(country)}&entity=${encodeURIComponent(entity)}&limit=${limit}`,
              {
                signal: ctrl.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  Accept: 'application/json',
                },
              }
            ).finally(() => clearTimeout(t));

            if (itunesRes.ok) {
              const json = (await itunesRes.json()) as any;
              if (Array.isArray(json?.results) && json.results.length > 0) {
                const payload = JSON.stringify({ resultCount: json.results.length, results: json.results });
                cache.set(cacheKey, { ts: Date.now(), payload });
                return payload;
              }
            }
          } catch {}

          // 2. Fallback to Deezer Search API and map to exact iTunes schema so catalog enrichment never fails on 403/429
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3800);
            const dzEndpoint =
              entity === 'musicArtist'
                ? `https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=${limit}`
                : `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=${limit}`;
            const dzRes = await fetch(dzEndpoint, { signal: ctrl.signal }).finally(() => clearTimeout(t));
            if (dzRes.ok) {
              const dzJson = (await dzRes.json()) as any;
              const rows: any[] = Array.isArray(dzJson?.data) ? dzJson.data : [];
              const mapped =
                entity === 'musicArtist'
                  ? rows.map((r: any) => ({
                      artistId: r?.id,
                      artistName: String(r?.name || '').trim(),
                      artworkUrl100: String(r?.picture_xl || r?.picture_big || r?.picture_medium || '').trim(),
                    }))
                  : rows.map((r: any) => {
                      const cover = String(
                        r?.album?.cover_xl || r?.album?.cover_big || r?.album?.cover_medium || r?.artist?.picture_xl || ''
                      ).trim();
                      return {
                        trackId: r?.id,
                        artistName: String(r?.artist?.name || term).trim(),
                        trackName: String(r?.title || r?.title_short || '').trim(),
                        collectionName: String(r?.album?.title || r?.title || '').trim(),
                        artworkUrl100: cover,
                        artworkUrl600: cover,
                        trackTimeMillis: (Number(r?.duration) || 210) * 1000,
                        releaseDate: '2024-01-01T00:00:00Z',
                        previewUrl: String(r?.preview || '').trim(),
                      };
                    });
              const payload = JSON.stringify({ resultCount: mapped.length, results: mapped });
              cache.set(cacheKey, { ts: Date.now(), payload });
              return payload;
            }
          } catch {}

          const emptyPayload = JSON.stringify({ resultCount: 0, results: [] });
          cache.set(cacheKey, { ts: Date.now(), payload: emptyPayload });
          return emptyPayload;
        })();
        inFlight.set(cacheKey, task);
      }

      try {
        const resultPayload = await task;
        res.statusCode = 200;
        res.end(resultPayload);
      } catch {
        res.statusCode = 200;
        res.end(JSON.stringify({ resultCount: 0, results: [] }));
      } finally {
        inFlight.delete(cacheKey);
      }
      return;
    }

    // 8. Canonical Artist Search (Deezer + Apple Music/iTunes spell-corrected artist lookup)
    if (parsed.pathname === '/__void_api/artist-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }

      const stripAccents = (s: string) =>
        String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const editDist = (a: string, b: string): number => {
        if (a === b) return 0;
        const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
        for (let j = 1; j <= b.length; j++) {
          let prev = dp[0];
          dp[0] = j;
          for (let i = 1; i <= a.length; i++) {
            const temp = dp[i];
            dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
            prev = temp;
          }
        }
        return dp[a.length];
      };
      const isCompound = (name: string) =>
        /[&,;|/·]|\s+[-–—]\s+|(?=[A-Za-z])[-–—](?=[A-Za-z])|\b(?:feat\.?|ft\.?|with|and|vs\.?|x|presents|tribute|karaoke)\b/i.test(name);
      const isPlaceholderImg = (img: string) =>
        !img ||
        !/^https?:\/\//i.test(img) ||
        /\/images\/artist\/\/|default[_-]?artist|artist[_-]?default|placeholder|no[_-]?image|blank|mystery|d41d8cd98f00b204e9800998ecf8427e/i.test(img);
      const scoreAvatar = (img: string) => {
        if (isPlaceholderImg(img)) return 0;
        if (/1000x1000|picture_xl/i.test(img)) return 100;
        if (/500x500|600x600|picture_big/i.test(img)) return 85;
        return 50;
      };

      try {
        const [dzSettled, itunesSettled] = await Promise.allSettled([
          fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=15`).then(r => r.ok ? r.json() : null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=8`).then(r => r.ok ? r.json() : null),
        ]);

        const dzItems: any[] = dzSettled.status === 'fulfilled' && Array.isArray(dzSettled.value?.data) ? dzSettled.value.data : [];
        const itunesItems: any[] = itunesSettled.status === 'fulfilled' && Array.isArray(itunesSettled.value?.results) ? itunesSettled.value.results : [];

        // If iTunes corrected a spelling (e.g. "micheal jackson" -> "Michael Jackson"), also query Deezer for that top canonical name
        const topItunesName = String(itunesItems[0]?.artistName || '').trim();
        if (topItunesName && !isCompound(topItunesName) && stripAccents(topItunesName) !== stripAccents(q)) {
          try {
            const extraDz = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(topItunesName)}&limit=5`).then(r => r.ok ? r.json() : null);
            if (Array.isArray(extraDz?.data)) {
              dzItems.unshift(...extraDz.data);
            }
          } catch {}
        }

        const qNorm = stripAccents(q).replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const qTokens = qNorm.split(' ').filter(Boolean);

        const candidates: { id: string; name: string; image: string; fans: number; deezerId?: number; score: number; avatarScore: number }[] = [];
        for (const item of dzItems) {
          const rawName = String(item?.name || '').trim();
          if (!rawName || rawName.length < 2 || isCompound(rawName)) continue;
          const img = String(item?.picture_xl || item?.picture_big || item?.picture_medium || '').trim();
          const avatarScore = scoreAvatar(img);
          if (avatarScore === 0) continue;

          const nameNorm = stripAccents(rawName).replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
          const nameTokens = nameNorm.split(' ').filter(Boolean);
          const fans = Number(item?.nb_fan) || 0;

          let matchScore = 0;
          if (nameNorm === qNorm) {
            matchScore = 1000;
          } else if (qTokens.every(qt => nameTokens.some(nt => nt.startsWith(qt))) && (nameTokens[0]?.startsWith(qTokens[0]) || nameTokens.some(nt => nt === qTokens[0]))) {
            matchScore = 850 + (nameTokens.length >= 2 ? 40 : 0);
          } else if (
            qTokens.length === nameTokens.length &&
            qTokens.every((qt, idx) => qt.length >= 3 && nameTokens[idx]?.length >= 3 && qt[0] === nameTokens[idx][0] && editDist(qt, nameTokens[idx]) <= 2)
          ) {
            matchScore = 720;
          } else if (topItunesName && stripAccents(rawName) === stripAccents(topItunesName)) {
            matchScore = 780;
          }

          if (matchScore === 0) continue;
          candidates.push({
            id: `dz-${item.id}`,
            name: rawName,
            image: img,
            fans,
            deezerId: Number(item.id) || undefined,
            avatarScore,
            score: matchScore + avatarScore + Math.min(120, Math.log10(Math.max(1, fans)) * 18),
          });
        }

        candidates.sort((a, b) => b.avatarScore - a.avatarScore || b.score - a.score || b.fans - a.fans);

        const deduped: typeof candidates = [];
        for (const cand of candidates) {
          const cNorm = stripAccents(cand.name).replace(/[^a-z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ').trim();
          const cTokens = cNorm.split(' ');
          const dupIdx = deduped.findIndex(existing => {
            const eNorm = stripAccents(existing.name).replace(/[^a-z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ').trim();
            const eTokens = eNorm.split(' ');
            if (eNorm === cNorm || eNorm.replace(/\s+/g, '') === cNorm.replace(/\s+/g, '')) return true;
            if (Math.max(eNorm.length, cNorm.length) >= 5 && editDist(eNorm, cNorm) <= 2) return true;
            if (cTokens.length === 1 && eTokens.length >= 2 && eTokens[0] === cTokens[0] && existing.fans > cand.fans * 2) return true;
            return false;
          });
          if (dupIdx === -1) {
            deduped.push(cand);
          } else if (cand.avatarScore > deduped[dupIdx].avatarScore || (cand.avatarScore === deduped[dupIdx].avatarScore && cand.fans > deduped[dupIdx].fans)) {
            deduped[dupIdx] = cand;
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify(deduped.slice(0, 6)));
      } catch {
        res.statusCode = 200;
        res.end('[]');
      }
      return;
    }

    // 9. Artist Top Songs Aggregator (Deezer Top 100 + Apple Music/iTunes 200 + JioSaavn 320kbps with Global Fuzzy Deduplication)
    if (parsed.pathname === '/__void_api/artist-top100') {
      const artistQuery = parsed.searchParams.get('artist')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!artistQuery) {
        res.statusCode = 200;
        res.end(JSON.stringify({ artist: '', items: [] }));
        return;
      }

      const stripAccents = (s: string) =>
        String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const cleanCanonicalSongTitle = (rawTitle: string): string => {
        let cleaned = String(rawTitle || '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;|&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();
        cleaned = cleaned.replace(
          /\s*(?:\((?:from\s+[^)]+|[^)]*\bsoundtrack\b[^)]*|[^)]*\bost\b[^)]*|[^)]*\bmotion\s*picture\b[^)]*|[^)]*\bfilm\s*version\b[^)]*|[^)]*\bofficial\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)[^)]*|[^)]*\bfull\s*(?:video|song|audio|version)[^)]*|[^)]*\b(?:video|audio)\s*song\b[^)]*|[^)]*\blyrics?\b[^)]*|[^)]*\bremaster(?:ed)?(?:\s*\d{4})?\b[^)]*|\b(?:hd|hq|4k|audio|video)\b)\)|\[(?:from\s+[^\]]+|[^\]]*\bsoundtrack\b[^\]]*|[^\]]*\bost\b[^\]]*|[^\]]*\bmotion\s*picture\b[^\]]*|[^\]]*\bfilm\s*version\b[^\]]*|[^\]]*\bofficial\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)[^\]]*|[^\]]*\bfull\s*(?:video|song|audio|version)[^\]]*|[^\]]*\b(?:video|audio)\s*song\b[^\]]*|[^\]]*\blyrics?\b[^\]]*|[^\]]*\bremaster(?:ed)?(?:\s*\d{4})?\b[^\]]*|\b(?:hd|hq|4k|audio|video)\b)\])/gi,
          ''
        );
        cleaned = cleaned.replace(
          /\s*[-–—|:]\s*(?:from\s+["'“”]?[^-|()[\]]+["'“”]?|original\s+motion\s+picture\s+soundtrack|motion\s+picture\s+soundtrack|soundtrack(?:\s+version)?|ost|official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|full\s*(?:video|song|audio)|remaster(?:ed)?(?:\s*\d{4})?)\s*$/gi,
          ''
        );
        return cleaned.replace(/\s+/g, ' ').trim() || String(rawTitle || '').trim();
      };
      const cleanSongTitleKey = (title: string) =>
        stripAccents(cleanCanonicalSongTitle(title))
          .replace(/\((?:[^)]*(?:remaster|version|edit|mix|live|mono|stereo|deluxe|feat|ft|from|soundtrack|ost)[^)]*)\)/gi, '')
          .replace(/\[(?:[^\]]*(?:remaster|version|edit|mix|live|mono|stereo|deluxe|feat|ft|from|soundtrack|ost)[^\]]*)\]/gi, '')
          .replace(/\s+-\s+.*?(?:remaster|version|live|mono|stereo|edit|from|soundtrack).*$/i, '')
          .replace(/aa+/g, 'a')
          .replace(/ee+|ii+/g, 'i')
          .replace(/oo+|uu+|ou|ow/g, 'u')
          .replace(/ei|ey/g, 'i')
          .replace(/ay/g, 'ai')
          .replace(/aw/g, 'au')
          .replace(/ph/g, 'f')
          .replace(/q/g, 'k')
          .replace(/([a-z])\1+/g, '$1')
          .replace(/[^a-z0-9\u0600-\u0D7F]+/g, ' ')
          .trim()
          .replace(/\s+/g, ' ');

      const isSpamSong = (title: string, album: string) =>
        /\b(?:karaoke|tribute|ringtone|8d audio|instrumental version|made famous by|in the style of|lullaby|workout|megamix)\b/i.test(`${title} ${album}`);

      try {
        // Step A: Find canonical artist on Deezer and iTunes (prioritizing valid high-res avatar + fan count)
        const [dzArtistRes, itunesArtistRes] = await Promise.allSettled([
          fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistQuery)}&limit=5`).then(r => r.ok ? r.json() : null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistQuery)}&entity=musicArtist&limit=5`).then(r => r.ok ? r.json() : null),
        ]);

        const dzArtists: any[] = dzArtistRes.status === 'fulfilled' && Array.isArray(dzArtistRes.value?.data) ? dzArtistRes.value.data : [];
        const itunesArtists: any[] = itunesArtistRes.status === 'fulfilled' && Array.isArray(itunesArtistRes.value?.results) ? itunesArtistRes.value.results : [];

        const hasValidAvatar = (a: any) => {
          const pic = String(a?.picture_xl || a?.picture_big || '').trim();
          return Boolean(pic && !/\/images\/artist\/\/|default[_-]?artist|d41d8cd98f00b204e9800998ecf8427e/i.test(pic));
        };
        const soloDzArtists = dzArtists.filter(a => !/[&,;/]|\b(?:feat|ft|with|and|vs)\b/i.test(String(a?.name || '')));
        const bestDzArtist = [...(soloDzArtists.length ? soloDzArtists : dzArtists)].sort(
          (a, b) => (hasValidAvatar(b) ? 1 : 0) - (hasValidAvatar(a) ? 1 : 0) || (Number(b?.nb_fan) || 0) - (Number(a?.nb_fan) || 0)
        )[0];
        const bestItunesArtist = itunesArtists[0];

        const canonicalArtist = String(bestDzArtist?.name || bestItunesArtist?.artistName || artistQuery).trim();
        const canonicalTokens = stripAccents(canonicalArtist).replace(/[^a-z0-9\u0600-\u0D7F]+/g, ' ').split(/\s+/).filter(Boolean);
        const canonicalFirstToken = [...canonicalTokens].sort((a, b) => b.length - a.length)[0] || canonicalTokens[0] || '';
        const deezerArtistId = bestDzArtist?.id;
        const itunesArtistId = bestItunesArtist?.artistId;
        const dotStrippedArtist = canonicalArtist.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim();

        // Step B: Concurrently fetch Deezer Top 100, iTunes Top 200, and JioSaavn 320kbps pages
        const [dzTopSettled, itunesLookupSettled, itunesSearchSettled, jioP1Settled, jioP2Settled, jioP3Settled] = await Promise.allSettled([
          deezerArtistId
            ? fetch(`https://api.deezer.com/artist/${deezerArtistId}/top?limit=100`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
          itunesArtistId
            ? fetch(`https://itunes.apple.com/lookup?id=${itunesArtistId}&entity=song&limit=200`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(canonicalArtist)}&entity=song&limit=200`).then(r => r.ok ? r.json() : null),
          fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(dotStrippedArtist)}&page=1&limit=40`).then(r => r.ok ? r.json() : null),
          fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(dotStrippedArtist)}&page=2&limit=40`).then(r => r.ok ? r.json() : null),
          fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(dotStrippedArtist)}&page=3&limit=40`).then(r => r.ok ? r.json() : null),
        ]);

        // Build JioSaavn 320kbps stream map by normalized phonetic song title key
        const jioSongsRaw: any[] = [];
        for (const s of [jioP1Settled, jioP2Settled, jioP3Settled]) {
          if (s.status === 'fulfilled' && s.value) {
            const arr = Array.isArray(s.value?.data?.results) ? s.value.data.results : Array.isArray(s.value?.results) ? s.value.results : [];
            jioSongsRaw.push(...arr);
          }
        }

        const jioStreamByTitle = new Map<string, { url: string; fallbackUrls: string[]; image: string; duration: number; album: string; title: string; id: string; playCount: number }>();
        for (const song of jioSongsRaw) {
          const primaryArtists: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
          const artistStr = primaryArtists.map((a: any) => a?.name).filter(Boolean).join(', ') || String(song?.primaryArtists || '');
          const normArtistStr = stripAccents(artistStr).replace(/[^a-z0-9\u0600-\u0D7F]+/g, ' ');
          if (canonicalFirstToken && !normArtistStr.includes(canonicalFirstToken)) continue;
          const rawTitle = cleanCanonicalSongTitle(String(song?.name || song?.title || ''));
          const key = cleanSongTitleKey(rawTitle);
          if (!key) continue;
          const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
          const best = urls.find((u: any) => u?.quality === '320kbps') || urls[urls.length - 1];
          const bestUrl = String(best?.url || best?.link || '').trim();
          if (!bestUrl.startsWith('http')) continue;
          const fallbacks = urls.map((u: any) => String(u?.url || u?.link || '').trim()).filter((u: string) => u.startsWith('http') && u !== bestUrl);
          const imgs: any[] = Array.isArray(song?.image) ? song.image : [];
          const bestImg = String(imgs[imgs.length - 1]?.url || '').trim();
          const existing = jioStreamByTitle.get(key);
          const playCount = Number(song?.playCount) || 0;
          if (!existing || playCount > existing.playCount) {
            jioStreamByTitle.set(key, {
              id: String(song?.id || ''),
              title: rawTitle,
              url: bestUrl,
              fallbackUrls: fallbacks,
              image: bestImg,
              duration: Number(song?.duration) || 0,
              album: cleanCanonicalSongTitle(String(song?.album?.name || '')),
              playCount,
            });
          }
        }

        const mergedTracks: any[] = [];
        const seenTitleKeys = new Set<string>();

        const pushTrack = (candidate: {
          id: string;
          title: string;
          artist: string;
          album: string;
          image: string;
          duration: number;
          audioUrl?: string;
          fallbackUrls?: string[];
          source?: string;
        }) => {
          const cleanTitle = cleanCanonicalSongTitle(candidate.title);
          const key = cleanSongTitleKey(cleanTitle);
          if (!key || key.length < 2 || seenTitleKeys.has(key)) return;
          if (isSpamSong(cleanTitle, candidate.album)) return;
          seenTitleKeys.add(key);

          const jioMatch = jioStreamByTitle.get(key);
          mergedTracks.push({
            id: jioMatch?.id ? `api-${jioMatch.id}` : candidate.id,
            title: cleanTitle,
            artist: canonicalArtist,
            album: cleanCanonicalSongTitle(candidate.album || jioMatch?.album || `${canonicalArtist} Essentials`),
            image: candidate.image || jioMatch?.image || '',
            duration: candidate.duration || jioMatch?.duration || 0,
            audioUrl: candidate.audioUrl || jioMatch?.url || '',
            fallbackUrls: candidate.fallbackUrls || jioMatch?.fallbackUrls,
            source: 'JioSaavn',
            bitrate: 320,
            codec: 'AAC',
            mimeType: 'audio/mp4',
            format: 'MP4 (320kbps)',
          });
        };

        // 1. Deezer Official Top Tracks (sorted by Deezer popularity rank)
        const dzTopTracks: any[] = dzTopSettled.status === 'fulfilled' && Array.isArray(dzTopSettled.value?.data) ? dzTopSettled.value.data : [];
        dzTopTracks.sort((a, b) => (Number(b?.rank) || 0) - (Number(a?.rank) || 0));
        for (const t of dzTopTracks) {
          const tArtist = String(t?.artist?.name || '').trim();
          const contribs: any[] = Array.isArray(t?.contributors) ? t.contributors : [];
          const isTargetArtist =
            stripAccents(tArtist).includes(canonicalFirstToken) ||
            contribs.some(c => stripAccents(String(c?.name || '')).includes(canonicalFirstToken));
          if (!isTargetArtist) continue;
          pushTrack({
            id: `dz-track-${t.id}`,
            title: String(t?.title_short || t?.title || '').trim(),
            artist: canonicalArtist,
            album: String(t?.album?.title || `${canonicalArtist} Essentials`).trim(),
            image: String(t?.album?.cover_xl || t?.album?.cover_big || t?.album?.cover_medium || '').trim(),
            duration: Number(t?.duration) || 0,
          });
        }

        // 2. Apple Music / iTunes Top 200 Songs (sorted by iTunes popularity order)
        const itunesTracks: any[] = [
          ...(itunesLookupSettled.status === 'fulfilled' && Array.isArray(itunesLookupSettled.value?.results) ? itunesLookupSettled.value.results : []),
          ...(itunesSearchSettled.status === 'fulfilled' && Array.isArray(itunesSearchSettled.value?.results) ? itunesSearchSettled.value.results : []),
        ];
        for (const t of itunesTracks) {
          if (t?.wrapperType !== 'track' && t?.kind !== 'song') continue;
          const tArtist = String(t?.artistName || '').trim();
          if (!stripAccents(tArtist).includes(canonicalFirstToken)) continue;
          pushTrack({
            id: `itunes-track-${t.trackId}`,
            title: String(t?.trackName || '').trim(),
            artist: canonicalArtist,
            album: String(t?.collectionName || `${canonicalArtist} Essentials`).trim(),
            image: String(t?.artworkUrl100 || '').replace('100x100bb', '600x600bb').trim(),
            duration: Math.round((Number(t?.trackTimeMillis) || 0) / 1000),
          });
          if (mergedTracks.length >= 100) break;
        }

        // 3. Supplement with JioSaavn 320kbps tracks sorted by playCount if under 100
        if (mergedTracks.length < 100) {
          const sortedJio = Array.from(jioStreamByTitle.values()).sort((a, b) => b.playCount - a.playCount);
          for (const j of sortedJio) {
            pushTrack({
              id: `api-${j.id}`,
              title: j.title,
              artist: canonicalArtist,
              album: j.album || `${canonicalArtist} Essentials`,
              image: j.image,
              duration: j.duration,
              audioUrl: j.url,
              fallbackUrls: j.fallbackUrls,
              source: 'JioSaavn',
            });
            if (mergedTracks.length >= 100) break;
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ artist: canonicalArtist, items: mergedTracks.slice(0, 100) }));
      } catch {
        res.statusCode = 200;
        res.end(JSON.stringify({ artist: artistQuery, items: [] }));
      }
      return;
    }

    next();
  };

  return {
    name: 'void-local-gateway',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function resolvePort(
  raw: string | undefined,
): { port: number; explicit: boolean } {
  const trimmed = raw?.trim() ?? '';
  const parsed = trimmed ? Number.parseInt(trimmed, 10) : Number.NaN;
  const valid =
    Number.isInteger(parsed) && parsed > 0 && parsed <= 65535;

  return valid
    ? { port: parsed, explicit: true }
    : { port: 3010, explicit: false };
}

function resolveBase(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';

  if (!trimmed) return '/';

  if (/^[a-z][a-z0-9+.-]*:\/\/?/i.test(trimmed)) {
    return trimmed;
  }

  const withLeadingSlash = trimmed.startsWith('/')
    ? trimmed
    : `/${trimmed}`;

  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

const { port, explicit } = resolvePort(process.env.PORT);
const base = resolveBase(process.env.BASE_PATH);

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  void runtimeErrorOverlay;
  const plugins: PluginOption[] = [
    voidLocalGatewayPlugin(),
    react(),
    tailwindcssVite(),
  ];

  if (command === 'serve' && process.env.REPL_ID !== undefined) {
    try {
      const { cartographer } = await import(
        '@replit/vite-plugin-cartographer'
      );
      const { devBanner } = await import(
        '@replit/vite-plugin-dev-banner'
      );

      plugins.push(
        cartographer({ root: projectRoot }),
        devBanner(),
      );
    } catch (error) {
      console.warn(
        '[vite] Replit dev plugins unavailable, continuing without them:',
        error,
      );
    }
  }

  return {
    root: projectRoot,
    base,

    plugins,

    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
        '@assets': path.resolve(projectRoot, 'attached_assets'),
      },
      dedupe: ['react', 'react-dom'],
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },

    server: {
      port,
      strictPort: explicit,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      fs: {
        strict: true,
      },
    },

    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
